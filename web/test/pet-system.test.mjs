import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';
const domain = await importTypeScript(new URL('../src/domain/pet.ts', import.meta.url));
const catalog = await importTypeScript(new URL('../src/data/petCatalog.ts', import.meta.url));
const repositoryModule = await importTypeScript(new URL('../src/storage/petRepository.ts', import.meta.url));
const { pomodoro } = await importTypeScript(new URL('../src/lib/pomodoro.ts', import.meta.url));
function memoryStorage(initial = null, fail = false) { let value = initial; return { getItem: () => value, setItem: (_key, next) => { if (fail) throw new Error('write failed'); value = next; }, value: () => value }; }
function debugRepo(storage, allowed = false) { return new repositoryModule.PetRepository(storage, () => allowed); }

for (const category of catalog.PET_CATEGORIES) {
  for (const item of catalog.PET_CATALOG[category]) {
    test('acceptance: purchase, use, persist ' + category + '/' + item.id, () => {
      const storage = memoryStorage();
      const repo = debugRepo(storage, true);
      repo.startDebug();
      repo.buy(category, item.id);
      assert.equal(repo.read().sandbox.pet.stars, 99999 - item.cost);
      if (category === 'foods') {
        repo.buy(category, item.id);
        assert.equal(repo.read().sandbox.pet.foodInventory[item.id], 2);
        repo.feed(item.id);
        assert.equal(repo.read().sandbox.pet.foodInventory[item.id], 1);
        assert.equal(domain.activePet(repo.read().sandbox.pet).satiety, 62);
        repo.feed(item.id);
        assert.throws(() => repo.feed(item.id), /没有这份食物/);
      } else {
        repo.equip(category, item.id);
        assert.equal(domain.activePet(repo.read().sandbox.pet).equipped[catalog.PET_SLOTS[category]], item.id);
        const before = storage.value();
        assert.throws(() => repo.buy(category, item.id), /已经拥有/);
        assert.equal(storage.value(), before);
      }
      const reloaded = debugRepo(storage, true).read();
      assert.deepEqual(reloaded.sandbox.pet, domain.normalizePet(repo.read().sandbox.pet));
      assert.deepEqual(reloaded.pet, domain.normalizePet(domain.defaultPet()));
      assert.deepEqual(repo.read().pet, domain.defaultPet());
    });
  }
}

test('acceptance: insufficient funds and unowned equipment cannot mutate storage', () => {
  const storage = memoryStorage();
  const repo = debugRepo(storage);
  for (const category of catalog.PET_CATEGORIES) {
    for (const item of catalog.PET_CATALOG[category]) {
      assert.throws(() => repo.buy(category, item.id), /星星不足/);
      assert.throws(() => repo.equip(category, item.id), /请先兑换|食物需要/);
    }
  }
  assert.equal(storage.value(), null);
});

test('acceptance: food and reward numeric limits are atomic', () => {
  const pet = domain.defaultPet();
  pet.foodInventory.apple = 1;
  domain.activePet(pet).feedCount = Number.MAX_SAFE_INTEGER;
  const repo = debugRepo(memoryStorage(JSON.stringify({ version: 1, pet, sandbox: null })));
  const before = repo.read();
  assert.throws(() => repo.feed('apple'), /上限/);
  assert.deepEqual(repo.read(), before);
  pet.stars = Number.MAX_SAFE_INTEGER;
  assert.throws(() => domain.awardPetFocus(pet, '2026-09-07T00:00:00Z'), /上限/);
  assert.equal(pet.rewardIds.length, 0);
  pet.foodInventory.apple = Number.MAX_SAFE_INTEGER;
  assert.throws(() => domain.buyPetItem(pet, 'foods', 'apple'), /上限/);
  assert.equal(pet.stars, Number.MAX_SAFE_INTEGER);
});

test('acceptance: name, equipment precedence and clearing preserve ownership', () => {
  const repo = debugRepo(memoryStorage(), true);
  repo.startDebug(); repo.stockDebug();
  repo.rename('  一二三四五六七八九十额外  ');
  assert.equal(domain.activePet(repo.read().sandbox.pet).name, '一二三四五六七八九十');
  repo.rename('   ');
  assert.equal(domain.activePet(repo.read().sandbox.pet).name, '小格');
  repo.equip('states', 'sleep'); repo.equip('actions', 'run');
  assert.equal(domain.activePet(repo.read().sandbox.pet).equipped.state, '');
  const owned = repo.read().sandbox.pet.unlocked;
  repo.clearEquipment();
  assert.deepEqual(domain.activePet(repo.read().sandbox.pet).equipped, domain.activePet(domain.defaultPet()).equipped);
  assert.deepEqual(repo.read().sandbox.pet.unlocked, owned);
});

test('acceptance: export/import isolates sandbox and rejects invalid backups atomically', () => {
  const storage = memoryStorage();
  const repo = debugRepo(storage, true);
  repo.rename('真实宠物');
  const original = repo.read().pet;
  repo.startDebug(); repo.stockDebug(); repo.rename('测试宠物');
  const backup = repo.exportData();
  repo.rename('临时'); repo.importData(backup);
  assert.equal(domain.activePet(repo.read().sandbox.pet).name, '测试宠物');
  const before = storage.value();
  for (const invalid of ['{', '{}', JSON.stringify({ format: 'geji-pet', version: 99, pet: original }), JSON.stringify({ format: 'geji-pet', version: 1, pet: { stars: -1 } }), 'x'.repeat(2_000_001)]) {
    assert.throws(() => repo.importData(invalid));
    assert.equal(storage.value(), before);
  }
  repo.restoreDebug();
  assert.deepEqual(repo.read().pet, original);
  assert.equal(repo.read().sandbox, null);
  assert.deepEqual(JSON.parse(repo.exportData()).pet, original);
  repo.importData(JSON.stringify({ petData: { ...original, profiles: undefined, selectedSpeciesId: undefined, ...domain.activePet(original), name: '旧版宠物' } }));
  assert.equal(domain.activePet(repo.read().pet).name, '旧版宠物');
});

test('acceptance: corrupted storage is preserved and writes are blocked', () => {
  for (const invalid of ['broken', JSON.stringify({ version: 99 }), JSON.stringify({ pet: { stars: -1 } })]) {
    const storage = memoryStorage(invalid);
    const repo = debugRepo(storage, true);
    assert.ok(repo.error);
    assert.throws(() => repo.startDebug());
    assert.throws(() => repo.rename('覆盖'));
    assert.equal(storage.value(), invalid);
  }
});

test('acceptance: production cannot use persisted sandbox or grant test rewards', () => {
  const storage = memoryStorage();
  const internal = debugRepo(storage, true);
  internal.startDebug(); internal.stockDebug();
  const production = debugRepo(storage);
  assert.equal(JSON.parse(production.exportData()).pet.stars, 0);
  assert.throws(() => production.rewardFocus('2026-09-07T01:00:00Z', true), /仅可进入内部沙盒/);
  assert.throws(() => production.buy('actions', 'walk'), /星星不足/);
  production.rewardFocus('2026-09-07T01:00:00Z');
  assert.equal(production.read().pet.stars, 10);
  assert.equal(production.read().sandbox.pet.stars, 99999);
  assert.equal(debugRepo(storage).rewardFocus('2026-09-07T01:00:00Z'), 0);
});

test('acceptance: short focus pause/resume/complete/reset never advances real cycle', () => {
  pomodoro.resetCycle(); pomodoro.start(true);
  assert.equal(pomodoro.durationMs, 5000);
  const startedAt = pomodoro.startedAt;
  pomodoro.pause();
  const remaining = pomodoro.remainingAtPauseMs;
  pomodoro.resume();
  assert.equal(pomodoro.startedAt, startedAt);
  assert.equal(pomodoro.remainingAtPauseMs, remaining);
  const completed = pomodoro.completeStage();
  assert.equal(completed.testSession, true);
  assert.equal(pomodoro.focusesCompleted, 0);
  assert.equal(pomodoro.stage, 'focus');
  pomodoro.start(true); pomodoro.resetCurrent();
  assert.equal(pomodoro.testSession, false);
  pomodoro.start(false);
  assert.equal(pomodoro.durationMs, 25 * 60000);
  pomodoro.resetCycle();
});

test('pet catalog has seven categories and ten items per category', () => {
  assert.deepEqual(catalog.PET_CATEGORIES.length, 7);
  for (const category of catalog.PET_CATEGORIES) assert.equal(catalog.PET_CATALOG[category].length, 10, category);
});

test('purchase deducts stars and food purchase adds one inventory per click', () => {
  const storage = memoryStorage(); const repo = debugRepo(storage); let pet = domain.defaultPet(); pet.stars = 30; storage.setItem('pet', JSON.stringify({ version: 1, pet, sandbox: null }));
  const loaded = new repositoryModule.PetRepository(storage);
  assert.equal(loaded.buy('foods', 'apple'), '已兑换苹果，库存 +1');
  assert.equal(loaded.read().pet.stars, 25); assert.equal(loaded.read().pet.foodInventory.apple, 1);
  assert.equal(loaded.buy('foods', 'apple'), '已兑换苹果，库存 +1');
  assert.equal(loaded.read().pet.stars, 20); assert.equal(loaded.read().pet.foodInventory.apple, 2);
});

test('feed consumes the purchased food and increases satiety', () => {
  const pet = domain.defaultPet(); pet.unlocked.foods = ['apple']; pet.foodInventory.apple = 2; const storage = memoryStorage(JSON.stringify({ version: 1, pet, sandbox: null })); const repo = debugRepo(storage);
  assert.equal(repo.feed('apple'), '吃掉一份苹果，库存 -1'); assert.equal(repo.read().pet.foodInventory.apple, 1); assert.equal(domain.activePet(repo.read().pet).satiety, 62); assert.equal(domain.activePet(repo.read().pet).feedCount, 1);
  assert.throws(() => repo.feed('banana'), /没有这份食物/);
});

test('focus reward is idempotent and persists', () => {
  const storage = memoryStorage(); const repo = debugRepo(storage); const startedAt = '2026-09-06T00:00:00.000Z';
  assert.equal(repo.rewardFocus(startedAt), 10); assert.equal(repo.rewardFocus(startedAt), 0); assert.equal(repo.read().pet.stars, 10); assert.equal(repo.read().pet.totalEarned, 10);
});

test('debug sandbox changes never mutate real pet data and restore cleanly', () => {
  const storage = memoryStorage(); const repo = debugRepo(storage); repo.transact((pet) => { pet.stars = 42; return ''; });
  assert.throws(() => repo.startDebug(), /当前构建/); const debug = debugRepo(storage, true); assert.equal(debug.startDebug(), '99999 星沙盒已开启，真实存档不受影响');
  assert.equal(debug.read().pet.stars, 42); assert.equal(debug.read().sandbox.pet.stars, 99999); debug.buy('actions', 'run'); assert.equal(debug.read().sandbox.pet.stars, 99979); assert.equal(debug.read().pet.unlocked.actions.includes('run'), false); assert.equal(debug.stockDebug(), '沙盒已解锁 70 项，每种食物 99 份'); debug.rewardFocus('2026-09-06T01:00:00.000Z', true); assert.equal(debug.read().sandbox.pet.stars, 99989); debug.restoreDebug(); assert.equal(debug.read().sandbox, null); assert.equal(debug.read().pet.stars, 42);
});

test('storage failure leaves the previous snapshot untouched', () => {
  const pet = domain.defaultPet(); pet.stars = 20; const storage = memoryStorage(JSON.stringify({ version: 1, pet, sandbox: null }), true); const repo = debugRepo(storage); assert.throws(() => repo.buy('foods', 'apple'), /write failed/); assert.equal(repo.read().pet.stars, 20);
});
