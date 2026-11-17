# D&D5e ココフォリア変換

[D&D5E キャラクターデータベース](https://dndjp.sakura.ne.jp/LIST.php) のシートを
[D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/) で作ったユドナリウムのコマを、
ココフォリアに貼り付けられるキャラクターJSONに変換するツール。同じ変換をする2つの版がある。

- **ブラウザ版**（`index.html`）: ビルドもサーバーも不要。ダブルクリックで開くだけ。
- **Streamlit版**（`streamlit_app.py`）: Python で動かす版。

## 使い方（ブラウザ版）

1. `index.html` をブラウザで開く（ダブルクリックでよい）。
2. どちらかで読み込む。
   - **シートURLから**: `https://dndjp.sakura.ne.jp/OUTPUT.php?ID=12345`（IDだけでも可）を入れて「取得して変換」。
     生成ツールの変換サーバー（`fivee-udonarium-pc-backend.onrender.com`）を直接呼ぶ。休止中だと初回は1分ほどかかる。
   - **ユドナリウムのファイルから**: 生成ツールでダウンロードしたZIP、または中のXMLをドロップする。
3. 「ココフォリア用にコピー」を押し、ココフォリアの盤面で `Ctrl+V` / `⌘V`。

## GitHub Pages で公開する

`.github/workflows/pages.yml` が `index.html` と `converter.js` だけを配信する。有効化の手順:

1. リポジトリの **Settings → Pages → Build and deployment → Source** で「**GitHub Actions**」を選ぶ。
2. **Actions** タブ → 「Deploy to GitHub Pages」 → **Run workflow**。
3. `https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/` で公開される。

以降は `index.html` か `converter.js` を main に push するたびに自動で更新される（有効化前の push ではジョブはスキップされる）。

## 使い方（Streamlit版）

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/streamlit run streamlit_app.py
```

読み込み方はブラウザ版と同じ。変換サーバーへはPython側から接続する。
コピーは「ココフォリア用JSON」欄の右上のアイコンから。

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

## 構成

- `index.html` — ブラウザ版のUI
- `converter.js` — ブラウザ版の変換ロジック（ブラウザ・Node 共用）
- `streamlit_app.py` — Streamlit版のUI
- `udon_ccfolia.py` — Streamlit版の変換ロジック（`converter.js` と同じ出力になる）
- `tests/` — 両版のテストと、生成ツールが実際に出力したサンプル

変換ルールを変えるときは `converter.js` と `udon_ccfolia.py` の両方を直す。
Python側のテストが両者の出力の一致を確認する。

## テスト

```sh
npm install && npm test                        # ブラウザ版
.venv/bin/pip install pytest && .venv/bin/python -m pytest tests   # Streamlit版＋両版の出力一致
```
