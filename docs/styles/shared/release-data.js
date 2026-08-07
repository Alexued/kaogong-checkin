(() => {
  'use strict';

  const release = Object.freeze({
    version: '0.7.0',
    android: {
      fileName: 'kaogong-checkin-v0.7.0.apk',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.7.0/kaogong-checkin-v0.7.0.apk',
      size: '3.27 MiB',
      sha256: '2B52ECF3B0781494C4A55969EA90EA640628D903FAC86884CFDD6C45032A699A',
    },
    windows: {
      fileName: 'kaogong-checkin-windows-x64-setup-v0.7.0.exe',
      url: 'https://github.com/Alexued/kaogong-checkin/releases/download/v0.7.0/kaogong-checkin-windows-x64-setup-v0.7.0.exe',
      size: '91.38 MiB',
      sha256: 'BAA82D5395F05ECD364AFEC662F05B6A304A12BF7386F9A538DF92C74DFBFC18',
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
