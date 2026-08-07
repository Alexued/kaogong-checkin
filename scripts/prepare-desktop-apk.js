'use strict';

const path = require('node:path');
const { ROOT } = require('./release-lib');
const { prepareEmbeddedApk } = require('./desktop-apk');

const source = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'web', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const prepared = prepareEmbeddedApk(source);
console.log(`Prepared ${prepared.fileName} (${prepared.size} bytes, sha256:${prepared.sha256})`);
