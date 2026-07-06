<script setup lang="ts">
import { useSessionsStore } from '../stores/sessions';
import TerminalView from './TerminalView.vue';
import ChatBubbleView from './ChatBubbleView.vue';

const store = useSessionsStore();
</script>

<template>
  <main class="flex-1 flex flex-col h-full bg-gray-950 overflow-hidden relative">
    <!-- No Active Session Welcome Screen -->
    <div v-if="!store.activeSession" class="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-gray-950">
      <div class="max-w-md space-y-6">
        <div class="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 shadow-lg mx-auto flex items-center justify-center">
          <i class="ph ph-terminal-window text-3xl text-gray-400"></i>
        </div>
        <div>
          <h2 class="font-medium text-xl text-gray-200 mb-2 tracking-tight">GravityDesk</h2>
          <p class="text-sm text-gray-500 leading-relaxed">
            Professional desktop environment for local Antigravity CLI sessions.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3 text-left pt-2">
          <div class="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <i class="ph ph-terminal-window text-accent-500 mb-1"></i>
            <h4 class="text-xs font-medium text-gray-300">Terminal TUI</h4>
            <p class="text-[11px] text-gray-500 mt-0.5">Full node-pty & xterm.js support.</p>
          </div>
          <div class="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <i class="ph ph-lightning text-accent-500 mb-1"></i>
            <h4 class="text-xs font-medium text-gray-300">Slash Commands</h4>
            <p class="text-[11px] text-gray-500 mt-0.5">Fast access to /commit, /review.</p>
          </div>
        </div>
        <button
          @click="store.isNewSessionModalOpen = true"
          class="w-full py-2.5 px-6 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-sm transition-colors border border-gray-700 active:scale-[0.98]"
        >
          Start New Session
        </button>
      </div>
    </div>

    <!-- Active Session Workspace -->
    <template v-else>
      <!-- Topbar -->
      <header class="h-14 px-5 flex items-center justify-between border-b border-gray-900 bg-gray-950/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <button 
            @click="store.changeCwd"
            class="px-2 py-1 bg-gray-900 border border-gray-800 rounded-md text-xs font-mono text-gray-400 flex items-center gap-1.5 cursor-pointer hover:bg-gray-800 hover:text-gray-200 transition-colors shrink-0 max-w-xs truncate"
            title="Change Working Directory"
          >
            <i class="ph ph-folder-open text-gray-500"></i>
            {{ store.activeSession.cwd || 'Default' }}
          </button>
          <div class="h-4 w-px bg-gray-800 shrink-0"></div>
          <h1 class="text-gray-200 font-medium truncate">{{ store.activeSession.title }}</h1>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <!-- View Switcher -->
          <div class="flex items-center bg-gray-900 border border-gray-800 rounded-md p-0.5">
            <button
              @click="store.viewMode = 'terminal'"
              :class="['px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5', store.viewMode === 'terminal' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300']"
            >
              <i class="ph ph-terminal"></i> TUI
            </button>
            <button
              @click="store.viewMode = 'chat'"
              :class="['px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5', store.viewMode === 'chat' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300']"
            >
              <i class="ph ph-chat-teardrop"></i> AI
            </button>
          </div>
          
          <button @click="store.clearDisplay" class="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors" title="Clear View">
            <i class="ph ph-eraser text-lg"></i>
          </button>

          <button v-if="store.cliStatus === 'running'" @click="store.stopCli" class="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Stop CLI">
            <i class="ph ph-stop text-lg"></i>
          </button>
          <button v-else @click="store.startCli" class="p-1.5 text-accent-500 hover:bg-accent-500/10 rounded-md transition-colors" title="Start CLI">
            <i class="ph ph-play text-lg"></i>
          </button>

          <div 
            :class="[
              'flex items-center gap-1.5 ml-2 px-2.5 py-1 border text-xs rounded-full transition-colors',
              store.cliStatus === 'running' ? 'bg-green-500/10 border-green-500/20 text-green-400' 
              : store.cliStatus === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' 
              : 'bg-gray-800 border-gray-700 text-gray-500'
            ]"
          >
            <div :class="['w-1.5 h-1.5 rounded-full', store.cliStatus === 'running' ? 'bg-green-500 animate-pulse' : store.cliStatus === 'error' ? 'bg-red-500' : 'bg-gray-500']"></div>
            {{ store.cliStatus === 'running' ? 'Active' : store.cliStatus === 'error' ? 'Error' : 'Stopped' }}
          </div>
        </div>
      </header>

      <!-- Dynamic View Area -->
      <div class="flex-1 overflow-hidden relative">
        <KeepAlive>
          <TerminalView v-if="store.viewMode === 'terminal'" />
        </KeepAlive>
        
        <!-- ChatBubbleView is not kept alive so it re-mounts/scrolls to bottom cleanly, or kept alive depending on preference -->
        <ChatBubbleView v-if="store.viewMode === 'chat'" />
      </div>
    </template>
  </main>
</template>
