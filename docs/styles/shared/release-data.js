(() => {
  'use strict';

  const release = Object.freeze({
    version: '0.14.0',
    android: {
      fileName: 'kaogong-checkin-v0.14.0.apk',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.14.0/kaogong-checkin-v0.14.0.apk',
      size: '47.59 MiB',
      sha256: '2B8FD60031C241E5C09ED56563354F6FA430E332401815B6E7F0C386CFBC3013',
    },
    windows: {
      fileName: 'kaogong-checkin-windows-x64-setup-v0.14.0.exe',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.14.0/kaogong-checkin-windows-x64-setup-v0.14.0.exe',
      size: '108.80 MiB',
      sha256: '73BD388210BF32AB3F03D05A61A73AEA6B27DB1B43E9ADE92FF541AA56706AF9',
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
