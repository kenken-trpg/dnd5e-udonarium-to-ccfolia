"""Python版変換ロジックのテスト。Node があれば converter.js と出力が一致することも確かめる。"""
import io
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import udon_ccfolia as U  # noqa: E402

FIX = ROOT / "tests" / "fixtures"


def convert(name, **opts):
    [(_, xml)] = U.extract_xml_texts((FIX / name).read_bytes(), name)
    return U.to_ccfolia(U.parse_udonarium_xml(xml), **opts)


def by_label(lst, label):
    return next((x for x in lst if x["label"] == label), None)


def test_zip_and_basic_fields():
    [(name, _)] = U.extract_xml_texts((FIX / "sorcerer.zip").read_bytes())
    assert name == "テスト・ソーサラー.xml"
    d = convert("sorcerer.zip")["data"]
    assert d["name"] == "テスト・ソーサラー"
    assert d["initiative"] == 2
    assert by_label(d["status"], "HP") == {"label": "HP", "value": "37", "max": "37"}
    assert not any(s["label"].startswith("lv") for s in d["status"])
    assert by_label(d["params"], "〈威圧〉")["value"] == "+6"
    assert by_label(d["params"], "ファイアー・ボルト") is None
    assert d["memo"].startswith("PL: テストPL1\nレベル5 / ソーサラー / ティーフリング / 秩序にして善(LG)")


def test_spell_slots_and_notes():
    out = convert("multiclass.xml", include_notes=True)
    slots = [f"{s['label']}:{s['value']}/{s['max']}" for s in out["data"]["status"] if s["label"].startswith("lv")]
    assert slots == ["lv1:4/4", "lv2:3/3", "lv3:3/3", "lv4:1/1"]
    assert "【背景】\n侍祭" in out["data"]["memo"]
    assert U.unresolved_references(out) == []


def test_expand_refs():
    c = convert("attacks.xml", expand_refs=True)["data"]["commands"]
    assert "{" not in c
    assert "AR+3 【敏捷力】能力値判定" in c


def test_invalid_input():
    with pytest.raises(U.ConvertError):
        U.parse_udonarium_xml("<foo/>")
    with pytest.raises(U.ConvertError):
        U.parse_udonarium_xml("not xml")


def test_zip_bomb_is_cut_off():
    with pytest.raises(U.ConvertError, match="大きすぎます"):
        U.extract_xml_texts((FIX / "bomb.zip").read_bytes(), "bomb.zip")


def test_too_large_input():
    with pytest.raises(U.ConvertError, match="大きすぎます"):
        U.extract_xml_texts(b" " * (U.MAX_INPUT_BYTES + 1), "big.xml")


def test_broken_zip_is_convert_error():
    data = (FIX / "sorcerer.zip").read_bytes()
    with pytest.raises(U.ConvertError):
        U.extract_xml_texts(data[:-30])
    # 圧縮データを壊す（CRC / zlib エラー）→ 生の例外ではなく ConvertError
    start = 30 + len("テスト・ソーサラー.xml".encode())
    broken = data[:start] + bytes(b ^ 0xFF for b in data[start:start + 200]) + data[start + 200:]
    with pytest.raises(U.ConvertError):
        U.extract_xml_texts(broken)


def test_too_many_entries():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for i in range(U.MAX_ZIP_ENTRIES + 1):
            z.writestr(f"{i}.txt", "")
    with pytest.raises(U.ConvertError, match="多すぎます"):
        U.extract_xml_texts(buf.getvalue())


def test_dtd_is_rejected():
    xml = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><character><data name="character"/></character>'
    with pytest.raises(U.ConvertError, match="DTD"):
        U.parse_udonarium_xml(xml)


# ---------------------------------------------------------------- converter.js と同じ出力か

CASES = [
    ("sorcerer.zip", {}),
    ("multiclass.xml", {"includeNotes": True, "externalUrl": "https://example.com/sheet"}),
    ("attacks.xml", {"expandRefs": True, "color": "#336699"}),
    ("d20roll.xml", {}),
]

# 全ケースを1回の node 起動でまとめて変換する（ケースごとに起動すると遅い）
JS_SCRIPT = """
  const C = require(process.argv[1]);
  const { DOMParser } = require('@xmldom/xmldom');
  const fs = require('fs');
  (async () => {
    const out = [];
    for (const [file, opts] of JSON.parse(process.argv[2])) {
      const [{ xml }] = await C.extractXmlTexts(fs.readFileSync(file));
      out.push(C.toCcfolia(C.parseUdonariumXml(xml, DOMParser), opts));
    }
    process.stdout.write(JSON.stringify(out));
  })().catch(e => { console.error(e); process.exit(1); });
"""


@pytest.fixture(scope="module")
def js_outputs():
    if shutil.which("node") is None:
        pytest.skip("node が無い")
    cases = [[str(FIX / name), opts] for name, opts in CASES]
    res = subprocess.run(
        ["node", "-e", JS_SCRIPT, str(ROOT / "converter.js"), json.dumps(cases)],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return json.loads(res.stdout)


@pytest.mark.parametrize("index", range(len(CASES)), ids=[c[0] for c in CASES])
def test_same_output_as_js(js_outputs, index):
    name, js_opts = CASES[index]
    py_opts = {
        "include_notes": js_opts.get("includeNotes", False),
        "expand_refs": js_opts.get("expandRefs", False),
        "external_url": js_opts.get("externalUrl", ""),
        "color": js_opts.get("color", U.DEFAULT_COLOR),
    }
    assert convert(name, **py_opts) == js_outputs[index]
