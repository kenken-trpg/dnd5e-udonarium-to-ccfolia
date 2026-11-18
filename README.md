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
| `index.html` / `style.css` / `app.js` | UI（画面・見た目・操作） |
| `converter.js` | 変換ロジック（ブラウザ・Node 共用） |
| `tests/` | テストと、生成ツールが実際に出力したサンプル（`fixtures/`） |
| `docs/manual.md` | 利用者向けマニュアル |
| `scripts/build-site.sh` | GitHub Pages の配信物（4ファイルと、手元で使うためのZIP）を作る |
| `docs/offline-readme.txt` | ZIPに入れる説明書（`README.txt`） |
| `streamlit_app.py` / `requirements.txt` / `.streamlit/` | 終了した Streamlit版の公開URLで、ブラウザ版へ案内するだけのページ（下記） |

### Streamlit版について

以前は同じ変換をする Python 版（Streamlit版）もあったが、ブラウザ版に一本化した（変換ロジックを2つの言語で二重に保つ手間をなくし、
ファイルを外に送らない版だけにするため）。公開済みの URL
（https://dnd5e-udonarium-to-ccfolia-bndd4irjirpaskop4jzyx2.streamlit.app/ ）は、ブラウザ版への案内だけを表示する。
Streamlit Community Cloud からアプリを削除したら、`streamlit_app.py`・`requirements.txt`・`.streamlit/` も消してよい。

### テスト

```sh
npm ci
npm test                         # ブラウザ版の変換ロジック（node:test）
npx playwright install chromium  # 初回だけ
npm run test:e2e                 # ブラウザ版のE2E（Playwright, Chromium）
npx playwright install firefox webkit  # 初回だけ
npm run test:e2e:all             # Chromium / Firefox / WebKit（Safari のエンジン）すべて
npm run lint                     # ESLint
```

| テスト | 内容 |
|---|---|
| `tests/convert.test.mjs` | `converter.js` の単体テスト（安全対策を含む） |
| `tests/e2e/browser.spec.mjs` | ブラウザ版を実際のブラウザで操作する（読み込み・ドロップ・オプション・コピー・保存・ツールチップ・`file://`） |
| `tests/e2e/a11y.spec.mjs` | アクセシビリティの自動チェック（axe-core、WCAG 2.1 AA）。初期画面・変換結果・ツールチップ表示中を、ライト／ダークの両方で |

E2Eテストは不安定（flaky）にならないよう、次の決まりで書いている。

- **サーバーを起動しない**: `page.route` でファイルを直接返す。ポート競合や起動待ちが無い。
- **時間で待たない**: `waitForTimeout` や `sleep` は使わず、条件が満たされるまで自動で待つアサーション（`expect(locator).toHaveText(...)` など）だけを使う。
  ページの初期化は `<html data-ready="true">` を待つ。
- **タイマーは偽の時計で進める**: 「コピーしました ✓」が元に戻るような表示は `page.clock` で時間を進めて確かめる。
- **リトライしない**: 失敗を隠さないよう `retries: 0`。失敗したテストのトレースは CI の成果物（`playwright-traces`）に残る。
- **ページ内のエラーを見逃さない**: コンソールのエラー・警告、CSP違反、外部への通信があればテストを失敗にする。
  ブラウザ自身が出すアプリと無関係な出力だけを `tests/e2e/fixtures.mjs` で除外し、特定のテストでだけ出る出力は `test.use({ allowedConsole: /…/ })` で明示する。
- **macOS では Firefox を閉じてから WebKit を回す**: macOS で Firefox が動いていると、WebKit のクリック・ホバーのテストが失敗することがある
  （テスト用の Firefox を同時に動かしたとき、普段使いの Firefox を開いていたときに起きた。WebKit 単独や Chromium との組み合わせでは起きない。アプリの不具合ではない）。
  `npm run test:e2e:all` は WebKit を最後に単独で回し、CI（Linux）はブラウザごとに別のジョブにしている。

新しいE2Eテストを足したら、`npx playwright test --repeat-each=30 --workers=8` で何度回しても通ることを確かめる。

### CI

`.github/workflows/test.yml` が main への push と PR で動く。
3つのジョブ（Lint / 単体テスト / ブラウザ版E2E）が並行して動き、npm はキャッシュする（Playwright のブラウザは、キャッシュから戻すより毎回入れる方が速いのでキャッシュしない）。
同じブランチに続けて push すると、古い実行は取り消される。

**main はブランチ保護されている。** main へ直接 push することはできず、変更は PR で入れる。
上の3つのジョブがすべて成功しないとマージできない（管理者も同じ）。強制 push と削除も禁止している。

`.github/workflows/e2e-cross-browser.yml` は、ブラウザ版に関わるファイル（`index.html`・`app.js`・`style.css`・`converter.js`・E2Eテストなど）を変えた PR のときだけ、
Firefox と WebKit で E2E を回す（Actions タブから手動でも実行できる）。

### GitHub Pages

`.github/workflows/pages.yml` が `scripts/build-site.sh` で `index.html`・`app.js`・`converter.js`・`style.css` と
手元で使うためのZIP（`dnd5e-ccfolia.zip`）を作って配信し、これらが main で変わるたびに自動で更新される（Actions タブの「Deploy to GitHub Pages」→ Run workflow で手動更新も可）。

フォークして自分で公開する場合は、**Settings → Pages → Build and deployment → Source** で「**GitHub Actions**」を選んでから上記ワークフローを実行する。

### セキュリティ

利用者が持ち込むファイルを信用しない前提で作っている。

- **CSP**: `index.html` の Content Security Policy で、インラインスクリプト・外部スクリプト・外部への通信（`connect-src 'none'`）を禁止している。
  UIのコードを `app.js` に分けているのはこのため。`index.html` に `<script>` や `style="…"` を直接書かないこと。
- **XSS 対策**: ファイル由来の文字列は `textContent` でだけ表示する。
- **ZIP爆弾・巨大ファイル対策**: 入力ファイル・ZIP内のファイル数・展開後のXMLの大きさに上限があり、展開は上限に達した時点で打ち切る。XML以外のエントリは展開しない。
- **XML**: DTD（`<!DOCTYPE>` / `<!ENTITY>`）を含むXMLは解析前に拒否する（実体展開による膨張・外部参照の対策）。
- **壊れたZIP**: 範囲外を指すヘッダなどは利用者向けのエラーにし、例外の詳細を画面に出さない。
- **コード検査**: GitHub の CodeQL（default setup）が JavaScript・Python・ワークフローを push と PR のたびに検査する。結果は Security タブに出る。
- **CI**: アクションはコミットSHAで固定し、`GITHUB_TOKEN` は読み取り専用、`npm ci --ignore-scripts`。Dependabot（`.github/dependabot.yml`）が月1回更新を提案し、脆弱性の修正は見つかり次第 PR を作る。
