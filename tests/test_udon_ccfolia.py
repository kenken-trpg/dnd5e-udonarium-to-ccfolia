"""Python版変換ロジックのテスト。Node があれば converter.js と出力が一致することも確かめる。"""
import json
import shutil
import subprocess
import sys
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


def test_normalize_sheet_url():
    assert U.normalize_sheet_url("https://dndjp.sakura.ne.jp/OUTPUT.php?ID=63823") == U.SHEET_URL_PREFIX + "63823"
    assert U.normalize_sheet_url(" 63823 ") == U.SHEET_URL_PREFIX + "63823"
    assert U.normalize_sheet_url("http://dndjp.sakura.ne.jp/OUTPUT.php?ID=1&x=2") == U.SHEET_URL_PREFIX + "1"
    assert U.normalize_sheet_url("https://example.com/?ID=1") is None


def test_backend_url():
    from urllib.parse import parse_qs, urlparse
    q = parse_qs(urlparse(U.build_backend_url(U.SHEET_URL_PREFIX + "5", d20roll=True)).query)
    assert q == {"url": [U.SHEET_URL_PREFIX + "5"], "simple_palette": ["false"], "rollcommand": ["default"]}


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


CASES = [
    ("sorcerer.zip", {}),
    ("multiclass.xml", {"includeNotes": True, "externalUrl": U.SHEET_URL_PREFIX + "63819"}),
    ("attacks.xml", {"expandRefs": True, "color": "#336699"}),
    ("d20roll.xml", {}),
]


@pytest.mark.skipif(shutil.which("node") is None, reason="node が無い")
@pytest.mark.parametrize("name,js_opts", CASES)
def test_same_output_as_js(name, js_opts):
    script = """
      const C = require(process.argv[1]);
      const { DOMParser } = require('@xmldom/xmldom');
      const fs = require('fs');
      (async () => {
        const [{ xml }] = await C.extractXmlTexts(fs.readFileSync(process.argv[2]));
        const out = C.toCcfolia(C.parseUdonariumXml(xml, DOMParser), JSON.parse(process.argv[3]));
        process.stdout.write(JSON.stringify(out));
      })();
    """
    res = subprocess.run(
        ["node", "-e", script, str(ROOT / "converter.js"), str(FIX / name), json.dumps(js_opts)],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    py_opts = {
        "include_notes": js_opts.get("includeNotes", False),
        "expand_refs": js_opts.get("expandRefs", False),
        "external_url": js_opts.get("externalUrl", ""),
        "color": js_opts.get("color", U.DEFAULT_COLOR),
    }
    assert convert(name, **py_opts) == json.loads(res.stdout)
