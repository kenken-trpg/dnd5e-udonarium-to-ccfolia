"""D&D5e ココフォリア変換（Streamlit版）

起動: streamlit run streamlit_app.py
"""
from __future__ import annotations

import hashlib
import re

import streamlit as st

import udon_ccfolia as U

st.set_page_config(page_title="D&D5e ココフォリア変換", page_icon="🎲", layout="centered")

st.title("D&D5e ココフォリア変換")
st.caption(
    "[D&D5E キャラクターデータベース](https://dndjp.sakura.ne.jp/LIST.php) のシートを"
    "[D&D5e ユドナリウムPCコマ生成ツール](https://unib-5e-udonarium-pc.onrender.com/) でコマにし、"
    "ココフォリアに貼り付けられるキャラクターデータへ変換します。"
)

# 変換済みキャラクター: [{"parsed": U.Parsed, "sheet_url": str, "zip": bytes|None, "zip_name": str}]
st.session_state.setdefault("chars", [])
st.session_state.setdefault("upload_sig", None)


def safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip() or "character"


# ---------------------------------------------------------------- 1. 読み込み

st.subheader("1. 読み込む")
tab_url, tab_file = st.tabs(["シートURLから", "ユドナリウムのファイルから"])

with tab_url:
    with st.form("url_form", border=False):
        url_text = st.text_input(
            "キャラクターシートのURL",
            placeholder="https://dndjp.sakura.ne.jp/OUTPUT.php?ID=12345（IDだけでも可）",
        )
        c1, c2 = st.columns(2)
        simple_palette = c1.checkbox("シンプルなチャットパレット")
        d20roll = c2.checkbox("ダイスを 1d20+x 形式にする（AR/AT を使わない）")
        submitted = st.form_submit_button("取得して変換", type="primary")
    st.caption("ユドナリウムPCコマ生成ツールの変換サーバーを呼び出します。サーバーが休止中だと、最初の変換に1分ほどかかることがあります。")

    if submitted:
        sheet_url = U.normalize_sheet_url(url_text)
        if not sheet_url:
            st.error("URLの形式が正しくありません。https://dndjp.sakura.ne.jp/OUTPUT.php?ID=数字 の形で入力してください。")
        else:
            try:
                with st.spinner("変換サーバーでユドナリウムのコマを作っています…（休止中だと1分ほどかかります）"):
                    data, zip_name = U.fetch_udonarium_zip(sheet_url, simple_palette, d20roll)
                    xmls = U.extract_xml_texts(data)
                    chars = [{"parsed": U.parse_udonarium_xml(x), "sheet_url": sheet_url,
                              "zip": data, "zip_name": zip_name} for _, x in xmls]
                st.session_state.chars = chars
                st.success(f"変換しました（{len(chars)}体）。")
            except U.ConvertError as e:
                st.error(str(e))

with tab_file:
    files = st.file_uploader(
        "生成ツールでダウンロードした ZIP（または中の XML）",
        type=["zip", "xml"],
        accept_multiple_files=True,
    )
    sig = tuple((f.name, hashlib.sha1(f.getvalue()).hexdigest()) for f in files or [])
    if sig and sig != st.session_state.upload_sig:
        st.session_state.upload_sig = sig
        chars, errors = [], []
        for f in files:
            try:
                for _, x in U.extract_xml_texts(f.getvalue(), f.name):
                    chars.append({"parsed": U.parse_udonarium_xml(x), "sheet_url": "", "zip": None, "zip_name": ""})
            except U.ConvertError as e:
                errors.append(f"{f.name}: {e}")
        st.session_state.chars = chars
        for msg in errors:
            st.error(msg)
        if chars:
            st.success(f"変換しました（{len(chars)}体）。")

# ---------------------------------------------------------------- 2. 出力オプション

st.subheader("2. 出力オプション")
c1, c2, c3 = st.columns([2, 2, 1])
include_notes = c1.checkbox("背景・人格的特徴などをメモに入れる")
expand_refs = c2.checkbox("{参照} を数値に置き換える",
                          help="ココフォリアはパレット中の {筋力修正} などをパラメータの値に置き換えるので、通常は不要です。")
color = c3.color_picker("コマの色", U.DEFAULT_COLOR)

# ---------------------------------------------------------------- 結果

for i, ch in enumerate(st.session_state.chars):
    parsed: U.Parsed = ch["parsed"]
    out = U.to_ccfolia(parsed, include_notes=include_notes, expand_refs=expand_refs,
                       external_url=ch["sheet_url"], color=color)
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

        b1, b2 = st.columns(2)
        b1.download_button("JSONを保存", U.to_json(out, indent=2).encode("utf-8"),
                           file_name=f"{safe_name(d['name'])}_ccfolia.json", mime="application/json",
                           key=f"json_{i}", width="stretch")
        if ch["zip"]:
            b2.download_button("ユドナリウムZIPを保存", ch["zip"],
                               file_name=ch["zip_name"] or f"{safe_name(d['name'])}.zip", mime="application/zip",
                               key=f"zip_{i}", width="stretch")

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
