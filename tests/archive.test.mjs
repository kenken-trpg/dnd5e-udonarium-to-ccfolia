import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const A = require('../archive.js');
const character = name => ({ kind: 'character', data: { name, commands: 'AR+3 【敏捷力】' } });

test('ZIPのCRC32は標準の検査値と一致する', () => {
  assert.equal(A.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('危険な名前、予約名、同名、正規化後の衝突を避ける', () => {
  const names = ['../A', '..\\A', 'hero', 'HERO', 'hero_2', 'CON', '', 'e\u0301', 'é', '😀'.repeat(100)];
  const files = A.jsonFiles(names.map(character));
  assert.equal(new Set(files.map(file => file.name.toLowerCase())).size, files.length);
  for (const file of files) {
    assert.doesNotMatch(file.name, /[/\\]/);
    assert.ok(new TextEncoder().encode(file.name).length < 255);
  }
  assert.equal(A.safeName('CON'), '_CON');
  assert.equal(A.safeName('..'), 'character');
  assert.equal(A.safeName('a\n\u0000b'), 'a__b');
});

test('標準ZIPリーダーでUTF-8の名前・CRC・JSONの内容を検証できる', async () => {
  const chars = ['魔法使い', '魔法使い', '../CON', '<img src=x>'].map(character);
  const zip = await A.createJsonZip(chars).arrayBuffer();
  // 生成コードと独立したPython標準ライブラリで、実際の展開互換性を検査する。
  const output = execFileSync('python3', ['-c', `
import io, json, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    assert archive.testzip() is None
    assert all(info.flag_bits & 0x800 for info in archive.infolist())
    print(json.dumps([json.loads(archive.read(name)) for name in archive.namelist()]))
`], { input: Buffer.from(zip), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), chars);
});

test('空のZIPと上限超過を拒否し、同じ入力なら同じZIPになる', async () => {
  assert.throws(() => A.createJsonZip([]), /1〜50/);
  assert.throws(() => A.createJsonZip(Array.from({ length: 51 }, () => character('a'))), /1〜50/);
  const first = Buffer.from(await A.createJsonZip([character('a')]).arrayBuffer());
  const second = Buffer.from(await A.createJsonZip([character('a')]).arrayBuffer());
  assert.deepEqual(first, second);
});
