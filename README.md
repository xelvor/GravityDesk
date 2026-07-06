# GravityDesk 🚀
**Modern AI Desktop Dashboard and Chat for Antigravity CLI**

GravityDesk is a native, premium desktop application for Windows built using **Electron**, **Vue 3**, **TypeScript**, **Vite**, and **Vanilla CSS**. It provides a graphical dashboard (GUI) overlay on top of the **Antigravity CLI** (`agy` / `antigravity`), running it locally via pseudo-terminals (`node-pty`), managing active working directories (CWD), keeping persistent session histories in local **SQLite** databases, and providing automated account failover.

---

## 🎨 Core Features

1. **Premium Obsidian Dark UI** – Elegant dashboard aesthetic featuring glassmorphism, responsive grids, sleek progress bars, and fluid micro-animations.
2. **Dual Interaction Modes**:
   - **Terminal TUI Mode (`@xterm/xterm`)** – Full-fidelity terminal emulation with ANSI color support, allowing direct interactions with the CLI menu, arrows, and keyboard hotkeys.
   - **Chat Mode** – Clean user interface parsing Markdown, showing syntax-highlighted code blocks, and automatically stripping raw terminal control codes.
3. **Advanced Multi-Account Manager**:
   - **Google OAuth Login & Import** – High-performance sign-in flow that captures offline credentials (`refresh_token`) and supports manual JSON imports.
   - **Automated Failover Rotation** – Seamless background account switching. If an active account triggers a `429 Too Many Requests`, quota exhaustion, or eligibility failure, the application dynamically updates system credentials and restarts the local session to fulfill your query instantly.
   - **Live Quota Monitor** – Track remaining API quotas, visual usage percentages, and reset timers for all model groups (e.g., Gemini 3.5 Flash, Gemini Pro).
   - **Manual Sync & Refresh** – Re-fetch credits and refresh tokens on-demand with one click.
4. **Self-Healing Native Windows Keyring Sync** – Features an integrated C# binary ([CredWriter.exe](file:///C:/Users/adscvff/Desktop/xelvor-ai/CredWriter.exe)) that automatically inserts credentials into the Windows Credential Manager under UTF-8 formatting and correct username attributes, solving Go's native keyring compatibility on Windows.
5. **Dynamic Slash Commands** – Shortcuts expanded into detailed prompts before execution:
   - `/commit` → Generate conventional git commits from your diff.
   - `/review` → Conduct a deep codebase security and quality review.
   - `/fix <issue>` → Automatically resolve code errors.
   - `/explain <file>` → Explain file architecture in detail.
   - `/tests` → Suggest and run project test suites.
   - `/status` → Inspect git and general project workspace status.
6. **Robust SQLite Engine** – Powered by `better-sqlite3` with an automatic, transparent WASM fallback (`sql.js`) if local C++ compilers are missing.
7. **Active Keyboard Shortcuts**:
   - **`Ctrl + N`** – Start a new session.
   - **`Ctrl + B`** – Toggle sidebar visibility.
   - **`Ctrl + \``** – Switch between Chat and Terminal views.
   - **`Ctrl + ,`** – Toggle Settings panel.

---

## 🛠️ Prerequisites

- **OS:** Windows 10 / 11
- **Node.js:** v18 or v20+
- **Antigravity CLI:** Installed `agy` or `antigravity` binary accessible in your system `PATH`.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch in Development Mode (Electron)
Runs the desktop window with full access to filesystem dialogs, SQLite, and system terminal processes:
```bash
npm run electron:dev
```

### 3. Launch Frontend Web Server (Vite)
Runs the isolated Vue client inside your default web browser (mocked API):
```bash
npm run dev
```

### 4. Build Production Binaries
Compile TypeScript and package the production desktop application:
```bash
npm run electron:build
```

---

## 📁 Directory Structure

```text
xelvor-ai/
├── package.json             # App scripts and npm dependencies
├── vite.config.ts           # Vite configurations for Vue & Electron bundlers
├── tailwind.config.js       # UI design themes, animations and tokens
├── index.html               # Main application template
│
├── electron/                # Main Process (Backend)
│   ├── main.ts              # Window spawning, security hooks, and IPC handlers
│   ├── preload.ts           # Secure ContextBridge API exposure
│   ├── db.ts                # SQLite adapter (better-sqlite3 + WASM fallback)
│   ├── accounts.ts          # Multi-account rotation, OAuth, and quota synchronizer
│   └── ptyManager.ts        # PTY process manager, command resolver & failover hook
│
└── src/                     # Renderer Process (Frontend)
    ├── main.ts              # Vue & Pinia instantiation
    ├── style.css            # Custom scrollbars, glassmorphism CSS, and transition definitions
    ├── types/index.ts       # Shared TypeScript model interfaces
    ├── stores/sessions.ts   # Global session state & action mapping
    │
    └── components/          # Vue layout components
        ├── Sidebar.vue      # Session listing & active workspace CWD selector
        ├── ChatArea.vue     # View toggle, header settings, and layout container
        ├── TerminalView.vue # XTerm.js terminal render wrapper
        ├── ChatBubbleView.vue # Markdown renderer with terminal code stripping
        ├── ChatInput.vue    # Slash command dropdown & keyboard events
        └── SettingsModal.vue # Tabbed accounts, theme & shortcut settings panel
```

---

## 🛡️ License and Safety
This project interacts with your system's keyring securely. To review the C# script source code responsible for system credential insertion, check [CredWriter.cs](file:///C:/Users/adscvff/Desktop/xelvor-ai/CredWriter.cs) and [CredReader.cs](file:///C:/Users/adscvff/Desktop/xelvor-ai/CredReader.cs).
