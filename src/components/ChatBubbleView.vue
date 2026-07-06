<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useSessionsStore } from '../stores/sessions';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { parseTerminalToCleanMarkdown } from '../utils/terminalParser';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

const store = useSessionsStore();
const scrollContainer = ref<HTMLElement | null>(null);

const expandedThoughts = ref<Record<string, boolean>>({});

const toggleThought = (msgId: string, idx: number) => {
  const key = `${msgId}_${idx}`;
  expandedThoughts.value[key] = !expandedThoughts.value[key];
};

const isThoughtExpanded = (msgId: string, idx: number) => {
  return expandedThoughts.value[`${msgId}_${idx}`] === true;
};

// Strip ANSI color codes and terminal noise from raw output for clean chat display
const cleanText = (text: string): string => {
  if (!text) return '';
  return parseTerminalToCleanMarkdown(text);
};

// Render safe HTML markdown
const renderMarkdown = (content: string): string => {
  const cleaned = cleanText(content);
  // Add custom rendering for code blocks to inject Mac-style headers
  const renderer = new marked.Renderer();
  renderer.code = ({ text: code, lang: language }: any) => {
    let highlighted = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(code, { language }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }

    return `
      <div class="rounded-lg overflow-hidden border border-gray-800 bg-[#0d0d0d] my-4 shadow-sm">
        <div class="code-header flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border-b border-gray-800">
          <div class="flex items-center gap-3">
            <div class="flex gap-1.5">
              <div class="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
              <div class="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
              <div class="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
            </div>
            <span class="text-xs font-mono text-gray-400">${language || 'code'}</span>
          </div>
          <button class="text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 text-xs" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code)}')); this.innerHTML = '<i class=\\'ph ph-check text-green-500\\'></i> Copied!'; setTimeout(() => { this.innerHTML = '<i class=\\'ph ph-copy\\'></i> Copy'; }, 2000)">
            <i class="ph ph-copy"></i> Copy
          </button>
        </div>
        <div class="p-4 overflow-x-auto bg-[#0d0d0d]">
          <pre class="font-mono text-sm leading-relaxed text-gray-300 hljs !bg-transparent !p-0"><code>${DOMPurify.sanitize(highlighted)}</code></pre>
        </div>
      </div>
    `;
  };
  marked.use({ renderer });
  
  const rawHtml = marked.parse(cleaned) as string;
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['onclick'] });
};

const formatTime = (isoString?: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Auto scroll to bottom on new messages
watch(() => store.messages.length, () => {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  });
});

const extractAttachments = (text: string) => {
  if (!text) return { mainText: '', files: [] };
  const marker = 'Attached files:\n';
  const idx = text.indexOf(marker);
  if (idx !== -1) {
    const mainText = text.slice(0, idx).trim();
    const filesPart = text.slice(idx + marker.length);
    const files = filesPart.split('\n').map((l: string) => l.replace(/^- /, '').trim()).filter(Boolean);
    return { mainText, files };
  }
  
  // Also support double newline marker
  const marker2 = '\n\nAttached files:\n';
  const idx2 = text.indexOf(marker2);
  if (idx2 !== -1) {
    const mainText = text.slice(0, idx2).trim();
    const filesPart = text.slice(idx2 + marker2.length);
    const files = filesPart.split('\n').map((l: string) => l.replace(/^- /, '').trim()).filter(Boolean);
    return { mainText, files };
  }
  
  return { mainText: text, files: [] };
};

const getFileName = (path: string) => {
  if (!path) return '';
  return path.split(/[/\\]/).pop() || path;
};

const isImage = (path: string) => {
  return path.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) !== null;
};
</script>

<template>
  <div 
    ref="scrollContainer"
    class="absolute inset-0 overflow-y-auto px-4 md:px-10 lg:px-20 py-8 flex flex-col gap-8 pb-4 bg-gray-950 scroll-smooth"
  >
    <!-- Empty Chat State -->
    <div v-if="store.messages.filter(m => m.role === 'user' || cleanText(m.content).trim() !== '').length === 0" class="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
      <div class="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center shadow-sm mb-4">
        <i class="ph ph-chat-teardrop text-3xl text-gray-400"></i>
      </div>
      <h3 class="font-medium text-gray-300 mb-1">Czyste Konto</h3>
      <p class="text-sm max-w-sm mx-auto">
        Rozpocznij konwersację. Wyślij prompt poniżej, aby poprosić Antigravity CLI o pomoc.
      </p>
    </div>

    <TransitionGroup name="chat" tag="div" class="flex flex-col gap-8 max-w-4xl w-full mx-auto">
      <div
        v-for="(msg, index) in store.messages"
        :key="msg.role === 'user' ? 'user_' + index : (msg.id || index)"
      >
        <template v-if="msg.role === 'user' || cleanText(msg.content).trim() !== ''">
          
          <!-- USER MESSAGE -->
          <div v-if="msg.role === 'user'" class="group flex gap-4 w-full">
            <!-- Avatar -->
            <div class="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 mt-1">
              <i class="ph ph-user text-gray-400 text-sm"></i>
            </div>
            <!-- Content -->
            <div class="flex-1 space-y-1">
              <div class="text-xs font-medium text-gray-400 flex items-center gap-2">
                You
                <span class="text-gray-600 font-normal">{{ formatTime(msg.created_at) }}</span>
              </div>
              <div class="text-gray-200 leading-relaxed text-[15px] whitespace-pre-wrap break-words font-sans select-text">
                {{ extractAttachments(msg.content).mainText }}
              </div>
              <div v-if="extractAttachments(msg.content).files.length > 0" class="flex flex-wrap gap-2 mt-2">
                <div v-for="file in extractAttachments(msg.content).files" :key="file" class="relative group">
                  <img v-if="isImage(file)" :src="'local-asset://' + file.replace(/\\/g, '/')" class="max-w-[200px] max-h-[150px] object-cover rounded-lg border border-gray-700 shadow-sm" />
                  <div v-else class="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300">
                    <i class="ph ph-file"></i>
                    <span class="truncate max-w-[200px]" :title="file">{{ getFileName(file) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ASSISTANT MESSAGE -->
          <div v-else-if="msg.role === 'assistant'" class="group flex gap-4 w-full">
            <!-- Avatar -->
            <div class="w-7 h-7 rounded bg-accent-500/10 border border-accent-500/20 flex items-center justify-center shrink-0 mt-1">
              <i class="ph ph-magic-wand text-accent-500 text-sm"></i>
            </div>
            <!-- Content -->
            <div class="flex-1 space-y-2 w-full max-w-full overflow-hidden">
              <div class="text-xs font-medium text-gray-400 flex items-center gap-2">
                Antigravity
                <span class="text-gray-600 font-normal">{{ formatTime(msg.created_at) }}</span>
              </div>
              
              <!-- Thoughts -->
              <div v-if="(msg.thoughts && msg.thoughts.length > 0) || (msg.tool_calls && msg.tool_calls.length > 0)" class="mb-4 space-y-3">
                <div v-for="(thought, idx) in msg.thoughts || []" :key="'t_'+idx" class="group">
                  <button @click="toggleThought(msg.id || '', idx)" class="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-[13px] font-medium transition-colors w-full text-left">
                    <div class="w-5 h-5 flex items-center justify-center rounded bg-gray-900 border border-gray-800 text-gray-400 group-hover:bg-gray-800 transition-colors">
                      <i class="ph ph-caret-right text-[10px] transition-transform duration-200" :class="{ 'rotate-90': isThoughtExpanded(msg.id || '', idx) }"></i>
                    </div>
                    <i class="ph ph-brain text-accent-500 text-sm"></i>
                    Thought {{ thought.duration }}
                  </button>
                  <div class="expand-grid" :class="{ 'expanded': isThoughtExpanded(msg.id || '', idx) }">
                    <div class="expand-grid-inner">
                      <div class="mt-2 ml-[9px] pl-5 border-l-2 border-gray-800/50 text-gray-400 text-[13px] leading-relaxed">
                         <div class="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-[13px] prose-p:text-gray-400 prose-a:text-accent-500 prose-strong:text-gray-300 prose-code:text-gray-300 font-mono" v-html="renderMarkdown(thought.text)"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="msg.tool_calls && msg.tool_calls.length > 0" class="flex items-center gap-2 text-gray-500 text-xs font-mono px-1">
                  <i class="ph ph-wrench"></i> Calling tools: {{ msg.tool_calls.map((t: any) => t.toolName || t.name || 'tool').join(', ') }}
                </div>
              </div>

              <div
                v-if="msg.content"
                class="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-[15px] prose-p:text-gray-300 prose-a:text-accent-500 prose-strong:text-gray-200 prose-code:text-accent-400 prose-code:bg-gray-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:border-gray-800 prose-code:border break-words w-full select-text"
                v-html="renderMarkdown(msg.content)"
              ></div>
            </div>
          </div>

          <!-- SYSTEM MESSAGE -->
          <div v-else class="flex justify-center w-full my-2">
            <div class="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-xs flex items-center gap-2 max-w-2xl text-center shadow-sm">
              <i class="ph ph-warning-circle text-lg"></i>
              <span class="font-medium whitespace-pre-wrap select-text">{{ msg.content }}</span>
            </div>
          </div>

        </template>
      </div>

      <!-- Live Assistant Status Indicator -->
      <div v-if="store.isCliProcessing" key="live-indicator" class="flex gap-4 w-full animate-pulse mt-2">
        <div class="w-7 h-7 rounded bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0 mt-1">
          <i class="ph ph-circle-notch animate-spin text-gray-500"></i>
        </div>
        <div class="flex-1 space-y-1 py-1">
          <div class="text-xs font-mono text-gray-500 flex items-center gap-2">
            <span class="text-accent-500">▶</span>
            {{ store.liveActivityText || 'Analyzing and generating thoughts...' }}
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.chat-enter-active,
.chat-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.chat-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.chat-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Base scrollbar styles for ChatView */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #2a2a2a;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #444444;
}

:deep(.prose pre) {
  margin: 0;
  padding: 0;
  background: transparent !important;
}

/* Custom details animations */
:deep(details > summary::-webkit-details-marker) {
  display: none;
}
:deep(.details-anim[open] .details-content) {
  animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes slideDown {
  0% {
    opacity: 0;
    transform: translateY(-8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.expand-grid {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.expand-grid.expanded {
  grid-template-rows: 1fr;
}
.expand-grid-inner {
  overflow: hidden;
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
}
.expand-grid.expanded .expand-grid-inner {
  opacity: 1;
}
</style>
