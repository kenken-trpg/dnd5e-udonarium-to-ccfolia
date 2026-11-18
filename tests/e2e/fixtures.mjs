import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const ORIGIN = 'https://app.test';

// GitHub Pages に配信するファイルだけを返す（pages.yml と揃える）
const SITE = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/converter.js': ['converter.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
};

export const test = base.extend({
  /** ページ内のエラー・CSP違反・外部への通信。テストの最後に空であることを確かめる */
  problems: async ({}, use) => { await use([]); },

  page: async ({ page, problems }, use) => {
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      // ダブルクリックで開いた場合を想定した file:// はリポジトリ内だけ許す
      if (url.protocol === 'file:' && fileURLToPath(url).startsWith(ROOT)) return route.continue();
      const file = url.origin === ORIGIN && SITE[url.pathname];
      if (!file) {
        problems.push(`unexpected request: ${route.request().url()}`);
        return route.abort();
      }
      return route.fulfill({ body: readFileSync(ROOT + file[0]), contentType: file[1] });
    });
    await use(page);
    expect(problems, 'ページ内のエラーや外部への通信が無いこと').toEqual([]);
  },
});

export { expect };

/** トップページを開き、app.js の初期化が終わるまで待つ */
export async function openApp(page, url = `${ORIGIN}/`) {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

export const fixturePath = name => FIXTURES + name;
