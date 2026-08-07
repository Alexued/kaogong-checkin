import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
test.after(() => vite.close());

const {
  FORMULA_CATEGORIES,
  FORMULA_TABLE,
  canonicalFormulaKey,
  formulaByKey,
  formulasByCategory,
} = await vite.ssrLoadModule('/src/lib/formula.ts');

test('formula catalog contains all 36 Claude entries in stable source order', () => {
  assert.equal(FORMULA_TABLE.length, 36);
  const keys = FORMULA_TABLE.map((item) => item.key);
  assert.deepEqual(keys, [
    'base_1', 'base_2', 'base_3', 'base_4', 'base_5', 'base_6',
    'grow_1', 'grow_2', 'grow_3', 'grow_4',
    'sum_1', 'sum_2', 'sum_3', 'sum_4',
    'span_1', 'span_2', 'span_3', 'span_4',
    'share_1', 'share_2', 'share_3', 'share_4',
    'avg_1', 'avg_2', 'avg_3', 'avg_4', 'avg_5', 'avg_6', 'avg_7', 'avg_8',
    'contrib_1', 'contrib_2', 'contrib_3',
    'misc_1', 'misc_2', 'misc_3',
  ]);
  assert.equal(new Set(keys).size, keys.length);

  for (const item of FORMULA_TABLE) {
    assert.ok(item.category.trim(), `${item.key} category`);
    assert.ok(item.name.trim(), `${item.key} name`);
    assert.ok(item.formula.trim(), `${item.key} formula`);
    assert.equal(typeof item.condition, 'string');
    assert.equal(typeof item.tip, 'string');
    assert.notEqual(item.name.trim(), item.formula.trim(), `${item.key} prompt must not reveal answer`);
  }
});

test('formula categories match the eight source categories and preserve catalog order', () => {
  assert.deepEqual(FORMULA_CATEGORIES, [
    '基期与现期',
    '增长量',
    '和差与混合',
    '隔年与年均',
    '比重',
    '平均数与倍数',
    '贡献与拉动',
    '概念辨析',
  ]);

  assert.equal(formulasByCategory('全部'), FORMULA_TABLE);
  for (const category of FORMULA_CATEGORIES) {
    const filtered = formulasByCategory(category);
    assert.ok(filtered.length > 0, category);
    assert.ok(filtered.every((item) => item.category === category));
    assert.deepEqual(filtered, FORMULA_TABLE.filter((item) => item.category === category));
  }
  assert.deepEqual(
    FORMULA_CATEGORIES.map((category) => formulasByCategory(category).length),
    [6, 4, 4, 4, 4, 8, 3, 3],
  );
  assert.deepEqual(formulasByCategory('不存在'), []);
});

test('legacy formula keys resolve to canonical source entries without rewriting history', () => {
  const aliases = {
    base: 'base_1',
    current: 'base_2',
    'growth-amount': 'grow_1',
    'growth-rate': 'base_4',
    'base-sum-diff': 'sum_1',
    'interval-rate': 'span_1',
    'avg-growth-amount': 'grow_4',
    'avg-growth-rate': 'span_3',
    proportion: 'share_1',
    'base-proportion': 'share_2',
    'proportion-diff': 'share_3',
    'avg-rate': 'avg_2',
    multiple: 'avg_4',
    'mixed-rate': 'sum_3',
  };
  for (const [legacyKey, canonicalKey] of Object.entries(aliases)) {
    assert.equal(canonicalFormulaKey(legacyKey), canonicalKey);
    assert.equal(formulaByKey(legacyKey)?.key, canonicalKey);
  }
  assert.equal(canonicalFormulaKey('misc_3'), 'misc_3');
  assert.equal(canonicalFormulaKey('unknown-key'), 'unknown-key');

  assert.equal(formulaByKey('base_1')?.key, 'base_1');
  assert.equal(formulaByKey('unknown-key'), undefined);
});
