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
          :data-heat-date="cell.date"
          :aria-label="`${cell.date}，完成 ${cell.done}/${cell.total}`"
          @click="goDay(cell.date, $event)"
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

    <div class="section-title">电脑同步</div>
    <div class="card block server-card">
      <div class="setting-row top-row">
        <div>
          <strong>电脑同步</strong>
          <span class="status-line" :class="{ online: store.online, pending: store.pendingSyncCount > 0 }">
            {{ syncStatusText }}
          </span>
        </div>
        <label class="switch" title="切换电脑同步">
          <input v-model="syncEnabled" type="checkbox" @change="toggleSync" />
          <span class="switch-track"></span>
        </label>
      </div>

      <p v-if="!syncEnabled" class="sync-off-note">
        关闭期间的数据只保存在本机；再次开启后会同步这些变更。
      </p>

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
          <span class="server-copy">
            <strong>{{ server.name }}</strong>
            <small>{{ server.key }}{{ server.pairingRequired ? ' · 需要配对' : '' }}</small>
          </span>
          <span v-if="normalizedServerUrl === server.key" class="selected-label">当前</span>
        </button>
        <div v-if="!discoveredServers.length" class="empty-scan">
          <PixelGrid v-if="scanning" preset="wave" label="正在扫描服务器" />
          <span>{{ scanning ? '正在重新扫描…' : '正在监听局域网广播…' }}</span>
        </div>

        <label class="field manual-field">
          <span>手动地址</span>
          <input v-model="serverUrlInput" class="input" placeholder="192.168.1.5:8321" />
        </label>

        <div v-if="needsPairing" class="pairing-panel">
          <div class="pairing-copy">
            <strong>输入电脑上的六位配对码</strong>
            <span>配对码显示在 Windows 伴侣程序中。令牌只保存在这台手机。</span>
          </div>
          <div class="pairing-controls">
            <input
              v-model="pairingCode"
              class="input pairing-input"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="000000"
              aria-label="六位配对码"
              @input="normalizePairingCode"
            />
            <button class="btn" type="button" :disabled="pairing || pairingCode.length !== 6" @click="submitPairing">
              {{ pairing ? '配对中…' : '配对' }}
            </button>
          </div>
        </div>

        <div class="server-actions">
          <button class="btn ghost" type="button" :disabled="connectingServer" @click="saveServerUrl">
            {{ connectingServer ? '连接中…' : '保存并连接' }}
          </button>
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
    <div class="card block update-card">
      <div class="row-end version-hold" @pointerdown="startVersionHold" @pointermove="moveVersionHold" @pointerup="cancelVersionHold" @pointercancel="cancelVersionHold" @pointerleave="cancelVersionHold">
        <span class="version-label">当前版本 v{{ APP_VERSION }}<small>长按查看历史版本</small></span>
        <button class="btn" :disabled="checking" @click="checkUpdate">
          {{ checking ? '检查中…' : '检查更新' }}
        </button>
      </div>
      <div v-if="updateState === 'latest'" class="up-msg">已是最新版本</div>
      <div v-else-if="updateState === 'error'" class="up-msg bad">检查失败，请检查网络后重试</div>
      <div v-else-if="updateState === 'has' && latest" class="up-has" :class="{ compact: downloadStarted }">
        <div class="up-ver version-hold" @pointerdown="startVersionHold" @pointermove="moveVersionHold" @pointerup="cancelVersionHold" @pointercancel="cancelVersionHold" @pointerleave="cancelVersionHold"><span>发现新版本 v{{ latest.version }}<small class="update-source">{{ updateSourceLabel }}</small></span><small v-if="downloadStarted">{{ downloadStatusLabel }}</small></div>
        <div v-if="latest.notes && !downloadStarted" class="up-notes">{{ latest.notes }}</div>
        <div class="update-download-row">
          <div class="update-actions">
            <button v-if="downloadStatus?.status === 'downloaded'" class="btn download-primary" type="button" @click="installUpdate">安装更新</button>
            <button v-else class="btn download-primary" :disabled="downloadBusy" type="button" @click="download">
              {{ downloadBusy ? '下载中…' : downloadFailed ? '重新下载' : '应用内下载' }}
            </button>
            <button
              v-if="latest.source !== 'lan' || syncEnabled"
              class="browser-download"
              type="button"
              @click="downloadInBrowser"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
              浏览器下载
            </button>
            <button v-if="downloadBusy" class="cancel-download" type="button" @click="cancelUpdate">取消</button>
          </div>
          <div v-if="downloadStarted" class="download-progress-compact">
            <div class="progress-ring" :style="downloadRingStyle" aria-label="下载进度">
              <span>{{ downloadPercent >= 0 ? `${downloadPercent}%` : '…' }}</span>
            </div>
            <span>{{ downloadSpeed || downloadStatusLabel }}</span>
          </div>
        </div>
        <div v-if="downloadMessage" class="sync-message" :class="{ bad: downloadFailed }">{{ downloadMessage }}</div>
      </div>
      <div v-if="downloadStarted && updateState !== 'has'" class="download-panel">
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
        <div v-if="shouldRetainActiveAppUpdateSource(downloadStatus.status)" class="progress-line" aria-hidden="true">
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
            v-if="shouldRetainActiveAppUpdateSource(downloadStatus.status)"
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

    <teleport to="body">
      <Transition name="history-sheet">
        <div v-if="historyOpen" class="history-mask" @click.self="historyOpen = false">
          <div class="history-sheet card">
            <div class="history-head"><div><h2>历史版本</h2><p>最近发布的版本与更新说明</p></div><button type="button" aria-label="关闭" @click="historyOpen = false">×</button></div>
            <div v-if="historyLoading" class="history-state"><PixelGrid preset="wave" label="正在读取历史版本" /> 正在读取…</div>
            <div v-else-if="historyError" class="history-state bad">读取失败，请稍后重试</div>
            <div v-else class="release-list" data-swipe-ignore>
              <article v-for="release in releaseHistory" :key="release.version" class="release-item">
                <div class="release-meta"><strong>v{{ release.version }}</strong><span>{{ formatReleaseDate(release.publishedAt) }}</span></div>
                <p>{{ release.notes || '本版本未填写更新说明' }}</p>
                <button v-if="release.apkUrl" type="button" @click="openDownload(release.apkUrl!)">浏览器下载</button>
              </article>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <DatePickerSheet
      v-model:open="planPickerOpen"
      :model-value="planEnd"
      title="选择计划结束日"
      @update:model-value="setPlanEnd"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { ApiError, getServerUrl } from '../api/client';
import {
  subscribeDiscovery,
  type DiscoveredServer,
} from '../api/discover';
import { overwriteServerWithLocal } from '../api/sync';
import {
  configureComputerServer,
  isSyncEnabled,
  pairComputerServer,
  rescanComputerServers,
  setComputerSyncEnabled,
} from '../api/computer-sync';
import { getPairingToken, getSelectedServerId } from '../api/pairing-storage';
import {
  APP_VERSION,
  compareVersions,
  fetchLatestRelease,
  fetchLatestGitHubRelease,
  fetchReleaseHistory,
  openDownload,
  canDownloadInApp,
  cancelAppUpdate,
  cancelActiveLanAppUpdate,
  clearActiveAppUpdateSource,
  getActiveAppUpdateSource,
  getAppUpdateStatus,
  hasActiveAppUpdateStopFailure,
  installAppUpdate,
  shouldRetainActiveAppUpdateSource,
  startAppUpdateDownload,
  subscribeActiveAppUpdateStopFailure,
  subscribeAppUpdateProgress,
  type AppUpdateDownloadStatus,
  type ReleaseInfo,
} from '../api/update';
import { UpdateCoordinator } from '../api/update-coordinator';
import {
  advertisedApkFingerprint,
  automaticUpdateFingerprint,
  canAutomaticallyCheckUpdates,
} from '../api/update-automation';
import { completionForDate } from '../lib/completion';
import { addDays, formatCn, todayStr } from '../lib/date';
import { streakDays, totalDone } from '../lib/stats';
import {
  isStartupAnimationEnabled,
  setStartupAnimationEnabled,
} from '../lib/localPreferences';
import DatePickerSheet from '../components/DatePickerSheet.vue';
import PixelGrid from '../components/PixelGrid.vue';
import { runViewTransition } from '../lib/motion';

const store = useAppStore();
const router = useRouter();
const planEnd = ref(store.settings.planEndDate || '');
const planPickerOpen = ref(false);
const serverUrlInput = ref(getServerUrl());
const syncEnabled = ref(isSyncEnabled());
const startupAnimation = ref(isStartupAnimationEnabled());
const overwriting = ref(false);
const connectingServer = ref(false);
const pairing = ref(false);
const pairingCode = ref('');
const pairingRevision = ref(0);
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
const selectedDiscoveredServer = computed(() =>
  discoveredServers.value.find((server) => server.key === normalizedServerUrl.value)
);
const selectedServerId = computed(() =>
  selectedDiscoveredServer.value?.serverId || store.syncServerId || getSelectedServerId()
);
const selectedServerRequiresPairing = computed(() =>
  Boolean(selectedDiscoveredServer.value?.pairingRequired || store.syncPairingRequired)
);
const needsPairing = computed(() => {
  void pairingRevision.value;
  void store.syncPhase;
  return Boolean(
    syncEnabled.value
    && selectedServerRequiresPairing.value
    && selectedServerId.value
    && !getPairingToken(selectedServerId.value),
  );
});
const syncStatusText = computed(() => {
  if (!syncEnabled.value) return '已关闭，仅保存在本机';
  if (needsPairing.value || store.syncPhase === 'pairing') return '等待与电脑配对';
  if (store.pendingSyncCount > 0) return `${store.pendingSyncCount} 条本地变更未同步`;
  return store.online ? '已连接，数据已同步' : '未连接服务器';
});

const checking = ref(false);
const updateState = ref<'' | 'latest' | 'has' | 'error'>('');
const latest = ref<ReleaseInfo | null>(null);
const downloadStatus = ref<AppUpdateDownloadStatus | null>(null);
const downloadStarting = ref(false);
const downloadMessage = ref('');
const historyOpen = ref(false);
const historyLoading = ref(false);
const historyError = ref(false);
const releaseHistory = ref<ReleaseInfo[]>([]);
let githubFallbackChecked = false;
let selectedApkFingerprint = '';
let updateListener: Awaited<ReturnType<typeof subscribeAppUpdateProgress>> | null = null;
let unsubscribeUpdateStopFailure: (() => void) | null = null;
let settingsViewActive = false;
let versionHoldTimer: ReturnType<typeof setTimeout> | null = null;
let versionHoldX = 0;
let versionHoldY = 0;
let downloadStallTimer: ReturnType<typeof setTimeout> | null = null;
let lastDownloadBytes = 0;

const downloadBusy = computed(() =>
  downloadStarting.value
  || Boolean(downloadStatus.value && shouldRetainActiveAppUpdateSource(downloadStatus.value.status)),
);
const downloadStarted = computed(() => !!downloadStatus.value && downloadStatus.value.status !== 'idle' && downloadStatus.value.status !== 'cancelled');
const downloadFailed = computed(() => downloadStatus.value?.status === 'failed' || downloadStatus.value?.status === 'not_found');
const updateSourceLabel = computed(() => latest.value?.source === 'lan' ? '局域网' : 'GitHub');
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
    case 'unknown': return '正在读取下载状态';
    case 'cancelled': return '下载已取消';
    default: return '';
  }
});

function applyRelease(release: ReleaseInfo) {
  latest.value = release;
  updateState.value = compareVersions(release.version, APP_VERSION) > 0 ? 'has' : 'latest';
}

const updateCoordinator = new UpdateCoordinator<ReleaseInfo>({
  debounceMs: 400,
  canCheckAutomatically: () => canAutomaticallyCheckUpdates(isSyncEnabled(), getServerUrl()),
  automaticFingerprint: () => automaticUpdateFingerprint(
    isSyncEnabled(),
    getServerUrl(),
    APP_VERSION,
    selectedDiscoveredServer.value?.apkVersion,
  ),
  performCheck: (signal) => fetchLatestRelease({ signal }),
  onStart: (mode) => {
    githubFallbackChecked = false;
    checking.value = true;
    if (mode === 'manual') updateState.value = '';
  },
  onSuccess: (release) => {
    applyRelease(release);
    checking.value = false;
  },
  onError: () => {
    updateState.value = 'error';
    checking.value = false;
  },
  onCancelled: () => {
    checking.value = false;
  },
});

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function applyDownloadStatus(status: AppUpdateDownloadStatus) {
  downloadStatus.value = status;
  if (status.bytesDownloaded > lastDownloadBytes) {
    lastDownloadBytes = status.bytesDownloaded;
    armDownloadStallTimer();
  }
  if (!shouldRetainActiveAppUpdateSource(status.status)) {
    clearActiveAppUpdateSource();
    clearDownloadStallTimer();
  }
  if (status.status === 'failed') {
    downloadMessage.value = '下载失败，请检查网络后重试';
    void prepareGithubFallback();
  } else if (status.status === 'not_found') {
    downloadMessage.value = '更新文件已失效，请重新下载';
    void prepareGithubFallback();
  } else if (status.status === 'unknown') {
    downloadMessage.value = '暂时无法读取下载状态，正在自动重试';
  } else if (status.status !== 'downloaded') {
    downloadMessage.value = hasActiveAppUpdateStopFailure() && getActiveAppUpdateSource() === 'lan'
      ? '局域网下载停止失败，已保留当前进度'
      : '';
  }
}

async function prepareGithubFallback() {
  const lanRelease = latest.value;
  if (githubFallbackChecked || lanRelease?.source !== 'lan') return;
  githubFallbackChecked = true;
  try {
    const githubRelease = await fetchLatestGitHubRelease();
    if (githubRelease.apkUrl && compareVersions(githubRelease.version, lanRelease.version) >= 0) {
      latest.value = githubRelease;
      downloadMessage.value = '局域网下载失败，已切换到 GitHub，可重新下载';
    }
  } catch {
    // Keep the LAN release visible when GitHub is unavailable.
  }
}

function clearDownloadStallTimer() {
  if (downloadStallTimer) clearTimeout(downloadStallTimer);
  downloadStallTimer = null;
}

function armDownloadStallTimer() {
  clearDownloadStallTimer();
  downloadStallTimer = setTimeout(() => {
    if (!downloadBusy.value) return;
    downloadMessage.value = '下载长时间没有进度，可以改用浏览器下载';
  }, 30000);
}

function checkUpdate() {
  githubFallbackChecked = false;
  if (downloadStatus.value && ['failed', 'not_found', 'cancelled'].includes(downloadStatus.value.status)) {
    downloadStatus.value = null;
    downloadMessage.value = '';
  }
  void updateCoordinator.checkNow();
}

function download() {
  const release = latest.value;
  if (!release) return;
  if (release.source === 'lan' && !isSyncEnabled()) {
    downloadMessage.value = '电脑同步已关闭，请检查 GitHub 更新后再下载';
    return;
  }
  if (!release.apkUrl || !canDownloadInApp()) {
    void openDownload(release.apkUrl || release.pageUrl);
    return;
  }
  downloadMessage.value = '';
  lastDownloadBytes = 0;
  downloadStarting.value = true;
  armDownloadStallTimer();
  void startAppUpdateDownload(release.apkUrl, `kaogong-checkin-v${release.version}.apk`, release.source)
    .then(applyDownloadStatus)
    .catch(() => {
      if (getActiveAppUpdateSource() === 'lan' && !isSyncEnabled()) {
        downloadMessage.value = '局域网下载停止失败；重新开启电脑同步后可再次停止';
        return;
      }
      applyDownloadStatus({ downloadId: null, status: 'failed', percent: -1, bytesDownloaded: 0, totalBytes: -1, speedBytesPerSecond: 0 });
    })
    .finally(() => { downloadStarting.value = false; });
}

function downloadInBrowser() {
  const release = latest.value;
  if (!release || (release.source === 'lan' && !isSyncEnabled())) return;
  void openDownload(release.apkUrl || release.pageUrl);
}

function startVersionHold(event: PointerEvent) {
  if ((event.target as Element | null)?.closest('button')) return;
  cancelVersionHold();
  versionHoldX = event.clientX;
  versionHoldY = event.clientY;
  versionHoldTimer = setTimeout(() => { void openVersionHistory(); }, 500);
}

function moveVersionHold(event: PointerEvent) {
  if (Math.hypot(event.clientX - versionHoldX, event.clientY - versionHoldY) > 10) cancelVersionHold();
}

function cancelVersionHold() {
  if (versionHoldTimer) clearTimeout(versionHoldTimer);
  versionHoldTimer = null;
}

async function openVersionHistory() {
  cancelVersionHold();
  historyOpen.value = true;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10);
  if (releaseHistory.value.length) return;
  historyLoading.value = true;
  historyError.value = false;
  try { releaseHistory.value = await fetchReleaseHistory(); }
  catch { historyError.value = true; }
  finally { historyLoading.value = false; }
}

function formatReleaseDate(iso: string) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
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
    if (getActiveAppUpdateSource() === 'lan') {
      await cancelActiveLanAppUpdate(downloadStatus.value?.downloadId);
    } else {
      await cancelAppUpdate(downloadStatus.value?.downloadId);
    }
    clearActiveAppUpdateSource();
    downloadStatus.value = null;
    downloadMessage.value = '';
  } catch {
    downloadMessage.value = '取消下载失败，正在保留当前进度';
    try {
      applyDownloadStatus(await getAppUpdateStatus());
    } catch {
      // Keep the current status visible when the native status query is unavailable.
    }
    downloadMessage.value = '取消下载失败，正在保留当前进度';
  }
}

async function goDay(date: string, event: MouseEvent) {
  const origin = event.currentTarget as HTMLElement | null;
  if (origin) origin.style.viewTransitionName = 'day-detail-origin';
  try {
    await runViewTransition(async () => { await router.push(`/stats/day/${date}`); await nextTick(); });
  } finally {
    if (origin) origin.style.viewTransitionName = '';
  }
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
  const disabling = !syncEnabled.value;
  if (disabling) updateCoordinator.cancel(true);
  const wasDownloadingFromLan = disabling && getActiveAppUpdateSource() === 'lan';
  await setComputerSyncEnabled(syncEnabled.value);
  if (!syncEnabled.value) {
    scanning.value = false;
    if (wasDownloadingFromLan) {
      downloadStarting.value = false;
      clearDownloadStallTimer();
    }
    if (latest.value?.source === 'lan' && downloadStatus.value?.status !== 'downloaded') {
      latest.value = null;
      updateState.value = '';
    }
    syncMessage.value = getActiveAppUpdateSource() === 'lan'
      ? '电脑同步已关闭，但局域网下载未能停止；重新开启后可再次停止'
      : '电脑连接已停止，本地数据和待同步变更已保留';
  }
  updateCoordinator.scheduleAutomatic(true);
}

async function rescanServers() {
  scanning.value = true;
  try {
    await rescanComputerServers();
  } finally {
    scanning.value = false;
  }
}

async function selectServer(server: DiscoveredServer) {
  serverUrlInput.value = server.key;
  syncMessage.value = '';
  connectingServer.value = true;
  updateCoordinator.cancel(true);
  try {
    await configureComputerServer(server.key, server.serverId);
    if (server.pairingRequired && server.serverId && !getPairingToken(server.serverId)) {
      syncMessage.value = '请输入 Windows 伴侣程序显示的六位配对码';
    }
    updateCoordinator.scheduleAutomatic(true);
  } finally {
    connectingServer.value = false;
  }
}

async function saveServerUrl() {
  syncMessage.value = '';
  connectingServer.value = true;
  updateCoordinator.cancel(true);
  try {
    await configureComputerServer(serverUrlInput.value);
    if (store.syncPhase === 'pairing') syncMessage.value = '此电脑需要配对，请输入六位配对码';
    else if (store.online) syncMessage.value = '已连接电脑';
    else syncMessage.value = '地址已保存，正在等待电脑服务';
    updateCoordinator.scheduleAutomatic(true);
  } finally {
    connectingServer.value = false;
  }
}

function normalizePairingCode() {
  pairingCode.value = pairingCode.value.replace(/\D/g, '').slice(0, 6);
}

async function submitPairing() {
  if (pairingCode.value.length !== 6 || !selectedServerId.value) return;
  pairing.value = true;
  syncMessage.value = '';
  try {
    await pairComputerServer(pairingCode.value, selectedServerId.value);
    pairingCode.value = '';
    pairingRevision.value += 1;
    syncMessage.value = '配对成功，正在同步本地变更';
    updateCoordinator.scheduleAutomatic(true);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      syncMessage.value = '';
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403)) {
      syncMessage.value = '失败：配对码不正确或已失效，请查看电脑上的最新配对码';
    } else if (error instanceof ApiError && error.status === 429) {
      syncMessage.value = '失败：尝试次数过多，请稍后再试';
    } else if (error instanceof ApiError && error.status === 409) {
      syncMessage.value = '失败：电脑与手机的同步协议版本不兼容，请更新两端应用';
    } else {
      syncMessage.value = '失败：无法完成配对，请确认手机与电脑在同一专用网络';
    }
  } finally {
    pairing.value = false;
  }
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
  settingsViewActive = true;
  unsubscribeUpdateStopFailure = subscribeActiveAppUpdateStopFailure((failed) => {
    if (failed && getActiveAppUpdateSource() === 'lan') {
      downloadMessage.value = '局域网下载停止失败，已保留当前进度';
    } else if (downloadMessage.value.startsWith('局域网下载停止失败')
      || downloadMessage.value.startsWith('取消下载失败')) {
      downloadMessage.value = '';
    }
  });
  unsubscribeDiscovery = subscribeDiscovery((servers) => {
    discoveredServers.value = servers;
    const savedUrl = getServerUrl().trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const savedServerId = getSelectedServerId();
    const selected = servers.find((server) =>
      server.key === savedUrl || Boolean(savedServerId && server.serverId === savedServerId)
    );
    const nextFingerprint = advertisedApkFingerprint(selected);
    if (nextFingerprint && nextFingerprint !== selectedApkFingerprint) {
      selectedApkFingerprint = nextFingerprint;
      updateCoordinator.scheduleAutomatic(true);
    } else if (!nextFingerprint) {
      selectedApkFingerprint = '';
    }
  });
  updateCoordinator.scheduleAutomatic();
  if (canDownloadInApp()) {
    try {
      const listener = await subscribeAppUpdateProgress((status) => {
        if (settingsViewActive) applyDownloadStatus(status);
      });
      if (!settingsViewActive) {
        void listener.remove();
        return;
      }
      updateListener = listener;
      const status = await getAppUpdateStatus();
      if (!settingsViewActive) return;
      if (status.status !== 'idle') applyDownloadStatus(status);
    } catch {
      // Older builds without the native update plugin keep the web fallback.
    }
  }
});

watch(
  () => store.online,
  (online, wasOnline) => {
    if (online && !wasOnline) updateCoordinator.scheduleAutomatic(true);
  },
);

onUnmounted(() => {
  settingsViewActive = false;
  updateCoordinator.dispose();
  cancelVersionHold();
  clearDownloadStallTimer();
  unsubscribeDiscovery?.();
  unsubscribeUpdateStopFailure?.();
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
.heat-cell { aspect-ratio: 1; min-width: 0; border: 0; border-radius: 4px; padding: 0; cursor: pointer; transition: transform 160ms cubic-bezier(.22,1,.36,1), filter 160ms ease; }
.heat-cell:active { transform: scale(.82); filter: brightness(1.08); }
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
.empty-scan { padding: 15px 0; color: var(--text-3); font-size: 13px; display: flex; justify-content: center; align-items: center; gap: 10px; }
.sync-off-note { margin: 12px 0 0; color: var(--text-2); font-size: 12px; line-height: 1.6; }
.manual-field { display: block; margin-top: 10px; }.manual-field > span { display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-2); }
.pairing-panel { margin-top: 12px; border-top: 1px solid var(--card-border); padding-top: 12px; }
.pairing-copy strong, .pairing-copy span { display: block; }
.pairing-copy strong { font-size: 13px; }
.pairing-copy span { margin-top: 4px; color: var(--text-3); font-size: 11px; line-height: 1.5; }
.pairing-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; margin-top: 10px; }
.pairing-input { letter-spacing: 0; font-variant-numeric: tabular-nums; text-align: center; font-weight: 800; }
.server-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 10px; }.server-actions .btn { padding-inline: 10px; }
.sync-message { margin-top: 10px; color: var(--accent-solid); font-size: 12px; }.sync-message.bad, .up-msg.bad { color: var(--danger); }
.row-end { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.version-hold { min-height: 44px; user-select: none; -webkit-user-select: none; }
.version-label { font-size: 13px; color: var(--accent-solid); display: grid; gap: 3px; }
.version-label small { color: var(--text-3); font-size: 10px; font-weight: 500; }
.up-msg { margin-top: 12px; color: var(--accent-solid); font-size: 13px; font-weight: 700; }
.up-has { margin-top: 12px; border-top: 1px solid var(--card-border); padding-top: 12px; }
.up-has.compact { padding-top: 10px; }
.up-ver { color: var(--accent-solid); font-weight: 800; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.up-ver > span { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px; }
.up-ver small { font-size: 11px; color: var(--text-3); font-weight: 600; }
.up-ver .update-source { color: var(--accent-solid); font-size: 10px; }
.up-notes { max-height: 150px; overflow-y: auto; margin: 8px 0 12px; color: var(--text-2); font-size: 12px; white-space: pre-line; }
.update-download-row { display: grid; grid-template-columns: minmax(0, 1fr) 82px; align-items: center; gap: 14px; margin-top: 12px; min-height: 82px; }
.update-actions { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: center; }
.download-primary { min-height: 42px; padding-inline: 13px; }
.browser-download { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--card-border); border-radius: 12px; padding: 0 10px; background: var(--bg-elev); color: var(--text-2); font-size: 12px; font-weight: 700; white-space: nowrap; }
.cancel-download { grid-column: 1 / -1; justify-self: start; border: 0; background: transparent; color: var(--text-3); font-size: 11px; padding: 2px 4px; }
.download-progress-compact { width: 82px; display: grid; justify-items: center; gap: 4px; color: var(--text-3); font-size: 10px; text-align: center; }
.download-progress-compact .progress-ring { width: 68px; height: 68px; }
.download-progress-compact .progress-ring::after { inset: 6px; }
.download-progress-compact .progress-ring span { font-size: 13px; }
.download-panel { margin-top: 14px; border-top: 1px solid var(--card-border); padding-top: 14px; }
.download-head { display: flex; align-items: center; gap: 14px; }
.progress-ring { --download-progress: 0%; width: 76px; height: 76px; flex: none; display: grid; place-items: center; border-radius: 50%; background: conic-gradient(var(--accent-solid) var(--download-progress), var(--card-border) 0); position: relative; }
.progress-ring::after { content: ''; position: absolute; inset: 7px; border-radius: 50%; background: var(--bg-elev); }
.progress-ring span { position: relative; z-index: 1; color: var(--accent-solid); font-size: 15px; font-weight: 800; }
.download-copy { min-width: 0; display: grid; gap: 4px; }.download-copy strong { font-size: 15px; }.download-copy span { color: var(--text-3); font-size: 12px; }
.progress-line { height: 7px; margin-top: 14px; overflow: hidden; border-radius: 999px; background: var(--card-border); }.progress-line span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent-from), var(--accent-to)); transition: width 300ms ease; }
.download-actions { display: flex; gap: 9px; margin-top: 12px; }.download-actions .btn { flex: 1; }
.history-mask { position: fixed; inset: 0; z-index: 120; display: flex; align-items: flex-end; justify-content: center; background: rgba(15,23,42,.42); }
.history-sheet { width: 100%; max-width: 640px; max-height: 82vh; display: flex; flex-direction: column; border-radius: 20px 20px 0 0; padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); }
.history-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.history-head h2 { margin: 0; font-size: 19px; }.history-head p { margin: 3px 0 0; color: var(--text-3); font-size: 12px; }
.history-head button { width: 36px; height: 36px; border: 1px solid var(--card-border); border-radius: 50%; background: var(--bg-elev); color: var(--text-2); font-size: 24px; line-height: 1; }
.history-state { min-height: 160px; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--text-3); font-size: 13px; }.history-state.bad { color: var(--danger); }
.release-list { overflow-y: auto; overscroll-behavior: contain; }
.release-item { padding: 13px 2px; border-top: 1px solid var(--card-border); }
.release-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.release-meta strong { color: var(--accent-solid); font-size: 15px; }.release-meta span { color: var(--text-3); font-size: 11px; }
.release-item p { margin: 7px 0; color: var(--text-2); font-size: 12px; line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; }
.release-item button { border: 0; background: transparent; color: var(--accent-solid); padding: 4px 0; font-size: 12px; font-weight: 700; }
.history-sheet-enter-active,.history-sheet-leave-active { transition: background-color 260ms cubic-bezier(.22,1,.36,1); }.history-sheet-enter-active .history-sheet,.history-sheet-leave-active .history-sheet { transition: transform 320ms cubic-bezier(.22,1,.36,1), opacity 220ms ease; }.history-sheet-enter-from,.history-sheet-leave-to { background-color: transparent; }.history-sheet-enter-from .history-sheet,.history-sheet-leave-to .history-sheet { transform: translateY(72px); opacity: 0; }
@media (max-width: 380px) { .overview-grid { grid-template-columns: 1fr 1fr; }.server-actions { grid-template-columns: 1fr; }.update-download-row { grid-template-columns: minmax(0,1fr) 72px; gap: 9px; }.update-actions { grid-template-columns: 1fr; }.browser-download { width: 100%; }.download-progress-compact { width: 72px; }.download-progress-compact .progress-ring { width: 62px; height: 62px; } }
@media (prefers-reduced-motion: reduce) { .history-sheet-enter-active,.history-sheet-leave-active,.history-sheet-enter-active .history-sheet,.history-sheet-leave-active .history-sheet { transition-duration: .01ms; } }
</style>
