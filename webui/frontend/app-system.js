/* psyclaw-webui — System tab (host / engine / gate / device probes)
 * Loaded before app.js. Exposes window.PsyClawSystem.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  var lastSystemSnapshot = null;
  var systemCheckGen = 0;
  var lastDiskPathKey = null;

    // System / hardware checks
    // ---------------------------------------------------------------
    function statusLabel(st) {
      if (st === 'pass') return t('sys.pass');
      if (st === 'warn') return t('sys.warn');
      if (st === 'fail') return t('sys.failBadge');
      return t('sys.info');
    }

  function renderCheckList(el, checks) {
    if (!el) return;
    el.innerHTML = '';
    if (!checks || !checks.length) {
      el.innerHTML = '<li class="sys-check sys-check-info"><span class="sys-badge">—</span><div><strong>' + t('sys.noChecks') + '</strong></div></li>';
      return;
    }
    checks.forEach(function (c) {
      var li = document.createElement('li');
      li.className = 'sys-check sys-check-' + (c.status || 'info');
      li.innerHTML =
        '<span class="sys-badge">' + statusLabel(c.status) + '</span>' +
        '<div class="sys-check-body">' +
        '<strong>' + escapeHtml(c.label || c.id) + '</strong>' +
        '<span class="sys-check-detail">' + escapeHtml(c.detail || '') + '</span>' +
        '</div>';
      el.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function estimateRefreshRate(samples) {
    samples = samples || 40;
    return new Promise(function (resolve) {
      var times = [];
      var last = 0;
      function frame(t) {
        if (last) times.push(t - last);
        last = t;
        if (times.length < samples) {
          requestAnimationFrame(frame);
        } else {
          times.sort(function (a, b) { return a - b; });
          var mid = times[Math.floor(times.length / 2)] || 16.67;
          var hz = Math.round(1000 / mid);
          resolve({ hz: hz, median_ms: Math.round(mid * 100) / 100 });
        }
      }
      requestAnimationFrame(frame);
    });
  }

  // Lab hardware that actually matters for experiments (display, I/O, timing).
  function hardwareChecks() {
    var out = [];
    var w = window.screen ? screen.width : 0;
    var h = window.screen ? screen.height : 0;
    var dpr = window.devicePixelRatio || 1;
    var depth = window.screen ? screen.colorDepth : 0;
    out.push({
      id: 'display',
      label: 'Display',
      group: 'hardware',
      status: w >= 1024 && h >= 768 ? 'pass' : 'warn',
      detail: w + '×' + h + ' · dpr ' + dpr + ' · ' + depth + 'bit',
      value: { w: w, h: h, dpr: dpr, colorDepth: depth },
    });

    var fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    out.push({
      id: 'fullscreen_api',
      label: 'Fullscreen API',
      group: 'hardware',
      status: fsOk ? 'pass' : 'warn',
      detail: fsOk ? 'supported (participant path)' : 'not available',
      value: fsOk,
    });

    var audioOk = !!(window.AudioContext || window.webkitAudioContext);
    out.push({
      id: 'audio_api',
      label: 'Audio path',
      group: 'hardware',
      status: audioOk ? 'pass' : 'warn',
      detail: audioOk ? 'Web Audio available' : 'no AudioContext',
      value: audioOk,
    });

    var fine = false;
    try {
      fine = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
    } catch (e) { fine = false; }
    var maxTouch = navigator.maxTouchPoints || 0;
    out.push({
      id: 'pointer',
      label: 'Pointer / mouse',
      group: 'hardware',
      status: fine || maxTouch === 0 ? 'pass' : 'info',
      detail: fine
        ? 'fine pointer (mouse/trackpad)'
        : (maxTouch ? ('touch · ' + maxTouch + ' pts') : 'pointer unknown'),
      value: { fine: fine, maxTouchPoints: maxTouch },
    });

    return out;
  }

  function _escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Device body paths only — local coords viewBox 0 0 160 100 */
  function deviceBodyMarkup(kind) {
    var red = '#e82127';
    var line = '#3a3a3a';
    var fill = '#141414';
    var dim = '#2a2a2a';
    var glow = 'rgba(232,33,39,0.35)';
    if (kind === 'laptop' || kind === 'macbook') {
      return (
        '<defs><linearGradient id="sysScr" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#1a1012"/><stop offset="100%" stop-color="#0a0a0a"/>' +
        '</linearGradient></defs>' +
        '<rect x="22" y="12" width="116" height="62" rx="5" fill="url(#sysScr)" stroke="' + line + '" stroke-width="1.5"/>' +
        '<rect x="30" y="20" width="100" height="46" rx="2" fill="#0c0c0c" stroke="' + dim + '"/>' +
        '<circle cx="80" cy="16" r="1.6" fill="' + red + '"/>' +
        '<rect x="40" y="28" width="40" height="4" rx="1" fill="' + red + '" opacity="0.55"/>' +
        '<rect x="40" y="36" width="60" height="3" rx="1" fill="#333"/>' +
        '<rect x="40" y="42" width="52" height="3" rx="1" fill="#2a2a2a"/>' +
        '<path d="M14 78 H146 L152 88 H8 Z" fill="' + fill + '" stroke="' + line + '" stroke-width="1.5"/>' +
        '<rect x="62" y="80" width="36" height="3" rx="1.5" fill="' + dim + '"/>' +
        (kind === 'macbook'
          ? '<text x="80" y="58" text-anchor="middle" fill="#555" font-size="9" font-family="ui-monospace,monospace">⌘</text>'
          : '')
      );
    }
    if (kind === 'mac') {
      return (
        '<rect x="18" y="8" width="124" height="72" rx="8" fill="' + fill + '" stroke="' + line + '" stroke-width="1.5"/>' +
        '<rect x="26" y="16" width="108" height="52" rx="2" fill="#0a0a0a" stroke="' + dim + '"/>' +
        '<circle cx="80" cy="12" r="1.5" fill="' + red + '"/>' +
        '<rect x="36" y="28" width="48" height="5" rx="1" fill="' + red + '" opacity="0.5"/>' +
        '<rect x="36" y="38" width="70" height="3" rx="1" fill="#333"/>' +
        '<rect x="36" y="44" width="58" height="3" rx="1" fill="#2a2a2a"/>' +
        '<rect x="18" y="68" width="124" height="12" fill="#101010"/>' +
        '<circle cx="80" cy="74" r="3" fill="none" stroke="' + red + '" stroke-width="1.2" opacity="0.7"/>' +
        '<path d="M68 80 L80 96 L92 80" fill="none" stroke="' + line + '" stroke-width="2"/>' +
        '<rect x="56" y="96" width="48" height="3" rx="1" fill="' + dim + '"/>'
      );
    }
    return (
      '<rect x="8" y="10" width="92" height="62" rx="4" fill="' + fill + '" stroke="' + line + '" stroke-width="1.5"/>' +
      '<rect x="14" y="16" width="80" height="46" rx="2" fill="#0a0a0a" stroke="' + dim + '"/>' +
      '<rect x="22" y="26" width="36" height="4" rx="1" fill="' + red + '" opacity="0.55"/>' +
      '<rect x="22" y="34" width="52" height="3" rx="1" fill="#333"/>' +
      '<rect x="22" y="40" width="44" height="3" rx="1" fill="#2a2a2a"/>' +
      '<rect x="42" y="72" width="24" height="6" fill="' + dim + '"/>' +
      '<rect x="28" y="78" width="52" height="4" rx="1" fill="' + line + '"/>' +
      '<rect x="112" y="18" width="36" height="66" rx="3" fill="' + fill + '" stroke="' + line + '" stroke-width="1.5"/>' +
      '<rect x="118" y="26" width="24" height="8" rx="1" fill="#0c0c0c" stroke="' + dim + '"/>' +
      '<circle cx="130" cy="48" r="3" fill="none" stroke="' + red + '" stroke-width="1.2"/>' +
      '<circle cx="130" cy="48" r="1.2" fill="' + red + '" opacity="0.9"/>' +
      '<rect x="118" y="58" width="24" height="2" fill="' + dim + '"/>' +
      '<rect x="118" y="64" width="24" height="2" fill="' + dim + '"/>' +
      '<rect x="118" y="70" width="24" height="2" fill="' + dim + '"/>' +
      '<ellipse cx="130" cy="48" rx="10" ry="6" fill="' + glow + '" opacity="0.25"/>'
    );
  }

  function deviceSvg(kind) {
    return (
      '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" role="img">' +
        deviceBodyMarkup(kind) +
      '</svg>'
    );
  }

  function _connLabel(c) {
    if (c === 'bluetooth') return t('sys.connBluetooth');
    if (c === 'usb') return t('sys.connUsb');
    if (c === 'ps2') return t('sys.connPs2');
    if (c === 'built-in') return t('sys.connBuiltIn');
    if (c === 'wireless') return t('sys.connWireless');
    return t('sys.connOther');
  }

  function _summarizeInputs(list) {
    list = list || [];
    if (!list.length) return { text: t('sys.notDetected'), conn: 'other', multi: false, title: '', empty: true };
    function isVirtual(d) {
      var s = ((d && d.instance_id) || '') + ' ' + ((d && d.name) || '');
      return /GVINPUT|GameViewer|AskLink|VIRTUAL|RDP|VMware|vhid/i.test(s);
    }
    var real = list.filter(function (d) { return !isVirtual(d); });
    var pool = real.length ? real : list;
    var ranked = pool.slice().sort(function (a, b) {
      var order = { bluetooth: 0, usb: 1, ps2: 2, 'built-in': 3, other: 4 };
      var sa = order[a.connection] != null ? order[a.connection] : 5;
      var sb = order[b.connection] != null ? order[b.connection] : 5;
      // prefer vendor VID over generic HID names
      var na = /VID_/i.test(a.instance_id || '') ? 0 : 1;
      var nb = /VID_/i.test(b.instance_id || '') ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return na - nb;
    });
    var primary = ranked[0];
    var conn = primary.connection || 'other';
    var names = [];
    var conns = {};
    ranked.forEach(function (d) {
      conns[d.connection || 'other'] = true;
      var n = String(d.name || '').trim();
      if (n && names.indexOf(n) < 0 && names.length < 2) names.push(n);
    });
    var text = _connLabel(conn);
    if (names.length) text += ' · ' + names.join(' / ');
    var nConn = Object.keys(conns).length;
    if (nConn > 1) text += ' (+' + (nConn - 1) + ' more)';
    return {
      text: text,
      conn: conn,
      multi: names.length > 1,
      title: ranked.map(function (d) {
        return _connLabel(d.connection) + ': ' + (d.name || '?');
      }).join('\n'),
    };
  }

  /** Mic / speaker summary. Prefer real OK endpoints over drivers/virtual. */
  var lastHostMics = [];
  function _summarizeNameDevices(list, emptyKey) {
    list = list || [];
    function isVirt(d) {
      if (d && d.virtual) return true;
      var s = String((d && (d.name || d.label)) || '') + ' ' + String((d && d.instance_id) || '');
      return /VIRTUAL|VB-AUDIO|CABLE INPUT|CABLE OUTPUT|STEREO MIX|WHAT U HEAR|NVIDIA VIRTUAL|\bBROADCAST\b/i.test(s);
    }
    function statusOk(d) {
      var st = String((d && d.status) || '').toUpperCase();
      // browser lists have no status → treat as ok; host Unknown ≈ unplugged endpoint
      if (!st) return true;
      return st === 'OK' || st === 'STARTED';
    }
    var okPool = list.filter(statusOk);
    var pool = okPool.length ? okPool : [];
    var real = pool.filter(function (d) { return !isVirt(d); });
    var use = real.length ? real : pool;
    var names = [];
    use.forEach(function (d) {
      var n = String((d && (d.name || d.label)) || '').trim();
      if (n && names.indexOf(n) < 0) names.push(n);
    });
    if (!names.length) {
      return { text: t(emptyKey || 'sys.notDetected'), empty: true, title: '', conn: 'other', status: 'info' };
    }
    var text = names.slice(0, 2).join(' · ');
    if (names.length > 2) text += ' (+' + (names.length - 2) + ')';
    var driverOnly = use.every(function (d) { return d && d.source === 'driver'; });
    var onlyVirtual = !real.length && pool.length > 0;
    // pass = at least one real OK endpoint; warn = driver-only or virtual-only
    var st = (driverOnly || onlyVirtual) ? 'warn' : 'pass';
    var titleBits = names.slice();
    if (driverOnly) titleBits.push('(sound driver — not a playback endpoint)');
    if (onlyVirtual) titleBits.push('(virtual only)');
    return {
      text: text,
      empty: false,
      title: titleBits.join('\n'),
      conn: 'other',
      multi: names.length > 1,
      status: st,
    };
  }

  function _checkById(checks, id) {
    for (var i = 0; i < (checks || []).length; i++) {
      if (checks[i] && checks[i].id === id) return checks[i];
    }
    return null;
  }

  function _pill(status, label) {
    var st = status || 'info';
    return '<span class="sys-pill sys-pill-' + st + '">' + _escHtml(label || st) + '</span>';
  }

  function _val(status, text, opts) {
    opts = opts || {};
    var st = status || 'info';
    var txt = text == null ? '' : String(text);
    var pillLab = opts.pillLabel != null ? opts.pillLabel : statusLabel(st);
    var html = _pill(st, pillLab);
    if (txt) html += '<span class="sys-info-text">' + _escHtml(txt) + '</span>';
    return html;
  }

  function _infoRow(k, vHtml, multi, title) {
    return (
      '<div class="sys-info-row">' +
        '<div class="sys-info-k">' + _escHtml(k) + '</div>' +
        '<div class="sys-info-v' + (multi ? ' is-multi' : '') + '"' +
          (title ? ' title="' + _escHtml(title) + '"' : '') + '>' +
          vHtml +
        '</div>' +
      '</div>'
    );
  }

  function _panel(eyebrow, rowsHtml) {
    return (
      '<div class="sys-info-panel">' +
        '<span class="eyebrow">' + _escHtml(eyebrow) + '</span>' +
        rowsHtml +
      '</div>'
    );
  }

  /**
   * Left: form_factor silhouette. Right: Hardware / Input / Engine panels.
   */
  
  function _skelRow(k) {
    return (
      '<div class="sys-info-row is-skel">' +
        '<div class="sys-info-k">' + _escHtml(k) + '</div>' +
        '<div class="sys-info-v"><span class="sys-skel-bar" aria-hidden="true"></span></div>' +
      '</div>'
    );
  }

  function renderHostSkeleton() {
      var panels = document.getElementById('sys-host-panels');
      if (!panels) return;
      panels.classList.add('is-checking');
      panels.dataset.hasData = '';
      // Slim: Hardware 5 · Input 5 · Engine 3
      panels.innerHTML =
        _panel(
          t('sys.panelHardware'),
          _skelRow(t('sys.cpu')) +
            _skelRow(t('sys.gpu')) +
            _skelRow(t('sys.ram')) +
            _skelRow(t('sys.os')) +
            _skelRow(t('sys.dataDisk'))
        ) +
        _panel(
          t('sys.panelInput'),
          _skelRow(t('sys.keyboard')) +
            _skelRow(t('sys.mouse')) +
            _skelRow(t('sys.microphone')) +
            _skelRow(t('sys.speaker')) +
            _skelRow(t('sys.monitor'))
        ) +
        _panel(
          t('sys.panelEngine'),
          _skelRow(t('sys.psychopy')) +
            _skelRow(t('sys.graphics')) +
            _skelRow(t('sys.runner'))
        );
    }

  /**
   * Run readiness gate (not raw pass/warn/fail counts).
   * run = can arm Start · pilot = Pilot/Autopilot only · block = cannot run.
   */
  function computeRunGate(checks, hostErr, facts) {
    function first(id) {
      return _checkById(checks, id);
    }
    var cApi = first('api_system');
    var cPy = first('psychopy_python');
    var cImp = first('psychopy_import');
    var cRun = first('runner_mode');
    var cGfx = first('psychopy_graphics');
    var cDisk = first('disk_free');
    var disk = (facts && facts.disk) || {};

    if (hostErr || (cApi && cApi.status === 'fail')) {
      return { level: 'block', css: 'fail', label: t('sys.gateBlock'), reason: t('sys.gateReasonApi') };
    }
    if (cPy && cPy.status === 'fail') {
      return { level: 'block', css: 'fail', label: t('sys.gateBlock'), reason: t('sys.gateReasonPython') };
    }
    if (cImp && cImp.status === 'fail') {
      return { level: 'block', css: 'fail', label: t('sys.gateBlock'), reason: t('sys.gateReasonImport') };
    }
    if (cRun && cRun.status === 'fail') {
      return { level: 'block', css: 'fail', label: t('sys.gateBlock'), reason: t('sys.gateReasonRunner') };
    }
    var i, c;
    for (i = 0; i < (checks || []).length; i++) {
      c = checks[i];
      if (c && c.status === 'fail' && c.id !== 'disk_free') {
        var lab = c.label || c.id || '';
        var det = c.detail ? String(c.detail) : '';
        return {
          level: 'block',
          css: 'fail',
          label: t('sys.gateBlock'),
          reason: det ? (lab + ' · ' + det) : lab,
        };
      }
    }

    var mock =
      !!(facts && facts.force_mock) ||
      (cRun && /mock/i.test(String(cRun.detail || cRun.value || '')));
    if (mock) {
      return { level: 'pilot', css: 'warn', label: t('sys.gatePilot'), reason: t('sys.gateReasonMock') };
    }
    if (disk.pending || (cDisk && cDisk.status === 'info' && cDisk.value == null)) {
      return { level: 'pilot', css: 'warn', label: t('sys.gatePilot'), reason: t('sys.gateReasonDisk') };
    }
    if (cGfx && cGfx.status === 'warn') {
      return { level: 'pilot', css: 'warn', label: t('sys.gatePilot'), reason: t('sys.gateReasonGfx') };
    }
    if (cRun && cRun.status === 'warn') {
      return {
        level: 'pilot',
        css: 'warn',
        label: t('sys.gatePilot'),
        reason: cRun.detail || t('sys.gateReasonRunnerWarn'),
      };
    }
    for (i = 0; i < (checks || []).length; i++) {
      c = checks[i];
      if (c && c.status === 'warn') {
        var wlab = c.label || c.id || '';
        var wdet = c.detail ? String(c.detail) : '';
        return {
          level: 'pilot',
          css: 'warn',
          label: t('sys.gatePilot'),
          reason: wdet ? (wlab + ' · ' + wdet) : wlab,
        };
      }
    }
    return { level: 'run', css: 'pass', label: t('sys.gateRun'), reason: t('sys.gateReasonOk') };
  }

  function summaryNodes() {
    var btn = document.getElementById('sys-summary');
    if (!btn) return { btn: null, label: null };
    var label = btn.querySelector('.sys-summary-label') || btn;
    return { btn: btn, label: label };
  }

  function setSummaryBusy(busy) {
    var n = summaryNodes();
    if (!n.btn) return;
    n.btn.disabled = !!busy;
    n.btn.classList.toggle('is-busy', !!busy);
  }

  function paintGate(gate, metaText) {
      var n = summaryNodes();
      var metaInline = document.getElementById('sys-meta-inline');
      var gateWrap = document.getElementById('sys-gate');
      // Chip only; reason on chip title tooltip (no second line).
      if (n.btn) {
        if (!gate || gate.checking) {
          if (n.label) n.label.textContent = t('sys.checking');
          n.btn.className = 'sys-summary status-idle is-checking';
          n.btn.title = t('sys.probing');
          setSummaryBusy(true);
        } else {
          if (n.label) n.label.textContent = gate.label || '—';
          n.btn.className = 'sys-summary status-' + (gate.css || 'idle');
          var reason = gate.reason || gate.label || '';
          n.btn.title = reason
            ? (reason + ' · ' + t('sys.recheckHint'))
            : t('sys.recheckHint');
          setSummaryBusy(false);
        }
      }
      if (gateWrap) {
        var lvl = (gate && gate.level) || (gate && gate.checking ? 'checking' : '');
        gateWrap.dataset.level = lvl || '';
        gateWrap.dataset.css = (gate && gate.css) || (gate && gate.checking ? 'idle' : '');
      }
      if (metaInline && metaText != null) metaInline.textContent = metaText;
    }

function renderDeviceFigure(facts, checks, overall, counts, browserExtra) {
    var card = document.getElementById('sys-device-card');
    var art = document.getElementById('sys-device-art');
    var lab = document.getElementById('sys-device-label');
    var det = document.getElementById('sys-device-detail');
    var panels = document.getElementById('sys-host-panels');
    if (!card || !art) return;

    var ff = (facts && facts.form_factor) || null;
    if (!ff) {
      var ua = navigator.userAgent || '';
      var plat = navigator.platform || '';
      if (/Mac/i.test(plat) || /Mac OS/i.test(ua)) {
        ff = { kind: /MacBook/i.test(ua) ? 'macbook' : 'mac', label: 'Mac', detail: plat };
      } else if (/Win/i.test(plat) || /Windows/i.test(ua)) {
        ff = { kind: 'desktop', label: 'Windows PC', detail: plat };
      } else {
        ff = { kind: 'desktop', label: 'Workstation', detail: plat || 'unknown' };
      }
    }
    var kind = String(ff.kind || 'desktop').toLowerCase();
    if (kind !== 'laptop' && kind !== 'mac' && kind !== 'macbook' && kind !== 'desktop') {
      kind = 'desktop';
    }
    art.innerHTML = deviceSvg(kind);
    card.dataset.kind = kind;
    card.hidden = false;
    if (lab) lab.textContent = ff.label || kind;
    if (det) {
      // foot: model only — no chassis/battery/os clutter
      var model = ff.model ? String(ff.model).trim() : '';
      det.textContent = model;
      det.hidden = !model;
    }

    if (!panels) return;
    var hw = (facts && facts.hardware) || {};
    var be = browserExtra || {};
    var os = (facts && facts.os) || {};

    var cpu = hw.cpu || '—';
    var gpus = (hw.gpus || []).slice();
    // deprioritize virtual display adapters
    function gpuScore(n) {
      var s = String(n || '').toLowerCase();
      if (/virtual|idd|asklink|gameviewer|basic render|microsoft/.test(s)) return 10;
      if (/nvidia|geforce|rtx|gtx|amd|radeon|intel arc|intel\(r\) uhd|iris/.test(s)) return 0;
      return 5;
    }
    gpus.sort(function (a, b) { return gpuScore(a) - gpuScore(b); });
    var realGpus = gpus.filter(function (n) { return gpuScore(n) < 10; });
    var gpuText = (realGpus.length ? realGpus : gpus).slice(0, 2).join(' · ') || '—';
    var ram = hw.ram_gb != null ? (hw.ram_gb + ' GB') : '—';
    var disp = be.displayDetail || '—';
    var refresh = be.refreshHz != null ? ('~' + be.refreshHz + ' Hz') : '—';
    var osText = os.label || ((os.system || '') + (os.release ? (' ' + os.release) : '')) || '—';
    // Hardware: CPU/GPU/RAM/OS + Data disk (row 5). Monitor on Input col.
        var cDisk = _checkById(checks, 'disk_free');
        var diskFacts = (facts && facts.disk) || {};
        var diskRoot = diskFacts.root || '';
        if (diskRoot && diskRoot.length >= 2 && diskRoot.charAt(1) === ':') {
          diskRoot = diskRoot.slice(0, 2); // E:
        }
        var diskFree =
          (diskFacts.free_gb != null)
            ? t('sys.gbFree', { n: diskFacts.free_gb })
            : (cDisk && cDisk.value != null ? t('sys.gbFree', { n: cDisk.value }) : '');
        var diskPath = diskFacts.path || diskFacts.probe_path || '';
        if (!diskPath && cDisk && cDisk.detail && String(cDisk.detail).indexOf('\u00b7') >= 0) {
          diskPath = String(cDisk.detail).split('\u00b7').slice(1).join('\u00b7').trim();
        }
        var diskPending = !!(diskFacts.pending || (cDisk && cDisk.status === 'info' && cDisk.value == null));
        // Pending: short dash only — long "open folder" copy lives in chip title
        var diskText = diskPending
          ? '\u2014'
          : ([diskRoot, diskFree].filter(Boolean).join(' \u00b7 ') || (cDisk && cDisk.detail) || '');
        var diskTitle = diskPending
          ? t('sys.diskTitlePending')
          : ([diskRoot, diskFree, diskPath].filter(Boolean).join(' \u00b7 ') || (cDisk && cDisk.detail) || '');

        var hwRows =
          _infoRow(t('sys.cpu'), _escHtml(cpu), true, cpu) +
          _infoRow(t('sys.gpu'), _escHtml(gpuText), true, gpuText) +
          _infoRow(t('sys.ram'), _escHtml(ram), false) +
          _infoRow(t('sys.os'), _escHtml(osText), false) +
          _infoRow(
            t('sys.dataDisk'),
            cDisk ? _val(cDisk.status, diskText) : '\u2014',
            false,
            diskTitle
          );

        var kb = _summarizeInputs(hw.keyboards);
        var mouse = _summarizeInputs(hw.mice);
        var micList = (hw.microphones && hw.microphones.length) ? hw.microphones : lastHostMics;
        var mic = _summarizeNameDevices(micList, 'builder.ioMicNone');
        var spk = _summarizeNameDevices(hw.speakers || [], 'builder.ioSpkNone');
        var audio = _checkById(checks, 'audio_api'); // still feed I/O cards

        // Monitor row: host probe list → label + W×H; fallback browser display + refresh
        var mons = hw.monitors || [];
        var monParts = [];
        var monTitleParts = [];
        var mi;
        for (mi = 0; mi < mons.length; mi++) {
          var m = mons[mi] || {};
          var wh = (m.width && m.height) ? (m.width + '\u00d7' + m.height) : '';
          var mlab = String(m.label || '').trim();
          if (!mlab) {
            mlab = 'Monitor ' + ((m.index != null ? Number(m.index) : mi) + 1);
            if (m.primary) mlab += ' \u00b7 Primary';
          }
          monParts.push([mlab, wh].filter(Boolean).join(' '));
          monTitleParts.push([mlab, wh, m.device || ''].filter(Boolean).join(' \u00b7 '));
        }
        var monText = monParts.slice(0, 2).join(' \u00b7 ') || disp || '\u2014';
        if (monParts.length > 2) monText += ' \u00b7 +' + (monParts.length - 2);
        var monTitle = monTitleParts.join(' \u00b7 ') || [disp, refresh].filter(function (x) {
          return x && x !== '\u2014';
        }).join(' \u00b7 ') || monText;
        if (refresh && refresh !== '\u2014' && monText.indexOf('Hz') < 0) {
          monText = monText === '\u2014' ? refresh : (monText + ' \u00b7 ' + refresh);
        }

        // Input: KB/Mouse (conn) + Mic/Speaker + Monitor
        var inputRows =
          _infoRow(
            t('sys.keyboard'),
            '<span class="sys-info-text sys-conn-' + _escHtml(kb.conn) + '">' + _escHtml(kb.text) + '</span>',
            false,
            kb.title || kb.text
          ) +
          _infoRow(
            t('sys.mouse'),
            '<span class="sys-info-text sys-conn-' + _escHtml(mouse.conn) + '">' + _escHtml(mouse.text) + '</span>',
            false,
            mouse.title || mouse.text
          ) +
          _infoRow(
            t('sys.microphone'),
            '<span id="sys-input-mic">' +
              (mic.empty
                ? _val('info', mic.text || t('sys.notDetected'), { pillLabel: statusLabel('info') })
                : _val(mic.status || 'pass', mic.text, { pillLabel: statusLabel(mic.status || 'pass') })) +
              '</span>',
            !!mic.multi,
            mic.title || mic.text
          ) +
          _infoRow(
            t('sys.speaker'),
            '<span id="sys-input-spk">' +
              (spk.empty
                ? _val('info', spk.text || t('sys.notDetected'), { pillLabel: statusLabel('info') })
                : _val(spk.status || 'pass', spk.text, { pillLabel: statusLabel(spk.status || 'pass') })) +
              '</span>',
            !!spk.multi,
            spk.title || spk.text
          ) +
          _infoRow(t('sys.monitor'), _escHtml(monText), monParts.length > 1, monTitle);

        var psy = (facts && facts.psychopy) || {};
        var psyPath = (facts && facts.psychopy_python_path) || '';
        var cImp = _checkById(checks, 'psychopy_import');
        var cPy = _checkById(checks, 'psychopy_python');
        var cGfx = _checkById(checks, 'psychopy_graphics');
        var cRun = _checkById(checks, 'runner_mode');

        // PsychoPy row carries version; Python path only in title (no separate long path row)
        var psyText = psy.version
          ? ('v' + psy.version)
          : ((cImp && cImp.detail) || '');
        if (!psyText && cImp && cImp.status === 'fail') {
          psyText = t('sys.gateReasonImport');
        } else if (!psyText && cPy && cPy.status === 'fail') {
          psyText = t('sys.gateReasonPython');
        }
        var psyTitle = [psyText, psyPath || (cPy && cPy.detail) || ''].filter(Boolean).join(' \u00b7 ');
        var gfxRaw = cGfx ? String(cGfx.detail || cGfx.value || '').trim() : '';
        var gfxEmpty = !gfxRaw || /^n\/?a$/i.test(gfxRaw) || gfxRaw === '—';
        var gfxText = gfxEmpty ? t('sys.gfxNa') : gfxRaw;
        var gfxSt = cGfx ? cGfx.status : 'info';
        if (gfxEmpty && (!cGfx || cGfx.status === 'pass' || cGfx.status === 'info')) {
          gfxSt = 'info';
        }
        var gfxTitle = gfxEmpty
          ? t('sys.gfxNaHint')
          : (cGfx && cGfx.detail ? String(cGfx.detail) : gfxText);
        var runText = cRun ? String(cRun.detail || cRun.value || '').trim() : '';
        var runMock = !!(facts && facts.force_mock) || /mock/i.test(runText);
        if (runMock && !runText) runText = t('sys.gateReasonMock');
        var engRows =
          _infoRow(
            t('sys.psychopy'),
            cImp ? _val(cImp.status, psyText) : (cPy ? _val(cPy.status, psyText || cPy.detail || '') : '\u2014'),
            false,
            psyTitle
          ) +
          _infoRow(
            t('sys.graphics'),
            cGfx ? _val(gfxSt, gfxText) : _val('info', t('sys.gfxNa')),
            false,
            gfxTitle
          ) +
          _infoRow(
            t('sys.runner'),
            cRun ? _val(cRun.status, runText || cRun.detail || '') : '\u2014',
            false,
            runMock ? t('sys.gateReasonMock') : (cRun && cRun.detail)
          );

    panels.innerHTML =
          _panel(t('sys.panelHardware'), hwRows) +
          _panel(t('sys.panelInput'), inputRows) +
          _panel(t('sys.panelEngine'), engRows);

        // Host display card — keyboard / mic / speaker status + monitors
                fillDisplayIoStatus(kb, audio, facts);
              }

              function fillDisplayIoStatus(kbSummary, audioCheck, facts) {
                                                  var kbEl = document.getElementById('disp-kb-status');
                                                  var mouseEl = document.getElementById('disp-mouse-status');
                                                  var micEl = document.getElementById('disp-mic-status');
                                                  var spkEl = document.getElementById('disp-spk-status');
                                                  var hw = (facts && facts.hardware) || {};
                                                  function setIoStatus(el, text, pending) {
                                                    if (!el) return;
                                                    var s = text == null ? '' : String(text);
                                                    el.textContent = s;
                                                    el.title = s;
                                                    el.classList.toggle('is-pending', !!pending);
                                                    el.classList.toggle('is-ready', !pending && !!s);
                                                  }

                                                  // Multi-monitor list → Display card select (PsychoPy screen index)
                                                  try {
                                                    var mons = hw.monitors || [];
                                                    if (window.PsyClawBuilder && typeof window.PsyClawBuilder.setHostMonitors === 'function') {
                                                      window.PsyClawBuilder.setHostMonitors(mons);
                                                      if (typeof window.PsyClawBuilder.renderDisplayPanel === 'function') {
                                                        window.PsyClawBuilder.renderDisplayPanel();
                                                      }
                                                    }
                                                  } catch (eMon) { /* ignore */ }

                                                  // Keyboard / mouse / speaker host lists → device selects
                                                  try {
                                                    if (window.PsyClawBuilder && typeof window.PsyClawBuilder.setHostInputDevices === 'function') {
                                                      window.PsyClawBuilder.setHostInputDevices({
                                                        keyboards: hw.keyboards || [],
                                                        mice: hw.mice || [],
                                                        speakers: hw.speakers || [],
                                                      });
                                                    }
                                                  } catch (eIn) { /* ignore */ }

                                                  if (kbEl) {
                                                    var kbs = hw.keyboards || [];
                                                    if (kbs.length) {
                                                      var kbNames = kbs.map(function (k) { return (k && k.name) || ''; }).filter(Boolean);
                                                      kbEl.textContent = kbNames.slice(0, 2).join(' · ') + (kbNames.length > 2 ? ' (+' + (kbNames.length - 2) + ')' : '');
                                                      kbEl.classList.remove('is-pending');
                                                      if (kbSummary && kbSummary.title) kbEl.title = kbSummary.title;
                                                    } else if (kbSummary && !kbSummary.empty && kbSummary.text) {
                                                      kbEl.textContent = kbSummary.text;
                                                      if (kbSummary.title) kbEl.title = kbSummary.title;
                                                      kbEl.classList.remove('is-pending');
                                                    } else {
                                                      kbEl.textContent = t('builder.ioKbNone') || t('sys.notDetected');
                                                      kbEl.classList.add('is-pending');
                                                    }
                                                  }

                                                  if (mouseEl) {
                                                    var mice = hw.mice || [];
                                                    if (mice.length) {
                                                      var mNames = mice.map(function (m) { return (m && m.name) || ''; }).filter(Boolean);
                                                      mouseEl.textContent = mNames.slice(0, 2).join(' · ') + (mNames.length > 2 ? ' (+' + (mNames.length - 2) + ')' : '');
                                                      mouseEl.classList.remove('is-pending');
                                                    } else {
                                                      mouseEl.textContent = t('builder.ioMouseNone') || t('sys.notDetected') || 'No mouse detected';
                                                      mouseEl.classList.add('is-pending');
                                                    }
                                                  }

                                    function pushBrowserAudioLists() {
                                                            if (!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)) {
                                                              if (micEl) {
                                                                var audioDetail0 = audioCheck && (audioCheck.detail || audioCheck.status);
                                                                if (audioDetail0) {
                                                                  setIoStatus(micEl, String(audioDetail0), audioCheck && audioCheck.status === 'fail');
                                                                } else {
                                                                  setIoStatus(micEl, t('builder.ioPending') || 'Probe host to list devices', true);
                                                                }
                                                              }
                                                              if (spkEl && !(hw.speakers && hw.speakers.length)) {
                                                                setIoStatus(spkEl, t('builder.ioPending') || 'Probe host to list devices', true);
                                                              }
                                                              return;
                                                            }
                                                            // Best-effort: unlock device labels (browser hides names until permission once)
                                                            var unlock = Promise.resolve();
                                                            try {
                                                              if (navigator.mediaDevices.getUserMedia) {
                                                                unlock = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                                                                  .then(function (stream) {
                                                                    try { stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (eStop) {}
                                                                  })
                                                                  .catch(function () { /* permission denied — labels may stay generic */ });
                                                              }
                                                            } catch (eUnlock) { /* ignore */ }
                                                            unlock.then(function () {
                                                              return navigator.mediaDevices.enumerateDevices();
                                                            }).then(function (devs) {
                                                              var mics = devs.filter(function (d) { return d.kind === 'audioinput'; })
                                                                .map(function (d) { return { deviceId: d.deviceId, label: d.label || (t('builder.ioMicUnnamed') || 'Microphone'), name: d.label || (t('builder.ioMicUnnamed') || 'Microphone') }; });
                                                              var outs = devs.filter(function (d) { return d.kind === 'audiooutput'; })
                                                                .map(function (d) { return { deviceId: d.deviceId, name: d.label || (t('builder.ioSpkUnnamed') || 'Speaker'), label: d.label || (t('builder.ioSpkUnnamed') || 'Speaker') }; });

                                                              if (window.PsyClawBuilder) {
                                                                if (typeof window.PsyClawBuilder.setHostMics === 'function') {
                                                                  window.PsyClawBuilder.setHostMics(mics);
                                                                }
                                                                // Prefer host Win32 speakers when present; else browser outputs
                                                                if (!(hw.speakers && hw.speakers.length) && typeof window.PsyClawBuilder.setHostInputDevices === 'function') {
                                                                  window.PsyClawBuilder.setHostInputDevices({
                                                                    keyboards: hw.keyboards || [],
                                                                    mice: hw.mice || [],
                                                                    speakers: outs,
                                                                  });
                                                                }
                                                              }

                                                              if (micEl) {
                                                                if (mics.length) {
                                                                  var names = mics.map(function (d) { return d.label || d.name; })
                                                                    .filter(function (n, i, a) { return n && a.indexOf(n) === i; })
                                                                    .slice(0, 2);
                                                                  var line = names.join(' · ');
                                                                  if (mics.length > 2) line += ' (+' + (mics.length - 2) + ')';
                                                                  setIoStatus(micEl, line, false);
                                                                } else {
                                                                  var audioDetail = audioCheck && (audioCheck.detail || audioCheck.status);
                                                                  if (audioDetail) {
                                                                    setIoStatus(micEl, String(audioDetail), audioCheck && audioCheck.status === 'fail');
                                                                  } else {
                                                                    setIoStatus(micEl, t('builder.ioMicNone') || 'No microphone listed', true);
                                                                  }
                                                                }
                                                              }

                                                              // Host Input panel Mic/Speaker rows — same pill+text as Engine checks
                                                              lastHostMics = mics || [];
                                                              var inputMic = document.getElementById('sys-input-mic');
                                                              if (inputMic) {
                                                                var micSum = _summarizeNameDevices(lastHostMics, 'builder.ioMicNone');
                                                                inputMic.innerHTML = micSum.empty
                                                                  ? _val('info', micSum.text || t('sys.notDetected'))
                                                                  : _val('pass', micSum.text);
                                                                var micV = inputMic.parentElement;
                                                                if (micV) micV.title = micSum.title || micSum.text || '';
                                                              }
                                                              var inputSpk = document.getElementById('sys-input-spk');
                                                              if (inputSpk) {
                                                                var hostSpkForInput = (hw.speakers && hw.speakers.length) ? hw.speakers : outs;
                                                                var spkSum = _summarizeNameDevices(hostSpkForInput, 'builder.ioSpkNone');
                                                                inputSpk.innerHTML = spkSum.empty
                                                                  ? _val('info', spkSum.text || t('sys.notDetected'))
                                                                  : _val(spkSum.status || 'pass', spkSum.text);
                                                                var spkV = inputSpk.parentElement;
                                                                if (spkV) spkV.title = spkSum.title || spkSum.text || '';
                                                              }

                                                              if (spkEl) {
                                                                var hostSpk = hw.speakers || [];
                                                                if (hostSpk.length) {
                                                                  var sn = hostSpk.map(function (s) { return (s && s.name) || t('builder.ioSpkUnnamed') || 'Speaker'; })
                                                                    .filter(function (n, i, a) { return n && a.indexOf(n) === i; })
                                                                    .slice(0, 2);
                                                                  var sline = sn.join(' · ');
                                                                  if (hostSpk.length > 2) sline += ' (+' + (hostSpk.length - 2) + ')';
                                                                  setIoStatus(spkEl, sline, false);
                                                                } else if (outs.length) {
                                                                  var onames = outs.map(function (d) { return d.label || d.name; })
                                                                    .filter(function (n, i, a) { return n && a.indexOf(n) === i; })
                                                                    .slice(0, 2);
                                                                  var oline = onames.join(' · ');
                                                                  if (outs.length > 2) oline += ' (+' + (outs.length - 2) + ')';
                                                                  setIoStatus(spkEl, oline, false);
                                                                } else {
                                                                  setIoStatus(spkEl, t('builder.ioSpkNone') || 'No speaker / sound device listed', true);
                                                                }
                                                              }
                                                            }).catch(function () {
                                                              if (micEl) {
                                                                var audioDetail = audioCheck && (audioCheck.detail || audioCheck.status);
                                                                if (audioDetail) {
                                                                  setIoStatus(micEl, String(audioDetail), false);
                                                                } else {
                                                                  setIoStatus(micEl, t('builder.ioMicNone') || 'No microphone listed', true);
                                                                }
                                                              }
                                                              if (spkEl) {
                                                                var hostSpk2 = hw.speakers || [];
                                                                if (hostSpk2.length) {
                                                                  setIoStatus(spkEl, hostSpk2.map(function (s) { return s.name; }).filter(Boolean).slice(0, 2).join(' · '), false);
                                                                } else {
                                                                  setIoStatus(spkEl, t('builder.ioSpkNone') || 'No speaker / sound device listed', true);
                                                                }
                                                              }
                                                            });
                                                          }

                                    // speakers from host probe immediately
                                    if (spkEl) {
                                      var hostSpk0 = hw.speakers || [];
                                      if (hostSpk0.length) {
                                        var sn0 = hostSpk0.map(function (s) { return (s && s.name) || 'Speaker'; })
                                          .filter(function (n, i, a) { return n && a.indexOf(n) === i; })
                                          .slice(0, 2);
                                        setIoStatus(spkEl, sn0.join(' · ') + (hostSpk0.length > 2 ? ' (+' + (hostSpk0.length - 2) + ')' : ''), false);
                                      }
                                    }

                                    pushBrowserAudioLists();
                                            }

                  async function runSystemChecks() {
    var allEl = document.getElementById('sys-checks-all')
      || document.getElementById('sys-checks-host');
    var overallEl = document.getElementById('sys-overall');
    var elapsedEl = document.getElementById('sys-elapsed');
    var checkedEl = document.getElementById('sys-checked-at');
    var metaInline = document.getElementById('sys-meta-inline');
    var reportEl = document.getElementById('sys-report');

    var myGen = ++systemCheckGen;
    paintGate({ checking: true }, '…');
        if (allEl) allEl.innerHTML = '<li class="sys-check sys-check-info"><span class="sys-badge">…</span><div>' + t('sys.probing') + '</div></li>';
        // Keep host card visible; always skeleton while probing (no leftover pass pills)
        var devCard = document.getElementById('sys-device-card');
        if (devCard) {
          devCard.hidden = false;
          var lab = document.getElementById('sys-device-label');
          if (lab) lab.textContent = t('sys.checking');
          renderHostSkeleton();
        }

        try {

        var hostReport = null;
        var hostErr = null;
        var expPath = '';
        try {
          var Bpath = window.PsyClawBuilder;
          if (Bpath && Bpath.getProjectPath) expPath = Bpath.getProjectPath() || '';
        } catch (e0) { expPath = ''; }
        try {
          var sysUrl = '/api/system' + (expPath ? ('?path=' + encodeURIComponent(expPath)) : '');
          var r = await fetch(sysUrl);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          hostReport = await r.json();
          if (myGen !== systemCheckGen) {
            return { stale: true };
          }
        } catch (e) {
          hostErr = e;
          hostReport = {
            overall: 'fail',
            counts: { fail: 1 },
            checks: [{
              id: 'api_system',
              label: 'API / server',
              group: 'runtime',
              status: 'fail',
              detail: String(e && e.message ? e.message : e),
            }],
            facts: {},
            elapsed_ms: 0,
          };
        }

    var all = (hostReport.checks || []).slice();
    if (!hostErr) {
      all.unshift({
        id: 'api_system',
        label: 'API / server',
        group: 'runtime',
        status: 'pass',
        detail: 'GET /api/system ok · ' + (hostReport.elapsed_ms || 0) + ' ms',
      });
    }

    var hwList = hardwareChecks();
    try {
      var rr = await estimateRefreshRate(24);
      hwList.unshift({
        id: 'refresh_rate',
        label: 'Refresh (est.)',
        group: 'hardware',
        status: rr.hz >= 50 ? 'pass' : 'warn',
        detail: '~' + rr.hz + ' Hz · frame ' + rr.median_ms + ' ms (RT timing)',
        value: rr,
      });
    } catch (e) {
      hwList.unshift({
        id: 'refresh_rate',
        label: 'Refresh (est.)',
        group: 'hardware',
        status: 'warn',
        detail: 'could not measure',
      });
    }

    // Single list: engine → runtime/data → hardware (stable order)
    var order = { engine: 0, runtime: 1, host: 1, hardware: 2 };
    var merged = all.concat(hwList).sort(function (a, b) {
      var ga = order[a.group] != null ? order[a.group] : 9;
      var gb = order[b.group] != null ? order[b.group] : 9;
      if (ga !== gb) return ga - gb;
      return 0;
    });

    renderCheckList(allEl, merged);

    var counts = { pass: 0, warn: 0, fail: 0, info: 0 };
    merged.forEach(function (c) {
      var st = c.status || 'info';
      counts[st] = (counts[st] || 0) + 1;
    });
    var overall = counts.fail ? 'fail' : (counts.warn ? 'warn' : 'pass');

    // centered form-factor hub + health callouts
    var refreshC = null;
    var displayC = null;
    merged.forEach(function (c) {
      if (c && c.id === 'refresh_rate') refreshC = c;
      if (c && c.id === 'display') displayC = c;
    });
    var browserExtra = {
          refreshHz: refreshC && refreshC.value && refreshC.value.hz != null ? refreshC.value.hz : null,
          displayDetail: displayC ? displayC.detail : null,
        };
        try {
          if (window.PsyClawBuilder && typeof window.PsyClawBuilder.setHostRefreshHz === 'function') {
            window.PsyClawBuilder.setHostRefreshHz(browserExtra.refreshHz);
          }
        } catch (eHz) { /* ignore */ }
        renderDeviceFigure((hostReport && hostReport.facts) || {}, merged, overall, counts, browserExtra);
        var hostPanels = document.getElementById('sys-host-panels');
        if (hostPanels) {
          hostPanels.dataset.hasData = '1';
          hostPanels.classList.remove('is-checking');
        }

            // cache for disk-only refresh after experiment folder is chosen
                        lastSystemSnapshot = {
                          facts: (hostReport && hostReport.facts) || {},
                          checks: merged,
                          overall: overall,
                          counts: counts,
                          browserExtra: browserExtra,
                        };
                        lastDiskPathKey = expPath ? String(expPath) : '';

                        // Re-bind Data disk if a project folder is open (full probe may have been path-less)
                        var pathNow = expPath || '';
                        try {
                          var B2 = window.PsyClawBuilder;
                          if (B2 && B2.getProjectPath) pathNow = B2.getProjectPath() || pathNow;
                        } catch (eP) { /* keep pathNow */ }
                        if (pathNow) {
                          lastDiskPathKey = '';
                          (async function (p) {
                            try {
                              var rd = await fetch('/api/system/disk?path=' + encodeURIComponent(p));
                              if (!rd.ok) return;
                              var dj = await rd.json();
                              if (!lastSystemSnapshot) return;
                              if (dj.facts && dj.facts.disk) {
                                lastSystemSnapshot.facts = lastSystemSnapshot.facts || {};
                                lastSystemSnapshot.facts.disk = dj.facts.disk;
                              }
                              if (dj.check) {
                                var chs = lastSystemSnapshot.checks || [];
                                var hit = false;
                                for (var di = 0; di < chs.length; di++) {
                                  if (chs[di] && chs[di].id === 'disk_free') {
                                    chs[di] = dj.check;
                                    hit = true;
                                    break;
                                  }
                                }
                                if (!hit) chs.push(dj.check);
                                lastSystemSnapshot.checks = chs;
                              }
                              lastDiskPathKey = String(p);
                              renderDeviceFigure(
                                lastSystemSnapshot.facts || {},
                                lastSystemSnapshot.checks || [],
                                lastSystemSnapshot.overall,
                                lastSystemSnapshot.counts,
                                lastSystemSnapshot.browserExtra
                              );
                              var hp = document.getElementById('sys-host-panels');
                              if (hp) hp.dataset.hasData = '1';
                            } catch (eDisk) { /* ignore */ }
                          })(pathNow);
                        }

                        if (myGen !== systemCheckGen) {
                          return { overall: overall, counts: counts, stale: true };
                        }
                        var gate = computeRunGate(merged, hostErr, (hostReport && hostReport.facts) || {});
                        var hostPanelsDone = document.getElementById('sys-host-panels');
                        if (hostPanelsDone) hostPanelsDone.classList.remove('is-checking');

                        var ts = hostReport.checked_at ? new Date(hostReport.checked_at * 1000) : new Date();
                        var metaLine =
                          (hostReport.elapsed_ms != null ? hostReport.elapsed_ms + ' ms' : '—') +
                          ' · ' + ts.toLocaleTimeString();
                        paintGate(gate, metaLine);

                        if (overallEl) overallEl.textContent = (gate.level || overall) + (hostErr ? t('sys.apiError') : '');
                        if (elapsedEl) elapsedEl.textContent = (hostReport.elapsed_ms != null ? hostReport.elapsed_ms + ' ms host' : '—');
                        if (checkedEl) checkedEl.textContent = ts.toLocaleTimeString();
                        if (reportEl) {
                          try {
                            reportEl.textContent = JSON.stringify({
                              gate: gate,
                              overall: overall,
                              counts: counts,
                              host: hostReport,
                              hardware: hwList,
                            }, null, 2);
                          } catch (e) {
                            reportEl.textContent = String(e);
                          }
                        }
                        lastSystemSnapshot.gate = gate;
                        return { overall: overall, counts: counts, gate: gate };
        } catch (eSys) {
          console.error('runSystemChecks', eSys);
          paintGate(
            { level: 'block', css: 'fail', label: t('sys.gateBlock'), reason: String(eSys && eSys.message ? eSys.message : eSys) },
            '—'
          );
          return { overall: 'fail', counts: { fail: 1 }, error: eSys };
        } finally {
          // only the latest probe owns the busy chrome
          if (myGen === systemCheckGen) {
            var hp = document.getElementById('sys-host-panels');
            if (hp) hp.classList.remove('is-checking');
          }
        }
                      }

  function wireSystemTab() {
    // Hover long detail: wheel/trackpad pans horizontally without scrollbar UI
    var sysTab = document.getElementById('tab-system');
    if (sysTab && !sysTab.dataset.detailPanBound) {
      sysTab.dataset.detailPanBound = '1';
      sysTab.addEventListener('wheel', function (e) {
        var detail = e.target.closest ? e.target.closest('.sys-check-detail') : null;
        if (!detail) {
          var check = e.target.closest ? e.target.closest('.sys-check') : null;
          if (check) detail = check.querySelector('.sys-check-detail');
        }
        if (!detail) return;
        if (detail.scrollWidth <= detail.clientWidth + 1) return;
        var dx = e.deltaX || 0;
        var dy = e.deltaY || 0;
        // convert vertical wheel to horizontal pan when detail overflows
        var delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (!delta) return;
        var prev = detail.scrollLeft;
        detail.scrollLeft += delta;
        if (detail.scrollLeft !== prev) {
          e.preventDefault();
        }
      }, { passive: false });
    }

    // Keyboard arm — reaction time from Arm → keydown
    var keyArm = document.getElementById('sys-key-arm');
    var keyResult = document.getElementById('sys-key-result');
    var keyCard = document.getElementById('probe-keyboard');
    var armed = false;
    var armHandler = null;

    function disarmKey() {
      armed = false;
      if (armHandler) {
        window.removeEventListener('keydown', armHandler, true);
        armHandler = null;
      }
      if (keyCard) keyCard.classList.remove('is-armed');
      if (keyArm) keyArm.textContent = t('sys.kbArm');
    }

    if (keyArm) {
      keyArm.addEventListener('click', function () {
        if (armed) {
          disarmKey();
          if (keyResult) keyResult.textContent = t('sys.disarmed');
          return;
        }
        armed = true;
        if (keyCard) keyCard.classList.add('is-armed');
        if (keyArm) keyArm.textContent = t('sys.waitingCancel');
        if (keyResult) keyResult.textContent = t('sys.armedKey');
        var t0 = performance.now();
        armHandler = function (ev) {
          var dt = Math.round((performance.now() - t0) * 10) / 10;
          if (keyResult) {
            keyResult.textContent =
              'key=' + (ev.key || '?') +
              ' code=' + (ev.code || '?') +
              ' · RT ' + dt + ' ms';
          }
          disarmKey();
        };
        window.addEventListener('keydown', armHandler, true);
      });
    }

    // Mouse arm — reaction time from Arm → next click (button + coords)
    var mouseArm = document.getElementById('sys-mouse-arm');
    var mouseResult = document.getElementById('sys-mouse-result');
    var mouseCard = document.getElementById('probe-mouse');
    var mouseArmed = false;
    var mouseHandler = null;

    function disarmMouse() {
      mouseArmed = false;
      if (mouseHandler) {
        window.removeEventListener('pointerdown', mouseHandler, true);
        mouseHandler = null;
      }
      if (mouseCard) mouseCard.classList.remove('is-armed');
      if (mouseArm) mouseArm.textContent = t('sys.mouseArm');
    }

    if (mouseArm) {
      mouseArm.addEventListener('click', function (e) {
        e.stopPropagation();
        if (mouseArmed) {
          disarmMouse();
          if (mouseResult) mouseResult.textContent = t('sys.disarmed');
          return;
        }
        mouseArmed = true;
        if (mouseCard) mouseCard.classList.add('is-armed');
        if (mouseArm) mouseArm.textContent = t('sys.waitingCancel');
        if (mouseResult) mouseResult.textContent = t('sys.armedMouse');
        var t0 = performance.now();
        // ignore the arming click itself (next event)
        var skip = true;
        mouseHandler = function (ev) {
          if (skip) {
            skip = false;
            return;
          }
          var dt = Math.round((performance.now() - t0) * 10) / 10;
          var btn = ev.button === 0 ? 'L' : (ev.button === 2 ? 'R' : String(ev.button));
          var x = Math.round(ev.clientX);
          var y = Math.round(ev.clientY);
          if (mouseResult) {
            mouseResult.textContent =
              'btn=' + btn + ' @ ' + x + ',' + y +
              ' · RT ' + dt + ' ms' +
              (ev.pointerType ? ' · ' + ev.pointerType : '');
          }
          disarmMouse();
        };
        window.addEventListener('pointerdown', mouseHandler, true);
      });
    }

    // Audio beep
    var audioBtn = document.getElementById('sys-audio-beep');
    var audioResult = document.getElementById('sys-audio-result');
    if (audioBtn) {
      audioBtn.addEventListener('click', function () {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) throw new Error('no AudioContext');
          var ctx = new AC();
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 440;
          gain.gain.value = 0.08;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
          osc.stop(ctx.currentTime + 0.26);
          setTimeout(function () { try { ctx.close(); } catch (e) {} }, 400);
          if (audioResult) audioResult.textContent = t('sys.playedTone');
        } catch (e) {
          if (audioResult) audioResult.textContent = t('sys.fail', { msg: (e.message || e) });
        }
      });
    }

    // Fullscreen
    var fsBtn = document.getElementById('sys-fs-btn');
    var fsResult = document.getElementById('sys-fs-result');
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        try {
          if (!document.fullscreenElement) {
            var req = document.documentElement.requestFullscreen ||
              document.documentElement.webkitRequestFullscreen;
            if (!req) throw new Error('API missing');
            req.call(document.documentElement).then(function () {
              if (fsResult) fsResult.textContent = t('sys.fsOn');
            }).catch(function (e) {
              if (fsResult) fsResult.textContent = t('sys.denied', { msg: (e.message || e) });
            });
          } else {
            var exit = document.exitFullscreen || document.webkitExitFullscreen;
            exit.call(document).then(function () {
              if (fsResult) fsResult.textContent = t('sys.fsOff');
            });
          }
        } catch (e) {
          if (fsResult) fsResult.textContent = t('sys.fail', { msg: (e.message || e) });
        }
      });
      document.addEventListener('fullscreenchange', function () {
        if (fsResult) {
          fsResult.textContent = document.fullscreenElement ? t('sys.fsOn') : t('sys.fsOff');
        }
      });
    }

    // System probe: first load + Re-run only (not every System tab click)
            // Data disk free is bound to Builder experiment folder path.
            var systemCheckedOnce = false;
            var pendingDiskPath = '';

            function getExperimentPath() {
              try {
                var B = window.PsyClawBuilder;
                if (B && B.getProjectPath) {
                  var p = B.getProjectPath();
                  return p ? String(p) : '';
                }
              } catch (e) { /* ignore */ }
              return '';
            }

            function applyDiskToSnapshot(diskPayload) {
              if (!diskPayload) return;
              // If full probe not ready yet, seed a minimal snapshot so the row can paint
              if (!lastSystemSnapshot) {
                lastSystemSnapshot = {
                  facts: {},
                  checks: [],
                  overall: 'info',
                  counts: {},
                  browserExtra: {},
                };
              }
              var check = diskPayload.check;
              var diskFacts = (diskPayload.facts && diskPayload.facts.disk) || null;
              if (diskFacts) {
                lastSystemSnapshot.facts = lastSystemSnapshot.facts || {};
                lastSystemSnapshot.facts.disk = diskFacts;
              }
              if (check) {
                var checks = lastSystemSnapshot.checks || [];
                var found = false;
                for (var i = 0; i < checks.length; i++) {
                  if (checks[i] && checks[i].id === 'disk_free') {
                    checks[i] = check;
                    found = true;
                    break;
                  }
                }
                if (!found) checks.push(check);
                lastSystemSnapshot.checks = checks;
              }
              // only repaint host panels if they exist
              var panels = document.getElementById('sys-host-panels');
              if (panels && panels.dataset.hasData) {
                renderDeviceFigure(
                  lastSystemSnapshot.facts || {},
                  lastSystemSnapshot.checks || [],
                  lastSystemSnapshot.overall,
                  lastSystemSnapshot.counts,
                  lastSystemSnapshot.browserExtra
                );
              } else if (panels && lastSystemSnapshot.facts && lastSystemSnapshot.facts.disk) {
                // host card may already be painted with pending — repaint if we have any data
                try {
                  renderDeviceFigure(
                    lastSystemSnapshot.facts || {},
                    lastSystemSnapshot.checks || [],
                    lastSystemSnapshot.overall,
                    lastSystemSnapshot.counts,
                    lastSystemSnapshot.browserExtra
                  );
                  panels.dataset.hasData = '1';
                } catch (eR) { /* ignore */ }
              }
              // disk pending/cleared can change Pilot vs participant gate
              try {
                if (lastSystemSnapshot.checks && lastSystemSnapshot.checks.length) {
                  var g2 = computeRunGate(
                    lastSystemSnapshot.checks,
                    false,
                    lastSystemSnapshot.facts || {}
                  );
                  lastSystemSnapshot.gate = g2;
                  lastSystemSnapshot.overall = g2.css === 'fail' ? 'fail' : (g2.css === 'warn' ? 'warn' : 'pass');
                  var metaEl = document.getElementById('sys-meta-inline');
                  paintGate(g2, metaEl ? metaEl.textContent : null);
                }
              } catch (eG) { /* ignore */ }
            }

            async function refreshDiskForExperimentPath(path, force) {
              var key = path ? String(path) : '';
              if (!key) {
                pendingDiskPath = '';
                // clear to pending state when no project
                if (lastSystemSnapshot) {
                  applyDiskToSnapshot({
                    facts: {
                      disk: {
                        path: null, probe_path: null, root: null,
                        free_gb: null, total_gb: null, pending: true,
                      },
                    },
                    check: {
                      id: 'disk_free',
                      label: 'Disk free (data)',
                      group: 'runtime',
                      status: 'info',
                      detail: 'Open experiment folder in Builder first',
                      value: null,
                    },
                  });
                }
                lastDiskPathKey = '';
                return;
              }
              if (!force && key === lastDiskPathKey) return;
              lastDiskPathKey = key;
              pendingDiskPath = key;
              try {
                var url = '/api/system/disk?path=' + encodeURIComponent(key);
                var r = await fetch(url);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var j = await r.json();
                applyDiskToSnapshot(j);
              } catch (e) {
                /* leave previous disk row */
              }
            }

            function ensureSystemChecked(force) {
              if (force || !systemCheckedOnce) {
                systemCheckedOnce = true;
                runSystemChecks();
              }
            }
            var summaryBtn = document.getElementById('sys-summary');
            if (summaryBtn) {
              summaryBtn.addEventListener('click', function () {
                if (summaryBtn.disabled || summaryBtn.classList.contains('is-busy')) return;
                ensureSystemChecked(true);
              });
            }
            // first page load
            setTimeout(function () { ensureSystemChecked(false); }, 0);

            // when Builder Open/New/Save sets experiment folder → probe that volume only
            function onExperimentPathChanged(ev) {
              var path =
                (ev && ev.detail && (ev.detail.path || ev.detail.projectDir)) ||
                getExperimentPath();
              refreshDiskForExperimentPath(path || '', true);
            }
            document.addEventListener('psyclaw:file-state', onExperimentPathChanged);
            document.addEventListener('psyclaw:project-opened', onExperimentPathChanged);
          }

  // ---------------------------------------------------------------
  // Run tab
  // ---------------------------------------------------------------


  window.PsyClawSystem = {
    wire: wireSystemTab,
    getSnapshot: function () { return lastSystemSnapshot; },
    refreshHostUI: function () {
      if (lastSystemSnapshot && typeof renderDeviceFigure === 'function') {
        renderDeviceFigure(
          lastSystemSnapshot.facts,
          lastSystemSnapshot.checks,
          lastSystemSnapshot.overall,
          lastSystemSnapshot.counts,
          lastSystemSnapshot.browserExtra
        );
      }
    },
    recheck: typeof runSystemChecks === 'function' ? runSystemChecks : null,
  };
})();
