interface AdvertisedApk {
  key: string;
  serverId?: string;
  apkAvailable: boolean;
  apkVersion?: string;
}

export function canAutomaticallyCheckUpdates(syncEnabled: boolean, serverUrl: string): boolean {
  return syncEnabled && serverUrl.trim().length > 0;
}

export function automaticUpdateFingerprint(
  syncEnabled: boolean,
  serverUrl: string,
  appVersion: string,
  advertisedVersion = '',
): string {
  const normalizedServer = serverUrl.trim().toLowerCase();
  if (!canAutomaticallyCheckUpdates(syncEnabled, normalizedServer)) return '';
  return `lan|${normalizedServer}|${advertisedVersion}|${appVersion}`;
}

export function advertisedApkFingerprint(server?: AdvertisedApk): string {
  if (!server) return '';
  return `${server.serverId || server.key}|${server.apkAvailable ? server.apkVersion || 'available' : 'none'}`;
}
