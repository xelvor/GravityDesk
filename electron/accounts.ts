import fs from 'fs';
import path from 'path';
import os from 'os';
import { Entry } from '@napi-rs/keyring';
import { refreshGoogleToken, getGoogleUserInfo, fetchGoogleQuota } from './googleApi';

export interface CloudAccount {
  id: string;
  name: string;
  tokenPayload: string; // The raw JSON payload to push to keyring
  requests_today: number;
  last_used: string;
  status: 'active' | 'rate_limited';
  rate_limited_until?: string;
  quota?: {
    models: Record<string, {
      percentage: number;
      resetTime: string;
      display_name?: string;
      supports_images?: boolean;
      supports_thinking?: boolean;
      thinking_budget?: number;
      recommended?: boolean;
      max_tokens?: number;
      max_output_tokens?: number;
    }>;
    subscription_tier?: string;
    ai_credits?: { credits: number; expiryDate: string };
  };
  last_updated_quota?: string;
}

const configDir = path.join(os.homedir(), '.gemini', 'antigravity-cli');
const accountsFile = path.join(configDir, 'gravitydesk-accounts.json');

// To know which account is currently active, we keep track of the active ID
const activeIdFile = path.join(configDir, 'gravitydesk-active-id.txt');

function buildKeyringPayload(rawPayload: string): string {
  try {
    const data = JSON.parse(rawPayload);
    // If the user pasted the direct token from accounts.json:
    if (data.token && data.token.access_token) {
      return JSON.stringify({
        token: {
          access_token: data.token.access_token,
          token_type: 'Bearer',
          refresh_token: data.token.refresh_token,
          expiry: data.token.expiry_date ? new Date(data.token.expiry_date).toISOString() : new Date(Date.now() + 3600*1000).toISOString()
        },
        auth_method: 'consumer'
      });
    }
    // Otherwise assume it's already the keyring payload format
    return rawPayload;
  } catch(e) {
    return rawPayload;
  }
}

export class AccountsManager {
  private accounts: CloudAccount[] = [];

  constructor() {
    this.load();
    this.autoImportCurrentAccount().catch(e => {
      console.error('[AccountsManager] autoImportCurrentAccount error:', e);
    });

    // Self-healing check: copy CredWriter.exe from workspace to configDir
    try {
      const workspaceWriter = path.join(__dirname, '..', 'CredWriter.exe');
      const targetWriter = path.join(configDir, 'CredWriter.exe');
      if (fs.existsSync(workspaceWriter)) {
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.copyFileSync(workspaceWriter, targetWriter);
      }
    } catch (e) {
      console.error('[AccountsManager] Failed to copy CredWriter.exe:', e);
    }

    // Periodically update quotas for all accounts every 5 minutes
    setInterval(() => {
      this.updateAllQuotas();
    }, 5 * 60 * 1000);

    // Initial update after startup
    setTimeout(() => {
      this.updateAllQuotas();
    }, 5000);
  }

  private load() {
    try {
      if (fs.existsSync(accountsFile)) {
        this.accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf-8'));
      }
    } catch (e) {
      console.error('[AccountsManager] Error loading accounts', e);
      this.accounts = [];
    }
  }

  private save() {
    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(accountsFile, JSON.stringify(this.accounts, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AccountsManager] Error saving accounts', e);
    }
  }

  public getAccounts() {
    const today = new Date().toISOString().split('T')[0];
    let changed = false;
    for (const acc of this.accounts) {
      if (acc.last_used && acc.last_used.split('T')[0] !== today) {
        acc.requests_today = 0;
        if (acc.status === 'rate_limited') {
          if (!acc.rate_limited_until || new Date() > new Date(acc.rate_limited_until)) {
            acc.status = 'active';
            acc.rate_limited_until = undefined;
          }
        }
        changed = true;
      }
    }
    if (changed) this.save();

    const activeId = this.getActiveId();
    return this.accounts.map(acc => ({
      ...acc,
      isCurrent: acc.id === activeId
    }));
  }

  public async autoImportCurrentAccount() {
    let tokenPayloadStr = '';

    // 1. Try reading credentials.json
    const credsFile = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'credentials.json');
    if (fs.existsSync(credsFile)) {
      try {
        tokenPayloadStr = fs.readFileSync(credsFile, 'utf-8');
      } catch (e) {}
    }

    // 2. Try native keyring
    if (!tokenPayloadStr) {
      try {
        const targets = [
          { target: 'LegacyGeneric:target=gemini:antigravity', service: 'gemini', user: 'antigravity' },
          { target: 'gemini:antigravity', service: 'gemini', user: 'antigravity' }
        ];
        for (const t of targets) {
          try {
            const entry = Entry.withTarget(t.target, t.service, t.user);
            if (entry) {
              const secret = (entry.getSecret() as any).toString();
              if (secret) {
                tokenPayloadStr = secret;
                break;
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (!tokenPayloadStr) {
      console.log('[AccountsManager] No current account token found to import.');
      return;
    }

    try {
      const parsed = JSON.parse(tokenPayloadStr);
      let accessToken = '';
      let refreshToken = '';
      if (parsed.token) {
        accessToken = parsed.token.access_token;
        refreshToken = parsed.token.refresh_token;
      } else {
        accessToken = parsed.access_token;
        refreshToken = parsed.refresh_token;
      }

      if (!accessToken) return;

      let email = 'Imported Account';
      try {
        const userInfo = await getGoogleUserInfo(accessToken);
        email = userInfo.email;
      } catch (e) {
        // Try to refresh token
        if (refreshToken) {
          try {
            const refreshed = await refreshGoogleToken(refreshToken);
            accessToken = refreshed.access_token;
            if (refreshed.refresh_token) refreshToken = refreshed.refresh_token;
            tokenPayloadStr = JSON.stringify({
              token: {
                access_token: accessToken,
                token_type: 'Bearer',
                refresh_token: refreshToken,
                expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
              },
              auth_method: 'consumer'
            });
            const userInfo = await getGoogleUserInfo(accessToken);
            email = userInfo.email;
          } catch (refErr) {
            console.error('[AccountsManager] Failed to refresh token during auto-import:', refErr);
            return;
          }
        } else {
          return;
        }
      }

      // Check if account already exists
      let acc = this.accounts.find(a => a.name === email);
      if (acc) {
        acc.tokenPayload = tokenPayloadStr;
      } else {
        acc = {
          id: 'acc_' + Date.now(),
          name: email,
          tokenPayload: tokenPayloadStr,
          requests_today: 0,
          last_used: new Date().toISOString(),
          status: 'active'
        };
        this.accounts.push(acc);
        console.log(`[AccountsManager] Automatically imported active account: ${email}`);
      }
      this.save();

      // Set active if none is active
      if (!this.getActiveId()) {
        this.forceSwitchTo(acc.id);
      }

      // Fetch its quota
      await this.updateQuotaForAccount(acc.id);
    } catch (e) {
      console.error('[AccountsManager] Error parsing / importing active account:', e);
    }
  }

  public async updateQuotaForAccount(accountId: string) {
    const acc = this.accounts.find(a => a.id === accountId);
    if (!acc) return;

    try {
      const parsed = JSON.parse(acc.tokenPayload);
      let accessToken = '';
      let refreshToken = '';
      if (parsed.token) {
        accessToken = parsed.token.access_token;
        refreshToken = parsed.token.refresh_token;
      } else {
        accessToken = parsed.access_token;
        refreshToken = parsed.refresh_token;
      }

      let quotaData;
      try {
        quotaData = await fetchGoogleQuota(accessToken);
      } catch (e) {
        if (refreshToken) {
          try {
            const refreshed = await refreshGoogleToken(refreshToken);
            accessToken = refreshed.access_token;
            if (refreshed.refresh_token) refreshToken = refreshed.refresh_token;
            acc.tokenPayload = JSON.stringify({
              token: {
                access_token: accessToken,
                token_type: 'Bearer',
                refresh_token: refreshToken,
                expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
              },
              auth_method: 'consumer'
            });
            quotaData = await fetchGoogleQuota(accessToken);
          } catch (refErr) {
            console.error(`[AccountsManager] Failed to refresh token for quota update of ${acc.name}:`, refErr);
            return;
          }
        } else {
          throw e;
        }
      }

      if (quotaData) {
        acc.quota = quotaData;
        acc.last_updated_quota = new Date().toISOString();
        this.save();
      }
    } catch (e) {
      console.error(`[AccountsManager] Error updating quota for ${acc.name}:`, e);
    }
  }

  public async updateAllQuotas() {
    console.log('[AccountsManager] Updating quotas for all accounts...');
    for (const acc of this.accounts) {
      await this.updateQuotaForAccount(acc.id);
    }
  }

  public async addAccount(name: string, payload: string) {
    const newAcc: CloudAccount = {
      id: 'acc_' + Date.now(),
      name,
      tokenPayload: payload,
      requests_today: 0,
      last_used: new Date().toISOString(),
      status: 'active'
    };
    this.accounts.push(newAcc);
    this.save();

    await this.updateQuotaForAccount(newAcc.id);

    // Auto-switch to the new account if it's the first one
    if (this.accounts.length === 1) {
      this.forceSwitchTo(newAcc.id);
    }
    return newAcc;
  }

  public deleteAccount(id: string) {
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.save();
  }

  private getActiveId(): string | null {
    try {
      if (fs.existsSync(activeIdFile)) {
        return fs.readFileSync(activeIdFile, 'utf-8').trim();
      }
    } catch (e) {}
    return null;
  }

  private setActiveId(id: string) {
    try {
      fs.writeFileSync(activeIdFile, id, 'utf-8');
    } catch (e) {}
  }

  private async applyAccountToKeyring(acc: CloudAccount) {
    let payload = acc.tokenPayload;
    
    // Check if token is expired or expiring in less than 5 minutes, and refresh it first!
    try {
      const parsed = JSON.parse(payload);
      let accessToken = '';
      let refreshToken = '';
      let expiryTime = 0;
      
      if (parsed.token) {
        accessToken = parsed.token.access_token;
        refreshToken = parsed.token.refresh_token;
        expiryTime = parsed.token.expiry ? new Date(parsed.token.expiry).getTime() : 0;
      } else {
        accessToken = parsed.access_token;
        refreshToken = parsed.refresh_token;
        expiryTime = parsed.expiry_date ? new Date(parsed.expiry_date).getTime() : 0;
      }

      if (Date.now() > expiryTime - 5 * 60 * 1000) {
        if (refreshToken) {
          console.log(`[AccountsManager] Token for ${acc.name} is expired/expiring. Refreshing before writing...`);
          try {
            const refreshed = await refreshGoogleToken(refreshToken);
            accessToken = refreshed.access_token;
            if (refreshed.refresh_token) refreshToken = refreshed.refresh_token;
            
            const updatedPayload = {
              token: {
                access_token: accessToken,
                token_type: 'Bearer',
                refresh_token: refreshToken,
                expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
              },
              auth_method: 'consumer'
            };
            payload = JSON.stringify(updatedPayload);
            acc.tokenPayload = payload;
            this.save();
            console.log(`[AccountsManager] Successfully refreshed token for ${acc.name} before keyring write`);
          } catch (refErr) {
            console.error(`[AccountsManager] Failed to refresh token before writing for ${acc.name}:`, refErr);
          }
        }
      }
    } catch (e) {
      console.error('[AccountsManager] Error parsing token for refresh-check:', e);
    }

    const formattedPayload = buildKeyringPayload(payload);
    const credsFile = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'credentials.json');
    
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        
        // Find CredWriter.exe
        const pathsToTry = [
          path.join(configDir, 'CredWriter.exe'),
          path.join(__dirname, '..', 'CredWriter.exe'),
          path.join(__dirname, 'CredWriter.exe'),
          path.join(process.resourcesPath || '', 'CredWriter.exe'),
          'CredWriter.exe'
        ];
        
        let writerPath = '';
        for (const p of pathsToTry) {
          if (fs.existsSync(p)) {
            writerPath = p;
            break;
          }
        }
        
        if (writerPath) {
          try {
            // Delete old ones first
            try { execSync('cmdkey /delete:"LegacyGeneric:target=gemini:antigravity" 2>nul'); } catch(e){}
            try { execSync('cmdkey /delete:"gemini:antigravity" 2>nul'); } catch(e){}
            
            // Write using native C# CredWriter to preserve raw UTF-8 and UserName
            execSync(`"${writerPath}" "LegacyGeneric:target=gemini:antigravity" "antigravity" "${formattedPayload.replace(/"/g, '\\"')}"`);
            execSync(`"${writerPath}" "gemini:antigravity" "antigravity" "${formattedPayload.replace(/"/g, '\\"')}"`);
            console.log('[AccountsManager] Successfully wrote credentials to Windows Keyring using CredWriter.exe');
          } catch (err: any) {
            console.error('[AccountsManager] Error executing CredWriter.exe:', err.message);
          }
        } else {
          console.warn('[AccountsManager] CredWriter.exe not found! Falling back to napi-rs/keyring.');
          const entry = Entry.withTarget('gemini:antigravity', 'gemini', 'antigravity');
          try { entry.deleteCredential(); } catch (e) {}
          entry.setSecret(Buffer.from(formattedPayload, 'utf-8'));
        }
      } else {
        // macOS/Linux
        const entry = Entry.withTarget('gemini:antigravity', 'gemini', 'antigravity');
        try { entry.deleteCredential(); } catch (e) {}
        entry.setSecret(Buffer.from(formattedPayload, 'utf-8'));
      }
      
      // 2. Also write to credentials.json as a backup
      fs.mkdirSync(path.dirname(credsFile), { recursive: true });
      fs.writeFileSync(credsFile, formattedPayload, 'utf-8');
      
    } catch (e) {
      console.error('Failed to write credential:', e);
    }
    
    this.setActiveId(acc.id);
  }

  public trackUsage() {
    const activeId = this.getActiveId();
    if (!activeId) return;
    const activeAcc = this.accounts.find(a => a.id === activeId);
    if (activeAcc) {
      activeAcc.requests_today = (activeAcc.requests_today || 0) + 1;
      activeAcc.last_used = new Date().toISOString();
      this.save();
    }
  }

  public async markCurrentRateLimitedAndSwitch(): Promise<boolean> {
    const activeId = this.getActiveId();
    let activeAcc = null;
    if (activeId) {
      activeAcc = this.accounts.find(a => a.id === activeId);
      if (activeAcc) {
        activeAcc.status = 'rate_limited';
        activeAcc.rate_limited_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const nextAcc = this.accounts.find(a => a.status === 'active' && a.id !== activeId);
    if (nextAcc) {
      await this.applyAccountToKeyring(nextAcc);
      await this.updateQuotaForAccount(nextAcc.id);
      console.log(`[AccountsManager] Switched from ${activeAcc?.name || 'Unknown'} to ${nextAcc.name}`);
      this.save();
      return true;
    } else {
      console.warn(`[AccountsManager] No more active accounts to switch to!`);
      this.save();
      return false;
    }
  }

  public async markCurrentUnverifiedAndSwitch(verificationUrl?: string): Promise<boolean> {
    const activeId = this.getActiveId();
    let activeAcc = null;
    if (activeId) {
      activeAcc = this.accounts.find(a => a.id === activeId);
      if (activeAcc) {
        activeAcc.status = 'unverified' as any;
        (activeAcc as any).verification_url = verificationUrl;
      }
    }

    const nextAcc = this.accounts.find(a => a.status === 'active' && a.id !== activeId);
    if (nextAcc) {
      await this.applyAccountToKeyring(nextAcc);
      await this.updateQuotaForAccount(nextAcc.id);
      console.log(`[AccountsManager] Switched from unverified ${activeAcc?.name || 'Unknown'} to ${nextAcc.name}`);
      this.save();
      return true;
    } else {
      console.warn(`[AccountsManager] No more active accounts to switch to!`);
      this.save();
      return false;
    }
  }

  public async forceSwitchTo(accountId: string): Promise<boolean> {
    const nextAcc = this.accounts.find(a => a.id === accountId);
    if (nextAcc) {
      await this.applyAccountToKeyring(nextAcc);
      nextAcc.status = 'active';
      nextAcc.rate_limited_until = undefined;
      await this.updateQuotaForAccount(nextAcc.id);
      this.save();
      return true;
    }
    return false;
  }
}

export const accountsManager = new AccountsManager();
