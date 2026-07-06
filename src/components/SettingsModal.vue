<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useSessionsStore } from '../stores/sessions';
import { X, Sliders, Palette, Monitor, Keyboard, Zap, Info } from 'lucide-vue-next';
import logoUrl from '../assets/logo.jpg';

const store = useSessionsStore();
const activeTab = ref('general');
const accounts = ref<any[]>([]);
const isAddingAccount = ref(false);
const refreshingAccountId = ref<string | null>(null);
const newAccountJson = ref('');
const isShowingAddInput = ref(false);
const expandedAccounts = ref<Record<string, boolean>>({});

const loadAccounts = async () => {
  accounts.value = await (window as any).api.accounts.list();
};

watch(activeTab, (val) => {
  if (val === 'accounts') loadAccounts();
});

const toggleAccountExpand = (id: string) => {
  expandedAccounts.value[id] = !expandedAccounts.value[id];
};

const formatModelName = (name: string | number) => {
  return String(name).replace('models/', '').replace(/-/g, ' ').toUpperCase();
};

const formatResetTime = (isoString: string) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  } catch (e) {
    return isoString;
  }
};

const addAccount = async () => {
  if (!newAccountJson.value) return;
  
  try {
    const accData = JSON.parse(newAccountJson.value);
    const name = accData.name || accData.email || 'New Account';
    
    isAddingAccount.value = true;
    const res = await (window as any).api.accounts.add({ name, payload: newAccountJson.value });
    if (res.success) {
      await loadAccounts();
      alert('Account added successfully and saved to database!');
      isShowingAddInput.value = false;
      newAccountJson.value = '';
    } else {
      alert('Error adding account: ' + res.error);
    }
  } catch (e: any) {
    alert('Invalid JSON format: ' + e.message);
  } finally {
    isAddingAccount.value = false;
  }
};

const loginWithGoogle = async () => {
  isAddingAccount.value = true;
  try {
    const res = await (window as any).api.accounts.oauth();
    if (res.success) {
      await loadAccounts();
      alert('Logged in successfully via Google and added account: ' + res.account.name);
    } else {
      alert('OAuth login error: ' + res.error);
    }
  } catch (e: any) {
    alert('An error occurred during login: ' + e.message);
  } finally {
    isAddingAccount.value = false;
  }
};

const deleteAccount = async (id: string) => {
  if (confirm('Are you sure you want to delete this account?')) {
    await (window as any).api.accounts.delete(id);
    await loadAccounts();
  }
};

const switchAccount = async (id: string) => {
  isAddingAccount.value = true;
  try {
    await (window as any).api.accounts.switch(id);
    await loadAccounts();
  } catch (e: any) {
    alert('Error switching account: ' + e.message);
  } finally {
    isAddingAccount.value = false;
  }
};

const refreshAccount = async (id: string) => {
  refreshingAccountId.value = id;
  try {
    const res = await (window as any).api.accounts.refresh(id);
    if (res && !res.success) {
      alert('Error refreshing account: ' + res.error);
    } else {
      await loadAccounts();
    }
  } catch (e: any) {
    alert('Error refreshing account: ' + e.message);
  } finally {
    refreshingAccountId.value = null;
  }
};

const openExternalLink = (url: string) => {
  (window as any).api.utils.openExternal(url);
};

const closeSettings = () => {
  store.isSettingsModalOpen = false;
};

onMounted(() => {
  loadAccounts();
});
</script>

<template>
  <Transition name="modal">
    <div
      v-if="store.isSettingsModalOpen"
      class="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      @click.self="closeSettings"
    >
      <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
        <!-- Header -->
        <div class="h-16 border-b border-gray-800 flex items-center justify-between px-6 shrink-0 bg-gray-900/50 backdrop-blur-md">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shadow-sm">
              <Sliders class="w-4 h-4 text-gray-300" />
            </div>
            <h3 class="font-medium text-lg text-white tracking-tight">Settings</h3>
          </div>
          <button
            @click="closeSettings"
            class="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- Sidebar -->
          <div class="w-56 border-r border-gray-800 p-4 flex flex-col gap-1.5 bg-gray-950/30 overflow-y-auto shrink-0">
            <button 
              @click="activeTab = 'general'"
              :class="['w-full text-left px-3 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2.5 transition-colors', activeTab === 'general' ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700/50' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent']"
            >
              <Monitor class="w-4 h-4" :class="activeTab === 'general' ? 'text-accent-500' : ''" /> General
            </button>
            <button 
              @click="activeTab = 'accounts'"
              :class="['w-full text-left px-3 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2.5 transition-colors', activeTab === 'accounts' ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700/50' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent']"
            >
              <i class="ph ph-users w-4 h-4 text-base" :class="activeTab === 'accounts' ? 'text-accent-500' : ''"></i> Accounts
            </button>
            <button 
              @click="activeTab = 'appearance'"
              :class="['w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors', activeTab === 'appearance' ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700/50 font-medium' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent']"
            >
              <Palette class="w-4 h-4" :class="activeTab === 'appearance' ? 'text-accent-500' : ''" /> Appearance
            </button>
            <button 
              @click="activeTab = 'shortcuts'"
              :class="['w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors', activeTab === 'shortcuts' ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700/50 font-medium' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent']"
            >
              <Keyboard class="w-4 h-4" :class="activeTab === 'shortcuts' ? 'text-accent-500' : ''" /> Shortcuts
            </button>
            <button 
              @click="activeTab = 'ai'"
              :class="['w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors', activeTab === 'ai' ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700/50 font-medium' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent']"
            >
              <Zap class="w-4 h-4" :class="activeTab === 'ai' ? 'text-accent-500' : ''" /> AI Model
            </button>
            <div class="mt-auto">
              <button 
                @click="activeTab = 'about'"
                :class="['w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors mt-4', activeTab === 'about' ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700/50 font-medium' : 'text-gray-500 hover:text-gray-300 border border-transparent']"
              >
                <Info class="w-4 h-4" :class="activeTab === 'about' ? 'text-accent-500' : ''" /> About
              </button>
            </div>
          </div>

          <!-- Content Area -->
          <div class="flex-1 overflow-y-auto p-8 bg-gray-900">
            <div class="max-w-2xl">
              
              <!-- TAB: GENERAL -->
              <div v-show="activeTab === 'general'" class="space-y-10 animate-fade-in">
                <section>
                  <h4 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">CLI Integration</h4>
                  
                  <div class="space-y-4">
                    <div class="flex items-center justify-between p-5 rounded-xl border border-gray-800 bg-gray-950/50">
                      <div>
                        <p class="text-base font-medium text-gray-200">Antigravity CLI Path</p>
                        <p class="text-sm text-gray-500 mt-1">Uses the default environment variable from the system.</p>
                      </div>
                      <div class="px-2.5 py-1.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-mono font-medium tracking-wide">
                        Detected (v2.0)
                      </div>
                    </div>

                    <div class="flex items-center justify-between p-5 rounded-xl border border-gray-800 bg-gray-950/50">
                      <div>
                        <p class="text-base font-medium text-gray-200">Working Directory (Default)</p>
                        <p class="text-sm text-gray-500 mt-1">C:/Users/adscvff/Desktop/xelvor-ai</p>
                      </div>
                      <button class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 font-medium transition-colors border border-gray-700 active:scale-95">
                        Change
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Behavior</h4>
                  
                  <div class="space-y-5">
                    <label class="flex items-start gap-4 cursor-pointer group">
                      <div class="relative flex items-center mt-0.5">
                        <input type="checkbox" checked class="peer sr-only" />
                        <div class="w-11 h-6 bg-gray-800 rounded-full peer peer-checked:bg-accent-600 transition-colors border border-gray-700 shadow-inner"></div>
                        <div class="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-transform shadow-md"></div>
                      </div>
                      <div>
                        <p class="text-base font-medium text-gray-200 group-hover:text-white transition-colors">Auto-refresh session list</p>
                        <p class="text-sm text-gray-500 mt-1">Fetch history in the background when new logs appear in the database.</p>
                      </div>
                    </label>

                    <label class="flex items-start gap-4 cursor-pointer group">
                      <div class="relative flex items-center mt-0.5">
                        <input type="checkbox" checked class="peer sr-only" />
                        <div class="w-11 h-6 bg-gray-800 rounded-full peer peer-checked:bg-accent-600 transition-colors border border-gray-700 shadow-inner"></div>
                        <div class="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-transform shadow-md"></div>
                      </div>
                      <div>
                        <p class="text-base font-medium text-gray-200 group-hover:text-white transition-colors">Remember last view (Chat/TUI)</p>
                        <p class="text-sm text-gray-500 mt-1">Restores preferred layout after application restart.</p>
                      </div>
                    </label>
                  </div>
                </section>
              </div>

              <!-- TAB: ACCOUNTS -->
              <div v-show="activeTab === 'accounts'" class="space-y-8 animate-fade-in">
                <section>
                  <div class="flex items-center justify-between mb-5">
                    <h4 class="text-xs font-bold text-gray-500 uppercase tracking-widest">API Accounts</h4>
                    <div class="mt-6 flex flex-col items-center">
                      <button @click="loginWithGoogle" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2 shadow-lg" :disabled="isAddingAccount">
                        <i class="ph ph-google-logo text-lg"></i>
                        Sign in with Google (OAuth)
                      </button>
                      
                      <button v-if="!isShowingAddInput" @click="isShowingAddInput = true" class="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors" :disabled="isAddingAccount">
                        Or paste token manually (JSON)
                      </button>
                    </div>
                    <div v-if="isShowingAddInput" class="w-full flex flex-col gap-3 p-4 bg-gray-950/50 rounded-xl border border-gray-800 mt-4">
                      <h4 class="text-sm font-medium text-gray-200">Paste account configuration (JSON) from accounts.json</h4>
                      <textarea v-model="newAccountJson" class="w-full h-32 bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-200 text-xs font-mono resize-none focus:outline-none focus:border-accent-500" placeholder='{"name": "My Account", "token": {"access_token": "...", "refresh_token": "..."}}'></textarea>
                      <div class="flex justify-end gap-2 mt-2">
                        <button @click="isShowingAddInput = false; newAccountJson = ''" class="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors">Cancel</button>
                        <button @click="addAccount" class="px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors disabled:opacity-50" :disabled="!newAccountJson || isAddingAccount">Save Account</button>
                      </div>
                    </div>
                  </div>
                  
                  <div class="space-y-3">
                    <div v-if="accounts.length === 0" class="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl">
                      No connected accounts.
                    </div>
                    <div 
                      v-for="acc in accounts" 
                      :key="acc.id"
                      class="flex flex-col p-4 rounded-xl border border-gray-800 bg-gray-950/50"
                      :class="{ 'border-accent-500/50 bg-accent-900/10': acc.isCurrent }"
                    >
                      <!-- Main row -->
                      <div class="flex items-center justify-between w-full">
                        <div class="flex flex-col gap-1 w-full max-w-sm">
                          <div class="flex items-center gap-2 flex-wrap">
                            <p class="text-sm font-medium text-gray-200">{{ acc.name }}</p>
                            <span 
                              v-if="acc.isCurrent" 
                              class="px-2 py-0.5 rounded bg-accent-500/10 border border-accent-500/20 text-accent-400 text-[10px] font-mono font-medium tracking-wide uppercase"
                            >Active</span>
                            <span 
                              v-if="acc.status === 'active' && !acc.isCurrent" 
                              class="px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-mono font-medium tracking-wide uppercase"
                            >Available</span>
                            <span 
                              v-else-if="acc.status === 'unverified'" 
                              class="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono font-medium tracking-wide uppercase"
                              title="Needs verification in browser."
                            >Needs Verification</span>
                            <span 
                              v-else-if="acc.status === 'rate_limited'" 
                              class="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono font-medium tracking-wide uppercase"
                              title="Rate limit reached. Account resting until tomorrow."
                            >Quota Exceeded</span>
                            
                            <!-- Subscription tier badge -->
                            <span 
                              v-if="acc.quota && acc.quota.subscription_tier"
                              class="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-mono font-medium"
                            >
                              {{ acc.quota.subscription_tier }}
                            </span>
                          </div>
                          
                          <!-- Total Requests (Simple fallback/daily tracker) -->
                          <div class="flex items-center gap-3 mt-1 w-full text-[10px] text-gray-500 font-mono flex-wrap">
                            <span>Requests today: {{ acc.requests_today }} requests</span>
                            <span v-if="acc.quota && acc.quota.ai_credits" class="text-amber-400">
                              AI Credits: ${{ (acc.quota.ai_credits.credits / 100).toFixed(2) }}
                            </span>
                          </div>

                          <!-- Verification Link -->
                          <div v-if="acc.status === 'unverified' && acc.verification_url" class="mt-1">
                            <a 
                              href="#" 
                              class="text-[10px] text-accent-400 hover:text-accent-300 underline font-mono flex items-center gap-1"
                              @click.prevent="openExternalLink(acc.verification_url)"
                            >
                              <i class="ph ph-arrow-square-out"></i> Click here to verify account
                            </a>
                          </div>
                        </div>

                        <div class="flex items-center gap-2">
                          <!-- Expand Details Button -->
                          <button 
                            v-if="acc.quota && acc.quota.models && Object.keys(acc.quota.models).length > 0"
                            @click="toggleAccountExpand(acc.id)"
                            class="px-2.5 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-xs text-gray-400 hover:text-white transition-colors border border-gray-800 flex items-center gap-1.5"
                          >
                            <i :class="['ph', expandedAccounts[acc.id] ? 'ph-caret-up' : 'ph-caret-down']"></i>
                            Limits
                          </button>

                          <!-- Manual Refresh Button -->
                          <button 
                            @click="refreshAccount(acc.id)"
                            class="px-2 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-xs text-gray-400 hover:text-white transition-colors border border-gray-800 flex items-center gap-1.5 active:scale-95"
                            title="Refresh account tokens & quota"
                            :disabled="isAddingAccount || refreshingAccountId === acc.id"
                          >
                            <i class="ph ph-arrows-counter-clockwise" :class="{ 'animate-spin': refreshingAccountId === acc.id }"></i>
                          </button>

                          <button 
                            v-if="!acc.isCurrent"
                            @click="switchAccount(acc.id)"
                            class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 font-medium transition-colors border border-gray-700 active:scale-95"
                          >
                            Switch
                          </button>
                          <button 
                            @click="deleteAccount(acc.id)"
                            class="px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20 active:scale-95"
                            title="Delete account"
                          >
                            <i class="ph ph-trash"></i>
                          </button>
                        </div>
                      </div>

                      <!-- Collapsible Details Row -->
                      <div 
                        v-if="expandedAccounts[acc.id] && acc.quota && acc.quota.models && Object.keys(acc.quota.models).length > 0"
                        class="mt-4 pt-4 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-3"
                      >
                        <div 
                          v-for="(model, modelName) in acc.quota.models" 
                          :key="modelName"
                          class="p-2.5 bg-gray-900/50 rounded-lg border border-gray-800/80 flex flex-col gap-1.5"
                        >
                          <div class="flex justify-between items-center text-xs">
                            <span class="font-medium text-gray-300 truncate max-w-[170px]" :title="model.display_name || modelName">
                              {{ model.display_name || formatModelName(modelName) }}
                            </span>
                            <span 
                              :class="[
                                'font-mono text-[10px]',
                                model.percentage > 50 ? 'text-green-400' : model.percentage > 15 ? 'text-amber-400' : 'text-red-400'
                              ]"
                            >
                              {{ model.percentage }}%
                            </span>
                          </div>
                          
                          <!-- Progress Bar -->
                          <div class="w-full h-1 bg-gray-850 rounded-full overflow-hidden">
                            <div 
                              class="h-full rounded-full transition-all duration-500"
                              :class="[
                                model.percentage > 50 ? 'bg-green-500' : model.percentage > 15 ? 'bg-amber-500' : 'bg-red-500'
                              ]"
                              :style="{ width: model.percentage + '%' }"
                            ></div>
                          </div>
                          
                          <!-- Reset Time info if low -->
                          <div v-if="model.resetTime" class="text-[9px] text-gray-500 font-mono flex items-center gap-1">
                            <i class="ph ph-clock"></i> Reset: {{ formatResetTime(model.resetTime) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div class="mt-6 p-4 rounded-xl bg-accent-950/30 border border-accent-900/50 flex gap-3">
                    <i class="ph ph-info text-accent-500 text-lg shrink-0"></i>
                    <p class="text-xs text-gray-400 leading-relaxed">
                      Accounts Manager automatically tracks request usage (e.g., from the 1500/day limit for Gemini Pro).
                      When it hits a 'Rate Limit' (429) error during generation, it will seamlessly switch to the next 
                      available account in the background and complete the generation without losing your prompt!
                    </p>
                  </div>
                </section>
              </div>

              <!-- TAB: APPEARANCE -->
              <div v-show="activeTab === 'appearance'" class="space-y-10 animate-fade-in">
                <section>
                  <h4 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Application Theme</h4>
                  
                  <div class="grid grid-cols-3 gap-4">
                    <button class="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-accent-500 bg-gray-800/50">
                      <div class="w-full h-20 rounded-lg bg-gray-950 border border-gray-800 flex overflow-hidden">
                        <div class="w-1/3 bg-gray-900 border-r border-gray-800 h-full"></div>
                        <div class="w-2/3 bg-gray-950 h-full"></div>
                      </div>
                      <span class="text-sm font-medium text-gray-200">Dark</span>
                    </button>
                    <button class="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-transparent hover:border-gray-700 bg-gray-950/50 transition-colors opacity-50 cursor-not-allowed">
                      <div class="w-full h-20 rounded-lg bg-white border border-gray-200 flex overflow-hidden">
                        <div class="w-1/3 bg-gray-100 border-r border-gray-200 h-full"></div>
                        <div class="w-2/3 bg-white h-full"></div>
                      </div>
                      <span class="text-sm font-medium text-gray-400">Light (Soon)</span>
                    </button>
                    <button class="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-transparent hover:border-gray-700 bg-gray-950/50 transition-colors">
                      <div class="w-full h-20 rounded-lg flex overflow-hidden border border-gray-700">
                        <div class="w-1/2 bg-gray-950 h-full"></div>
                        <div class="w-1/2 bg-white h-full"></div>
                      </div>
                      <span class="text-sm font-medium text-gray-400">System</span>
                    </button>
                  </div>
                </section>
              </div>

              <!-- TAB: SHORTCUTS -->
              <div v-show="activeTab === 'shortcuts'" class="space-y-10 animate-fade-in">
                <section>
                  <h4 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Keyboard Shortcuts</h4>
                  
                  <div class="bg-gray-950/50 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
                    <div class="flex items-center justify-between p-4">
                      <span class="text-sm text-gray-300">New session</span>
                      <div class="flex gap-1">
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">Ctrl</kbd>
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">N</kbd>
                      </div>
                    </div>
                    <div class="flex items-center justify-between p-4">
                      <span class="text-sm text-gray-300">Collapse / Expand sidebar</span>
                      <div class="flex gap-1">
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">Ctrl</kbd>
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">B</kbd>
                      </div>
                    </div>
                    <div class="flex items-center justify-between p-4">
                      <span class="text-sm text-gray-300">Toggle Chat / Terminal view</span>
                      <div class="flex gap-1">
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">Ctrl</kbd>
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">`</kbd>
                      </div>
                    </div>
                    <div class="flex items-center justify-between p-4">
                      <span class="text-sm text-gray-300">Settings</span>
                      <div class="flex gap-1">
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">Ctrl</kbd>
                        <kbd class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-mono">,</kbd>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <!-- TAB: AI MODEL -->
              <div v-show="activeTab === 'ai'" class="space-y-10 animate-fade-in">
                <section>
                  <h4 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Main Model</h4>
                  
                  <div class="p-5 rounded-xl border border-gray-800 bg-gray-950/50 space-y-4">
                    <p class="text-sm text-gray-400">Currently, Antigravity uses the model defined in the CLI configuration. Changing it here will override the environment variable for the session.</p>
                    
                    <div class="mt-4">
                      <label class="block text-xs font-medium text-gray-500 mb-2">Default Model</label>
                      <select class="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-accent-500 focus:border-accent-500 block p-2.5 outline-none">
                        <option v-for="model in store.availableModels" :key="model" :value="model">{{ model }}</option>
                        <option v-if="store.availableModels.length === 0">Loading models...</option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>
              
              <!-- TAB: ABOUT -->
              <div v-show="activeTab === 'about'" class="space-y-10 animate-fade-in flex flex-col items-center text-center pt-10">
                <img :src="logoUrl" alt="GravityDesk Logo" class="w-20 h-20 rounded-2xl border border-gray-800 shadow-lg mb-4" />
                <h2 class="text-2xl font-bold text-white tracking-tight">GravityDesk</h2>
                <p class="text-sm text-gray-400 max-w-md mt-2">Built with passion as a graphical interface (GUI) for Antigravity CLI. Provides a comfortable, native experience working with AI agents.</p>
                <div class="mt-8 text-xs text-gray-500 space-y-1">
                  <p>Version 1.0.0 (Beta)</p>
                  <p>Antigravity CLI v2.0</p>
                  <p>© 2026 Xelvor AI</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
button:focus {
  outline: none !important;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .bg-gray-900,
.modal-leave-active .bg-gray-900 {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-enter-from .bg-gray-900 {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
.modal-leave-to .bg-gray-900 {
  opacity: 0;
  transform: scale(0.98) translateY(5px);
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
