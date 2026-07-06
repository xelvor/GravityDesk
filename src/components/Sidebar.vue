<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSessionsStore } from '../stores/sessions';
import logoUrl from '../assets/logo.jpg';

const store = useSessionsStore();
const searchQuery = ref('');

const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) return store.sessions;
  const q = searchQuery.value.toLowerCase();
  return store.sessions.filter(
    (s) => s.title.toLowerCase().includes(q) || (s.cwd && s.cwd.toLowerCase().includes(q))
  );
});

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};
</script>

<template>
  <aside 
    class="bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0 select-none transition-all duration-300 ease-in-out overflow-hidden"
    :class="store.isSidebarOpen ? 'w-64' : 'w-14'"
  >
    <div class="flex flex-col h-full min-w-[3.5rem] w-full">
      <!-- Header / Workspace -->
      <div class="h-14 flex items-center border-b border-gray-800 transition-all duration-300" :class="store.isSidebarOpen ? 'px-4 justify-between' : 'justify-center'">
        <div class="flex items-center text-gray-200 font-medium cursor-pointer transition-colors" :class="store.isSidebarOpen ? 'gap-2' : ''">
          <button 
            @click.stop="store.isSidebarOpen = !store.isSidebarOpen"
            class="w-6 h-6 rounded bg-gradient-to-br from-gray-700 to-gray-800 border border-gray-600 flex items-center justify-center text-xs shrink-0 hover:border-gray-400 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
            title="Toggle Sidebar"
          >
            <i class="ph ph-sidebar-simple"></i>
          </button>
          <img v-show="store.isSidebarOpen" :src="logoUrl" alt="GravityDesk" class="w-5 h-5 rounded border border-gray-800 shadow" />
          <span v-show="store.isSidebarOpen" class="whitespace-nowrap transition-opacity duration-300" :class="store.isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0'">GravityDesk</span>
        </div>
      </div>

      <!-- Search / New -->
      <div class="p-3 transition-all duration-300" :class="!store.isSidebarOpen ? 'px-2' : ''">
        <button
          @click="store.isNewSessionModalOpen = true"
          class="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-md py-1.5 flex items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
          :class="store.isSidebarOpen ? 'px-3 gap-2' : 'px-0'"
          :title="!store.isSidebarOpen ? 'New Session' : ''"
        >
          <i class="ph ph-plus font-bold"></i>
          <span v-show="store.isSidebarOpen" class="text-sm font-medium whitespace-nowrap">New Session</span>
        </button>
        
        <!-- Optional minimalist search -->
        <div v-show="store.isSidebarOpen" class="relative mt-2 transition-opacity duration-300" :class="store.isSidebarOpen ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'">
          <i class="ph ph-magnifying-glass text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search..."
            class="w-full bg-gray-950 border border-gray-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
          />
        </div>
      </div>

      <!-- Sessions List -->
      <div class="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-0.5 relative no-scrollbar">
        <div v-show="store.isSidebarOpen" class="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2 mt-2 whitespace-nowrap">Recent</div>
        
        <div v-if="filteredSessions.length === 0" class="text-center py-6 px-4 text-gray-500 text-xs">
          <i class="ph ph-terminal-window text-2xl mb-2 opacity-50 block mx-auto"></i>
          <p v-show="store.isSidebarOpen">No active sessions found.</p>
        </div>

        <TransitionGroup name="list" tag="div" class="flex flex-col gap-0.5">
          <button
            v-for="s in filteredSessions"
            :key="s.id"
            @click="store.selectSession(s.id)"
            :title="!store.isSidebarOpen ? s.title : ''"
            :class="[
              'w-full text-left py-1.5 rounded-md flex items-center group transition-colors overflow-hidden',
              store.isSidebarOpen ? 'px-2 justify-between' : 'justify-center',
              store.activeSessionId === s.id 
                ? 'bg-gray-800 text-gray-200 shadow-sm' 
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-300'
            ]"
          >
            <div class="flex items-center gap-2 overflow-hidden flex-1" :class="store.isSidebarOpen ? 'pr-2' : 'justify-center'">
              <i 
                class="ph ph-chat-teardrop shrink-0"
                :class="store.activeSessionId === s.id ? 'text-accent-500' : 'text-gray-500'"
              ></i>
              <div v-show="store.isSidebarOpen" class="flex flex-col overflow-hidden">
                <span class="truncate text-sm font-medium leading-none">{{ s.title }}</span>
                <span class="truncate text-[10px] text-gray-500 mt-1" v-if="store.activeSessionId !== s.id">{{ formatDate(s.created_at) }}</span>
              </div>
            </div>
            <div 
              v-show="store.isSidebarOpen"
              class="flex items-center gap-1 transition-opacity text-gray-400 shrink-0"
              :class="store.activeSessionId === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            >
              <button @click.stop="store.deleteSession(s.id)" class="p-1 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </button>
        </TransitionGroup>
      </div>
      
      <!-- Footer -->
      <div class="p-3 border-t border-gray-800 flex" :class="!store.isSidebarOpen ? 'justify-center px-2' : ''">
        <button 
          @click="store.isSettingsModalOpen = true"
          class="w-full text-left py-1.5 rounded-md text-gray-400 hover:bg-gray-800 hover:text-gray-300 flex items-center transition-colors overflow-hidden"
          :class="store.isSidebarOpen ? 'px-2 gap-2' : 'justify-center'"
          :title="!store.isSidebarOpen ? 'Settings' : ''"
        >
          <i class="ph ph-gear shrink-0 text-lg"></i>
          <span v-show="store.isSidebarOpen" class="text-sm whitespace-nowrap">Settings</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.2s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* hide scrollbar for cleaner mini look */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
