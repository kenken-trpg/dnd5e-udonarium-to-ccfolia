#!/usr/bin/env python3
"""このリポジトリのマニュアルで使うMarkdownを静的HTMLにする（外部依存なし）。

使い方: python3 scripts/build-manual.py 出力先.html
対応する記法は docs/manual.md で使っている見出し・段落・リスト・表・リンク・画像・コード・太字だけ。
画像は1行に1つだけ書き、リストの外（前後に空行）に置く。番号付きリストを画像の後に「2.」から続けると、番号を引き継ぐ。
h2 見出しから目次を作り、h1 の直後に置く。
"""
import html
import re
import sys
from pathlib import Path


def inline(text):
    pattern = re.compile(r"`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*")
    parts = []
    end = 0
    for match in pattern.finditer(text):
        parts.append(html.escape(text[end:match.start()]))
        code, label, url, bold = match.groups()
        if code is not None:
            parts.append(f"<code>{html.escape(code)}</code>")
        elif label is not None:
            if not url.startswith(("https://", "#")):
                raise ValueError(f"Unsupported manual link: {url}")
            parts.append(f'<a href="{html.escape(url, quote=True)}">{inline(label)}</a>')
        else:
            parts.append(f"<strong>{inline(bold)}</strong>")
        end = match.end()
    parts.append(html.escape(text[end:]))
    return "".join(parts)


def slugify(text):
    return re.sub(r"[^\w\s-]", "", text.lower()).replace(" ", "-")


def render(source):
    lines = source.splitlines()
    output = []
    toc = []
    i = 0
    list_item = re.compile(r"^(\s*)([-*]|\d+\.)\s+(.+)$")

    def render_list(index, indent):
        first = list_item.match(lines[index])
        kind = "ul" if first[2] in ("-", "*") else "ol"
        # 画像を挟んで手順を続けるとき（「2.」から始まる番号付きリスト）は、番号を引き継ぐ
        start = int(first[2][:-1]) if kind == "ol" else 1
        result = [f'<ol start="{start}">' if start != 1 else f"<{kind}>"]
        while index < len(lines):
            match = list_item.match(lines[index])
            if not match or len(match[1]) != indent:
                break
            current_kind = "ul" if match[2] in ("-", "*") else "ol"
            if current_kind != kind:
                break
            result.append(f"<li>{inline(match[3])}")
            index += 1
            while index < len(lines) and lines[index].strip():
                child = list_item.match(lines[index])
                if child and len(child[1]) <= indent:
                    break
                if child:
                    nested, index = render_list(index, len(child[1]))
                    result.extend(nested)
                elif len(lines[index]) - len(lines[index].lstrip()) > indent:
                    result.append(" " + inline(lines[index].strip()))
                    index += 1
                else:
                    break
            result.append("</li>")
        result.append(f"</{kind}>")
        return result, index

    while i < len(lines):
        line = lines[i].strip()
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if not line:
            i += 1
        elif heading:
            level, text = len(heading[1]), heading[2]
            slug = slugify(text)
            output.append(f'<h{level} id="{slug}">{inline(text)}</h{level}>')
            if level == 1:
                output.append(TOC_MARKER)
            elif level == 2:
                toc.append(f'<li><a href="#{slug}">{inline(text)}</a></li>')
            i += 1
        elif re.fullmatch(r"!\[([^\]]*)\]\((images/[a-z0-9-]+\.png)\)", line):
            image = re.fullmatch(r"!\[([^\]]*)\]\((images/[a-z0-9-]+\.png)\)", line)
            output.append(f'<p><img src="{image[2]}" alt="{html.escape(image[1], quote=True)}" loading="lazy"></p>')
            i += 1
        elif line == "---":
            output.append("<hr>")
            i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = lines[i].strip().strip("|").split("|")
                if not all(re.fullmatch(r"\s*:?-+:?\s*", cell) for cell in cells):
                    rows.append(cells)
                i += 1
            output.append("<div class=table-scroll><table><thead>")
            for row_index, cells in enumerate(rows):
                tag = "th" if row_index == 0 else "td"
                if row_index == 1:
                    output.append("</thead><tbody>")
                output.append("<tr>" + "".join(f"<{tag}>{inline(cell.strip())}</{tag}>" for cell in cells) + "</tr>")
            output.append("</tbody></table></div>")
        elif list_item.match(lines[i]):
            block, i = render_list(i, len(list_item.match(lines[i])[1]))
            output.extend(block)
        else:
            paragraph = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(?:#|\||---)", lines[i]) and not list_item.match(lines[i]):
                paragraph.append(lines[i].strip())
                i += 1
            output.append("<p>" + inline(" ".join(paragraph)) + "</p>")
    nav = '<nav class="toc" aria-label="目次"><h2 id="目次">目次</h2><ul>' + "".join(toc) + "</ul></nav>"
    return "\n".join(output).replace(TOC_MARKER, nav if toc else "", 1)


TOC_MARKER = "<!--toc-->"


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    body = render((root / "docs/manual.md").read_text())
    page = '''<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'">
<meta name="referrer" content="no-referrer">
<title>D&amp;D5e ココフォリア変換 マニュアル</title>
<link rel="stylesheet" href="style.css"></head>
<body><main class="manual"><nav><a href="index.html">変換ツールに戻る</a></nav>
''' + body + '\n<nav><a href="index.html">変換ツールに戻る</a></nav></main></body></html>\n'
    Path(sys.argv[1]).write_text(page)
