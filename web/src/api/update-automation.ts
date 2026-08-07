interface AdvertisedApk {
  key: string;
  serverId?: string;
  apkAvailable: boolean;
  apkVersion?: string;
}

export function automaticUpdateFingerprint(
  syncEnabled: boolean,
  serverUrl: string,
  appVersion: string,
  advertisedVersion = '',
): string {
  const normalizedServer = serverUrl.trim().toLowerCase();
  const useLan = syncEnabled && normalizedServer.length > 0;
  return `${useLan ? 'lan' : 'github'}|${useLan ? normalizedServer : ''}|${useLan ? advertisedVersion : ''}|${appVersion}`;
}

export function advertisedApkFingerprint(server?: AdvertisedApk): string {
  if (!server) return '';
  return `${server.serverId || server.key}|${server.apkAvailable ? server.apkVersion || 'available' : 'none'}`;
}
