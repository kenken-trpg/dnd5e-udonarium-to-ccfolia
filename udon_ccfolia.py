"""D&D5e ユドナリウムコマ → ココフォリア用JSON 変換ロジック（Python版）

converter.js と同じ変換を行う。Streamlit 版（streamlit_app.py）から使う。
想定入力: https://unib-5e-udonarium-pc.onrender.com/ で利用者が生成・保存した
          ユドナリウムのキャラクターXML、またはそれを含むZIP。
"""
from __future__ import annotations

import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

DEFAULT_COLOR = "#888888"


class ConvertError(Exception):
    """利用者に見せるエラー"""


# ---------------------------------------------------------------- ZIP / XML

def extract_xml_texts(data: bytes, file_name: str = "") -> list[tuple[str, str]]:
    """ZIP / XML のバイト列から、キャラクターXMLを [(ファイル名, XML文字列)] で取り出す"""
    if not data.startswith(b"PK\x03\x04"):
        return [(file_name, data.decode("utf-8-sig", errors="replace"))]
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise ConvertError("ZIPファイルとして読み込めませんでした。") from e
    out = []
    for info in zf.infolist():
        if info.is_dir() or not info.filename.lower().endswith(".xml"):
            continue
        # 生成ツールのZIPはUTF-8フラグ無しでUTF-8のファイル名を入れるので、CP437として解釈されたものを戻す
        name = info.filename
        if not info.flag_bits & 0x800:
            try:
                name = name.encode("cp437").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
        text = zf.read(info).decode("utf-8-sig", errors="replace")
        if re.search(r"<character[\s>]", text):
            out.append((name, text))
    if not out:
        raise ConvertError("ZIP内にユドナリウムのキャラクターXMLが見つかりませんでした。")
    return out


def _clean(s: str | None) -> str:
    """中身が全角スペース等の空白だけなら空文字にする"""
    t = re.sub(r"\r\n?", "\n", s or "")
    if re.fullmatch(r"[\s　]*", t):
        return ""
    return re.sub(r"[\s　]+$", "", re.sub(r"^\n+", "", t))


def _data_children(el: ET.Element) -> list[ET.Element]:
    return [c for c in el if c.tag == "data"]


def _find_child(el: ET.Element | None, name: str) -> ET.Element | None:
    if el is None:
        return None
    return next((c for c in _data_children(el) if c.get("name") == name), None)


def _text(el: ET.Element | None) -> str:
    return "".join(el.itertext()) if el is not None else ""


@dataclass
class Item:
    kind: str  # 'resource' | 'param' | 'note' | 'entry'
    label: str
    value: str = ""
    max: str = ""


@dataclass
class Section:
    name: str
    items: list[Item] = field(default_factory=list)


@dataclass
class Parsed:
    name: str
    size: float
    sections: list[Section]
    palette: str
    dicebot: str

    def items(self, kind: str) -> list[Item]:
        return [i for s in self.sections for i in s.items if i.kind == kind]

    def value(self, label: str) -> str:
        for s in self.sections:
            for i in s.items:
                if i.label == label and i.kind in ("param", "resource"):
                    return i.value
        return ""


def parse_udonarium_xml(xml_text: str) -> Parsed:
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except ET.ParseError as e:
        raise ConvertError("XMLの解析に失敗しました。") from e
    char_el = root if root.tag == "character" else root.find(".//character")
    if char_el is None:
        raise ConvertError("ユドナリウムのキャラクターデータ（<character>）ではありません。")
    top = _find_child(char_el, "character")
    if top is None:
        raise ConvertError('キャラクターデータ（data name="character"）が見つかりません。')

    common = _find_child(top, "common")
    name = _clean(_text(_find_child(common, "name"))) or "名称未設定"
    try:
        size = float(_text(_find_child(common, "size")) or 1) or 1
    except ValueError:
        size = 1

    def walk(el: ET.Element, section: Section) -> None:
        for c in _data_children(el):
            label = c.get("name", "")
            typ = c.get("type", "")
            if _data_children(c):
                walk(c, section)
                continue
            text = _text(c)
            if typ == "numberResource":
                mx = _clean(text)
                cur = _clean(c.get("currentValue"))
                if mx == "" and cur == "":
                    continue  # 使わない呪文スロット等
                section.items.append(Item("resource", label, cur if cur != "" else mx, mx))
            elif typ == "note":
                section.items.append(Item("note", label, _clean(text)))
            elif typ == "image":
                pass  # 画像はココフォリアに持ち込めない
            elif _clean(text) == "" and "type" not in c.attrib and len(c) == 0 and not c.text and section.name == "呪文":
                section.items.append(Item("entry", label))
            else:
                section.items.append(Item("param", label, _clean(text)))

    sections = []
    detail = _find_child(top, "detail")
    if detail is not None:
        for sec in _data_children(detail):
            section = Section(sec.get("name", ""))
            walk(sec, section)
            sections.append(section)

    palette_el = char_el.find("chat-palette")
    return Parsed(
        name=name,
        size=size,
        sections=sections,
        palette=re.sub(r"\r\n?", "\n", _text(palette_el)),
        dicebot=palette_el.get("dicebot", "") if palette_el is not None else "",
    )


# ---------------------------------------------------------------- ココフォリア

def build_memo(parsed: Parsed, include_notes: bool = False, external_url: str = "") -> str:
    v = parsed.value

    def join(*xs):
        return " / ".join(x for x in xs if x)

    lines = []
    if v("プレイヤー"):
        lines.append(f"PL: {v('プレイヤー')}")
    lines.append(join(v("レベル") and f"レベル{v('レベル')}", v("クラス"), v("種族"), v("属性")))
    lines.append(join(v("AC") and f"AC {v('AC')}", v("移動速度") and f"移動 {v('移動速度')}", v("サイズ")))
    lines.append(join(v("ヒット・ダイス") and f"HD {v('ヒット・ダイス')}",
                      v("呪文セーブ") and f"呪文セーヴDC {v('呪文セーブ')}",
                      v("呪文攻撃ロール") and v("呪文セーブ") and f"呪文攻撃 {v('呪文攻撃ロール')}"))
    if external_url:
        lines.append(external_url)
    if include_notes:
        for n in parsed.items("note"):
            if n.value:
                lines += ["", f"【{n.label}】", n.value]
    lines = [l for i, l in enumerate(lines) if l != "" or i > 0]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def expand_references(text: str, values: dict[str, str]) -> str:
    return re.sub(r"\{([^{}\n]+)\}", lambda m: values.get(m.group(1), m.group(0)), text)


def _parse_initiative(v: str) -> int:
    m = re.match(r"[+-]?\d+", re.sub(r"[^\d+-]", "", v or ""))
    return int(m.group(0)) if m else 0


def to_ccfolia(parsed: Parsed, include_notes: bool = False, expand_refs: bool = False,
               external_url: str = "", color: str = DEFAULT_COLOR) -> dict:
    """中間形式 → ココフォリアのクリップボード貼り付け用オブジェクト"""
    status = [{"label": r.label, "value": r.value, "max": r.max} for r in parsed.items("resource")]
    params = [{"label": p.label, "value": p.value} for p in parsed.items("param")]

    commands = parsed.palette.rstrip("\n")
    if expand_refs:
        values = {p["label"]: p["value"] for p in params}
        values.update({s["label"]: s["value"] for s in status})
        commands = expand_references(commands, values)

    return {
        "kind": "character",
        "data": {
            "name": parsed.name,
            "memo": build_memo(parsed, include_notes, external_url),
            "initiative": _parse_initiative(parsed.value("イニシアチブ")),
            "externalUrl": external_url or "",
            "status": status,
            "params": params,
            "iconUrl": None,
            "faces": [],
            "x": 0,
            "y": 0,
            "angle": 0,
            "width": 4,
            "height": 4,
            "active": True,
            "secret": False,
            "invisible": False,
            "hideStatus": False,
            "color": color or DEFAULT_COLOR,
            "commands": commands,
            "owner": None,
        },
    }


def to_json(ccfolia: dict, indent: int | None = None) -> str:
    if indent is None:
        return json.dumps(ccfolia, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(ccfolia, ensure_ascii=False, indent=indent)


def unresolved_references(ccfolia: dict) -> list[str]:
    """パレット中の {参照} のうち、ステータス・パラメータに存在しないもの"""
    d = ccfolia["data"]
    known = {x["label"] for x in d["status"] + d["params"]}
    missing: list[str] = []
    for m in re.finditer(r"\{([^{}\n]+)\}", d["commands"]):
        if m.group(1) not in known and m.group(1) not in missing:
            missing.append(m.group(1))
    return missing
