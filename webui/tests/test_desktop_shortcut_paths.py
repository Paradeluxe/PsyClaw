from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_shortcut_mod():
    path = ROOT / "scripts" / "make_desktop_shortcut.py"
    spec = importlib.util.spec_from_file_location("psyclaw_mds_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_icon_ico_exists_at_webui_root() -> None:
    assert (ROOT / "icon.ico").is_file()


def test_icon_helpers_prefer_root_over_missing_assets() -> None:
    mod = _load_shortcut_mod()
    ico = mod.icon_ico(str(ROOT))
    png = mod.icon_png(str(ROOT))
    assert Path(ico).is_file()
    assert Path(ico).name == "icon.ico"
    assert Path(png).is_file()
    assert "assets" not in Path(ico).parts or (ROOT / "assets" / "icon.ico").is_file()


def test_shortcut_source_uses_root_icon_helper() -> None:
    src = (ROOT / "scripts" / "make_desktop_shortcut.py").read_text(encoding="utf-8")
    assert "def icon_ico" in src
    assert 'os.path.join(root, "assets", "icon.ico")' not in src or "icon_ico" in src
