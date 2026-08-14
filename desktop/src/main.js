'use strict';

const {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} = require('electron');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { selectCanonicalApk } = require('./apk-selection');
const { version: DESKTOP_VERSION } = require('../package.json');

const PRODUCT_NAME = '格记电脑伴侣';
const DATA_FOLDER_NAME = 'KaogongCheckin';
const DEFAULT_HTTP_PORT = 8321;
const LAST_HTTP_PORT = 8330;
const UDP_PORT = 8322;
const GITHUB_REPOSITORY = 'https://github.com/Alexued/kaogong-checkin';
const GITHUB_RELEASES = `${GITHUB_REPOSITORY}/releases`;

let mainWindow = null;
let tray = null;
let serverInstance = null;
let serverFactoryPath = null;
let serverModuleExports = null;
let statusTimer = null;
let lifecycle = Promise.resolve();
let quitting = false;
let shutdownComplete = false;
let shutdownPromise = null;
let rendererReady = false;
let qrCache = { url: '', dataUrl: '' };
let runtimePaths = null;
let closeHintShown = false;
const recentLogs = [];

let desktopState = {
  phase: 'stopped',
  statusLabel: '尚未启动',
  lastError: null,
  httpPort: null,
  ips: [],
  primaryLanUrl: '',
  localUrl: '',
  pairingCode: '',
  protocolVersion: '',
  serverId: '',
  apk: {
    available: false,
    fileName: '',
    version: '',
    size: 0,
    sha256: '',
    applicationId: '',
    downloadUrl: '',
    qrDataUrl: '',
    error: '',
  },
  launchAtLogin: false,
  launchAtLoginAvailable: false,
  isPackaged: false,
  appVersion: DESKTOP_VERSION,
  dataDirectory: '',
  resources: { server: false, web: false, apk: false },
  logs: [],
  updatedAt: new Date().toISOString(),
};

function runExclusive(operation) {
  const next = lifecycle.then(operation, operation);
  lifecycle = next.catch(() => {});
  return next;
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function firstExisting(candidates, predicate = (candidate) => fs.existsSync(candidate)) {
  return candidates.find((candidate) => {
    try {
      return predicate(candidate);
    } catch {
      return false;
    }
  }) || candidates[0];
}

function resolveRuntimePaths() {
  const appPath = app.getAppPath();
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const packaged = app.isPackaged;
  const dataRoot = ensureDirectory(path.join(app.getPath('appData'), DATA_FOLDER_NAME));
  const dataDirectory = ensureDirectory(path.join(dataRoot, 'data'));
  const logsDirectory = ensureDirectory(path.join(dataRoot, 'logs'));

  const serverCandidates = packaged
    ? [
        path.join(appPath, 'server', 'server.js'),
        path.join(process.resourcesPath, 'server', 'server.js'),
        path.join(process.resourcesPath, 'server', 'src', 'server.js'),
      ]
    : [path.join(repositoryRoot, 'server', 'src', 'server.js')];

  const webCandidates = packaged
    ? [path.join(process.resourcesPath, 'web'), path.join(appPath, 'web')]
    : [path.join(repositoryRoot, 'web', 'dist')];

  const apkCandidates = packaged
    ? [path.join(process.resourcesPath, 'apk')]
    : [path.join(repositoryRoot, 'desktop', 'resources', 'apk'), repositoryRoot];

  const iconCandidates = packaged
    ? [path.join(appPath, 'assets', 'app-icon.png'), path.join(process.resourcesPath, 'app-icon.png')]
    : [path.join(repositoryRoot, 'docs', 'assets', 'app-icon.png')];

  return {
    appPath,
    repositoryRoot,
    dataRoot,
    dataDirectory,
    logsDirectory,
    logFile: path.join(logsDirectory, 'desktop.log'),
    serverModule: firstExisting(serverCandidates),
    webDirectory: firstExisting(webCandidates, (candidate) => fs.existsSync(path.join(candidate, 'index.html'))),
    updateDirectory: firstExisting(apkCandidates, (candidate) => fs.existsSync(candidate)),
    icon: firstExisting(iconCandidates),
  };
}

function cleanLogValue(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function recordLog(level, ...values) {
  const entry = {
    level,
    message: values.map(cleanLogValue).join(' ').replace(/[\r\n]+/g, ' ').slice(0, 600),
    at: new Date().toISOString(),
  };
  recentLogs.push(entry);
  if (recentLogs.length > 16) recentLogs.shift();

  if (runtimePaths) {
    const line = `[${entry.at}] [${level.toUpperCase()}] ${entry.message}\n`;
    fs.promises.appendFile(runtimePaths.logFile, line, 'utf8').catch(() => {});
  }
}

const serverLogger = Object.freeze({
  debug: (...values) => recordLog('debug', ...values),
  info: (...values) => recordLog('info', ...values),
  log: (...values) => recordLog('info', ...values),
  warn: (...values) => recordLog('warn', ...values),
  error: (...values) => recordLog('error', ...values),
});

function classifyError(error) {
  const code = error && error.code ? String(error.code) : '';
  const original = error && error.message ? error.message : String(error || '未知错误');
  if (code === 'EADDRINUSE' || code === 'KGC_HTTP_PORT_UNAVAILABLE' || /address.*in use|端口.*占用/i.test(original)) {
    return {
      code: 'PORTS_IN_USE',
      title: '没有可用端口',
      detail: `端口 ${DEFAULT_HTTP_PORT}-${LAST_HTTP_PORT} 均不可用。请关闭占用端口的软件后重试。`,
      at: new Date().toISOString(),
    };
  }
  if (/createKgcServer|server\.js|cannot find module/i.test(original)) {
    return {
      code: 'SERVER_RESOURCE_MISSING',
      title: '同步服务资源缺失',
      detail: 'Windows 伴侣仍可打开，但当前构建不包含可启动的同步服务。',
      at: new Date().toISOString(),
    };
  }
  return {
    code: code || 'SERVICE_ERROR',
    title: '同步服务未能启动',
    detail: original.slice(0, 320),
    at: new Date().toISOString(),
  };
}

function normalizeIps(value) {
  const source = Array.isArray(value) ? value : [];
  const unique = [...new Set(source.map(String))];
  return unique
    .filter((ip) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && !ip.startsWith('127.') && !ip.startsWith('169.254.'))
    .sort((left, right) => {
      const privateRank = (ip) => (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? 0 : 1);
      return privateRank(left) - privateRank(right) || left.localeCompare(right, 'en', { numeric: true });
    });
}

function normalizePairingCode(value) {
  if (value && typeof value === 'object') value = value.code || value.pairingCode;
  return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '').slice(0, 6) : '';
}

function loadServerModule() {
  const candidate = runtimePaths.serverModule;
  if (!candidate || !fs.existsSync(candidate)) {
    throw new Error(`createKgcServer resource not found: ${candidate || 'unknown path'}`);
  }
  if (serverModuleExports && serverFactoryPath === candidate) return serverModuleExports;
  delete require.cache[require.resolve(candidate)];
  serverModuleExports = require(candidate);
  serverFactoryPath = candidate;
  return serverModuleExports;
}

function loadServerFactory() {
  const serverModule = loadServerModule();
  const factory = serverModule.createKgcServer || serverModule.default || serverModule;
  if (typeof factory !== 'function') throw new TypeError('server.js does not export createKgcServer');
  return factory;
}

function inspectCanonicalApk(rawStatus) {
  try {
    return selectCanonicalApk(rawStatus, () => {
      const serverModule = loadServerModule();
      return typeof serverModule.findLatestApk === 'function'
        ? serverModule.findLatestApk(runtimePaths.updateDirectory)
        : null;
    });
  } catch (error) {
    recordLog('warn', 'Unable to inspect bundled APK:', error);
    return null;
  }
}

async function getRawServerStatus(fallback = {}) {
  if (!serverInstance || typeof serverInstance.getStatus !== 'function') return fallback || {};
  return (await serverInstance.getStatus()) || fallback || {};
}

async function getPairingCode() {
  if (!serverInstance || typeof serverInstance.getPairingCode !== 'function') return '';
  return normalizePairingCode(await serverInstance.getPairingCode());
}

function getLoginItemState() {
  const available = process.platform === 'win32' && app.isPackaged;
  if (!available) return { available, enabled: false };
  try {
    const settings = app.getLoginItemSettings({ args: ['--hidden'] });
    return { available, enabled: Boolean(settings.openAtLogin) };
  } catch (error) {
    recordLog('warn', 'Unable to read launch-at-login setting:', error);
    return { available, enabled: false };
  }
}

async function qrDataUrlFor(downloadUrl) {
  if (!downloadUrl) return '';
  if (qrCache.url === downloadUrl) return qrCache.dataUrl;
  const dataUrl = await QRCode.toDataURL(downloadUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: { dark: '#17191cff', light: '#ffffffff' },
  });
  qrCache = { url: downloadUrl, dataUrl };
  return dataUrl;
}

async function refreshDesktopState(rawStatus = null) {
  const raw = rawStatus || (await getRawServerStatus());
  const port = Number(raw.httpPort || raw.port || raw.actualHttpPort || desktopState.httpPort) || null;
  const ips = normalizeIps(raw.ips || raw.addresses || raw.lanAddresses);
  const pairingCode = desktopState.phase === 'running' ? await getPairingCode() : '';
  const localUrl = port ? `http://127.0.0.1:${port}/` : '';
  const primaryLanUrl = port && ips[0] ? `http://${ips[0]}:${port}/` : '';
  const apkFile = inspectCanonicalApk(raw);
  let downloadUrl = '';
  let qrDataUrl = '';
  let apkError = '';

  if (desktopState.phase === 'running' && apkFile && primaryLanUrl) {
    downloadUrl = `${primaryLanUrl}updates/${encodeURIComponent(apkFile.fileName)}`;
    try {
      qrDataUrl = await qrDataUrlFor(downloadUrl);
    } catch (error) {
      apkError = '二维码生成失败，仍可复制下载地址。';
      recordLog('error', 'QR generation failed:', error);
    }
  } else if (!apkFile) {
    apkError = '当前安装包未包含 Android APK。同步服务仍可正常使用。';
  } else if (desktopState.phase === 'running' && !primaryLanUrl) {
    apkError = '未找到可供手机访问的局域网地址。';
  }

  const loginItem = getLoginItemState();
  const webReady = fs.existsSync(path.join(runtimePaths.webDirectory, 'index.html'));
  const serverReady = Boolean(serverFactoryPath || fs.existsSync(runtimePaths.serverModule));
  const statusLabel =
    desktopState.phase === 'running'
      ? '服务正在运行'
      : desktopState.phase === 'starting'
        ? '正在启动'
        : desktopState.phase === 'stopping'
          ? '正在停止'
          : desktopState.phase === 'error'
            ? '需要处理'
            : '服务已停止';

  desktopState = {
    ...desktopState,
    statusLabel,
    httpPort: port,
    ips,
    primaryLanUrl,
    localUrl,
    pairingCode,
    protocolVersion: String(raw.protocolVersion || desktopState.protocolVersion || ''),
    serverId: String(raw.serverId || desktopState.serverId || ''),
    apk: {
      available: Boolean(apkFile),
      fileName: apkFile ? apkFile.fileName : '',
      version: apkFile ? apkFile.version : '',
      size: apkFile ? apkFile.size : 0,
      sha256: apkFile ? apkFile.sha256 : '',
      applicationId: apkFile ? apkFile.applicationId : '',
      downloadUrl,
      qrDataUrl,
      error: apkError,
    },
    launchAtLogin: loginItem.enabled,
    launchAtLoginAvailable: loginItem.available,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    dataDirectory: runtimePaths.dataRoot,
    resources: { server: serverReady, web: webReady, apk: Boolean(apkFile) },
    logs: recentLogs.slice(-8).reverse(),
    updatedAt: new Date().toISOString(),
  };

  publishState();
  return desktopState;
}

function publishState() {
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    mainWindow.webContents.send('desktop:state', desktopState);
  }
  rebuildTrayMenu();
}

function beginStatusPolling() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    if (desktopState.phase !== 'running') return;
    refreshDesktopState().catch((error) => recordLog('warn', 'Status refresh failed:', error));
  }, 2500);
  statusTimer.unref?.();
}

function stopStatusPolling() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
}

async function startService() {
  return runExclusive(async () => {
    if (desktopState.phase === 'running' || desktopState.phase === 'starting') return desktopState;
    desktopState = { ...desktopState, phase: 'starting', lastError: null };
    await refreshDesktopState({});
    recordLog('info', 'Starting local sync service');

    try {
      const createKgcServer = loadServerFactory();
      serverInstance = createKgcServer({
        dataDir: runtimePaths.dataDirectory,
        webDir: runtimePaths.webDirectory,
        updateDir: runtimePaths.updateDirectory,
        httpHost: '0.0.0.0',
        httpPort: DEFAULT_HTTP_PORT,
        httpPortEnd: LAST_HTTP_PORT,
        udpPort: UDP_PORT,
        allowLegacy: false,
        logger: serverLogger,
      });
      if (!serverInstance || typeof serverInstance.start !== 'function' || typeof serverInstance.close !== 'function') {
        throw new TypeError('createKgcServer must return start() and close() methods');
      }
      const startResult = (await serverInstance.start()) || {};
      desktopState = { ...desktopState, phase: 'running', lastError: null };
      await refreshDesktopState(await getRawServerStatus(startResult));
      beginStatusPolling();
      recordLog('info', `Local sync service started on port ${desktopState.httpPort || 'unknown'}`);
      await refreshDesktopState();
      return desktopState;
    } catch (error) {
      stopStatusPolling();
      recordLog('error', 'Local sync service failed:', error);
      if (serverInstance && typeof serverInstance.close === 'function') {
        try {
          await serverInstance.close();
        } catch (closeError) {
          recordLog('warn', 'Cleanup after failed start failed:', closeError);
        }
      }
      serverInstance = null;
      desktopState = { ...desktopState, phase: 'error', lastError: classifyError(error) };
      await refreshDesktopState({});
      return desktopState;
    }
  });
}

async function stopService(options = {}) {
  return runExclusive(async () => {
    if (!serverInstance && desktopState.phase === 'stopped') return desktopState;
    stopStatusPolling();
    desktopState = { ...desktopState, phase: 'stopping' };
    if (!options.silent) await refreshDesktopState({});
    recordLog('info', 'Stopping local sync service');

    try {
      if (serverInstance && typeof serverInstance.close === 'function') await serverInstance.close();
      serverInstance = null;
      qrCache = { url: '', dataUrl: '' };
      desktopState = {
        ...desktopState,
        phase: 'stopped',
        lastError: null,
        httpPort: null,
        ips: [],
        primaryLanUrl: '',
        localUrl: '',
        pairingCode: '',
      };
      recordLog('info', 'Local sync service stopped');
    } catch (error) {
      serverInstance = null;
      desktopState = { ...desktopState, phase: 'error', lastError: classifyError(error) };
      recordLog('error', 'Local sync service did not close cleanly:', error);
    }
    await refreshDesktopState({});
    return desktopState;
  });
}

async function regeneratePairing() {
  return runExclusive(async () => {
    if (desktopState.phase !== 'running' || !serverInstance) throw new Error('同步服务尚未运行');
    if (typeof serverInstance.regeneratePairing !== 'function') throw new Error('当前同步服务不支持重新生成配对码');
    await serverInstance.regeneratePairing();
    recordLog('info', 'Pairing code regenerated and existing tokens revoked');
    return refreshDesktopState();
  });
}

function getWindowIcon() {
  if (!runtimePaths || !runtimePaths.icon || !fs.existsSync(runtimePaths.icon)) return undefined;
  const image = nativeImage.createFromPath(runtimePaths.icon);
  return image.isEmpty() ? undefined : image;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: '#f5f6f8',
    icon: getWindowIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    publishState();
  });
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!closeHintShown && tray) {
      closeHintShown = true;
      tray.displayBalloon?.({
        title: PRODUCT_NAME,
        content: '同步服务仍在后台运行。可从系统托盘重新打开。',
        iconType: 'info',
      });
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) showMainWindow();
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function rebuildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const running = desktopState.phase === 'running';
  const busy = desktopState.phase === 'starting' || desktopState.phase === 'stopping';
  tray.setToolTip(`${PRODUCT_NAME} · ${desktopState.statusLabel}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开控制台', click: showMainWindow },
      { label: '打开网页版', enabled: running, click: () => openWebTarget('local') },
      { type: 'separator' },
      running
        ? { label: '停止同步服务', enabled: !busy, click: () => stopService() }
        : { label: '启动同步服务', enabled: !busy, click: () => startService() },
      { type: 'separator' },
      { label: '退出', click: requestQuit },
    ])
  );
}

function createTray() {
  let icon = getWindowIcon();
  if (!icon) icon = nativeImage.createEmpty();
  if (!icon.isEmpty()) icon = icon.resize({ width: 18, height: 18, quality: 'best' });
  tray = new Tray(icon);
  tray.on('double-click', showMainWindow);
  tray.on('click', showMainWindow);
  rebuildTrayMenu();
}

async function openWebTarget(target) {
  const targets = {
    local: desktopState.localUrl,
    repository: GITHUB_REPOSITORY,
    releases: GITHUB_RELEASES,
  };
  const selected = targets[target];
  if (!selected) throw new Error('当前地址不可用');
  const url = new URL(selected);
  const isLocal = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  const isGithub = url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith('/Alexued/kaogong-checkin');
  if (!isLocal && !isGithub) throw new Error('已阻止未授权的外部地址');
  await shell.openExternal(url.toString());
  return { ok: true };
}

function diagnosticText() {
  const lines = [
    `${PRODUCT_NAME} ${desktopState.appVersion}`,
    `状态: ${desktopState.statusLabel}`,
    `端口: ${desktopState.httpPort || '-'}`,
    `局域网地址: ${desktopState.primaryLanUrl || '-'}`,
    `协议版本: ${desktopState.protocolVersion || '-'}`,
    `服务资源: ${desktopState.resources.server ? '正常' : '缺失'}`,
    `网页资源: ${desktopState.resources.web ? '正常' : '缺失'}`,
    `APK 资源: ${desktopState.resources.apk ? desktopState.apk.fileName : '缺失'}`,
    `数据目录: ${desktopState.dataDirectory}`,
  ];
  if (desktopState.lastError) lines.push(`最近错误: ${desktopState.lastError.title} · ${desktopState.lastError.detail}`);
  return lines.join('\n');
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:get-state', () => desktopState);
  ipcMain.handle('service:start', () => startService());
  ipcMain.handle('service:stop', () => stopService());
  ipcMain.handle('service:regenerate-pairing', () => regeneratePairing());
  ipcMain.handle('desktop:copy', (_event, kind) => {
    const values = {
      address: desktopState.primaryLanUrl,
      pairing: desktopState.pairingCode,
      apk: desktopState.apk.downloadUrl,
      diagnostics: diagnosticText(),
    };
    if (!Object.prototype.hasOwnProperty.call(values, kind) || !values[kind]) {
      return { ok: false, message: '没有可复制的内容' };
    }
    try {
      clipboard.writeText(values[kind]);
      return { ok: true, message: '已复制' };
    } catch {
      return { ok: false, message: '请手动复制' };
    }
  });
  ipcMain.handle('desktop:open-web', (_event, target) => openWebTarget(target));
  ipcMain.handle('desktop:open-data-directory', async () => {
    const errorMessage = await shell.openPath(runtimePaths.dataRoot);
    if (errorMessage) throw new Error(errorMessage);
    return { ok: true };
  });
  ipcMain.handle('desktop:set-launch-at-login', async (_event, enabled) => {
    if (process.platform !== 'win32' || !app.isPackaged) {
      return { ok: false, message: '开机启动可在已安装的 Windows 版本中设置', state: desktopState };
    }
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--hidden'] });
    await refreshDesktopState();
    return { ok: true, state: desktopState };
  });
  ipcMain.handle('desktop:quit', () => {
    setImmediate(requestQuit);
    return { ok: true };
  });
}

async function requestQuit() {
  if (shutdownPromise) return shutdownPromise;
  quitting = true;
  shutdownPromise = (async () => {
    try {
      await stopService({ silent: true });
    } finally {
      shutdownComplete = true;
      if (tray && !tray.isDestroyed()) tray.destroy();
      app.quit();
    }
  })();
  return shutdownPromise;
}

async function initialize() {
  runtimePaths = resolveRuntimePaths();
  app.setAppUserModelId('io.github.alexued.kaogong-checkin.companion');
  recordLog('info', `Starting ${PRODUCT_NAME} ${app.getVersion()}`);
  desktopState = { ...desktopState, dataDirectory: runtimePaths.dataRoot, isPackaged: app.isPackaged, appVersion: app.getVersion() };
  registerIpcHandlers();
  createTray();
  createMainWindow();
  await refreshDesktopState({});
  await startService();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  const userDataDirectory = ensureDirectory(path.join(app.getPath('appData'), DATA_FOLDER_NAME));
  app.setPath('userData', userDataDirectory);

  app.on('second-instance', () => showMainWindow());
  app.on('activate', showMainWindow);
  app.on('window-all-closed', () => {});
  app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    requestQuit();
  });
  app.whenReady().then(initialize).catch((error) => {
    recordLog('error', 'Desktop initialization failed:', error);
    desktopState = { ...desktopState, phase: 'error', lastError: classifyError(error) };
    publishState();
  });
}

process.on('uncaughtException', (error) => {
  recordLog('error', 'Uncaught exception:', error);
  desktopState = { ...desktopState, phase: 'error', lastError: classifyError(error) };
  publishState();
});

process.on('unhandledRejection', (error) => {
  recordLog('error', 'Unhandled rejection:', error);
  desktopState = { ...desktopState, phase: 'error', lastError: classifyError(error) };
  publishState();
});
