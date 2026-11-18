# D&D5e ココフォリア変換

[D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/)（うにバター氏作）で保存したZIPを、ココフォリアに貼り付けられるキャラクターデータに変換します。
**変換はブラウザ内で完結し、ファイルを外部に送信しません。**

**[変換ツールを開く](https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/)** · [スクリーンショット付きマニュアル](docs/manual.md) · [動画マニュアル（YouTube・約1分30秒）](https://www.youtube.com/watch?v=qQDg6C3P3Zo)

<a href="https://www.youtube.com/watch?v=qQDg6C3P3Zo"><img src="https://i.ytimg.com/vi/qQDg6C3P3Zo/maxresdefault.jpg" width="480" alt="動画マニュアル: キャラクターシートからココフォリアのコマを作る方法（YouTube）"></a>

## 使い方

1. [D&D5E キャラクターデータベース](https://dndjp.sakura.ne.jp/LIST.php)のシートURLを[コマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/)に貼り付け、ZIPを保存します。
2. 変換ツールにZIP（または中のXML）をドロップします。複数ファイルもまとめて読み込めます。
3. 「ココフォリア用にコピー」を押し、ココフォリアの盤面をクリックして `Ctrl+V`（Macは `⌘+V`）で貼り付けます。

HP・呪文スロット、能力値・技能、チャットパレットなどを引き継ぎます。**立ち絵は貼り付け後に設定してください。**
オプションや変換内容、困ったときの対処は[マニュアル](docs/manual.md)をご覧ください。

## オフラインで使う

公開ページ下部の「ZIPをダウンロード」から保存し、展開したフォルダの `index.html` を開いてください。マニュアルもネット接続なしで読めます。

## 開発

構成・テスト・ビルド・公開手順は[開発・運用ガイド](CONTRIBUTING.md)、性能計測は[性能資料](docs/performance.md)をご覧ください。
