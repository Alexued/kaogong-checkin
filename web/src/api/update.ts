/**
 * 应用内检查更新：查询 GitHub 最新 Release，与当前版本比较；
 * 有新版本时用系统浏览器打开 APK 下载地址（浏览器下载后系统引导覆盖安装）。
 */
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const GITHUB_REPO = 'Alexued/kaogong-checkin';
export const APP_VERSION = '0.2.0';

export interface ReleaseInfo {
  version: string;
  name: string;
  /** Release 附件中的 .apk 直链；没有则为 null */
  apkUrl: string | null;
  pageUrl: string;
  notes: string;
  publishedAt: string;
}

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

/** 打开下载页：安卓走系统浏览器（触发 APK 下载），网页端新标签页 */
export async function openDownload(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank');
  }
}
