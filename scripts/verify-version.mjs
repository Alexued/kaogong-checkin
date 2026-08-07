import fs from 'node:fs';
import path from 'node:path';

import releaseLib from './release-lib.js';

const { ROOT, readJson, readVersion } = releaseLib;
const expected = readVersion();
const errors = [];

function expectEqual(label, actual, value) {
  if (actual !== value) {
    errors.push(`${label}: expected ${JSON.stringify(value)}, received ${JSON.stringify(actual)}`);
  }
}

function captureExactlyOnce(filePath, pattern, label) {
  const source = fs.readFileSync(filePath, 'utf8');
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
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
      expectEqual(
        `${directory}/${fileName} root package version`,
        value.packages?.['']?.version,
        expected.version,
      );
    }
  }
}

const serverVersion = readJson(path.join(ROOT, 'server', 'src', 'version.json'));
for (const key of [
  'version',
  'versionCode',
  'stateSchemaVersion',
  'syncProtocolVersion',
  'backupFormatVersion',
  'applicationId',
  'releaseChannel',
]) {
  expectEqual(`server ${key}`, serverVersion[key], expected[key]);
}

const updatePath = path.join(ROOT, 'web', 'src', 'api', 'update.ts');
const webConstants = [
  ['APP_VERSION', /export const APP_VERSION = '([^']+)';/, expected.version],
  ['ANDROID_VERSION_CODE', /export const ANDROID_VERSION_CODE = (\d+);/, expected.versionCode],
  ['RELEASE_STATE_SCHEMA_VERSION', /export const RELEASE_STATE_SCHEMA_VERSION = (\d+);/, expected.stateSchemaVersion],
  ['RELEASE_SYNC_PROTOCOL_VERSION', /export const RELEASE_SYNC_PROTOCOL_VERSION = (\d+);/, expected.syncProtocolVersion],
  ['BACKUP_FORMAT_VERSION', /export const BACKUP_FORMAT_VERSION = (\d+);/, expected.backupFormatVersion],
  ['APPLICATION_ID', /export const APPLICATION_ID = '([^']+)';/, expected.applicationId],
  ['RELEASE_CHANNEL', /export const RELEASE_CHANNEL = '([^']+)';/, expected.releaseChannel],
];
for (const [name, pattern, value] of webConstants) {
  const actual = captureExactlyOnce(updatePath, pattern, `Web ${name}`);
  expectEqual(`Web ${name}`, typeof value === 'number' ? Number(actual) : actual, value);
}

const gradlePath = path.join(ROOT, 'web', 'android', 'app', 'build.gradle');
expectEqual(
  'Android BuildConfig generation',
  captureExactlyOnce(gradlePath, /buildConfig = (true)/, 'Android BuildConfig generation'),
  'true',
);
expectEqual(
  'Android applicationId',
  captureExactlyOnce(gradlePath, /applicationId "([^"]+)"/, 'Android applicationId'),
  expected.applicationId,
);
expectEqual(
  'Android versionCode',
  Number(captureExactlyOnce(gradlePath, /versionCode (\d+)/, 'Android versionCode')),
  expected.versionCode,
);
expectEqual(
  'Android versionName',
  captureExactlyOnce(gradlePath, /versionName "([^"]+)"/, 'Android versionName'),
  expected.version,
);
const androidBuildConfig = [
  ['KGC_STATE_SCHEMA_VERSION', 'int', expected.stateSchemaVersion],
  ['KGC_SYNC_PROTOCOL_VERSION', 'int', expected.syncProtocolVersion],
  ['KGC_BACKUP_FORMAT_VERSION', 'int', expected.backupFormatVersion],
];
for (const [name, type, value] of androidBuildConfig) {
  expectEqual(
    `Android ${name}`,
    Number(captureExactlyOnce(
      gradlePath,
      new RegExp(`^[ \\t]*buildConfigField "${type}", "${name}", "(\\d+)"$`, 'm'),
      `Android ${name}`,
    )),
    value,
  );
}
expectEqual(
  'Android KGC_RELEASE_CHANNEL',
  captureExactlyOnce(
    gradlePath,
    /^[ \t]*buildConfigField "String", "KGC_RELEASE_CHANNEL", "\\"([^\\"]+)\\""$/m,
    'Android KGC_RELEASE_CHANNEL',
  ),
  expected.releaseChannel,
);

expectEqual(
  'desktop fallback version',
  captureExactlyOnce(
    path.join(ROOT, 'desktop', 'src', 'renderer', 'index.html'),
    /<span data-version>v([^<]+)<\/span>/,
    'desktop fallback version',
  ),
  expected.version,
);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Version metadata is consistent at ${expected.version} (${expected.versionCode}), `
    + `schema/protocol ${expected.stateSchemaVersion}/${expected.syncProtocolVersion}, `
    + `backup ${expected.backupFormatVersion}, ${expected.releaseChannel}`,
  );
}
