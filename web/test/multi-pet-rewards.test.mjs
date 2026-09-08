import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';
const domain = await importTypeScript(new URL('../src/domain/pet.ts', import.meta.url));
const rewards = await importTypeScript(new URL('../src/domain/customRewards.ts', import.meta.url));
const species = await importTypeScript(new URL('../src/data/petSpecies.ts', import.meta.url));
const catalog = await importTypeScript(new URL('../src/data/petCatalog.ts', import.meta.url));
const { PetRepository } = await importTypeScript(new URL('../src/storage/petRepository.ts', import.meta.url));
function storage(initial = null) {
  let value = initial;
  return { fail: false, getItem: () => value, setItem(_key, next) { if (this.fail) throw new Error('write failed'); value = next; } };
}
const now = '2026-09-07T08:00:00.000Z';
const input = { name: '游戏1小时', description: '自己安排休息', cost: 2 };

for (const id of species.PET_SPECIES_IDS.filter(value => value !== 'hamster')) {
  for (const category of catalog.PET_CATEGORIES) {
    for (const item of catalog.PET_CATALOG[category]) {
      test('new pet full shop integration: ' + id + '/' + category + '/' + item.id, () => {
        const repo = new PetRepository(storage(), () => true);
        repo.startDebug(); repo.selectSpecies(id); repo.buy(category, item.id);
        assert.equal(repo.read().sandbox.pet.stars, 99999 - item.cost);
        if (category === 'foods') {
          repo.feed(item.id);
          assert.equal(repo.read().sandbox.pet.foodInventory[item.id], 0);
          assert.equal(repo.read().sandbox.pet.profiles[id].feedCount, 1);
          assert.equal(repo.read().sandbox.pet.profiles[id].satiety, 62);
          assert.throws(() => repo.feed(item.id), /没有这份食物/);
        } else {
          repo.equip(category, item.id);
          assert.equal(repo.read().sandbox.pet.profiles[id].equipped[catalog.PET_SLOTS[category]], item.id);
        }
        assert.deepEqual(repo.read().sandbox.pet.profiles.hamster, domain.defaultPetProfile('hamster'));
        assert.deepEqual(repo.read().pet, domain.defaultPet());
      });
    }
  }
}

for (const id of species.PET_SPECIES_IDS) {
  test('independent profile and shared inventory: ' + id, () => {
    const disk = storage();
    const repo = new PetRepository(disk, () => true);
    repo.startDebug(); repo.stockDebug();
    const before = repo.read().sandbox.pet;
    repo.selectSpecies(id); repo.rename('伙伴' + id); repo.equip('states', 'sleep'); repo.feed('apple');
    const after = repo.read().sandbox.pet;
    assert.equal(after.selectedSpeciesId, id);
    assert.equal(after.profiles[id].feedCount, 1);
    assert.equal(after.profiles[id].satiety, 62);
    assert.equal(after.profiles[id].equipped.state, 'sleep');
    assert.equal(after.foodInventory.apple, 98);
    assert.equal(after.stars, before.stars);
    for (const other of species.PET_SPECIES_IDS.filter(value => value !== id)) assert.deepEqual(after.profiles[other], before.profiles[other]);
    assert.deepEqual(new PetRepository(disk, () => true).read().sandbox.pet, domain.normalizePet(after));
    repo.restoreDebug();
    assert.deepEqual(repo.read().pet, domain.defaultPet());
  });
}

test('legacy hamster migration preserves wallet, profile, food and reward deduplication', () => {
  const legacy = { name: '老朋友', stars: 27, totalEarned: 40, satiety: 74, feedCount: 2, foodInventory: { apple: 3 }, unlocked: { actions: ['run'] }, equipped: { action: 'run' }, rewardIds: ['pomodoro:2026-09-06T08:00:00.000Z'] };
  const raw = JSON.stringify({ version: 1, pet: legacy, sandbox: null });
  const disk = storage(raw); const repo = new PetRepository(disk);
  assert.equal(repo.error, '');
  assert.equal(disk.getItem(), raw);
  assert.equal(repo.read().pet.profiles.hamster.name, '老朋友');
  assert.equal(repo.read().pet.profiles.hamster.equipped.action, 'run');
  assert.equal(repo.read().pet.foodInventory.apple, 3);
  assert.equal(Object.keys(repo.read().pet.profiles).length, 11);
  assert.equal(repo.rewardFocus('2026-09-06T08:00:00.000Z'), 0);
  assert.equal(repo.read().pet.stars, 27);
  assert.equal(JSON.parse(disk.getItem()).version, 3);
});

test('custom redemption is atomic, persistent and idempotent; usage never charges twice', () => {
  const disk = storage(); let repo = new PetRepository(disk, () => true);
  repo.startDebug(); repo.saveReward('gaming', input);
  repo.redeemReward('gaming', 1, 'operation-1');
  assert.equal(repo.read().sandbox.pet.stars, 99997);
  repo = new PetRepository(disk, () => true);
  repo.redeemReward('gaming', 1, 'operation-1');
  assert.equal(repo.read().sandbox.pet.redemptions.length, 1);
  assert.equal(repo.read().sandbox.pet.stars, 99997);
  repo.useReward('operation-1'); repo.useReward('operation-1');
  assert.equal(repo.read().sandbox.pet.redemptions[0].status, 'used');
  assert.equal(repo.read().sandbox.pet.stars, 99997);
  assert.equal(repo.read().pet.stars, 0);
});

test('edits and disabling preserve immutable historical redemption snapshots', () => {
  const repo = new PetRepository(storage(), () => true); repo.startDebug();
  repo.saveReward('gaming', input); repo.redeemReward('gaming', 1, 'snapshot');
  const prior = repo.read().sandbox.pet.redemptions[0];
  repo.saveReward('gaming', { name: '电影', description: '新说明', cost: 80 });
  assert.throws(() => repo.redeemReward('gaming', 1, 'stale'), /重新确认/);
  repo.toggleReward('gaming');
  assert.throws(() => repo.redeemReward('gaming', 3, 'disabled'), /停用/);
  assert.deepEqual(repo.read().sandbox.pet.redemptions[0], prior);
  repo.toggleReward('gaming'); repo.redeemReward('gaming', 4, 'enabled');
  assert.equal(repo.read().sandbox.pet.redemptions[1].cost, 80);
});

test('wallet is shared by custom rewards, pet shop and focus rewards', () => {
  const repo = new PetRepository(storage());
  repo.rewardFocus('2026-09-07T08:00:00.000Z');
  repo.redeemReward('sample-game', 1, 'game-2-stars');
  repo.buy('foods', 'apple');
  assert.equal(repo.read().pet.stars, 3);
  const before = repo.read();
  assert.throws(() => repo.redeemReward('sample-movie', 1, 'too-expensive'), /星星不足/);
  assert.deepEqual(repo.read(), before);
  assert.throws(() => repo.redeemReward('sample-movie', 1, 'game-2-stars'), /冲突/);
  assert.deepEqual(repo.read(), before);
});

test('failed disk writes never debit stars or lose a pending reward', () => {
  const disk = storage(); const repo = new PetRepository(disk, () => true); repo.startDebug();
  const before = repo.read(); const raw = disk.getItem(); disk.fail = true;
  assert.throws(() => repo.redeemReward('sample-game', 1, 'failed'), /write failed/);
  assert.deepEqual(repo.read(), before); assert.equal(disk.getItem(), raw);
  disk.fail = false; repo.redeemReward('sample-game', 1, 'failed');
  const pending = repo.read(); disk.fail = true;
  assert.throws(() => repo.useReward('failed'), /write failed/);
  assert.deepEqual(repo.read(), pending);
});

for (const cost of [0, -1, 1.5, 100000, NaN, Infinity, '2']) {
  test('reject invalid custom reward cost: ' + cost, () => {
    const repo = new PetRepository(storage()); const before = repo.read();
    assert.throws(() => repo.saveReward('invalid', { ...input, cost }), /整数星星/);
    assert.deepEqual(repo.read(), before);
  });
}

test('Unicode limits and boundary prices are validated without splitting emoji', () => {
  for (const cost of [1, 99999]) assert.equal(rewards.validateRewardInput({ name: '🐱'.repeat(40), description: '🐼'.repeat(200), cost }).cost, cost);
  assert.throws(() => rewards.validateRewardInput({ ...input, name: '🐱'.repeat(41) }), /40/);
  assert.throws(() => rewards.validateRewardInput({ ...input, name: '  ' }), /40/);
  assert.throws(() => rewards.validateRewardInput({ ...input, description: '🐼'.repeat(201) }), /200/);
});

test('v2 backup restores all profiles, rewards and history; malformed backups are atomic', () => {
  const repo = new PetRepository(storage(), () => true); repo.startDebug();
  repo.selectSpecies('dragon'); repo.rename('青芽'); repo.redeemReward('sample-game', 1, 'backup-game');
  const backup = repo.exportData(); const expected = domain.normalizePet(repo.read().sandbox.pet);
  repo.selectSpecies('cat'); repo.importData(backup);
  assert.deepEqual(repo.read().sandbox.pet, expected);
  for (const mutate of [
    pet => { pet.selectedSpeciesId = 'unknown'; },
    pet => { pet.profiles.cat.feedCount = -1; },
    pet => { pet.customRewards[0].cost = 0; },
    pet => { pet.redemptions.push({ ...pet.redemptions[0] }); },
    pet => { pet.redemptions[0].rewardId = 'missing'; },
    pet => { pet.redemptions[0].status = 'refunded'; },
  ]) {
    const invalid = JSON.parse(backup); mutate(invalid.pet);
    assert.throws(() => repo.importData(JSON.stringify(invalid)));
    assert.deepEqual(repo.read().sandbox.pet, expected);
  }
  repo.restoreDebug(); assert.deepEqual(repo.read().pet, domain.defaultPet());
});

test('reward use rejects clock rollback and leaves history unchanged', () => {
  const wallet = domain.defaultPet(); wallet.stars = 10;
  rewards.redeemCustomReward(wallet, 'sample-game', 1, 'clock', now);
  const before = structuredClone(wallet);
  assert.throws(() => rewards.useCustomReward(wallet, 'clock', '2026-09-06T00:00:00Z'), /系统时间/);
  assert.deepEqual(wallet, before);
});
