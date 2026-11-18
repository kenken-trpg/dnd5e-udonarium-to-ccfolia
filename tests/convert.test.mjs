import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
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

test('ZIP内のファイルが多すぎるものは読み込まない', async () => {
  // セントラルディレクトリの終端レコード（EOCD）だけのZIPで、ファイル数を上限+1にする
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(10, C.LIMITS.maxZipEntries + 1, true);
  await assert.rejects(C.unzip(eocd), /多すぎます/);
});

test('圧縮データが壊れたZIPは分かるエラーになる', async () => {
  const zip = new Uint8Array(fixture('sorcerer.zip'));
  const dv = new DataView(zip.buffer, zip.byteOffset);
  const start = 30 + dv.getUint16(26, true) + dv.getUint16(28, true); // 1つ目のファイルの圧縮データの先頭
  for (let i = start; i < start + 200; i++) zip[i] ^= 0xff;
  await assert.rejects(C.extractXmlTexts(zip), /展開に失敗しました/);
});

test('直接読み込むXMLにも5MBの上限を適用する', async () => {
  await assert.rejects(C.extractXmlTexts(new Uint8Array(C.LIMITS.maxXmlBytes + 1), 'large.xml'), /XMLが大きすぎます/);
});

test('個別上限以内のXMLでもZIP全体の展開量が20MBを超えたら拒否する', async () => {
  const payload = deflateRawSync(Buffer.alloc(C.LIMITS.maxXmlBytes, 65));
  const local = [];
  const central = [];
  let offset = 0;
  for (let i = 0; i < 5; i++) {
    const name = Buffer.from(`${i}.xml`);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(C.LIMITS.maxXmlBytes, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, payload);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(C.LIMITS.maxXmlBytes, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += header.length + name.length + payload.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(5, 8);
  end.writeUInt16LE(5, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  await assert.rejects(C.unzip(Buffer.concat([...local, ...central, end])), /合計が大きすぎます/);
});

test('深く入れ子になったdataも順序を保って変換できる', () => {
  const depth = 2000;
  const xml = `<character><data name="character"><data name="detail"><data name="能力">${'<data>'.repeat(depth)}<data name="筋力">10</data>${'</data>'.repeat(depth)}<data name="敏捷力">12</data></data></data></data></character>`;
  const parsed = C.parseUdonariumXml(xml, DOMParser);
  assert.deepEqual(C.toCcfolia(parsed).data.params, [{ label: '筋力', value: '10' }, { label: '敏捷力', value: '12' }]);
});

// ---------------------------------------------------------------- 最適化した処理が元の結果と同じこと

test('extractXmlTexts は展開後のUTF-8のバイト数を返す（上限の確認で文字列を再エンコードしないため）', async () => {
  for (const name of ['sorcerer.zip', 'attacks.xml', 'mixed.zip']) {
    for (const x of await C.extractXmlTexts(fixture(name), name)) {
      assert.equal(x.bytes, Buffer.byteLength(x.xml, 'utf8'), `${name}: ${x.name}`);
    }
  }
});

test('formatMB は上限の表示に使う「20MB」形式を返す', () => {
  assert.equal(C.formatMB(C.LIMITS.maxInputBytes), '20MB');
  assert.equal(C.formatMB(C.LIMITS.maxXmlBytes), '5MB');
});

test('inspectConversion の未解決参照は、行ごとに調べる素朴な方法と同じ結果になる', () => {
  // 以前の実装（パレット全体で未解決のラベルを集めてから、行ごとにもう一度調べる）
  const REF = /\{([^{}\n]+)\}/g;
  const naive = d => {
    const known = new Set([...d.status, ...d.params].map(x => x.label));
    const missing = new Set([...d.commands.matchAll(REF)].map(m => m[1]).filter(label => !known.has(label)));
    return d.commands.split('\n').flatMap((text, index) => {
      const labels = [...new Set([...text.matchAll(REF)].map(m => m[1]).filter(label => missing.has(label)))];
      return labels.length ? [{ line: index + 1, labels, text }] : [];
    });
  };
  // 乱数は固定のシードで作る（失敗したときに再現できるように）
  let seed = 12345;
  const random = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const pieces = ['{HP}', '{不明}', '{a}', '{', '}', '{{a}}', '{b', 'AR', ' ', '\n', '\n\n', '{constructor}', '{\n}'];
  for (let i = 0; i < 500; i++) {
    const commands = Array.from({ length: random(30) }, () => pieces[random(pieces.length)]).join('');
    const d = { commands, status: [{ label: 'HP' }], params: [{ label: 'a' }] };
    assert.deepEqual(C.inspectConversion({ data: d }).references, naive(d), JSON.stringify(commands));
  }
});
