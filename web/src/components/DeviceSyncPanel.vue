<template>
  <div class="section-title">设备直连</div>
  <section class="card direct-card" aria-labelledby="direct-sync-title">
    <div class="direct-head">
      <div>
        <strong id="direct-sync-title">手机与平板直接传记录</strong>
        <span>同一 Wi-Fi、应用保持前台，每次传输都由目标设备确认</span>
      </div>
      <PixelGrid
        v-if="successPulse"
        :key="successPulse"
        pattern="confirm"
        label="设备传输完成"
        once
      />
    </div>

    <p v-if="!supported" class="support-note">设备直连仅在 Android 应用中可用，浏览器不会开放本地监听端口。</p>

    <template v-else>
      <div class="toggle-list">
        <label class="toggle-row">
          <span><strong>允许附近设备发现本机</strong><small>开启后显示地址、配对码和二维码</small></span>
          <span class="switch">
            <input :checked="discoverable" type="checkbox" :disabled="switching" @change="toggleDiscoverable" />
            <span class="switch-track"></span>
          </span>
        </label>
        <label class="toggle-row">
          <span><strong>主动搜索附近设备</strong><small>只查找同一局域网内也开启了发现的格记设备</small></span>
          <span class="switch">
            <input :checked="searching" type="checkbox" :disabled="switching" @change="toggleSearching" />
            <span class="switch-track"></span>
          </span>
        </label>
      </div>

      <div v-if="hostingInfo" class="host-card">
        <div class="host-topline">
          <div>
            <strong>{{ hostingInfo.name }}</strong>
            <span>{{ hostingInfo.address }}:{{ hostingInfo.port }}</span>
          </div>
          <span class="live-badge">可发现</span>
        </div>
        <div class="pair-code" aria-label="六位设备配对码">{{ hostingInfo.pairingCode }}</div>
        <div class="host-foot">
          <span>配对码 {{ countdownText }}</span>
          <button type="button" @click="copyConnection">复制连接信息</button>
        </div>
        <div class="qr-row">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="设备直连二维码" width="152" height="152" />
          <div>
            <strong>用另一台设备的系统相机扫描</strong>
            <span>二维码只包含局域网地址和本次配对码，不包含任何打卡记录。</span>
          </div>
        </div>
      </div>

      <div v-if="searching" class="peer-area">
        <div class="peer-heading">
          <span>附近设备</span>
          <PixelGrid v-if="searchPulse" :key="searchPulse" preset="wave" label="正在搜索附近设备" once />
        </div>
        <button
          v-for="peer in peers"
          :key="peer.deviceId"
          type="button"
          class="peer-row"
          :class="{ selected: selectedPeer?.deviceId === peer.deviceId, offline: !peer.online }"
          :disabled="!peer.online"
          @click="selectPeer(peer)"
        >
          <span class="peer-pixel" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="peer-copy">
            <strong>{{ peer.name }}</strong>
            <small>{{ peer.platform }}{{ peer.appVersion ? ` · v${peer.appVersion}` : '' }} · {{ peer.host }}:{{ peer.port }}</small>
          </span>
          <span>{{ peer.online ? '选择' : '离线' }}</span>
        </button>
        <div v-if="!peers.length" class="peer-empty">
          <strong>还没有发现设备</strong>
          <span>确认另一台设备已打开“允许附近设备发现本机”，也可以直接使用下方地址或二维码。</span>
        </div>
      </div>

      <div class="manual-card">
        <div class="manual-title">
          <strong>使用地址和配对码</strong>
          <span>适用于路由器屏蔽设备发现，或二维码由聊天工具转发的情况</span>
        </div>
        <div class="manual-fields">
          <label><span>地址</span><input v-model="manualAddress" class="input" inputmode="url" placeholder="192.168.1.8:43120" /></label>
          <label><span>六位码</span><input v-model="manualCode" class="input code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" @input="normalizeCode" /></label>
        </div>
        <button class="btn ghost manual-use" type="button" :disabled="!manualReady" @click="useManualPeer">选择这台设备</button>
      </div>

      <div v-if="selectedPeer" class="action-card">
        <div class="selected-copy">
          <span>已选择</span>
          <strong>{{ selectedPeer.name }}</strong>
          <small>{{ selectedPeer.host }}:{{ selectedPeer.port }}</small>
        </div>
        <label class="selected-code">
          <span>输入对方显示的六位码</span>
          <input v-model="selectedCode" class="input code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" @input="normalizeSelectedCode" />
        </label>
        <div class="transfer-actions">
          <button class="btn ghost" type="button" :disabled="busy || selectedCode.length !== 6" @click="sendSelected">
            发送本机记录
          </button>
          <button class="btn" type="button" :disabled="busy || selectedCode.length !== 6" @click="receiveSelected">
            接收对方记录
          </button>
        </div>
      </div>

      <div v-if="statusMessage || operationError" class="direct-message" :class="{ bad: operationError }" aria-live="polite">
        {{ operationError || statusMessage }}
      </div>

      <div class="recovery-head">
        <div><strong>接收前恢复点</strong><span>自动保留最近 5 份，可撤销一次完整替换</span></div>
        <button type="button" @click="reloadRecovery">刷新</button>
      </div>
      <div v-if="recoveryPoints.length" class="recovery-list">
        <button v-for="point in recoveryPoints" :key="point.id" type="button" :disabled="busy" @click="restore(point)">
          <span><strong>{{ formatRecoveryTime(point.createdAt) }}</strong><small>{{ point.sourceName || '设备传输前' }} · {{ point.summary.taskCount }} 个项目</small></span>
          <span>恢复</span>
        </button>
      </div>
      <p v-else class="recovery-empty">尚未创建设备直连恢复点。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import QRCode from 'qrcode';
import {
  clearPendingPeerTarget,
  deviceSyncState,
  peerFromTarget,
  receiveRecordsFromPeer,
  refreshRecoveryPoints,
  restoreRecoveryPoint,
  sendRecordsToPeer,
  setDeviceDiscoverable,
  setDeviceSearching,
  type PeerDevice,
  type RecoveryPoint,
} from '../api/device-sync';
import { parseManualPeerAddress } from '../api/peer-transfer';
import PixelGrid from './PixelGrid.vue';

const {
  discoverable,
  searching,
  hostingInfo,
  peers,
  recoveryPoints,
  pendingPeerTarget,
  statusMessage,
  busy,
  searchRevision,
  successRevision,
  peerRevision,
} = deviceSyncState;
const supported = deviceSyncState.supported;
const switching = ref(false);
const selectedPeer = ref<PeerDevice | null>(null);
const selectedCode = ref('');
const manualAddress = ref('');
const manualCode = ref('');
const operationError = ref('');
const qrDataUrl = ref('');
const now = ref(Date.now());
const searchPulse = ref(0);
const successPulse = ref(0);
let clock: ReturnType<typeof setInterval> | null = null;

const manualReady = computed(() => {
  try {
    parseManualPeerAddress(manualAddress.value);
    return manualCode.value.length === 6;
  } catch {
    return false;
  }
});

const countdownText = computed(() => {
  if (!hostingInfo.value) return '';
  const seconds = Math.max(0, Math.ceil((Date.parse(hostingInfo.value.expiresAt) - now.value) / 1000));
  return seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} 后更新` : '正在更新';
});

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('PAIRING')) return '连接失败：配对码不正确或已失效';
  if (code.includes('REJECTED')) return '对方已拒绝本次传输';
  if (code.includes('TIMEOUT')) return '连接超时，请确认两台设备都保持前台';
  if (code.includes('OFFLINE') || code.includes('CONNECT')) return '无法连接对方，请确认处于同一 Wi-Fi';
  if (code.includes('SNAPSHOT')) return '记录校验失败，未修改本机数据';
  return '操作失败，本机记录未被修改';
}

async function toggleDiscoverable(event: Event) {
  switching.value = true;
  operationError.value = '';
  try { await setDeviceDiscoverable((event.target as HTMLInputElement).checked); }
  catch (error) { operationError.value = messageFor(error); }
  finally { switching.value = false; }
}

async function toggleSearching(event: Event) {
  switching.value = true;
  operationError.value = '';
  try { await setDeviceSearching((event.target as HTMLInputElement).checked); }
  catch (error) { operationError.value = messageFor(error); }
  finally { switching.value = false; }
}

function selectPeer(peer: PeerDevice) {
  selectedPeer.value = peer;
  selectedCode.value = '';
  operationError.value = '';
}

function normalizeCode() { manualCode.value = manualCode.value.replace(/\D/g, '').slice(0, 6); }
function normalizeSelectedCode() { selectedCode.value = selectedCode.value.replace(/\D/g, '').slice(0, 6); }

function useManualPeer() {
  if (!manualReady.value) return;
  const endpoint = parseManualPeerAddress(manualAddress.value);
  selectedPeer.value = peerFromTarget({ ...endpoint, pairingCode: manualCode.value });
  selectedCode.value = manualCode.value;
  operationError.value = '';
}

async function sendSelected() {
  if (!selectedPeer.value) return;
  operationError.value = '';
  try { await sendRecordsToPeer(selectedPeer.value, selectedCode.value); }
  catch (error) { operationError.value = messageFor(error); }
}

async function receiveSelected() {
  if (!selectedPeer.value) return;
  operationError.value = '';
  try { await receiveRecordsFromPeer(selectedPeer.value, selectedCode.value); }
  catch (error) { operationError.value = messageFor(error); }
}

async function copyConnection() {
  if (!hostingInfo.value) return;
  const text = `${hostingInfo.value.address}:${hostingInfo.value.port}  配对码 ${hostingInfo.value.pairingCode}`;
  try {
    await navigator.clipboard.writeText(text);
    operationError.value = '';
  } catch {
    operationError.value = '复制失败，请手动记录地址和配对码';
  }
}

async function reloadRecovery() {
  operationError.value = '';
  try { await refreshRecoveryPoints(); }
  catch (error) { operationError.value = messageFor(error); }
}

async function restore(point: RecoveryPoint) {
  operationError.value = '';
  try { await restoreRecoveryPoint(point); }
  catch (error) {
    console.error('[device-sync] recovery restore failed', error);
    operationError.value = messageFor(error);
  }
}

function formatRecoveryTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

watch(hostingInfo, async (info) => {
  qrDataUrl.value = info
    ? await QRCode.toDataURL(info.qrUri, { width: 304, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1f2937', light: '#ffffff' } })
    : '';
  if (info && !clock) clock = setInterval(() => { now.value = Date.now(); }, 1000);
  if (!info && clock) { clearInterval(clock); clock = null; }
}, { immediate: true });

watch(searchRevision, (revision) => { if (revision) searchPulse.value += 1; });
watch(peerRevision, (revision) => { if (revision) searchPulse.value += 1; });
watch(successRevision, (revision) => { if (revision) successPulse.value += 1; });
watch(pendingPeerTarget, (target) => {
  if (!target) return;
  manualAddress.value = `${target.host}:${target.port}`;
  manualCode.value = target.pairingCode;
  selectedPeer.value = peerFromTarget(target, '二维码连接设备');
  selectedCode.value = target.pairingCode;
  clearPendingPeerTarget();
}, { immediate: true });

onBeforeUnmount(() => { if (clock) clearInterval(clock); });
</script>

<style scoped>
.direct-card { padding: 16px; overflow: hidden; }
.direct-head { min-height: 44px; display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.direct-head strong, .direct-head span { display: block; }
.direct-head strong { color: var(--text); font-size: 16px; }
.direct-head span { margin-top: 4px; color: var(--text-3); font-size: 12px; line-height: 1.55; }
.direct-head .pixel-grid { flex: none; color: var(--accent-solid); }
.support-note, .recovery-empty { margin: 14px 0 0; color: var(--text-3); font-size: 12px; line-height: 1.65; }
.toggle-list { margin-top: 14px; border-top: 1px solid var(--card-border); }
.toggle-row { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--card-border); cursor: pointer; }
.toggle-row > span:first-child { min-width: 0; }
.toggle-row strong, .toggle-row small { display: block; }
.toggle-row strong { color: var(--text); font-size: 14px; }
.toggle-row small { margin-top: 4px; color: var(--text-3); font-size: 11px; line-height: 1.45; }
.switch { position: relative; display: inline-flex; align-items: center; flex: none; width: 52px; height: 44px; }
.switch input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.switch-track { width: 48px; height: 28px; border-radius: 14px; background: var(--text-3); transition: background-color 180ms ease; }
.switch-track::after { content: ''; display: block; width: 22px; height: 22px; margin: 3px; border-radius: 50%; background: #fff; transition: transform 180ms cubic-bezier(.16,1,.3,1); }
.switch input:checked + .switch-track { background: var(--accent-solid); }
.switch input:checked + .switch-track::after { transform: translateX(20px); }
.switch input:focus-visible + .switch-track { outline: 2px solid var(--accent-solid); outline-offset: 2px; }
.switch input:disabled + .switch-track { opacity: .52; }
.host-card, .manual-card, .action-card { margin-top: 14px; padding: 14px; border: 1px solid color-mix(in srgb, var(--accent-solid) 22%, var(--card-border)); border-radius: 15px; background: color-mix(in srgb, var(--accent-soft) 34%, var(--card)); }
.host-topline, .host-foot, .peer-heading, .recovery-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.host-topline strong, .host-topline span { display: block; }
.host-topline strong { color: var(--text); font-size: 14px; }
.host-topline span { margin-top: 3px; color: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.live-badge { flex: none; margin: 0 !important; padding: 4px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-solid) !important; font-weight: 700; }
.pair-code { margin: 14px 0 8px; color: var(--text); font-size: clamp(32px, 10vw, 44px); font-weight: 750; letter-spacing: .15em; line-height: 1; font-variant-numeric: tabular-nums; text-align: center; }
.host-foot { color: var(--text-3); font-size: 11px; }
.host-foot button, .peer-heading button, .recovery-head button { border: 0; padding: 5px 0; background: transparent; color: var(--accent-solid); font-size: 12px; font-weight: 700; }
.qr-row { display: grid; grid-template-columns: 132px 1fr; align-items: center; gap: 14px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--card-border); }
.qr-row img { width: 132px; height: 132px; padding: 6px; border-radius: 12px; background: #fff; }
.qr-row strong, .qr-row span { display: block; }
.qr-row strong { color: var(--text); font-size: 13px; line-height: 1.5; }
.qr-row span { margin-top: 6px; color: var(--text-3); font-size: 11px; line-height: 1.65; }
.peer-area { margin-top: 16px; }
.peer-heading { min-height: 34px; color: var(--text-2); font-size: 12px; font-weight: 700; }
.peer-heading .pixel-grid { color: var(--accent-solid); }
.peer-row { width: 100%; min-height: 64px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 11px; margin-top: 8px; padding: 10px 11px; border: 1px solid var(--card-border); border-radius: 13px; background: var(--card); color: var(--text-3); text-align: left; transition: transform 150ms cubic-bezier(.16,1,.3,1), border-color 150ms ease, background-color 150ms ease; }
.peer-row:active { transform: scale(.98); }
.peer-row.selected { border-color: color-mix(in srgb, var(--accent-solid) 54%, var(--card-border)); background: var(--accent-soft); }
.peer-row.offline { opacity: .54; }
.peer-pixel { width: 28px; height: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; color: var(--accent-solid); }
.peer-pixel i { border-radius: 2px; background: currentColor; opacity: .24; }
.peer-pixel i:nth-child(2), .peer-pixel i:nth-child(3) { opacity: 1; }
.peer-copy { min-width: 0; }
.peer-copy strong, .peer-copy small { display: block; overflow-wrap: anywhere; }
.peer-copy strong { color: var(--text); font-size: 14px; }
.peer-copy small { margin-top: 4px; color: var(--text-3); font-size: 10.5px; }
.peer-empty { margin-top: 8px; padding: 16px 13px; border-radius: 13px; background: var(--bg); }
.peer-empty strong, .peer-empty span { display: block; }
.peer-empty strong { color: var(--text-2); font-size: 13px; }
.peer-empty span { margin-top: 5px; color: var(--text-3); font-size: 11px; line-height: 1.6; }
.manual-card { border-color: var(--card-border); background: var(--bg); }
.manual-title strong, .manual-title span { display: block; }
.manual-title strong { color: var(--text); font-size: 13px; }
.manual-title span { margin-top: 4px; color: var(--text-3); font-size: 11px; line-height: 1.55; }
.manual-fields { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 9px; margin-top: 12px; }
.manual-fields label > span, .selected-code > span { display: block; margin-bottom: 5px; color: var(--text-3); font-size: 10.5px; }
.code-input { font-variant-numeric: tabular-nums; letter-spacing: .12em; text-align: center; }
.manual-use { width: 100%; margin-top: 10px; }
.action-card { background: var(--card); }
.selected-copy span, .selected-copy strong, .selected-copy small { display: block; }
.selected-copy span { color: var(--text-3); font-size: 10px; }
.selected-copy strong { margin-top: 3px; color: var(--text); font-size: 15px; }
.selected-copy small { margin-top: 3px; color: var(--text-3); font-size: 11px; }
.selected-code { display: block; margin-top: 12px; }
.transfer-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 11px; }
.transfer-actions .btn { min-height: 46px; }
.direct-message { margin-top: 12px; padding: 10px 12px; border-radius: 11px; background: var(--accent-soft); color: var(--accent-solid); font-size: 12px; line-height: 1.55; }
.direct-message.bad { background: color-mix(in srgb, var(--danger) 10%, var(--card)); color: var(--danger); }
.recovery-head { margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--card-border); }
.recovery-head strong, .recovery-head span { display: block; }
.recovery-head strong { color: var(--text); font-size: 13px; }
.recovery-head span { margin-top: 3px; color: var(--text-3); font-size: 10.5px; }
.recovery-list { display: grid; gap: 7px; margin-top: 10px; }
.recovery-list button { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 11px; border: 1px solid var(--card-border); border-radius: 12px; background: var(--bg); color: var(--accent-solid); text-align: left; }
.recovery-list strong, .recovery-list small { display: block; }
.recovery-list strong { color: var(--text-2); font-size: 12px; }
.recovery-list small { margin-top: 4px; color: var(--text-3); font-size: 10.5px; }
@media (max-width: 380px) {
  .qr-row { grid-template-columns: 108px 1fr; }
  .qr-row img { width: 108px; height: 108px; }
  .manual-fields, .transfer-actions { grid-template-columns: 1fr; }
  .pair-code { letter-spacing: .1em; }
}
@media (prefers-reduced-motion: reduce) {
  .peer-row, .switch-track, .switch-track::after { transition-duration: .01ms; }
}
</style>
