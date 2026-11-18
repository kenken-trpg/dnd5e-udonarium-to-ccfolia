// 実ブラウザで、XML解析・変換・DOM更新とファイル選択から表示完了までを分けて測る。
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(process.argv[2] || '.local-artifacts/benchmark/latest.json');
const fixture = await readFile(new URL('../tests/fixtures/attacks.xml', import.meta.url));
const workloads = [
  { name: 'standard', buffer: fixture },
  { name: 'large-palette', buffer: Buffer.from(fixture.toString('utf8').replace('</chat-palette>', '\n// ' + 'x'.repeat(256 * 1024) + '\n</chat-palette>')) },
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(root + 'index.html').href);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const samples = [];
  for (const workload of workloads) for (const count of [1, 10, 50]) {
    const runs = [];
    // 各件数につき1回ウォームアップし、続く5回を記録する。
    for (let run = 0; run < 6; run++) {
      const start = performance.now();
      await page.locator('#file-input').setInputFiles(Array.from({ length: count }, (_, index) => ({
        name: `sample-${index}.xml`, mimeType: 'text/xml', buffer: workload.buffer,
      })));
      await expect(page.locator('#msg')).toHaveText(`変換しました（${count}体）。`);
      await expect(page.locator('#results article')).toHaveCount(count);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const totalMs = performance.now() - start;
      const timings = await page.evaluate(() => Object.fromEntries(['parse', 'convert', 'display'].map(name => [
        name + 'Ms', performance.getEntriesByName(`udon:${name}`).reduce((sum, entry) => sum + entry.duration, 0),
      ])));
      if (run) runs.push({ totalMs, ...timings });
    }
    const medians = Object.fromEntries(Object.keys(runs[0]).map(key => [key,
      Number(runs.map(run => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)].toFixed(2)),
    ]));
    samples.push({ workload: workload.name, characters: count, inputBytes: count * workload.buffer.length, medians, runs });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const report = {
    measuredAt: new Date().toISOString(),
    environment: { node: process.version, browser: browser.version(), os: `${platform()} ${arch()}`, cpu: cpus()[0]?.model, viewport: '1280x800' },
    fixture: { name: 'attacks.xml', sha256: createHash('sha256').update(fixture).digest('hex') },
    workloads: workloads.map(workload => ({ name: workload.name, bytesPerCharacter: workload.buffer.length, sha256: createHash('sha256').update(workload.buffer).digest('hex') })),
    methodology: '1回ウォームアップ後5回。totalMsは自動操作・ファイル読み込み・待機・2描画フレームを含む。parse/convert/displayはアプリ内の同期処理のみ。displayはJSON整形・診断・DOM更新を含み、描画完了時間とは異なる。各中央値は独立で、合計と一致するとは限らない。',
    samples,
  };
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ report: destination, environment: report.environment, samples: samples.map(({ workload, characters, inputBytes, medians }) => ({ workload, characters, inputBytes, ...medians })) }, null, 2) + '\n');
} finally { await browser.close(); }
