# D&D5e ココフォリア変換

**公開ページ**: https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/

[D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/)（うにバター氏作）で保存した
ユドナリウムのコマ（ZIP）を、ココフォリアに貼り付けられるキャラクターJSONに変換するツール。
変換はブラウザの中だけで行い、ファイルはどこにも送信しない。生成ツールのサーバーにも接続しない。

**利用者向けの詳しい説明（オプション、変換内容、よくある質問、上限）は [マニュアル](docs/manual.md) にある。**

## 使い方

1. [D&D5E キャラクターデータベース](https://dndjp.sakura.ne.jp/LIST.php) でキャラクターシートのURLをコピーし、
   [D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/) で生成してZIPを保存する。
2. [公開ページ](https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/)を開き、保存したZIP（または中のXML）をドロップする。
   複数ファイルをまとめて読み込める。ファイルはブラウザの外に送信されない。
3. 「ココフォリア用にコピー」を押し、ココフォリアの盤面で `Ctrl+V` / `⌘V`。

手元で使う場合は、公開ページ下部の「ZIPをダウンロード」（`dnd5e-ccfolia.zip`）を展開し、`index.html` をダブルクリックで開く。

## 変換内容

| ユドナリウム | ココフォリア |
|---|---|
| `numberResource`（HP、一時的HP、インスピレーション、使用する呪文スロット lv1〜lv9） | ステータス（現在値 / 最大値） |
| その他の値（能力値、能力値修正、技能、セーヴ、AC、習熟ボーナスなど） | パラメータ |
| チャットパレット | チャットパレット（そのまま） |
| イニシアチブ | イニシアチブ値 |
| PL、レベル、クラス、種族、属性、AC、移動速度、HD、呪文DC | メモ |
| 特徴等（背景、人格的特徴ほか） | メモ（オプション） |

- パレット中の `{筋力修正}` などの参照は、同じ名前のパラメータとしてそのまま持ち込むため、ココフォリア上でも動く。
  オプションで数値に置き換えることもできる。
- 画像はココフォリアに持ち込めないので無視する。

---

## 開発

### 構成

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` / `app.js` | UI（画面・見た目・操作・ツールチップ） |
| `converter.js` | 変換ロジック・入力の上限（ブラウザ・Node 共用） |
| `archive.js` | 一括保存用のUTF-8 ZIP生成・ファイル名の安全化 |
| `tests/` | テストと、生成ツールが実際に出力したサンプル（`fixtures/`）・期待JSON（`fixtures/expected/`） |
| `docs/manual.md` | 利用者向けマニュアル（公開ページ・配布ZIPでは `manual.html` になる） |
| `docs/offline-readme.txt` | 配布ZIPに入れる説明書（`README.txt`） |
| `docs/performance.md` / `docs/benchmarks/` | 性能計測の方法と結果 |
| `scripts/build-site.sh` | GitHub Pages の配信物（アプリ・HTMLマニュアルと、手元で使うためのZIP）を作る |
| `scripts/build-manual.py` | `docs/manual.md` を目次付きの静的HTMLにする（このマニュアルで使う記法だけに対応） |
| `scripts/benchmark.mjs` | 実ブラウザの性能計測 |
| `streamlit_app.py` / `requirements.txt` / `.streamlit/` | 終了した Streamlit版の公開URLで、ブラウザ版へ案内するだけのページ（下記） |

配布ビルドには Python 3・bash・zip を使う。`scripts/build-site.sh` で作った `_site/index.html` を開くと、マニュアルも含めて公開ページと同じものを手元で確かめられる。

### Streamlit版について

以前は同じ変換をする Python 版（Streamlit版）もあったが、ブラウザ版に一本化した（変換ロジックを2つの言語で二重に保つ手間をなくし、
ファイルを外に送らない版だけにするため）。公開済みの URL
（https://dnd5e-udonarium-to-ccfolia-bndd4irjirpaskop4jzyx2.streamlit.app/ ）は、ブラウザ版への案内だけを表示する。
Streamlit Community Cloud からアプリを削除したら、`streamlit_app.py`・`requirements.txt`・`.streamlit/` も消してよい。

### テスト

```sh
npm ci
npm test                         # 単体テスト（node:test）
npx playwright install chromium  # 初回だけ
npm run test:e2e                 # E2E（Playwright, Chromium）
npx playwright install firefox webkit  # 初回だけ
npm run test:e2e:all             # Chromium / Firefox / WebKit（Safari のエンジン）すべて
npm run lint                     # ESLint
```

| テスト | 内容 |
|---|---|
| `tests/convert.test.mjs` | `converter.js` の単体テスト（ZIP爆弾・壊れたZIP・DTD などの安全対策を含む） |
| `tests/compatibility.test.mjs` | 5種類の入力を、既定・参照展開とメモありの2設定で期待JSONと比べる。警告（未解決参照・重複）の検出 |
| `tests/archive.test.mjs` | 一括保存ZIPを Python 標準の ZIP リーダーで独立に検証（CRC・UTF-8の名前）。ファイル名の安全化 |
| `tests/csp.test.mjs` | `index.html`・`manual.html` の CSP に必須の指定があり、インラインスクリプトなどが無いこと |
| `tests/e2e/browser.spec.mjs` | 実際のブラウザで操作する（読み込み・ドロップ・オプション・コピー・保存・ツールチップ・`file://`・配布ZIP・Trusted Types） |
| `tests/e2e/results.spec.mjs` | 警告・一括保存（保存したZIPの中身も確かめる）・削除・進捗・中断と選び直し・期待JSONとの一致 |
| `tests/e2e/a11y.spec.mjs` | アクセシビリティの自動チェック（axe-core、WCAG 2.1 AA）。主な画面の状態を、ライト／ダークの両方で（Chromium のみ） |

期待JSON（`tests/fixtures/expected/`）を変えるときは、入力と変換仕様を確かめてから差分をレビューする。自動で上書きする更新コマンドはあえて用意していない。

#### E2Eテストを不安定（flaky）にしないための決まり

- **サーバーを起動しない**: `page.route` でファイルを直接返す。ポート競合や起動待ちが無い。
- **時間で待たない**: `waitForTimeout` や `sleep` は使わず、条件が満たされるまで自動で待つアサーション（`expect(locator).toHaveText(...)` など）だけを使う。
  ページの初期化は `<html data-ready="true">` を待つ。
- **読み込みが終わってから操作する**: ファイルは `tests/e2e/fixtures.mjs` の `upload()` で選ぶ。読み込みの完了（進捗表示が消える）まで待つので、結果の追加と次の操作が競合しない
  （読み込み中にクリックすると、WebKit でクリックが終わらなくなることがあった）。読み込み中の状態を確かめるテストだけ `setInputFiles` を直接使う。
- **タイマーは偽の時計で進める**: 「コピーしました ✓」が元に戻るような表示は `page.clock` で時間を進めて確かめる。
- **OS の共有資源に触らない**: コピーのテストはブラウザ内で Clipboard API を差し替える（OS のクリップボードや権限設定による競合を避ける）。
  実際のクリップボードへの貼り付けは、公開ページとダウンロード版で手動で確かめる。
- **リトライしない**: 失敗を隠さないよう `retries: 0`。失敗したテストのトレースは CI の成果物（`playwright-traces`）に残る。
- **ページ内のエラーを見逃さない**: コンソールのエラー・警告、CSP違反、外部への通信があればテストを失敗にする。
  ブラウザ自身が出すアプリと無関係な出力だけを `tests/e2e/fixtures.mjs` で除外し、特定のテストでだけ出る出力は `test.use({ allowedConsole: /…/ })` で明示する。
- **複数の Playwright コマンドを同時に動かさない**: 成果物フォルダや macOS のブラウザ操作が競合する。E2E とベンチマークも順番に実行する。
- **macOS では Firefox を閉じてから WebKit を回す**: macOS で Firefox が動いていると、WebKit のクリック・ホバーのテストが失敗することがある
  （アプリの不具合ではない）。`npm run test:e2e:all` は WebKit を最後に1ワーカーで単独で回し、CI（Linux）はブラウザごとに別のジョブにしている。

新しいE2Eテストを足したら、何度回しても通ることを確かめる。

```sh
npx playwright test --project=chromium --repeat-each=20 --workers=10
npx playwright test --project=firefox --repeat-each=8 --workers=6
npx playwright test --project=webkit --repeat-each=6
```

### CI

`.github/workflows/test.yml` が main への push とすべての PR で動く。3つのジョブ（Lint / 単体テスト / ブラウザ版E2E）が並行して動く。

- npm はダウンロードのキャッシュを使う（`npm ci --prefer-offline`）。
- E2E の Chromium（ヘッドレス版）は Playwright の版ごとにキャッシュする。
- OS のライブラリは、足りないときだけ apt で入れる（ランナーのイメージにほぼそろっている）。
  以前は毎回 `--with-deps` で入れていて、ふだん約20秒、apt のミラーが遅いときは3分以上かかっていた。
- E2E はランナーの4コアに合わせて4並列で回す。
- ランナーは `ubuntu-24.04` に固定している（`ubuntu-latest` の OS が切り替わったとき、ブラウザに必要なライブラリが急に変わらないように）。
- 同じブランチに続けて push すると、古い実行は取り消される。

**main はブランチ保護されている。** main へ直接 push することはできず、変更は PR で入れる。
上の3つのジョブがすべて成功しないとマージできない（管理者も同じ）。強制 push と削除も禁止している。
必須チェックはジョブ名で登録しているので、ジョブ名（`Lint（ESLint）`・`単体テスト`・`E2E（ブラウザ版）`）は変えないこと。

`.github/workflows/e2e-cross-browser.yml` は、ブラウザ版に関わるファイル（`index.html`・`app.js`・`style.css`・`converter.js`・E2Eテストなど）を変えた PR のときだけ、
Firefox と WebKit で E2E を回す（Actions タブから手動でも実行できる）。この2つは OS のライブラリ（GStreamer など）がランナーに無く、
apt で入れると遅く止まることもあるので、ブラウザとライブラリが入った Playwright の公式コンテナ（`mcr.microsoft.com/playwright`）で動かす。
コンテナの版は `package-lock.json` の `@playwright/test` から決めるので、Dependabot が Playwright を上げても手で直す必要はない。

### GitHub Pages

`.github/workflows/pages.yml` が `scripts/build-site.sh` で `index.html`・`app.js`・`converter.js`・`archive.js`・`style.css`・`manual.html` と
手元で使うためのZIP（`dnd5e-ccfolia.zip`）を作って配信し、これらが main で変わるたびに自動で更新される（Actions タブの「Deploy to GitHub Pages」→ Run workflow で手動更新も可）。

フォークして自分で公開する場合は、**Settings → Pages → Build and deployment → Source** で「**GitHub Actions**」を選んでから上記ワークフローを実行する。

### セキュリティ

利用者が持ち込むファイルを信用しない前提で作っている。

- **CSP**: `index.html` の Content Security Policy で、インラインスクリプト・外部スクリプト・外部への通信（`connect-src 'none'`）を禁止している。
  UIのコードを `app.js` に分けているのはこのため。`index.html` に `<script>` や `style="…"` を直接書かないこと（`tests/csp.test.mjs` が確かめる）。
- **Trusted Types**: CSP の `require-trusted-types-for 'script'` で、`innerHTML` などへの文字列の代入を対応ブラウザ（Chromium・Firefox・Safari の新しい版）で禁止している。
  例外は XML の解析（`DOMParser`）に使う `udon-xml` ポリシーだけ（`converter.js`）。解析した文書はスクリプトを実行せず、値を読むだけに使う。
- **XSS 対策**: ファイル由来の文字列は `textContent` でだけ表示する。Trusted Types に対応していないブラウザでも、これで安全に表示できる。
- **ZIP爆弾・巨大ファイル対策**: 入力ファイル・ZIP内のファイル数・展開後のXMLの大きさに上限があり（`converter.js` の `LIMITS`）、展開は上限に達した時点で打ち切る。XML以外のエントリは展開しない。
  画面の説明に出す上限の数値も `LIMITS` から作る。
- **XML**: DTD（`<!DOCTYPE>` / `<!ENTITY>`）を含むXMLは解析前に拒否する（実体展開による膨張・外部参照の対策）。
- **壊れたZIP**: 範囲外を指すヘッダなどは利用者向けのエラーにし、例外の詳細を画面に出さない。
- **保存するファイル名**: キャラクター名からパス区切り・制御文字・Windows の予約名を除き、同名は連番にする（`archive.js`）。
- **コード検査**: GitHub の CodeQL（default setup）が JavaScript・Python・ワークフローを push と PR のたびに検査する。結果は Security タブに出る。
- **CI**: アクションはコミットSHAで固定し、`GITHUB_TOKEN` は読み取り専用、checkout は認証情報を残さない（`persist-credentials: false`）、`npm ci --ignore-scripts`。

### 依存関係の更新（Dependabot）

`.github/dependabot.yml` で、npm と GitHub Actions の定期更新を **月1回**（毎月1日、日本時間4時）提案する。

- npm の依存はすべて開発用（テスト・Lint）で、公開ページには1つも入らない。急いで上げる理由は脆弱性の修正だけで、
  それはリポジトリ設定の「Dependabot security updates」で見つかり次第すぐ PR が来る（定期更新の間隔とは無関係）。
- **一緒に上げないと壊れるものは、メジャー版も含めて1つの PR にまとめる**:
  `eslint`（eslint・@eslint/*・globals）、`playwright`（@playwright/*・@axe-core/*）。
  それ以外はマイナー・パッチだけを1つにまとめ、メジャー版は個別の PR で確かめる。GitHub Actions はメジャー版も含めて1つの PR にまとめる。
- 公開から7日（npm のメジャー版は14日）たった版だけを取り込む（乗っ取られたパッケージが公開・削除されるまでの期間を避ける）。
- 移転案内用の Streamlit（`requirements.txt`）は定期更新の対象外。

### 性能計測

`npm run benchmark` で、実ブラウザに通常のXMLとパレットを256KiB増やしたXMLを1・10・50体読み込ませ、XML解析・変換・DOM更新・読み込み全体・総時間を測る。
事前に `npx playwright install --only-shell chromium` を実行する。結果は `.local-artifacts/benchmark/latest.json` に保存する（`npm run benchmark -- /tmp/benchmark.json` で出力先を指定できる）。
方法・結果・判断は [docs/performance.md](docs/performance.md) にある。速度は環境に依存するので、CI では固定の時間閾値による合否判定はしない。
