import http from 'http';
import { shell } from 'electron';
import { AccountsManager } from './accounts';

const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://127.0.0.1:8888/oauth-callback';

let authServer: http.Server | null = null;

export async function startOAuthFlow(accountsManager: AccountsManager): Promise<any> {
  return new Promise((resolve, reject) => {
    if (authServer) {
      authServer.close();
      authServer = null;
    }

    authServer = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1:8888');
        if (url.pathname === '/oauth-callback') {
          const code = url.searchParams.get('code');
          if (!code) {
            res.writeHead(400);
            res.end('Brak kodu autoryzacji');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1>Zalogowano pomyślnie!</h1><p>Możesz zamknąć to okno i wrócić do aplikacji.</p>
            <script>setTimeout(() => window.close(), 3000);</script></body></html>`);

          if (authServer) {
            authServer.close();
            authServer = null;
          }

          // Exchange code for token
          const params = new URLSearchParams();
          params.append('client_id', CLIENT_ID);
          params.append('client_secret', CLIENT_SECRET);
          params.append('code', code);
          params.append('redirect_uri', REDIRECT_URI);
          params.append('grant_type', 'authorization_code');

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });

          if (!tokenRes.ok) {
            const err = await tokenRes.text();
            throw new Error('Token exchange failed: ' + err);
          }

          const tokenData = await tokenRes.json();
          
          // Fetch user info to get email
          const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
          });
          
          let email = 'Nowe Konto';
          if (userRes.ok) {
            const userData = await userRes.json();
            if (userData.email) email = userData.email;
          }

          const payload = JSON.stringify({
            name: email,
            token: {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expiry_date: Date.now() + (tokenData.expires_in * 1000)
            }
          });

          const newAcc = accountsManager.addAccount(email, payload);
          resolve({ success: true, account: newAcc });
        }
      } catch (e: any) {
        reject(new Error(e.message));
      }
    });

    authServer.listen(8888, '127.0.0.1', () => {
      const scopes = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/cclog',
        'https://www.googleapis.com/auth/experimentsandconfigs',
        'https://www.googleapis.com/auth/aicode'
      ].join(' ');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
      shell.openExternal(authUrl);
    });
  });
}
