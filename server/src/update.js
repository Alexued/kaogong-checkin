const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { applicationId: APPLICATION_ID } = require('./version.json');

const APK_FILE_PATTERN = /^kaogong-checkin-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.apk$/;
const sha256Cache = new Map();

function parseApkFileName(fileName) {
  const match = APK_FILE_PATTERN.exec(fileName);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return {
    fileName,
    version: parts.join('.'),
    parts,
  };
}

function compareVersionParts(a, b) {
  for (let index = 0; index < 3; index += 1) {
    const difference = a[index] - b[index];
    if (difference) return difference;
  }
  return 0;
}

function sha256File(filePath, stat = fs.statSync(filePath)) {
  const signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const cached = sha256Cache.get(filePath);
  if (cached?.signature === signature) return cached.sha256;
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
  const sha256 = hash.digest('hex');
  sha256Cache.set(filePath, { signature, sha256 });
  if (sha256Cache.size > 32) sha256Cache.delete(sha256Cache.keys().next().value);
  return sha256;
}

function findLatestApk(updateDir) {
  let latest = null;
  let entries;
  try {
    entries = fs.readdirSync(updateDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const candidate = parseApkFileName(entry.name);
    if (!candidate) continue;
    if (!latest || compareVersionParts(candidate.parts, latest.parts) > 0) latest = candidate;
  }
  if (!latest) return null;
  const filePath = path.join(updateDir, latest.fileName);
  const stat = fs.statSync(filePath);
  return {
    ...latest,
    filePath,
    size: stat.size,
    sha256: sha256File(filePath, stat),
    applicationId: APPLICATION_ID,
    publishedAt: stat.mtime.toISOString(),
  };
}

function resolveApkFile(updateDir, fileName) {
  if (!parseApkFileName(fileName)) return null;
  const filePath = path.join(updateDir, fileName);
  try {
    if (!fs.statSync(filePath).isFile()) return null;
    return filePath;
  } catch {
    return null;
  }
}

module.exports = {
  APPLICATION_ID,
  findLatestApk,
  parseApkFileName,
  resolveApkFile,
  sha256File,
};
