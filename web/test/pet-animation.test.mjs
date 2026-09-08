import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { activities, characters, renderFrame, renderAtlas, poseFor } from '../scripts/generate-pet-atlases.mjs';
import { importTypeScript } from './import-typescript.mjs';
const { animationFrame, outfitAnchor } = await importTypeScript(new URL('../src/lib/petAnimation.ts', import.meta.url));
const { PET_ACTIVITIES, PET_SPECIES_IDS } = await importTypeScript(new URL('../src/data/petSpecies.ts', import.meta.url));
test('atlas generator matches all registered species and activities', () => {
  assert.deepEqual(Object.keys(characters), PET_SPECIES_IDS.filter(id => id !== 'hamster'));
  assert.deepEqual(activities, PET_ACTIVITIES);
});
for (const id of Object.keys(characters)) {
  test(id + ': committed atlas is reproducible with 88 frames and no external assets', async () => {
    const atlas = await readFile(new URL('../src/assets/pet/species/' + id + '.svg', import.meta.url), 'utf8');
    assert.equal(atlas, renderAtlas(id));
    assert.equal((atlas.match(/data-frame=/g) || []).length, 88);
    assert.doesNotMatch(atlas, /<script|<image|<foreignObject|href=|NaN|undefined/);
  });
  for (const activity of activities) {
    test(id + '/' + activity + ': four articulated poses and exact atlas cells', () => {
      const frames = [0, 1, 2, 3].map(frame => renderFrame(id, activity, frame));
      assert.equal(new Set(frames.map(value => createHash('sha256').update(value.replace(/data-frame="\d"/, '')).digest('hex'))).size, 4);
      const poses = [0, 1, 2, 3].map(frame => poseFor(activity, frame, characters[id].rhythm));
      assert.ok(new Set(poses.map(pose => [pose.left, pose.right, pose.leg, pose.head, pose.closed, pose.mouth].join(','))).size >= 4);
      for (let tick = 0; tick < 8; tick += 1) {
        const atlas = animationFrame(id, activity, tick);
        assert.equal(atlas.frame, activities.indexOf(activity) * 4 + tick % 4);
        assert.equal(atlas.backgroundSize, '800% 1100%');
      }
    });
  }
}
test('species silhouettes are distinct and clothing uses torso not hat anchors', () => {
  assert.equal(new Set(Object.keys(characters).map(id => renderFrame(id, 'idle', 0).replace(/data-species="[^"]+"/, ''))).size, 10);
  for (const id of PET_SPECIES_IDS) {
    assert.ok(outfitAnchor(id, 'shirt1')[1] > outfitAnchor(id, 'hat1')[1] + 20);
    assert.notDeepEqual(outfitAnchor(id, 'glasses1'), outfitAnchor(id, 'hat1'));
  }
});
