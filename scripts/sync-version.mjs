import fs from 'node:fs';
import path from 'node:path';

import releaseLib from './release-lib.js';

const {
  ROOT,
  readJson,
  readVersion,
  replaceExactlyOnce,
  writeJson,
} = releaseLib;

const version = readVersion();

for (const directory of ['web', 'server', 'desktop']) {
  for (const fileName of ['package.json', 'package-lock.json']) {
    const filePath = path.join(ROOT, directory, fileName);
    const value = readJson(filePath);
    value.version = version.version;
    if (fileName === 'package-lock.json') {
      if (!value.packages || !value.packages['']) {
        throw new Error(`${directory}/${fileName} has no root package`);
      }
      value.packages[''].version = version.version;
    }
    writeJson(filePath, value);
  }
}

writeJson(path.join(ROOT, 'server', 'src', 'version.json'), version);

const updatePath = path.join(ROOT, 'web', 'src', 'api', 'update.ts');
let updateSource = fs.readFileSync(updatePath, 'utf8');
const webConstants = [
  ['APP_VERSION', `'${version.version}'`],
  ['ANDROID_VERSION_CODE', String(version.versionCode)],
  ['RELEASE_STATE_SCHEMA_VERSION', String(version.stateSchemaVersion)],
  ['RELEASE_SYNC_PROTOCOL_VERSION', String(version.syncProtocolVersion)],
  ['BACKUP_FORMAT_VERSION', String(version.backupFormatVersion)],
  ['APPLICATION_ID', `'${version.applicationId}'`],
  ['RELEASE_CHANNEL', `'${version.releaseChannel}'`],
];
for (const [name, value] of webConstants) {
  updateSource = replaceExactlyOnce(
    updateSource,
    new RegExp(`export const ${name} = [^;]+;`),
    `export const ${name} = ${value};`,
    `Web ${name}`,
  );
}
fs.writeFileSync(updatePath, updateSource, 'utf8');

const gradlePath = path.join(ROOT, 'web', 'android', 'app', 'build.gradle');
let gradleSource = fs.readFileSync(gradlePath, 'utf8');
gradleSource = replaceExactlyOnce(
  gradleSource,
  /applicationId "[^"]+"/,
  `applicationId "${version.applicationId}"`,
  'Android applicationId',
);
gradleSource = replaceExactlyOnce(
  gradleSource,
  /versionCode \d+/,
  `versionCode ${version.versionCode}`,
  'Android versionCode',
);
gradleSource = replaceExactlyOnce(
  gradleSource,
  /versionName "[^"]+"/,
  `versionName "${version.version}"`,
  'Android versionName',
);
const androidBuildConfig = [
  ['KGC_STATE_SCHEMA_VERSION', 'int', String(version.stateSchemaVersion)],
  ['KGC_SYNC_PROTOCOL_VERSION', 'int', String(version.syncProtocolVersion)],
  ['KGC_BACKUP_FORMAT_VERSION', 'int', String(version.backupFormatVersion)],
  ['KGC_RELEASE_CHANNEL', 'String', `\\"${version.releaseChannel}\\"`],
];
for (const [name, type, value] of androidBuildConfig) {
  gradleSource = replaceExactlyOnce(
    gradleSource,
    new RegExp(`^[ \\t]*buildConfigField "${type}", "${name}", .+$`, 'm'),
    `        buildConfigField "${type}", "${name}", "${value}"`,
    `Android ${name}`,
  );
}
fs.writeFileSync(gradlePath, gradleSource, 'utf8');

const desktopHtmlPath = path.join(ROOT, 'desktop', 'src', 'renderer', 'index.html');
let desktopHtml = fs.readFileSync(desktopHtmlPath, 'utf8');
desktopHtml = replaceExactlyOnce(
  desktopHtml,
  /(<span data-version>v)[^<]+(<\/span>)/,
  `$1${version.version}$2`,
  'desktop fallback version',
);
fs.writeFileSync(desktopHtmlPath, desktopHtml, 'utf8');

console.log(
  `Synchronized version ${version.version} (${version.versionCode}), `
  + `schema/protocol ${version.stateSchemaVersion}/${version.syncProtocolVersion}, `
  + `backup ${version.backupFormatVersion}, ${version.releaseChannel}`,
);
