import { execSync } from 'child_process';
import { WebContents } from 'electron';
import { db } from './db';
import { accountsManager } from './accounts';
import * as pty from 'node-pty';

interface GlobalProcess {
  ptyProcess: pty.IPty;
  currentSessionId: string;
  cwd: string;
  command: string;
  buffer: string;
  saveTimer: NodeJS.Timeout | null;
  assistantMessageIds: Map<string, string>;
  isReady: boolean;
  readyQueue: Array<() => void>;
  isSwitchingModel?: boolean;
  switchingBuffer?: string;
  targetModel?: string;
  lastUserPrompt?: string;
}

export class PtyManager {
  private globalProc: GlobalProcess | null = null;
  private webContents: WebContents | null = null;
  private sessionModels = new Map<string, string>();

  public setWebContents(wc: WebContents): void {
    this.webContents = wc;
  }

  public checkCommand(): { found: boolean; command: string; path: string; error?: string } {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? 'where.exe' : 'which';
    const candidates = ['agy', 'antigravity'];

    for (const cmd of candidates) {
      try {
        const output = execSync(`${checkCmd} ${cmd}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        const lines = output.trim().split(/\r?\n/);
        if (lines.length > 0 && lines[0].trim()) {
          return { found: true, command: cmd, path: lines[0].trim() };
        }
      } catch {
        continue;
      }
    }

    return {
      found: false,
      command: '',
      path: '',
      error: 'Nie znaleziono komendy "agy" ani "antigravity" w systemowym PATH. Zainstaluj Antigravity CLI lub dodaj ścieżkę do zmiennych środowiskowych.',
    };
  }

  private resolveSlashCommand(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('/commit')) {
      return 'Analyze current git diff and generate a concise conventional commit message.';
    }
    if (trimmed.startsWith('/review')) {
      return 'Review the current project changes. Focus on bugs, security, maintainability, and code quality.';
    }
    if (trimmed.startsWith('/fix')) {
      const problem = trimmed.replace(/^\/fix\s*/, '').trim() || 'the current failing issue';
      return `Fix this issue in the current project: ${problem}`;
    }
    if (trimmed.startsWith('/explain')) {
      const file = trimmed.replace(/^\/explain\s*/, '').trim() || 'the current codebase architecture';
      return `Explain this file in detail: ${file}`;
    }
    if (trimmed.startsWith('/tests')) {
      return 'Run or suggest the appropriate tests for this project and summarize results.';
    }
    if (trimmed.startsWith('/status')) {
      return 'Check current project status, git status, and summarize what is going on.';
    }
    return text;
  }

  public async startSession(sessionId: string, cwd?: string): Promise<{ success: boolean; pid?: number; command?: string; error?: string }> {
    const targetCwd = cwd || process.cwd();
    const sessionRecord = db.getSession(sessionId);
    let agyId = sessionRecord?.antigravity_id;
    if (this.globalProc && this.globalProc.ptyProcess) {
      if (this.globalProc.currentSessionId === sessionId) {
        this.emitStatus(sessionId, 'running', this.globalProc.ptyProcess.pid);
        return { success: true, pid: this.globalProc.ptyProcess.pid, command: this.globalProc.command };
      } else {
        console.log(`[PtyManager] Switching session from ${this.globalProc.currentSessionId} to ${sessionId} (restarting CLI)`);
        this.flushOutputToDb(this.globalProc.currentSessionId);
        this.stopAll();
      }
    }

    const cli = this.checkCommand();
    if (!cli.found) {
      this.emitStatus(sessionId, 'error', undefined, cli.error);
      return { success: false, error: cli.error };
    }

    let pty: any;
    try {
      pty = require('node-pty');
    } catch (e) {
      const err = 'Nie udało się załadować node-pty. Upewnij się, że natywny moduł jest zbudowany poprawnie.';
      console.error(err, e);
      this.emitStatus(sessionId, 'error', undefined, err);
      return { success: false, error: err };
    }


    if (!agyId) {
      agyId = require('crypto').randomUUID();
      try {
        db.updateSession(sessionId, { antigravity_id: agyId });
      } catch (e) {
        console.warn('Could not update legacy session antigravity_id', e);
      }
    }
    
    try {
      const isWin = process.platform === 'win32';
      const spawnCmd = isWin ? 'cmd.exe' : (cli.path || cli.command);
      const modelOverride = this.sessionModels.get(sessionId);
      const modelArg = modelOverride ? ` --model "${modelOverride}"` : '';
      const spawnArgs = isWin ? ['/k', `${cli.command} --dangerously-skip-permissions --conversation ${agyId}${modelArg}`] : (agyId ? ['--dangerously-skip-permissions', '--conversation', agyId, ...(modelOverride ? ['--model', modelOverride] : [])] : []);

      const ptyProcess = pty.spawn(spawnCmd, spawnArgs, {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: targetCwd,
        env: { ...process.env, TERM: 'xterm-256color' } as any,
      });

      this.globalProc = {
        ptyProcess,
        currentSessionId: sessionId,
        cwd: targetCwd,
        command: cli.command,
        buffer: '',
        saveTimer: null,
        assistantMessageIds: new Map(),
        isReady: false,
        readyQueue: [],
      };

      db.updateSession(sessionId, { cli_command: cli.command, cwd: targetCwd });

      ptyProcess.onData(async (data: string) => {
        if (!this.globalProc || this.globalProc.ptyProcess !== ptyProcess) return;
        
        if (!this.globalProc.isReady && (data.includes('? for shortcuts') || data.includes('esc to cancel'))) {
          this.globalProc.isReady = true;
          this.globalProc.readyQueue.forEach(cb => cb());
          this.globalProc.readyQueue = [];
        }

        if (this.globalProc.isSwitchingModel) {
          this.globalProc.switchingBuffer = (this.globalProc.switchingBuffer || '') + data;
          if (this.globalProc.switchingBuffer.includes('Keyboard:')) {
            this.globalProc.isSwitchingModel = false;
            
            const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const cleanBuffer = stripAnsi(this.globalProc.switchingBuffer);
            const lines = cleanBuffer.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            let currentIndex = -1;
            let targetIndex = -1;
            
            const modelLines = [];
            let inMenu = false;
            for (const line of lines) {
              if (line.includes('Switch Model')) { inMenu = true; continue; }
              if (line.includes('Keyboard:')) { inMenu = false; break; }
              if (inMenu) modelLines.push(line);
            }
            
            for (let i = 0; i < modelLines.length; i++) {
              if (modelLines[i].startsWith('>')) currentIndex = i;
              if (modelLines[i].includes(this.globalProc.targetModel!)) targetIndex = i;
            }
            
            if (currentIndex !== -1 && targetIndex !== -1) {
              const diff = targetIndex - currentIndex;
              let seq = '';
              if (diff > 0) {
                for(let i=0; i<diff; i++) seq += '\x1B[B';
              } else if (diff < 0) {
                for(let i=0; i<-diff; i++) seq += '\x1B[A';
              }
              seq += '\r';
              ptyProcess.write(seq);
            } else {
              ptyProcess.write('\x1B'); // ESC to abort
            }
            this.globalProc.switchingBuffer = '';
            this.globalProc.targetModel = undefined;
          }
        }

        const activeId = this.globalProc.currentSessionId;

        // Auto-switch account on quota exceeded
        const lowerData = data.toLowerCase();
        if (lowerData.includes('429 too many requests') || lowerData.includes('quota exceeded') || lowerData.includes('resource has been exhausted')) {
          console.log('[PtyManager] Rate limit hit. Attempting to switch account...');
          if (await accountsManager.markCurrentRateLimitedAndSwitch()) {
            console.log('[PtyManager] Switched account successfully. Restarting CLI...');
            const lastPrompt = this.globalProc.lastUserPrompt;
            this.globalProc.ptyProcess.kill();
            this.globalProc = null;
            
            if (this.webContents) {
              this.webContents.send('agy:output', { sessionId: activeId, data: '\r\n\x1b[33m[GravityDesk] Limit zapapytań osiągnięty. Automatyczne przełączanie na kolejne konto i ponawianie...\x1b[0m\r\n' });
            }
            
            setTimeout(async () => {
              await this.startSession(activeId, targetCwd);
              if (lastPrompt) {
                this.send(activeId, lastPrompt);
              }
            }, 1000);
            return;
          }
        }

        // Auto-switch account on eligibility check failure (requires verification)
        if (lowerData.includes('eligibility check failed') || lowerData.includes('verify your account')) {
          console.log('[PtyManager] Eligibility check failed for active account. Switching...');
          
          // Capture verification URL
          const urlMatch = data.match(/(https:\/\/accounts\.google\.com\/[^\s]+)/);
          const verificationUrl = urlMatch ? urlMatch[0].trim() : undefined;
          
          if (this.webContents) {
            this.webContents.send('agy:output', { 
              sessionId: activeId, 
              data: '\r\n\x1b[31m[GravityDesk] Błąd uprawnień konta (Eligibility check failed). Wymagana weryfikacja w przeglądarce.\x1b[0m\r\n' 
            });
          }
          
          await accountsManager.markCurrentUnverifiedAndSwitch(verificationUrl);
          
          // Kill and restart with next account
          const lastPrompt = this.globalProc.lastUserPrompt;
          this.globalProc.ptyProcess.kill();
          this.globalProc = null;
          
          setTimeout(async () => {
            await this.startSession(activeId, targetCwd);
            if (lastPrompt) {
              this.send(activeId, lastPrompt);
            }
          }, 1000);
          return;
        }

        if (this.webContents) {
          this.webContents.send('agy:output', { sessionId: activeId, data });
        }
        this.appendOutputToDb(activeId, data);
      });

      ptyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        if (!this.globalProc || this.globalProc.ptyProcess !== ptyProcess) return;
        const activeId = this.globalProc.currentSessionId;
        console.log(`[PtyManager] Global CLI process exited with code ${exitCode}, signal ${signal}`);
        this.flushOutputToDb(activeId);
        this.globalProc = null;
        this.emitStatus(activeId, 'stopped', undefined, exitCode !== 0 ? `Zakończono z kodem błędu ${exitCode}` : undefined);
      });

      this.emitStatus(sessionId, 'running', ptyProcess.pid);
      return { success: true, pid: ptyProcess.pid, command: cli.command };
    } catch (error: any) {
      console.error(`[PtyManager] Spawn error:`, error);
      const errStr = error.message || String(error);
      this.emitStatus(sessionId, 'error', undefined, errStr);
      return { success: false, error: errStr };
    }
  }

  public async send(sessionId: string, text: string): Promise<{ success: boolean; error?: string; expandedText?: string }> {
    if (!this.globalProc || !this.globalProc.ptyProcess) {
      return { success: false, error: 'Silnik CLI nie jest aktywny. Kliknij "Uruchom" lub rozpocznij nową sesję.' };
    }

    if (this.globalProc.currentSessionId !== sessionId) {
      await this.startSession(sessionId);
    }

    if (text.trim().startsWith('/model ')) {
      const modelName = text.substring('/model '.length).trim();
      console.log(`[PtyManager] Intercepted /model command. Performing intelligent TUI navigation to select: ${modelName}`);
      this.globalProc.isSwitchingModel = true;
      this.globalProc.switchingBuffer = '';
      this.globalProc.targetModel = modelName;
      
      this.globalProc.ptyProcess.write('/model\r');
      return { success: true, expandedText: text };
    }

    if (!this.globalProc!.isReady) {
      console.log(`[PtyManager] Waiting for CLI to be ready before sending...`);
      await new Promise<void>(resolve => {
        if (!this.globalProc) return resolve();
        
        let resolved = false;
        const cb = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };
        this.globalProc.readyQueue.push(cb);
        
        setTimeout(cb, 4000);
      });
    }

    const expandedText = this.resolveSlashCommand(text);
    console.log(`[PtyManager] Sending to global process (session ${sessionId}): "${text}" -> "${expandedText}"`);

    this.globalProc.lastUserPrompt = expandedText;
    accountsManager.trackUsage();

    try {
      this.globalProc!.ptyProcess.write(expandedText + '\r');
      return { success: true, expandedText };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }

  public stopSession(sessionId: string): { success: boolean } {
    if (this.globalProc && this.globalProc.currentSessionId === sessionId) {
      console.log(`[PtyManager] Detaching session ${sessionId} from global process (process remains alive)`);
      this.flushOutputToDb(sessionId);
      this.emitStatus(sessionId, 'stopped');
      return { success: true };
    }
    return { success: false };
  }

  public stopAll(): void {
    if (this.globalProc && this.globalProc.ptyProcess) {
      this.flushOutputToDb(this.globalProc.currentSessionId);
      try {
        this.globalProc.ptyProcess.kill();
      } catch (e) {}
      this.globalProc = null;
    }
  }

  public restartActiveSession(): void {
    if (this.globalProc) {
      const activeSessionId = this.globalProc.currentSessionId;
      const activeCwd = this.globalProc.cwd;
      console.log(`[PtyManager] Account switched. Restarting active session ${activeSessionId}...`);
      
      this.flushOutputToDb(activeSessionId);
      this.stopAll();
      
      setTimeout(async () => {
        await this.startSession(activeSessionId, activeCwd);
        if (this.webContents) {
          this.webContents.send('session:status', { sessionId: activeSessionId, status: 'running' });
        }
      }, 500);
    }
  }

  private appendOutputToDb(sessionId: string, chunk: string): void {
    if (!this.globalProc) return;
    this.globalProc.buffer += chunk;

    if (!this.globalProc.saveTimer) {
      this.globalProc.saveTimer = setTimeout(() => {
        this.flushOutputToDb(sessionId);
      }, 600);
    }
  }

  private flushOutputToDb(sessionId: string): void {
    if (!this.globalProc) return;
    if (this.globalProc.saveTimer) {
      clearTimeout(this.globalProc.saveTimer);
      this.globalProc.saveTimer = null;
    }

    if (!this.globalProc.buffer) return;

    const session = db.getSession(sessionId);
    if (!session) return;

    // For Antigravity CLI sessions, transcript.jsonl manages all chat messages! Do not dump raw PTY terminal UI redraws into SQLite messages table!
    if (session.antigravity_id) {
      this.globalProc.buffer = '';
      return;
    }

    const newContent = this.globalProc.buffer;
    this.globalProc.buffer = '';

    let assistantMessageId = this.globalProc.assistantMessageIds.get(sessionId) || null;
    if (!assistantMessageId) {
      const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      this.globalProc.assistantMessageIds.set(sessionId, msgId);
      db.addMessage({
        id: msgId,
        session_id: sessionId,
        role: 'assistant',
        content: newContent,
        raw_output: newContent,
        created_at: new Date().toISOString(),
      });
    } else {
      const msgs = db.listMessages(sessionId);
      const existing = msgs.find((m) => m.id === assistantMessageId);
      if (existing) {
        const updatedContent = existing.content + newContent;
        db.addMessage({
          id: existing.id,
          session_id: existing.session_id,
          role: existing.role,
          content: updatedContent,
          raw_output: updatedContent,
          created_at: existing.created_at,
        });
      } else {
        const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        this.globalProc.assistantMessageIds.set(sessionId, msgId);
        db.addMessage({
          id: msgId,
          session_id: sessionId,
          role: 'assistant',
          content: newContent,
          raw_output: newContent,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  public resetAssistantMessageTracking(sessionId: string): void {
    if (this.globalProc) {
      this.globalProc.assistantMessageIds.delete(sessionId);
    }
  }

  private emitStatus(sessionId: string, status: string, pid?: number, error?: string): void {
    if (this.webContents) {
      this.webContents.send('agy:status', { sessionId, status, pid, error });
    }
  }
}

export const ptyManager = new PtyManager();
