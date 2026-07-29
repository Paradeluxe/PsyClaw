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


def test_windows_start_menu_dir_uses_appdata(monkeypatch, tmp_path: Path) -> None:
    mod = _load_shortcut_mod()
    appdata = tmp_path / "Roaming"
    monkeypatch.setenv("APPDATA", str(appdata))
    expected = appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs"
    assert Path(mod.windows_start_menu_dir()) == expected


def test_windows_shortcut_paths_include_start_menu_entry(monkeypatch, tmp_path: Path) -> None:
    mod = _load_shortcut_mod()
    appdata = tmp_path / "Roaming"
    monkeypatch.setenv("APPDATA", str(appdata))
    _, start_menu_lnk = mod.windows_shortcut_paths(str(ROOT))
    assert Path(start_menu_lnk) == appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "PsyClaw.lnk"
