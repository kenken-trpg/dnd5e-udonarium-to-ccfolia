import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DOMParser } from '@xmldom/xmldom';

const require = createRequire(import.meta.url);
const C = require('../converter.js');
const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

async function convert(name, opts) {
  const [{ xml }] = await C.extractXmlTexts(fixture(name), name);
  const parsed = C.parseUdonariumXml(xml, DOMParser);
  return { parsed, out: C.toCcfolia(parsed, opts) };
}
const byLabel = (list, label) => list.find(x => x.label === label);

test('ZIPからXMLを取り出して変換できる', async () => {
  const { out } = await convert('sorcerer.zip');
  const d = out.data;
  assert.equal(out.kind, 'character');
  assert.equal(d.name, 'テスト・ソーサラー');
  assert.equal(d.initiative, 2);
  assert.deepEqual(byLabel(d.status, 'HP'), { label: 'HP', value: '37', max: '37' });
  assert.deepEqual(byLabel(d.status, 'インスピレーション'), { label: 'インスピレーション', value: '0', max: '1' });
  // 使わない呪文スロットはステータスに出さない
  assert.equal(d.status.some(s => /^lv\d$/.test(s.label)), false);
  assert.equal(byLabel(d.params, '筋力修正').value, '-1');
  assert.equal(byLabel(d.params, '〈威圧〉').value, '+6');
  assert.equal(byLabel(d.params, '魅力セーヴ').value, '+6');
  assert.equal(byLabel(d.params, '【魅力】').value, '16');
  // 呪文名はパラメータにしない
  assert.equal(byLabel(d.params, 'ファイアー・ボルト'), undefined);
  assert.match(d.memo, /^PL: テストPL1\nレベル5 \/ ソーサラー \/ ティーフリング \/ 秩序にして善\(LG\)/);
  assert.ok(d.commands.startsWith('◆チャットパレット テスト・ソーサラー'));
  assert.deepEqual(C.unresolvedReferences(out), []);
});

test('呪文スロットとメモ', async () => {
  const { out } = await convert('multiclass.xml', { includeNotes: true, externalUrl: 'https://dndjp.sakura.ne.jp/OUTPUT.php?ID=63819' });
  const d = out.data;
  assert.deepEqual(d.status.filter(s => /^lv\d$/.test(s.label)).map(s => `${s.label}:${s.value}/${s.max}`),
    ['lv1:4/4', 'lv2:3/3', 'lv3:3/3', 'lv4:1/1']);
  assert.match(d.memo, /AC 19 \/ 移動 25ft\.\/5sq\. \/ 中型/);
  assert.match(d.memo, /呪文セーヴDC 16 \/ 呪文攻撃 \+8/);
  assert.match(d.memo, /【背景】\n侍祭/);
  assert.match(d.memo, /• 二行目/); // 実体参照 &#8226; が復元されている
  assert.equal(d.externalUrl, 'https://dndjp.sakura.ne.jp/OUTPUT.php?ID=63819');
  assert.deepEqual(C.unresolvedReferences(out), []);
});

test('特徴等はデフォルトではメモに含めない', async () => {
  const { out } = await convert('multiclass.xml');
  assert.doesNotMatch(out.data.memo, /【背景】/);
});

test('参照の展開', async () => {
  const { out } = await convert('attacks.xml', { expandRefs: true });
  const c = out.data.commands;
  assert.doesNotMatch(c, /\{[^}]+\}/);
  assert.match(c, /AR\+3 【敏捷力】能力値判定/);
  assert.match(c, /AT\+6 ライトクロスボウの攻撃ロール/);
});

test('d20ロール形式のパレットもそのまま通る', async () => {
  const { out } = await convert('d20roll.xml');
  assert.match(out.data.commands, /^1d20\+2 イニシアチブ$/m);
  assert.deepEqual(C.unresolvedReferences(out), []);
});

test('JSONとして直列化できる', async () => {
  const { out } = await convert('attacks.xml');
  const round = JSON.parse(JSON.stringify(out));
  assert.equal(round.data.name, 'テスト・アーマラー');
});

test('不正な入力はエラーになる', () => {
  assert.throws(() => C.parseUdonariumXml('<foo/>', DOMParser), /<character>/);
});

// ---------------------------------------------------------------- 安全性

test('展開後に大きすぎるZIP（ZIP爆弾）は途中で打ち切る', async () => {
  await assert.rejects(C.extractXmlTexts(fixture('bomb.zip'), 'bomb.zip'), /大きすぎます/);
});

test('大きすぎるファイルは読み込まない', async () => {
  const big = new Uint8Array(C.LIMITS.maxInputBytes + 1);
  await assert.rejects(C.extractXmlTexts(big, 'big.xml'), /大きすぎます/);
});

test('壊れたZIPは分かるエラーになる', async () => {
  const zip = new Uint8Array(fixture('sorcerer.zip'));
  // 末尾を切り詰める → ディレクトリが無い
  await assert.rejects(C.extractXmlTexts(zip.subarray(0, zip.length - 30)), /ZIP/);
  // セントラルディレクトリのローカルヘッダ位置を範囲外にする
  const broken = zip.slice();
  const dv = new DataView(broken.buffer);
  let cd = -1;
  for (let i = 0; i < broken.length - 4; i++) if (dv.getUint32(i, true) === 0x02014b50) { cd = i; break; }
  dv.setUint32(cd + 42, 0x7fffffff, true);
  await assert.rejects(C.extractXmlTexts(broken), /壊れています/);
});

test('XML以外のエントリは展開しない', async () => {
  const seen = [];
  await C.unzip(fixture('sorcerer.zip'), { filter: name => { seen.push(name); return false; } });
  assert.equal(seen.length, 1);
  assert.deepEqual(await C.unzip(fixture('sorcerer.zip'), { filter: () => false }), []);
});

test('DTD付きのXMLは拒否する（実体展開による膨張対策）', () => {
  const xml = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><character><data name="character"/></character>';
  assert.throws(() => C.parseUdonariumXml(xml, DOMParser), /DTD/);
});

test('パレットの {constructor} などは組み込みプロパティに化けない', async () => {
  const { parsed } = await convert('attacks.xml');
  parsed.palette = '{constructor} {toString} {筋力修正}';
  const out = C.toCcfolia(parsed, { expandRefs: true });
  const str = byLabel(out.data.params, '筋力修正').value;
  assert.equal(out.data.commands, `{constructor} {toString} ${str}`);
});
