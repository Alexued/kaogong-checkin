export interface VersionedReleaseSource {
  version: string;
  source: 'lan' | 'github';
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (pa[index] || 0) - (pb[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function selectPreferredRelease<T extends VersionedReleaseSource>(
  lan: T | null,
  github: T | null,
): T | null {
  if (!lan) return github;
  if (!github) return lan;
  return compareVersions(lan.version, github.version) >= 0 ? lan : github;
}

export function shouldUseLanUpdate(syncEnabled: boolean, serverUrl: string): boolean {
  return syncEnabled && serverUrl.trim().length > 0;
}
