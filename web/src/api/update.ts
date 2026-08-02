/**
 * 应用内检查更新：查询 GitHub 最新 Release，与当前版本比较；
 * 安卓客户端在应用内下载 APK 并显示进度，网页预览保留浏览器下载回退。
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const GITHUB_REPO = 'Alexued/kaogong-checkin';
export const APP_VERSION = '0.5.0';

export interface ReleaseInfo {
  version: string;
  name: string;
  /** Release 附件中的 .apk 直链；没有则为 null */
  apkUrl: string | null;
  pageUrl: string;
  notes: string;
  publishedAt: string;
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
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const j = await r.json();
  const apk = (j.assets || []).find((a: { name?: string }) => /\.apk$/i.test(a?.name || ''));
  return {
    version: String(j.tag_name || '').replace(/^v/, ''),
    name: j.name || j.tag_name || '',
    apkUrl: apk ? apk.browser_download_url : null,
    pageUrl: j.html_url,
    notes: j.body || '',
    publishedAt: j.published_at || '',
  };
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
