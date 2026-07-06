<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue';
import { useSessionsStore } from '../stores/sessions';

const store = useSessionsStore();
const promptText = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const attachments = ref<File[]>([]);
const imagePreviews = ref(new Map<File, string>());
const isDragging = ref(false);
const fullscreenImage = ref<string | null>(null);
const isModelDropdownOpen = ref(false);

const slashCommands = [
  { cmd: '/commit', label: 'Git Commit', desc: 'Analyze current git diff and generate a concise conventional commit message.' },
  { cmd: '/review', label: 'Code Review', desc: 'Review the current project changes. Focus on bugs, security, maintainability.' },
  { cmd: '/fix ', label: 'Fix Issue', desc: 'Fix this issue in the current project.' },
  { cmd: '/explain ', label: 'Explain File', desc: 'Explain this file in detail.' },
  { cmd: '/tests', label: 'Run Tests', desc: 'Run or suggest the appropriate tests.' },
  { cmd: '/status', label: 'Project Status', desc: 'Check current project status, git status, and summarize.' },
  { cmd: '/model ', label: 'Switch Model', desc: 'Change the active AI model for this session.' },
];

const isModelSlashCommand = computed(() => {
  return promptText.value.startsWith('/model ');
});

const showModelAutocomplete = computed(() => {
  return isModelSlashCommand.value;
});

const filteredModels = computed(() => {
  if (!isModelSlashCommand.value) return [];
  const search = promptText.value.substring('/model '.length).toLowerCase();
  return store.availableModels.filter(m => m.toLowerCase().includes(search));
});

const selectModel = (model: string) => {
  promptText.value = `/model ${model}`;
  handleSend();
};

const insertSlashCommand = (cmdStr: string) => {
  promptText.value = cmdStr;
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus();
      textareaRef.value.setSelectionRange(promptText.value.length, promptText.value.length);
    }
  });
};

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    addFiles(Array.from(target.files));
  }
  target.value = ''; // Reset input
};

const addFiles = (newFiles: File[]) => {
  newFiles.forEach(file => {
    if (file.type.startsWith('image/')) {
      imagePreviews.value.set(file, URL.createObjectURL(file));
    }
  });
  attachments.value = [...attachments.value, ...newFiles];
};

const removeAttachment = (index: number) => {
  const file = attachments.value[index];
  if (imagePreviews.value.has(file)) {
    URL.revokeObjectURL(imagePreviews.value.get(file)!);
    imagePreviews.value.delete(file);
  }
  attachments.value.splice(index, 1);
};

const openFullscreen = (file: File) => {
  if (imagePreviews.value.has(file)) {
    fullscreenImage.value = imagePreviews.value.get(file)!;
  }
};

const closeFullscreen = () => {
  fullscreenImage.value = null;
};

const handleSend = async () => {
  if ((!promptText.value.trim() && attachments.value.length === 0) || !store.activeSessionId) return;
  
  let textToSend = promptText.value;
  if (attachments.value.length > 0) {
    const api = (window as any).api;
    textToSend += '\n\nAttached files:\n' + attachments.value.map(f => {
      const path = api?.utils?.getFilePath ? api.utils.getFilePath(f) : ((f as any).path || f.name);
      return `- ${path}`;
    }).join('\n');
  }
  
  const sentText = textToSend.trim();
  promptText.value = '';
  attachments.value.forEach(file => {
    if (imagePreviews.value.has(file)) {
      URL.revokeObjectURL(imagePreviews.value.get(file)!);
      imagePreviews.value.delete(file);
    }
  });
  attachments.value = [];
  adjustHeight();
  
  if (sentText.startsWith('/model ')) {
    const newModel = sentText.substring('/model '.length).trim();
    if (store.activeSessionId) {
      store.sessionModels[store.activeSessionId] = newModel;
    }
  }
  
  await store.sendPrompt(textToSend);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};

const adjustHeight = () => {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = 'auto';
  textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 160)}px`;
};

// Drag and Drop Logic
const handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  if (e.dataTransfer?.types.includes('Files')) {
    isDragging.value = true;
  }
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  if (e.dataTransfer?.types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy';
  }
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  // Ensure we only hide if we are leaving the window, not a child element
  if (!e.relatedTarget || (e.relatedTarget as HTMLElement).nodeName === 'HTML') {
    isDragging.value = false;
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    addFiles(Array.from(e.dataTransfer.files));
  }
};

onMounted(() => {
  window.addEventListener('dragenter', handleDragEnter);
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('drop', handleDrop);
});

onUnmounted(() => {
  window.removeEventListener('dragenter', handleDragEnter);
  window.removeEventListener('dragover', handleDragOver);
  window.removeEventListener('dragleave', handleDragLeave);
  window.removeEventListener('drop', handleDrop);
});

watch(promptText, () => {
  nextTick(() => adjustHeight());
});
</script>

<template>
  <div v-if="store.activeSession" class="w-full px-4 md:px-10 lg:px-20 pb-6 bg-gray-950 pt-2 shrink-0 select-none border-t border-gray-900/50">
    <div class="max-w-4xl w-full mx-auto relative group">
      
      <!-- Quick Actions / Slash Commands Above Input -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none opacity-50 hover:opacity-100 transition-opacity">
        <span class="text-[10px] uppercase font-bold tracking-wider text-gray-500 mr-1 shrink-0 flex items-center gap-1">
          <i class="ph ph-magic-wand text-gray-400"></i>
          <span>Quick:</span>
        </span>
        <button
          v-for="item in slashCommands"
          :key="item.cmd"
          @click="insertSlashCommand(item.cmd)"
          :title="item.desc"
          class="px-2.5 py-1 rounded border border-gray-800 hover:border-gray-600 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-200 text-[10px] font-mono transition-colors shrink-0 flex items-center gap-1.5"
        >
          <span class="font-bold text-accent-500">{{ item.cmd.trim() }}</span>
          <span class="font-sans hidden sm:inline">{{ item.label }}</span>
        </button>
      </div>

      <!-- Input Box -->
      <div class="bg-gray-900 border border-gray-700 focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500 rounded-xl shadow-input transition-all duration-200 relative">
        
        <!-- Autocomplete Dropdown -->
        <div v-if="showModelAutocomplete" class="absolute bottom-full left-0 mb-2 w-full max-w-sm bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-50 animate-fade-in">
          <div class="px-3 py-2 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><i class="ph ph-zap text-accent-500"></i> Select AI Model</span>
          </div>
          <ul class="max-h-48 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            <li v-for="model in filteredModels" :key="model" 
                @click="selectModel(model)"
                class="px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-md cursor-pointer transition-colors flex items-center gap-2"
            >
              <i class="ph ph-cube text-gray-500"></i>
              {{ model }}
            </li>
            <li v-if="filteredModels.length === 0" class="px-3 py-3 text-sm text-gray-500 text-center italic">
              Brak pasujących modeli
            </li>
          </ul>
        </div>
        
        <!-- Attachments Preview -->
        <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 px-3 pt-3">
          <div v-for="(file, index) in attachments" :key="index" class="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-md pl-2.5 pr-1.5 py-1 text-xs text-gray-300 relative group overflow-hidden">
            <img v-if="imagePreviews.has(file)" @click="openFullscreen(file)" :src="imagePreviews.get(file)" class="w-5 h-5 object-cover rounded-sm border border-gray-700 cursor-zoom-in hover:brightness-110 transition-all" />
            <i v-else class="ph ph-file flex-shrink-0 text-gray-400"></i>
            <span class="truncate max-w-[150px]" :title="(file as any).path">{{ file.name }}</span>
            <button @click="removeAttachment(index)" class="hover:bg-gray-700 p-0.5 rounded transition-colors text-gray-500 hover:text-gray-200 ml-1">
              <i class="ph ph-x"></i>
            </button>
          </div>
        </div>

        <div class="flex px-3 py-3">
          <textarea
            ref="textareaRef"
            v-model="promptText"
            @keydown="handleKeyDown"
            class="w-full bg-transparent border-none outline-none resize-none text-[15px] text-gray-200 placeholder-gray-500 max-h-40 min-h-[44px]"
            placeholder="Ask Antigravity to build or explain something..."
            rows="1"
          ></textarea>
        </div>
        
        <!-- Action Bar -->
        <div class="flex items-center justify-between px-3 pb-2 pt-1 border-t border-gray-800/50 mt-1">
          <div class="flex items-center gap-1 mt-1.5">
            <input type="file" ref="fileInputRef" @change="handleFileChange" multiple class="hidden" />
            <button @click="fileInputRef?.click()" class="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors text-xs flex items-center gap-1.5 font-medium">
              <i class="ph ph-paperclip"></i> Attach
            </button>
            <button @click="store.viewMode = 'terminal'" class="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors text-xs flex items-center gap-1.5 font-medium ml-1">
              <i class="ph ph-terminal-window"></i> Terminal
            </button>
          </div>
          <div class="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
            <div 
              v-if="store.activeSessionId" 
              class="relative"
            >
              <div
                @click="isModelDropdownOpen = !isModelDropdownOpen"
                class="flex items-center px-2 py-1 bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700 rounded-md text-accent-500 font-medium shadow-sm cursor-pointer"
                title="Click to change model"
              >
                <i class="ph ph-cube mr-1.5"></i>
                <span class="pr-4">{{ store.sessionModels[store.activeSessionId] || 'Wybierz model' }}</span>
                <i class="ph ph-caret-down absolute right-2 text-[10px]"></i>
              </div>
              
              <!-- Full screen overlay to close dropdown -->
              <div v-if="isModelDropdownOpen" @click="isModelDropdownOpen = false" class="fixed inset-0 z-40"></div>
              
              <!-- Custom Dropdown Menu -->
              <div v-if="isModelDropdownOpen" class="absolute bottom-[calc(100%+8px)] left-0 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <button
                  v-for="m in store.availableModels"
                  :key="m"
                  @click="() => {
                    store.sendPrompt('/model ' + m);
                    store.sessionModels[store.activeSessionId!] = m;
                    isModelDropdownOpen = false;
                  }"
                  class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                  :class="{ 'bg-gray-700/50 text-accent-400': store.sessionModels[store.activeSessionId] === m }"
                >
                  <i class="ph ph-check" :class="{ 'opacity-0': store.sessionModels[store.activeSessionId] !== m }"></i>
                  {{ m }}
                </button>
              </div>
            </div>
            <span>Use <kbd class="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono text-[10px]">Enter</kbd> to send</span>
            <button
              v-if="store.isCliProcessing && !promptText.trim() && attachments.length === 0"
              @click="store.stopCli"
              class="w-8 h-8 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
              title="Stop CLI"
            >
              <i class="ph ph-stop font-bold text-sm"></i>
            </button>
            <button 
              v-else
              @click="handleSend"
              class="w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors border border-gray-700"
            >
              <i class="ph ph-paper-plane-right font-bold text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Global Drag and Drop Overlay -->
  <Teleport to="body">
    <div v-if="isDragging" class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/80 backdrop-blur-md pointer-events-none transition-all duration-200 p-8">
      <div class="w-full h-full border-4 border-dashed border-accent-500/50 rounded-3xl flex flex-col items-center justify-center animate-pulse shadow-[0_0_100px_rgba(var(--color-accent-500),0.2)]">
        <div class="bg-gray-900/50 p-8 rounded-full mb-6">
          <i class="ph ph-file-arrow-down text-7xl text-accent-400 drop-shadow-[0_0_15px_rgba(var(--color-accent-400),0.5)]"></i>
        </div>
        <h2 class="text-3xl font-bold text-gray-100 tracking-tight">Drop files here</h2>
        <p class="text-gray-400 mt-2 text-lg">Attach images, PDFs, code files, or anything else</p>
      </div>
    </div>
  </Teleport>

  <!-- Fullscreen Image Modal -->
  <Teleport to="body">
    <div v-if="fullscreenImage" @click="closeFullscreen" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out p-4 md:p-10 transition-all">
      <button @click.stop="closeFullscreen" class="absolute top-6 right-6 w-12 h-12 bg-gray-900/50 hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors">
        <i class="ph ph-x text-2xl"></i>
      </button>
      <img :src="fullscreenImage" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl" @click.stop />
    </div>
  </Teleport>
</template>
