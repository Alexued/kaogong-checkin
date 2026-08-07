'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readJson, readVersion } = require('./release-lib');

const expected = readVersion();
const errors = [];

function expectEqual(label, actual, value) {
  if (actual !== value) errors.push(`${label}: expected ${JSON.stringify(value)}, received ${JSON.stringify(actual)}`);
}

function captureExactlyOnce(filePath, pattern, label) {
  const source = fs.readFileSync(filePath, 'utf8');
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    errors.push(`${label}: expected one match, found ${matches.length}`);
    return null;
  }
  return matches[0][1];
}

for (const directory of ['web', 'server', 'desktop']) {
  for (const fileName of ['package.json', 'package-lock.json']) {
    const value = readJson(path.join(ROOT, directory, fileName));
    expectEqual(`${directory}/${fileName} version`, value.version, expected.version);
    if (fileName === 'package-lock.json') {
      expectEqual(`${directory}/${fileName} root package version`, value.packages?.['']?.version, expected.version);
    }
  }
}

const serverVersion = readJson(path.join(ROOT, 'server', 'src', 'version.json'));
expectEqual('server version', serverVersion.version, expected.version);
expectEqual('server versionCode', serverVersion.versionCode, expected.versionCode);
expectEqual('server applicationId', serverVersion.applicationId, expected.applicationId);

expectEqual(
  'Web APP_VERSION',
  captureExactlyOnce(path.join(ROOT, 'web', 'src', 'api', 'update.ts'), /export const APP_VERSION = '([^']+)';/, 'Web APP_VERSION'),
  expected.version,
);
expectEqual(
  'Web APPLICATION_ID',
  captureExactlyOnce(path.join(ROOT, 'web', 'src', 'api', 'update.ts'), /export const APPLICATION_ID = '([^']+)';/, 'Web APPLICATION_ID'),
  expected.applicationId,
);

const gradlePath = path.join(ROOT, 'web', 'android', 'app', 'build.gradle');
expectEqual('Android applicationId', captureExactlyOnce(gradlePath, /applicationId "([^"]+)"/, 'Android applicationId'), expected.applicationId);
expectEqual('Android versionCode', Number(captureExactlyOnce(gradlePath, /versionCode (\d+)/, 'Android versionCode')), expected.versionCode);
expectEqual('Android versionName', captureExactlyOnce(gradlePath, /versionName "([^"]+)"/, 'Android versionName'), expected.version);

expectEqual(
  'desktop fallback version',
  captureExactlyOnce(path.join(ROOT, 'desktop', 'src', 'renderer', 'index.html'), /<span data-version>v([^<]+)<\/span>/, 'desktop fallback version'),
  expected.version,
);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Version metadata is consistent at ${expected.version} (${expected.versionCode})`);
}
