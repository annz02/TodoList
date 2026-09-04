<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTheme } from '../composables/useTheme';
import { useUpdate } from '../composables/useUpdate';
import { useAIConfig } from '../composables/useAIConfig';
import UpdateModal from './UpdateModal.vue';
import ChangelogModal from './ChangelogModal.vue';

const props = defineProps<{
  show: boolean;
  initialTab?: 'general' | 'ai' | 'shortcuts';
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { primaryColor, themeColors, setPrimaryColor, themeMode, setThemeMode } = useTheme();
const {
  currentVersion,
  isChecking,
  checkStatusMsg,
  autoCheckUpdate,
  setAutoCheckUpdate,
  checkUpdate,
  pendingUpdate,
  installUpdate,
  updateBusy,
  progressPercent
} = useUpdate();

const {
  endpoint,
  apiKey,
  models,
  activeModel,
  streaming,
  webSearch,
  searchEngine,
  tavilyApiKey,
  bochaApiKey,
  setConnection,
  setModels,
  setStreaming,
  setWebSearch,
  setSearchEngine,
  setTavilyApiKey,
  setBochaApiKey,
} = useAIConfig();

const activeTab = ref<'general' | 'ai' | 'shortcuts'>(props.initialTab || 'general');
const showUpdateModal = ref(false);
const showChangelogModal = ref(false);

let draftSeq = 0;
const draftEndpoint = ref(endpoint.value);
const draftApiKey = ref(apiKey.value);
const draftStreaming = ref(streaming.value);
const draftWebSearch = ref(webSearch.value);
const draftSearchEngine = ref(searchEngine.value);
const draftTavilyKey = ref(tavilyApiKey.value);
const draftBochaKey = ref(bochaApiKey.value);
const draftModels = ref<{ id: number; name: string }[]>(
  models.value.map((m) => ({ id: ++draftSeq, name: m })),
);
const saveSuccess = ref(false);

const syncAIDrafts = () => {
  draftEndpoint.value = endpoint.value;
  draftApiKey.value = apiKey.value;
  draftStreaming.value = streaming.value;
  draftWebSearch.value = webSearch.value;
  draftSearchEngine.value = searchEngine.value;
  draftTavilyKey.value = tavilyApiKey.value;
  draftBochaKey.value = bochaApiKey.value;
  draftModels.value = models.value.map((m) => ({ id: ++draftSeq, name: m }));
  saveSuccess.value = false;
};

watch(() => props.show, (shown) => {
  if (shown) {
    if (props.initialTab) {
      activeTab.value = props.initialTab;
    }
    syncAIDrafts();
  }
});

watch(() => props.initialTab, (t) => {
  if (t) {
    activeTab.value = t;
  }
});

const addModelRow = () => {
  draftModels.value = [...draftModels.value, { id: ++draftSeq, name: '' }];
};

const removeModelRow = (id: number) => {
  draftModels.value = draftModels.value.filter((r) => r.id !== id);
  if (draftModels.value.length === 0) addModelRow();
};

const canSaveAIConfig = computed(() => {
  if (!draftEndpoint.value.trim()) return false;
  return draftModels.value.some((r) => r.name.trim().length > 0);
});

const handleSaveAIConfig = () => {
  setConnection(draftEndpoint.value, draftApiKey.value);
  setStreaming(draftStreaming.value);
  setWebSearch(draftWebSearch.value);
  setSearchEngine(draftSearchEngine.value);
  setTavilyApiKey(draftTavilyKey.value);
  setBochaApiKey(draftBochaKey.value);
  const names = draftModels.value
    .map((r) => r.name.trim())
    .filter((n) => n.length > 0);
  setModels(names, activeModel.value || null);
  saveSuccess.value = true;
  setTimeout(() => {
    saveSuccess.value = false;
  }, 2200);
};

const colorNames: Record<string, string> = {
  '#3b82f6': '经典蓝',
  '#6366f1': '罗兰紫',
  '#10b981': '翡翠绿',
  '#f59e0b': '琥珀橙',
  '#ec4899': '玫瑰粉',
};

const handleManualCheck = async () => {
  const update = await checkUpdate(true);
  if (update) {
    showUpdateModal.value = true;
  }
};
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card">
        <!-- 左侧侧边导航 -->
        <aside class="settings-nav">
          <div class="nav-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>设置</span>
          </div>

          <nav class="nav-menu">
            <button 
              type="button" 
              class="nav-item" 
              :class="{ active: activeTab === 'general' }" 
              @click.stop="activeTab = 'general'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" x2="20" y1="12" y2="12"></line>
                <line x1="4" x2="20" y1="6" y2="6"></line>
                <line x1="4" x2="20" y1="18" y2="18"></line>
                <circle cx="9" cy="6" r="2"></circle>
                <circle cx="15" cy="12" r="2"></circle>
                <circle cx="9" cy="18" r="2"></circle>
              </svg>
              通用
            </button>
            <button 
              type="button" 
              class="nav-item" 
              :class="{ active: activeTab === 'ai' }" 
              @click.stop="activeTab = 'ai'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-2 6-6 2 6 2 2 6 2-6 6-2-6-2-2-6Z"></path>
                <path d="M19 3v4"></path>
                <path d="M17 5h4"></path>
              </svg>
              AI 模型
            </button>
            <button 
              type="button" 
              class="nav-item" 
              :class="{ active: activeTab === 'shortcuts' }" 
              @click.stop="activeTab = 'shortcuts'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                <path d="M6 8h.01"></path>
                <path d="M10 8h.01"></path>
                <path d="M14 8h.01"></path>
                <path d="M18 8h.01"></path>
                <path d="M6 12h.01"></path>
                <path d="M18 12h.01"></path>
                <path d="M7 16h10"></path>
              </svg>
              快捷键
            </button>
          </nav>
        </aside>

        <!-- 右侧主内容区域 -->
        <main class="settings-content">
          <div class="content-header">
            <h2 class="content-title">{{ activeTab === 'general' ? '通用设置' : activeTab === 'shortcuts' ? '快捷键说明' : 'AI 模型配置' }}</h2>
            <button type="button" class="close-icon-btn" @click.stop="emit('close')" title="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div class="content-body">
            <!-- 通用页签内容 -->
            <div v-if="activeTab === 'general'" class="tab-panel general-panel">
              <!-- 界面主题设置 -->
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <span class="card-title" style="margin:0;">界面主题</span>
                  </div>
                  <div class="theme-mode-segmented">
                    <button 
                      type="button"
                      class="theme-mode-btn"
                      :class="{ active: themeMode === 'system' }" 
                      @click.stop="setThemeMode('system')"
                      title="跟随系统"
                    >
                      <svg class="mode-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2.2L15.14 4.42L18.93 5.07L19.58 8.86L21.8 12L19.58 15.14L18.93 18.93L15.14 19.58L12 21.8L8.86 19.58L5.07 18.93L4.42 15.14L2.2 12L4.42 8.86L5.07 5.07L8.86 4.42Z" stroke-width="1.8"></path>
                        <path d="M8.6 15.8L12 8.2L15.4 15.8" stroke-width="2.1"></path>
                        <path d="M9.7 13.4H14.3" stroke-width="2.1"></path>
                      </svg>
                      <span>跟随系统</span>
                    </button>
                    <button 
                      type="button"
                      class="theme-mode-btn"
                      :class="{ active: themeMode === 'light' }" 
                      @click.stop="setThemeMode('light')"
                      title="浅色"
                    >
                      <svg class="mode-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"></circle>
                        <path d="M12 2v2"></path>
                        <path d="M12 20v2"></path>
                        <path d="m4.93 4.93 1.41 1.41"></path>
                        <path d="m17.66 17.66 1.41 1.41"></path>
                        <path d="M2 12h2"></path>
                        <path d="M20 12h2"></path>
                        <path d="m6.34 17.66-1.41 1.41"></path>
                        <path d="m19.07 4.93-1.41 1.41"></path>
                      </svg>
                      <span>浅色</span>
                    </button>
                    <button 
                      type="button"
                      class="theme-mode-btn"
                      :class="{ active: themeMode === 'dark' }" 
                      @click.stop="setThemeMode('dark')"
                      title="深色"
                    >
                      <svg class="mode-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                      </svg>
                      <span>深色</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 主题颜色设置 -->
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <span class="card-title" style="margin:0;">主题色</span>
                  </div>
                  
                  <div class="color-palette">
                    <button 
                      type="button"
                      v-for="color in themeColors" 
                      :key="color"
                      class="color-btn"
                      :class="{ active: primaryColor === color }"
                      :style="{ backgroundColor: color }"
                      :title="colorNames[color] || color"
                      @click.stop="setPrimaryColor(color)"
                    >
                      <svg v-if="primaryColor === color" class="check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 启动自动检查更新设置 -->
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <span class="card-title" style="margin:0;">启动时自动检查更新</span>
                  </div>
                  <div 
                    class="toggle-switch" 
                    :class="{ active: autoCheckUpdate }" 
                    @click.stop="setAutoCheckUpdate(!autoCheckUpdate)"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>
              </div>

              <!-- 版本更新与 Changelog -->
              <div class="setting-card update-card" :class="{ 'expanded': checkStatusMsg }">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">版本更新</span>
                      <span class="card-desc">当前版本 v{{ currentVersion }}</span>
                      <span v-if="checkStatusMsg" class="update-status-msg">{{ checkStatusMsg }}</span>
                    </div>
                  </div>
                  <div class="action-btns">
                    <button type="button" class="update-check-btn" :disabled="isChecking" @click.stop="handleManualCheck">
                      <svg v-if="!isChecking" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                      </svg>
                      <span>{{ isChecking ? '检查中...' : '检查更新' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- 快捷键页签内容 -->
            <div v-if="activeTab === 'shortcuts'" class="tab-panel shortcuts-panel">
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">新建任务</span>
                      <span class="card-desc">呼出新建任务卡片</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">N</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">保存任务</span>
                      <span class="card-desc">保存新建卡片或修改内容</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">S</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">编辑任务</span>
                      <span class="card-desc">编辑选中的任务卡片</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">E</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">删除任务</span>
                      <span class="card-desc">删除选中的任务卡片</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">D</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">取消操作</span>
                      <span class="card-desc">取消新建或编辑任务</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">W</kbd>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI 模型配置页签内容 -->
            <div v-if="activeTab === 'ai'" class="tab-panel ai-panel">
              <!-- 请求地址 -->
              <div class="ai-card-block">
                <label class="ai-label" for="ai-endpoint">请求地址</label>
                <input
                  id="ai-endpoint"
                  class="ai-input mono"
                  type="text"
                  spellcheck="false"
                  v-model="draftEndpoint"
                  placeholder="https://api.deepseek.com/v1"
                />
              </div>

              <!-- API Key -->
              <div class="ai-card-block">
                <label class="ai-label" for="ai-key">API Key</label>
                <input
                  id="ai-key"
                  class="ai-input mono"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  v-model="draftApiKey"
                  placeholder="sk-…"
                />
              </div>

              <!-- 可用模型列表 -->
              <div class="ai-card-block">
                <div class="ai-head-row">
                  <label class="ai-label">可用模型</label>
                  <button type="button" class="ai-add-btn" @click.prevent="addModelRow">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    添加模型
                  </button>
                </div>
                <div class="ai-models-list">
                  <div v-for="row in draftModels" :key="row.id" class="ai-model-row">
                    <input
                      class="ai-input mono"
                      type="text"
                      spellcheck="false"
                      v-model="row.name"
                      placeholder="deepseek-chat"
                    />
                    <button
                      type="button"
                      class="ai-row-del"
                      :disabled="draftModels.length <= 1"
                      title="移除该模型"
                      @click.prevent="removeModelRow(row.id)"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 流式输出 -->
              <div class="ai-card-row">
                <div class="setting-info">
                  <div class="info-text">
                    <span class="card-title">流式输出</span>
                    <span class="card-desc">逐字显示模型回复，体验更流畅</span>
                  </div>
                </div>
                <div
                  class="toggle-switch"
                  :class="{ active: draftStreaming }"
                  @click.stop="draftStreaming = !draftStreaming"
                >
                  <div class="toggle-knob"></div>
                </div>
              </div>

              <!-- 实时网络检索 -->
              <div class="ai-card-block">
                <div class="ai-toggle-row">
                  <div class="info-text">
                    <span class="card-title">实时网络检索 (Search)</span>
                    <span class="card-desc">询问时效性问题时自动检索互联网最新资讯</span>
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: draftWebSearch }"
                    @click.stop="draftWebSearch = !draftWebSearch"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>

                <!-- 搜索引擎配置 -->
                <div v-if="draftWebSearch" class="ai-search-options">
                  <div class="ai-engine-title">搜索引擎源</div>
                  <div class="ai-engine-radios">
                    <label class="ai-engine-radio" :class="{ active: draftSearchEngine === 'builtin' }">
                      <input type="radio" value="builtin" v-model="draftSearchEngine" />
                      <div class="ai-radio-text">
                        <span class="engine-name">内置免费检索（推荐）</span>
                        <span class="engine-desc">无需配置任何 Key，支持通用资讯、A股行情与天气</span>
                      </div>
                    </label>
                    <label class="ai-engine-radio" :class="{ active: draftSearchEngine === 'bocha' }">
                      <input type="radio" value="bocha" v-model="draftSearchEngine" />
                      <div class="ai-radio-text">
                        <span class="engine-name">博查 AI 搜索（国内推荐）</span>
                        <span class="engine-desc">国内专为大模型打造的联网搜索</span>
                      </div>
                    </label>
                    <label class="ai-engine-radio" :class="{ active: draftSearchEngine === 'tavily' }">
                      <input type="radio" value="tavily" v-model="draftSearchEngine" />
                      <div class="ai-radio-text">
                        <span class="engine-name">Tavily Search API</span>
                        <span class="engine-desc">专业 AI 搜索引擎（需自备 Key）</span>
                      </div>
                    </label>
                  </div>

                  <div v-if="draftSearchEngine === 'bocha'" class="ai-key-box">
                    <label class="ai-label" for="bocha-key">博查 API Key</label>
                    <input
                      id="bocha-key"
                      class="ai-input mono"
                      type="password"
                      v-model="draftBochaKey"
                      placeholder="sk-…"
                    />
                    <div class="ai-hint">可在 bochaai.com 获取；未填或耗尽时自动回退到内置免费检索。</div>
                  </div>

                  <div v-if="draftSearchEngine === 'tavily'" class="ai-key-box">
                    <label class="ai-label" for="tavily-key">Tavily API Key</label>
                    <input
                      id="tavily-key"
                      class="ai-input mono"
                      type="password"
                      v-model="draftTavilyKey"
                      placeholder="tvly-…"
                    />
                    <div class="ai-hint">未填写或耗尽时自动回退到内置免费检索。</div>
                  </div>
                </div>
              </div>

              <!-- 底部保存按钮行 -->
              <div class="ai-save-footer">
                <span v-if="saveSuccess" class="ai-save-toast">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  配置已保存并生效
                </span>
                <button
                  type="button"
                  class="ai-save-btn"
                  :disabled="!canSaveAIConfig"
                  @click="handleSaveAIConfig"
                >
                  保存配置
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </Transition>

  <!-- 新版本更新弹窗 -->
  <UpdateModal
    :show="showUpdateModal"
    :current-version="currentVersion"
    :update-info="pendingUpdate"
    :update-busy="updateBusy"
    :progress-percent="progressPercent"
    @close="showUpdateModal = false"
    @view-changelog="showUpdateModal = false; showChangelogModal = true"
    @install="installUpdate"
  />

  <!-- 完整更新日志 (CHANGELOG) 弹窗 -->
  <ChangelogModal
    :show="showChangelogModal"
    @close="showChangelogModal = false"
  />
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-card {
  width: 630px;
  height: 520px;
  max-height: 88vh;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  overflow: hidden;
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.3);
  animation: cardPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardPop {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* 左侧 Sidebar Nav */
.settings-nav {
  width: 160px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 20px;
  padding: 0 6px;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 9px;
  border: none;
  background: transparent;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
}

.nav-item svg {
  flex-shrink: 0;
  color: inherit;
}

.nav-item:hover:not(.active) {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  color: var(--primary-color);
}

:global(.dark) .nav-item:hover:not(.active) {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
}

.nav-item.active {
  background: var(--primary-light);
  color: var(--primary-color);
  font-weight: 600;
}

/* 右侧 Main Content */
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.content-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}

.close-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.close-icon-btn:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

.tab-panel {
  animation: panelFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.general-panel,
.shortcuts-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@keyframes panelFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Setting Card Design */
.setting-card {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.general-panel .setting-card,
.shortcuts-panel .setting-card {
  height: 64px;
  min-height: 64px;
  padding: 0 20px;
  justify-content: center;
  gap: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.setting-info {
  display: flex;
  align-items: center;
}

.info-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  background: var(--border-color);
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch.active {
  background-color: var(--primary-color);
}

.toggle-knob {
  width: 18px;
  height: 18px;
  background: #ffffff;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 2px;
  line-height: 1.2;
}

.card-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.2;
}

/* 界面主题分段选择器 */
.theme-mode-segmented {
  display: inline-flex;
  align-items: center;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 3px;
  position: relative;
  user-select: none;
}

.theme-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.theme-mode-btn:not(:first-child)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 22%;
  bottom: 22%;
  width: 1px;
  background-color: var(--border-color);
  transition: opacity 0.15s;
}

.theme-mode-btn.active::before,
.theme-mode-btn.active + .theme-mode-btn::before,
.theme-mode-btn:hover::before,
.theme-mode-btn:hover + .theme-mode-btn::before {
  opacity: 0;
}

.theme-mode-btn .mode-icon {
  flex-shrink: 0;
  stroke: currentColor;
}

.theme-mode-btn:hover:not(.active) {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

:global(.dark) .theme-mode-btn:hover:not(.active) {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.theme-mode-btn.active {
  background: var(--primary-light, color-mix(in srgb, var(--primary-color) 14%, transparent));
  color: var(--primary-color);
  font-weight: 600;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--primary-color) 18%, transparent), 0 1px 2px rgba(0, 0, 0, 0.04);
}

:global(.dark) .theme-mode-btn.active {
  background: color-mix(in srgb, var(--primary-color) 22%, rgba(255, 255, 255, 0.05));
  color: var(--primary-color);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--primary-color) 35%, transparent);
}



/* Color Palette */
.color-palette {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
}

.color-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.color-btn:hover {
  transform: scale(1.12);
}

.color-btn.active {
  transform: scale(1.18);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.check-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  animation: checkPop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes checkPop {
  from {
    transform: scale(0.3) rotate(-15deg);
    opacity: 0;
  }
  to {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}

/* Shortcut Items */
.key-caps {
  display: flex;
  align-items: center;
  gap: 4px;
}

.key-cap {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 0 var(--border-color);
  border-radius: 6px;
  padding: 4px 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.plus {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0 2px;
}

.action-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}

.update-check-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.update-check-btn:hover:not(:disabled) {
  background: var(--primary-light);
}

.update-check-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.general-panel .setting-card.update-card {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.general-panel .setting-card.update-card.expanded {
  height: auto;
  min-height: 82px;
  padding: 12px 20px;
}

.update-status-msg {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-color);
  animation: fadeIn 0.25s ease-in-out;
}

/* AI Model Configuration Panel */
.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 8px;
}

.ai-card-block {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-card-row {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  height: 60px;
  min-height: 60px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ai-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.ai-hint {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
}

.ai-hint.tip {
  color: var(--primary-color);
}

.ai-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-main);
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.ai-input.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ai-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 18%, transparent);
}

.ai-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px dashed var(--primary-color);
  color: var(--primary-color);
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.ai-add-btn:hover {
  background: var(--primary-light);
}

.ai-models-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-row-del {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  color: var(--text-muted);
  border-radius: 7px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.18s ease;
}

.ai-row-del:hover:not(:disabled) {
  color: var(--danger-color, #ef4444);
  border-color: var(--danger-color, #ef4444);
  background: color-mix(in srgb, var(--danger-color, #ef4444) 10%, transparent);
}

.ai-row-del:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ai-search-options {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-engine-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.ai-engine-radios {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-engine-radio {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ai-engine-radio.active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.ai-engine-radio input {
  margin-top: 2px;
  accent-color: var(--primary-color);
}

.ai-radio-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.engine-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-main);
}

.engine-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.ai-key-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.ai-save-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.ai-save-toast {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--success-color, #16a34a);
  font-weight: 500;
  animation: fadeIn 0.2s ease;
}

.ai-save-btn {
  padding: 8px 20px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.18s ease, transform 0.1s ease;
}

.ai-save-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.ai-save-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.ai-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
