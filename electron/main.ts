import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { db, SessionRecord } from './db';
import { ptyManager } from './ptyManager';
import { accountsManager } from './accounts';
import { startOAuthFlow } from './oauth';

let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
  await db.init();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'GravityDesk - Antigravity CLI AI Dashboard',
    icon: fs.existsSync(path.join(__dirname, 'resources/icon.png'))
      ? path.join(__dirname, 'resources/icon.png')
      : path.join(__dirname, '../electron/resources/icon.png'),
    backgroundColor: '#07090e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  ptyManager.setWebContents(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.maximize();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    // DevTools disabled by user request
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Helper to safely read Antigravity CLI (/resume) rows using better-sqlite3 with WASM sql.js fallback
const readAntigravityResumeRows = async (dbPath: string, fs: any): Promise<any[]> => {
  try {
    const Database = require('better-sqlite3');
    const agyDb = new Database(dbPath, { readonly: true });
    const rows = agyDb.prepare(`
      SELECT conversation_id as id, preview as title, workspace_uris, step_count as stepCount, last_modified_time as updatedAt
      FROM conversation_summaries
      WHERE preview IS NOT NULL AND preview != ''
      ORDER BY last_modified_time DESC
      LIMIT 50
    `).all();
    agyDb.close();
    return rows;
  } catch (nativeErr) {
    console.log('[Main] better-sqlite3 native load failed for resume DB, falling back to WASM sql.js...');
    try {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      const buffer = fs.readFileSync(dbPath);
      const wasmDb = new SQL.Database(new Uint8Array(buffer));
      const res = wasmDb.exec(`
        SELECT conversation_id as id, preview as title, workspace_uris, step_count as stepCount, last_modified_time as updatedAt
        FROM conversation_summaries
        WHERE preview IS NOT NULL AND preview != ''
        ORDER BY last_modified_time DESC
        LIMIT 50
      `);
      let rows: any[] = [];
      if (res.length > 0) {
        const columns = res[0].columns;
        rows = res[0].values.map((val: any[]) => {
          const obj: any = {};
          columns.forEach((col: string, idx: number) => {
            obj[col] = val[idx];
          });
          return obj;
        });
      }
      wasmDb.close();
      return rows;
    } catch (wasmErr) {
      console.error('[Main] WASM sql.js fallback also failed:', wasmErr);
      return [];
    }
  }
};

// Helper to automatically sync Antigravity CLI (/resume) sessions into SQLite
const syncAntigravitySessionsToDb = async () => {
  try {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'conversation_summaries.db');
    if (!fs.existsSync(dbPath)) return;

    const rows = await readAntigravityResumeRows(dbPath, fs);
    const existingSessions = db.listSessions();
    const existingIds = new Set(existingSessions.map((s) => s.id));
    const existingAgyIds = new Set(existingSessions.map((s) => s.antigravity_id).filter(Boolean));

    for (const r of rows) {
      if (!existingIds.has(r.id) && !existingAgyIds.has(r.id)) {
        let cwd = '';
        try {
          if (r.workspace_uris) {
            const uris = JSON.parse(r.workspace_uris);
            if (Array.isArray(uris) && uris.length > 0) {
              cwd = uris[0].replace(/^file:\/\/\//, '');
              if (/^[a-zA-Z]:/.test(cwd)) {
                cwd = cwd.replace(/\\/g, '/');
              }
            }
          }
        } catch (e) {}

        const session: SessionRecord = {
          id: r.id,
          title: r.title || 'Antigravity Session',
          cwd: cwd || os.homedir(),
          cli_command: null,
          antigravity_id: r.id,
          created_at: r.updatedAt || new Date().toISOString(),
          updated_at: r.updatedAt || new Date().toISOString(),
        };
        db.createSession(session);
      }
    }
  } catch (err) {
    console.error('[Main] Failed to sync antigravity sessions:', err);
  }
};

// Helper to read clean conversation history from Antigravity CLI transcript.jsonl
const readAntigravityTranscript = (session: SessionRecord): any[] => {
  try {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
    let transcriptPath = path.join(brainDir, session.antigravity_id!, '.system_generated', 'logs', 'transcript.jsonl');

    if (!fs.existsSync(transcriptPath)) {
      try {
        const createdTime = new Date(session.created_at).getTime();
        const dirs = fs.readdirSync(brainDir).filter((d: string) => {
          const stat = fs.statSync(path.join(brainDir, d));
          return stat.isDirectory() && stat.birthtimeMs > createdTime - 2000;
        });
        if (dirs.length > 0) {
          const newest = dirs.map((d: string) => ({ name: d, time: fs.statSync(path.join(brainDir, d)).mtimeMs })).sort((a: any, b: any) => b.time - a.time)[0];
          // If the newest folder has a transcript, use it and update SQLite
          const newestPath = path.join(brainDir, newest.name, '.system_generated', 'logs', 'transcript.jsonl');
          if (fs.existsSync(newestPath)) {
            console.log(`[Main] Auto-discovered real antigravity_id: ${newest.name} (was ${session.antigravity_id})`);
            transcriptPath = newestPath;
            db.updateSession(session.id, { antigravity_id: newest.name });
            
            // Note: Since the DB gets updated, future readAntigravityTranscript calls will pass the correct newest.name
          } else {
            return [];
          }
        } else {
          return [];
        }
      } catch(e) {
        return [];
      }
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const messages: any[] = [];
    let lastStepTime = 0;

    for (const line of lines) {
      try {
        const step = JSON.parse(line);
        const currentStepTime = step.created_at ? new Date(step.created_at).getTime() : 0;
        
        if (step.type === 'USER_INPUT' && step.content) {
          let userText = step.content;
          if (typeof userText === 'string') {
            const match = userText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
            if (match) userText = match[1].trim();
          } else {
            userText = JSON.stringify(userText);
          }
          if (userText.trim()) {
            messages.push({
              id: `agy_u_${session.id}_${step.step_index !== undefined ? step.step_index : messages.length}`,
              session_id: session.id,
              role: 'user',
              content: userText,
              raw_output: userText,
              created_at: step.created_at || new Date().toISOString(),
            });
          }
        } else if (step.type === 'PLANNER_RESPONSE') {
          let thinkDurationStr = '';
          if (lastStepTime > 0 && currentStepTime > lastStepTime) {
            const diffSec = ((currentStepTime - lastStepTime) / 1000).toFixed(1);
            thinkDurationStr = `for ${diffSec}s`;
          }

          let assistantText = step.content || '';

          const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
          
          if (lastMsg && lastMsg.role === 'assistant') {
            if (assistantText && typeof assistantText === 'string' && assistantText.trim()) {
              lastMsg.content += (lastMsg.content ? '\n\n' : '') + assistantText;
              lastMsg.raw_output += (lastMsg.raw_output ? '\n\n' : '') + assistantText;
            }
            if (step.thinking) {
              lastMsg.thoughts = lastMsg.thoughts || [];
              lastMsg.thoughts.push({ text: step.thinking, duration: thinkDurationStr });
            }
            if (step.tool_calls && step.tool_calls.length > 0) {
              lastMsg.tool_calls = lastMsg.tool_calls || [];
              lastMsg.tool_calls.push(...step.tool_calls);
            }
          } else {
            messages.push({
              id: `agy_m_${session.id}_${step.step_index !== undefined ? step.step_index : messages.length}`,
              session_id: session.id,
              role: 'assistant',
              content: assistantText,
              raw_output: assistantText,
              created_at: step.created_at || new Date().toISOString(),
              thoughts: step.thinking ? [{ text: step.thinking, duration: thinkDurationStr }] : [],
              tool_calls: (step.tool_calls && step.tool_calls.length > 0) ? [...step.tool_calls] : []
            });
          }
        }
        
        if (currentStepTime > 0) {
          lastStepTime = currentStepTime;
        }
      } catch (e) {}
    }

    return messages;
  } catch (err) {
    console.error(`[Main] Failed to read transcript for ${session.antigravity_id}:`, err);
    return [];
  }
};

// Register IPC Handlers
const setupIpcHandlers = () => {
  ipcMain.handle('sessions:list', async () => {
    await syncAntigravitySessionsToDb();
    return db.listSessions();
  });

  ipcMain.handle('sessions:create', async (_event, { title, cwd, antigravity_id }: { title: string; cwd?: string; antigravity_id?: string }) => {
    const id = antigravity_id || require('crypto').randomUUID();
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id,
      title: title || 'Nowa Sesja Antigravity',
      cwd: cwd || process.cwd(),
      cli_command: null,
      antigravity_id: id,
      created_at: now,
      updated_at: now,
    };
    db.createSession(session);
    return session;
  });

  ipcMain.handle('agy:listResumeSessions', async () => {
    try {
      const os = require('os');
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'conversation_summaries.db');
      if (!fs.existsSync(dbPath)) return [];

      const rows = await readAntigravityResumeRows(dbPath, fs);
      return rows.map((r: any) => {
        let cwd = '';
        try {
          if (r.workspace_uris) {
            const uris = JSON.parse(r.workspace_uris);
            if (Array.isArray(uris) && uris.length > 0) {
              cwd = uris[0].replace(/^file:\/\/\//, '');
              if (/^[a-zA-Z]:/.test(cwd)) {
                cwd = cwd.replace(/\\/g, '/');
              }
            }
          }
        } catch (e) {}
        return {
          id: r.id,
          title: r.title || 'Antigravity Session',
          cwd: cwd || os.homedir(),
          stepCount: r.stepCount || 0,
          updatedAt: r.updatedAt || new Date().toISOString(),
        };
      });
    } catch (err) {
      console.error('[Main] Failed to list resume sessions:', err);
      return [];
    }
  });

  ipcMain.handle('sessions:select', async (_event, id: string) => {
    const session = db.getSession(id);
    let messages = db.listMessages(id);

    // Clean up any accidentally stored terminal query sequences or single keystrokes from database
    messages = messages.filter((m) => {
      const text = (m.content || '').trim();
      if (!text) return false;
      if (m.role === 'user' && (text.startsWith('\x1B') || text.includes('[?202') || text.includes('$y') || text.includes('$p') || text.length <= 1)) {
        try { db.deleteMessage(m.id); } catch (e) {}
        return false;
      }
      return true;
    });

    // For Antigravity CLI sessions, transcript.jsonl is the clean, authoritative AI chat history!
    if (session && session.antigravity_id) {
      const transcriptMsgs = readAntigravityTranscript(session);
      if (transcriptMsgs.length > 0) {
        const latestTranscriptUserContent = transcriptMsgs.filter(m => m.role === 'user').map(m => m.content.trim());
        const pendingUserMsgs = messages.filter(m => m.role === 'user' && !latestTranscriptUserContent.includes(m.content.trim()));
        const systemMsgs = messages.filter(m => m.role === 'system');
        const specialAssistantMsgs = messages.filter(m => m.role === 'assistant' && m.raw_output && m.raw_output.startsWith('Model changed to'));
        messages = [...transcriptMsgs, ...pendingUserMsgs, ...systemMsgs, ...specialAssistantMsgs].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      } else {
        messages = messages.filter(m => m.role === 'user' || m.role === 'system' || (m.role === 'assistant' && m.raw_output && m.raw_output.startsWith('Model changed to')));
      }
    } else {
      messages = messages.filter(m => m.role === 'user' || m.role === 'system' || (m.role === 'assistant' && m.raw_output && m.raw_output.startsWith('Model changed to')));
    }
    return { session, messages };
  });

  ipcMain.handle('sessions:delete', async (_event, id: string) => {
    ptyManager.stopSession(id);
    db.deleteSession(id);
    return { success: true };
  });

  ipcMain.handle('sessions:updateCwd', async (_event, id: string, cwd: string) => {
    db.updateSession(id, { cwd });
    return { success: true };
  });

  ipcMain.handle('agy:checkCommand', async () => {
    return ptyManager.checkCommand();
  });

  ipcMain.handle('agy:startSession', async (_event, { sessionId, cwd }: { sessionId: string; cwd?: string }) => {
    return ptyManager.startSession(sessionId, cwd);
  });

  ipcMain.handle('agy:send', async (_event, { sessionId, text }: { sessionId: string; text: string }) => {
    // Only record as a user chat message if it's a real prompt, not a terminal query or escape sequence!
    const isTerminalNoise = text.startsWith('\x1B') || text.includes('[?202') || text.includes('$y') || text.includes('$p') || text === '\r' || text === '\n' || text === '\x03' || text === '\x04';
    const isModelCommand = text.startsWith('/model ') || text === '/model' || text.startsWith('/model\r');
    if (!isTerminalNoise && !isModelCommand && text.trim().length > 1) {
      const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      db.addMessage({
        id: msgId,
        session_id: sessionId,
        role: 'user',
        content: text,
        raw_output: text,
        created_at: new Date().toISOString(),
      });
      // Reset tracking so next output chunk creates a new assistant message
      ptyManager.resetAssistantMessageTracking(sessionId);
    }

    return ptyManager.send(sessionId, text);
  });

  ipcMain.handle('agy:syncTitle', async (_event, { sessionId }: { sessionId: string }) => {
    const session = db.getSession(sessionId);
    if (!session || !session.antigravity_id) return { success: false };

    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const dbPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'conversation_summaries.db');
    if (!fs.existsSync(dbPath)) return { success: false };

    try {
      const rows = await readAntigravityResumeRows(dbPath, fs);
      const matched = rows.find((r: any) => r.id === session.antigravity_id);
      if (matched && matched.title && matched.title !== session.title && matched.title.trim() !== '') {
        db.updateSession(sessionId, { title: matched.title });
        return { success: true, title: matched.title };
      }
    } catch (e) {
      console.warn('[IPC] syncTitle error', e);
    }
    return { success: false };
  });

  ipcMain.handle('agy:stop', async (_event, { sessionId }: { sessionId: string }) => {
    return ptyManager.stopSession(sessionId);
  });

  ipcMain.handle('agy:listModels', async () => {
    try {
      const { execSync } = require('child_process');
      const output = execSync('agy models', { encoding: 'utf-8', timeout: 5000 });
      const rawLines = output.split(/\r?\n/).map((line: string) => line.trim()).filter((line: string) => line.length > 0 && line !== 'Switch Model');
      let currentModel = '';
      const models = rawLines.map((line: string) => {
        let name = line;
        if (name.startsWith('>')) name = name.substring(1).trim();
        if (name.includes('(current)')) {
          name = name.replace('(current)', '').trim();
          currentModel = name;
        }
        return name;
      });
      return { success: true, models, currentModel };
    } catch (e: any) {
      console.warn('[IPC] listModels error', e.message);
      // Fallback
      return { success: true, models: [
        'Gemini 3.5 Flash (Medium)',
        'Gemini 3.5 Flash (High)',
        'Claude Sonnet 4.6 (Thinking)',
        'GPT-OSS 120B (Medium)'
      ], currentModel: 'Gemini 3.5 Flash (Medium)' };
    }
  });

  // Accounts Management
  ipcMain.handle('accounts:list', () => accountsManager.getAccounts());
  
  ipcMain.handle('accounts:delete', (_event, id: string) => {
    accountsManager.deleteAccount(id);
    return { success: true };
  });

  ipcMain.handle('accounts:switch', async (_event, id: string) => {
    const success = await accountsManager.forceSwitchTo(id);
    if (success) {
      ptyManager.restartActiveSession();
    }
    return { success };
  });

  ipcMain.handle('accounts:add', async (_event, data: { name: string, payload: string }) => {
    try {
      await accountsManager.addAccount(data.name, data.payload);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('accounts:refresh', async (_event, id: string) => {
    try {
      await accountsManager.updateQuotaForAccount(id);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('accounts:oauth', async () => {
    try {
      const res = await startOAuthFlow(accountsManager);
      return res;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('messages:list', async (_event, sessionId: string) => {
    const session = db.getSession(sessionId);
    const localMsgs = db.listMessages(sessionId);
    if (session && session.antigravity_id) {
      const transcriptMsgs = readAntigravityTranscript(session);
      console.log(`[IPC] messages:list for ${sessionId}: transcriptMsgs length=${transcriptMsgs.length}`);
      if (transcriptMsgs.length > 0) {
        const latestTranscriptUserContent = transcriptMsgs.filter(m => m.role === 'user').map(m => m.content.trim());
        const pendingUserMsgs = localMsgs.filter(m => m.role === 'user' && !latestTranscriptUserContent.includes(m.content.trim()));
        console.log(`[IPC] Returning ${transcriptMsgs.length} transcript msgs + ${pendingUserMsgs.length} pending user msgs`);
        return [...transcriptMsgs, ...pendingUserMsgs];
      }
    }
    // Fallback
    console.log(`[IPC] Fallback for ${sessionId}: returning ${localMsgs.filter(m => m.role === 'user').length} local user msgs`);
    return localMsgs.filter(m => m.role === 'user');
  });

  ipcMain.handle('messages:add', async (_event, payload: any) => {
    const msgId = payload.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    db.addMessage({
      id: msgId,
      session_id: payload.sessionId,
      role: payload.role,
      content: payload.content,
      raw_output: payload.rawOutput || payload.content,
      created_at: payload.createdAt || new Date().toISOString(),
    });
    return { success: true, id: msgId };
  });

  ipcMain.handle('export:markdown', async (_event, sessionId: string) => {
    const session = db.getSession(sessionId);
    if (!session) return { success: false, error: 'Sesja nie istnieje' };

    const messages = db.listMessages(sessionId);
    let md = `# ${session.title}\n\n`;
    md += `- **Session ID:** \`${session.id}\`\n`;
    md += `- **Working Directory (CWD):** \`${session.cwd || 'N/A'}\`\n`;
    md += `- **CLI Command:** \`${session.cli_command || 'agy'}\`\n`;
    md += `- **Created At:** ${new Date(session.created_at).toLocaleString()}\n\n`;
    md += `---\n\n## Historia Rozmowy / Transcript\n\n`;

    for (const m of messages) {
      const roleName = m.role === 'user' ? '🧑 **Użytkownik (Prompt)**' : m.role === 'assistant' ? '🤖 **Antigravity CLI (Output)**' : '⚙️ **System**';
      md += `### ${roleName} - *${new Date(m.created_at).toLocaleTimeString()}*\n\n`;
      if (m.role === 'assistant') {
        // Clean ANSI sequences for markdown
        const cleanContent = m.content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        md += `\`\`\`\n${cleanContent.trim()}\n\`\`\`\n\n`;
      } else {
        md += `${m.content.trim()}\n\n`;
      }
      md += `---\n\n`;
    }

    const cleanTitle = session.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Eksportuj Sesję do Markdown',
      defaultPath: `${cleanTitle}_transcript.md`,
      filters: [{ name: 'Markdown Document', extensions: ['md'] }],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    try {
      fs.writeFileSync(filePath, md, 'utf-8');
      return { success: true, path: filePath };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('utils:openExternal', async (_event, url: string) => {
    const { shell } = require('electron');
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch(e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz folder roboczy (CWD) dla sesji',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }
    return filePaths[0];
  });
};

app.whenReady().then(() => {
  protocol.handle('local-asset', (request) => {
    const url = request.url.replace('local-asset://', '');
    const decodedUrl = decodeURIComponent(url);
    return net.fetch('file:///' + decodedUrl);
  });
  
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  ptyManager.stopAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  ptyManager.stopAll();
});
