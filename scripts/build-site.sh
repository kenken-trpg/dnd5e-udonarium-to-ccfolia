#!/usr/bin/env bash
# GitHub Pages に配信するファイルを出力先（既定: _site/）に集め、
# ダブルクリックで使うためのZIP（dnd5e-ccfolia.zip）も一緒に置く。
# 使い方: scripts/build-site.sh [出力先]
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-_site}"
FILES=(index.html app.js converter.js style.css)
PKG=dnd5e-ccfolia

rm -rf "$OUT"
mkdir -p "$OUT/.pkg/$PKG"
cp "${FILES[@]}" "$OUT/"
cp "${FILES[@]}" "$OUT/.pkg/$PKG/"
cp docs/offline-readme.txt "$OUT/.pkg/$PKG/README.txt"
# -X: OS固有の属性を入れない
(cd "$OUT/.pkg" && zip -q -r -X "../$PKG.zip" "$PKG")
rm -rf "$OUT/.pkg"
echo "built: $OUT ($(ls "$OUT" | tr '\n' ' '))"
