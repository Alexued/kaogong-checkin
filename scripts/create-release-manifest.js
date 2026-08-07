'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readVersion, sha256File, writeJson } = require('./release-lib');

const version = readVersion();
const apkArgument = process.argv[2];
if (!apkArgument) {
  console.error('Usage: node scripts/create-release-manifest.js <apk-path> [output-path]');
  process.exit(1);
}

const apkPath = path.resolve(apkArgument);
const expectedName = `kaogong-checkin-v${version.version}.apk`;
if (path.basename(apkPath) !== expectedName) {
  throw new Error(`APK must be named ${expectedName}`);
}
const stat = fs.statSync(apkPath);
if (!stat.isFile()) throw new Error(`${apkPath} is not a file`);

const outputPath = path.resolve(process.argv[3] || path.join(path.dirname(apkPath), 'release-manifest.json'));
writeJson(outputPath, {
  version: version.version,
  fileName: expectedName,
  size: stat.size,
  sha256: sha256File(apkPath),
  applicationId: version.applicationId,
});
console.log(outputPath);
