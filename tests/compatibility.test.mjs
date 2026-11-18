import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
const C = createRequire(import.meta.url)('../converter.js');
const read = name => readFileSync(new URL(`fixtures/${name}`, import.meta.url));

for (const name of ['sorcerer.zip', 'attacks.xml', 'multiclass.xml', 'd20roll.xml', 'edge-cases.xml']) {
  for (const expanded of [false, true]) {
    test(`互換性: ${name} / ${expanded ? '参照展開・メモあり' : '既定'}`, async () => {
      const [{ xml }] = await C.extractXmlTexts(read(name), name);
      const parsed = C.parseUdonariumXml(xml, DOMParser);
      const expected = JSON.parse(read(`expected/${name.replace(/\.(zip|xml)$/, '')}-${expanded ? 'expanded' : 'default'}.json`));
      assert.deepEqual(C.toCcfolia(parsed, { expandRefs: expanded, includeNotes: expanded }), expected);
    });
  }
}

test('警告は行番号と重複を返し、元のJSONを変更しない', async () => {
  const [{ xml }] = await C.extractXmlTexts(read('edge-cases.xml'));
  const parsed = C.parseUdonariumXml(xml, DOMParser);
  const out = C.toCcfolia(parsed);
  const before = structuredClone(out);
  const warnings = C.inspectConversion(out);
  assert.deepEqual(warnings.references.map(ref => [ref.line, ref.labels]), [[2, ['未登録']], [4, ['constructor']]]);
  assert.deepEqual(warnings.duplicates, [{ label: '重複', count: 2 }]);
  assert.deepEqual(out, before);
  assert.equal(out.data.status.find(field => field.label === '一時的HP').value, '3');
  assert.equal(out.data.status.some(field => field.label === 'lv1'), false);
  assert.equal(out.data.params.find(field => field.label === '空欄').value, '');
  assert.ok(out.data.commands.includes('<img src=x onerror=alert(1)>'));
  const expanded = C.toCcfolia(parsed, { expandRefs: true, includeNotes: true });
  assert.ok(expanded.data.commands.startsWith('AR+2'));
  assert.ok(expanded.data.memo.includes('<script>alert(1)</script>'));
});

test('ステータスとパラメータ間の同名も警告する', () => {
  const out = { data: { commands: '{HP}\n{不明} {不明}', status: [{ label: 'HP' }], params: [{ label: 'HP' }] } };
  assert.deepEqual(C.inspectConversion(out), {
    references: [{ line: 2, labels: ['不明'], text: '{不明} {不明}' }], duplicates: [{ label: 'HP', count: 2 }],
  });
});
