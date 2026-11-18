// ブラウザ版（index.html）のE2Eテスト設定。実行: npm run test:e2e
//
// 不安定（flaky）にしないための方針:
// - Webサーバーを起動しない。page.route でリポジトリのファイルを直接返す（ポート競合・起動待ちが無い）
// - 固定時間の sleep を使わず、自動で待つアサーション（expect(...).toHaveText など）だけを使う
// - タイマーに依存する表示は page.clock で時間を進めて確かめる
// - 失敗を隠さないよう、リトライはしない
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  workers: CI ? 2 : undefined,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium' }],
});
