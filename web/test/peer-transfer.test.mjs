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
  const transfer = await createPeerTransfer(source);
  const parsed = await parsePeerTransfer(transfer);
  assert.deepEqual(parsed.envelope, source);
  assert.equal(parsed.transfer.summary.appMode, 'general');
  assert.equal(parsed.transfer.summary.taskCount, 0);

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
  assert.throws(() => parsePeerConnectUri(uri.replace('v=1', 'v=2')), /UNSUPPORTED_PEER_PROTOCOL/);
  assert.throws(() => parsePeerConnectUri(uri.replace('code=042913', 'code=123')), /INVALID_PAIRING_CODE/);
});
