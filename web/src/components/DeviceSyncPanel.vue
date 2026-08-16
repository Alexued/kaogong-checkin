<template>
  <div v-if="showTitle" class="section-title">设备直连</div>
  <section class="card direct-card" aria-labelledby="direct-sync-title">
    <div class="direct-head">
      <div>
        <strong id="direct-sync-title">手机与平板直接传记录</strong>
        <span>同一 Wi-Fi 下先完成一次配对，之后传输无需重复输入配对码</span>
      </div>
      <PixelGrid v-if="successPulse" :key="successPulse" pattern="confirm" label="设备操作完成" once />
    </div>

    <p v-if="!supported" class="support-note">设备直连仅在 Android 应用中可用，浏览器不会开放本地监听端口。</p>

    <template v-else>
      <div v-if="store.recoveryRequired" class="recovery-direct-note" role="status">
        <strong>当前可发现和接收设备</strong>
        <span>本机记录尚未恢复，暂不能向外发送。可让已配对设备发送完整记录到本机，接收后会自动退出只读模式。</span>
        <router-link to="/settings#data-recovery">查看本机备份恢复方式</router-link>
      </div>

      <div class="toggle-list">
        <label class="toggle-row">
          <span><strong>允许附近设备发现本机</strong><small>开启后显示本机二维码，并可接收配对和传输请求</small></span>
          <span class="switch">
            <input :checked="discoverable" type="checkbox" :disabled="switching" @change="toggleDiscoverable" />
            <span class="switch-track"></span>
          </span>
        </label>
        <label class="toggle-row">
          <span><strong>主动搜索附近设备</strong><small>查找同一局域网内也开启了发现的格记设备</small></span>
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
            <span>{{ hostingInfo.model }} · 配对码 {{ countdownText }}</span>
          </div>
          <span class="live-badge">可发现</span>
        </div>
        <div class="pair-code" aria-label="六位设备配对码">{{ hostingInfo.pairingCode }}</div>
        <div class="qr-row">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="设备直连配对二维码" width="152" height="152" />
          <div>
            <strong>在另一台设备的格记中扫码</strong>
            <span>进入“设置 → 连接与同步 → 设备直连”，点击“扫码配对”。二维码不包含打卡记录。</span>
          </div>
        </div>
      </div>

      <div v-if="searching" class="peer-area">
        <div class="peer-heading">
          <span>附近设备</span>
          <div>
            <span v-if="pairedDevices.length" class="paired-count">已配对 {{ pairedDevices.length }}</span>
            <PixelGrid v-if="searchPulse" :key="searchPulse" preset="wave" label="正在搜索附近设备" once />
          </div>
        </div>

        <button
          v-for="peer in peers"
          :key="peer.deviceId"
          type="button"
          class="peer-row"
          :class="{
            selected: selectedPeer?.deviceId === peer.deviceId,
            paired: isPaired(peer),
            offline: !peer.online,
          }"
          :style="peerStyle(peer)"
          :disabled="!peer.online"
          @click="selectPeer(peer)"
        >
          <span class="peer-pixel" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="peer-copy">
            <strong>{{ peer.name }}</strong>
            <small>{{ peer.model }} · {{ peer.platform }}{{ peer.appVersion ? ` · v${peer.appVersion}` : '' }}</small>
          </span>
          <span class="peer-state">{{ isPaired(peer) ? '已配对' : '配对' }}</span>
        </button>

        <div v-if="!peers.length" class="peer-empty">
          <strong>还没有发现设备</strong>
          <span>确认另一台设备已打开“允许附近设备发现本机”，也可以直接扫描对方页面上的二维码。</span>
        </div>

        <button class="scan-entry" type="button" :disabled="busy" @click="openQrPairSheet">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z" /></svg>
          <span>扫码配对另一台设备</span>
        </button>
      </div>

      <div v-if="selectedPeer && selectedPairing" class="action-card" :style="peerStyle(selectedPeer)">
        <div class="selected-copy">
          <span class="paired-dot" aria-hidden="true"></span>
          <div><span>已配对设备</span><strong>{{ selectedPeer.name }}</strong><small>{{ selectedPeer.model }}</small></div>
          <button type="button" class="forget-btn" :disabled="busy" @click="forgetSelected">解除</button>
        </div>
        <div class="transfer-actions">
          <button class="btn ghost" type="button" :disabled="busy || store.recoveryRequired" @click="sendSelected">
            发送本机记录
          </button>
          <button class="btn" type="button" :disabled="busy" @click="receiveSelected">
            接收对方记录
          </button>
        </div>
        <p>配对仅免除重复输入验证码；每次完整替换仍会在目标设备上确认。</p>
      </div>

      <div v-if="statusMessage || operationError" class="direct-message" :class="{ bad: operationError }" aria-live="polite">
        {{ operationError || statusMessage }}
      </div>

      <div class="recovery-head">
        <div><strong>接收前恢复点</strong><span>机型决定颜色，时间决定颜色强度，最多保留最近 5 份</span></div>
        <button type="button" @click="reloadRecovery">刷新</button>
      </div>
      <div v-if="recoveryPoints.length" class="recovery-list">
        <button
          v-for="point in recoveryPoints"
          :key="point.id"
          type="button"
          :class="`age-${recoveryAge(point.createdAt)}`"
          :style="recoveryStyle(point)"
          :disabled="busy"
          @click="restore(point)"
        >
          <span class="recovery-marker" aria-hidden="true"></span>
          <span class="recovery-copy">
            <strong>{{ formatRecoveryTime(point.createdAt) }}</strong>
            <small>{{ point.sourceModel || point.sourceName || 'Android 设备' }} · {{ point.summary.taskCount }} 个项目</small>
          </span>
          <span class="recovery-age">{{ recoveryAgeLabel(point.createdAt) }}</span>
          <span class="restore-label">恢复</span>
        </button>
      </div>
      <p v-else class="recovery-empty">尚未创建设备直连恢复点。</p>
    </template>
  </section>

  <teleport to="body">
    <Transition name="pair-sheet">
      <div
        v-if="pairSheetOpen"
        class="pair-mask"
        data-back-dismiss
        data-back-priority="175"
        @click.self="closePairSheet"
      >
        <section class="pair-sheet" role="dialog" aria-modal="true" aria-labelledby="pair-sheet-title">
          <div class="pair-sheet-head">
            <div>
              <span>设备直连</span>
              <h2 id="pair-sheet-title">{{ pairingPeer ? `与“${pairingPeer.name}”配对` : '扫码配对设备' }}</h2>
            </div>
            <button type="button" aria-label="关闭配对窗口" :disabled="busy" @click="closePairSheet">×</button>
          </div>

          <div v-if="pairingPeer" class="pair-device">
            <span class="peer-pixel" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span><strong>{{ pairingPeer.name }}</strong><small>{{ pairingPeer.model }}</small></span>
          </div>

          <label v-if="pairingPeer" class="pair-code-field">
            <span>输入对方页面显示的六位码</span>
            <input
              ref="pairCodeInput"
              v-model="pairingCode"
              class="input pair-code-input"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="000000"
              @input="normalizePairingCode"
            />
          </label>

          <p class="pair-note">对方接受后，两台设备会记住彼此。以后发送和接收记录无需再次输入配对码。</p>
          <div v-if="pairError" class="pair-error" aria-live="polite">{{ pairError }}</div>

          <div class="pair-sheet-actions">
            <button class="btn ghost scan-btn" type="button" :disabled="busy" @click="scanAndPair">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z" /></svg>
              应用内扫码
            </button>
            <button v-if="pairingPeer" class="btn" type="button" :disabled="busy || pairingCode.length !== 6" @click="submitPairing">
              {{ busy ? '等待对方确认…' : '发送配对请求' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import QRCode from 'qrcode';
import { useAppStore } from '../stores/app';
import {
  clearPendingPeerTarget,
  deviceSyncState,
  forgetPeerPairing,
  pairWithPeer,
  peerFromTarget,
  receiveRecordsFromPeer,
  refreshPairedDevices,
  refreshRecoveryPoints,
  restoreRecoveryPoint,
  scanPeerPairingQr,
  sendRecordsToPeer,
  setDeviceDiscoverable,
  setDeviceSearching,
  type PairedDevice,
  type PeerDevice,
  type RecoveryPoint,
} from '../api/device-sync';
import {
  assignRecoveryAccents,
  pairingAccent,
  recoveryAgeBucket,
  recoveryAgeText,
  recoverySourceKey,
} from '../lib/deviceSyncVisuals';
import PixelGrid from './PixelGrid.vue';

withDefaults(defineProps<{ showTitle?: boolean }>(), { showTitle: true });

const {
  discoverable,
  searching,
  hostingInfo,
  peers,
  pairedDevices,
  recoveryPoints,
  pendingPeerTarget,
  statusMessage,
  busy,
  searchRevision,
  successRevision,
  peerRevision,
  pairingRevision,
} = deviceSyncState;
const store = useAppStore();
const supported = deviceSyncState.supported;
const switching = ref(false);
const selectedPeer = ref<PeerDevice | null>(null);
const operationError = ref('');
const qrDataUrl = ref('');
const now = ref(Date.now());
const searchPulse = ref(0);
const successPulse = ref(0);
const pairSheetOpen = ref(false);
const pairingPeer = ref<PeerDevice | null>(null);
const pairingCode = ref('');
const pairError = ref('');
const pairCodeInput = ref<HTMLInputElement | null>(null);
let clock: ReturnType<typeof setInterval> | null = null;

const pairedById = computed(() => new Map(pairedDevices.value.map((device) => [device.deviceId, device])));
const selectedPairing = computed(() => selectedPeer.value ? pairedById.value.get(selectedPeer.value.deviceId) || null : null);
const recoveryColors = computed(() => assignRecoveryAccents(recoveryPoints.value.map((point) => ({
  sourceModel: point.sourceModel || point.sourceName,
  sourceDeviceId: point.sourceDeviceId,
}))));

const countdownText = computed(() => {
  if (!hostingInfo.value) return '';
  const seconds = Math.max(0, Math.ceil((Date.parse(hostingInfo.value.expiresAt) - now.value) / 1000));
  return seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} 后更新` : '正在更新';
});

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('PAIRING_CODE')) return '配对码不正确或已失效，请查看对方设备上的最新六位码';
  if (code.includes('PAIRING_REQUIRED')) return '配对关系已失效，请重新输入六位码或扫码配对';
  if (code.includes('PAIRING')) return '配对失败，请保持两台设备停留在设备直连页面后重试';
  if (code.includes('REJECTED')) return '对方已拒绝本次请求';
  if (code.includes('REQUEST_NOT_FOUND')) return '确认已超时，请保持目标设备页面可见后重新发起';
  if (code.includes('TIMEOUT')) return '连接超时，请保持两台设备在同一 Wi-Fi，并让目标设备停留在此页面';
  if (code.includes('PUSH_FAILED') || code.includes('PULL_FAILED')) return '连接中断，请保持目标设备页面可见后重新发起';
  if (code.includes('OFFLINE') || code.includes('CONNECT')) return '无法连接对方，请确认处于同一 Wi-Fi';
  if (code.includes('SNAPSHOT')) return '记录校验失败，未修改本机数据';
  if (code.includes('LOCAL_ADDRESS')) return '无法获取局域网地址，请先连接 Wi-Fi 后重试';
  if (code.includes('HOST_START')) return '无法开放本机发现服务，请确认 Wi-Fi 已连接后重试';
  if (code.includes('DISCOVERY_START')) return '附近设备搜索启动失败，请关闭搜索开关后重试';
  if (code.includes('UNSUPPORTED_PEER_PROTOCOL')) return '二维码来自旧版本，请先更新另一台设备';
  if (code.includes('INVALID_PEER')) return '二维码不是有效的格记设备配对码';
  return '操作失败，本机记录未被修改';
}

async function toggleDiscoverable(event: Event) {
  const input = event.target as HTMLInputElement;
  switching.value = true;
  operationError.value = '';
  try { await setDeviceDiscoverable(input.checked); }
  catch (error) { operationError.value = messageFor(error); }
  finally {
    input.checked = discoverable.value;
    switching.value = false;
  }
}

async function toggleSearching(event: Event) {
  const input = event.target as HTMLInputElement;
  switching.value = true;
  operationError.value = '';
  try { await setDeviceSearching(input.checked); }
  catch (error) { operationError.value = messageFor(error); }
  finally {
    input.checked = searching.value;
    switching.value = false;
  }
}

function pairedDevice(peer: Pick<PeerDevice, 'deviceId'>): PairedDevice | null {
  return pairedById.value.get(peer.deviceId) || null;
}

function isPaired(peer: Pick<PeerDevice, 'deviceId'>) {
  return pairedById.value.has(peer.deviceId);
}

function peerStyle(peer: Pick<PeerDevice, 'deviceId'>) {
  const pairing = pairedDevice(peer);
  return pairing ? { '--peer-accent': pairingAccent(pairing.accentIndex) } : {};
}

function selectPeer(peer: PeerDevice) {
  operationError.value = '';
  if (!isPaired(peer)) {
    openPairSheet(peer);
    return;
  }
  selectedPeer.value = selectedPeer.value?.deviceId === peer.deviceId ? null : peer;
}

function openPairSheet(peer: PeerDevice | null) {
  pairingPeer.value = peer;
  pairingCode.value = '';
  pairError.value = '';
  pairSheetOpen.value = true;
  if (peer) void nextTick(() => pairCodeInput.value?.focus());
}

function openQrPairSheet() { openPairSheet(null); }

function closePairSheet() {
  if (busy.value) return;
  pairSheetOpen.value = false;
  pairingPeer.value = null;
  pairingCode.value = '';
  pairError.value = '';
}

function normalizePairingCode() {
  pairingCode.value = pairingCode.value.replace(/\D/g, '').slice(0, 6);
}

async function submitPairing() {
  const peer = pairingPeer.value;
  if (!peer || pairingCode.value.length !== 6) return;
  pairError.value = '';
  try {
    await pairWithPeer(peer, pairingCode.value);
    selectedPeer.value = peer;
    pairSheetOpen.value = false;
    pairingPeer.value = null;
    pairingCode.value = '';
  } catch (error) {
    pairError.value = messageFor(error);
  }
}

async function scanAndPair() {
  pairError.value = '';
  try {
    const target = await scanPeerPairingQr();
    if (!target) return;
    const discovered = peers.value.find((peer) => peer.deviceId === target.deviceId);
    pairingPeer.value = discovered || peerFromTarget(target, '二维码设备');
    pairingCode.value = target.pairingCode;
    await submitPairing();
  } catch (error) {
    pairError.value = messageFor(error);
  }
}

async function forgetSelected() {
  const peer = selectedPeer.value;
  if (!peer) return;
  operationError.value = '';
  try {
    if (await forgetPeerPairing(peer)) selectedPeer.value = null;
  } catch (error) {
    operationError.value = messageFor(error);
  }
}

async function sendSelected() {
  if (!selectedPeer.value) return;
  operationError.value = '';
  try { await sendRecordsToPeer(selectedPeer.value); }
  catch (error) { operationError.value = messageFor(error); }
}

async function receiveSelected() {
  if (!selectedPeer.value) return;
  operationError.value = '';
  try { await receiveRecordsFromPeer(selectedPeer.value); }
  catch (error) { operationError.value = messageFor(error); }
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

function recoveryAge(value: string): 'recent' | 'week' | 'older' {
  return recoveryAgeBucket(value, now.value);
}

function recoveryAgeLabel(value: string) {
  return recoveryAgeText(recoveryAge(value));
}

function recoveryStyle(point: RecoveryPoint) {
  const key = recoverySourceKey(point.sourceModel || point.sourceName, point.sourceDeviceId);
  return { '--recovery-accent': recoveryColors.value.get(key) };
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
watch(pairingRevision, () => {
  if (selectedPeer.value && !isPaired(selectedPeer.value)) selectedPeer.value = null;
});
watch(successRevision, (revision) => { if (revision) successPulse.value += 1; });
watch(pendingPeerTarget, (target) => {
  if (!target) return;
  const discovered = peers.value.find((peer) => peer.deviceId === target.deviceId);
  openPairSheet(discovered || peerFromTarget(target, '二维码设备'));
  pairingCode.value = target.pairingCode;
  clearPendingPeerTarget();
}, { immediate: true });

void refreshPairedDevices();
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
.recovery-direct-note { margin-top: 14px; padding: 12px; border: 1px solid color-mix(in srgb, var(--danger) 32%, var(--card-border)); border-radius: 8px; background: color-mix(in srgb, var(--danger) 6%, var(--card)); }
.recovery-direct-note strong, .recovery-direct-note span { display: block; }
.recovery-direct-note strong { color: var(--text); font-size: 13px; }
.recovery-direct-note span { margin-top: 4px; color: var(--text-2); font-size: 11px; line-height: 1.55; }
.recovery-direct-note a { min-height: 40px; display: inline-flex; align-items: center; margin-top: 3px; color: var(--danger); font-size: 11px; font-weight: 750; text-decoration: none; }
.toggle-list { margin-top: 14px; border-top: 1px solid var(--card-border); }
.toggle-row { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--card-border); cursor: pointer; }
.toggle-row > span:first-child { min-width: 0; }
.toggle-row strong, .toggle-row small { display: block; }
.toggle-row strong { color: var(--text); font-size: 14px; }
.toggle-row small { margin-top: 4px; color: var(--text-3); font-size: 11px; line-height: 1.45; }
.switch { position: relative; display: inline-flex; align-items: center; flex: none; width: 52px; height: 44px; }
.switch input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.switch-track { width: 48px; height: 28px; border-radius: 14px; background: var(--text-3); transition: background-color 180ms ease; }
.switch-track::after { content: ''; display: block; width: 22px; height: 22px; margin: 3px; border-radius: 50%; background: #fff; transition: transform 180ms cubic-bezier(.16, 1, .3, 1); }
.switch input:checked + .switch-track { background: var(--accent-solid); }
.switch input:checked + .switch-track::after { transform: translateX(20px); }
.switch input:focus-visible + .switch-track { outline: 2px solid var(--accent-solid); outline-offset: 2px; }
.switch input:disabled + .switch-track { opacity: .52; }
.host-card, .action-card { margin-top: 14px; padding: 14px; border: 1px solid color-mix(in srgb, var(--accent-solid) 22%, var(--card-border)); border-radius: 12px; background: color-mix(in srgb, var(--accent-soft) 34%, var(--card)); }
.host-topline, .peer-heading, .recovery-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.host-topline strong, .host-topline span { display: block; }
.host-topline strong { color: var(--text); font-size: 14px; }
.host-topline span { margin-top: 3px; color: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.live-badge { flex: none; margin: 0 !important; padding: 4px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-solid) !important; font-weight: 700; }
.pair-code { margin: 14px 0 8px; color: var(--text); font-size: clamp(32px, 10vw, 44px); font-weight: 750; letter-spacing: .15em; line-height: 1; font-variant-numeric: tabular-nums; text-align: center; }
.qr-row { display: grid; grid-template-columns: 132px 1fr; align-items: center; gap: 14px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--card-border); }
.qr-row img { width: 132px; height: 132px; padding: 6px; border-radius: 12px; background: #fff; }
.qr-row strong, .qr-row span { display: block; }
.qr-row strong { color: var(--text); font-size: 13px; line-height: 1.5; }
.qr-row span { margin-top: 6px; color: var(--text-3); font-size: 11px; line-height: 1.65; }
.peer-area { margin-top: 16px; }
.peer-heading { min-height: 34px; color: var(--text-2); font-size: 12px; font-weight: 700; }
.peer-heading > div { display: flex; align-items: center; gap: 8px; }
.peer-heading .pixel-grid { color: var(--accent-solid); }
.paired-count { color: var(--text-3); font-size: 10.5px; font-weight: 600; }
.peer-row { --peer-accent: var(--accent-solid); width: 100%; min-height: 68px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 11px; margin-top: 8px; padding: 10px 11px; border: 1px solid var(--card-border); border-radius: 12px; background: var(--card); color: var(--text-3); text-align: left; transition: transform 150ms cubic-bezier(.16, 1, .3, 1), border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease; }
.peer-row:active { transform: scale(.98); }
.peer-row.selected { background: color-mix(in srgb, var(--peer-accent) 8%, var(--card)); }
.peer-row.paired { border-color: var(--peer-accent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--peer-accent) 35%, transparent), 0 2px 8px color-mix(in srgb, var(--peer-accent) 12%, transparent); }
.peer-row.offline { opacity: .54; }
.peer-pixel { width: 28px; height: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; color: var(--peer-accent, var(--accent-solid)); }
.peer-pixel i { border-radius: 2px; background: currentColor; opacity: .24; }
.peer-pixel i:nth-child(2), .peer-pixel i:nth-child(3) { opacity: 1; }
.peer-copy { min-width: 0; }
.peer-copy strong, .peer-copy small { display: block; overflow-wrap: anywhere; }
.peer-copy strong { color: var(--text); font-size: 14px; }
.peer-copy small { margin-top: 4px; color: var(--text-3); font-size: 10.5px; }
.peer-state { color: var(--peer-accent, var(--accent-solid)); font-size: 11px; font-weight: 750; }
.peer-empty { margin-top: 8px; padding: 16px 13px; border-radius: 12px; background: var(--bg); }
.peer-empty strong, .peer-empty span { display: block; }
.peer-empty strong { color: var(--text-2); font-size: 13px; }
.peer-empty span { margin-top: 5px; color: var(--text-3); font-size: 11px; line-height: 1.6; }
.scan-entry { width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; border: 1px dashed var(--card-border); border-radius: 10px; background: transparent; color: var(--accent-solid); font: inherit; font-size: 12px; font-weight: 750; }
.scan-entry svg, .scan-btn svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.action-card { --peer-accent: var(--accent-solid); border-color: var(--peer-accent); background: color-mix(in srgb, var(--peer-accent) 5%, var(--card)); }
.selected-copy { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.selected-copy > div span, .selected-copy strong, .selected-copy small { display: block; }
.selected-copy > div span { color: var(--peer-accent); font-size: 10px; font-weight: 750; }
.selected-copy strong { margin-top: 2px; color: var(--text); font-size: 15px; }
.selected-copy small { margin-top: 2px; color: var(--text-3); font-size: 11px; }
.paired-dot { width: 12px; height: 12px; border-radius: 3px; background: var(--peer-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--peer-accent) 14%, transparent); }
.forget-btn { min-width: 44px; min-height: 44px; border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 11px; }
.transfer-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 12px; }
.transfer-actions .btn { min-height: 46px; }
.action-card > p { margin: 9px 0 0; color: var(--text-3); font-size: 10.5px; line-height: 1.55; }
.direct-message { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--accent-solid); font-size: 12px; line-height: 1.55; }
.direct-message.bad { background: color-mix(in srgb, var(--danger) 10%, var(--card)); color: var(--danger); }
.recovery-head { margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--card-border); }
.recovery-head strong, .recovery-head span { display: block; }
.recovery-head strong { color: var(--text); font-size: 13px; }
.recovery-head span { margin-top: 3px; color: var(--text-3); font-size: 10.5px; }
.recovery-head button { min-width: 44px; min-height: 44px; border: 0; padding: 8px 0; background: transparent; color: var(--accent-solid); font-size: 12px; font-weight: 700; }
.recovery-list { display: grid; gap: 7px; margin-top: 10px; }
.recovery-list button { --recovery-accent: var(--accent-solid); min-height: 60px; display: grid; grid-template-columns: 14px minmax(0, 1fr) auto auto; align-items: center; gap: 9px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--recovery-accent) 36%, var(--card-border)); border-radius: 10px; background: color-mix(in srgb, var(--recovery-accent) 4%, var(--bg)); color: var(--accent-solid); text-align: left; }
.recovery-list button.age-week { border-color: color-mix(in srgb, var(--recovery-accent) 24%, var(--card-border)); }
.recovery-list button.age-older { border-color: color-mix(in srgb, var(--recovery-accent) 14%, var(--card-border)); }
.recovery-marker { width: 11px; height: 11px; border-radius: 3px; background: var(--recovery-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--recovery-accent) 12%, transparent); }
.age-week .recovery-marker { opacity: .72; }
.age-older .recovery-marker { opacity: .46; }
.recovery-copy { min-width: 0; }
.recovery-copy strong, .recovery-copy small { display: block; }
.recovery-copy strong { color: var(--text-2); font-size: 12px; }
.recovery-copy small { margin-top: 4px; overflow: hidden; color: var(--text-3); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.recovery-age { color: color-mix(in srgb, var(--recovery-accent) 78%, var(--text)); font-size: 9.5px; white-space: nowrap; }
.restore-label { color: var(--accent-solid); font-size: 11px; font-weight: 750; }
.pair-mask { position: fixed; inset: 0; z-index: 175; display: grid; place-items: center; padding: 18px; background: rgba(15, 23, 42, .24); overscroll-behavior: contain; }
.pair-sheet { width: min(100%, 390px); max-height: min(82vh, 620px); overflow: auto; padding: 16px; border-radius: 12px; background: var(--bg-elev); box-shadow: 0 20px 56px rgba(15, 23, 42, .26), 0 4px 14px rgba(15, 23, 42, .14); }
.pair-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pair-sheet-head span { color: var(--accent-solid); font-size: 10px; font-weight: 750; }
.pair-sheet-head h2 { margin: 3px 0 0; color: var(--text); font-size: 18px; line-height: 1.35; }
.pair-sheet-head button { width: 44px; height: 44px; border: 0; border-radius: 8px; background: var(--bg); color: var(--text-2); font-size: 24px; line-height: 1; }
.pair-device { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 11px; margin-top: 14px; padding: 12px; border-radius: 10px; background: var(--bg); }
.pair-device strong, .pair-device small { display: block; }
.pair-device strong { color: var(--text); font-size: 14px; }
.pair-device small { margin-top: 3px; color: var(--text-3); font-size: 11px; }
.pair-code-field { display: block; margin-top: 14px; }
.pair-code-field > span { display: block; margin-bottom: 6px; color: var(--text-2); font-size: 12px; }
.pair-code-input { height: 54px; font-size: 22px; font-variant-numeric: tabular-nums; letter-spacing: .16em; text-align: center; }
.pair-note { margin: 12px 0 0; color: var(--text-3); font-size: 11px; line-height: 1.65; }
.pair-error { margin-top: 10px; padding: 9px 10px; border-radius: 8px; background: color-mix(in srgb, var(--danger) 9%, var(--card)); color: var(--danger); font-size: 11px; line-height: 1.55; }
.pair-sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 14px; }
.pair-sheet-actions:has(.scan-btn:only-child) { grid-template-columns: 1fr; }
.scan-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.pair-sheet-enter-active { transition: opacity 180ms ease-out; }
.pair-sheet-leave-active { transition: opacity 140ms ease-in; }
.pair-sheet-enter-active .pair-sheet { transition: transform 240ms cubic-bezier(.16, 1, .3, 1), opacity 180ms ease-out; }
.pair-sheet-leave-active .pair-sheet { transition: transform 140ms ease-in, opacity 120ms ease-in; }
.pair-sheet-enter-from, .pair-sheet-leave-to { opacity: 0; }
.pair-sheet-enter-from .pair-sheet { opacity: 0; transform: translateY(12px) scale(.96); }
.pair-sheet-leave-to .pair-sheet { opacity: 0; transform: translateY(5px) scale(.98); }
@media (max-width: 380px) {
  .qr-row { grid-template-columns: 108px 1fr; }
  .qr-row img { width: 108px; height: 108px; }
  .transfer-actions, .pair-sheet-actions { grid-template-columns: 1fr; }
  .pair-code { letter-spacing: .1em; }
  .recovery-list button { grid-template-columns: 14px minmax(0, 1fr) auto; }
  .recovery-age { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .peer-row, .switch-track, .switch-track::after,
  .pair-sheet-enter-active, .pair-sheet-leave-active,
  .pair-sheet-enter-active .pair-sheet, .pair-sheet-leave-active .pair-sheet { transition-duration: .01ms; }
}
</style>
