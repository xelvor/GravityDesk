<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useSessionsStore } from './stores/sessions';
import Sidebar from './components/Sidebar.vue';
import ChatArea from './components/ChatArea.vue';
import ChatInput from './components/ChatInput.vue';
import NewSessionModal from './components/NewSessionModal.vue';
import SettingsModal from './components/SettingsModal.vue';

const store = useSessionsStore();

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey) {
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      store.isNewSessionModalOpen = true;
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      store.isSidebarOpen = !store.isSidebarOpen;
    } else if (e.key === '`') {
      e.preventDefault();
      store.viewMode = store.viewMode === 'chat' ? 'terminal' : 'chat';
    } else if (e.key === ',') {
      e.preventDefault();
      store.isSettingsModalOpen = !store.isSettingsModalOpen;
    }
  }
};

onMounted(async () => {
  store.setupListeners();
  await store.loadSessions();
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>

<template>
  <div class="h-screen w-screen flex bg-gray-950 text-gray-200 font-sans antialiased overflow-hidden select-none relative">
    <!-- Left Sidebar -->
    <Sidebar />

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col h-full min-w-0 bg-gray-950 relative">
      <ChatArea />
      <ChatInput />
    </div>

    <!-- Modals -->
    <NewSessionModal />
    <SettingsModal />

    <!-- Global Loading Overlay -->
    <div v-if="store.isLoading" class="absolute inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <div class="w-10 h-10 border-2 border-accent-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs font-mono text-gray-400">Loading Antigravity Engine...</span>
      </div>
    </div>
  </div>
</template>
