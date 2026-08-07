'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ROOT, readVersion, sha256File } = require('./release-lib');

function canonicalApkName(version) {
  return `kaogong-checkin-v${version}.apk`;
}

function parseAaptBadging(output) {
  const match = /^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/m.exec(output);
  if (!match) throw new Error('aapt did not return APK package metadata');
  return {
    applicationId: match[1],
    versionCode: Number(match[2]),
    version: match[3],
  };
}

function readAndroidSdkDirectory() {
  const configured = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  if (configured) return path.resolve(configured);

  const propertiesPath = path.join(ROOT, 'web', 'android', 'local.properties');
  if (fs.existsSync(propertiesPath)) {
    const match = /^sdk\.dir=(.+)$/m.exec(fs.readFileSync(propertiesPath, 'utf8'));
    if (match) return match[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
  }

  if (process.env.LOCALAPPDATA) {
    const candidate = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Android SDK not found; set ANDROID_SDK_ROOT or web/android/local.properties');
}

function versionParts(value) {
  return String(value).split(/[.-]/).map((part) => Number(part) || 0);
}

function compareToolVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function findBuildTool(toolName, sdkDirectory = readAndroidSdkDirectory()) {
  const executableName = process.platform === 'win32'
    ? `${toolName}.${toolName === 'apksigner' ? 'bat' : 'exe'}`
    : toolName;
  const buildToolsDirectory = path.join(sdkDirectory, 'build-tools');
  const versions = fs.readdirSync(buildToolsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => compareToolVersions(right, left));
  for (const version of versions) {
    const candidate = path.join(buildToolsDirectory, version, executableName);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`${toolName} was not found in ${buildToolsDirectory}`);
}

function runTool(executable, args) {
  let command = executable;
  let commandArgs = args;
  if (process.platform === 'win32' && path.basename(executable).toLowerCase() === 'apksigner.bat') {
    command = process.env.JAVA_HOME
      ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
      : 'java.exe';
    commandArgs = ['-jar', path.join(path.dirname(executable), 'lib', 'apksigner.jar'), ...args];
  }
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${path.basename(executable)} failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '');
}

function inspectApk(apkPath, options = {}) {
  const sdkDirectory = options.sdkDirectory || readAndroidSdkDirectory();
  const aapt = options.aaptPath || findBuildTool('aapt', sdkDirectory);
  const apksigner = options.apksignerPath || findBuildTool('apksigner', sdkDirectory);
  const metadata = parseAaptBadging(runTool(aapt, ['dump', 'badging', apkPath]));
  runTool(apksigner, ['verify', apkPath]);
  return metadata;
}

function assertExpectedIdentity(actual, expected) {
  for (const key of ['version', 'versionCode', 'applicationId']) {
    if (actual[key] !== expected[key]) {
      throw new Error(`APK ${key} mismatch: expected ${expected[key]}, received ${actual[key]}`);
    }
  }
}

function apkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.apk'))
    .map((entry) => path.join(directory, entry.name));
}

function verifyEmbeddedApk(options = {}) {
  const expected = options.expected || readVersion();
  const destinationDirectory = path.resolve(
    options.destinationDirectory || path.join(ROOT, 'desktop', 'resources', 'apk'),
  );
  const expectedName = canonicalApkName(expected.version);
  const files = apkFiles(destinationDirectory);
  if (files.length !== 1 || path.basename(files[0]) !== expectedName) {
    throw new Error(`desktop APK directory must contain only ${expectedName}`);
  }
  const inspect = options.inspect || inspectApk;
  assertExpectedIdentity(inspect(files[0]), expected);
  return {
    filePath: files[0],
    fileName: expectedName,
    size: fs.statSync(files[0]).size,
    sha256: sha256File(files[0]),
  };
}

function prepareEmbeddedApk(sourcePath, options = {}) {
  const source = path.resolve(sourcePath);
  const stat = fs.statSync(source);
  if (!stat.isFile()) throw new Error(`${source} is not a file`);

  const expected = options.expected || readVersion();
  const inspect = options.inspect || inspectApk;
  assertExpectedIdentity(inspect(source), expected);

  const destinationDirectory = path.resolve(
    options.destinationDirectory || path.join(ROOT, 'desktop', 'resources', 'apk'),
  );
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const destination = path.join(destinationDirectory, canonicalApkName(expected.version));
  const temporary = `${destination}.tmp-${process.pid}`;

  try {
    fs.copyFileSync(source, temporary);
    if (sha256File(source) !== sha256File(temporary)) {
      throw new Error('desktop APK copy failed SHA-256 verification');
    }
    fs.rmSync(destination, { force: true });
    fs.renameSync(temporary, destination);
    for (const existing of apkFiles(destinationDirectory)) {
      if (path.resolve(existing) !== path.resolve(destination)) fs.rmSync(existing, { force: true });
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }

  return verifyEmbeddedApk({ expected, destinationDirectory, inspect });
}

module.exports = {
  assertExpectedIdentity,
  canonicalApkName,
  findBuildTool,
  inspectApk,
  parseAaptBadging,
  prepareEmbeddedApk,
  verifyEmbeddedApk,
};
