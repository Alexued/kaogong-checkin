<template>
  <div class="page settings-page">
    <h1 class="page-title">设置</h1>
    <p class="page-sub">学习概览与设备</p>

    <div class="section-title">学习概览</div>
    <div class="card overview-card">
      <div class="overview-grid">
        <div class="metric"><strong>{{ streak }}</strong><span>连续天数</span></div>
        <div class="metric"><strong>{{ total }}</strong><span>总完成</span></div>
        <div class="metric"><strong>{{ timerTotalText }}</strong><span>计时</span></div>
        <div class="metric"><strong>{{ drillTotal }}</strong><span>背诵</span></div>
      </div>
      <div class="heat" data-swipe-ignore>
        <button
          v-for="cell in heatCells"
          :key="cell.date"
          type="button"
          class="heat-cell"
          :class="'lv' + cell.level"
          :aria-label="`${cell.date}，完成 ${cell.done}/${cell.total}`"
          @click="goDay(cell.date)"
        ></button>
      </div>
      <div class="legend">
        <span>未完成</span>
        <i v-for="level in [0, 1, 2, 3, 4]" :key="level" :class="'lv' + level"></i>
        <span>全部完成</span>
      </div>
    </div>

    <div class="section-title">计划与外观</div>
    <div class="card block">
      <div class="setting-row">
        <div><strong>计划结束日</strong><span>超过后不再生成新任务</span></div>
        <button class="value-button" type="button" @click="planPickerOpen = true">
          {{ planEnd ? formatCn(planEnd) : '未设置' }}
        </button>
      </div>
      <div class="setting-row theme-row">
        <div><strong>主题</strong><span>选择阅读外观</span></div>
        <div class="seg compact">
          <button :class="{ on: store.settings.theme !== 'dark' }" @click="setTheme('light')">浅色</button>
          <button :class="{ on: store.settings.theme === 'dark' }" @click="setTheme('dark')">深色</button>
        </div>
      </div>
      <div class="setting-row">
        <div><strong>启动动画</strong><span>冷启动时短暂播放</span></div>
        <label class="switch" title="切换启动动画">
          <input v-model="startupAnimation" type="checkbox" @change="saveStartupAnimation" />
          <span class="switch-track"></span>
        </label>
      </div>
    </div>

    <div class="section-title">服务器</div>
    <div class="card block server-card">
      <div class="setting-row top-row">
        <div>
          <strong>上传同步</strong>
          <span class="status-line" :class="{ online: store.online, pending: store.pendingSyncCount > 0 }">
            {{ syncStatusText }}
          </span>
        </div>
        <label class="switch" title="切换上传同步">
          <input v-model="syncEnabled" type="checkbox" @change="toggleSync" />
          <span class="switch-track"></span>
        </label>
      </div>

      <template v-if="syncEnabled">
        <div class="server-heading">
          <span>扫描到的服务器</span>
          <button type="button" :disabled="scanning" @click="rescanServers">
            {{ scanning ? '扫描中…' : '重新扫描' }}
          </button>
        </div>
        <button
          v-for="server in discoveredServers"
          :key="server.key"
          type="button"
          class="server-option"
          :class="{ selected: normalizedServerUrl === server.key }"
          @click="selectServer(server)"
        >
          <span class="radio"></span>
          <span class="server-copy"><strong>{{ server.name }}</strong><small>{{ server.key }}</small></span>
          <span v-if="normalizedServerUrl === server.key" class="selected-label">当前</span>
        </button>
        <div v-if="!discoveredServers.length" class="empty-scan">
          {{ scanning ? '正在重新扫描…' : '正在监听局域网广播…' }}
        </div>

        <label class="field manual-field">
          <span>手动地址</span>
          <input v-model="serverUrlInput" class="input" placeholder="192.168.1.5:8321" />
        </label>
        <div class="server-actions">
          <button class="btn ghost" type="button" @click="saveServerUrl">保存并连接</button>
          <button class="btn danger" type="button" :disabled="!store.online || overwriting" @click="overwriteLocal">
            {{ overwriting ? '覆盖中…' : '用本地覆盖服务器' }}
          </button>
        </div>
      </template>
      <div v-if="syncMessage" class="sync-message" :class="{ bad: syncMessage.startsWith('失败') }">
        {{ syncMessage }}
      </div>
    </div>

    <div class="section-title">版本更新</div>
    <div class="card block">
      <div class="row-end">
        <span class="version-label">当前版本 v{{ APP_VERSION }}</span>
        <button class="btn" :disabled="checking" @click="checkUpdate">
          {{ checking ? '检查中…' : '检查更新' }}
        </button>
      </div>
      <div v-if="updateState === 'latest'" class="up-msg">已是最新版本</div>
      <div v-else-if="updateState === 'error'" class="up-msg bad">检查失败，请检查网络后重试</div>
      <div v-else-if="updateState === 'has' && latest" class="up-has">
        <div class="up-ver">发现新版本 v{{ latest.version }}</div>
        <div v-if="latest.notes" class="up-notes">{{ latest.notes }}</div>
        <button class="btn dl-btn" :disabled="downloadBusy" @click="download">
          {{ downloadBusy ? '下载中…' : '下载安装' }}
        </button>
      </div>
      <div v-if="downloadStatus && downloadStatus.status !== 'idle'" class="download-panel">
        <div class="download-head">
          <div class="progress-ring" :style="downloadRingStyle" aria-label="下载进度">
            <span>{{ downloadPercent >= 0 ? `${downloadPercent}%` : '…' }}</span>
          </div>
          <div class="download-copy">
            <strong>{{ downloadStatusLabel }}</strong>
            <span v-if="downloadStatus.status === 'downloading' && downloadSpeed">
              {{ downloadSpeed }}
            </span>
            <span v-else-if="downloadStatus.totalBytes > 0">
              {{ formatBytes(downloadStatus.bytesDownloaded) }} / {{ formatBytes(downloadStatus.totalBytes) }}
            </span>
          </div>
        </div>
        <div v-if="downloadStatus.status === 'queued' || downloadStatus.status === 'downloading' || downloadStatus.status === 'paused'" class="progress-line" aria-hidden="true">
          <span :style="{ width: `${downloadPercent >= 0 ? downloadPercent : 0}%` }"></span>
        </div>
        <div class="download-actions">
          <button
            v-if="downloadStatus.status === 'downloaded'"
            class="btn"
            type="button"
            @click="installUpdate"
          >安装更新</button>
          <button
            v-if="downloadStatus.status === 'queued' || downloadStatus.status === 'downloading' || downloadStatus.status === 'paused'"
            class="btn ghost"
            type="button"
            @click="cancelUpdate"
          >取消下载</button>
          <button
            v-if="downloadStatus.status === 'failed' || downloadStatus.status === 'not_found'"
            class="btn ghost"
            type="button"
            @click="download"
          >重新下载</button>
        </div>
        <div v-if="downloadMessage" class="sync-message" :class="{ bad: downloadStatus.status === 'failed' || downloadStatus.status === 'not_found' }">
          {{ downloadMessage }}
        </div>
      </div>
    </div>

    <DatePickerSheet
      v-model:open="planPickerOpen"
      :model-value="planEnd"
      title="选择计划结束日"
      @update:model-value="setPlanEnd"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { getServerUrl, setServerUrl } from '../api/client';
import {
  restartDiscovery,
  startDiscovery,
  stopDiscovery,
  subscribeDiscovery,
  type DiscoveredServer,
} from '../api/discover';
import { isSyncEnabled, overwriteServerWithLocal, restartSync, setSyncEnabled } from '../api/sync';
import {
  APP_VERSION,
  compareVersions,
  fetchLatestRelease,
  openDownload,
  canDownloadInApp,
  cancelAppUpdate,
  getAppUpdateStatus,
  installAppUpdate,
  startAppUpdateDownload,
  subscribeAppUpdateProgress,
  type AppUpdateDownloadStatus,
  type ReleaseInfo,
} from '../api/update';
import { completionForDate } from '../lib/completion';
import { addDays, formatCn, todayStr } from '../lib/date';
import { streakDays, totalDone } from '../lib/stats';
import {
  isStartupAnimationEnabled,
  setStartupAnimationEnabled,
} from '../lib/localPreferences';
import DatePickerSheet from '../components/DatePickerSheet.vue';

const store = useAppStore();
const router = useRouter();
const planEnd = ref(store.settings.planEndDate || '');
const planPickerOpen = ref(false);
const serverUrlInput = ref(getServerUrl());
const syncEnabled = ref(isSyncEnabled());
const startupAnimation = ref(isStartupAnimationEnabled());
const overwriting = ref(false);
const syncMessage = ref('');
const discoveredServers = ref<DiscoveredServer[]>([]);
const scanning = ref(false);
let unsubscribeDiscovery: (() => void) | null = null;

const mainCheckins = computed(() => {
  const subtaskIds = new Set(store.subtasks.map((subtask) => subtask.id));
  return store.checkins.filter((checkin) => !subtaskIds.has(checkin.taskId));
});
const streak = computed(() => streakDays(mainCheckins.value, todayStr()));
const total = computed(() => totalDone(mainCheckins.value));
const timerTotalText = computed(() => {
  const milliseconds = store.timers.filter((timer) => !timer.deleted).reduce((sum, timer) => sum + timer.durationMs, 0);
  const minutes = Math.round(milliseconds / 60000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  return `${minutes}m`;
});
const drillTotal = computed(() => store.drills.filter((record) => !record.deleted).length);
const heatCells = computed(() =>
  Array.from({ length: 30 }, (_, index) => addDays(todayStr(), index - 29)).map((date) => ({
    date,
    ...completionForDate(store.tasks, mainCheckins.value, date, store.settings.planEndDate),
  }))
);

const normalizedServerUrl = computed(() =>
  serverUrlInput.value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
);
const syncStatusText = computed(() => {
  if (!syncEnabled.value) return '已关闭，仅使用本地数据';
  if (store.pendingSyncCount > 0) return `${store.pendingSyncCount} 条本地变更未同步`;
  return store.online ? '已连接，数据已同步' : '未连接服务器';
});

const checking = ref(false);
const updateState = ref<'' | 'latest' | 'has' | 'error'>('');
const latest = ref<ReleaseInfo | null>(null);
const downloadStatus = ref<AppUpdateDownloadStatus | null>(null);
const downloadMessage = ref('');
let updateListener: Awaited<ReturnType<typeof subscribeAppUpdateProgress>> | null = null;

const downloadBusy = computed(() =>
  downloadStatus.value?.status === 'queued'
  || downloadStatus.value?.status === 'downloading'
  || downloadStatus.value?.status === 'paused',
);
const downloadPercent = computed(() => {
  const percent = downloadStatus.value?.percent ?? -1;
  if (!Number.isFinite(percent) || percent < 0) return -1;
  return Math.max(0, Math.min(100, Math.round(percent)));
});
const downloadRingStyle = computed(() => ({ '--download-progress': `${downloadPercent.value >= 0 ? downloadPercent.value : 0}%` }));
const downloadSpeed = computed(() => {
  const speed = downloadStatus.value?.speedBytesPerSecond || 0;
  return speed > 0 ? `${formatBytes(speed)}/秒` : '';
});
const downloadStatusLabel = computed(() => {
  switch (downloadStatus.value?.status) {
    case 'queued': return '等待下载';
    case 'downloading': return '正在下载';
    case 'paused': return '下载已暂停';
    case 'downloaded': return '下载完成';
    case 'failed': return '下载失败';
    case 'not_found': return '下载文件不存在';
    case 'cancelled': return '下载已取消';
    default: return '';
  }
});

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function applyDownloadStatus(status: AppUpdateDownloadStatus) {
  downloadStatus.value = status;
  if (status.status === 'failed') downloadMessage.value = '下载失败，请检查网络后重试';
  else if (status.status === 'not_found') downloadMessage.value = '更新文件已失效，请重新下载';
  else if (status.status !== 'downloaded') downloadMessage.value = '';
}

async function checkUpdate() {
  checking.value = true;
  updateState.value = '';
  try {
    const release = await fetchLatestRelease();
    if (compareVersions(release.version, APP_VERSION) > 0) {
      latest.value = release;
      updateState.value = 'has';
    } else updateState.value = 'latest';
  } catch {
    updateState.value = 'error';
  } finally {
    checking.value = false;
  }
}

function download() {
  const release = latest.value;
  if (!release) return;
  if (!release.apkUrl || !canDownloadInApp()) {
    void openDownload(release.apkUrl || release.pageUrl);
    return;
  }
  downloadMessage.value = '';
  void startAppUpdateDownload(release.apkUrl, `kaogong-checkin-v${release.version}.apk`)
    .then(applyDownloadStatus)
    .catch(() => {
      downloadStatus.value = { downloadId: null, status: 'failed', percent: -1, bytesDownloaded: 0, totalBytes: -1, speedBytesPerSecond: 0 };
      downloadMessage.value = '下载失败，请检查网络后重试';
    });
}

async function installUpdate() {
  try {
    const result = await installAppUpdate(downloadStatus.value?.downloadId);
    if (result.status === 'permissionRequired') {
      downloadMessage.value = '请允许安装未知来源应用，然后再次点击安装更新';
    } else {
      downloadMessage.value = '';
    }
  } catch {
    downloadMessage.value = '无法打开安装程序，请稍后重试';
  }
}

async function cancelUpdate() {
  try {
    await cancelAppUpdate(downloadStatus.value?.downloadId);
    downloadStatus.value = null;
    downloadMessage.value = '';
  } catch {
    downloadMessage.value = '取消下载失败，正在保留当前进度';
    try {
      applyDownloadStatus(await getAppUpdateStatus());
    } catch {
      // Keep the current status visible when the native status query is unavailable.
    }
  }
}

function goDay(date: string) {
  void router.push(`/stats/day/${date}`);
}

function setPlanEnd(value: string) {
  planEnd.value = value;
  store.saveSettings({ planEndDate: value || null });
}

function setTheme(theme: 'light' | 'dark') {
  store.saveSettings({ theme });
}

function saveStartupAnimation() {
  setStartupAnimationEnabled(startupAnimation.value);
}

async function toggleSync() {
  syncMessage.value = '';
  setSyncEnabled(syncEnabled.value);
  if (syncEnabled.value) {
    await startDiscovery();
  } else {
    await stopDiscovery();
    scanning.value = false;
  }
}

async function rescanServers() {
  scanning.value = true;
  try {
    await restartDiscovery();
  } finally {
    scanning.value = false;
  }
}

function selectServer(server: DiscoveredServer) {
  serverUrlInput.value = server.key;
  saveServerUrl();
}

function saveServerUrl() {
  setServerUrl(serverUrlInput.value);
  restartSync();
}

async function overwriteLocal() {
  if (!window.confirm('确定用本地完整数据覆盖服务器吗？服务器现有数据将被替换。')) return;
  overwriting.value = true;
  syncMessage.value = '';
  try {
    await overwriteServerWithLocal();
    syncMessage.value = '已用本地数据覆盖服务器';
  } catch {
    syncMessage.value = '失败：覆盖未完成，本地数据和队列已保留';
  } finally {
    overwriting.value = false;
  }
}

onMounted(async () => {
  unsubscribeDiscovery = subscribeDiscovery((servers) => {
    discoveredServers.value = servers;
  });
  if (canDownloadInApp()) {
    try {
      updateListener = await subscribeAppUpdateProgress(applyDownloadStatus);
      const status = await getAppUpdateStatus();
      if (status.status !== 'idle') applyDownloadStatus(status);
    } catch {
      // Older builds without the native update plugin keep the web fallback.
    }
  }
});

onUnmounted(() => {
  unsubscribeDiscovery?.();
  void updateListener?.remove();
});
</script>

<style scoped>
.settings-page { padding-bottom: calc(96px + env(safe-area-inset-bottom)); }
.overview-card, .block { padding: 16px; }
.overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.metric { min-width: 0; padding: 10px 4px; text-align: center; border-radius: 10px; background: var(--accent-soft); }
.metric strong { display: block; font-size: 19px; color: var(--accent-solid); white-space: nowrap; }
.metric span { display: block; margin-top: 2px; font-size: 10px; color: var(--text-2); }
.heat { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin-top: 14px; }
.heat-cell { aspect-ratio: 1; min-width: 0; border: 0; border-radius: 4px; padding: 0; }
.lv0 { background: var(--heat-0); } .lv1 { background: var(--heat-1); }
.lv2 { background: var(--heat-2); } .lv3 { background: var(--heat-3); } .lv4 { background: var(--heat-4); }
.legend { display: flex; align-items: center; justify-content: flex-end; gap: 5px; margin-top: 10px; font-size: 10px; color: var(--text-3); }
.legend i { width: 10px; height: 10px; border-radius: 3px; }
.setting-row { min-height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--card-border); }
.setting-row:last-child { border-bottom: 0; }
.setting-row strong { display: block; font-size: 14px; }
.setting-row span { display: block; margin-top: 3px; font-size: 12px; color: var(--text-3); }
.value-button { min-height: 42px; border: 1px solid var(--card-border); border-radius: 11px; padding: 0 13px; background: var(--bg-elev); color: var(--accent-solid); font-weight: 700; }
.seg { display: flex; gap: 6px; }.seg button { min-height: 38px; min-width: 64px; border: 1px solid var(--card-border); border-radius: 10px; background: transparent; color: var(--text-2); }
.seg button.on { border-color: var(--accent-solid); background: var(--accent-soft); color: var(--accent-solid); font-weight: 700; }
.switch { position: relative; display: inline-flex; flex: none; width: 48px; height: 28px; }
.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch-track { width: 100%; height: 100%; border-radius: 14px; background: var(--text-3); transition: background 180ms ease; }
.switch-track::after { content: ''; display: block; width: 22px; height: 22px; margin: 3px; border-radius: 50%; background: #fff; transition: transform 180ms ease; }
.switch input:checked + .switch-track { background: var(--accent-solid); }
.switch input:checked + .switch-track::after { transform: translateX(20px); }
.status-line.online { color: var(--accent-solid); }.status-line.pending { color: var(--warn); }
.server-heading { display: flex; align-items: center; justify-content: space-between; margin: 13px 0 4px; font-size: 12px; color: var(--text-2); }
.server-heading button { min-height: 38px; border: 0; border-radius: 10px; padding: 0 12px; background: var(--accent-soft); color: var(--accent-solid); font-weight: 700; }
.server-option { width: 100%; min-height: 58px; display: flex; align-items: center; gap: 11px; border: 0; border-top: 1px solid var(--card-border); background: transparent; color: var(--text); text-align: left; }
.radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--text-3); }
.server-option.selected .radio { border: 6px solid var(--accent-solid); }
.server-copy { flex: 1; min-width: 0; }.server-copy strong, .server-copy small { display: block; }.server-copy small { margin-top: 3px; color: var(--text-3); }
.selected-label { color: var(--accent-solid); font-size: 11px; font-weight: 700; }
.empty-scan { padding: 15px 0; color: var(--text-3); font-size: 13px; text-align: center; }
.manual-field { display: block; margin-top: 10px; }.manual-field > span { display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-2); }
.server-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 10px; }.server-actions .btn { padding-inline: 10px; }
.sync-message { margin-top: 10px; color: var(--accent-solid); font-size: 12px; }.sync-message.bad, .up-msg.bad { color: var(--danger); }
.row-end { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.version-label { font-size: 13px; color: var(--accent-solid); }
.up-msg { margin-top: 12px; color: var(--accent-solid); font-size: 13px; font-weight: 700; }.up-has { margin-top: 12px; border-top: 1px solid var(--card-border); padding-top: 12px; }
.up-ver { color: var(--accent-solid); font-weight: 800; }.up-notes { max-height: 150px; overflow-y: auto; margin: 8px 0; color: var(--text-2); font-size: 12px; white-space: pre-line; }.dl-btn { width: 100%; }
.download-panel { margin-top: 14px; border-top: 1px solid var(--card-border); padding-top: 14px; }
.download-head { display: flex; align-items: center; gap: 14px; }
.progress-ring { --download-progress: 0%; width: 76px; height: 76px; flex: none; display: grid; place-items: center; border-radius: 50%; background: conic-gradient(var(--accent-solid) var(--download-progress), var(--card-border) 0); position: relative; }
.progress-ring::after { content: ''; position: absolute; inset: 7px; border-radius: 50%; background: var(--bg-elev); }
.progress-ring span { position: relative; z-index: 1; color: var(--accent-solid); font-size: 15px; font-weight: 800; }
.download-copy { min-width: 0; display: grid; gap: 4px; }.download-copy strong { font-size: 15px; }.download-copy span { color: var(--text-3); font-size: 12px; }
.progress-line { height: 7px; margin-top: 14px; overflow: hidden; border-radius: 999px; background: var(--card-border); }.progress-line span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent-from), var(--accent-to)); transition: width 300ms ease; }
.download-actions { display: flex; gap: 9px; margin-top: 12px; }.download-actions .btn { flex: 1; }
@media (max-width: 380px) { .overview-grid { grid-template-columns: 1fr 1fr; }.server-actions { grid-template-columns: 1fr; } }
</style>
