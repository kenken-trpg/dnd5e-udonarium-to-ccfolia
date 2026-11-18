// アクセシビリティの自動チェック（axe-core）。WCAG 2.1 AA の基準で違反が無いことを確かめる。
// 規則は DOM と計算済みのスタイルで判定するのでブラウザによる差は小さい。Chromium だけで回す
import AxeBuilder from '@axe-core/playwright';
import { test, expect, openApp, fixturePath } from './fixtures.mjs';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** 違反を「規則: 対象」の読みやすい一覧にする（失敗時のメッセージ用） */
async function violations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary.split('\n')[1]?.trim() ?? ''}`));
}

test.skip(({ browserName }) => browserName !== 'chromium', 'アクセシビリティの検査は Chromium だけで回す');

for (const colorScheme of ['light', 'dark']) {
  test.describe(`${colorScheme} テーマ`, () => {
    test.use({ colorScheme });

    test.beforeEach(async ({ page }) => {
      await openApp(page);
    });

    test('初期画面', async ({ page }) => {
      expect(await violations(page)).toEqual([]);
    });

    test('変換結果（詳細を開いた状態）', async ({ page }) => {
      await page.locator('#file-input').setInputFiles(fixturePath('sorcerer.zip'));
      await expect(page.locator('#results article')).toHaveCount(1);
      for (const d of await page.locator('#results details').all()) await d.locator('summary').click();
      await expect(page.locator('#results details[open]')).toHaveCount(3);
      expect(await violations(page)).toEqual([]);
    });

    test('ツールチップを表示した状態', async ({ page }) => {
      await page.locator('#opt-notes').focus();
      await expect(page.getByRole('tooltip').filter({ hasText: '【見出し】' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
