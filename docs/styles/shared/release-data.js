(() => {
  'use strict';

  const release = Object.freeze({
    version: '0.13.1',
    android: {
      fileName: 'kaogong-checkin-v0.13.1.apk',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.13.1/kaogong-checkin-v0.13.1.apk',
      size: '46.49 MiB',
      sha256: '7B3A3AD5AE75CA47C8A83DC68A69CD21D6DFAD0E98F135A2ACD3748DCA79F03F',
    },
    windows: {
      fileName: 'kaogong-checkin-windows-x64-setup-v0.13.1.exe',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.13.1/kaogong-checkin-windows-x64-setup-v0.13.1.exe',
      size: '106.94 MiB',
      sha256: 'FC78C351B760C2D9494055870EAB19F2CE42E75B406E975143C7889910A9ADBF',
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
