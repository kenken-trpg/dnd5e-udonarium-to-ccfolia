# D&D5e ココフォリア変換

**公開ページ**
- ブラウザ版: https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/
- Streamlit版: https://dnd5e-udonarium-to-ccfolia-bndd4irjirpaskop4jzyx2.streamlit.app/

[D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/)（うにバター氏作）で保存した
ユドナリウムのコマ（ZIP）を、ココフォリアに貼り付けられるキャラクターJSONに変換するツール。
同じ変換をする2つの版がある。どちらも生成ツールのサーバーには接続せず、利用者がアップロードしたファイルだけを変換する。

- **ブラウザ版**（`index.html`）: [公開ページ](https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/)でそのまま使える。手元でダブルクリックして開いてもよい。
- **Streamlit版**（`streamlit_app.py`）: Python で動かす版。[Streamlit Community Cloud](https://dnd5e-udonarium-to-ccfolia-bndd4irjirpaskop4jzyx2.streamlit.app/) で公開している。手元でも起動できる。

**利用者向けの詳しい説明（オプション、変換内容、よくある質問、上限）は [マニュアル](docs/manual.md) にある。**

## 使い方（ブラウザ版）

1. [D&D5E キャラクターデータベース](https://dndjp.sakura.ne.jp/LIST.php) でキャラクターシートのURLをコピーし、
   [D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/) で生成してZIPを保存する。
2. [公開ページ](https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/)を開き、保存したZIP（または中のXML）をドロップする。
   複数ファイルをまとめて読み込める。ファイルはブラウザの外に送信されない。
3. 「ココフォリア用にコピー」を押し、ココフォリアの盤面で `Ctrl+V` / `⌘V`。

手元で使う場合は `index.html`・`app.js`・`converter.js`・`style.css` を同じフォルダに置き、`index.html` をダブルクリックで開く。

## 使い方（Streamlit版）

https://dnd5e-udonarium-to-ccfolia-bndd4irjirpaskop4jzyx2.streamlit.app/ を開けばそのまま使える。手元で動かす場合:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/streamlit run streamlit_app.py
```

コマの用意と読み込み方はブラウザ版と同じ。コピーは「ココフォリア用JSON」欄の右上のアイコンから。

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
| `index.html` / `style.css` / `app.js` | ブラウザ版のUI（画面・見た目・操作） |
| `converter.js` | ブラウザ版の変換ロジック（ブラウザ・Node 共用） |
| `streamlit_app.py` / `.streamlit/config.toml` | Streamlit版のUIと設定 |
| `udon_ccfolia.py` | Streamlit版の変換ロジック（`converter.js` と同じ出力になる） |
| `tests/` | テストと、生成ツールが実際に出力したサンプル（`fixtures/`） |
| `docs/manual.md` | 利用者向けマニュアル |

変換ルールや上限（`LIMITS` / `MAX_*`）を変えるときは `converter.js` と `udon_ccfolia.py` の両方を直す。
Python側のテストが両者の出力の一致を確かめる。

### テスト

```sh
npm ci
npm test                         # ブラウザ版の変換ロジック（node:test）
npx playwright install chromium  # 初回だけ
npm run test:e2e                 # ブラウザ版のE2E（Playwright, Chromium）
npx playwright install firefox webkit  # 初回だけ
npm run test:e2e:all             # Chromium / Firefox / WebKit（Safari のエンジン）すべて
npm run lint                     # ESLint
.venv/bin/ruff check .           # ruff（Python の Lint）

.venv/bin/pip install -r requirements.txt -r requirements-test.txt
.venv/bin/python -m pytest tests # Streamlit版の変換ロジック・両版の出力一致・Streamlit版のE2E
```

| テスト | 内容 |
|---|---|
| `tests/convert.test.mjs` | `converter.js` の単体テスト（安全対策を含む） |
| `tests/test_udon_ccfolia.py` | `udon_ccfolia.py` の単体テストと、`converter.js` との出力一致 |
| `tests/e2e/browser.spec.mjs` | ブラウザ版を実際のブラウザで操作する（読み込み・ドロップ・オプション・コピー・保存・ツールチップ・`file://`） |
| `tests/e2e/a11y.spec.mjs` | アクセシビリティの自動チェック（axe-core、WCAG 2.1 AA）。初期画面・変換結果・ツールチップ表示中を、ライト／ダークの両方で |
| `tests/test_streamlit_app.py` | Streamlit版を `streamlit.testing` の AppTest で操作する |

E2Eテストは不安定（flaky）にならないよう、次の決まりで書いている。

- **サーバーを起動しない**: ブラウザ版は `page.route` でファイルを直接返し、Streamlit版は AppTest でスクリプトをそのまま実行する。ポート競合や起動待ちが無い。
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
4つのジョブ（Lint / 単体テスト / ブラウザ版E2E / Streamlit版E2E）が並行して動き、npm・pip はキャッシュする（Playwright のブラウザは、キャッシュから戻すより毎回入れる方が速いのでキャッシュしない）。
同じブランチに続けて push すると、古い実行は取り消される。

**main はブランチ保護されている。** main へ直接 push することはできず、変更は PR で入れる。
上の4つのジョブがすべて成功しないとマージできない（管理者も同じ）。強制 push と削除も禁止している。

`.github/workflows/e2e-cross-browser.yml` は、ブラウザ版に関わるファイル（`index.html`・`app.js`・`style.css`・`converter.js`・E2Eテストなど）を変えた PR のときだけ、
Firefox と WebKit で E2E を回す（Actions タブから手動でも実行できる）。

### GitHub Pages

`.github/workflows/pages.yml` が `index.html`・`app.js`・`converter.js`・`style.css` だけを配信し、
これらを main に push するたびに自動で更新される（Actions タブの「Deploy to GitHub Pages」→ Run workflow で手動更新も可）。

フォークして自分で公開する場合は、**Settings → Pages → Build and deployment → Source** で「**GitHub Actions**」を選んでから上記ワークフローを実行する。

### セキュリティ

利用者が持ち込むファイルを信用しない前提で作っている。

- **ブラウザ版の CSP**: `index.html` の Content Security Policy で、インラインスクリプト・外部スクリプト・外部への通信（`connect-src 'none'`）を禁止している。
  UIのコードを `app.js` に分けているのはこのため。`index.html` に `<script>` や `style="…"` を直接書かないこと。
- **XSS 対策**: ブラウザ版はファイル由来の文字列を `textContent` でだけ表示する。Streamlit版は `md_escape()` で Markdown として解釈させない（リンクや外部画像を埋め込まれない）。
- **ZIP爆弾・巨大ファイル対策**: 入力ファイル・ZIP内のファイル数・展開後のXMLの大きさに上限があり、展開は上限に達した時点で打ち切る。XML以外のエントリは展開しない。
  Streamlit版は `.streamlit/config.toml` でアップロードの大きさも制限している。
- **XML**: DTD（`<!DOCTYPE>` / `<!ENTITY>`）を含むXMLは解析前に拒否する（実体展開による膨張・外部参照の対策）。
- **壊れたZIP**: 範囲外を指すヘッダなどは利用者向けのエラーにし、例外の詳細を画面に出さない。
- **コード検査**: GitHub の CodeQL（default setup）が JavaScript・Python・ワークフローを push と PR のたびに検査する。結果は Security タブに出る。
- **CI**: アクションはコミットSHAで固定し、`GITHUB_TOKEN` は読み取り専用、`npm ci --ignore-scripts`。Dependabot（`.github/dependabot.yml`）が週1回更新を提案する。
