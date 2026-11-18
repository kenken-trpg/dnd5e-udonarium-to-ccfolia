import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect, openApp, fixturePath } from './fixtures.mjs';

const upload = (page, ...names) => page.locator('#file-input').setInputFiles(names.map(fixturePath));
const cards = page => page.locator('#results article');

test.beforeEach(async ({ page }) => { await openApp(page); });

test('未解決参照の行へ移動でき、重複・省略したメモも確認できる', async ({ page }) => {
  await upload(page, 'edge-cases.xml');
  await expect(page.locator('#msg')).toHaveText('変換しました（1体）。');
  const result = cards(page).first();
  await expect(result.locator('[data-f="warn"]')).toContainText('「重複」が2件');
  await expect(result.locator('[data-f="notice"]')).toContainText('背景などのメモは出力していません');
  await result.getByRole('button', { name: '2行目: {未登録}' }).click();
  await expect(result.locator('mark')).toHaveText('AT{未登録} 【未解決】');
  await expect(result.locator('mark')).toBeFocused();
  await result.getByRole('button', { name: '4行目: {constructor}' }).click();
  await expect(result.locator('mark')).toHaveText('{constructor} <img src=x onerror=alert(1)>');
  await page.locator('#opt-notes').check();
  await expect(result.locator('[data-f="notice"]')).not.toContainText('背景などのメモは出力していません');
  await expect(result.locator('[data-f="memo"]')).toContainText('<script>alert(1)</script>');
  await expect(result.locator('script, img')).toHaveCount(0);
});

test('ZIP内で失敗したXMLがあっても正常なXMLの結果を表示する', async ({ page }) => {
  await upload(page, 'mixed.zip');
  await expect(page.locator('#msg')).toContainText('変換しました（1体）。');
  await expect(page.locator('#msg')).toContainText('characters/invalid.xml: DTD');
  await expect(page.locator('#file-status li')).toHaveText(/mixed.zip: 一部成功（1体）/);
  await expect(cards(page).getByRole('heading')).toHaveText('テスト・アーマラー');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#save-all')).toBeEnabled();
});

test('個別削除後に残った全員分を、同名を避けてZIPに保存できる', async ({ page }) => {
  await upload(page, 'sorcerer.zip', 'd20roll.xml', 'attacks.xml');
  await expect(page.locator('#msg')).toHaveText('変換しました（3体）。');
  await cards(page).nth(2).getByRole('button', { name: 'この結果を削除' }).click();
  await expect(page.locator('#result-count')).toHaveText('変換結果 2体');
  await page.locator('#opt-color').fill('#336699');
  await expect(cards(page).first().locator('[data-f="json"]')).toContainText('"color": "#336699"');
  const pending = page.waitForEvent('download');
  await page.locator('#save-all').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('characters_ccfolia.zip');
  const output = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    print(json.dumps({name: json.loads(archive.read(name)) for name in archive.namelist()}))
`, await download.path()], { encoding: 'utf8' }));
  expect(Object.keys(output)).toEqual(['テスト・ソーサラー_ccfolia.json', 'テスト・ソーサラー_2_ccfolia.json']);
  const expected = await cards(page).locator('[data-f="json"]').allTextContents();
  expect(Object.values(output)).toEqual(expected.map(text => JSON.parse(text)));
  await page.locator('#clear-all').click();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('#result-tools')).toBeHidden();
  await expect(page.locator('#file-report')).toBeHidden();
  await expect(page.locator('#drop')).toBeFocused();
});

for (const action of ['cancel', 'replace', 'clear']) {
  test(`遅い読み込みを${action}しても、古い結果が戻らない`, async ({ page }) => {
    await page.evaluate(() => {
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        if (this.name === 'slow.xml') await new Promise(resolve => { window.releaseRead = resolve; });
        return read.call(this);
      };
    });
    await page.locator('#file-input').setInputFiles([
      { name: 'attacks.xml', mimeType: 'text/xml', buffer: readFileSync(fixturePath('attacks.xml')) }, { name: 'slow.xml', mimeType: 'text/xml', buffer: readFileSync(fixturePath('attacks.xml')) },
    ]);
    await expect.poll(() => page.evaluate(() => typeof window.releaseRead)).toBe('function');
    await expect(page.locator('#load-label')).toHaveText('2 / 2ファイルを読み込み中');
    await expect(page.locator('#load-progress')).toHaveAttribute('value', '1');
    await expect(page.locator('#save-all')).toBeDisabled();
    if (action === 'cancel') {
      await page.locator('#cancel-load').click();
      await expect(page.locator('#file-status li').nth(1)).toContainText('中断');
    } else if (action === 'clear') {
      await page.locator('#clear-all').click();
    } else {
      await upload(page, 'multiclass.xml');
      await expect(page.locator('#msg')).toHaveText('変換しました（1体）。');
    }
    await page.evaluate(() => window.releaseRead());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#loading')).toBeHidden();
    if (action === 'clear') {
      await expect(cards(page)).toHaveCount(0);
      await expect(page.locator('#msg')).toHaveText('結果をすべてクリアしました。');
    } else {
      await expect(cards(page)).toHaveCount(1);
      await expect(cards(page).getByRole('heading')).toHaveText(action === 'cancel' ? 'テスト・アーマラー' : '【テスト】マルチクラス');
      await expect(page.locator('#save-all')).toBeEnabled();
      if (action === 'cancel') await expect(page.locator('#msg')).toContainText('読み込みを中断しました');
    }
  });
}

for (const [name, expanded] of [['attacks.xml', false], ['multiclass.xml', true], ['edge-cases.xml', true]]) {
  test(`ブラウザと保存済みの期待JSONが一致する: ${name} / ${expanded}`, async ({ page }) => {
    await page.locator('#opt-notes').setChecked(expanded);
    await page.locator('#opt-expand').setChecked(expanded);
    await upload(page, name);
    await expect(page.locator('#msg')).toHaveText('変換しました（1体）。');
    const expected = JSON.parse(readFileSync(fixturePath(`expected/${name.replace('.xml', '')}-${expanded ? 'expanded' : 'default'}.json`), 'utf8'));
    expect(JSON.parse(await cards(page).first().locator('[data-f="json"]').textContent())).toEqual(expected);
  });
}
