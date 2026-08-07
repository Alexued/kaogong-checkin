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
export const APP_VERSION = '0.6.0';

export interface ReleaseInfo {
  version: string;
  name: string;
  /** Release 附件中的 .apk 直链；没有则为 null */
  apkUrl: string | null;
  pageUrl: string;
  notes: string;
  publishedAt: string;
  source: 'lan' | 'github';
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchReleaseHistory(limit = 10): Promise<ReleaseInfo[]> {
  const r = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${limit}`, {
    headers: { Accept: 'application/vnd.github+json' },
  }, 8000);
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const releases = await r.json() as Array<Record<string, any>>;
  return releases.filter((release) => !release.draft).map(parseRelease);
}

function parseRelease(release: Record<string, any>): ReleaseInfo {
  const apk = (release.assets || []).find((asset: { name?: string }) => /\.apk$/i.test(asset?.name || ''));
  return {
    version: String(release.tag_name || '').replace(/^v/, ''),
    name: release.name || release.tag_name || '',
    apkUrl: apk ? apk.browser_download_url : null,
    pageUrl: release.html_url,
    notes: release.body || '',
    publishedAt: release.published_at || '',
    source: 'github',
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
}

interface NativeAppUpdatePlugin {
  startDownload(options: { url: string; fileName?: string }): Promise<AppUpdateDownloadStatus>;
  getDownloadStatus(options?: { downloadId?: number | string }): Promise<AppUpdateDownloadStatus>;
  installDownloadedApk(options?: { downloadId?: number | string }): Promise<{
    downloadId: number | null;
    status: 'permissionRequired' | 'installing';
  }>;
  cancelDownload(options?: { downloadId?: number | string }): Promise<AppUpdateDownloadStatus>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (status: AppUpdateDownloadStatus) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeAppUpdate = registerPlugin<NativeAppUpdatePlugin>('AppUpdate');

/** 比较语义化版本号：a > b 返回正数，相等 0，a < b 负数（忽略 v 前缀） */
export async function fetchLatestGitHubRelease(): Promise<ReleaseInfo> {
  const r = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  }, 8000);
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return parseRelease(await r.json());
}

function serverHttpBase(serverUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(serverUrl) ? serverUrl : `http://${serverUrl}`;
  return withProtocol.replace(/\/+$/, '');
}

export async function fetchLatestLanRelease(serverUrl = getServerUrl()): Promise<ReleaseInfo> {
  if (!serverUrl.trim()) throw new Error('LAN server is not configured');
  const baseUrl = serverHttpBase(serverUrl.trim());
  const r = await fetchWithTimeout(`${baseUrl}/api/update/latest`, {
    headers: { Accept: 'application/json' },
  }, 3000);
  if (!r.ok) throw new Error(`LAN update API ${r.status}`);
  const release = await r.json() as Partial<ReleaseInfo>;
  const version = release.version;
  const rawApkUrl = release.apkUrl;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !rawApkUrl) {
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
  };
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const serverUrl = getServerUrl();
  if (!shouldUseLanUpdate(isSyncEnabled(), serverUrl)) return fetchLatestGitHubRelease();
  const [lanResult, githubResult] = await Promise.allSettled([
    fetchLatestLanRelease(serverUrl),
    fetchLatestGitHubRelease(),
  ]);
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

export function startAppUpdateDownload(url: string, fileName?: string): Promise<AppUpdateDownloadStatus> {
  return NativeAppUpdate.startDownload({ url, fileName });
}

export function installAppUpdate(downloadId?: number | null) {
  return NativeAppUpdate.installDownloadedApk(downloadId == null ? undefined : { downloadId });
}

export function cancelAppUpdate(downloadId?: number | null): Promise<AppUpdateDownloadStatus> {
  return NativeAppUpdate.cancelDownload(downloadId == null ? undefined : { downloadId });
}
