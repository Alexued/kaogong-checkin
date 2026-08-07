'use strict';

const api = window.kgcDesktop;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let currentState = null;
let toastTimer = 0;

function showToast(message) {
  const toast = $('[data-toast]');
  if (!toast || !message) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function render(state) {
  currentState = state;
  const running = state.phase === 'running';
  const busy = state.phase === 'starting' || state.phase === 'stopping';
  $('[data-status]').textContent = state.statusLabel;
  $('.status-pill').dataset.phase = state.phase;
  $('[data-service-title]').textContent = running ? '服务正在运行' : state.phase === 'error' ? '服务需要处理' : '服务处于关闭状态';
  $('[data-service-copy]').textContent = state.lastError?.detail || (running ? '保持此应用在后台运行，手机即可同步到这台电脑。' : '启动后，手机可通过六位配对码连接这台电脑。');
  const toggle = $('[data-service-toggle]');
  toggle.textContent = busy ? state.statusLabel : running ? '停止服务' : '启动服务';
  toggle.disabled = busy;
  $('[data-address]').textContent = state.primaryLanUrl || '服务启动后显示';
  $('[data-pairing]').textContent = state.pairingCode || '------';
  $('[data-protocol]').textContent = state.protocolVersion ? `v${state.protocolVersion}` : '--';
  $('[data-regenerate]').disabled = !running || busy;
  $$('[data-copy="address"],[data-copy="pairing"],[data-copy="apk"]').forEach((button) => { button.disabled = !running; });

  const qr = $('[data-qr]');
  const qrEmpty = $('[data-qr-empty]');
  if (state.apk.qrDataUrl) {
    qr.src = state.apk.qrDataUrl;
    qr.hidden = false;
    qrEmpty.hidden = true;
  } else {
    qr.removeAttribute('src');
    qr.hidden = true;
    qrEmpty.hidden = false;
    qrEmpty.textContent = state.apk.error || '安装包就绪后显示二维码';
  }
  $('[data-apk-name]').textContent = state.apk.available ? `${state.apk.fileName} · ${formatBytes(state.apk.size)}` : '未包含 Android APK';
  $('[data-apk-copy]').textContent = state.apk.error || '手机与电脑连接同一局域网后扫码下载。';
  $('[data-version]').textContent = `v${state.appVersion}`;
  const launch = $('[data-launch]');
  launch.checked = Boolean(state.launchAtLogin);
  launch.disabled = !state.launchAtLoginAvailable;
}

async function run(action, successMessage) {
  try {
    const result = await action();
    if (result?.state) render(result.state);
    if (result?.message || successMessage) showToast(result?.message || successMessage);
    return result;
  } catch (error) {
    showToast(error?.message || '操作失败，请稍后重试');
    return null;
  }
}

$('[data-service-toggle]').addEventListener('click', () => run(
  () => currentState?.phase === 'running' ? api.stopService() : api.startService(),
  currentState?.phase === 'running' ? '服务已停止' : '服务已启动',
));
$('[data-regenerate]').addEventListener('click', () => run(() => api.regeneratePairing(), '已生成新的配对码'));
$$('[data-copy]').forEach((button) => button.addEventListener('click', () => run(() => api.copy(button.dataset.copy))));
$$('[data-open-data]').forEach((button) => button.addEventListener('click', () => run(() => api.openDataDirectory())));
$('[data-open-local]').addEventListener('click', () => run(() => api.openWeb('local')));
$('[data-open-repository]').addEventListener('click', () => run(() => api.openWeb('repository')));
$('[data-launch]').addEventListener('change', (event) => run(() => api.setLaunchAtLogin(event.target.checked)));
$('[data-quit]').addEventListener('click', () => api.quit());

api.onState(render);
api.getState().then(render).catch((error) => showToast(error?.message || '无法读取应用状态'));
