"""D&D5e ココフォリア変換（Streamlit版）

起動: streamlit run streamlit_app.py
"""
from __future__ import annotations

import re

import streamlit as st

import udon_ccfolia as U

BROWSER_URL = "https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/"
REPO_URL = "https://github.com/kenken-trpg/dnd5e-udonarium-to-ccfolia"
MANUAL_URL = f"{REPO_URL}/blob/main/docs/manual.md"
GENERATOR_URL = "https://unib-5e-udonarium-pc.onrender.com/"
DATABASE_URL = "https://dndjp.sakura.ne.jp/LIST.php"

HELP = {
    "upload": "生成ツールで保存したZIPか、その中のXMLを選びます。複数まとめて選べます。"
              f"1ファイル {U.MAX_INPUT_BYTES // 1024 // 1024}MB まで。",
    "notes": "背景・人格的特徴・尊ぶもの・関わり深いもの・弱味などを、【見出し】付きでメモの末尾に追加します。",
    "expand": "パレット中の {筋力修正} などを、変換した時点の数値に置き換えます。"
              "ココフォリアは {参照} をパラメータの値に置き換えて振るので通常は不要です。"
              "置き換えると、あとでパラメータを書き換えてもパレットは変わらなくなります。",
    "color": "ココフォリアのキャラクター設定の「色」に入ります。",
    "save": "変換結果をJSONファイルとして保存します。バックアップや、あとで貼り付けたいとき用です。",
}

st.set_page_config(page_title="D&D5e ココフォリア変換", page_icon="🎲", layout="centered")

st.title("D&D5e ココフォリア変換")
st.caption(
    f"[D&D5e ユドナリウムPCコマ生成ツール]({GENERATOR_URL}) で保存したコマ（ZIP）を、"
    "ココフォリアに貼り付けられるキャラクターデータへ変換します。"
)

# Markdown として解釈される文字（ASCII記号）。Streamlit 独自の :色[…] や $数式$ も含めて無効にする
_MD_SPECIAL = re.compile(r"([\\`*_{}\[\]()#+\-.!|<>~:$&\"'=^])")


def md_escape(s: str) -> str:
    """ファイル由来の文字列を Markdown として解釈させずに表示する（リンク・画像の埋め込み防止）"""
    return _MD_SPECIAL.sub(r"\\\1", str(s)).replace("\n", " ")


def safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip() or "character"


def load_all(files) -> tuple[list[U.Parsed], list[str]]:
    """アップロードされたファイルを解析する。

    オプションを変えるたびの再実行では解析をやり直さない。結果はこのセッションの中だけに持ち、
    ほかの利用者とは共有しない（st.cache_data はサーバー全体で共有されるので使わない）。
    取り除かれたファイルの結果は捨てる。
    """
    prev = st.session_state.get("_parsed", {})
    cur: dict[str, tuple[list[U.Parsed], str]] = {}
    for f in files or []:
        if f.file_id in prev:
            cur[f.file_id] = prev[f.file_id]
            continue
        try:
            cur[f.file_id] = ([U.parse_udonarium_xml(x) for _, x in U.extract_xml_texts(f.getvalue(), f.name)], "")
        except U.ConvertError as e:
            cur[f.file_id] = ([], f"{md_escape(f.name)}: {md_escape(e)}")
    st.session_state["_parsed"] = cur
    return [c for cs, _ in cur.values() for c in cs], [err for _, err in cur.values() if err]


# ---------------------------------------------------------------- 1. 用意

st.subheader("1. ユドナリウムのコマを用意する")
st.markdown(
    f"""
1. [D&D5E キャラクターデータベース]({DATABASE_URL}) で、キャラクターシートのURL（`https://dndjp.sakura.ne.jp/OUTPUT.php?ID=…`）をコピーする。
2. [D&D5e ユドナリウムPCコマ生成ツール]({GENERATOR_URL}) にURLを貼り付けて生成し、ZIPを保存する。
"""
)

# ---------------------------------------------------------------- 2. 読み込み

st.subheader("2. 読み込む")
files = st.file_uploader("保存した ZIP（または中の XML）", type=["zip", "xml"], accept_multiple_files=True,
                         help=HELP["upload"])

chars, errors = load_all(files)
for err in errors:
    st.error(err)

# ---------------------------------------------------------------- 3. 出力オプション

st.subheader("3. 出力オプション")
c1, c2, c3 = st.columns([2, 2, 1])
include_notes = c1.checkbox("背景・人格的特徴などをメモに入れる", help=HELP["notes"])
expand_refs = c2.checkbox("{参照} を数値に置き換える", help=HELP["expand"])
color = c3.color_picker("コマの色", U.DEFAULT_COLOR, help=HELP["color"])

# ---------------------------------------------------------------- 結果


def chip(text: str) -> str:
    # コード表記は中身を解釈しないが、` が含まれると閉じてしまうのでその時だけ通常のエスケープにする
    return f"`{text}`" if "`" not in text else md_escape(text)


for i, parsed in enumerate(chars):
    out = U.to_ccfolia(parsed, include_notes=include_notes, expand_refs=expand_refs, color=color)
    d = out["data"]
    v = parsed.value

    with st.container(border=True):
        st.markdown(f"### {md_escape(d['name'])}")
        st.caption(md_escape(" / ".join(x for x in [v("プレイヤー") and f"PL: {v('プレイヤー')}",
                                                    v("レベル") and f"レベル{v('レベル')}", v("クラス"), v("種族")] if x)))
        chips = [f"{s['label']} {s['value']}/{s['max']}" for s in d["status"]]
        if v("AC"):
            chips.append(f"AC {v('AC')}")
        chips.append(f"イニシアチブ {d['initiative']:+d}")
        chips.append(f"パラメータ {len(d['params'])}件")
        st.markdown(" ".join(chip(c) for c in chips),
                    help="HP・呪文スロットなどはステータス（現在値/最大値）に、能力値・技能などはパラメータになります。")

        missing = U.unresolved_references(out)
        if missing:
            st.warning("パレット中の参照がパラメータに見つかりません: " + " ".join(md_escape(f"{{{m}}}") for m in missing)
                       + "　— ココフォリアではこの部分が数値に置き換わりません。")

        st.markdown("**ココフォリア用JSON**（右上のアイコンでコピー）",
                    help="コピーしたら、ココフォリアのルームで盤面をクリックしてから Ctrl+V（Mac は ⌘+V）で貼り付けます。")
        st.code(U.to_json(out), language="json", wrap_lines=True, height=160)

        st.download_button("JSONを保存", U.to_json(out, indent=2).encode("utf-8"),
                           file_name=f"{safe_name(d['name'])}_ccfolia.json", mime="application/json",
                           key=f"json_{i}", help=HELP["save"])

        with st.expander("チャットパレット"):
            st.code(d["commands"], language=None)
        with st.expander("メモ"):
            st.code(d["memo"], language=None)

# ---------------------------------------------------------------- 使い方

st.subheader("ココフォリアへの貼り付け方")
st.markdown(
    """
1. 「ココフォリア用JSON」欄の右上にあるコピーアイコンを押す。
2. ココフォリアのルームを開き、盤面をクリックしてから `Ctrl+V`（Mac は `⌘+V`）。
3. ダイスボットを「ダンジョンズ＆ドラゴンズ第5版」にすると、AR / AT コマンドが使えます。

立ち絵は引き継がれません。貼り付け後にココフォリアで設定してください。
"""
)
st.caption(
    f"詳しい使い方とよくある質問: [マニュアル]({MANUAL_URL})　／　"
    f"同じ変換ができる [ブラウザ版]({BROWSER_URL}) もあります。"
    f"ソースコード: [GitHub]({REPO_URL})"
)
st.caption("元データ: D&D総合コミュニティ「D&D5E キャラクターデータベース」／ コマ生成: うにバター氏「D&D5e ユドナリウムPCコマ生成ツール」")
