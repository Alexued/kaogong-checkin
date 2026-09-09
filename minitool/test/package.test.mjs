import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('ZIP writer preserves root entry, slash paths, bytes and repeatability', { skip: process.platform !== 'win32' }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'geji-zip-'));
  const source = path.join(temporary, "source's files");
  const destination = path.join(temporary, 'test.zip');
  const writer = path.resolve(import.meta.dirname, '../scripts/write-zip.ps1');
  fs.mkdirSync(path.join(source, 'assets', 'pets'), { recursive: true });
  fs.writeFileSync(path.join(source, 'index.html'), '<html>test</html>');
  fs.writeFileSync(path.join(source, 'assets', 'app.js'), 'void 0;');
  fs.writeFileSync(path.join(source, 'assets', 'pets', 'pet.png'), Buffer.from([0, 255, 1, 2]));
  const run = () => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', writer, '-Source', source, '-Destination', destination], { encoding: 'utf8' });
  try {
    const output = run();
    assert.match(output, /Verified: index\.html/);
    assert.match(output, /Verified: assets\/app\.js/);
    assert.match(output, /Verified: assets\/pets\/pet\.png/);
    const first = fs.readFileSync(destination);
    run();
    assert.deepEqual(fs.readFileSync(destination), first);
    fs.unlinkSync(path.join(source, 'index.html'));
    assert.throws(run);
    assert.deepEqual(fs.readFileSync(destination), first);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
