/**
 * 应用内检查更新：查询 GitHub 最新 Release，与当前版本比较；
 * 安卓客户端在应用内下载 APK 并显示进度，网页预览保留浏览器下载回退。
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { getServerUrl } from './client';
import { compareVersions, selectPreferredRelease, shouldUseLanUpdate } from './update-selection';
import { isSyncEnabled } from './sync-preference';

export { compareVersions } from './update-selection';

export const GITHUB_REPO = 'Alexued/kaogong-checkin';
export const APP_VERSION = '0.15.0';
export const ANDROID_VERSION_CODE = 19;
export const RELEASE_STATE_SCHEMA_VERSION = 3;
export const RELEASE_SYNC_PROTOCOL_VERSION = 3;
export const BACKUP_FORMAT_VERSION = 1;
export const APPLICATION_ID = 'com.wjy.kaogong';
export const RELEASE_CHANNEL = 'internal-debug';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface ReleaseInfo {
  version: string;
  name: string;
  /** Release 附件中的 .apk 直链；没有则为 null */
  apkUrl: string | null;
  pageUrl: string;
  notes: string;
  publishedAt: string;
  source: 'lan' | 'github';
  fileName: string | null;
  size: number | null;
  sha256: string | null;
  applicationId: string;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  signals: AbortSignal[] = [],
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = (signal: AbortSignal) => controller.abort(signal.reason);
  const activeSignals = signals.filter(Boolean);
  const abortListeners = new Map<AbortSignal, () => void>();
  for (const signal of activeSignals) {
    if (signal.aborted) abort(signal);
    else {
      const listener = () => abort(signal);
      abortListeners.set(signal, listener);
      signal.addEventListener('abort', listener, { once: true });
    }
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    for (const [signal, listener] of abortListeners) signal.removeEventListener('abort', listener);
  }
}

const lanUpdateControllers = new Set<AbortController>();

function abortError(message: string): DOMException {
  return new DOMException(message, 'AbortError');
}

function assertLanUpdateAllowed(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : abortError('LAN update check was cancelled');
  if (!isSyncEnabled()) throw abortError('Computer sync is disabled');
}

/** Abort every in-flight LAN metadata request without affecting GitHub checks. */
export function cancelLanUpdateRequests() {
  for (const controller of lanUpdateControllers) controller.abort(abortError('LAN update check was cancelled'));
  lanUpdateControllers.clear();
}

export async function fetchReleaseHistory(limit = 10, signal?: AbortSignal): Promise<ReleaseInfo[]> {
  const r = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${limit}`, {
    headers: { Accept: 'application/vnd.github+json' },
  }, 8000, signal ? [signal] : []);
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const releases = await r.json() as Array<Record<string, any>>;
  return Promise.all(releases.filter((release) => !release.draft).map((release) => parseRelease(release, signal)));
}

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string | null;
  size?: number;
}

export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, '');
  return SHA256_PATTERN.test(normalized) ? normalized : null;
}

async function manifestDigest(
  release: Record<string, any>,
  apk: GitHubAsset,
  version: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const manifestAsset = (release.assets || []).find(
    (asset: GitHubAsset) => asset?.name === 'release-manifest.json' && asset.browser_download_url,
  ) as GitHubAsset | undefined;
  if (!manifestAsset?.browser_download_url || !apk.name) return null;
  try {
    const response = await fetchWithTimeout(manifestAsset.browser_download_url, {
      headers: { Accept: 'application/json' },
    }, 8000, signal ? [signal] : []);
    if (!response.ok) return null;
    const manifest = await response.json() as Record<string, unknown>;
    const size = Number(manifest.size);
    if (
      manifest.version !== version
      || manifest.fileName !== apk.name
      || manifest.applicationId !== APPLICATION_ID
      || !Number.isSafeInteger(size)
      || size < 0
      || (Number.isSafeInteger(apk.size) && size !== apk.size)
    ) return null;
    return normalizeSha256(manifest.sha256);
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : abortError('Update check was cancelled');
    }
    return null;
  }
}

async function parseRelease(release: Record<string, any>, signal?: AbortSignal): Promise<ReleaseInfo> {
  const version = String(release.tag_name || '').replace(/^v/, '');
  const expectedFileName = `kaogong-checkin-v${version}.apk`;
  const apk = (release.assets || []).find(
    (asset: GitHubAsset) => asset?.name === expectedFileName,
  ) as GitHubAsset | undefined;
  const sha256 = apk ? normalizeSha256(apk.digest) || await manifestDigest(release, apk, version, signal) : null;
  return {
    version,
    name: release.name || release.tag_name || '',
    apkUrl: apk?.browser_download_url || null,
    pageUrl: release.html_url,
    notes: release.body || '',
    publishedAt: release.published_at || '',
    source: 'github',
    fileName: apk?.name || null,
    size: Number.isSafeInteger(apk?.size) ? Number(apk?.size) : null,
    sha256,
    applicationId: APPLICATION_ID,
  };
}

export type AppUpdateDownloadState =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'downloaded'
  | 'failed'
  | 'not_found'
  | 'unknown';

export interface AppUpdateDownloadStatus {
  downloadId: number | null;
  status: AppUpdateDownloadState | 'cancelled';
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  speedBytesPerSecond: number;
  fileName?: string;
  reason?: number;
  localUri?: string;
  removed?: boolean;
  preserved?: boolean;
}

interface NativeAppUpdatePlugin {
  startDownload(options: { url: string; fileName?: string; expectedSha256: string }): Promise<AppUpdateDownloadStatus>;
  getDownloadStatus(options?: { downloadId?: number | string }): Promise<AppUpdateDownloadStatus>;
  installDownloadedApk(options?: { downloadId?: number | string }): Promise<{
    downloadId: number | null;
    status: 'permissionRequired' | 'installing';
  }>;
  cancelDownload(options?: { downloadId?: number | string }): Promise<AppUpdateDownloadStatus | undefined>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (status: AppUpdateDownloadStatus) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeAppUpdate = registerPlugin<NativeAppUpdatePlugin>('AppUpdate');
const ACTIVE_UPDATE_SOURCE_KEY = 'kgc-active-update-source';
const ACTIVE_UPDATE_STOP_FAILED_KEY = 'kgc-active-update-stop-failed';
let pendingNativeDownload: Promise<AppUpdateDownloadStatus> | null = null;
let cancelLanWhenStarted = false;
const activeUpdateStopFailureListeners = new Set<(failed: boolean) => void>();

export function getActiveAppUpdateSource(): ReleaseInfo['source'] | null {
  const source = localStorage.getItem(ACTIVE_UPDATE_SOURCE_KEY);
  return source === 'lan' || source === 'github' ? source : null;
}

export function clearActiveAppUpdateSource() {
  localStorage.setItem(ACTIVE_UPDATE_SOURCE_KEY, '');
  rememberActiveAppUpdateStopFailure(false);
}

export function hasActiveAppUpdateStopFailure(): boolean {
  return localStorage.getItem(ACTIVE_UPDATE_STOP_FAILED_KEY) === 'true';
}

export function subscribeActiveAppUpdateStopFailure(listener: (failed: boolean) => void): () => void {
  activeUpdateStopFailureListeners.add(listener);
  listener(hasActiveAppUpdateStopFailure());
  return () => activeUpdateStopFailureListeners.delete(listener);
}

function rememberActiveAppUpdateStopFailure(failed: boolean) {
  localStorage.setItem(ACTIVE_UPDATE_STOP_FAILED_KEY, failed ? 'true' : '');
  for (const listener of activeUpdateStopFailureListeners) listener(failed);
}

function rememberActiveAppUpdateSource(source: ReleaseInfo['source']) {
  localStorage.setItem(ACTIVE_UPDATE_SOURCE_KEY, source);
}

export function shouldRetainActiveAppUpdateSource(status: AppUpdateDownloadStatus['status']): boolean {
  return ['queued', 'downloading', 'paused', 'unknown'].includes(status);
}

function acceptLanCancellation(status: AppUpdateDownloadStatus | undefined): AppUpdateDownloadStatus | undefined {
  if (status?.status === 'cancelled' && status.removed === false) {
    throw new Error('The LAN update download was not removed');
  }
  if (!status || ['cancelled', 'idle', 'downloaded', 'not_found'].includes(status.status)) {
    clearActiveAppUpdateSource();
    return status;
  }
  throw new Error(`The LAN update download is still ${status.status}`);
}

/** 比较语义化版本号：a > b 返回正数，相等 0，a < b 负数（忽略 v 前缀） */
export async function fetchLatestGitHubRelease(signal?: AbortSignal): Promise<ReleaseInfo> {
  const r = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  }, 8000, signal ? [signal] : []);
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return parseRelease(await r.json(), signal);
}

function serverHttpBase(serverUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(serverUrl) ? serverUrl : `http://${serverUrl}`;
  return withProtocol.replace(/\/+$/, '');
}

export async function fetchLatestLanRelease(serverUrl = getServerUrl(), signal?: AbortSignal): Promise<ReleaseInfo> {
  assertLanUpdateAllowed(signal);
  if (!serverUrl.trim()) throw new Error('LAN server is not configured');
  const controller = new AbortController();
  lanUpdateControllers.add(controller);
  try {
    const baseUrl = serverHttpBase(serverUrl.trim());
    const r = await fetchWithTimeout(`${baseUrl}/api/update/latest`, {
      headers: { Accept: 'application/json' },
    }, 3000, signal ? [controller.signal, signal] : [controller.signal]);
    assertLanUpdateAllowed(signal);
    if (!r.ok) throw new Error(`LAN update API ${r.status}`);
    const release = await r.json() as Partial<ReleaseInfo>;
    assertLanUpdateAllowed(signal);
    const version = release.version;
    const rawApkUrl = release.apkUrl;
    const sha256 = normalizeSha256(release.sha256);
    const expectedFileName = version ? `kaogong-checkin-v${version}.apk` : '';
    if (
      !version
      || !/^\d+\.\d+\.\d+$/.test(version)
      || !rawApkUrl
      || !sha256
      || release.applicationId !== APPLICATION_ID
      || release.fileName !== expectedFileName
      || !Number.isSafeInteger(release.size)
      || Number(release.size) < 0
    ) {
      throw new Error('LAN update API returned invalid metadata');
    }
    const apkUrl = new URL(rawApkUrl, `${baseUrl}/`).toString();
    if (!/^https?:\/\//i.test(apkUrl)) throw new Error('LAN update API returned an invalid APK URL');
    return {
      version,
      name: release.name || `kaogong-checkin v${version}`,
      apkUrl,
      pageUrl: release.pageUrl ? new URL(release.pageUrl, `${baseUrl}/`).toString() : apkUrl,
      notes: release.notes || '',
      publishedAt: release.publishedAt || '',
      source: 'lan',
      fileName: expectedFileName,
      size: Number(release.size),
      sha256,
      applicationId: APPLICATION_ID,
    };
  } finally {
    lanUpdateControllers.delete(controller);
  }
}

export async function fetchLatestRelease(options: { signal?: AbortSignal } = {}): Promise<ReleaseInfo> {
  const { signal } = options;
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : abortError('Update check was cancelled');
  const serverUrl = getServerUrl();
  if (!shouldUseLanUpdate(isSyncEnabled(), serverUrl)) return fetchLatestGitHubRelease(signal);
  const [lanResult, githubResult] = await Promise.allSettled([
    fetchLatestLanRelease(serverUrl, signal),
    fetchLatestGitHubRelease(signal),
  ]);
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : abortError('Update check was cancelled');
  const lan = isSyncEnabled() && lanResult.status === 'fulfilled' ? lanResult.value : null;
  const github = githubResult.status === 'fulfilled' ? githubResult.value : null;
  const selected = selectPreferredRelease(lan, github);
  if (!selected) throw new Error('No update source is available');
  return selected;
}

/** 非 Android 原生环境的下载回退。 */
export async function openDownload(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank');
  }
}

export function canDownloadInApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function subscribeAppUpdateProgress(
  listener: (status: AppUpdateDownloadStatus) => void,
): Promise<PluginListenerHandle> {
  return NativeAppUpdate.addListener('downloadProgress', listener);
}

export function getAppUpdateStatus(): Promise<AppUpdateDownloadStatus> {
  return NativeAppUpdate.getDownloadStatus();
}

export async function startAppUpdateDownload(
  url: string,
  fileName?: string,
  source: ReleaseInfo['source'] = 'github',
  expectedSha256?: string | null,
): Promise<AppUpdateDownloadStatus> {
  const normalizedSha256 = normalizeSha256(expectedSha256);
  if (!normalizedSha256) throw new Error('A trusted SHA-256 digest is required for in-app updates');
  if (pendingNativeDownload || getActiveAppUpdateSource()) {
    throw new Error('An app update download is already active');
  }
  rememberActiveAppUpdateSource(source);
  rememberActiveAppUpdateStopFailure(false);
  cancelLanWhenStarted = false;
  const nativeStart = NativeAppUpdate.startDownload({ url, fileName, expectedSha256: normalizedSha256 });
  let operation: Promise<AppUpdateDownloadStatus> | null = null;
  operation = (async () => {
    try {
      let status = await nativeStart;
      if (source === 'lan' && cancelLanWhenStarted) {
        const cancelled = acceptLanCancellation(await NativeAppUpdate.cancelDownload(
          status.downloadId == null ? undefined : { downloadId: status.downloadId },
        ));
        if (cancelled) status = cancelled;
      }
      return status;
    } catch (error) {
      if (!cancelLanWhenStarted) clearActiveAppUpdateSource();
      throw error;
    } finally {
      if (pendingNativeDownload === operation) {
        pendingNativeDownload = null;
        cancelLanWhenStarted = false;
      }
    }
  })();
  pendingNativeDownload = operation;
  return operation;
}

export function installAppUpdate(downloadId?: number | null) {
  return NativeAppUpdate.installDownloadedApk(downloadId == null ? undefined : { downloadId });
}

export async function cancelAppUpdate(downloadId?: number | null): Promise<AppUpdateDownloadStatus | undefined> {
  const status = await NativeAppUpdate.cancelDownload(downloadId == null ? undefined : { downloadId });
  if (status?.status === 'cancelled' && status.removed === false) {
    throw new Error('The app update download was not removed');
  }
  return status;
}

export async function cancelActiveLanAppUpdate(downloadId?: number | null): Promise<boolean> {
  if (getActiveAppUpdateSource() !== 'lan') return false;
  try {
    cancelLanWhenStarted = true;
    if (pendingNativeDownload) {
      try {
        await pendingNativeDownload;
        rememberActiveAppUpdateStopFailure(false);
        return true;
      } catch {
        // The initial cancellation can race native startup. Retry once against DownloadManager.
      }
    }
    acceptLanCancellation(await cancelAppUpdate(downloadId));
    rememberActiveAppUpdateStopFailure(false);
    return true;
  } catch (error) {
    rememberActiveAppUpdateStopFailure(true);
    throw error;
  }
}
