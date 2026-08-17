(() => {
  'use strict';

  const release = Object.freeze({
    version: '0.15.1',
    android: {
      fileName: 'kaogong-checkin-v0.15.1.apk',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.15.1/kaogong-checkin-v0.15.1.apk',
      size: '47.92 MiB',
      sha256: '8E3A1BABDD442321A2F2340A4E42BE4940D82127F70E7D870020D292EEAD83C2',
    },
    windows: {
      fileName: 'kaogong-checkin-windows-x64-setup-v0.15.1.exe',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.15.1/kaogong-checkin-windows-x64-setup-v0.15.1.exe',
      size: '109.11 MiB',
      sha256: '79A5ACB0A93A0B1A425DFF3ACF08CD9574C58D14B22DC592A760B994696C7255',
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
