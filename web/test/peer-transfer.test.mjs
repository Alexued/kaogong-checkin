import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPeerConnectUri,
  createPeerTransfer,
  parseManualPeerAddress,
  parsePeerConnectUri,
  parsePeerTransfer,
} from '../src/api/peer-transfer.ts';
import { emptyDomainState } from '../src/domain/v3.ts';

function envelope() {
  return {
    schemaVersion: 3,
    revision: 4,
    deviceId: 'device-test-1234',
    savedAt: '2026-08-11T08:00:00.000Z',
    state: emptyDomainState(),
  };
}

test('peer transfers validate exact bytes, digest, domain state and summary', async () => {
  const source = envelope();
  source.state.settings.appMode = 'general';
  const timestamp = '2026-08-11T08:00:00.000Z';
  source.state.speedAttempts.push({
    id: 'speed-active', categoryKey: 'growth', categoryLabel: '增长率', difficulty: 'normal',
    prompt: '12.5% 等于几分之一？', expression: '12.5%', correctAnswer: '1/8', userAnswer: '1/8',
    correct: true, elapsedMs: 1200, sessionId: 'speed-session', createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
  }, {
    id: 'speed-deleted', categoryKey: 'growth', categoryLabel: '增长率', difficulty: 'normal',
    prompt: '25% 等于几分之一？', expression: '25%', correctAnswer: '1/4', userAnswer: '1/4',
    correct: true, elapsedMs: 900, sessionId: 'speed-session', createdAt: timestamp, updatedAt: timestamp, deletedAt: timestamp,
  });
  source.state.analysisReviews.push({
    id: 'review-active', source: 'text', questionText: '现期量为 120，同比增长 20%，求基期量。',
    userAnswer: '100', correctAnswer: '100', categoryKey: 'base-value', categoryLabel: '基期量',
    sections: [{ title: '题型识别', content: '已知现期量和增长率，求基期量。' }],
    createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
  });
  const transfer = await createPeerTransfer(source);
  const parsed = await parsePeerTransfer(transfer);
  assert.deepEqual(parsed.envelope, source);
  assert.equal(parsed.transfer.summary.appMode, 'general');
  assert.equal(parsed.transfer.summary.taskCount, 0);
  assert.equal(parsed.transfer.summary.drillCount, 2);

  await assert.rejects(
    parsePeerTransfer({ ...transfer, snapshotJson: `${transfer.snapshotJson} ` }),
    /SNAPSHOT_SIZE_MISMATCH/,
  );
  await assert.rejects(
    parsePeerTransfer({ ...transfer, snapshotSha256: '0'.repeat(64) }),
    /SNAPSHOT_DIGEST_MISMATCH/,
  );
});

test('manual address and QR deep link parsing reject ambiguous endpoints', () => {
  assert.deepEqual(parseManualPeerAddress('http://192.168.1.8:43120/'), { host: '192.168.1.8', port: 43120 });
  assert.throws(() => parseManualPeerAddress('example.com:43120'), /INVALID_PEER_ADDRESS/);
  assert.throws(() => parseManualPeerAddress('192.168.1.999:43120'), /INVALID_PEER_ADDRESS/);

  const uri = buildPeerConnectUri({
    host: '192.168.1.8',
    port: 43120,
    pairingCode: '042913',
    deviceId: 'device-test-1234',
    sessionId: 'session-test-5678',
  });
  assert.deepEqual(parsePeerConnectUri(uri), {
    host: '192.168.1.8',
    port: 43120,
    pairingCode: '042913',
    deviceId: 'device-test-1234',
    sessionId: 'session-test-5678',
  });
  assert.throws(() => parsePeerConnectUri(uri.replace('v=2', 'v=1')), /UNSUPPORTED_PEER_PROTOCOL/);
  assert.throws(() => parsePeerConnectUri(uri.replace('code=042913', 'code=123')), /INVALID_PAIRING_CODE/);
});

test('peer summary accepts older v3 snapshots without the additive training collections', async () => {
  const source = envelope();
  delete source.state.speedAttempts;
  delete source.state.analysisReviews;
  const snapshotJson = JSON.stringify(source);
  const transfer = {
    transferFormatVersion: 1,
    snapshotJson,
    snapshotSha256: await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotJson))
      .then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')),
    snapshotUtf8Bytes: new TextEncoder().encode(snapshotJson).byteLength,
  };
  const parsed = await parsePeerTransfer(transfer);
  assert.equal(parsed.transfer.summary.drillCount, 0);
});
