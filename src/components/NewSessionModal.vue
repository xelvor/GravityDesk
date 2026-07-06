<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSessionsStore } from '../stores/sessions';
import { api } from '../services/api';
import { Sparkles, Folder, X, Plus } from 'lucide-vue-next';

const store = useSessionsStore();
const cwd = ref('C:/Users/adscvff/Desktop/xelvor-ai');
const isSubmitting = ref(false);

const title = computed(() => {
  if (!cwd.value) return 'Nowa Sesja Antigravity';
  const parts = cwd.value.split(/[/\\]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'Nowa Sesja Antigravity';
});

const handleSelectFolder = async () => {
  const selected = await api.dialog.selectFolder();
  if (selected) {
    cwd.value = selected;
  }
};

const handleSubmit = async () => {
  if (!title.value.trim() || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    await store.createSession(title.value.trim(), cwd.value.trim() || undefined);
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <Transition name="modal">
    <div
      v-if="store.isNewSessionModalOpen"
      class="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      @click.self="store.isNewSessionModalOpen = false"
    >
      <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-5">
        <!-- Close button -->
        <button
          @click="store.isNewSessionModalOpen = false"
          class="absolute right-4 top-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Header -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles class="w-5 h-5 text-white animate-pulse-slow" />
          </div>
          <div>
            <h3 class="font-display font-bold text-lg text-white">Nowa Sesja CLI</h3>
            <p class="text-xs text-gray-400">Skonfiguruj folder projektu roboczego</p>
          </div>
        </div>

        <!-- Form -->
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-300 mb-1.5">Folder Roboczy (CWD - Project Directory)</label>
            <div class="flex gap-2">
              <input
                v-model="cwd"
                type="text"
                placeholder="C:/ścieżka/do/folderu"
                class="flex-1 bg-gray-950 border border-gray-800 focus:border-indigo-500/60 rounded-xl px-3.5 py-2.5 text-xs font-mono text-gray-300 placeholder-gray-500 focus:outline-none transition-all duration-200 truncate"
              />
              <button
                @click="handleSelectFolder"
                type="button"
                title="Wybierz folder z dysku"
                class="px-3.5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium flex items-center gap-1.5 border border-gray-700/60 transition-colors shrink-0 active:scale-95"
              >
                <Folder class="w-4 h-4 text-indigo-400" />
                <span>Przeglądaj</span>
              </button>
            </div>
            <p class="mt-1 text-[10px] text-gray-500">
              W tym katalogu uruchomi się proces Antigravity CLI i na nim będą wykonywane komendy /commit czy /review.
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-3 pt-2">
          <button
            @click="store.isNewSessionModalOpen = false"
            type="button"
            class="px-4 py-2 rounded-xl bg-transparent hover:bg-gray-800 text-gray-300 text-xs font-medium transition-colors"
          >
            Anuluj
          </button>
          <button
            @click="handleSubmit"
            :disabled="!title.trim() || isSubmitting"
            type="button"
            class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-800 disabled:to-gray-800 text-white disabled:text-gray-500 text-xs font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/25 disabled:shadow-none transition-all active:scale-95"
          >
            <Plus class="w-4 h-4 stroke-[2.5]" />
            <span>{{ isSubmitting ? 'Tworzenie...' : 'Utwórz Sesję' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
