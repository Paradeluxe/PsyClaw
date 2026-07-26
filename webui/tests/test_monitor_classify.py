# -*- coding: utf-8 -*-
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from system_probe import classify_monitor, classify_monitors

def test_real_edid_hdmi():
    m = classify_monitor({
        "name": "L24e-30", "manufacturer": "LEN", "serial": "URB5KD1A",
        "connection": "hdmi", "width": 1920, "height": 1080,
        "width_cm": 53, "height_cm": 30, "primary": True,
        "source": "edid", "virtual": False, "generic": False,
    })
    assert m["trust"] == "real"
    assert m["virtual"] is False
    assert m["source"] == "edid"

def test_generic_pnp_geometry():
    m = classify_monitor({
        "name": "Generic PnP Monitor", "width": 1920, "height": 1080,
        "connection": "other", "source": "edid",
    })
    assert m["trust"] == "geometry"
    assert m["generic"] is True

def test_virtual_rdp():
    m = classify_monitor({
        "name": "RDP Reflector Display", "width": 1280, "height": 720,
        "instance": "DISPLAY\\RDP\\1",
    })
    assert m["trust"] == "virtual"
    assert m["virtual"] is True

def test_virtual_conn_code():
    m = classify_monitor({
        "name": "Some Panel", "connection": "virtual", "width": 800, "height": 600,
    })
    assert m["trust"] == "virtual"

def test_miracast_warn_as_virtual():
    m = classify_monitor({
        "name": "Living Room TV", "connection": "miracast", "width": 1920, "height": 1080,
    })
    assert m["trust"] == "virtual"

def test_geometry_only():
    m = classify_monitor({
        "name": "", "width": 1920, "height": 1080, "device": "\\\\.\\DISPLAY1",
    })
    assert m["trust"] == "geometry"

def test_pny_brand_not_generic():
    """PNY is a real brand — must not be treated as Generic via old PNY regex."""
    m = classify_monitor({
        "name": "PNY 27inch", "connection": "displayport", "width": 2560, "height": 1440,
        "serial": "ABC",
    })
    assert m["trust"] == "real"

def test_mix_real_and_virtual_order():
    out = classify_monitors([
        {"name": "VBox", "instance": "VBOX", "width": 800, "height": 600},
        {"name": "L24e-30", "connection": "hdmi", "width": 1920, "height": 1080, "primary": True},
    ])
    assert out[0]["trust"] == "real"
    assert out[-1]["trust"] == "virtual"

def test_internal_laptop_panel():
    m = classify_monitor({
        "name": "Built-in Display", "connection": "internal",
        "width": 2880, "height": 1800, "manufacturer": "APP",
    })
    assert m["trust"] == "real"
