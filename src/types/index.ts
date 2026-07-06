export interface Session {
  id: string;
  title: string;
  cwd: string | null;
  cli_command: string | null;
  antigravity_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  raw_output: string | null;
  created_at: string;
  thoughts?: Array<{ text: string; duration: string }>;
  tool_calls?: any[];
}

export interface CliCommandStatus {
  found: boolean;
  command: string;
  path: string;
  error?: string;
}

export interface ResumeSession {
  id: string;
  title: string;
  cwd: string;
  stepCount: number;
  updatedAt: string;
}

export interface PreloadApi {
  sessions: {
    list: () => Promise<Session[]>;
    create: (payload: { title: string; cwd?: string; antigravity_id?: string }) => Promise<Session>;
    select: (id: string) => Promise<{ session: Session; messages: Message[] }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    updateCwd: (id: string, cwd: string) => Promise<{ success: boolean }>;
  };
  agy: {
    checkCommand: () => Promise<CliCommandStatus>;
    startSession: (payload: { sessionId: string; cwd?: string }) => Promise<{ success: boolean; pid?: number; command?: string; error?: string }>;
    send: (payload: { sessionId: string; text: string }) => Promise<{ success: boolean; error?: string; expandedText?: string }>;
    stop: (payload: { sessionId: string }) => Promise<{ success: boolean }>;
    syncTitle: (payload: { sessionId: string }) => Promise<{ success: boolean; title?: string }>;
    onOutput: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
    onStatusChange: (callback: (payload: { sessionId: string; status: string; pid?: number; error?: string }) => void) => () => void;
    listResumeSessions: () => Promise<ResumeSession[]>;
    listModels: () => Promise<{ success: boolean; models?: string[]; currentModel?: string }>;
  };
  messages: {
    list: (sessionId: string) => Promise<Message[]>;
    add: (payload: { sessionId: string; role: 'user' | 'assistant' | 'system'; content: string; rawOutput?: string }) => Promise<{ success: boolean; id?: string }>;
  };
  export: {
    markdown: (sessionId: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
  };
}

declare global {
  interface Window {
    api?: PreloadApi;
  }
}
