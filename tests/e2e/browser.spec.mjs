// ブラウザ版（index.html + app.js + converter.js）のE2Eテスト
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, expect, openApp, fixturePath, upload, XML_PARSE_ERROR_NOISE } from './fixtures.mjs';

const cards = page => page.locator('#results article');
const card = (page, name) => cards(page).filter({ has: page.getByRole('heading', { name }) });
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
  await expect(page.locator('#msg')).toHaveText('変換しました（1体）。');
  await upload(page, 'attacks.xml');
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, 'テスト・アーマラー')).toHaveCount(1);
});

test('出力オプションで結果が変わる', async ({ page }) => {
  await upload(page, 'multiclass.xml', 'attacks.xml');
  await expect(cards(page)).toHaveCount(2);
  const multi = cards(page).nth(0);
  const attacks = cards(page).nth(1);
  await expect(multi.locator('[data-f="memo"]')).not.toContainText('【背景】');

  await page.getByLabel('背景・人格的特徴などをメモに入れる').check();
  await expect(multi.locator('[data-f="memo"]')).toContainText('【背景】\n侍祭');

  await expect(attacks.locator('[data-f="palette"]')).toContainText('{');
  await page.getByLabel('パレットの {参照} を数値に置き換える').check();
  await expect(attacks.locator('[data-f="palette"]')).not.toContainText('{');
  await expect(attacks.locator('[data-f="palette"]')).toContainText('AR+3 【敏捷力】能力値判定');

  await page.getByLabel('コマの色', { exact: true }).fill('#336699');
  await expect(attacks.locator('[data-f="json"]')).toContainText('"color": "#336699"');
});

test('コピーするJSONとボタン表示の復帰を確認する', async ({ page }) => {
  // OSの共有クリップボードへの競合や、ブラウザごとの権限差をなくす。
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.copiedText = text; },
    } });
  });
  await page.clock.install();
  await upload(page, 'sorcerer.zip');
  const btn = cards(page).first().locator('[data-a="copy"]');
  await btn.click();
  await expect(btn).toHaveText('コピーしました ✓');
  const pasted = JSON.parse(await page.evaluate(() => window.copiedText));
  expect(pasted.kind).toBe('character');
  expect(pasted.data.name).toBe('テスト・ソーサラー');
  await page.clock.runFor(2000);
  await expect(btn).toHaveText('ココフォリア用にコピー');
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

  test('説明文の読み込み上限が converter.js の値と一致している', async ({ page }) => {
    const limits = await page.evaluate(() => window.UdonCcfolia.LIMITS);
    const shown = page.locator('[data-limit]');
    await expect(shown).toHaveCount(5);
    for (const el of await shown.all()) {
      const key = await el.getAttribute('data-limit');
      await expect(el).toHaveText(key.endsWith('Bytes') ? `${Math.round(limits[key] / 1024 / 1024)}MB` : String(limits[key]));
    }
  });

  test('説明の上にマウスを動かしても消えない', async ({ page }) => {
    const wrap = page.locator('.has-tip').filter({ has: page.locator('#opt-expand') });
    const tip = wrap.getByRole('tooltip');
    await wrap.getByRole('button', { name: '説明' }).hover();
    await expect(tip).toBeVisible();
    const box = await tip.boundingBox();
    // ボタンから説明の中央へ、隙間を通ってゆっくり動かす
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await expect(tip).toBeVisible();
    await page.mouse.move(1, 1);
    await expect(tip).toBeHidden();
  });

  test('フォーカスだけで出ている説明は、下にあるもののクリックを横取りしない', async ({ page }) => {
    await page.locator('#opt-notes').focus();
    const tip = page.locator('.has-tip').filter({ has: page.locator('#opt-notes') }).getByRole('tooltip');
    await expect(tip).toBeVisible();
    expect(await tip.evaluate(el => {
      const r = el.getBoundingClientRect();
      return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.tip');
    })).toBe(false);
  });

  test('画面の下端では説明を上に出す', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    const wrap = page.locator('.has-tip').filter({ has: page.locator('#opt-expand') });
    // ? ボタンが画面の下端すれすれに来るようにスクロールする
    await wrap.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().bottom - window.innerHeight + 2));
    await wrap.getByRole('button', { name: '説明' }).hover();
    const tip = wrap.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(wrap).toHaveClass(/tip-above/);
    const [tipBox, wrapBox] = [await tip.boundingBox(), await wrap.boundingBox()];
    expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(wrapBox.y);
    expect(tipBox.y).toBeGreaterThanOrEqual(0);
  });

  test('結果カードと結果の操作ボタンにも説明がある', async ({ page }) => {
    await upload(page, 'sorcerer.zip');
    const result = cards(page).first();
    await expect(result.getByRole('button', { name: 'ココフォリア用にコピー' })).toHaveAccessibleDescription(/Ctrl\+V/);
    await expect(result.getByRole('button', { name: 'JSONを保存' })).toHaveAccessibleDescription(/バックアップ/);
    await expect(result.getByRole('button', { name: 'この結果を削除' })).toHaveAccessibleDescription(/このキャラクターだけ/);
    await expect(page.getByRole('button', { name: '全員分をZIPで保存' })).toHaveAccessibleDescription(/1体ずつ/);
    await expect(page.getByRole('button', { name: 'すべてクリア' })).toHaveAccessibleDescription(/出力オプションの記憶は消えません/);
  });

  test('? ボタンはそれぞれ何の説明か分かる名前を持つ', async ({ page }) => {
    const names = await page.locator('.tip-btn').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-label')));
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(new Set(names).size, '同じ名前の ? ボタンが無い').toBe(names.length);
  });

  test('スマホ幅でも画面からはみ出さない', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await upload(page, 'sorcerer.zip');
    await expect(cards(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), '横スクロールが出ない').toBe(360);
    const wraps = await page.locator('.has-tip:has(> .tip-btn)').all();
    expect(wraps.length).toBeGreaterThanOrEqual(4);
    for (const wrap of wraps) {
      // 前の説明が次の ? ボタンに重なっていると、マウスが説明の上に乗ったままになるので一度外す
      await page.mouse.move(1, 1);
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

test.describe('出力オプションの記憶', () => {
  test('選んだオプションは再読み込みしても残る', async ({ page }) => {
    await page.getByLabel('背景・人格的特徴などをメモに入れる').check();
    await page.getByLabel('コマの色', { exact: true }).fill('#336699');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByLabel('背景・人格的特徴などをメモに入れる')).toBeChecked();
    await expect(page.getByLabel('パレットの {参照} を数値に置き換える')).not.toBeChecked();
    await expect(page.getByLabel('コマの色', { exact: true })).toHaveValue('#336699');
    await upload(page, 'multiclass.xml');
    await expect(cards(page).first().locator('[data-f="memo"]')).toContainText('【背景】');
  });

  for (const [label, stored] of [
    ['壊れたJSON', '{broken'],
    ['型や形式が違う値', JSON.stringify({ includeNotes: 'yes', expandRefs: 1, color: 'red; background:url(x)' })],
  ]) {
    test(`記憶した値が${label}なら既定のまま動く`, async ({ page }) => {
      await page.evaluate(v => localStorage.setItem('dnd5e-ccfolia:options', v), stored);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByLabel('背景・人格的特徴などをメモに入れる')).not.toBeChecked();
      await expect(page.getByLabel('パレットの {参照} を数値に置き換える')).not.toBeChecked();
      await expect(page.getByLabel('コマの色', { exact: true })).toHaveValue('#888888');
    });
  }
});

test('公開ページには手元で使うZIPの案内があり、ZIPから開いたときは出さない', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'ZIPをダウンロード' })).toHaveAttribute('href', 'dnd5e-ccfolia.zip');
  await openApp(page, pathToFileURL(fixturePath('../../index.html')).href);
  await expect(page.getByRole('link', { name: 'ZIPをダウンロード' })).toBeHidden();
});

// 配信するZIPを実際に作って展開し、中の index.html をダブルクリックで開いた想定で使えること
test('配布用ZIPを展開してそのまま使える', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'ZIPの中身はブラウザによらないので Chromium だけで確かめる');
  const out = testInfo.outputPath('site');
  execFileSync('bash', [fileURLToPath(new URL('../../scripts/build-site.sh', import.meta.url)), out]);
  execFileSync('unzip', ['-q', `${out}/dnd5e-ccfolia.zip`, '-d', `${out}/extracted`]);
  const dir = `${out}/extracted/dnd5e-ccfolia`;
  expect(readdirSync(dir).sort()).toEqual(['README.txt', 'app.js', 'archive.js', 'converter.js', 'index.html', 'manual.html', 'style.css']);

  await openApp(page, pathToFileURL(`${dir}/index.html`).href);
  await upload(page, 'sorcerer.zip');
  await expect(card(page, 'テスト・ソーサラー')).toHaveCount(1);
  await page.goto(pathToFileURL(`${dir}/manual.html`).href);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('D&D5e ココフォリア変換 マニュアル');
  // 目次は本文の h2 見出しと1対1で対応する
  await expect(page.getByRole('navigation', { name: '目次' }).getByRole('link')).toHaveCount(await page.locator('main > h2').count());
  expect(await page.locator('a[href^="#"]').evaluateAll(links => links
    .map(link => link.getAttribute('href').slice(1)).filter(id => !document.getElementById(decodeURIComponent(id))))).toEqual([]);
  await page.getByRole('link', { name: '変換ツールに戻る' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
});

test('選択数の上限を超えても直前の変換結果を保持する', async ({ page }) => {
  await upload(page, 'attacks.xml');
  await expect(cards(page)).toHaveCount(1);
  await page.locator('#file-input').setInputFiles(Array.from({ length: 51 }, (_, i) => ({
    name: `${i}.xml`, mimeType: 'text/xml', buffer: Buffer.from('<character/>'),
  })));
  await expect(page.locator('#msg')).toContainText('50ファイル、合計20MBまで');
  await expect(card(page, 'テスト・アーマラー')).toHaveCount(1);
});

test('Clipboard APIと代替コピーが失敗したら手動コピーを案内する', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('denied'); },
    } });
    document.execCommand = () => false;
  });
  await upload(page, 'attacks.xml');
  await cards(page).first().locator('[data-a="copy"]').click();
  await expect(page.locator('#msg')).toContainText('手動でコピーしてください');
  await expect(page.locator('textarea')).toHaveCount(0);
});

test('タッチ操作で説明を開き、Esc後に再表示できる', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  try {
    // ページfixtureのルーティングを使う通常テストと同じファイルを開く。
    await openApp(page, pathToFileURL(fixturePath('../../index.html')).href);
    const wrap = page.locator('.has-tip').filter({ has: page.locator('#opt-expand') });
    await wrap.getByRole('button').tap();
    await expect(wrap.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(wrap.getByRole('tooltip')).toBeHidden();
    await wrap.getByRole('button').tap();
    await expect(wrap.getByRole('tooltip')).toBeVisible();
  } finally {
    await context.close();
  }
});

test.describe('Trusted Types', () => {
  // 禁止した代入はブラウザがコンソールに報告する（このテストではわざと起こす）
  test.use({ allowedConsole: /TrustedHTML|injection sink/ });

  test('innerHTML などへの文字列の代入を禁止している（対応ブラウザのみ）', async ({ page }) => {
    const result = await page.evaluate(() => {
      if (!('trustedTypes' in window)) return 'unsupported';
      try { document.body.insertAdjacentHTML('beforeend', '<img src=x>'); return 'allowed'; } catch (e) { return e.name; }
    });
    test.skip(result === 'unsupported', 'このブラウザは Trusted Types に対応していない');
    expect(result).toBe('TypeError');
    await expect(page.locator('body > img')).toHaveCount(0);
  });
});
