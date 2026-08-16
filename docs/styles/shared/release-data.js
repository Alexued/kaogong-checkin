(() => {
  'use strict';

  const release = Object.freeze({
    version: '0.15.0',
    android: {
      fileName: 'kaogong-checkin-v0.15.0.apk',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.15.0/kaogong-checkin-v0.15.0.apk',
      size: '47.94 MiB',
      sha256: '38B99F0D4A577ADBDA3A6A08B0930314907024E3B4BF782C69B16B4F55644DA2',
    },
    windows: {
      fileName: 'kaogong-checkin-windows-x64-setup-v0.15.0.exe',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.15.0/kaogong-checkin-windows-x64-setup-v0.15.0.exe',
      size: '109.11 MiB',
      sha256: '8A9243EC786D420FE03EA5B42D6DDADAEA37FD73CAA27071D60F07EF22F47EA0',
    },
  });

  const textBindings = {
    version: release.version,
    'android-file': release.android.fileName,
    'android-size': release.android.size,
    'android-sha': release.android.sha256,
    'windows-file': release.windows.fileName,
    'windows-size': release.windows.size,
    'windows-sha': release.windows.sha256,
  };

  Object.entries(textBindings).forEach(([key, value]) => {
    document.querySelectorAll(`[data-release="${key}"]`).forEach((node) => {
      node.textContent = value;
    });
  });

  document.querySelectorAll('[data-release-link="android"]').forEach((node) => {
    node.setAttribute('href', release.android.url);
  });
  document.querySelectorAll('[data-release-link="windows"]').forEach((node) => {
    node.setAttribute('href', release.windows.url);
  });

  window.KAOGONG_RELEASE = release;
})();
