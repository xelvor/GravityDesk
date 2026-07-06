<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useSessionsStore } from '../stores/sessions';
import { api } from '../services/api';
import '@xterm/xterm/css/xterm.css';

const store = useSessionsStore();
const terminalContainer = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await nextTick();
  if (!terminalContainer.value) return;

  term = new Terminal({
    theme: {
      background: '#0a0a0a',
      foreground: '#d4d4d4',
      cursor: '#3b82f6',
      cursorAccent: '#0a0a0a',
      selectionBackground: 'rgba(59, 130, 246, 0.35)',
      black: '#0a0a0a',
      red: '#f87171',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#f1f5f9',
      brightBlack: '#334155',
      brightRed: '#fca5a5',
      brightGreen: '#6ee7b7',
      brightYellow: '#fde68a',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff',
    },
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    convertEol: true,
    scrollback: 10000,
    allowTransparency: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalContainer.value);
  fitAddon.fit();

  // If user types directly in the terminal canvas, send raw characters to CLI
  term.onData((data) => {
    if (store.activeSessionId && store.cliStatus === 'running') {
      api.agy.send({ sessionId: store.activeSessionId, text: data });
    }
  });

  // Handle resizing
  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit();
    } catch {
      // ignore resize errors during transitions
    }
  });
  resizeObserver.observe(terminalContainer.value);

  // Register store callback to stream data into xterm
  store.registerTerminalCallback((data) => {
    term?.write(data);
  });

  // Re-fit after initial rendering
  setTimeout(() => fitAddon?.fit(), 100);
});

onBeforeUnmount(() => {
  if (resizeObserver && terminalContainer.value) {
    resizeObserver.unobserve(terminalContainer.value);
    resizeObserver.disconnect();
  }
  term?.dispose();
});

// Re-fit when viewMode switches back to terminal
watch(() => store.viewMode, (newMode) => {
  if (newMode === 'terminal') {
    nextTick(() => {
      setTimeout(() => fitAddon?.fit(), 50);
    });
  }
});
</script>

<template>
  <div class="w-full h-full p-3 bg-obsidian-900 rounded-xl border border-slate-800/80 shadow-inner overflow-hidden relative group">
    <!-- Terminal Banner / Overlay -->
    <div class="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      <span class="px-2 py-1 rounded bg-slate-900/90 text-slate-400 font-mono text-[10px] border border-slate-800 shadow-md">
        xterm.js · TUI Mode
      </span>
    </div>
    <div ref="terminalContainer" class="w-full h-full"></div>
  </div>
</template>

<style scoped>
:deep(.xterm-viewport) {
  border-radius: 0.5rem;
  scrollbar-width: thin;
  scrollbar-color: #334155 #0c1017;
}
</style>
