// Terminal Output Parser and Cleaner for GravityDesk AI Chat
// Transforms raw, noisy PTY byte streams into clean, structured Markdown for UI display

export const parseTerminalToCleanMarkdown = (raw: string): string => {
  if (!raw) return '';
  let text = raw;

  // 1. Process carriage returns (\r) without \n (line overwriting / spinners)
  const lines: string[] = [];
  let currentLine = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') {
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r') {
      if (text[i + 1] === '\n') {
        // \r\n -> treat as standard newline in next iteration
      } else {
        // Carriage return without newline: overwrite current line (eliminates spinner artifacts)
        currentLine = '';
      }
    } else if (char === '\x08' || char === '\b') {
      // Backspace: remove last character
      currentLine = currentLine.slice(0, -1);
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);
  text = lines.join('\n');

  // 2. Strip ANSI color codes, ESC sequences, and OSC terminal titles
  text = text
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences (colors, cursor movements)
    .replace(/\x1B\][0-9;]*(\x07|\x1B\\)/g, '') // OSC sequences (window titles)
    .replace(/\x1B[<=>]/g, '') // Keypad modes
    .replace(/\x1B\([B0]/g, '') // Charset selection
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Non-printable control characters

  // 3. Clean up repetitive CLI noise, prompts, loading spinners, and startup TUI banners
  text = text
    .replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|\-/\\✔✖ℹ⚠]\s*/gm, '') // Spinner dots and symbols at line starts
    .replace(/(Thinking|Generating|Processing|Analyzing|Searching|Signing in)\.\.\.+/gi, '') // Loading text
    .replace(/Welcome to the Antigravity CLI.*/gi, '') // Startup banner
    .replace(/You are currently (not )?signed in.*/gi, '') // Login status banner
    .replace(/.*\? for shortcuts.*/gi, '') // Footer bar
    .replace(/\[>[0-9;]*m/g, '').replace(/\[=[0-9;]*u/g, '').replace(/\[\?[0-9;]*[hlq]/g, '') // Advanced terminal keyboard & cursor protocol CSI codes
    .replace(/^[█─_]{3,}\s*/gm, '') // ASCII box borders and logo blocks
    .replace(/\[\d+\/\d+\]\s*/g, '') // Progress counters like [1/5]
    .replace(/^\[Antigravity CLI\]:\s*/gm, '') // Console header prefix
    .replace(/^>\s*/gm, ''); // Interactive prompt arrows

  // 4. Remove multiple empty lines and trim whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
};
