// マニュアル（docs/manual.md）のスクリーンショットを docs/images/ に作る。
// 使い方: node scripts/manual-screenshots.mjs [--external 外部サイトの画面のフォルダ]
//
// - 変換ページの画面は、リポジトリの index.html とテスト用のデータ（tests/fixtures/）から毎回撮り直す。
// - 生成ツールとココフォリアの画面は、--external のフォルダにある撮影済みの画面（1280x720・倍率1.5、つまり 1920x1080）
//   から切り出し、操作する場所を赤枠で囲む。--external を省くと作り直さない（docs/images/ にある画像をそのまま使う）。
//   必要なファイル: gen.png（生成ツール）、ccf-pasted.png / ccf-menu.png / ccf-edit.png / ccf-picker.png / ccf-done.png（ココフォリア）
//   ココフォリアの画面はゲストで入れるルームに、テスト用のコマ（tests/fixtures/sorcerer.zip を変換したもの）を貼り付けて撮る。
//   ほかの人のキャラクターやルームが写らないようにする。
import { chromium } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'docs', 'images');
const FIXTURE = name => join(ROOT, 'tests', 'fixtures', name);
const args = process.argv.slice(2);
const ext = args.includes('--external') ? args[args.indexOf('--external') + 1] : null;

const browser = await chromium.launch();
// 変換ページの本文の幅（main の max-width 820px − 左右の余白）がそのまま画像の幅になる
const context = await browser.newContext({ viewport: { width: 820, height: 2400 }, deviceScaleFactor: 1, locale: 'ja-JP', colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('pageerror', e => { throw e; });
// 公開ページと同じ表示にする（file:// で開くと「ZIPをダウンロード」が隠れる）。外部への通信はしない
const ORIGIN = 'https://app.test';
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (url.origin !== ORIGIN || !/^[\w-]+\.(html|js|css)$/.test(file)) return route.abort();
  return route.fulfill({ body: readFileSync(join(ROOT, file)), contentType: TYPES[file.split('.').pop()] });
});
const written = [];

/** 複数の要素を囲む範囲を撮る。pad は周りの余白（px） */
async function shot(name, locators, { pad = 0, maxHeight = Infinity } = {}) {
  const boxes = [];
  for (const locator of [locators].flat()) {
    await locator.scrollIntoViewIfNeeded();
    boxes.push(await locator.boundingBox());
  }
  const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
  const right = Math.max(...boxes.map(b => b.x + b.width)) + pad;
  const bottom = Math.min(Math.max(...boxes.map(b => b.y + b.height)) + pad, y + maxHeight);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, clip: { x, y, width: Math.min(right, 820) - x, height: bottom - y }, animations: 'disabled', caret: 'hide' });
  written.push(name);
}

async function open() {
  await page.goto(`${ORIGIN}/`);
  await page.locator('html[data-ready="true"]').waitFor();
  await page.mouse.move(0, 0);
}
async function load(...names) {
  await page.locator('#file-input').setInputFiles(names.map(n => n.includes('/') ? n : FIXTURE(n)));
  await page.locator('#loading').waitFor({ state: 'hidden' });
}
const section = id => page.locator(`section[aria-labelledby="${id}"]`);
const card = name => page.locator('#results article').filter({ has: page.getByRole('heading', { name, exact: true }) });

// 1. 読み込む前の枠
await open();
await shot('import', section('in-h'));
// 出力オプション
await shot('options', section('opt-h'));
// ツールチップ（? にマウスを乗せたところ）
await page.getByRole('button', { name: 'メモに入れる項目の説明' }).hover();
await section('opt-h').locator('.tip').first().waitFor({ state: 'visible' });
await shot('tooltip', [section('opt-h'), section('opt-h').locator('.tip').first()]);
await page.mouse.move(0, 0);

// 1体の変換結果
await load('sorcerer.zip');
await shot('result', card('テスト・ソーサラー'));
// チャットパレットを開いたところ
await card('テスト・ソーサラー').getByText('チャットパレット', { exact: true }).click();
await shot('palette', card('テスト・ソーサラー'), { maxHeight: 560 });
// コピーしたところ
await card('テスト・ソーサラー').getByText('チャットパレット', { exact: true }).click();
await card('テスト・ソーサラー').getByRole('button', { name: 'ココフォリア用にコピー' }).click();
await page.getByRole('button', { name: 'コピーしました ✓' }).waitFor();
await page.mouse.move(0, 0); // ボタンの説明を閉じる
await page.getByRole('button', { name: 'コピーしました ✓' }).blur();
await shot('copied', card('テスト・ソーサラー').locator('.actions'), { pad: 8 });

// 複数ファイル: ファイルごとの処理結果と、全員分の操作
await open();
await load('sorcerer.zip', 'mixed.zip', 'edge-cases.xml');
await shot('status', section('in-h'));
await shot('result-tools', page.locator('#result-tools'), { pad: 4 });
// 貼り付け前の確認: パレットに手で書き足した行の参照先が無い場合
const tmp = mkdtempSync(join(tmpdir(), 'manual-'));
const edited = join(tmp, 'armorer.xml');
writeFileSync(edited, readFileSync(FIXTURE('attacks.xml'), 'utf8').replace('AR+3 イニシアチブ\n', 'AR+3 イニシアチブ\nAR{自作の修正} 自作の判定\n'));
await open();
await load(edited);
rmSync(tmp, { recursive: true });
const armorer = card('テスト・アーマラー');
await shot('warning', [armorer.locator('h3'), armorer.locator('[data-f="chips"]')], { pad: 10 });

// 画面下（ダウンロード版・マニュアル・動画マニュアル）
await shot('footer', page.locator('footer'), { pad: 8 });

// 外部サイトの画面を切り出す。座標は 1920x1080 の画面上の位置
// box: [左, 上, 右, 下] / marks: 赤枠で囲む場所 / scale: 縮小率
const EXTERNAL = {
  generator: { src: 'gen.png', box: [110, 70, 1810, 670], scale: 0.46, marks: [[130, 320, 1790, 404], [735, 433, 1185, 515]] },
  'ccf-paste': { src: 'ccf-pasted.png', box: [0, 0, 880, 700], scale: 0.85, marks: [[600, 460, 760, 628], [8, 104, 382, 170]] },
  'ccf-menu': { src: 'ccf-menu.png', box: [540, 440, 1000, 1070], scale: 0.8, marks: [[680, 510, 960, 558]] },
  'ccf-edit': { src: 'ccf-edit.png', box: [510, 48, 1410, 1032], scale: 0.7, marks: [[546, 206, 620, 280]] },
  'ccf-picker': { src: 'ccf-picker.png', box: [285, 48, 1635, 390], scale: 0.58, marks: [[1544, 60, 1618, 132], [624, 232, 766, 374]] },
  'ccf-done': { src: 'ccf-done.png', box: [0, 0, 880, 700], scale: 0.85, marks: [[600, 460, 760, 628]] },
};
if (ext) {
  const tool = await browser.newPage();
  for (const [name, { src, box, scale, marks }] of Object.entries(EXTERNAL)) {
    const data = 'data:image/png;base64,' + readFileSync(join(ext, src)).toString('base64');
    const png = await tool.evaluate(async ({ data, box, scale, marks }) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const [l, t, r, b] = box;
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round((r - l) * scale), height: Math.round((b - t) * scale) });
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, l, t, r - l, b - t, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 3;
      for (const [ml, mt, mr, mb] of marks) {
        ctx.beginPath();
        ctx.roundRect((ml - l) * scale, (mt - t) * scale, (mr - ml) * scale, (mb - mt) * scale, 6);
        ctx.stroke();
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { data, box, scale, marks });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(png, 'base64'));
    written.push(name);
  }
}

await browser.close();
console.log('wrote:', written.map(n => `docs/images/${n}.png`).join(' '));
