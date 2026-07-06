import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface SessionRecord {
  id: string;
  title: string;
  cwd: string | null;
  cli_command: string | null;
  antigravity_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  raw_output: string | null;
  created_at: string;
}

class DatabaseManager {
  private dbPath: string = '';
  private useWasm: boolean = false;
  private betterDb: any = null;
  private wasmDb: any = null;
  private wasmSQL: any = null;

  public async init(): Promise<void> {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.dbPath = path.join(userDataPath, 'gravitydesk.sqlite');
    console.log(`[Database] Initializing SQLite database at: ${this.dbPath}`);

    try {
      const Database = require('better-sqlite3');
      this.betterDb = new Database(this.dbPath);
      this.betterDb.pragma('journal_mode = WAL');
      this.useWasm = false;
      console.log('[Database] Using native better-sqlite3 engine');
    } catch (error) {
      console.warn('[Database] better-sqlite3 native module load failed, falling back to WASM sql.js:', error);
      this.useWasm = true;
      const initSqlJs = require('sql.js');
      this.wasmSQL = await initSqlJs();
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.wasmDb = new this.wasmSQL.Database(new Uint8Array(buffer));
      } else {
        this.wasmDb = new this.wasmSQL.Database();
        this.saveWasm();
      }
      console.log('[Database] Using WASM sql.js engine successfully');
    }

    this.createTables();
  }

  private saveWasm(): void {
    if (this.useWasm && this.wasmDb) {
      const data = this.wasmDb.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    }
  }

  private createTables(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        cwd TEXT,
        cli_command TEXT,
        antigravity_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        raw_output TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );
    `;
    if (!this.useWasm) {
      this.betterDb.exec(sql);
      try {
        this.betterDb.exec('ALTER TABLE sessions ADD COLUMN antigravity_id TEXT;');
      } catch (e) {}
    } else {
      this.wasmDb.exec(sql);
      try {
        this.wasmDb.exec('ALTER TABLE sessions ADD COLUMN antigravity_id TEXT;');
      } catch (e) {}
      this.saveWasm();
    }
  }

  // Sessions CRUD
  public listSessions(): SessionRecord[] {
    const sql = `SELECT * FROM sessions ORDER BY updated_at DESC`;
    if (!this.useWasm) {
      return this.betterDb.prepare(sql).all() as SessionRecord[];
    } else {
      const res = this.wasmDb.exec(sql);
      if (!res.length) return [];
      const columns = res[0].columns;
      return res[0].values.map((row: any[]) => {
        const obj: any = {};
        columns.forEach((col: string, idx: number) => {
          obj[col] = row[idx];
        });
        return obj as SessionRecord;
      });
    }
  }

  public getSession(id: string): SessionRecord | null {
    const sql = `SELECT * FROM sessions WHERE id = ?`;
    if (!this.useWasm) {
      const row = this.betterDb.prepare(sql).get(id);
      return (row as SessionRecord) || null;
    } else {
      const stmt = this.wasmDb.prepare(sql);
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row as SessionRecord;
      }
      stmt.free();
      return null;
    }
  }

  public createSession(session: SessionRecord): void {
    const sql = `
      INSERT INTO sessions (id, title, cwd, cli_command, antigravity_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      session.id,
      session.title,
      session.cwd,
      session.cli_command,
      session.antigravity_id || null,
      session.created_at,
      session.updated_at,
    ];
    if (!this.useWasm) {
      this.betterDb.prepare(sql).run(...params);
    } else {
      this.wasmDb.run(sql, params);
      this.saveWasm();
    }
  }

  public updateSession(id: string, updates: Partial<SessionRecord>): void {
    const current = this.getSession(id);
    if (!current) return;
    const title = updates.title !== undefined ? updates.title : current.title;
    const cwd = updates.cwd !== undefined ? updates.cwd : current.cwd;
    const cli_command = updates.cli_command !== undefined ? updates.cli_command : current.cli_command;
    const antigravity_id = updates.antigravity_id !== undefined ? updates.antigravity_id : current.antigravity_id;
    const updated_at = new Date().toISOString();

    const sql = `UPDATE sessions SET title = ?, cwd = ?, cli_command = ?, antigravity_id = ?, updated_at = ? WHERE id = ?`;
    const params = [title, cwd, cli_command, antigravity_id || null, updated_at, id];
    if (!this.useWasm) {
      this.betterDb.prepare(sql).run(...params);
    } else {
      this.wasmDb.run(sql, params);
      this.saveWasm();
    }
  }

  public deleteSession(id: string): void {
    const sqlMsgs = `DELETE FROM messages WHERE session_id = ?`;
    const sqlSess = `DELETE FROM sessions WHERE id = ?`;
    if (!this.useWasm) {
      this.betterDb.prepare(sqlMsgs).run(id);
      this.betterDb.prepare(sqlSess).run(id);
    } else {
      this.wasmDb.run(sqlMsgs, [id]);
      this.wasmDb.run(sqlSess, [id]);
      this.saveWasm();
    }
  }

  // Messages CRUD
  public listMessages(sessionId: string): MessageRecord[] {
    const sql = `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`;
    if (!this.useWasm) {
      return this.betterDb.prepare(sql).all(sessionId) as MessageRecord[];
    } else {
      const res = this.wasmDb.exec(sql, [sessionId]);
      if (!res.length) return [];
      const columns = res[0].columns;
      return res[0].values.map((row: any[]) => {
        const obj: any = {};
        columns.forEach((col: string, idx: number) => {
          obj[col] = row[idx];
        });
        return obj as MessageRecord;
      });
    }
  }

  public addMessage(msg: MessageRecord): void {
    const sql = `
      INSERT OR REPLACE INTO messages (id, session_id, role, content, raw_output, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [msg.id, msg.session_id, msg.role, msg.content, msg.raw_output, msg.created_at];
    if (!this.useWasm) {
      this.betterDb.prepare(sql).run(...params);
    } else {
      this.wasmDb.run(sql, params);
      this.saveWasm();
    }
    // Update session updated_at
    const now = new Date().toISOString();
    if (!this.useWasm) {
      this.betterDb.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, msg.session_id);
    } else {
      this.wasmDb.run(`UPDATE sessions SET updated_at = ? WHERE id = ?`, [now, msg.session_id]);
      this.saveWasm();
    }
  }

  public deleteMessage(id: string): void {
    const sql = `DELETE FROM messages WHERE id = ?`;
    if (!this.useWasm) {
      this.betterDb.prepare(sql).run(id);
    } else {
      this.wasmDb.run(sql, [id]);
      this.saveWasm();
    }
  }

  public deleteMessagesForSession(sessionId: string): void {
    const sql = `DELETE FROM messages WHERE session_id = ?`;
    if (!this.useWasm) {
      this.betterDb.prepare(sql).run(sessionId);
    } else {
      this.wasmDb.run(sql, [sessionId]);
      this.saveWasm();
    }
  }
}

export const db = new DatabaseManager();
