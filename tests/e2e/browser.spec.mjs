// ブラウザ版（index.html + app.js + converter.js）のE2Eテスト
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { test, expect, openApp, fixturePath, ORIGIN, XML_PARSE_ERROR_NOISE } from './fixtures.mjs';

const cards = page => page.locator('#results article');
const card = (page, name) => cards(page).filter({ has: page.getByRole('heading', { name }) });
const upload = (page, ...names) => page.locator('#file-input').setInputFiles(names.map(fixturePath));
const jsonOf = async c => JSON.parse(await c.locator('[data-f="json"]').textContent());

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('ZIPを読み込むと変換結果が表示される', async ({ page }) => {
  await upload(page, 'sorcerer.zip');
  await expect(page.locator('#msg')).toHaveText('変換しました（1体）。');
  const c = card(page, 'テスト・ソーサラー');
  await expect(c).toHaveCount(1);
  await expect(c.locator('[data-f="sub"]')).toHaveText('PL: テストPL1 / レベル5 / ソーサラー / ティーフリング');
  await expect(c.locator('.chip').filter({ hasText: /^HP / })).toHaveText('HP 37/37');
  await expect(c.locator('.chip').filter({ hasText: /^イニシアチブ/ })).toHaveText('イニシアチブ +2');
  await expect(c.locator('[data-f="warn"]')).toBeHidden();
  const out = await jsonOf(c);
  expect(out.kind).toBe('character');
  expect(out.data.name).toBe('テスト・ソーサラー');
});

test('複数ファイルをまとめて読み込める（表示は選んだ順）', async ({ page }) => {
  await upload(page, 'sorcerer.zip', 'attacks.xml', 'd20roll.xml');
  await expect(page.locator('#msg')).toHaveText('変換しました（3体）。');
  await expect(cards(page).getByRole('heading')).toHaveText(['テスト・ソーサラー', 'テスト・アーマラー', /./]);
});

test('ドラッグ＆ドロップで読み込める', async ({ page }) => {
  const b64 = readFileSync(fixturePath('attacks.xml')).toString('base64');
  const dataTransfer = await page.evaluateHandle(b64 => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], 'attacks.xml', { type: 'text/xml' }));
    return dt;
  }, b64);
  await page.locator('#drop').dispatchEvent('dragover', { dataTransfer });
  await expect(page.locator('#drop')).toHaveClass(/over/);
  await page.locator('#drop').dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('#drop')).not.toHaveClass(/over/);
  await expect(card(page, 'テスト・アーマラー')).toHaveCount(1);
});

test('続けて読み込むと前の結果は置き換わる', async ({ page }) => {
  await upload(page, 'sorcerer.zip');
  await upload(page, 'attacks.xml');
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, 'テスト・アーマラー')).toHaveCount(1);
});

test('出力オプションで結果が変わる', async ({ page }) => {
  await upload(page, 'multiclass.xml', 'attacks.xml');
  const multi = cards(page).nth(0);
  const attacks = cards(page).nth(1);
  await expect(multi.locator('[data-f="memo"]')).not.toContainText('【背景】');

  await page.getByLabel('背景・人格的特徴などをメモに入れる').check();
  await expect(multi.locator('[data-f="memo"]')).toContainText('【背景】\n侍祭');

  await expect(attacks.locator('[data-f="palette"]')).toContainText('{');
  await page.getByLabel('パレットの {参照} を数値に置き換える').check();
  await expect(attacks.locator('[data-f="palette"]')).not.toContainText('{');
  await expect(attacks.locator('[data-f="palette"]')).toContainText('AR+3 【敏捷力】能力値判定');

  await page.getByLabel('コマの色').fill('#336699');
  await expect(attacks.locator('[data-f="json"]')).toContainText('"color": "#336699"');
});

test('コピーするとクリップボードにJSONが入り、少しするとボタン表示が戻る', async ({ page, context, browserName }) => {
  // クリップボードの中身を読み返せるのは Chromium だけ（Firefox / WebKit は自動操作で読み取り権限を付けられない）
  const canReadBack = browserName === 'chromium';
  if (canReadBack) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await page.clock.install(); // ボタン表示を戻すタイマーを実時間に依存させない
  await upload(page, 'sorcerer.zip');
  const btn = cards(page).first().getByRole('button', { name: 'ココフォリア用にコピー' });
  await btn.click();
  await expect(page.locator('#msg')).toHaveText('「テスト・ソーサラー」をコピーしました。ココフォリアの盤面で貼り付けてください。');
  await expect(cards(page).first().locator('[data-a="copy"]')).toHaveText('コピーしました ✓');

  if (canReadBack) {
    const pasted = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(pasted.kind).toBe('character');
    expect(pasted.data.name).toBe('テスト・ソーサラー');
  }

  await page.clock.runFor(2000);
  await expect(cards(page).first().locator('[data-a="copy"]')).toHaveText('ココフォリア用にコピー');
});

test('JSONを保存できる', async ({ page }) => {
  await upload(page, 'sorcerer.zip');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    cards(page).first().getByRole('button', { name: 'JSONを保存' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('テスト・ソーサラー_ccfolia.json');
  const saved = JSON.parse(readFileSync(await download.path(), 'utf-8'));
  expect(saved.data.name).toBe('テスト・ソーサラー');
});

test.describe('読めないファイル', () => {
  test.use({ allowedConsole: XML_PARSE_ERROR_NOISE });

  test('エラーを表示し、読めたものは表示する', async ({ page }) => {
    const file = name => ({ name, mimeType: 'application/octet-stream', buffer: readFileSync(fixturePath(name)) });
    await page.locator('#file-input').setInputFiles([
      file('attacks.xml'),
      { name: 'broken.xml', mimeType: 'text/xml', buffer: Buffer.from('not xml') },
      file('bomb.zip'),
    ]);
    const m = page.locator('#msg');
    await expect(m).toHaveClass(/err/);
    await expect(m).toContainText('変換しました（1体）。');
    await expect(m).toContainText('broken.xml: XMLの解析に失敗しました。');
    await expect(m).toContainText('bomb.zip: ZIP内のファイルが大きすぎます');
    await expect(cards(page)).toHaveCount(1);
  });
});


test.describe('ツールチップヘルプ', () => {
  test('マウスを乗せると出て、Esc で閉じる', async ({ page }) => {
    const wrap = page.locator('.has-tip').filter({ has: page.locator('#opt-expand') });
    const tip = wrap.getByRole('tooltip');
    await expect(tip).toBeHidden();
    await wrap.getByRole('button', { name: '説明' }).hover();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('変換した時点の数値に置き換えます');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  });

  test('キーボードでフォーカスしても出て、説明が読み上げ対象になる', async ({ page }) => {
    const box = page.locator('#opt-notes');
    await box.focus();
    const tip = page.locator('.has-tip').filter({ has: box }).getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(box).toHaveAccessibleDescription(/【見出し】付きでメモの末尾に追加/);
  });

  test('読み込み上限が converter.js の値と一致している', async ({ page }) => {
    const mb = await page.evaluate(() => Math.round(window.UdonCcfolia.LIMITS.maxInputBytes / 1024 / 1024));
    await expect(page.locator('[data-limit="maxInputBytes"]')).toHaveText(`${mb}MB`);
  });

  test('結果カードのボタンにも説明がある', async ({ page }) => {
    await upload(page, 'sorcerer.zip');
    await expect(cards(page).first().getByRole('button', { name: 'ココフォリア用にコピー' }))
      .toHaveAccessibleDescription(/Ctrl\+V/);
    await expect(cards(page).first().getByRole('button', { name: 'JSONを保存' }))
      .toHaveAccessibleDescription(/バックアップ/);
  });

  test('スマホ幅でも画面からはみ出さない', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await upload(page, 'sorcerer.zip');
    await expect(cards(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), '横スクロールが出ない').toBe(360);
    const wraps = await page.locator('.has-tip:has(> .tip-btn)').all();
    expect(wraps.length).toBeGreaterThanOrEqual(4);
    for (const wrap of wraps) {
      await wrap.locator('> .tip-btn').hover();
      const tip = wrap.locator('> .tip');
      await expect(tip).toBeVisible();
      const box = await tip.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }
  });
});

// ダブルクリックで開いた場合（file://）も CSP に阻まれずに動くこと
test('ローカルファイルとして開いても動く', async ({ page }) => {
  await openApp(page, pathToFileURL(fixturePath('../../index.html')).href);
  await upload(page, 'sorcerer.zip');
  await expect(card(page, 'テスト・ソーサラー')).toHaveCount(1);
});
