'use strict';

const { verifyEmbeddedApk } = require('./desktop-apk');

const verified = verifyEmbeddedApk();
console.log(`Verified ${verified.fileName} (${verified.size} bytes, sha256:${verified.sha256})`);
