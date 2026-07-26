"""Host / PsychoPy environment probe for the System (preflight) tab.

Only checks that matter for:
  (1) experiment can run and write data
  (2) PsychoPy engine is healthy

Each check:
  {id, label, group, status: pass|warn|fail|info, detail, value?}
"""
from __future__ import annotations

import os
import re
import platform
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple


def _psychopy_python() -> str:
    try:
        from psychopy_env import psychopy_python
    except ImportError:
        from backend.psychopy_env import psychopy_python  # type: ignore
    return psychopy_python()


def _os_label() -> str:
    """Human OS name. Win11 still reports platform.release()=='10' — use build ≥22000."""
    system = platform.system()
    if system == "Windows":
        build = 0
        display = ""
        product = ""
        try:
            import winreg  # Windows-only

            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            )
            try:
                try:
                    build = int(winreg.QueryValueEx(key, "CurrentBuild")[0])
                except (OSError, ValueError, TypeError):
                    build = 0
                try:
                    display = str(winreg.QueryValueEx(key, "DisplayVersion")[0] or "").strip()
                except OSError:
                    display = ""
                try:
                    product = str(winreg.QueryValueEx(key, "ProductName")[0] or "").strip()
                except OSError:
                    product = ""
            finally:
                winreg.CloseKey(key)
        except OSError:
            pass
        if not build:
            # fallback parse 10.0.26200
            try:
                parts = platform.version().split(".")
                if len(parts) >= 3:
                    build = int(parts[2])
            except ValueError:
                build = 0
        # build ≥ 22000 ⇒ Windows 11 (even when ProductName still says Windows 10)
        if build >= 22000 or "windows 11" in product.lower():
            name = "Windows 11"
        elif product:
            name = "Windows 10" if "windows 10" in product.lower() else product
        else:
            name = "Windows 10" if platform.release() == "10" else f"Windows {platform.release()}"
        if display:
            return f"{name} {display}"
        if build:
            return f"{name} (build {build})"
        return name
    if system == "Darwin":
        return f"macOS {platform.mac_ver()[0] or ''}".strip()
    if system == "Linux":
        return f"Linux {platform.release()}".strip()
    return platform.platform()


# Win32_SystemEnclosure ChassisTypes (SMBIOS)
_CHASSIS_LAPTOP = {8, 9, 10, 11, 12, 14, 30, 31, 32}  # portable / laptop / notebook / tablet / convertible
_CHASSIS_DESKTOP = {3, 4, 5, 6, 7, 13, 15, 16, 34, 35}  # desktop / tower / AIO-ish


def _detect_form_factor() -> Dict[str, Any]:
    """Best-effort form factor for System tab illustration: laptop | desktop | mac | macbook."""
    system = platform.system()
    info: Dict[str, Any] = {
        "kind": "desktop",
        "label": "Desktop PC",
        "os": system,
        "detail": platform.platform(),
        "chassis_types": [],
        "has_battery": None,
        "model": None,
    }

    if system == "Darwin":
        model = ""
        try:
            proc = subprocess.run(
                ["system_profiler", "SPHardwareDataType"],
                capture_output=True,
                text=True,
                timeout=8,
            )
            for line in (proc.stdout or "").splitlines():
                if "Model Name" in line or "Model Identifier" in line:
                    model = line.split(":", 1)[-1].strip()
                    if "Model Name" in line:
                        break
        except (OSError, subprocess.TimeoutExpired):
            model = platform.machine()
        info["model"] = model or "Mac"
        low = (model or "").lower()
        if "macbook" in low or "book" in low:
            info["kind"] = "macbook"
            info["label"] = "MacBook"
        else:
            info["kind"] = "mac"
            info["label"] = model if model and "Mac" in model else "Mac"
        info["detail"] = model or platform.platform()
        return info

    if system == "Linux":
        chassis = ""
        try:
            p = "/sys/class/dmi/id/chassis_type"
            if os.path.isfile(p):
                chassis = open(p, encoding="utf-8", errors="replace").read().strip()
        except OSError:
            pass
        try:
            ct = int(chassis) if chassis else 0
        except ValueError:
            ct = 0
        if ct:
            info["chassis_types"] = [ct]
        # battery
        bat = os.path.isdir("/sys/class/power_supply")
        has_bat = False
        if bat:
            try:
                for name in os.listdir("/sys/class/power_supply"):
                    if name.upper().startswith("BAT"):
                        has_bat = True
                        break
            except OSError:
                pass
        info["has_battery"] = has_bat
        if ct in _CHASSIS_LAPTOP or has_bat:
            info["kind"] = "laptop"
            info["label"] = "Laptop"
        else:
            info["kind"] = "desktop"
            info["label"] = "Desktop PC"
        info["detail"] = f"chassis={ct or '?'} battery={has_bat}"
        return info

    # Windows — winreg + ctypes only (no PowerShell cold start)
    if system == "Windows":
        chassis_types: List[int] = []
        model = ""
        try:
            import winreg

            # SMBIOS chassis type (REG_BINARY, first byte)
            try:
                k = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"SYSTEM\CurrentControlSet\Services\mssmbios\Data",
                )
                try:
                    raw, _ = winreg.QueryValueEx(k, "SMBiosData")
                    # best-effort: chassis type often at a fixed offset is unreliable;
                    # fall through to ChassisTypes via BIOS key if present.
                finally:
                    winreg.CloseKey(k)
            except OSError:
                pass
            try:
                k = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"HARDWARE\DESCRIPTION\System\BIOS",
                )
                try:
                    model = str(winreg.QueryValueEx(k, "SystemProductName")[0] or "").strip()
                except OSError:
                    model = ""
                finally:
                    winreg.CloseKey(k)
            except OSError:
                model = ""
            # Enclosure chassis via Enum\ROOT\CIMV2 is slow; skip PS.
            # Optional: ChassisTypes stored by some OEMs — ignore if absent.
        except OSError:
            pass
        info["model"] = model or None

        has_bat = None
        try:
            import ctypes
            from ctypes import wintypes

            class SYSTEM_POWER_STATUS(ctypes.Structure):
                _fields_ = [
                    ("ACLineStatus", wintypes.BYTE),
                    ("BatteryFlag", wintypes.BYTE),
                    ("BatteryLifePercent", wintypes.BYTE),
                    ("SystemStatusFlag", wintypes.BYTE),
                    ("BatteryLifeTime", wintypes.DWORD),
                    ("BatteryFullLifeTime", wintypes.DWORD),
                ]

            sps = SYSTEM_POWER_STATUS()
            if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(sps)):
                # BatteryFlag 128 = no system battery
                has_bat = sps.BatteryFlag != 128
        except Exception:  # noqa: BLE001
            has_bat = None
        info["has_battery"] = has_bat
        info["chassis_types"] = chassis_types

        # Heuristic without chassis WMI: battery or model keywords → laptop
        low_model = (model or "").lower()
        is_laptop = bool(has_bat) or any(
            tok in low_model
            for tok in ("laptop", "notebook", "book", "yoga", "thinkpad", "latitude", "inspiron", "pavilion")
        )
        if is_laptop:
            info["kind"] = "laptop"
            info["label"] = "Laptop"
        else:
            info["kind"] = "desktop"
            info["label"] = "Desktop PC"
        bits = []
        if model:
            bits.append(model)
        if has_bat is not None:
            bits.append("battery=" + ("yes" if has_bat else "no"))
        info["detail"] = " · ".join(bits) if bits else platform.platform()
        return info

    info["kind"] = "desktop"
    info["label"] = "Workstation"
    return info


def _classify_pnp_connection(instance_id: str, name: str = "") -> str:
    """Heuristic: bluetooth | usb | ps2 | built-in | wireless | other."""
    s = f"{instance_id or ''} {name or ''}".upper()
    if any(tok in s for tok in ("BTHENUM", "BTHLE", "BLUETOOTH", "BTH\\")):
        return "bluetooth"
    if "USB" in s or "HID\\VID" in s or "VID_" in s:
        return "usb"
    if "PS2" in s or "I8042" in s:
        return "ps2"
    if any(tok in s for tok in ("ACPI", "PNP0", "SYNA", "ELAN", "I2C\\", "MSFT0001")):
        return "built-in"
    if any(tok in s for tok in ("RMI", "TOUCHPAD", "TRACKPAD")):
        return "built-in"
    if "HID" in s:
        return "usb"
    return "other"


def _detect_hardware() -> Dict[str, Any]:
    """CPU / GPU / RAM / keyboard+mouse / monitors / speakers (best-effort)."""
    system = platform.system()
    out: Dict[str, Any] = {
        "cpu": None,
        "gpus": [],
        "ram_gb": None,
        "keyboards": [],
        "mice": [],
        "monitors": [],
        "speakers": [],
        "microphones": [],
        "os": system,
    }

    if system == "Windows":
        # One PowerShell round-trip → JSON (includes AllScreens + sound devices)
        ps = r"""
$ErrorActionPreference = 'SilentlyContinue'
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name } | Where-Object { $_ })
$ramBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$ramGb = if ($ramBytes) { [math]::Round($ramBytes / 1GB, 1) } else { $null }
function Map-Cim($cls, $nameProp) {
  @(Get-CimInstance $cls -ErrorAction SilentlyContinue | ForEach-Object {
    $nm = $_.$nameProp
    if (-not $nm) { return }
    $id = [string]($_.DeviceID)
    if (-not $id) { $id = [string]($_.PNPDeviceID) }
    $u = ("$id $nm").ToUpper()
    $conn = 'other'
    if ($u -match 'BTHENUM|BTHLE|BLUETOOTH|BTH\\') { $conn = 'bluetooth' }
    elseif ($u -match 'USB|HID\\VID|VID_') { $conn = 'usb' }
    elseif ($u -match 'PS2|I8042') { $conn = 'ps2' }
    elseif ($u -match 'ACPI|PNP0|SYNA|ELAN|I2C\\|MSFT0001|RMI|TOUCHPAD|TRACKPAD') { $conn = 'built-in' }
    elseif ($u -match 'HID') { $conn = 'usb' }
    [pscustomobject]@{ name = $nm; connection = $conn; instance_id = $id }
  })
}
$kbs = Map-Cim 'Win32_Keyboard' 'Name'
$mice = Map-Cim 'Win32_PointingDevice' 'Name'
$mons = @()
try {
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  function Decode-WmiName([object]$arr) {
    if (-not $arr) { return '' }
    $chars = @()
    foreach ($v in @($arr)) {
      if ($null -eq $v) { continue }
      $n = 0
      try { $n = [int]$v } catch { continue }
      if ($n -le 0) { continue }
      $chars += [char]$n
    }
    return ((-join $chars).Trim())
  }
  function Map-VideoOut($code) {
    # DISPLAYCONFIG_VIDEO_OUTPUT_TECHNOLOGY (uint)
    $u = [uint32]0
    try { $u = [uint32]$code } catch {
      try { $u = [uint32]([int64]$code -band 0xFFFFFFFF) } catch { return 'other' }
    }
    switch ($u) {
      0 { return 'vga' }              # HD15
      4 { return 'dvi' }
      5 { return 'hdmi' }
      6 { return 'internal' }         # LVDS
      10 { return 'displayport' }     # external DP
      11 { return 'displayport' }     # embedded DP
      15 { return 'miracast' }
      16 { return 'indirect' }        # indirect wired
      17 { return 'virtual' }         # indirect virtual
      2147483648 { return 'internal' } # INTERNAL 0x80000000
      default { return 'other' }
    }
  }
  # EDID-ish identity (fast WMI)
  $edidByIdx = @()
  try {
    $ids = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue)
    $conns = @{}
    Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorConnectionParams -ErrorAction SilentlyContinue | ForEach-Object {
      $conns[[string]$_.InstanceName] = [int]$_.VideoOutputTechnology
    }
    $params = @{}
    Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue | ForEach-Object {
      $params[[string]$_.InstanceName] = $_
    }
    foreach ($id in $ids) {
      $inst = [string]$id.InstanceName
      $nm = Decode-WmiName $id.UserFriendlyName
      $mfr = Decode-WmiName $id.ManufacturerName
      $ser = Decode-WmiName $id.SerialNumberID
      $vcode = 0
      if ($conns.ContainsKey($inst)) { $vcode = [int]$conns[$inst] }
      $conn = Map-VideoOut $vcode
      $cmW = 0; $cmH = 0
      if ($params.ContainsKey($inst)) {
        try { $cmW = [int]$params[$inst].MaxHorizontalImageSize } catch {}
        try { $cmH = [int]$params[$inst].MaxVerticalImageSize } catch {}
      }
      $active = $true
      try { $active = [bool]$id.Active } catch {}
      $virt = $false
      $blob = ("$nm $mfr $inst").ToUpperInvariant()
      if ($conn -eq 'virtual') { $virt = $true }
      if ($blob -match 'VIRTUAL|MIRROR|BASICRENDER|REMOTE|\bRDP\b|CITRIX|VBOX|VMWARE|QXL|HYPER-?V|PARSEC|SUNSHINE|IDD_|INDIRECT|VIRTUAL DISPLAY|MSFT.*MIRROR') {
        $virt = $true
      }
      # Generic / empty product name only — do NOT treat real brands (e.g. PNY) as generic
      $generic = (-not $nm) -or ($nm -match '(?i)^(generic(\s+pnp)?(\s+monitor)?|default\s+monitor|standard\s+monitor|non-?pnp\s+monitor)\b') -or ($nm -match '(?i)pnp monitor')
      if ($virt) { $generic = $true }
      $src = 'edid'
      if ($virt) { $src = 'virtual' }
      elseif ($generic -or -not $nm) { $src = 'geometry' }
      $edidByIdx += [pscustomobject]@{
        name = $nm
        manufacturer = $mfr
        serial = $ser
        instance = $inst
        connection = $conn
        video_out = $vcode
        width_cm = $cmW
        height_cm = $cmH
        active = $active
        virtual = $virt
        generic = $generic
        source = $src
      }
    }
  } catch {}

  $screens = @([System.Windows.Forms.Screen]::AllScreens)
  # primary first for best-effort zip with EDID list
  $screens = @($screens | Sort-Object -Property @{Expression='Primary';Descending=$true}, @{Expression={$_.Bounds.X}}, @{Expression={$_.Bounds.Y}})
  $edidActive = @($edidByIdx | Where-Object { $_.active -ne $false })
  if (-not $edidActive.Count) { $edidActive = $edidByIdx }

  $i = 0
  foreach ($s in $screens) {
    $dev = [string]$s.DeviceName
    $primary = [bool]$s.Primary
    $ed = $null
    if ($i -lt $edidActive.Count) { $ed = $edidActive[$i] }
    $prod = if ($ed -and $ed.name) { [string]$ed.name } else { '' }
    $conn = if ($ed -and $ed.connection) { [string]$ed.connection } else { 'other' }
    $src = if ($ed -and $ed.source) { [string]$ed.source } else { 'geometry' }
    $virt = if ($ed) { [bool]$ed.virtual } else { $false }
    $generic = if ($ed) { [bool]$ed.generic } else { $true }
    if ($prod) {
      $label = $prod
      if ($primary) { $label = "$prod · Primary" }
    } else {
      $label = if ($primary) { "Monitor $($i+1) · Primary" } else { "Monitor $($i+1)" }
    }
    $mons += [pscustomobject]@{
      index = $i
      primary = $primary
      width = [int]$s.Bounds.Width
      height = [int]$s.Bounds.Height
      x = [int]$s.Bounds.X
      y = [int]$s.Bounds.Y
      device = $dev
      label = $label
      name = $prod
      manufacturer = $(if ($ed) { [string]$ed.manufacturer } else { '' })
      serial = $(if ($ed) { [string]$ed.serial } else { '' })
      connection = $conn
      width_cm = $(if ($ed) { [int]$ed.width_cm } else { 0 })
      height_cm = $(if ($ed) { [int]$ed.height_cm } else { 0 })
      virtual = $virt
      generic = $generic
      source = $src
      instance = $(if ($ed) { [string]$ed.instance } else { '' })
    }
    $i++
  }
  # EDID present but no Screen object (rare) — still surface
  if ((-not $mons.Count) -and $edidActive.Count) {
    $j = 0
    foreach ($ed in $edidActive) {
      $prod = [string]$ed.name
      $label = if ($prod) { $prod } else { "Monitor $($j+1)" }
      $mons += [pscustomobject]@{
        index = $j
        primary = ($j -eq 0)
        width = 0
        height = 0
        x = 0
        y = 0
        device = ''
        label = $label
        name = $prod
        manufacturer = [string]$ed.manufacturer
        serial = [string]$ed.serial
        connection = [string]$ed.connection
        width_cm = [int]$ed.width_cm
        height_cm = [int]$ed.height_cm
        virtual = [bool]$ed.virtual
        generic = [bool]$ed.generic
        source = [string]$ed.source
        instance = [string]$ed.instance
      }
      $j++
    }
  }
} catch {}
$speakers = @()
$microphones = @()
# Fast path: CIM sound devices only (Get-PnpDevice AudioEndpoint is multi-second on Win11)
try {
  $speakers = @(Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue | ForEach-Object {
    $nm = $_.Name
    if ($nm) {
      $u = $nm.ToUpperInvariant()
      $virt = [bool]($u -match 'VIRTUAL|BROADCAST|CABLE')
      [pscustomobject]@{
        name = $nm
        status = [string]$_.Status
        flow = 'render'
        virtual = $virt
        instance_id = ''
        source = 'driver'
      }
    }
  })
} catch {}
# Mic list: MMDevices Capture registry (fast). Not Win32_SoundDevice name filter —
# that misses real endpoints and invents nothing useful. DeviceState low nibble:
# 1=Active 2=Disabled 4=NotPresent 8=Unplugged. Active virtual (Broadcast) = warn
# in UI; Unplugged Realtek jack = not a present mic.
try {
  $capRoot = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
  if (Test-Path $capRoot) {
    $microphones = @(Get-ChildItem $capRoot -ErrorAction SilentlyContinue | ForEach-Object {
      $guid = $_.PSChildName
      $state = 0
      try { $state = [int]((Get-ItemProperty $_.PSPath -ErrorAction Stop).DeviceState) } catch { $state = 0 }
      $base = $state -band 0xF
      # Only Active or Unplugged — skip NotPresent/Disabled channel noise
      if ($base -ne 1 -and $base -ne 8) { return }
      $nm = $null; $desc = $null
      try {
        $pr = Get-ItemProperty (Join-Path $_.PSPath 'Properties') -ErrorAction Stop
        $nm = [string]$pr.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        $desc = [string]$pr.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
      } catch {}
      if (-not $nm) { return }
      # Multi-channel pins under Capture are not microphones
      if ($nm -match '^(Front|Rear|Side|Center|Subwoofer|Speakers?|Headphones?)$') { return }
      $blob = ($nm + ' ' + $desc)
      # Require capture-like role name (EN/zh); avoid listing random pins
      # Strict mic role only (not Line-In / Stereo Mix — those are not lab mics)
      if ($blob -notmatch 'Mic|Microphone|Array|麦克风|麥克風') { return }
      $u = $blob.ToUpperInvariant()
      $virt = [bool]($u -match 'VIRTUAL|BROADCAST|CABLE|VB-?AUDIO|STEREO\s*MIX|WHAT\s*U\s*HEAR|NVIDIA VIRTUAL|混音')
      $stLabel = switch ($base) { 1 { 'OK' } 8 { 'Unplugged' } default { 'Unknown' } }
      $label = $nm
      if ($desc -and $desc.Length -gt 0 -and $nm -notlike "*$desc*") {
        $label = "$nm ($desc)"
      }
      [pscustomobject]@{
        name = $label
        status = $stLabel
        flow = 'capture'
        virtual = $virt
        instance_id = [string]$guid
        source = 'endpoint'
      }
    })
  }
} catch {}
[pscustomobject]@{
  cpu = $cpu
  gpus = $gpus
  ram_gb = $ramGb
  keyboards = $kbs
  mice = $mice
  monitors = $mons
  speakers = $speakers
  microphones = $microphones
} | ConvertTo-Json -Compress -Depth 6
"""
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                 "-Command",
                 "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
                 "$OutputEncoding = [Console]::OutputEncoding; " + ps],
                capture_output=True,
                timeout=12,
            )
            raw_bytes = proc.stdout or b""
            raw = ""
            for enc in ("utf-8-sig", "utf-8", "gbk", "cp936", "latin-1"):
                try:
                    raw = raw_bytes.decode(enc).strip()
                    if raw:
                        break
                except UnicodeDecodeError:
                    continue
            if not raw:
                raw = raw_bytes.decode("utf-8", errors="replace").strip()
            if raw:
                import json as _json

                data = _json.loads(raw)
                out["cpu"] = data.get("cpu") or None
                gpus = data.get("gpus") or []
                if isinstance(gpus, str):
                    gpus = [gpus]
                out["gpus"] = [g for g in gpus if g]
                try:
                    out["ram_gb"] = float(data["ram_gb"]) if data.get("ram_gb") is not None else None
                except (TypeError, ValueError):
                    out["ram_gb"] = None

                def _norm_list(items: Any) -> List[Dict[str, Any]]:
                    if not items:
                        return []
                    if isinstance(items, dict):
                        items = [items]
                    res = []
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        name = it.get("name") or ""
                        conn = it.get("connection") or _classify_pnp_connection(
                            str(it.get("instance_id") or ""), str(name)
                        )
                        res.append(
                            {
                                "name": name,
                                "connection": conn,
                                "instance_id": it.get("instance_id"),
                            }
                        )
                    return res

                out["keyboards"] = _norm_list(data.get("keyboards"))
                out["mice"] = _norm_list(data.get("mice"))

                mons_raw = data.get("monitors") or []
                if isinstance(mons_raw, dict):
                    mons_raw = [mons_raw]
                monitors: List[Dict[str, Any]] = []
                for it in mons_raw:
                    if not isinstance(it, dict):
                        continue
                    try:
                        idx = int(it.get("index", len(monitors)))
                        w = int(it.get("width") or 0)
                        h = int(it.get("height") or 0)
                    except (TypeError, ValueError):
                        continue
                    # allow EDID-only rows (no geometry yet)
                    primary = bool(it.get("primary"))
                    label = str(it.get("label") or "").strip()
                    name = str(it.get("name") or "").strip()
                    if not label:
                        label = name or (f"Monitor {idx + 1}" + (" · Primary" if primary else ""))
                    src = str(it.get("source") or "").strip().lower()
                    if not src:
                        src = "edid" if name else "geometry"
                    monitors.append(
                        {
                            "index": idx,
                            "primary": primary,
                            "width": w,
                            "height": h,
                            "x": int(it.get("x") or 0),
                            "y": int(it.get("y") or 0),
                            "device": str(it.get("device") or ""),
                            "label": label,
                            "name": name,
                            "manufacturer": str(it.get("manufacturer") or "").strip(),
                            "serial": str(it.get("serial") or "").strip(),
                            "connection": str(it.get("connection") or "other").strip().lower() or "other",
                            "width_cm": int(it.get("width_cm") or 0) if str(it.get("width_cm") or "").strip() not in ("", "None") else 0,
                            "height_cm": int(it.get("height_cm") or 0) if str(it.get("height_cm") or "").strip() not in ("", "None") else 0,
                            "virtual": bool(it.get("virtual")),
                            "generic": bool(it.get("generic")) if "generic" in it else (not bool(name)),
                            "source": src,
                            "instance": str(it.get("instance") or ""),
                        }
                    )
                out["monitors"] = classify_monitors(monitors)

                spk_raw = data.get("speakers") or []
                if isinstance(spk_raw, dict):
                    spk_raw = [spk_raw]
                speakers: List[Dict[str, Any]] = []
                for it in spk_raw:
                    if not isinstance(it, dict):
                        continue
                    nm = str(it.get("name") or "").strip()
                    if not nm:
                        continue
                    speakers.append(
                        {
                            "name": nm,
                            "status": str(it.get("status") or ""),
                            "flow": str(it.get("flow") or "render"),
                            "virtual": bool(it.get("virtual")),
                            "instance_id": str(it.get("instance_id") or ""),
                            "source": str(it.get("source") or ""),
                        }
                    )
                out["speakers"] = speakers

                mic_raw = data.get("microphones") or []
                if isinstance(mic_raw, dict):
                    mic_raw = [mic_raw]
                microphones: List[Dict[str, Any]] = []
                for it in mic_raw:
                    if not isinstance(it, dict):
                        continue
                    nm = str(it.get("name") or "").strip()
                    if not nm:
                        continue
                    microphones.append(
                        {
                            "name": nm,
                            "status": str(it.get("status") or ""),
                            "flow": str(it.get("flow") or "capture"),
                            "virtual": bool(it.get("virtual")),
                            "instance_id": str(it.get("instance_id") or ""),
                            "source": str(it.get("source") or ""),
                        }
                    )
                out["microphones"] = microphones
        except (OSError, subprocess.TimeoutExpired, ValueError):
            pass
        return out

    if system == "Darwin":
        try:
            proc = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=4,
            )
            out["cpu"] = (proc.stdout or "").strip() or None
        except (OSError, subprocess.TimeoutExpired):
            pass
        try:
            proc = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            gpus = []
            monitors: List[Dict[str, Any]] = []
            cur_w = cur_h = None
            for line in (proc.stdout or "").splitlines():
                if "Chipset Model" in line or "Chipset model" in line:
                    gpus.append(line.split(":", 1)[-1].strip())
                low = line.lower()
                if "resolution" in low and ":" in line:
                    # e.g. Resolution: 2560 x 1600
                    rest = line.split(":", 1)[-1].strip()
                    parts = rest.replace("×", "x").lower().split("x")
                    try:
                        if len(parts) >= 2:
                            cur_w = int("".join(c for c in parts[0] if c.isdigit()) or 0)
                            cur_h = int("".join(c for c in parts[1] if c.isdigit()) or 0)
                            if cur_w and cur_h:
                                idx = len(monitors)
                                monitors.append(
                                    {
                                        "index": idx,
                                        "primary": idx == 0,
                                        "width": cur_w,
                                        "height": cur_h,
                                        "x": 0,
                                        "y": 0,
                                        "device": "",
                                        "label": f"Monitor {idx + 1}"
                                        + (" · Primary" if idx == 0 else ""),
                                    }
                                )
                    except ValueError:
                        pass
            out["gpus"] = gpus
            out["monitors"] = monitors
        except (OSError, subprocess.TimeoutExpired):
            pass
        try:
            import psutil  # type: ignore

            out["ram_gb"] = round(psutil.virtual_memory().total / (1024**3), 1)
        except Exception:  # noqa: BLE001
            pass
        return out

    # Linux
    try:
        with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    out["cpu"] = line.split(":", 1)[-1].strip()
                    break
    except OSError:
        pass
    try:
        mem_kb = None
        with open("/proc/meminfo", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    mem_kb = int(line.split()[1])
                    break
        if mem_kb:
            out["ram_gb"] = round(mem_kb / (1024**2), 1)
    except (OSError, ValueError):
        pass
    # GPU via lspci if present
    try:
        proc = subprocess.run(
            ["lspci"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        gpus = []
        for line in (proc.stdout or "").splitlines():
            low = line.lower()
            if "vga" in low or "3d" in low or "display" in low:
                gpus.append(line.split(":", 2)[-1].strip() if ":" in line else line.strip())
        out["gpus"] = gpus[:4]
    except (OSError, subprocess.TimeoutExpired):
        pass
    # xrandr monitors when available
    try:
        proc = subprocess.run(
            ["xrandr", "--query"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        monitors = []
        for line in (proc.stdout or "").splitlines():
            if " connected" not in line:
                continue
            # e.g. HDMI-1 connected primary 1920x1080+0+0
            primary = " primary " in line or line.endswith(" primary")
            m = None
            import re as _re

            m = _re.search(r"(\d+)x(\d+)\+(\d+)\+(\d+)", line)
            if not m:
                continue
            idx = len(monitors)
            monitors.append(
                {
                    "index": idx,
                    "primary": primary or idx == 0,
                    "width": int(m.group(1)),
                    "height": int(m.group(2)),
                    "x": int(m.group(3)),
                    "y": int(m.group(4)),
                    "device": line.split()[0],
                    "label": f"Monitor {idx + 1}" + (" · Primary" if (primary or idx == 0) else ""),
                }
            )
        out["monitors"] = monitors
    except (OSError, subprocess.TimeoutExpired, ValueError):
        pass
    return out


def _disk_free_gb(path: str) -> Optional[float]:
    try:
        usage = shutil.disk_usage(path)
        return round(usage.free / (1024**3), 2)
    except OSError:
        return None


def _disk_total_gb(path: str) -> Optional[float]:
    try:
        usage = shutil.disk_usage(path)
        return round(usage.total / (1024**3), 2)
    except OSError:
        return None


def _disk_root(path: str) -> str:
    """Volume root letter/path (e.g. 'E:\\\\' on Windows, '/' on Unix)."""
    abs_path = os.path.abspath(path)
    if platform.system() == "Windows":
        drive, _ = os.path.splitdrive(abs_path)
        if drive:
            return drive + "\\"
        return abs_path
    # best-effort: walk up until parent stops changing (mount root unknown)
    return os.path.abspath(os.sep)


def _resolve_existing_path(path: str) -> str:
    """Walk up until an existing path for shutil.disk_usage (drive root ok)."""
    p = os.path.abspath(os.path.expanduser(path))
    if os.path.exists(p):
        return p
    cur = p
    while True:
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        if os.path.exists(parent):
            return parent
        cur = parent
    if platform.system() == "Windows":
        drive, _ = os.path.splitdrive(p)
        if drive:
            root = drive + "\\"
            if os.path.exists(root):
                return root
    return os.path.abspath(".")


def probe_disk(data_path: Optional[str]) -> Dict[str, Any]:
    """Disk free for the experiment folder volume only.

    No path → pending (do not invent a default drive).
    With path → free space on that path's volume + root letter.
    """
    if not data_path or not str(data_path).strip():
        facts = {
            "path": None,
            "probe_path": None,
            "root": None,
            "free_gb": None,
            "total_gb": None,
            "pending": True,
        }
        check = {
            "id": "disk_free",
            "label": "Disk free (data)",
            "group": "runtime",
            "status": "info",
            "detail": "Open experiment folder in Builder first",
            "value": None,
        }
        return {"ok": True, "facts": {"disk": facts}, "check": check}

    raw = str(data_path).strip()
    probe_path = _resolve_existing_path(raw)
    root = _disk_root(probe_path)
    free_gb = _disk_free_gb(probe_path)
    total_gb = _disk_total_gb(probe_path)
    facts = {
        "path": os.path.abspath(os.path.expanduser(raw)),
        "probe_path": probe_path,
        "root": root,
        "free_gb": free_gb,
        "total_gb": total_gb,
        "pending": False,
    }
    # short root label for detail: "E:" not "E:\"
    if platform.system() == "Windows" and len(root) >= 2 and root[1] == ":":
        root_label = root[:2]  # E:
    else:
        root_label = root

    if free_gb is None:
        status, detail = "warn", f"could not read free space · {root_label} · {probe_path}"
    elif free_gb < 1:
        status, detail = "fail", f"{root_label} · {free_gb} GB free — need ≥1 GB · {probe_path}"
    elif free_gb < 5:
        status, detail = "warn", f"{root_label} · {free_gb} GB free · {probe_path}"
    else:
        status, detail = "pass", f"{root_label} · {free_gb} GB free · {probe_path}"

    check = {
        "id": "disk_free",
        "label": "Disk free (data)",
        "group": "runtime",
        "status": status,
        "detail": detail,
        "value": free_gb,
    }
    return {"ok": status != "fail", "facts": {"disk": facts}, "check": check}


def _run_py(exe: str, code: str, timeout: float = 12.0) -> Tuple[int, str, str]:
    try:
        proc = subprocess.run(
            [exe, "-c", code],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONPATH": "", "PYTHONHOME": ""},
        )
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", "executable not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except OSError as exc:
        return 1, "", str(exc)


# TTL cache — host hardware/PsychoPy rarely change mid-session
_PROBE_CACHE: Dict[str, Any] = {"at": 0.0, "key": "", "report": None}
_PROBE_TTL_S = 90.0



# ---------------------------------------------------------------------------
# Monitor trust: real hardware vs virtual / geometry-only
# ---------------------------------------------------------------------------
_MONITOR_VIRT_RE = re.compile(
    r"VIRTUAL|MIRROR|BASICRENDER|REMOTE|\bRDP\b|CITRIX|VBOX|VMWARE|QXL|"
    r"HYPER-?V|PARSEC|SUNSHINE|IDD_|INDIRECT[_ ]?VIRTUAL|VIRTUAL\s*DISPLAY|MSFT.*MIRROR|"
    r"ROOT\\DISPLAY|USB\s*Mobile\s*Monitor|AirPlay|Deskreen|Spacedesk",
    re.I,
)
_MONITOR_GENERIC_RE = re.compile(
    r"^(generic(\s+pnp)?(\s+monitor)?|default\s+monitor|standard\s+monitor|"
    r"non-?pnp\s+monitor)\b|pnp\s+monitor",
    re.I,
)


def _map_video_out_code(code: Any) -> str:
    try:
        u = int(code) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return "other"
    table = {
        0: "vga",
        4: "dvi",
        5: "hdmi",
        6: "internal",
        10: "displayport",
        11: "displayport",
        15: "miracast",
        16: "indirect",
        17: "virtual",
        0x80000000: "internal",
    }
    return table.get(u, "other")


def classify_monitor(mon: Dict[str, Any]) -> Dict[str, Any]:
    """Attach trust/source/virtual/generic. Mutates and returns mon.

    trust:
      real     — EDID product name (and not virtual keywords)
      geometry — logical screen only / Generic PnP
      virtual  — RDP/VM/indirect virtual/etc.
      unknown  — empty
    """
    if not isinstance(mon, dict):
        return mon
    name = str(mon.get("name") or "").strip()
    label = str(mon.get("label") or "").strip()
    mfr = str(mon.get("manufacturer") or "").strip()
    serial = str(mon.get("serial") or "").strip()
    device = str(mon.get("device") or "").strip()
    instance = str(mon.get("instance") or "").strip()
    conn = str(mon.get("connection") or "other").strip().lower() or "other"
    if conn == "other" and mon.get("video_out") is not None:
        conn = _map_video_out_code(mon.get("video_out"))
        mon["connection"] = conn

    blob = " ".join([name, label, mfr, device, instance])
    virtual = bool(mon.get("virtual")) or conn in ("virtual",) or bool(_MONITOR_VIRT_RE.search(blob))
    # Miracast / pure wireless cast: treat as weak virtual for lab purposes
    if conn == "miracast":
        virtual = True

    generic = bool(mon.get("generic"))
    if not name or _MONITOR_GENERIC_RE.search(name):
        generic = True
    if name and not _MONITOR_GENERIC_RE.search(name) and not virtual:
        generic = False

    try:
        w = int(mon.get("width") or 0)
        h = int(mon.get("height") or 0)
    except (TypeError, ValueError):
        w = h = 0
    try:
        cm_w = int(mon.get("width_cm") or 0)
        cm_h = int(mon.get("height_cm") or 0)
    except (TypeError, ValueError):
        cm_w = cm_h = 0

    has_geo = w > 0 and h > 0
    has_edid_name = bool(name) and not generic and not virtual

    if virtual:
        trust = "virtual"
        source = "virtual"
    elif has_edid_name:
        trust = "real"
        source = "edid"
    elif has_geo:
        trust = "geometry"
        source = "geometry"
    else:
        trust = "unknown"
        source = str(mon.get("source") or "unknown")

    # Physical cm / serial reinforce real but are not required
    if trust == "real" and (serial or (cm_w > 0 and cm_h > 0) or conn in (
        "hdmi", "displayport", "dvi", "vga", "internal"
    )):
        mon["evidence"] = "edid+link"
    elif trust == "real":
        mon["evidence"] = "edid_name"
    elif trust == "geometry":
        mon["evidence"] = "screen_bounds"
    elif trust == "virtual":
        mon["evidence"] = "virtual_signature"
    else:
        mon["evidence"] = "none"

    mon["name"] = name
    mon["virtual"] = trust == "virtual"
    mon["generic"] = bool(generic or trust in ("geometry", "unknown"))
    mon["source"] = source
    mon["trust"] = trust
    mon["connection"] = conn
    if not str(mon.get("label") or "").strip():
        if name:
            mon["label"] = name + (" · Primary" if mon.get("primary") else "")
        elif has_geo:
            mon["label"] = f"{w}×{h}" + (" · Primary" if mon.get("primary") else "")
        else:
            mon["label"] = "Monitor"
    return mon


def classify_monitors(monitors: List[Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in monitors or []:
        if isinstance(m, dict):
            out.append(classify_monitor(dict(m)))
    # stable: real primary first, then real, then geometry, virtual last
    rank = {"real": 0, "geometry": 1, "unknown": 2, "virtual": 3}

    def _key(m: Dict[str, Any]):
        return (
            rank.get(str(m.get("trust") or ""), 9),
            0 if m.get("primary") else 1,
            int(m.get("index") or 0),
        )

    out.sort(key=_key)
    for i, m in enumerate(out):
        m["index"] = i
    return out



def probe(
    runs_dir: str,
    data_path: Optional[str] = None,
    *,
    fresh: bool = False,
) -> Dict[str, Any]:
    """Host preflight.

    Disk free is bound to the experiment folder path (data_path), not the
    internal runs/ dir. Without data_path the disk check stays pending.
    ``runs_dir`` is retained for callers/compat only (not used for Data disk).

    Cached ~90s (host facts + engine). Disk is always refreshed for the path.
    Pass fresh=True (or ?fresh=1) to force full re-probe (Recheck button).
    """
    global _PROBE_CACHE
    checks: List[Dict[str, Any]] = []
    facts: Dict[str, Any] = {}
    t0 = time.time()
    _ = runs_dir  # reserved / compat

    cache_key = "host"
    now = time.time()
    cached = _PROBE_CACHE.get("report")
    use_cache = (
        (not fresh)
        and cached is not None
        and _PROBE_CACHE.get("key") == cache_key
        and (now - float(_PROBE_CACHE.get("at") or 0.0)) < _PROBE_TTL_S
    )
    if use_cache:
        # shallow copy + refresh disk only (path may change)
        import copy

        report = copy.deepcopy(cached)
        disk_report = probe_disk(data_path)
        report.setdefault("facts", {})["disk"] = disk_report["facts"]["disk"]
        # replace disk check
        new_checks = []
        for c in report.get("checks") or []:
            if c and c.get("id") == "disk_free":
                new_checks.append(disk_report["check"])
            else:
                new_checks.append(c)
        if not any(c and c.get("id") == "disk_free" for c in new_checks):
            new_checks.insert(0, disk_report["check"])
        report["checks"] = new_checks
        counts = {"pass": 0, "warn": 0, "fail": 0, "info": 0}
        for c in new_checks:
            st = (c or {}).get("status") or "info"
            counts[st] = counts.get(st, 0) + 1
        overall = "pass"
        if counts.get("fail", 0):
            overall = "fail"
        elif counts.get("warn", 0):
            overall = "warn"
        report["counts"] = counts
        report["overall"] = overall
        report["ok"] = overall != "fail"
        report["elapsed_ms"] = int((time.time() - t0) * 1000)
        report["checked_at"] = time.time()
        report["cached"] = True
        return report

    # facts always (raw report), not all become UI checks
    facts["os"] = {
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "platform": platform.platform(),
        "label": _os_label(),
    }
    facts["host_python"] = {
        "version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "executable": sys.executable,
    }
    try:
        facts["form_factor"] = _detect_form_factor()
    except Exception as exc:  # noqa: BLE001
        facts["form_factor"] = {
            "kind": "desktop",
            "label": "Desktop PC",
            "detail": f"detect failed: {exc!r}",
            "os": platform.system(),
        }

    try:
        facts["hardware"] = _detect_hardware()
    except Exception as exc:  # noqa: BLE001
        facts["hardware"] = {"error": repr(exc), "cpu": None, "gpus": [], "ram_gb": None,
                             "keyboards": [], "mice": []}

    # --- Disk free (experiment folder volume only) ---
    disk_report = probe_disk(data_path)
    facts["disk"] = disk_report["facts"]["disk"]
    checks.append(disk_report["check"])

    # --- PsychoPy python binary ---
    pp = _psychopy_python()
    force_mock = os.environ.get("PSYCLAW_FORCE_MOCK", "0") == "1"
    facts["psychopy_python_path"] = pp
    facts["force_mock"] = force_mock
    exists = os.path.isfile(pp)
    checks.append(
        {
            "id": "psychopy_python",
            "label": "PsychoPy Python",
            "group": "engine",
            "status": "pass" if exists else "fail",
            "detail": pp if exists else f"missing: {pp}",
            "value": pp,
        }
    )

    # --- PsychoPy import + version + graphics (ONE subprocess) ---
    psy_ver: Optional[str] = None
    psy_err: Optional[str] = None
    win_backend = None
    backends = "n/a"
    if exists:
        code, out, err = _run_py(
            pp,
            (
                "import os\n"
                "os.environ.setdefault('PSYCHOPY_DISABLE_VERSION_CHECK','1')\n"
                "import json\n"
                "ver=None; err=None; win=None; libs='none'\n"
                "try:\n"
                "  import psychopy\n"
                "  ver=getattr(psychopy,'__version__',None) or ''\n"
                "except Exception as e:\n"
                "  err=repr(e)\n"
                "if ver:\n"
                "  try:\n"
                "    from psychopy import prefs\n"
                "    win=prefs.general.get('winType','default') or 'default'\n"
                "  except Exception:\n"
                "    win=None\n"
                "  mods=[]\n"
                "  for m in ('pyglet','glfw','pygame'):\n"
                "    try:\n"
                "      __import__(m); mods.append(m)\n"
                "    except Exception:\n"
                "      pass\n"
                "  libs=','.join(mods) if mods else 'none'\n"
                "print(json.dumps({'ver':ver,'err':err,'win':win,'libs':libs}))\n"
            ),
            timeout=25.0,
        )
        if code == 0 and out:
            try:
                import json as _json

                line = out.splitlines()[-1].strip()
                data = _json.loads(line)
                psy_ver = (data.get("ver") or None) or None
                if data.get("err") and not psy_ver:
                    psy_err = str(data.get("err"))
                win_backend = data.get("win") or None
                backends = data.get("libs") or "n/a"
            except Exception:  # noqa: BLE001
                # legacy plain version line
                psy_ver = out.splitlines()[-1].strip() or None
        else:
            psy_err = err or out or f"exit {code}"
    facts["psychopy"] = {"version": psy_ver, "error": psy_err}
    if force_mock:
        checks.append(
            {
                "id": "psychopy_import",
                "label": "PsychoPy import",
                "group": "engine",
                "status": "warn",
                "detail": "PSYCLAW_FORCE_MOCK=1 — runs use MockProcess",
                "value": psy_ver,
            }
        )
    elif psy_ver:
        checks.append(
            {
                "id": "psychopy_import",
                "label": "PsychoPy import",
                "group": "engine",
                "status": "pass",
                "detail": f"psychopy {psy_ver}",
                "value": psy_ver,
            }
        )
    else:
        checks.append(
            {
                "id": "psychopy_import",
                "label": "PsychoPy import",
                "group": "engine",
                "status": "fail",
                "detail": psy_err or "PsychoPy not importable",
                "value": None,
            }
        )

    facts["win_backend"] = win_backend
    facts["graphics_libs"] = backends

    if force_mock or not exists:
        gfx_status, gfx_detail = "info", "n/a (mock or no binary)"
    elif win_backend or (backends not in ("none", "unknown", "")):
        gfx_status = "pass"
        bits = []
        if win_backend:
            bits.append(f"winType={win_backend}")
        if backends and backends not in ("n/a",):
            bits.append(f"libs={backends}")
        gfx_detail = " · ".join(bits) if bits else "ok"
    else:
        gfx_status, gfx_detail = "warn", "no winType / no pyglet|glfw|pygame"

    checks.append(
        {
            "id": "psychopy_graphics",
            "label": "PsychoPy graphics",
            "group": "engine",
            "status": gfx_status,
            "detail": gfx_detail,
            "value": {"winType": win_backend, "libs": backends},
        }
    )

    # --- Runner mode summary ---
    if force_mock:
        mode, mode_status = "mock (forced)", "warn"
    elif exists and psy_ver:
        mode, mode_status = "psychopy-real", "pass"
    elif exists:
        mode, mode_status = "binary present but import failed", "fail"
    else:
        mode, mode_status = "mock (no PsychoPy binary)", "warn"
    facts["runner_mode"] = mode
    checks.append(
        {
            "id": "runner_mode",
            "label": "Run engine",
            "group": "engine",
            "status": mode_status,
            "detail": mode,
            "value": mode,
        }
    )

    counts = {"pass": 0, "warn": 0, "fail": 0, "info": 0}
    for c in checks:
        st = c.get("status") or "info"
        counts[st] = counts.get(st, 0) + 1

    overall = "pass"
    if counts.get("fail", 0):
        overall = "fail"
    elif counts.get("warn", 0):
        overall = "warn"

    report = {
        "ok": overall != "fail",
        "overall": overall,
        "counts": counts,
        "checks": checks,
        "facts": facts,
        "elapsed_ms": int((time.time() - t0) * 1000),
        "checked_at": time.time(),
        "cached": False,
    }
    # cache host+engine; disk refreshed on cache hit
    try:
        import copy

        _PROBE_CACHE["at"] = time.time()
        _PROBE_CACHE["key"] = "host"
        _PROBE_CACHE["report"] = copy.deepcopy(report)
    except Exception:  # noqa: BLE001
        pass
    return report
