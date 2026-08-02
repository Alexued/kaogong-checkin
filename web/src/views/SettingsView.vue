<template>
  <div class="page">
    <h1 class="page-title">设置</h1>
    <p class="page-sub">计划、主题与同步</p>

    <div class="section-title">打卡计划</div>
    <div class="card block">
      <label class="field">
        <span>计划结束日（超过后不再生成新任务，可空）</span>
        <input v-model="planEnd" type="date" class="input" />
      </label>
      <button class="btn" @click="savePlanEnd">保存</button>
    </div>

    <div class="section-title">主题</div>
    <div class="card block">
      <div class="seg">
        <button :class="{ on: store.settings.theme !== 'dark' }" @click="setTheme('light')">
          浅色清新
        </button>
        <button :class="{ on: store.settings.theme === 'dark' }" @click="setTheme('dark')">
          深色质感
        </button>
      </div>
    </div>

    <div class="section-title">上传同步</div>
    <div class="card block">
      <div class="sync-row">
        <div>
          <div class="sync-label">上传同步</div>
          <div class="hint">{{ syncEnabled ? '开启后与服务器保持同步' : '已关闭，仅使用本地数据' }}</div>
        </div>
        <label class="switch" title="切换上传同步">
          <input v-model="syncEnabled" type="checkbox" @change="toggleSync" />
          <span class="switch-track"></span>
        </label>
      </div>
      <button
        v-if="syncEnabled"
        class="btn overwrite-btn"
        :disabled="!store.online || overwriting"
        @click="overwriteLocal"
      >
        {{ overwriting ? '覆盖中…' : '用本地覆盖服务器' }}
      </button>
      <div v-if="syncEnabled && !store.online" class="sync-status">连接服务器后可执行覆盖</div>
      <div v-if="syncMessage" class="sync-status" :class="{ bad: syncMessage.startsWith('失败') }">
        {{ syncMessage }}
      </div>
    </div>

    <div class="section-title">版本更新</div>
    <div class="card block">
      <div class="row-end">
        <span class="conn on">当前版本 v{{ APP_VERSION }}</span>
        <button class="btn" :disabled="checking" @click="checkUpdate">
          {{ checking ? '检查中…' : '检查更新' }}
        </button>
      </div>
      <div v-if="updateState === 'latest'" class="up-msg">已是最新版本</div>
      <div v-else-if="updateState === 'error'" class="up-msg bad">检查失败，请检查网络后重试</div>
      <div v-else-if="updateState === 'has' && latest" class="up-has">
        <div class="up-ver">发现新版本 v{{ latest.version }}</div>
        <div v-if="latest.notes" class="up-notes">{{ latest.notes }}</div>
        <button class="btn dl-btn" @click="download">下载安装</button>
      </div>
    </div>

    <div class="section-title">服务器地址</div>
    <div class="card block">
      <label class="field">
        <span>如 192.168.1.5:8321（留空 = 同源，网页端一般用不到）</span>
        <input v-model="serverUrlInput" class="input" placeholder="host:port" />
      </label>
      <div class="row-end">
        <span class="conn" :class="{ on: store.online }">
          {{ store.online ? '已连接' : '未连接' }}
        </span>
        <button class="btn" @click="saveServerUrl">保存并重连</button>
      </div>
    </div>

    <template v-if="info">
      <div class="section-title">本机访问地址（手机浏览器/APP 用）</div>
      <div class="card block">
        <div v-for="ip in info.ips" :key="ip" class="addr">
          <div class="addr-text">
            <div class="url">http://{{ ip }}:{{ info.httpPort }}</div>
            <div class="hint">手机与电脑连同一 Wi-Fi 后访问</div>
          </div>
          <canvas :ref="(el) => setQrCanvas(el, `http://${ip}:${info.httpPort}`)"></canvas>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { useAppStore } from '../stores/app';
import { fetchInfo, getServerUrl, setServerUrl } from '../api/client';
import { startDiscovery, stopDiscovery } from '../api/discover';
import {
  isSyncEnabled,
  overwriteServerWithLocal,
  restartSync,
  setSyncEnabled,
} from '../api/sync';
import {
  APP_VERSION,
  compareVersions,
  fetchLatestRelease,
  openDownload,
  type ReleaseInfo,
} from '../api/update';
import type { ServerInfo } from '../types';

const store = useAppStore();

const planEnd = ref(store.settings.planEndDate || '');
const serverUrlInput = ref(getServerUrl());
const info = ref<ServerInfo | null>(null);
const syncEnabled = ref(isSyncEnabled());
const overwriting = ref(false);
const syncMessage = ref('');

// ---------- 检查更新 ----------
const checking = ref(false);
const updateState = ref<'' | 'latest' | 'has' | 'error'>('');
const latest = ref<ReleaseInfo | null>(null);

async function checkUpdate() {
  checking.value = true;
  updateState.value = '';
  try {
    const r = await fetchLatestRelease();
    if (compareVersions(r.version, APP_VERSION) > 0) {
      latest.value = r;
      updateState.value = 'has';
    } else {
      updateState.value = 'latest';
    }
  } catch {
    updateState.value = 'error';
  } finally {
    checking.value = false;
  }
}

function download() {
  const r = latest.value;
  if (r) void openDownload(r.apkUrl || r.pageUrl);
}

function savePlanEnd() {
  store.saveSettings({ planEndDate: planEnd.value || null });
}

async function toggleSync() {
  syncMessage.value = '';
  setSyncEnabled(syncEnabled.value);
  if (syncEnabled.value) {
    void startDiscovery();
    await refreshInfo();
  } else {
    await stopDiscovery();
    info.value = null;
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
    syncMessage.value = '失败：覆盖服务器未完成，本地数据和队列已保留';
  } finally {
    overwriting.value = false;
  }
}

function setTheme(theme: 'light' | 'dark') {
  store.saveSettings({ theme });
}

function saveServerUrl() {
  setServerUrl(serverUrlInput.value);
  restartSync();
}

async function refreshInfo() {
  try {
    info.value = await fetchInfo();
  } catch {
    info.value = null;
  }
}

onMounted(async () => {
  if (syncEnabled.value) await refreshInfo();
});

const qrJobs = new Map<HTMLCanvasElement, string>();
function setQrCanvas(el: Element | any, url: string) {
  if (!el) return;
  const canvas = el as HTMLCanvasElement;
  qrJobs.set(canvas, url);
  QRCode.toCanvas(canvas, url, { width: 96, margin: 1 }).catch(() => {});
}
</script>

<style scoped>
.block {
  padding: 16px;
}

.sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sync-label {
  font-size: 15px;
  font-weight: 700;
}

.switch {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  width: 48px;
  height: 28px;
  cursor: pointer;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.switch-track {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  background: var(--text-3);
  transition: background 180ms ease;
}

.switch-track::after {
  content: '';
  display: block;
  width: 22px;
  height: 22px;
  margin: 3px;
  border-radius: 50%;
  background: #fff;
  transition: transform 180ms ease;
}

.switch input:checked + .switch-track {
  background: var(--accent-solid);
}

.switch input:checked + .switch-track::after {
  transform: translateX(20px);
}

.overwrite-btn {
  width: 100%;
  margin-top: 14px;
}

.sync-status {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-2);
}

.sync-status.bad {
  color: var(--danger);
}

.field {
  display: block;
  margin-bottom: 12px;
}

.field > span {
  display: block;
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 6px;
}

.seg {
  display: flex;
  gap: 8px;
}

.seg button {
  flex: 1;
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 12px;
  padding: 10px 0;
  font-size: 14px;
  cursor: pointer;
  transition: all 200ms ease;
}

.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent-solid);
  color: var(--accent-solid);
  font-weight: 600;
}

.row-end {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conn {
  font-size: 13px;
  color: var(--text-3);
}

.conn::before {
  content: '●';
  margin-right: 5px;
  color: var(--text-3);
}

.conn.on,
.conn.on::before {
  color: var(--accent-solid);
}

.up-msg {
  margin-top: 12px;
  font-size: 13.5px;
  color: var(--accent-solid);
  font-weight: 600;
}

.up-msg.bad {
  color: var(--danger);
}

.up-has {
  margin-top: 12px;
  border-top: 1px solid var(--card-border);
  padding-top: 12px;
}

.up-ver {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-solid);
}

.up-notes {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-2);
  white-space: pre-line;
  max-height: 160px;
  overflow-y: auto;
}

.dl-btn {
  width: 100%;
}

.addr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}

.addr + .addr {
  border-top: 1px solid var(--card-border);
}

.url {
  font-size: 16px;
  font-weight: 700;
}

.hint {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 3px;
}

.addr canvas {
  border-radius: 8px;
  background: #fff;
  padding: 4px;
}
</style>
