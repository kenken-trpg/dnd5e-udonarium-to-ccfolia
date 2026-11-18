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
  // GitHub の公開リポジトリのランナーは4コア。テストは互いに独立しているので4並列で回す
  workers: CI ? 4 : undefined,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: CI ? [['github'], ['list']] : 'list',
  use: {
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  // 通常は Chromium だけ（npm run test:e2e）。Firefox / WebKit も回すときは npm run test:e2e:all
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', testIgnore: '**/a11y.spec.mjs', use: devices['Desktop Firefox'] },
    // macOSの複数WebKitウィンドウ間でクリック・ホバーが競合するため、ファイル内は直列実行。
    { name: 'webkit', workers: 1, fullyParallel: false, testIgnore: '**/a11y.spec.mjs', use: devices['Desktop Safari'] },
  ],
});
