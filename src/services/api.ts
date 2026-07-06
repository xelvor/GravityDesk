import { PreloadApi, Session, Message, CliCommandStatus } from '../types';

class MockApi implements PreloadApi {
  private mockSessions: Session[] = [
    {
      id: 'mock-session-1',
      title: 'Demo Antigravity CLI',
      cwd: 'C:/Users/adscvff/Desktop/xelvor-ai',
      cli_command: 'agy',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  private mockMessages: Message[] = [
    {
      id: 'mock-msg-1',
      session_id: 'mock-session-1',
      role: 'system',
      content: '🚀 **GravityDesk Web Preview Mode**\n\nTo aplikacja w trybie podglądu przeglądarki (`npm run dev`). Aby uruchomić pełne lokalne CLI `agy` przez `node-pty` w środowisku desktopowym Windows, uruchom aplikację przez komendę:\n```bash\nnpm run electron:dev\n```',
      raw_output: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'mock-msg-2',
      session_id: 'mock-session-1',
      role: 'user',
      content: '/status',
      raw_output: '/status',
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'mock-msg-3',
      session_id: 'mock-session-1',
      role: 'assistant',
      content: '⚡ **Antigravity CLI Status Report**\n\n- **Project:** `xelvor-ai`\n- **Git Status:** Clean working tree\n- **Ready:** You can now send prompts or commands like `/review`, `/fix`, or `/tests`.\n\n*Note: In Electron desktop mode, live terminal output will stream directly from your local `agy.exe` process.*',
      raw_output: 'Antigravity CLI Status Report...',
      created_at: new Date(Date.now() - 1700000).toISOString(),
    },
  ];

  sessions = {
    list: async () => {
      const resume = await this.agy.listResumeSessions();
      for (const r of resume) {
        if (!this.mockSessions.some((s) => s.id === r.id || s.antigravity_id === r.id)) {
          this.mockSessions.push({
            id: r.id,
            title: r.title,
            cwd: r.cwd,
            cli_command: 'agy',
            antigravity_id: r.id,
            created_at: r.updatedAt,
            updated_at: r.updatedAt,
          });
        }
      }
      return [...this.mockSessions].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    },
    create: async (payload: { title: string; cwd?: string; antigravity_id?: string }) => {
      const now = new Date().toISOString();
      const newSess: Session = {
        id: payload.antigravity_id || ('mock-' + Date.now()),
        title: payload.title || 'Nowa Sesja Web',
        cwd: payload.cwd || 'C:/Projects/Demo',
        cli_command: 'agy',
        antigravity_id: payload.antigravity_id || null,
        created_at: now,
        updated_at: now,
      };
      this.mockSessions.unshift(newSess);
      return newSess;
    },
    select: async (id: string) => {
      const s = this.mockSessions.find((x) => x.id === id) || this.mockSessions[0];
      let m = this.mockMessages.filter((x) => x.session_id === id);
      if (m.length === 0 && s) {
        m = [
          {
            id: 'mock_u_1_' + id,
            session_id: id,
            role: 'user',
            content: `Cześć! O czym rozmawialiśmy w sesji "${s.title}"?`,
            raw_output: '',
            created_at: new Date(Date.now() - 60000).toISOString(),
          },
          {
            id: 'mock_a_1_' + id,
            session_id: id,
            role: 'assistant',
            content: `Cześć! To jest odtworzona historia konwersacji z Antigravity CLI dla sesji **${s.title}**. Możemy kontynuować pracę od miejsca, w którym skończyliśmy! 🚀`,
            raw_output: '',
            created_at: new Date().toISOString(),
          },
        ];
        this.mockMessages.push(...m);
      }
      return { session: s, messages: m };
    },
    delete: async (id: string) => {
      this.mockSessions = this.mockSessions.filter((x) => x.id !== id);
      this.mockMessages = this.mockMessages.filter((x) => x.session_id !== id);
      return { success: true };
    },
    updateCwd: async (id: string, cwd: string) => {
      const s = this.mockSessions.find((x) => x.id === id);
      if (s) s.cwd = cwd;
      return { success: true };
    },
  };

  agy = {
    checkCommand: async (): Promise<CliCommandStatus> => ({
      found: true,
      command: 'agy',
      path: 'C:\\Users\\adscvff\\AppData\\Local\\agy\\bin\\agy.exe',
    }),
    startSession: async (payload: { sessionId: string; cwd?: string }) => {
      console.log('Mock startSession:', payload);
      return { success: true, pid: 9999, command: 'agy' };
    },
    syncTitle: async (payload: { sessionId: string }) => {
      return { success: true, title: 'Mock Synced Title' };
    },
    send: async (payload: { sessionId: string; text: string }) => {
      const userMsg: Message = {
        id: 'mock-msg-' + Date.now(),
        session_id: payload.sessionId,
        role: 'user',
        content: payload.text,
        raw_output: payload.text,
        created_at: new Date().toISOString(),
      };
      this.mockMessages.push(userMsg);

      setTimeout(() => {
        const asstMsg: Message = {
          id: 'mock-asst-' + Date.now(),
          session_id: payload.sessionId,
          role: 'assistant',
          content: `🤖 [Web Preview Mock Reply to "${payload.text}"]\n\nAby przetestować rzeczywiste połączenie z procesem Antigravity w terminalu, otwórz aplikację w Electronie:\n\`\`\`bash\nnpm run electron:dev\n\`\`\``,
          raw_output: `Mock reply to ${payload.text}`,
          created_at: new Date().toISOString(),
        };
        this.mockMessages.push(asstMsg);
        if (this.outputCb) {
          this.outputCb({ sessionId: payload.sessionId, data: `\r\n\x1b[32m[Antigravity CLI]:\x1b[0m Ready! You sent: ${payload.text}\r\n` });
        }
      }, 500);

      return { success: true, expandedText: payload.text };
    },
    stop: async (payload: { sessionId: string }) => {
      console.log('Mock stopSession:', payload);
      return { success: true };
    },
    listResumeSessions: async () => [
      {
        id: '058d4b1d-9295-4ab4-b9e8-05d4a1d16a1e',
        title: '[CURRENT] Co U Ciebie Słychać',
        cwd: 'C:/Users/adscvff/Desktop/xelvor-ai',
        stepCount: 4,
        updatedAt: new Date().toISOString(),
      },
      {
        id: '06673329-ccdb-4fb3-b113-b5d23b200f0a',
        title: 'Wykonanie Pliku Promt.txt',
        cwd: 'C:/Users/adscvff/Desktop/xelvor-ai',
        stepCount: 126,
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: '0fa3a1f1-b4e3-453f-a530-a63e64e86c3f',
        title: 'Chcę zbudować lokalną desktopową aplikację na Windowsa...',
        cwd: 'C:/Users/adscvff/Desktop/xelvor-ai',
        stepCount: 3,
        updatedAt: new Date(Date.now() - 7200000).toISOString(),
      },
    ],
    listModels: async () => {
      return { success: true, models: [
        'Gemini 3.5 Flash (Medium)',
        'Gemini 3.5 Flash (High)',
        'Claude Sonnet 4.6 (Thinking)',
        'GPT-OSS 120B (Medium)'
      ], currentModel: 'Gemini 3.5 Flash (Medium)' };
    },
    onOutput: (callback: (payload: { sessionId: string; data: string }) => void) => {
      this.outputCb = callback;
      return () => {
        this.outputCb = null;
      };
    },
    onStatusChange: (callback: (payload: { sessionId: string; status: string; pid?: number; error?: string }) => void) => {
      setTimeout(() => callback({ sessionId: 'mock-session-1', status: 'running', pid: 9999 }), 200);
      return () => {};
    },
  };

  private outputCb: ((payload: { sessionId: string; data: string }) => void) | null = null;

  messages = {
    list: async (sessionId: string) => this.mockMessages.filter((x) => x.session_id === sessionId),
    add: async (payload: any) => {
      this.mockMessages.push({
        id: 'msg_' + Date.now(),
        session_id: payload.sessionId,
        role: payload.role,
        content: payload.content,
        raw_output: payload.rawOutput || payload.content,
        created_at: new Date().toISOString(),
      });
      return { success: true };
    },
  };

  export = {
    markdown: async (sessionId: string) => {
      alert(`[Web Preview] Eksport sesji ${sessionId} do pliku Markdown! W wersji Electron plik zapisze się bezpośrednio na dysku.`);
      return { success: true, path: 'C:/Users/adscvff/Desktop/session_export.md' };
    },
  };

  dialog = {
    selectFolder: async () => {
      const folder = prompt('Wpisz ścieżkę folderu roboczego (w Electronie otworzy się natywny selektor Windows):', 'C:/Users/adscvff/Desktop/xelvor-ai');
      return folder || null;
    },
  };
}

export const api: PreloadApi = window.api || (new MockApi() as PreloadApi);
export const isElectron = !!window.api;
