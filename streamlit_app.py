"""D&D5e ココフォリア変換（Streamlit版）

起動: streamlit run streamlit_app.py
"""
from __future__ import annotations

import re

import streamlit as st

import udon_ccfolia as U

st.set_page_config(page_title="D&D5e ココフォリア変換", page_icon="🎲", layout="centered")

st.title("D&D5e ココフォリア変換")
st.caption(
    "[D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/) で保存したコマ（ZIP）を、"
    "ココフォリアに貼り付けられるキャラクターデータへ変換します。"
)


def safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip() or "character"


# ---------------------------------------------------------------- 1. 用意

st.subheader("1. ユドナリウムのコマを用意する")
st.markdown(
    """
1. [D&D5E キャラクターデータベース](https://dndjp.sakura.ne.jp/LIST.php) で、キャラクターシートのURL（`https://dndjp.sakura.ne.jp/OUTPUT.php?ID=…`）をコピーする。
2. [D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/) にURLを貼り付けて生成し、ZIPを保存する。
"""
)

# ---------------------------------------------------------------- 2. 読み込み

st.subheader("2. 読み込む")
files = st.file_uploader("保存した ZIP（または中の XML）", type=["zip", "xml"], accept_multiple_files=True)

chars: list[U.Parsed] = []
for f in files or []:
    try:
        chars += [U.parse_udonarium_xml(x) for _, x in U.extract_xml_texts(f.getvalue(), f.name)]
    except U.ConvertError as e:
        st.error(f"{f.name}: {e}")

# ---------------------------------------------------------------- 3. 出力オプション

st.subheader("3. 出力オプション")
c1, c2, c3 = st.columns([2, 2, 1])
include_notes = c1.checkbox("背景・人格的特徴などをメモに入れる")
expand_refs = c2.checkbox("{参照} を数値に置き換える",
                          help="ココフォリアはパレット中の {筋力修正} などをパラメータの値に置き換えるので、通常は不要です。")
color = c3.color_picker("コマの色", U.DEFAULT_COLOR)

# ---------------------------------------------------------------- 結果

for i, parsed in enumerate(chars):
    out = U.to_ccfolia(parsed, include_notes=include_notes, expand_refs=expand_refs, color=color)
    d = out["data"]
    v = parsed.value

    with st.container(border=True):
        st.markdown(f"### {d['name']}")
        st.caption(" / ".join(x for x in [v("プレイヤー") and f"PL: {v('プレイヤー')}",
                                          v("レベル") and f"レベル{v('レベル')}", v("クラス"), v("種族")] if x))
        chips = [f"{s['label']} {s['value']}/{s['max']}" for s in d["status"]]
        if v("AC"):
            chips.append(f"AC {v('AC')}")
        chips.append(f"イニシアチブ {d['initiative']:+d}")
        chips.append(f"パラメータ {len(d['params'])}件")
        st.markdown(" ".join(f"`{c}`" for c in chips))

        missing = U.unresolved_references(out)
        if missing:
            st.warning("パレット中の参照がパラメータに見つかりません: " + " ".join(f"{{{m}}}" for m in missing))

        st.markdown("**ココフォリア用JSON**（右上のアイコンでコピー）")
        st.code(U.to_json(out), language="json", wrap_lines=True, height=160)

        st.download_button("JSONを保存", U.to_json(out, indent=2).encode("utf-8"),
                           file_name=f"{safe_name(d['name'])}_ccfolia.json", mime="application/json",
                           key=f"json_{i}")

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
st.caption("元データ: D&D総合コミュニティ「D&D5E キャラクターデータベース」／ コマ生成: うにバター氏「D&D5e ユドナリウムPCコマ生成ツール」")
