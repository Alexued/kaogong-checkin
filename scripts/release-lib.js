'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'release', 'version.json');
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readVersion() {
  const value = readJson(VERSION_FILE);
  if (!/^\d+\.\d+\.\d+$/.test(value.version || '')) {
    throw new Error('release/version.json must contain a semantic version');
  }
  if (!Number.isSafeInteger(value.versionCode) || value.versionCode < 1) {
    throw new Error('release/version.json must contain a positive integer versionCode');
  }
  for (const field of ['stateSchemaVersion', 'syncProtocolVersion', 'backupFormatVersion']) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 1) {
      throw new Error(`release/version.json must contain a positive integer ${field}`);
    }
  }
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(value.applicationId || '')) {
    throw new Error('release/version.json must contain a valid applicationId');
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.releaseChannel || '')) {
    throw new Error('release/version.json must contain a valid releaseChannel');
  }
  return value;
}

function replaceExactlyOnce(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
  if (!matches || matches.length !== 1) {
    throw new Error(`${label} must match exactly once (found ${matches?.length || 0})`);
  }
  return source.replace(pattern, replacement);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

module.exports = {
  ROOT,
  SHA256_PATTERN,
  readJson,
  readVersion,
  replaceExactlyOnce,
  sha256File,
  writeJson,
};
