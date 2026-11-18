"""Streamlit版のE2Eテスト。

streamlit.testing の AppTest で streamlit_app.py をそのまま実行する。
ブラウザもサーバーも起動しないので、待ち時間やポート競合による不安定さが無い。
"""
import json
from pathlib import Path

import pytest

st_testing = pytest.importorskip("streamlit.testing.v1")

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"
APP = str(ROOT / "streamlit_app.py")


@pytest.fixture
def at():
    app = st_testing.AppTest.from_file(APP, default_timeout=30)
    app.run()
    assert not app.exception
    return app


def upload(at, *names, raw=None):
    files = [(n, (FIX / n).read_bytes(), "application/octet-stream") for n in names]
    files += raw or []
    at.file_uploader[0].set_value(files).run()
    assert not at.exception
    return at


def ccfolia_json(at, index=0):
    codes = [c.value for c in at.code if c.language == "json"]
    return json.loads(codes[index])


def test_initial_page(at):
    assert at.title[0].value == "D&D5e ココフォリア変換"
    assert not at.error
    assert not [c for c in at.code if c.language == "json"]


def test_upload_zip_shows_result(at):
    upload(at, "sorcerer.zip")
    assert "### テスト・ソーサラー" in [m.value for m in at.markdown]
    out = ccfolia_json(at)
    assert out["kind"] == "character"
    assert out["data"]["name"] == "テスト・ソーサラー"
    assert {"label": "HP", "value": "37", "max": "37"} in out["data"]["status"]


def test_multiple_files(at):
    upload(at, "sorcerer.zip", "attacks.xml")
    names = [ccfolia_json(at, i)["data"]["name"] for i in range(2)]
    assert names == ["テスト・ソーサラー", "テスト・アーマラー"]


def test_options_change_output(at):
    upload(at, "multiclass.xml")
    assert "【背景】" not in ccfolia_json(at)["data"]["memo"]
    at.checkbox[0].check().run()
    assert "【背景】\n侍祭" in ccfolia_json(at)["data"]["memo"]

    upload(at, "attacks.xml")
    at.checkbox[1].check().run()
    assert "{" not in ccfolia_json(at)["data"]["commands"]

    at.color_picker[0].pick("#336699").run()
    assert ccfolia_json(at)["data"]["color"] == "#336699"


def test_invalid_file_shows_error(at):
    upload(at, raw=[("broken.xml", b"not xml", "text/xml")])
    assert len(at.error) == 1
    assert "broken" in at.error[0].value and "XML" in at.error[0].value
    assert not [c for c in at.code if c.language == "json"]


def test_markdown_in_character_name_is_not_interpreted(at):
    xml = (FIX / "attacks.xml").read_text(encoding="utf-8").replace(
        "テスト・アーマラー", "[x](https://example.com/) ![](https://example.com/p.png) :red[赤]", 1)
    upload(at, raw=[("evil.xml", xml.encode("utf-8"), "text/xml")])
    heading = next(m.value for m in at.markdown if m.value.startswith("### "))
    # [ ( ! : がエスケープされ、リンク・画像・色指定にならない
    assert r"\[x\]\(https\:" in heading
    assert r"\!\[\]" in heading
    assert r"\:red\[" in heading


def test_widgets_have_help(at):
    assert at.checkbox[0].help and at.checkbox[1].help
    assert at.color_picker[0].help
    assert at.file_uploader[0].help


def test_removed_file_disappears_and_results_stay_per_session(at):
    upload(at, "sorcerer.zip", "attacks.xml")
    assert len(at.session_state["_parsed"]) == 2
    upload(at, "attacks.xml")
    assert [ccfolia_json(at, 0)["data"]["name"]] == ["テスト・アーマラー"]
    assert len([c for c in at.code if c.language == "json"]) == 1
    assert len(at.session_state["_parsed"]) == 1
