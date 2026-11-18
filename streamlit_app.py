"""Streamlit版は終了した。公開済みのURLを開いた人をブラウザ版へ案内するだけのページ。

変換の機能は持たない（変換はブラウザ版 index.html + converter.js に一本化した）。
Streamlit Community Cloud からアプリを削除したら、このファイルと requirements.txt・.streamlit/ も消してよい。
"""

import streamlit as st

BROWSER_URL = "https://kenken-trpg.github.io/dnd5e-udonarium-to-ccfolia/"
MANUAL_URL = "https://github.com/kenken-trpg/dnd5e-udonarium-to-ccfolia/blob/main/docs/manual.md"

st.set_page_config(page_title="D&D5e ココフォリア変換（移転しました）", page_icon="🎲", layout="centered")

st.title("D&D5e ココフォリア変換")
st.info("このページ（Streamlit版）は終了しました。同じ変換は、ブラウザ版でできます。")
st.link_button("ブラウザ版を開く", BROWSER_URL, type="primary")
st.markdown(
    "ブラウザ版は変換をブラウザの中だけで行い、ファイルをどこにも送信しません。"
    "ダウンロードして手元で使える版もあります。\n\n"
    f"使い方とよくある質問: [マニュアル]({MANUAL_URL})"
)
