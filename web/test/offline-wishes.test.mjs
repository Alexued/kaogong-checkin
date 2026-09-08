import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTypeScript } from './import-typescript.mjs';
const wishes = await importTypeScript(new URL('../src/domain/wishes.ts', import.meta.url));
const { defaultPet } = await importTypeScript(new URL('../src/domain/pet.ts', import.meta.url));
const { PetRepository } = await importTypeScript(new URL('../src/storage/petRepository.ts', import.meta.url));
const { DeveloperSession, adjustedStars } = await importTypeScript(new URL('../src/domain/developerStars.ts', import.meta.url));
const now = '2026-09-07T09:00:00.000Z';
const identities = await Promise.all(Array.from({ length: 3 }, () => wishes.createWishIdentity()));
const [sender, recipient, intruder] = identities;
function storage(initial = null) { let value = initial; return { fail: false, getItem: () => value, setItem(_key, next) { if (this.fail) throw new Error('disk full'); value = next; } }; }
async function setup(scope = 'real') {
  const source = defaultPet(); const target = defaultPet(); target.stars = 20;
  const offer = await wishes.issueOffer(source, 'sample-game', sender, scope, '星星伙伴');
  await wishes.receiveOffer(target, offer, scope);
  const request = await wishes.requestWish(target, offer.body.id, recipient, scope, '小兔');
  const approval = await wishes.approveWish(source, request, sender, scope);
  return { source, target, offer, request, approval };
}
test('offline roundtrip signs, approves, charges exactly once and preserves snapshots', async () => {
  const { source, target, offer, request, approval } = await setup();
  assert.equal(sender.privateKey.extractable, false);
  for (const message of [offer, request, approval]) { assert.deepEqual(wishes.decodeWish(wishes.encodeWish(message)), message); await wishes.verifyWish(message, 'real'); }
  assert.equal(target.stars, 20); const consumed = [];
  await wishes.redeemWish(target, approval, recipient, 'real', consumed, now);
  assert.equal(target.stars, 18); assert.equal(target.redemptions.length, 1);
  assert.equal(target.redemptions[0].cost, 2); assert.equal(target.wishes.requests[0].status, 'completed');
  await assert.rejects(() => wishes.redeemWish(target, approval, recipient, 'real', consumed, now), /已经完成/);
  assert.equal(target.stars, 18); assert.equal(source.stars, 0);
});
for (const scope of ['real', 'sandbox']) test('scope isolation ' + scope, async () => {
  const context = await setup(scope); const other = scope === 'real' ? 'sandbox' : 'real';
  for (const message of [context.offer, context.request, context.approval]) await assert.rejects(() => wishes.verifyWish(message, other), /不能混用/);
});
for (const field of ['name', 'description', 'cost', 'revision', 'nickname', 'issuer', 'rewardId', 'id']) test('offer tampering rejected: ' + field, async () => {
  const { offer } = await setup(); const modified = structuredClone(offer);
  modified.body[field] = field === 'cost' || field === 'revision' ? 55 : field === 'issuer' ? intruder.publicKey : field === 'id' ? crypto.randomUUID() : '改过了';
  await assert.rejects(() => wishes.verifyWish(modified, 'real'));
});
for (const field of ['recipient', 'offerHash', 'requestId', 'issuer', 'id']) test('key tampering rejected: ' + field, async () => {
  const { approval } = await setup(); const modified = structuredClone(approval);
  modified.body[field] = field === 'recipient' || field === 'issuer' ? intruder.publicKey : field === 'offerHash' ? 'B'.repeat(43) : crypto.randomUUID();
  await assert.rejects(() => wishes.verifyWish(modified, 'real'));
});
for (const input of ['', '{}', 'https://example.com', 'GEJI-WISH:9:test', 'GEJI-WISH:1:?', 'GEJI-WISH:1:' + 'X'.repeat(3000)]) test('reject malformed transport ' + input.slice(0, 32), () => assert.throws(() => wishes.decodeWish(input)));
test('unknown fields and unsupported version cannot be silently normalized', async () => {
  const { offer } = await setup();
  assert.throws(() => wishes.normalizeMessage({ ...offer, privateKey: 'secret' }));
  assert.throws(() => wishes.normalizeMessage({ ...offer, body: { ...offer.body, extra: true } }));
  assert.throws(() => wishes.normalizeMessage({ ...offer, body: { ...offer.body, version: 2 } }));
  assert.throws(() => wishes.normalizeMessage({ ...offer, signature: '*' }));
});
test('receive and request and approve are idempotent, insufficient funds do not reserve stars', async () => {
  const context = await setup();
  await wishes.receiveOffer(context.target, context.offer, 'real');
  assert.equal(context.target.wishes.received.length, 1);
  assert.deepEqual(await wishes.requestWish(context.target, context.offer.body.id, recipient, 'real', '小兔'), context.request);
  assert.deepEqual(await wishes.approveWish(context.source, context.request, sender, 'real'), context.approval);
  context.target.stars = 0;
  await assert.rejects(() => wishes.redeemWish(context.target, context.approval, recipient, 'real', [], now), /星星不足/);
  assert.equal(context.target.wishes.requests[0].status, 'waiting');
  assert.equal(context.target.redemptions.length, 0);
});
test('wrong device and wrong issuer and cross-offer approvals cannot settle', async () => {
  const { target, approval } = await setup();
  await assert.rejects(() => wishes.redeemWish(target, approval, intruder, 'real', [], now), /另一台设备/);
  const forged = await wishes.signWish({ ...approval.body, issuer: intruder.publicKey }, intruder);
  await assert.rejects(() => wishes.redeemWish(target, forged, recipient, 'real', [], now), /并非来自/);
  const wrongOffer = await wishes.signWish({ ...approval.body, offerHash: 'B'.repeat(43) }, sender);
  await assert.rejects(() => wishes.redeemWish(target, wrongOffer, recipient, 'real', [], now), /不匹配/);
  assert.equal(target.stars, 20);
});
for (const status of ['cancelled', 'completed']) test('inactive request ' + status, async () => {
  const { target, approval } = await setup(); target.wishes.requests[0].status = status;
  await assert.rejects(() => wishes.redeemWish(target, approval, recipient, 'real', [], now), /已取消或已完成/);
  assert.equal(target.stars, 20);
});
for (const change of ['enabled', 'revision', 'cost', 'name', 'description']) test('source change rejects outstanding approval: ' + change, async () => {
  const { source, request } = await setup(); source.customRewards[0][change] = change === 'enabled' ? false : change === 'revision' || change === 'cost' ? 7 : '新的内容';
  await assert.rejects(() => wishes.approveWish(source, request, sender, 'real'), /修改或停用/);
});
test('atomic disk failure, concurrency guard, restart and backup anti-replay', async () => {
  const { target, approval } = await setup(); const disk = storage(JSON.stringify({ version: 2, pet: target, sandbox: null }));
  let repo = new PetRepository(disk); const backup = repo.exportData();
  disk.fail = true;
  await assert.rejects(() => repo.wish((pet, used, scope) => wishes.redeemWish(pet, approval, recipient, scope, used, now)), /disk full/);
  assert.equal(repo.read().pet.stars, 20); assert.equal(repo.read().consumedWishes.length, 0);
  disk.fail = false;
  const settled = await Promise.allSettled([repo.wish((pet, used, scope) => wishes.redeemWish(pet, approval, recipient, scope, used, now)), repo.wish((pet, used, scope) => wishes.redeemWish(pet, approval, recipient, scope, used, now))]);
  assert.equal(settled.filter(row => row.status === 'fulfilled').length, 1);
  repo = new PetRepository(disk); assert.equal(repo.read().pet.stars, 18); assert.equal(repo.read().consumedWishes.length, 1);
  repo.importData(backup);
  await assert.rejects(() => repo.wish((pet, used, scope) => wishes.redeemWish(pet, approval, recipient, scope, used, now)), /已经完成/);
});
test('switching sandbox during async work discards writes', async () => {
  const repo = new PetRepository(storage(), () => true);
  let release; const barrier = new Promise(resolve => { release = resolve; });
  const task = repo.wish(async pet => { await barrier; pet.stars = 999; });
  repo.startDebug(); release(); await assert.rejects(task, /钱包已发生变化/);
  assert.equal(repo.read().pet.stars, 0); assert.equal(repo.read().sandbox.pet.stars, 99999);
});
test('backup excludes keys, device identity and developer permission', async () => {
  const { target } = await setup(); const repo = new PetRepository(storage(JSON.stringify({ version: 2, pet: target })));
  const data = repo.exportData(); assert.equal(JSON.parse(data).version, 3);
  assert.doesNotMatch(data, /privateKey|192837|unlocked.*true/);
  const reload = new PetRepository(storage(JSON.stringify(repo.read()))); assert.equal(reload.error, '');
});
test('gate requires five taps within window, correct password, cooldown and relock', () => {
  const gate = new DeveloperSession();
  for (const time of [0, 500, 1000, 1500]) assert.equal(gate.tap(time), false);
  assert.equal(gate.tap(2500), true); assert.equal(gate.tap(6000), false);
  for (let index = 0; index < 5; index++) assert.throws(() => gate.unlock('wrong', 7000), /密码不对/);
  assert.throws(() => gate.unlock('192837', 7001), /休息/);
  gate.unlock('192837', 37000); assert.equal(gate.unlocked, true); gate.lock(); assert.equal(gate.unlocked, false);
});
for (const value of [-1, 1.5, NaN, Infinity, 1000000000]) test('reject invalid star value ' + value, () => assert.throws(() => adjustedStars(0, value, 'set')));
test('developer arithmetic handles limits', () => {
  assert.equal(adjustedStars(10, 2, 'add'), 12); assert.equal(adjustedStars(10, 10, 'subtract'), 0);
  assert.equal(adjustedStars(100, 999999999, 'set'), 999999999);
  assert.throws(() => adjustedStars(0, 1, 'subtract')); assert.throws(() => adjustedStars(999999999, 1, 'add'));
});
test('developer transaction requires session, protects scope, logs without awarding learning stars', () => {
  const disk = storage(); const gate = new DeveloperSession(); const repo = new PetRepository(disk, () => true, () => gate.unlocked);
  assert.throws(() => repo.adjustStars(50, 'set', 'adjust1', 0, 'real'), /锁定/);
  gate.unlock('192837'); repo.adjustStars(50, 'set', 'adjust1', 0, 'real'); repo.adjustStars(50, 'set', 'adjust1', 0, 'real');
  assert.equal(repo.read().pet.stars, 50); assert.equal(repo.read().starAdjustments.length, 1); assert.equal(repo.read().pet.totalEarned, 0);
  repo.startDebug(); assert.throws(() => repo.adjustStars(8, 'set', 'adjust2', 99999, 'real'), /切换/);
  repo.adjustStars(8, 'set', 'adjust2', 99999, 'sandbox'); repo.restoreDebug(); assert.equal(repo.read().pet.stars, 50);
  disk.fail = true; assert.throws(() => repo.adjustStars(90, 'set', 'adjust3', 50, 'real'), /disk full/); assert.equal(repo.read().pet.stars, 50);
});
test('developer keypad has no native input fields and scanner path has no network API', async () => {
  const keypad = await readFile(new URL('../src/components/DeveloperStars.vue', import.meta.url), 'utf8');
  assert.doesNotMatch(keypad, /<input|<textarea|contenteditable/);
  const source = await readFile(new URL('../src/views/WishesView.vue', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|WebSocket|startHosting|startDiscovery|connectPeer/);
});
