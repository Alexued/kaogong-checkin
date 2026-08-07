'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readJson, readVersion, replaceExactlyOnce, writeJson } = require('./release-lib');

const version = readVersion();

for (const directory of ['web', 'server', 'desktop']) {
  for (const fileName of ['package.json', 'package-lock.json']) {
    const filePath = path.join(ROOT, directory, fileName);
    const value = readJson(filePath);
    value.version = version.version;
    if (fileName === 'package-lock.json') {
      if (!value.packages || !value.packages['']) throw new Error(`${directory}/${fileName} has no root package`);
      value.packages[''].version = version.version;
    }
    writeJson(filePath, value);
  }
}

writeJson(path.join(ROOT, 'server', 'src', 'version.json'), version);

const updatePath = path.join(ROOT, 'web', 'src', 'api', 'update.ts');
let updateSource = fs.readFileSync(updatePath, 'utf8');
updateSource = replaceExactlyOnce(
  updateSource,
  /export const APP_VERSION = '[^']+';/,
  `export const APP_VERSION = '${version.version}';`,
  'Web APP_VERSION',
);
updateSource = replaceExactlyOnce(
  updateSource,
  /export const APPLICATION_ID = '[^']+';/,
  `export const APPLICATION_ID = '${version.applicationId}';`,
  'Web APPLICATION_ID',
);
fs.writeFileSync(updatePath, updateSource, 'utf8');

const gradlePath = path.join(ROOT, 'web', 'android', 'app', 'build.gradle');
let gradleSource = fs.readFileSync(gradlePath, 'utf8');
gradleSource = replaceExactlyOnce(gradleSource, /applicationId "[^"]+"/, `applicationId "${version.applicationId}"`, 'Android applicationId');
gradleSource = replaceExactlyOnce(gradleSource, /versionCode \d+/, `versionCode ${version.versionCode}`, 'Android versionCode');
gradleSource = replaceExactlyOnce(gradleSource, /versionName "[^"]+"/, `versionName "${version.version}"`, 'Android versionName');
fs.writeFileSync(gradlePath, gradleSource, 'utf8');

const desktopHtmlPath = path.join(ROOT, 'desktop', 'src', 'renderer', 'index.html');
let desktopHtml = fs.readFileSync(desktopHtmlPath, 'utf8');
desktopHtml = replaceExactlyOnce(desktopHtml, /(<span data-version>v)[^<]+(<\/span>)/, `$1${version.version}$2`, 'desktop fallback version');
fs.writeFileSync(desktopHtmlPath, desktopHtml, 'utf8');

console.log(`Synchronized version ${version.version} (${version.versionCode})`);
