const fs = require('node:fs');
const path = require('node:path');

const APK_FILE_PATTERN = /^kaogong-checkin-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.apk$/;

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
  findLatestApk,
  parseApkFileName,
  resolveApkFile,
};
