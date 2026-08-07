(() => {
  'use strict';

  const release = Object.freeze({
    version: '0.7.1',
    android: {
      fileName: 'kaogong-checkin-v0.7.1.apk',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.7.1/kaogong-checkin-v0.7.1.apk',
      size: '3.27 MiB',
      sha256: '8D853018D8866DAA7123345166C6DE3F079C24AF9B7B09F0A8D8B7DDBB083689',
    },
    windows: {
      fileName: 'kaogong-checkin-windows-x64-setup-v0.7.1.exe',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.7.1/kaogong-checkin-windows-x64-setup-v0.7.1.exe',
      size: '91.38 MiB',
      sha256: 'DECAD4791F4A93609E04D89CEE026F41E5FBFE4FDE380D51FEF84A73D45FE474',
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
