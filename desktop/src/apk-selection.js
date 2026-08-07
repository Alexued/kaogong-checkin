'use strict';

function selectCanonicalApk(rawStatus, fallbackSelector) {
  const status = rawStatus && typeof rawStatus === 'object' ? rawStatus : {};
  if (Object.hasOwn(status, 'apkAvailable')) {
    if (!status.apkAvailable || !status.apkFileName) return null;
    return {
      fileName: String(status.apkFileName),
      version: String(status.apkVersion || ''),
      size: Number(status.apkSize) || 0,
    };
  }

  return typeof fallbackSelector === 'function' ? fallbackSelector() : null;
}

module.exports = { selectCanonicalApk };
