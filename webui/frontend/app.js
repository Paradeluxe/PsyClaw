/* psyclaw-webui SPA shell
 *
 * Tabs: Builder (design.json) · System (hardware preflight) · Run
 * Form / yaml preset UI removed — Run always prefers Builder design.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  var tabButtons = document.querySelectorAll('.tab-btn');
    var tabPanels = document.querySelectorAll('.tab-panel');

    // System tab cache — disk free rebinds when Builder sets experiment folder
    var lastSystemSnapshot = null; // { facts, checks, overall, counts, browserExtra, gate }
    var systemCheckGen = 0; // ignore stale concurrent runSystemChecks
    var lastDiskPathKey = null;

  // ---------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------
  function activateTab(name) {
    tabButtons.forEach(function (btn) {
      var match = btn.dataset.tab === name;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });
    tabPanels.forEach(function (panel) {
      var match = panel.id === 'tab-' + name;
      panel.classList.toggle('active', match);
      if (match) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
  }

  tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activateTab(btn.dataset.tab);
      });
    });

    // ---------------------------------------------------------------
    // Footer network status — green square lamp · online / offline
    // Uses navigator.onLine + /api/health (backend reachability).
    // ---------------------------------------------------------------
    var netStatusEl = document.getElementById('net-status');
    var netProbeTimer = null;
    var lastNetState = null; // 'online' | 'offline' | 'backendDown' | 'checking'

    function paintNetStatus(state) {
      if (!netStatusEl) return;
      lastNetState = state;
      netStatusEl.classList.remove('is-offline', 'is-checking', 'error');
      if (state === 'online') {
        netStatusEl.textContent = t('footer.online');
      } else if (state === 'offline') {
        netStatusEl.classList.add('is-offline', 'error');
        netStatusEl.textContent = t('footer.offline');
      } else if (state === 'backendDown') {
        netStatusEl.classList.add('is-offline', 'error');
        netStatusEl.textContent = t('footer.backendDown');
      } else {
        netStatusEl.classList.add('is-checking');
        netStatusEl.textContent = t('footer.checking');
      }
    }

    async function probeNetwork() {
      if (!netStatusEl) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        paintNetStatus('offline');
        return;
      }
      try {
        var r = await fetch('/api/health', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await r.json();
        paintNetStatus('online');
      } catch (e) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          paintNetStatus('offline');
        } else {
          paintNetStatus('backendDown');
        }
      }
    }

    function wireNetStatus() {
      if (!netStatusEl) return;
      paintNetStatus('checking');
      probeNetwork();
      if (typeof window !== 'undefined') {
        window.addEventListener('online', function () { probeNetwork(); });
        window.addEventListener('offline', function () { paintNetStatus('offline'); });
      }
      if (netProbeTimer) clearInterval(netProbeTimer);
      netProbeTimer = setInterval(probeNetwork, 15000);
    }

    document.addEventListener('psyclaw:langchange', function () {
      if (lastNetState) paintNetStatus(lastNetState);
    });

    // ---------------------------------------------------------------
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

  function paintGate(gate, metaText) {
      var summaryEl = document.getElementById('sys-summary');
      var reasonEl = document.getElementById('sys-gate-reason');
      var metaInline = document.getElementById('sys-meta-inline');
      var gateWrap = document.getElementById('sys-gate');
      // Chip + visible reason (reason also on chip title for hover).
      if (summaryEl) {
        if (!gate || gate.checking) {
          summaryEl.textContent = t('sys.checking');
          summaryEl.className = 'sys-summary status-idle is-checking';
          summaryEl.title = t('sys.probing');
        } else {
          summaryEl.textContent = gate.label || '—';
          summaryEl.className = 'sys-summary status-' + (gate.css || 'idle');
          summaryEl.title = gate.reason || gate.label || '';
        }
      }
      if (reasonEl) {
        if (!gate || gate.checking) {
          reasonEl.textContent = t('sys.probing');
          reasonEl.title = t('sys.probing');
          reasonEl.hidden = false;
          reasonEl.className = 'sys-gate-reason muted is-checking';
        } else {
          var why = (gate.reason || '').trim();
          reasonEl.textContent = why || '';
          reasonEl.title = why || '';
          reasonEl.hidden = !why;
          reasonEl.className = 'sys-gate-reason muted status-' + (gate.css || 'idle');
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
    var summaryEl = document.getElementById('sys-summary');
    var overallEl = document.getElementById('sys-overall');
    var elapsedEl = document.getElementById('sys-elapsed');
    var checkedEl = document.getElementById('sys-checked-at');
    var metaInline = document.getElementById('sys-meta-inline');
    var reportEl = document.getElementById('sys-report');
    var rerunBtn = document.getElementById('sys-rerun-btn');

    var myGen = ++systemCheckGen;
    paintGate({ checking: true }, '…');
        if (allEl) allEl.innerHTML = '<li class="sys-check sys-check-info"><span class="sys-badge">…</span><div>' + t('sys.probing') + '</div></li>';
        if (rerunBtn) {
          rerunBtn.disabled = true;
          rerunBtn.classList.add('is-busy');
        }
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
                        if (rerunBtn) {
                          rerunBtn.disabled = false;
                          rerunBtn.classList.remove('is-busy');
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
            var rb = document.getElementById('sys-rerun-btn');
            if (rb) {
              rb.disabled = false;
              rb.classList.remove('is-busy');
            }
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
            var rerun = document.getElementById('sys-rerun-btn');
            if (rerun) {
              rerun.addEventListener('click', function () { ensureSystemChecked(true); });
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
  function wireRunTab() {
      var startBtn = document.getElementById('start-run-btn');
      var stopBtn = document.getElementById('stop-run-btn');
      var downloadBtn = document.getElementById('download-csv-btn');
      if (!startBtn) return;

      var statusBadge = document.getElementById('run-status-badge');
      var runProgress = document.getElementById('run-progress');
      var runIdEl = document.getElementById('run-id');
      var runParadigmEl = document.getElementById('run-paradigm');
      var runStartedEl = document.getElementById('run-started');
      var runElapsedEl = document.getElementById('run-elapsed');
      var runLog = document.getElementById('run-log');
      var runSessionChip = document.getElementById('run-session-chip');
      var elPart = document.getElementById('run-participant');
            var elName = document.getElementById('run-participant-name');
            var elSess = document.getElementById('run-session-n');
            var elTs = document.getElementById('run-session-timestamp');
            var elUid = document.getElementById('run-session-uid');
            var elExp = document.getElementById('run-experimenter');
            var elNotes = document.getElementById('run-notes');

            function formatLocalTimestamp(d) {
              d = d || new Date();
              var yyyy = d.getFullYear();
              var mm = String(d.getMonth() + 1).padStart(2, '0');
              var dd = String(d.getDate()).padStart(2, '0');
              var hh = String(d.getHours()).padStart(2, '0');
              var mi = String(d.getMinutes()).padStart(2, '0');
              var ss = String(d.getSeconds()).padStart(2, '0');
              return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi + ':' + ss;
            }


            /** Unique experiment id: YYYYMMDD_<8hex> — date + short hash */
            function makeExpUid(d) {
              d = d || new Date();
              var yyyy = d.getFullYear();
              var mm = String(d.getMonth() + 1).padStart(2, '0');
              var dd = String(d.getDate()).padStart(2, '0');
              var hex = '';
              try {
                if (window.crypto && crypto.getRandomValues) {
                  var buf = new Uint8Array(4);
                  crypto.getRandomValues(buf);
                  for (var i = 0; i < buf.length; i++) {
                    hex += buf[i].toString(16).padStart(2, '0');
                  }
                }
              } catch (e) { /* fall through */ }
              if (!hex || hex.length < 8) {
                hex = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
              }
              return yyyy + mm + dd + '_' + hex.slice(0, 8);
            }

            function refreshExpUid(force) {
              if (!elUid) return '';
              if (force || !elUid.value) {
                elUid.value = makeExpUid();
              }
              return elUid.value;
            }

            function tickTimestamp() {
              if (elTs) elTs.value = formatLocalTimestamp();
            }
            tickTimestamp();
            setInterval(tickTimestamp, 1000);
            refreshExpUid(true);

            var pollTimer = null;
            var currentRunId = null;
            var lastArmMode = null;
            var pollStartTime = null;
            var elapsedTimer = null;

            function setLockedParticipantId(id) {
                                      if (!elPart) return;
                                      var v = String(id || '').trim() || 'P01';
                                      elPart.value = v;
                                    }

                                    function readSession() {
                                      var custom = readExtraCustom();
                                      // keep displayed UID (armRun refreshes before read)
                                      var uid = refreshExpUid(false) || makeExpUid();
                                      var sess = {
                                        // ID locked: always sequential from registry (never free-typed)
                                        participant_id: ((elPart && elPart.value) || 'P01').trim() || 'P01',
                                        participant_name: ((elName && elName.value) || '').trim(),
                                        session: ((elSess && elSess.value) || '1').trim() || '1',
                                        // timestamp locked: stamp at arm time (UI live clock is display only)
                                        date: formatLocalTimestamp(),
                                        // unique experiment id (date + hash)
                                        uid: uid,
                                        experimenter: ((elExp && elExp.value) || '').trim(),
                                        notes: ((elNotes && elNotes.value) || '').trim(),
                                      };
                                      if (custom && Object.keys(custom).length) sess.custom = custom;
                                      return sess;
                                    }

                        var LAST_INSTR_KEY = 'psyclaw.lastInstrument';
                        var LAST_PILOT_KEY_LEGACY = 'psyclaw.lastPilotInstrument';
                                                var EXTRA_FIELDS_KEY = 'psyclaw.sessionExtraFields';
                                                var hintEl = document.getElementById('run-participant-hint');
                        var rosterBody = document.getElementById('run-roster-body');
                        var rosterSummary = document.getElementById('run-roster-summary');
                        var extraList = document.getElementById('run-extra-list');
                        var extraAddBtn = document.getElementById('run-extra-add');
                        // [{ id, key, label, value }]
                        var extraFields = [];

                        function slugKey(label) {
                          var s = String(label || '').trim().toLowerCase()
                            .replace(/[^a-z0-9_]+/g, '_')
                            .replace(/^_+|_+$/g, '');
                          if (!s || !/^[a-z_]/.test(s)) s = 'field_' + (s || 'x');
                          s = s.replace(/[^a-z0-9_]/g, '');
                          if (!s) s = 'field_x';
                          return s.slice(0, 40);
                        }

                        function extraStorageKey() {
                          var path = projectPath() || '__none__';
                          return EXTRA_FIELDS_KEY + '::' + path;
                        }

                        function loadExtraFields() {
                          try {
                            var raw = localStorage.getItem(extraStorageKey());
                            if (!raw) { extraFields = []; return; }
                            var arr = JSON.parse(raw);
                            if (!Array.isArray(arr)) { extraFields = []; return; }
                            extraFields = arr.map(function (f, i) {
                              return {
                                id: f.id || ('xf_' + i + '_' + Date.now()),
                                key: String(f.key || '').trim(),
                                label: String(f.label || f.key || '').trim(),
                                value: String(f.value != null ? f.value : ''),
                              };
                            }).filter(function (f) { return f.key || f.label; });
                          } catch (e) { extraFields = []; }
                        }

                        function saveExtraFields() {
                          try {
                            localStorage.setItem(extraStorageKey(), JSON.stringify(extraFields.map(function (f) {
                              return { id: f.id, key: f.key, label: f.label, value: f.value };
                            })));
                          } catch (e) { /* ignore */ }
                        }

                        function uniqueKey(base, skipId) {
                          var k = base || 'field';
                          var n = 2;
                          var used = {};
                          extraFields.forEach(function (f) {
                            if (f.id === skipId) return;
                            if (f.key) used[f.key] = 1;
                          });
                          var tryK = k;
                          while (used[tryK]) {
                            tryK = k + '_' + n;
                            n += 1;
                          }
                          return tryK;
                        }

                        function readExtraCustom() {
                          var out = {};
                          if (extraList) {
                            extraList.querySelectorAll('.run-extra-row').forEach(function (row) {
                              var id = row.getAttribute('data-id');
                              var keyIn = row.querySelector('.run-extra-key');
                              var valIn = row.querySelector('.run-extra-val');
                              var labIn = row.querySelector('.run-extra-label');
                              var key = ((keyIn && keyIn.value) || '').trim();
                              if (!key) key = slugKey((labIn && labIn.value) || 'field');
                              if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
                              out[key] = ((valIn && valIn.value) || '').trim();
                              // sync model
                              extraFields.forEach(function (f) {
                                if (f.id === id) {
                                  f.key = key;
                                  f.label = ((labIn && labIn.value) || key).trim();
                                  f.value = out[key];
                                }
                              });
                            });
                          }
                          saveExtraFields();
                          return out;
                        }

                        function clearExtraValues() {
                          extraFields.forEach(function (f) { f.value = ''; });
                          saveExtraFields();
                          renderExtraFields();
                        }

                        function renderExtraFields() {
                          if (!extraList) return;
                          if (!extraFields.length) {
                            extraList.innerHTML = '<p class="muted run-extra-empty">' + escHtml(t('run.extraEmpty')) + '</p>';
                            return;
                          }
                          extraList.innerHTML = extraFields.map(function (f) {
                            return (
                              '<div class="run-extra-row" data-id="' + escHtml(f.id) + '">' +
                                '<input type="text" class="run-extra-label" data-i18n-placeholder="run.extraLabelPh" placeholder="' + escHtml(t('run.extraLabelPh')) + '" value="' + escHtml(f.label || '') + '">' +
                                '<input type="text" class="run-extra-key" data-i18n-placeholder="run.extraKeyPh" placeholder="' + escHtml(t('run.extraKeyPh')) + '" value="' + escHtml(f.key || '') + '">' +
                                '<input type="text" class="run-extra-val" data-i18n-placeholder="run.extraValPh" placeholder="' + escHtml(t('run.extraValPh')) + '" value="' + escHtml(f.value || '') + '">' +
                                '<button type="button" class="btn btn-secondary run-extra-del" title="' + escHtml(t('run.extraDel')) + '">×</button>' +
                              '</div>'
                            );
                          }).join('');
                          extraList.querySelectorAll('.run-extra-row').forEach(function (row) {
                            var id = row.getAttribute('data-id');
                            var labIn = row.querySelector('.run-extra-label');
                            var keyIn = row.querySelector('.run-extra-key');
                            var valIn = row.querySelector('.run-extra-val');
                            var delBtn = row.querySelector('.run-extra-del');
                            function sync() {
                              extraFields.forEach(function (f) {
                                if (f.id !== id) return;
                                f.label = (labIn.value || '').trim();
                                f.key = (keyIn.value || '').trim() || slugKey(f.label);
                                f.value = (valIn.value || '').trim();
                              });
                              saveExtraFields();
                            }
                            if (labIn) {
                              labIn.addEventListener('change', function () {
                                if (keyIn && !keyIn.dataset.userEdited) {
                                  keyIn.value = uniqueKey(slugKey(labIn.value), id);
                                }
                                sync();
                              });
                              labIn.addEventListener('input', sync);
                            }
                            if (keyIn) {
                              keyIn.addEventListener('input', function () {
                                keyIn.dataset.userEdited = '1';
                                sync();
                              });
                            }
                            if (valIn) valIn.addEventListener('input', sync);
                            if (delBtn) {
                              delBtn.addEventListener('click', function () {
                                extraFields = extraFields.filter(function (f) { return f.id !== id; });
                                saveExtraFields();
                                renderExtraFields();
                              });
                            }
                          });
                        }

                        function addExtraField(preset) {
                          preset = preset || {};
                          var label = preset.label || '';
                          var key = preset.key || (label ? slugKey(label) : '');
                          if (!key) key = uniqueKey('field');
                          else key = uniqueKey(key);
                          extraFields.push({
                            id: 'xf_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                            key: key,
                            label: label || key,
                            value: preset.value || '',
                          });
                          saveExtraFields();
                          renderExtraFields();
                        }

                        if (extraAddBtn) {
                                                  extraAddBtn.addEventListener('click', function () {
                                                    addExtraField({});
                                                    var last = extraList && extraList.querySelector('.run-extra-row:last-child .run-extra-label');
                                                    if (last) last.focus();
                                                  });
                                                }

                                                document.addEventListener('psyclaw:project-opened', function () {
                                                  loadExtraFields();
                                                  renderExtraFields();
                                                });
                                                document.addEventListener('psyclaw:file-state', function () {
                                                  loadExtraFields();
                                                  renderExtraFields();
                                                });

                                                function projectPath() {
                                                  try {
                                                    return (window.PsyClawBuilder && window.PsyClawBuilder.getProjectPath
                                                      && window.PsyClawBuilder.getProjectPath()) || '';
                                                  } catch (e) { return ''; }
                                                }

            function setParticipantHint(msg, isWarn) {
              if (!hintEl) return;
              hintEl.textContent = msg || '';
              hintEl.classList.toggle('is-warn', !!isWarn);
            }

            function escHtml(s) {
              return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            }

            /** Normalize registry/instrument mode → run | pilot | autopilot */
            function normalizeRunMode(m) {
              var s = String(m == null ? '' : m).trim().toLowerCase();
              if (s === 'pilot') return 'pilot';
              if (s === 'autopilot') return 'autopilot';
              // participant / participant window / blank → formal run
              return 'run';
            }

            function formatRunMode(m) {
              var n = normalizeRunMode(m);
              if (n === 'pilot') return t('run.modePilot');
              if (n === 'autopilot') return t('run.modeAutopilot');
              return t('run.modeRun');
            }

            loadExtraFields();
            renderExtraFields();

            function normalizeEndStatus(raw) {
                                                  var s = String(raw || 'normal').trim().toLowerCase();
                                                  if (s === 'finished' || s === 'completed' || s === 'ok' || s === 'success' || s === 'done') return 'normal';
                                                  if (s === 'stopped' || s === 'stop' || s === 'user_stop' || s === 'interrupted' || s === 'abort' || s === 'aborted' || s === 'escape' || s === 'esc' || s === 'user_abort') return 'manual';
                                                  if (s === 'failed' || s === 'fail' || s === 'error' || s === 'crash' || s === 'crashed') return 'unexpected';
                                                  if (s === 'normal' || s === 'manual' || s === 'unexpected') return s;
                                                  return 'normal';
                                                }

                                                function formatEndStatus(raw) {
                                                  var n = normalizeEndStatus(raw);
                                                  if (n === 'manual') return t('run.endManual');
                                                  if (n === 'unexpected') return t('run.endUnexpected');
                                                  return t('run.endNormal');
                                                }

                                                function renderRoster(data) {
                                                  if (!rosterBody) return;
                                                  // Show ALL modes (run/pilot/autopilot). Prefer entries over production-only used.
                                                  var used = (data && (data.entries || data.used)) || [];
                                                  used = used.filter(function (e) { return !!e; });
                                                  used = used.slice().sort(function (a, b) {
                                                    return String(b.at || b.date || '').localeCompare(String(a.at || a.date || ''));
                                                  });
                                                  var maxEntries = (data && data.max_entries != null) ? data.max_entries : 10;
                                                  // People count stays production-only (unique formal IDs)
                                                  var unique = (data && data.unique_count != null)
                                                    ? data.unique_count
                                                    : (function () {
                                                        var s = {};
                                                        used.forEach(function (e) {
                                                          if (normalizeRunMode(e.mode) !== 'run') return;
                                                          var id = String(e.participant_id || '').trim();
                                                          if (id) s[id] = 1;
                                                        });
                                                        return Object.keys(s).length;
                                                      })();
                                                  if (rosterSummary) {
                                                    if (!projectPath()) {
                                                      rosterSummary.textContent = t('run.rosterNeedProject');
                                                    } else {
                                                      rosterSummary.textContent = t('run.rosterSummary', {
                                                        people: unique,
                                                        runs: used.length,
                                                        max: maxEntries,
                                                      });
                                                    }
                                                  }
                                                  if (!used.length) {
                                                    var emptyHint = !projectPath()
                                                      ? t('run.rosterNeedProject')
                                                      : t('run.rosterEmptyHint');
                                                    rosterBody.innerHTML =
                                                      '<tr class="run-roster-empty"><td colspan="9">' +
                                                      '<div class="run-roster-empty-inner">' +
                                                      '<span class="run-roster-empty-title">' +
                                                      escHtml(t('run.rosterEmpty')) +
                                                      '</span>' +
                                                      '<span class="run-roster-empty-hint muted">' +
                                                      escHtml(emptyHint) +
                                                      '</span></div></td></tr>';
                                                    var wrap = document.querySelector('.run-roster-wrap');
                                                    if (wrap) wrap.classList.add('is-empty');
                                                    var card = document.querySelector('.run-roster-card');
                                                    if (card) card.classList.add('is-empty');
                                                    return;
                                                  }
                                                  var wrapFull = document.querySelector('.run-roster-wrap');
                                                  if (wrapFull) wrapFull.classList.remove('is-empty');
                                                  var cardFull = document.querySelector('.run-roster-card');
                                                  if (cardFull) cardFull.classList.remove('is-empty');
                                                  rosterBody.innerHTML = used.map(function (e) {
                                                    var when = String(e.at || e.date || '—').replace('T', ' ');
                                                    var pid = String(e.participant_id || '').trim();
                                                    var sess = String(e.session || '1').trim() || '1';
                                                    var modeRaw = String(e.mode || 'participant');
                                                    var modeNorm = normalizeRunMode(modeRaw);
                                                    var endNorm = normalizeEndStatus(e.end_status);
                                                    // data-mode keeps registry value for delete match
                                                    return (
                                                      '<tr data-pid="' + escHtml(pid) + '" data-session="' + escHtml(sess) + '" data-mode="' + escHtml(modeRaw) + '">' +
                                                      '<td>' + escHtml(pid) + '</td>' +
                                                      '<td>' + escHtml(e.participant_name || '—') + '</td>' +
                                                      '<td>' + escHtml(e.experimenter || '—') + '</td>' +
                                                      '<td>' + escHtml(sess) + '</td>' +
                                                      '<td>' + escHtml(when) + '</td>' +
                                                      '<td class="run-roster-mode"><span class="run-mode-chip mode-' + escHtml(modeNorm) + '">' +
                                                        escHtml(formatRunMode(modeRaw)) +
                                                      '</span></td>' +
                                                      '<td class="run-roster-end"><span class="run-end-chip end-' + escHtml(endNorm) + '">' +
                                                        escHtml(formatEndStatus(endNorm)) +
                                                      '</span></td>' +
                                                      '<td class="mono">' + escHtml(e.run_id || '—') + '</td>' +
                                                      '<td class="run-roster-actions">' +
                                                        '<button type="button" class="btn btn-secondary run-roster-del" data-i18n-title="run.rosterDelBtnTitle" title="' +
                                                        escHtml(t('run.rosterDelBtnTitle')) + '">' +
                                                        escHtml(t('run.rosterDelBtn')) +
                                                        '</button>' +
                                                      '</td>' +
                                                      '</tr>'
                                                    );
                                                  }).join('');
                                                  rosterBody.querySelectorAll('.run-roster-del').forEach(function (btn) {
                                                    btn.addEventListener('click', function () {
                                                      var tr = btn.closest('tr');
                                                      if (!tr) return;
                                                      openRosterDeleteModal({
                                                        participant_id: tr.getAttribute('data-pid') || '',
                                                        session: tr.getAttribute('data-session') || '1',
                                                        mode: tr.getAttribute('data-mode') || 'participant',
                                                        name: (tr.children[1] && tr.children[1].textContent) || '',
                                                      });
                                                    });
                                                  });
                                                  // all content cells left; actions stay center
                                                                                                    alignRosterCells();
                                                                                                  }

                                                                                      function alignRosterCells() {
                                                                                        var table = document.getElementById('run-roster-table');
                                                                                        if (!table || !rosterBody) return;
                                                                                        rosterBody.querySelectorAll('tr').forEach(function (tr) {
                                                                                          if (tr.classList.contains('run-roster-empty')) return;
                                                                                          var cells = tr.children;
                                                                                          for (var i = 0; i < cells.length; i++) {
                                                                                            var td = cells[i];
                                                                                            if (td.classList.contains('run-roster-actions')) {
                                                                                              td.classList.remove('is-left');
                                                                                              td.classList.add('is-center');
                                                                                              continue;
                                                                                            }
                                                                                            // always left — mixed center/left by length looked uneven across cols
                                                                                            td.classList.add('is-left');
                                                                                            td.classList.remove('is-center');
                                                                                          }
                                                                                        });
                                                                                      }

                        // --- GitHub-style type-to-confirm delete ---
                        var delModal = document.getElementById('roster-del-modal');
                        var delWarn = document.getElementById('roster-del-warn');
                        var delPrompt = document.getElementById('roster-del-prompt');
                        var delInput = document.getElementById('roster-del-input');
                        var delCancel = document.getElementById('roster-del-cancel');
                        var delConfirmBtn = document.getElementById('roster-del-confirm');
                        var delPending = null; // { participant_id, session, mode, name }

                        function closeRosterDeleteModal() {
                          delPending = null;
                          if (delModal) delModal.hidden = true;
                          if (delInput) delInput.value = '';
                          if (delConfirmBtn) delConfirmBtn.disabled = true;
                        }

                        function syncDelConfirmEnabled() {
                          if (!delConfirmBtn || !delPending) return;
                          var typed = (delInput && delInput.value) || '';
                          delConfirmBtn.disabled = typed !== delPending.participant_id;
                        }

                        function openRosterDeleteModal(entry) {
                          if (!delModal || !entry || !entry.participant_id) return;
                          if (!projectPath()) {
                            setParticipantHint(t('run.rosterNeedProject'), true);
                            return;
                          }
                          delPending = {
                            participant_id: String(entry.participant_id).trim(),
                            session: String(entry.session || '1').trim() || '1',
                            mode: String(entry.mode || 'participant'),
                            name: entry.name && entry.name !== '—' ? String(entry.name) : '',
                          };
                          if (delWarn) {
                            delWarn.textContent = t('run.rosterDelWarn', {
                              id: delPending.participant_id,
                              s: delPending.session,
                              name: delPending.name || '—',
                            });
                          }
                          if (delPrompt) {
                            delPrompt.textContent = t('run.rosterDelPrompt', {
                              id: delPending.participant_id,
                            });
                          }
                          if (delInput) {
                            delInput.value = '';
                            delInput.placeholder = delPending.participant_id;
                          }
                          if (delConfirmBtn) delConfirmBtn.disabled = true;
                          delModal.hidden = false;
                          setTimeout(function () { if (delInput) delInput.focus(); }, 0);
                        }

                        if (delInput) {
                          delInput.addEventListener('input', syncDelConfirmEnabled);
                          delInput.addEventListener('keydown', function (ev) {
                            if (ev.key === 'Enter' && delConfirmBtn && !delConfirmBtn.disabled) {
                              ev.preventDefault();
                              delConfirmBtn.click();
                            }
                            if (ev.key === 'Escape') {
                              ev.preventDefault();
                              closeRosterDeleteModal();
                            }
                          });
                        }
                        if (delCancel) delCancel.addEventListener('click', closeRosterDeleteModal);
                        if (delModal) {
                          delModal.addEventListener('click', function (ev) {
                            if (ev.target === delModal) closeRosterDeleteModal();
                          });
                        }
                        if (delConfirmBtn) {
                          delConfirmBtn.addEventListener('click', async function () {
                            if (!delPending || delConfirmBtn.disabled) return;
                            var path = projectPath();
                            if (!path) return;
                            delConfirmBtn.disabled = true;
                            try {
                              var r = await fetch('/api/participants/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  path: path,
                                  participant_id: delPending.participant_id,
                                  session: delPending.session,
                                  mode: delPending.mode,
                                  confirm: (delInput && delInput.value) || '',
                                }),
                              });
                              var j = await r.json().catch(function () { return {}; });
                              if (!r.ok || !j.ok) {
                                setParticipantHint(
                                  t('run.rosterDelFail', { err: (j && (j.error || j.code)) || r.status }),
                                  true
                                );
                                delConfirmBtn.disabled = false;
                                return;
                              }
                              closeRosterDeleteModal();
                              setParticipantHint(
                                t('run.rosterDelOk', {
                                  id: (j.removed && j.removed.participant_id) || '',
                                  s: (j.removed && j.removed.session) || '',
                                }),
                                false
                              );
                              // refresh roster + re-bind free ID (deleted high id may free a number)
                              await refreshParticipantSuggest({ assignNext: true });
                            } catch (err) {
                              setParticipantHint(t('run.rosterDelFail', { err: err.message || 'error' }), true);
                              delConfirmBtn.disabled = false;
                            }
                          });
                        }

            // opts.assignNext: write locked ID = next free (open project / next person / after run)
                        // default false keeps current ID so "Next s" is not clobbered by roster refresh
                        async function refreshParticipantSuggest(opts) {
                          opts = opts || {};
                          var path = projectPath();
                          if (!path) {
                            setParticipantHint(t('run.rosterNeedProject'), false);
                            renderRoster(null);
                            if (opts.assignNext) setLockedParticipantId('P01');
                            return null;
                          }
                          try {
                            var r = await fetch('/api/participants?path=' + encodeURIComponent(path));
                            if (!r.ok) return null;
                            var j = await r.json();
                            var nextId = j.suggest_id || 'P01';
                            setParticipantHint(
                              t('run.recordedHint', {
                                people: (j.unique_count != null ? j.unique_count : j.count) || 0,
                                next: nextId,
                              }),
                              false
                            );
                            renderRoster(j);
                            if (opts.assignNext) setLockedParticipantId(nextId);
                            return j;
                          } catch (e) {
                            return null;
                          }
                        }

      async function checkDuplicate() {
        var path = projectPath();
        var s = readSession();
        if (!path) return { duplicate: false };
        try {
          var r = await fetch('/api/participants/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: path,
              participant_id: s.participant_id,
              session: s.session,
            }),
          });
          if (!r.ok) return { duplicate: false };
          return await r.json();
        } catch (e) {
          return { duplicate: false };
        }
      }

      // After finished production run: auto next free ID + clear optionals (no toolbar buttons)
            async function goNextParticipant() {
              var j = await refreshParticipantSuggest({ assignNext: true });
              if (!j) {
                var cur = ((elPart && elPart.value) || 'P01').trim() || 'P01';
                var m = cur.match(/^(.*?)(\d+)$/);
                if (m) {
                  var n = parseInt(m[2], 10) + 1;
                  var w = m[2].length;
                  setLockedParticipantId(m[1] + String(n).padStart(w, '0'));
                } else {
                  setLockedParticipantId(cur + '2');
                }
              }
              if (elSess) elSess.value = '1';
              if (elName) elName.value = '';
              clearExtraValues();
              tickTimestamp();
              refreshExpUid(true);
              setParticipantHint(t('run.nextParticipantDone', { id: (elPart && elPart.value) || '' }), false);
            }

            function setInstrumentEmpty(isEmpty) {
        var card = document.getElementById('pilot-instrument-card');
        var list = document.getElementById('pilot-instrument-list');
        var emptyEl = document.getElementById('instr-empty');
        if (card) card.classList.toggle('is-empty', !!isEmpty);
        if (list) list.hidden = !!isEmpty;
        if (emptyEl) {
          emptyEl.hidden = !isEmpty;
          if (isEmpty) emptyEl.textContent = t('run.instrEmpty');
        }
      }

            function renderInstrument(instr, meta) {
        meta = meta || {};
        var st = document.getElementById('instr-status');
        var modeEl = document.getElementById('instr-mode');
        var headEl = document.getElementById('instr-headless');
        var designEl = document.getElementById('instr-design');
        var pidEl = document.getElementById('instr-pid');
        var pnameEl = document.getElementById('instr-pname');
        var sessEl = document.getElementById('instr-sess');
        var dateEl = document.getElementById('instr-date');
        var expEl = document.getElementById('instr-exp');
        var fps = document.getElementById('instr-fps');
        var dispEl = document.getElementById('instr-display');
        var kb = document.getElementById('instr-kb');
                var mic = document.getElementById('instr-mic');
                var snd = document.getElementById('instr-sound');
                var needsEl = document.getElementById('instr-needs');
                var rowsEl = document.getElementById('instr-rows');
        var accEl = document.getElementById('instr-acc');
        var meanRtEl = document.getElementById('instr-mean-rt');
        var hitEl = document.getElementById('instr-hit');
        var faEl = document.getElementById('instr-fa');
        var folderEl = document.getElementById('instr-folder');
        var csvEl = document.getElementById('instr-csv');
        var when = document.getElementById('instr-when');
        var runEl = document.getElementById('instr-run');
        var notes = document.getElementById('instr-notes');
        if (!instr) {
          setInstrumentEmpty(true);
          if (st) {
            st.textContent = t('run.noPilot');
            st.className = '';
          }
          return;
        }
        setInstrumentEmpty(false);
        var sess = (instr.session && typeof instr.session === 'object')
          ? instr.session
          : ((meta.session && typeof meta.session === 'object') ? meta.session : {});
        var modeRaw = String(
          instr.mode || meta.mode || (instr.headless === true ? 'pilot' : (instr.headless === false ? 'participant' : ''))
          || ''
        ).trim();
        var mode = modeRaw ? formatRunMode(modeRaw) : '—';
        var modeNorm = modeRaw ? normalizeRunMode(modeRaw) : '';
        var ok = instr.ok !== false;
        if (st) {
          st.textContent = ok ? t('run.ok') : t('run.check');
          st.className = ok ? 'instr-ok' : 'instr-bad';
        }
        if (modeEl) {
          modeEl.textContent = mode;
          modeEl.className = modeNorm ? ('run-mode-chip mode-' + modeNorm) : '';
        }
        if (headEl) {
          var h = instr.headless;
          if (h == null && meta.headless != null) h = meta.headless;
          if (h == null) h = (modeNorm === 'pilot' || modeNorm === 'autopilot');
          headEl.textContent = h ? 'true' : 'false';
        }
        if (designEl) designEl.textContent = instr.design_name || meta.design_name || '—';
        if (pidEl) pidEl.textContent = sess.participant_id || meta.participant_id || '—';
        if (pnameEl) pnameEl.textContent = sess.participant_name || sess.name || '—';
        if (sessEl) sessEl.textContent = (sess.session != null && sess.session !== '')
          ? ('s' + String(sess.session))
          : '—';
        if (dateEl) {
          var uidTxt = sess.uid || meta.uid || '';
          dateEl.textContent = sess.date || '—';
          if (uidTxt) dateEl.setAttribute('title', 'uid ' + uidTxt);
        }
        if (expEl) expEl.textContent = sess.experimenter || '—';
        if (fps) {
          var f = instr.fps_hz;
          var extra = '';
          if (instr.flip_ms_mean != null) {
            extra = ' · flip ' + instr.flip_ms_mean + ' ms';
            if (instr.flip_ms_sd != null) extra += ' ±' + instr.flip_ms_sd;
          }
          fps.textContent = (f != null ? (f + ' Hz') : '—') + extra;
        }
        if (dispEl) {
          var d = instr.display || {};
          var sz = d.size;
          var sizeTxt = Array.isArray(sz) ? (sz[0] + '×' + sz[1]) : '—';
          var fs = d.fullscreen;
          dispEl.textContent = sizeTxt + (fs === true ? (' · ' + (typeof t === 'function' ? t('run.instrFullscreen') : 'fullscreen'))
            : (fs === false ? (' · ' + (typeof t === 'function' ? t('run.instrWindowed') : 'windowed')) : ''));
        }
        function devLine(d) {
          if (!d) return '—';
          if (d.used === false) return t('run.instrNotUsed');
          var bit = d.ok === false ? 'FAIL' : 'ok';
          return bit + (d.detail ? (' · ' + d.detail) : '');
        }
        if (kb) kb.textContent = devLine(instr.keyboard);
                if (mic) mic.textContent = devLine(instr.microphone);
                if (snd) snd.textContent = devLine(instr.sound);
                if (needsEl) {
                  var needBits = [];
                  if (instr.needs && typeof instr.needs === 'object') {
                    Object.keys(instr.needs).forEach(function (k) {
                      if (instr.needs[k]) needBits.push(k);
                    });
                  }
                  needsEl.textContent = needBits.length ? needBits.join(', ') : '—';
                  needsEl.title = needBits.length ? needBits.join(', ') : '';
                }
                if (rowsEl) rowsEl.textContent = (instr.n_rows != null) ? String(instr.n_rows) : '—';
        (function fillMetrics() {
          var m = instr.metrics && typeof instr.metrics === 'object' ? instr.metrics : null;
          var ov = m && m.overall && typeof m.overall === 'object' ? m.overall : null;
          function pct(v) {
            if (v == null || v === '') return '—';
            var n = Number(v);
            if (!isFinite(n)) return String(v);
            return (Math.round(n * 1000) / 10) + '%';
          }
          function sec(v) {
            if (v == null || v === '') return '—';
            var n = Number(v);
            if (!isFinite(n)) return String(v);
            return (Math.round(n * 1000) / 1000) + ' s';
          }
          if (accEl) {
            accEl.textContent = ov ? pct(ov.accuracy) : '—';
            if (ov && ov.n_scored != null) accEl.setAttribute('title', 'n_scored=' + ov.n_scored + ' n_correct=' + (ov.n_correct != null ? ov.n_correct : '?'));
          }
          if (meanRtEl) {
            meanRtEl.textContent = ov ? sec(ov.mean_rt) : '—';
            if (ov && ov.mean_rt_correct != null) meanRtEl.setAttribute('title', 'correct ' + sec(ov.mean_rt_correct));
          }
          if (hitEl) hitEl.textContent = ov && ov.hit_rate != null ? pct(ov.hit_rate) : '—';
          if (faEl) faEl.textContent = ov && ov.fa_rate != null ? pct(ov.fa_rate) : '—';
        })();
        (function fillFolderAndCsv() {
          function dirnameOf(p) {
            var s = String(p || '').trim();
            if (!s) return '';
            var i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
            return i >= 0 ? s.slice(0, i) : '';
          }
          function basenameOf(p) {
            var s = String(p || '').trim();
            if (!s) return '';
            var i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
            return i >= 0 ? s.slice(i + 1) : s;
          }
          var full = instr.csv_project || instr.csv || '';
          var folder = dirnameOf(full);
          var name = basenameOf(full);
          if (folderEl) {
            folderEl.textContent = folder || '—';
            if (folder) folderEl.setAttribute('title', folder);
            else folderEl.removeAttribute('title');
          }
          if (csvEl) {
            csvEl.textContent = name || '—';
            var tip = '';
            if (instr.csv_project) tip = instr.csv_project;
            if (instr.csv && instr.csv !== instr.csv_project) {
              tip = tip ? (tip + ' (run: ' + instr.csv + ')') : String(instr.csv);
            }
            if (tip) csvEl.setAttribute('title', tip);
            else csvEl.removeAttribute('title');
          }
        })();
        if (when) when.textContent = meta.when || instr.at || new Date().toLocaleString();
                if (runEl) runEl.textContent = meta.run_id || instr.run_id || '—';
                // 2-col bench: short stay half; long / forced → full. Values always left (CSS).
                (function clampInstrumentRows() {
                  var list = document.getElementById('pilot-instrument-list');
                  if (!list) return;
                  var rows = Array.prototype.slice.call(list.querySelectorAll(':scope > div'));
                  // half-cell is ~half panel; treat medium-long as full so right col isn't clipped junk
                  var LONG = 28;
                  rows.forEach(function (row) {
                    var dd = row.querySelector('dd');
                    if (!dd) return;
                    var txt = String(dd.textContent || '').trim();
                    if (txt && txt !== '—') dd.setAttribute('title', txt);
                    else dd.removeAttribute('title');
                    var force = row.getAttribute('data-instr-span');
                    var id = dd.id || '';
                    if (force === '1' || id === 'instr-when' || id === 'instr-run') {
                      row.classList.remove('instr-span-2');
                      return;
                    }
                    if (
                      force === '2' ||
                      id === 'instr-fps' ||
                      id === 'instr-csv' ||
                      id === 'instr-folder' ||
                      id === 'instr-needs' ||
                      id === 'instr-display'
                    ) {
                      row.classList.add('instr-span-2');
                      return;
                    }
                    var longish = /[\\/]/.test(txt) || txt.length > LONG;
                    if (longish) row.classList.add('instr-span-2');
                    else row.classList.remove('instr-span-2');
                  });
                  // orphan half before a full-span → promote previous half to full (no empty hole)
                  var singles = 0;
                  rows.forEach(function (row) {
                    if (row.classList.contains('instr-span-2')) {
                      if (singles % 2 === 1) {
                        var prevIdx = rows.indexOf(row) - 1;
                        while (prevIdx >= 0 && rows[prevIdx].classList.contains('instr-span-2')) prevIdx--;
                        if (prevIdx >= 0) {
                          var prev = rows[prevIdx];
                          var pForce = prev.getAttribute('data-instr-span');
                          var pDd = prev.querySelector('dd');
                          var pId = pDd ? (pDd.id || '') : '';
                          if (pForce !== '1' && pId !== 'instr-when' && pId !== 'instr-run') {
                            prev.classList.add('instr-span-2');
                          }
                        }
                      }
                      singles = 0;
                    } else {
                      singles += 1;
                    }
                  });
                  // trailing odd half → full (except forced pair When|Run)
                  if (singles % 2 === 1) {
                    var last = null;
                    for (var i = rows.length - 1; i >= 0; i--) {
                      if (!rows[i].classList.contains('instr-span-2')) { last = rows[i]; break; }
                    }
                    if (last) {
                      var lForce = last.getAttribute('data-instr-span');
                      var lDd = last.querySelector('dd');
                      var lId = lDd ? (lDd.id || '') : '';
                      if (lForce !== '1' && lId !== 'instr-when' && lId !== 'instr-run') {
                        last.classList.add('instr-span-2');
                      }
                    }
                  }
                })();
                if (notes) {
          var lines = [];
          if (sess.uid || meta.uid) lines.push('uid: ' + (sess.uid || meta.uid));
          if (sess.notes) lines.push('notes: ' + sess.notes);
          if (sess.custom && typeof sess.custom === 'object') {
            Object.keys(sess.custom).forEach(function (k) {
              lines.push(k + '=' + sess.custom[k]);
            });
          }
          if (Array.isArray(instr.notes) && instr.notes.length) {
                      instr.notes.forEach(function (n) { lines.push(String(n)); });
                    }
                    if (lines.length) {
            notes.hidden = false;
            notes.textContent = lines.join('\n');
          } else {
            notes.hidden = true;
            notes.textContent = '';
          }
        }
      }

      function loadLastInstrument() {
        try {
          var raw = localStorage.getItem(LAST_INSTR_KEY)
            || localStorage.getItem(LAST_PILOT_KEY_LEGACY);
          if (!raw) return;
          var j = JSON.parse(raw);
          if (j && j.instrument) renderInstrument(j.instrument, j.meta || {});
        } catch (e) { /* ignore */ }
      }

      function saveLastInstrument(instr, meta) {
        try {
          var payload = {
            instrument: instr,
            meta: meta || {},
            savedAt: Date.now(),
          };
          localStorage.setItem(LAST_INSTR_KEY, JSON.stringify(payload));
          // keep legacy key for older builds reading only pilot
          localStorage.setItem(LAST_PILOT_KEY_LEGACY, JSON.stringify(payload));
        } catch (e) { /* ignore */ }
      }

      loadLastInstrument();
                        // cold: assign next free ID into locked field
                        var lastIdAssignPath = '';
                        function refreshSuggestMaybeAssign(forceAssign) {
                          var path = projectPath() || '';
                          var pathChanged = path !== lastIdAssignPath;
                          if (forceAssign || pathChanged) lastIdAssignPath = path;
                          return refreshParticipantSuggest({
                            assignNext: !!(forceAssign || pathChanged),
                          });
                        }
                        refreshSuggestMaybeAssign(true);
                        document.addEventListener('psyclaw:file-state', function () {
                          // only re-assign ID when project path changes — not every dirty/save
                          refreshSuggestMaybeAssign(false);
                        });
                        document.addEventListener('psyclaw:project-opened', function () {
                          refreshSuggestMaybeAssign(true);
                        });
                        document.querySelectorAll('.tab-btn').forEach(function (btn) {
                          if (btn.dataset.tab === 'run') {
                            btn.addEventListener('click', function () {
                              // tab switch: refresh roster only — keep current assigned ID / session
                              refreshParticipantSuggest({ assignNext: false });
                              tickTimestamp();
                            });
                          }
                        });


      function appendLog(level, msg) {
        if (!runLog) return;
        var line = document.createElement('div');
        line.className = 'log-line';
        var now = new Date();
        var hh = String(now.getHours()).padStart(2, '0');
        var mm = String(now.getMinutes()).padStart(2, '0');
        var ss = String(now.getSeconds()).padStart(2, '0');
        var t = document.createElement('time'); t.textContent = hh + ':' + mm + ':' + ss;
        var tag = document.createElement('span');
        tag.className = 'log-tag log-tag-' + level.toLowerCase(); tag.textContent = level;
        var body = document.createElement('span'); body.textContent = msg;
        line.appendChild(t); line.appendChild(tag); line.appendChild(body);
        runLog.appendChild(line);
        runLog.scrollTop = runLog.scrollHeight;
      }

      function setStatus(status) {
        if (!statusBadge) return;
        statusBadge.textContent = status;
        statusBadge.className = 'status-badge status-' + status;
        var running = (status === 'running' || status === 'starting' || status === 'compiling' || status === 'compiled');
        // After finished/stopped/failed: Start re-enabled (no Reset button)
        startBtn.disabled = running;
                var pilotBtn = document.getElementById('pilot-run-btn');
                if (pilotBtn) pilotBtn.disabled = running;
                var autopilotBtn = document.getElementById('autopilot-run-btn');
                if (autopilotBtn) autopilotBtn.disabled = running;
                stopBtn.disabled = (!running);
        if (downloadBtn) downloadBtn.disabled = (status !== 'finished');
      }

      function tickElapsed() {
        if (!runElapsedEl || !pollStartTime) return;
        var sec = Math.floor((Date.now() - pollStartTime) / 1000);
        var m = String(Math.floor(sec / 60)).padStart(2, '0');
        var s = String(sec % 60).padStart(2, '0');
        runElapsedEl.textContent = m + ':' + s;
      }

      async function pollRun() {
        if (!currentRunId) return;
        try {
          var r = await fetch('/api/runs/' + currentRunId);
          if (!r.ok) { appendLog('ERROR', t('run.pollFailed', { status: r.status })); stopPolling(); return; }
          var d = await r.json();
          setStatus(d.status);
          if (runProgress) {
            var pct = Math.round((d.progress || 0) * 100);
            runProgress.textContent = pct + '%';
          }
          if (Array.isArray(d.log_tail)) {
            var seen = runLog.querySelectorAll('.log-line').length;
            d.log_tail.slice(seen).forEach(function (line) { appendLog('INFO', line); });
          } else if (typeof d.log_tail === 'string' && d.log_tail) {
            var lines = d.log_tail.split('\n').filter(Boolean);
            var have = runLog.querySelectorAll('.log-line').length;
            lines.slice(have).forEach(function (line) { appendLog('INFO', line); });
          }
          if (d.status === 'finished' || d.status === 'failed' || d.status === 'stopped') {
            appendLog(d.status === 'finished' ? 'SUCCESS' : 'WARNING',
                      'Run ' + d.status + ' (' + Math.round((d.progress || 0) * 100) + '%)');
            if (d.instrument) {
              var sessMeta = (d.spec && d.spec.session && typeof d.spec.session === 'object')
                ? d.spec.session
                : {};
              // fill session onto instrument if compiler/mock already has it; else from API spec
              if (!d.instrument.session || typeof d.instrument.session !== 'object') {
                d.instrument.session = sessMeta;
              }
              if (!d.instrument.mode) {
                d.instrument.mode = (d.spec && d.spec.mode) || lastArmMode || '';
              }
              if (d.instrument.headless == null && d.spec && d.spec.headless != null) {
                d.instrument.headless = d.spec.headless;
              }
              var meta = {
                run_id: d.run_id || currentRunId,
                when: new Date().toLocaleString(),
                mode: d.instrument.mode || (d.spec && d.spec.mode) || lastArmMode || '',
                session: d.instrument.session || sessMeta,
                participant_id: (d.spec && d.spec.participant_id) || '',
                headless: d.instrument.headless,
              };
              renderInstrument(d.instrument, meta);
              // persist last pilot OR formal Start
              saveLastInstrument(d.instrument, meta);
              appendLog('INFO', 'Instrument FPS=' +
                (d.instrument.fps_hz != null ? d.instrument.fps_hz + 'Hz' : '?') +
                ' ok=' + (d.instrument.ok !== false) +
                ' mode=' + (meta.mode || '?'));
            }
            if (d.status === 'finished') {
                                                  // production run: auto next free ID; pilot/autopilot: roster only
                                                  if (lastArmMode === 'pilot' || lastArmMode === 'autopilot') {
                                                    refreshParticipantSuggest({ assignNext: false });
                                                  } else {
                                                    goNextParticipant();
                                                  }
                                                } else {
                                                  // stopped (ESC / Stop) or failed — keep ID, show manual/unexpected chip
                                                  refreshParticipantSuggest({ assignNext: false });
                                                }
                        stopPolling();
                      }
        } catch (e) {
          appendLog('ERROR', t('run.pollError', { msg: e.message }));
          stopPolling();
        }
      }

      function startPolling() {
        stopPolling();
        pollTimer = setInterval(pollRun, 1000);
        elapsedTimer = setInterval(tickElapsed, 500);
      }
      function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        if (elapsedTimer) clearInterval(elapsedTimer);
        pollTimer = elapsedTimer = null;
      }

      startBtn.addEventListener('click', async function () {
              lastArmMode = 'participant';
              await armRun('participant');
            });

            var pilotBtn = document.getElementById('pilot-run-btn');
            if (pilotBtn) {
              pilotBtn.addEventListener('click', async function () {
                lastArmMode = 'pilot';
                await armRun('pilot');
              });
            }

            var autopilotBtn = document.getElementById('autopilot-run-btn');
            if (autopilotBtn) {
              autopilotBtn.addEventListener('click', async function () {
                lastArmMode = 'autopilot';
                await armRun('autopilot');
              });
            }

            var openFolderBtn = document.getElementById('open-project-folder-btn');
            function syncOpenFolderBtn() {
              if (!openFolderBtn) return;
              var p = '';
              try {
                if (window.PsyClawBuilder && window.PsyClawBuilder.getProjectPath) {
                  p = window.PsyClawBuilder.getProjectPath() || '';
                }
              } catch (e) { p = ''; }
              openFolderBtn.disabled = !p;
              if (p) openFolderBtn.setAttribute('title', (typeof t === 'function' ? t('run.openFolderTitle') : 'Open experiment folder') + ' · ' + p);
              else openFolderBtn.setAttribute('title', typeof t === 'function' ? t('run.openFolderNoPath') : 'Open a project first');
            }
            if (openFolderBtn) {
              var openFolderBusy = false;
              openFolderBtn.addEventListener('click', async function () {
                if (openFolderBusy) return;
                var p = '';
                try {
                  if (window.PsyClawBuilder && window.PsyClawBuilder.getProjectPath) {
                    p = window.PsyClawBuilder.getProjectPath() || '';
                  }
                } catch (e) { p = ''; }
                if (!p) {
                  appendLog('WARN', typeof t === 'function' ? t('run.openFolderNoPath') : 'Open a project first');
                  return;
                }
                openFolderBusy = true;
                openFolderBtn.disabled = true;
                try {
                  var resp = await fetch('/api/projects/reveal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: p }),
                  });
                  var j = {};
                  try { j = await resp.json(); } catch (ignore) { j = {}; }
                  if (!resp.ok || !j.ok) {
                    var err = (j && (j.error || j.code)) || ('HTTP ' + resp.status);
                    appendLog('ERROR', (typeof t === 'function' ? t('run.openFolderFailed') : 'Could not open folder') + ': ' + err);
                    return;
                  }
                  appendLog('INFO', (typeof t === 'function' ? t('run.openFolder') : 'Open folder') + ': ' + (j.path || p) + (j.backend ? ' · ' + j.backend : ''));
                } catch (e) {
                  appendLog('ERROR', (typeof t === 'function' ? t('run.openFolderFailed') : 'Could not open folder') + ': ' + (e && e.message ? e.message : e));
                } finally {
                  openFolderBusy = false;
                  syncOpenFolderBtn();
                }
              });
              document.addEventListener('psyclaw:file-state', syncOpenFolderBtn);
              document.addEventListener('psyclaw:project-opened', syncOpenFolderBtn);
              syncOpenFolderBtn();
            }

            async function armRun(modeLabel) {
              // participant: live formal, consumes ID
              // pilot: live window, MANUAL keys, P_pilot, no ID consume
              // autopilot: headless auto-simulate keys (must auto), P_autopilot, capped loops
              try {
                var mode = modeLabel || 'participant';
                var isPilot = (mode === 'pilot');
                var isAutopilot = (mode === 'autopilot');
                var isTestMode = isPilot || isAutopilot;
                var headless = isAutopilot; // ONLY autopilot auto-simulates keys

                var design = window.PsyClawBuilder && window.PsyClawBuilder.getDesign
                  ? window.PsyClawBuilder.getDesign()
                  : null;

                if (!design || !design.routines || !design.routines.length) {
                  appendLog('ERROR', t('run.noDesign'));
                  setStatus('failed');
                  return;
                }

                refreshExpUid(true); // new unique id per arm
                var session = readSession();
                if (!isTestMode && !session.participant_id) {
                  appendLog('ERROR', t('run.needParticipant'));
                  return;
                }
                // Pilot / Autopilot never consume production IDs — leave locked form ID alone
                if (isPilot) {
                  session.participant_id = 'P_pilot';
                } else if (isAutopilot) {
                  session.participant_id = 'P_autopilot';
                }

                // Cap loops only for autopilot (auto key simulation smoke)
                if (isAutopilot) {
                  design = JSON.parse(JSON.stringify(design));
                  (function capLoops(nodes) {
                    (nodes || []).forEach(function (n) {
                      if (!n || n.kind !== 'loop') return;
                      if ((n.nReps || 0) > 4) n.nReps = 4;
                      if (Array.isArray(n.conditions) && n.conditions.length > 4) {
                        n.conditions = n.conditions.slice(0, 4);
                      }
                      capLoops(n.children);
                    });
                  })(design.flow || []);
                }

                // soft-clear previous finished session telemetry (replaces old Reset)
                stopPolling();
                if (runLog) runLog.innerHTML = '';
                if (runProgress) runProgress.textContent = '0%';
                if (runElapsedEl) runElapsedEl.textContent = '00:00';

                // participant uniqueness (project registry) — pilot/autopilot never consume IDs
                if (!isTestMode) {
                  var dupInfo = await checkDuplicate();
                  if (dupInfo && dupInfo.duplicate) {
                                // auto-advance session if available; else next free ID
                                                          if (dupInfo.suggest_session && elSess) {
                                                            elSess.value = String(dupInfo.suggest_session);
                                                            session.session = String(dupInfo.suggest_session);
                                                          }
                                                          // re-check after session auto-bump
                                                          var again = await checkDuplicate();
                                                          if (again && again.duplicate) {
                                                            if (again.suggest_id) {
                                                              setLockedParticipantId(again.suggest_id);
                                                              session.participant_id = again.suggest_id;
                                                              if (elSess) { elSess.value = '1'; session.session = '1'; }
                                                            }
                                                            again = await checkDuplicate();
                                                          }
                                                          if (again && again.duplicate) {
                                                            appendLog('ERROR', 'Duplicate ' + session.participant_id + ' · s' + session.session);
                                                            setParticipantHint(
                                                              t('run.duplicateHint', {
                                                                id: again.suggest_id || session.participant_id,
                                                                s: again.suggest_session || '?',
                                                              }),
                                                              true
                                                            );
                                                            setStatus('failed');
                                                            return;
                                                          }
                                                          appendLog('INFO', 'Auto-advanced to ' + session.participant_id + ' · s' + session.session);
                              }
                }

                var body = {
                                  headless: !!headless,
                                  design: design,
                                  paradigm_id: 'design',
                                  session: session,
                                  project_path: projectPath() || undefined,
                                  force_en_ime: (function () {
                                    try {
                                      var v = localStorage.getItem('psyclaw.forceEnIme');
                                      if (v === null || v === undefined || v === '') return true;
                                      return v === '1' || v === 'true';
                                    } catch (e) { return true; }
                                  })(),
                                  spec: {
                                    source: 'builder',
                                    design_name: design.name || t('builder.untitled'),
                                    mode: mode,
                                    participant_id: session.participant_id,
                                    session: session,
                                  },
                                };
                                // also put on session so generated script reads SESSION.force_en_ime
                                try { body.session.force_en_ime = body.force_en_ime; } catch (eS) {}

                setStatus('starting');
                var armMsg =
                  mode === 'autopilot' ? 'Arming AUTOPILOT stack (auto key simulation)...'
                  : mode === 'pilot' ? 'Arming PILOT stack (live window, manual keys)...'
                  : 'Arming START stack (live participant)...';
                appendLog('INFO', armMsg);
                appendLog('INFO', 'Session ' + session.participant_id + ' · s' + session.session +
                  (session.date ? ' · ' + session.date : ''));

                var resp = await fetch('/api/runs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!resp.ok) {
                  var txt = await resp.text();
                  try {
                    var ej = JSON.parse(txt);
                    if (ej && ej.code === 'duplicate_participant') {
                      setParticipantHint(
                        'Duplicate · next ' + (ej.suggest_id || '') +
                        ' / s' + (ej.suggest_session || ''),
                        true
                      );
                    }
                  } catch (ignore) {}
                  throw new Error(t('run.startFailed', { status: resp.status, txt: txt }));
                }
                var data = await resp.json();
                currentRunId = data.run_id;
                if (runIdEl) runIdEl.textContent = currentRunId;
                if (runParadigmEl) {
                  var chip =
                    mode === 'autopilot' ? 'autopilot:'
                    : mode === 'pilot' ? 'pilot:'
                    : 'start:';
                  runParadigmEl.textContent = chip + (design.name || t('builder.untitled'));
                }
                if (runSessionChip) {
                  runSessionChip.textContent = session.participant_id + ' · s' + session.session;
                }
                if (runStartedEl) runStartedEl.textContent = new Date().toLocaleTimeString();
                pollStartTime = Date.now();
                appendLog('INFO', 'Run ' + currentRunId + ' · source=' + (data.source || '?') +
                  ' · headless=' + data.headless + ' · mode=' + mode);
                startPolling();
              } catch (e) {
                appendLog('ERROR', e.message);
                setStatus('failed');
              }
            }

            var modeHint = document.getElementById('run-mode-hint');
            if (modeHint) {
              modeHint.textContent = t('run.modeHintShort');
            }
      stopBtn.addEventListener('click', async function () {
        if (!currentRunId) return;
        try {
          await fetch('/api/runs/' + currentRunId + '/stop', { method: 'POST' });
          appendLog('WARNING', t('run.stopReq', { id: currentRunId }));
        } catch (e) { appendLog('ERROR', t('run.stopFailed', { msg: e.message })); }
      });

      if (downloadBtn) {
              downloadBtn.addEventListener('click', function () {
                if (!currentRunId) return;
                window.location.href = '/api/runs/' + currentRunId + '/data/trials.csv';
              });
            }

            setStatus('idle');
            if (runProgress) runProgress.textContent = '0%';
          }

        // ---------------------------------------------------------------
        // Design project files (local folder + <folderName>.psyclaw marker)
                // Welcome gate: no path → folder picker; path set → workspace
                // ---------------------------------------------------------------
                function wireProjectFiles() {
              var B = window.PsyClawBuilder;
              if (!B) {
                console.error('[psyclaw] wireProjectFiles: PsyClawBuilder missing');
                return;
              }

              var RECENT_KEY = 'psyclaw.recentProjects';
              var RECENT_MAX = 10;

              var newBtn = document.getElementById('builder-new-btn');
              var openBtn = document.getElementById('builder-open-btn');
              var saveBtn = document.getElementById('builder-save-btn');
              var saveAsBtn = document.getElementById('builder-saveas-btn');
              var welcomeOpenBtn = document.getElementById('welcome-open-btn');
              var welcomeNewBtn = document.getElementById('welcome-new-btn');
              var welcomeEl = document.getElementById('welcome');
              var workspaceEl = document.getElementById('workspace');
              var recentListEl = document.getElementById('welcome-recent-list');
              var busy = false;
              var workspaceOpen = false;

              function shortPath(p) {
                // Always show absolute path — never truncate to …/tail (user).
                if (!p) return '';
                return String(p);
              }

              function folderBase(p) {
                if (!p) return t('builder.untitled');
                return String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || t('builder.untitled')
              }

              function loadRecent() {
                try {
                  var raw = localStorage.getItem(RECENT_KEY);
                  var arr = raw ? JSON.parse(raw) : [];
                  if (!Array.isArray(arr)) return [];
                  return arr.filter(function (it) {
                    return it && typeof it.path === 'string' && it.path;
                  }).slice(0, RECENT_MAX);
                } catch (e) {
                  return [];
                }
              }

              function saveRecent(list) {
                try {
                  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
                } catch (e) { /* ignore quota */ }
              }

              function pushRecent(path, name) {
                if (!path) return;
                var list = loadRecent().filter(function (it) {
                  return it.path.toLowerCase() !== String(path).toLowerCase();
                });
                list.unshift({
                  path: String(path),
                  name: name || folderBase(path),
                  at: Date.now(),
                });
                saveRecent(list);
                renderRecent();
              }

              function removeRecent(path) {
                saveRecent(loadRecent().filter(function (it) {
                  return it.path.toLowerCase() !== String(path).toLowerCase();
                }));
                renderRecent();
              }

              function renderRecent() {
                if (!recentListEl) return;
                var list = loadRecent();
                recentListEl.innerHTML = '';
                list.forEach(function (it) {
                  var li = document.createElement('li');
                  var btn = document.createElement('button');
                  btn.type = 'button';
                  btn.className = 'welcome-recent-item';
                  btn.dataset.path = it.path;
                  btn.title = it.path;
                  var nameSp = document.createElement('span');
                  nameSp.className = 'welcome-recent-name';
                  nameSp.textContent = it.name || folderBase(it.path);
                  var pathSp = document.createElement('span');
                  pathSp.className = 'welcome-recent-path';
                  pathSp.textContent = it.path;
                  btn.appendChild(nameSp);
                  btn.appendChild(pathSp);
                  btn.addEventListener('click', function () {
                    if (busy) return;
                    doOpenAt(it.path, { fromWelcome: true });
                  });
                  li.appendChild(btn);
                  recentListEl.appendChild(li);
                });
              }

              function setWorkspaceOpen(on) {
                workspaceOpen = !!on;
                document.body.classList.toggle('has-project', workspaceOpen);
                document.body.classList.toggle('no-project', !workspaceOpen);
                if (workspaceEl) {
                  if (workspaceOpen) workspaceEl.removeAttribute('hidden');
                  else workspaceEl.setAttribute('hidden', '');
                }
                if (welcomeEl) {
                  welcomeEl.hidden = workspaceOpen;
                  if (workspaceOpen) welcomeEl.setAttribute('aria-hidden', 'true');
                  else welcomeEl.removeAttribute('aria-hidden');
                }
                if (workspaceOpen && B.render) {
                  setTimeout(function () { B.render(); }, 0);
                }
                if (!workspaceOpen) renderRecent();
              }

              function afterProjectReady() {
                var st = B.getFileState && B.getFileState();
                if (st && st.path) {
                  pushRecent(st.path, st.name);
                  setWorkspaceOpen(true);
                }
                updateFileUi(st);
                // notify System disk probe of new path
                document.dispatchEvent(new CustomEvent('psyclaw:project-opened', {
                  detail: st || {},
                }));
              }

              function setWelcomeStatus(msg, kind) {
                              var el = document.getElementById('welcome-status');
                              if (!el) return;
                              el.classList.remove('is-error', 'is-ok');
                              if (!msg) {
                                el.hidden = true;
                                el.textContent = '';
                                return;
                              }
                              el.hidden = false;
                              el.textContent = msg;
                              if (kind === 'error') el.classList.add('is-error');
                              if (kind === 'ok') el.classList.add('is-ok');
                            }

                            function setBusy(on, label) {
                              busy = !!on;
                              [newBtn, openBtn, saveBtn, saveAsBtn, welcomeOpenBtn, welcomeNewBtn].forEach(function (btn) {
                                if (!btn) return;
                                btn.disabled = busy;
                                btn.classList.toggle('is-busy', busy);
                              });
                              if (recentListEl) {
                                recentListEl.querySelectorAll('button').forEach(function (b) {
                                  b.disabled = busy;
                                });
                              }
                              if (saveBtn && !on) {
                                if (saveBtn.dataset.lab) {
                                  saveBtn.textContent = saveBtn.dataset.lab;
                                  delete saveBtn.dataset.lab;
                                }
                              }
                              if (saveAsBtn && !on) {
                                if (saveAsBtn.dataset.lab) {
                                  saveAsBtn.textContent = saveAsBtn.dataset.lab;
                                  delete saveAsBtn.dataset.lab;
                                }
                              }
                              if (on && label) {
                                var t = saveBtn && saveBtn === document.activeElement ? saveBtn : (saveAsBtn || saveBtn);
                                if (t && !t.dataset.lab) {
                                  t.dataset.lab = t.textContent;
                                  t.textContent = label;
                                }
                                // Welcome has no file-bar — surface dialog state here
                                if (!workspaceOpen) {
                                  setWelcomeStatus(
                                    'Folder dialog open — folder picker should appear in front (large Explorer dialog). Alt+Tab if hidden. Buttons stay locked until it closes.',
                                    null
                                  );
                                }
                              } else if (!on && !workspaceOpen) {
                                // leave any error/ok message until next open; clear generic busy text
                                var ws = document.getElementById('welcome-status');
                                if (ws && /Folder dialog open/.test(ws.textContent || '')) {
                                  setWelcomeStatus('');
                                }
                              }
                            }

              function updateFileUi(detail) {
                detail = detail || (B.getFileState && B.getFileState()) || {};
                var dirty = !!detail.dirty;
                var path = detail.path || '';
                var name = detail.name || t('builder.untitled')
                var statusEl = document.getElementById('builder-file-status');
                var nameEl = document.getElementById('builder-file-name');
                var stateEl = document.getElementById('builder-file-state');
                var labelEl = document.getElementById('builder-file-label');
                var dirtyEl = document.getElementById('builder-dirty-dot');

                if (dirtyEl) {
                  dirtyEl.hidden = false;
                  dirtyEl.removeAttribute('hidden');
                  dirtyEl.classList.toggle('is-dirty', dirty);
                  dirtyEl.classList.toggle('is-saved', !dirty && !!path);
                  dirtyEl.title = dirty
                    ? t('builder.dirtyTitle')
                    : (path ? t('builder.cleanTitle') : t('builder.notSavedFolder'));
                }
                if (statusEl) {
                  statusEl.classList.toggle('is-dirty', dirty);
                  statusEl.classList.toggle('is-saved', !dirty && !!path);
                  statusEl.title = path
                                      ? (path + (dirty ? ' · ' + t('builder.dirtyTitle') : ' · ' + t('builder.cleanTitle')))
                                      : t('builder.notSavedFolder');
                                  }
                                  if (nameEl) nameEl.textContent = name || t('builder.untitled');
                                  if (stateEl) {
                                    if (!path) {
                                      stateEl.textContent = dirty ? t('builder.unsavedDraft') : t('builder.notSaved');
                                    } else {
                                      stateEl.textContent = dirty
                                        ? (t('builder.unsavedDraft') + ' · ' + shortPath(path))
                                        : t('builder.saved', { path: shortPath(path) });
                                    }
                                  }
                if (labelEl) {
                  labelEl.textContent = path
                    ? ((dirty ? '● ' : '') + shortPath(path) + (name ? ' · ' + name : ''))
                    : (dirty ? '● ' : '') + t('builder.untitled') + ' · ' + t('builder.notSaved');
                }
              }

              document.addEventListener('psyclaw:file-state', function (ev) {
                updateFileUi(ev.detail || {});
              });
              updateFileUi();

              function confirmDiscard() {
                if (B.isDirty && B.isDirty()) {
                  return window.confirm(t('dlg.discard'));
                }
                return true;
              }

              async function apiJson(url, body) {
                var r = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body || {}),
                });
                var j = await r.json().catch(function () { return {}; });
                return { ok: r.ok, status: r.status, j: j };
              }

              async function designsRoot() {
                var listR = await fetch('/api/projects').then(function (r) { return r.json(); }).catch(function () { return null; });
                return (listR && listR.root) || '';
              }

              /**
               * Native OS folder browser via host (Flask).
               * Returns { path } | { cancelled:true } | { error }.
               */
              async function pickFolder(title, initialdir) {
                var res;
                var stateEl = document.getElementById('builder-file-state');
                try {
                  if (stateEl) {
                    stateEl.dataset.prev = stateEl.textContent;
                    stateEl.textContent = t('dlg.folderBusy');
                  }
                  res = await apiJson('/api/dialog/folder', {
                    title: title || 'Select folder',
                    initialdir: initialdir || undefined,
                  });
                } catch (err) {
                  return { error: 'Folder dialog request failed: ' + (err && err.message ? err.message : err) };
                } finally {
                  if (stateEl && stateEl.dataset.prev != null) {
                    stateEl.textContent = stateEl.dataset.prev;
                    delete stateEl.dataset.prev;
                  }
                }
                if (!res || !res.j) return { error: 'Folder dialog: empty response (HTTP ' + (res && res.status) + ')' };
                if (res.j.cancelled) return { cancelled: true };
                if (res.j.path) return { path: String(res.j.path), backend: res.j.backend };
                if (!res.ok || res.j.ok === false) {
                  return { error: res.j.error || ('Folder dialog failed (HTTP ' + res.status + ')') };
                }
                return { cancelled: true };
              }

              async function openProjectAt(path) {
                path = String(path || '').trim();
                if (!path) return false;
                var res = await apiJson('/api/projects/open', { path: path, create: false });
                if (!res.ok || !res.j.ok) {
                  if (res.j && res.j.code === 'foreign_folder') {
                                      alert(t('dlg.notProject', {
                                        files: ((res.j.files || []).slice(0, 12).join(', ') || '(unknown)')
                                      }));
                                      return false;
                                    }
                  if (res.j && res.j.code === 'missing') {
                    if (window.confirm(t('dlg.createInit'))) {
                      res = await apiJson('/api/projects/open', {
                        path: path,
                        create: true,
                        design: B.getDesign && JSON.parse(JSON.stringify(B.getDesign())),
                      });
                    } else {
                      return false;
                    }
                  }
                  if (!res.ok || !res.j.ok) {
                    if (res.j && res.j.code === 'empty') {
                      res = await apiJson('/api/projects/open', {
                        path: path,
                        create: true,
                        design: B.getDesign && JSON.parse(JSON.stringify(B.getDesign())),
                      });
                    }
                  }
                  if (!res.ok || !res.j.ok) {
                    alert((res.j && res.j.error) || t('dlg.openFailed'));
                    return false;
                  }
                }
                B.setDesign(res.j.design, { clean: true, path: res.j.path });
                afterProjectReady();
                return true;
              }

              async function doOpenAt(path, opts) {
                opts = opts || {};
                if (busy) return false;
                if (workspaceOpen && !confirmDiscard()) return false;
                if (!path) {
                  if (opts.fromWelcome) setWelcomeStatus(t('welcome.noPath'), 'error');
                  return false;
                }
                if (opts.fromWelcome) setWelcomeStatus('Opening… ' + path);
                setBusy(true, 'Open…');
                try {
                  var ok = await openProjectAt(path);
                  if (ok) {
                    if (opts.fromWelcome) setWelcomeStatus('');
                    return true;
                  }
                  // only drop recent when folder truly gone / unusable
                  if (opts.fromWelcome) {
                    setWelcomeStatus(t('welcome.couldNotOpen', { path: path }), 'error');
                    try {
                      var probe = await apiJson('/api/projects/classify', { path: path });
                      var st = probe && probe.j && (probe.j.status || probe.j.code);
                      if (st === 'missing' || st === 'foreign' || st === 'not_dir') {
                        removeRecent(path);
                        setWelcomeStatus(t('welcome.staleRecent', { st: st }), 'error');
                      }
                    } catch (ignore) { /* keep recent */ }
                  }
                  return false;
                } catch (err) {
                  var msg = 'Open error: ' + (err && err.message ? err.message : err);
                  if (opts.fromWelcome) setWelcomeStatus(msg, 'error');
                  else alert(msg);
                  return false;
                } finally {
                  setBusy(false);
                }
              }

              async function doOpenDialog() {
                if (busy) return;
                if (workspaceOpen && !confirmDiscard()) return;
                setBusy(true, 'Pick…');
                try {
                  var root = await designsRoot();
                  var cur = (B.getProjectPath && B.getProjectPath()) || root;
                  var picked = await pickFolder(t('dlg.openTitle'), cur || root);
                  if (picked.error) {
                    alert(t('welcome.dialogFailed', { error: picked.error }));
                    return;
                  }
                  if (picked.cancelled || !picked.path) return;
                  await openProjectAt(picked.path);
                } catch (err) {
                  alert(t('dlg.openError', { msg: (err && err.message ? err.message : err) }));
                } finally {
                  setBusy(false);
                }
              }

              async function doNewProject() {
                              if (busy) return;
                              if (workspaceOpen && !confirmDiscard()) return;
                              setBusy(true, 'Pick…');
                              try {
                                // Do NOT reset design until folder is confirmed — cancel must leave
                                // previous authorized project intact (user: incomplete New keeps last).
                                var root = await designsRoot();
                                var picked = await pickFolder(t('dlg.newTitle'), root);
                                if (picked.error) {
                                  alert(t('welcome.dialogFailed', { error: picked.error }));
                                  return;
                                }
                                if (picked.cancelled || !picked.path) {
                                                                  // incomplete New — stay on current project or welcome; no wipe
                                                                  return;
                                                                }
                                                                // Snapshot current project so create-fail / foreign can restore
                                                                var prevDesign = null;
                                                                var prevPath = null;
                                                                var prevDirty = false;
                                                                try {
                                                                  if (B.getDesign) prevDesign = JSON.parse(JSON.stringify(B.getDesign()));
                                                                  prevPath = (B.getProjectPath && B.getProjectPath()) || null;
                                                                  prevDirty = !!(B.isDirty && B.isDirty());
                                                                } catch (ignoreSnap) { /* */ }
                                                                function restorePrev() {
                                  if (!prevDesign || !B.setDesign) return;
                                  // Always reattach path; dirty edge-case → clean restore (path > dirty flag)
                                  B.setDesign(prevDesign, { clean: true, path: prevPath });
                                  updateFileUi(B.getFileState && B.getFileState());
                                }
                                                                // Only now seed factory template into the chosen empty folder
                                                                if (B.resetDefault) B.resetDefault();
                                                                var seed = B.getDesign ? JSON.parse(JSON.stringify(B.getDesign())) : null;
                                                                var base = folderBase(picked.path);
                                                                if (seed) seed.name = base;
                                                                var res = await apiJson('/api/projects/open', {
                                                                  path: picked.path,
                                                                  create: true,
                                                                  design: seed,
                                                                });
                                                                if (!res.ok || !res.j.ok) {
                                                                  if (res.j && res.j.code === 'foreign_folder') {
                                                                                        alert(t('dlg.foreignHasFiles', {
                                                                                          files: ((res.j.files || []).slice(0, 8).join(', ') || '')
                                                                                        }));
                                                                                        restorePrev();
                                                                                      } else if ((res.j && res.j.code === 'project') || (res.j && res.j.error && /already a project/i.test(res.j.error))) {
                                                                    if (window.confirm(t('dlg.alreadyProject'))) {
                                                                      await openProjectAt(picked.path);
                                                                    } else {
                                                                      restorePrev();
                                                                    }
                                                                  } else {
                                                                    alert((res.j && res.j.error) || t('dlg.newFailed'));
                                                                    restorePrev();
                                                                  }
                                                                  return;
                                                                }
                                B.setDesign(res.j.design, { clean: true, path: res.j.path });
                                afterProjectReady();
                                setWelcomeStatus('');
                              } catch (err) {
                                setWelcomeStatus(t('dlg.newError', { msg: (err && err.message ? err.message : err) }), 'error');
                                alert(t('dlg.newError', { msg: (err && err.message ? err.message : err) }));
                              } finally {
                                setBusy(false);
                              }
                            }

              async function saveTo(path) {
                var design = B.getDesign && B.getDesign();
                if (!design) {
                  alert(t('dlg.noDesign'));
                  return false;
                }
                var res = await apiJson('/api/projects/save', { path: path, design: design });
                if (!res.ok || !res.j.ok) {
                  if (res.j && res.j.code === 'foreign_folder') {
                    alert(t('dlg.refusedNotProject'));
                  } else if (res.j && (res.j.code === 'missing' || res.j.code === 'empty')) {
                    var openRes = await apiJson('/api/projects/open', {
                      path: path,
                      create: true,
                      design: design,
                    });
                    if (!openRes.ok || !openRes.j.ok) {
                      alert((openRes.j && openRes.j.error) || (res.j && res.j.error) || t('dlg.saveFailed'));
                      return false;
                    }
                    B.setDesign(design, { clean: true, path: openRes.j.path });
                    afterProjectReady();
                    return true;
                  } else {
                    alert((res.j && res.j.error) || (t('dlg.saveFailedHttp', { status: res.status })));
                  }
                  return false;
                }
                B.markClean(res.j.path);
                afterProjectReady();
                return true;
              }

              async function doSaveAs() {
                if (busy) return;
                setBusy(true, 'Pick…');
                try {
                  var root = await designsRoot();
                  var curPath = (B.getProjectPath && B.getProjectPath()) || root;
                  var picked = await pickFolder(t('dlg.saveTitle'), curPath);
                  if (picked.error) {
                    var fallbackName = window.prompt(
                      'Folder dialog failed:\n' + picked.error +
                      '\n\nSave under designs/ as folder name:',
                      (B.getDesign && B.getDesign().name) || 'untitled'
                    );
                    if (!fallbackName) return;
                    fallbackName = String(fallbackName).trim().replace(/[\\/:*?"<>|]/g, '_');
                    if (!fallbackName) return;
                    if (!root) {
                      alert(t('dlg.noRoot'));
                      return;
                    }
                    var join = root.replace(/[\\/]+$/, '') + '\\' + fallbackName;
                    await saveTo(join);
                    return;
                  }
                  if (picked.cancelled || !picked.path) return;
                  var design = B.getDesign && JSON.parse(JSON.stringify(B.getDesign()));
                  if (design) {
                    var base = folderBase(picked.path);
                    if (base && (!design.name || design.name === 'untitled')) design.name = base;
                  }
                  var res = await apiJson('/api/projects/save', { path: picked.path, design: design });
                  if (!res.ok || !res.j.ok) {
                    if (res.j && res.j.code === 'foreign_folder') {
                      alert(t('dlg.refusedNonProjectFiles'));
                      return;
                    }
                    if (res.j && (res.j.code === 'missing' || res.j.code === 'empty')) {
                      var openRes = await apiJson('/api/projects/open', {
                        path: picked.path,
                        create: true,
                        design: design,
                      });
                      if (!openRes.ok || !openRes.j.ok) {
                        alert((openRes.j && openRes.j.error) || (res.j && res.j.error) || t('dlg.saveAsFailed'));
                        return;
                      }
                      if (design) B.setDesign(design, { clean: true, path: openRes.j.path });
                      else B.markClean(openRes.j.path);
                      afterProjectReady();
                      return;
                    }
                    alert((res.j && res.j.error) || (t('dlg.saveAsFailedHttp', { status: res.status })));
                    return;
                  }
                  if (design) B.setDesign(design, { clean: true, path: res.j.path });
                  else B.markClean(res.j.path);
                  afterProjectReady();
                } catch (err) {
                  alert(t('dlg.saveAsError', { msg: (err && err.message ? err.message : err) }));
                } finally {
                  setBusy(false);
                }
              }

              function doCloseProject() {
                if (busy) return;
                if (!confirmDiscard()) return;
                if (B.resetDefault) B.resetDefault();
                setWorkspaceOpen(false);
                updateFileUi(B.getFileState && B.getFileState());
                document.dispatchEvent(new CustomEvent('psyclaw:project-closed'));
              }

              if (newBtn) newBtn.addEventListener('click', function () { doNewProject(); });
              if (openBtn) openBtn.addEventListener('click', function () { doOpenDialog(); });
              if (welcomeNewBtn) welcomeNewBtn.addEventListener('click', function () { doNewProject(); });
              if (welcomeOpenBtn) welcomeOpenBtn.addEventListener('click', function () { doOpenDialog(); });

              if (saveBtn) {
                saveBtn.addEventListener('click', async function () {
                  if (busy) return;
                  var path = B.getProjectPath && B.getProjectPath();
                  if (!path) {
                    await doSaveAs();
                    return;
                  }
                  setBusy(true, t('dlg.busySave'));
                  try {
                    await saveTo(path);
                  } catch (err) {
                    alert(t('dlg.saveError', { msg: (err && err.message ? err.message : err) }));
                  } finally {
                    setBusy(false);
                  }
                });
              }

              if (saveAsBtn) {
                saveAsBtn.addEventListener('click', function () {
                  doSaveAs();
                });
              }

              window.addEventListener('beforeunload', function (e) {
                if (B.isDirty && B.isDirty()) {
                  e.preventDefault();
                  e.returnValue = '';
                }
              });

              // Boot: auto-open last authorized project when present.
                            // Welcome only if no recent, open fails, or user is mid incomplete New
                            // (cancel leaves prior project; no project yet → stay on gate).
                                          window.__psyclawUpdateFileUi = updateFileUi;
                                          renderRecent();
                                          setWorkspaceOpen(false);

                                          (async function tryAutoOpenLast() {
                                            var list = loadRecent();
                                            if (!list.length) return;
                                            var last = list[0];
                                            if (!last || !last.path) return;
                                            setWelcomeStatus(
                                              (typeof t === 'function' ? t('welcome.autoOpen', { name: last.name || folderBase(last.path) }) : ('Opening… ' + (last.name || last.path))),
                                              null
                                            );
                                            var ok = await doOpenAt(last.path, { fromWelcome: true, auto: true });
                                            if (!ok && !workspaceOpen) {
                                              // stay on welcome; doOpenAt already surfaces status / drops stale
                                            }
                                          })();
                                        }

      // ---------------------------------------------------------------
      // Settings tab
      // ---------------------------------------------------------------
      function wireSettingsTab() {
                    var snapCb = document.getElementById('settings-snap');
                    var snapDesc = document.getElementById('settings-snap-desc');
                    var onsetCb = document.getElementById('settings-preview-onset');
                    var imeCb = document.getElementById('settings-force-en-ime');

                    function syncFromBuilder() {
                      var B = window.PsyClawBuilder;
                      if (!B) return;
                      if (snapCb && typeof B.isSnapEnabled === 'function') {
                        snapCb.checked = !!B.isSnapEnabled();
                      }
                      if (snapDesc && typeof B.getSnapMs === 'function') {
                        var ms = B.getSnapMs();
                        snapDesc.textContent =
                          t('settings.snapDescMs', { ms: ms });
                      }
                      if (onsetCb && typeof B.isPreviewOnsetClick === 'function') {
                        onsetCb.checked = !!B.isPreviewOnsetClick();
                      }
                      if (imeCb) {
                        try {
                          var v = localStorage.getItem('psyclaw.forceEnIme');
                          imeCb.checked = (v === null || v === undefined || v === '') ? true : (v === '1' || v === 'true');
                        } catch (e) { imeCb.checked = true; }
                      }
                    }

                    if (snapCb) {
                      snapCb.addEventListener('change', function () {
                        var B = window.PsyClawBuilder;
                        if (B && typeof B.setSnapEnabled === 'function') {
                          B.setSnapEnabled(snapCb.checked);
                        }
                      });
                    }
                    if (onsetCb) {
                      onsetCb.addEventListener('change', function () {
                        var B = window.PsyClawBuilder;
                        if (B && typeof B.setPreviewOnsetClick === 'function') {
                          B.setPreviewOnsetClick(onsetCb.checked);
                        }
                      });
                    }
                    if (imeCb) {
                      imeCb.addEventListener('change', function () {
                        try {
                          localStorage.setItem('psyclaw.forceEnIme', imeCb.checked ? '1' : '0');
                        } catch (e) {}
                      });
                    }

              // left nav panels
              var navBtns = document.querySelectorAll('.settings-nav-btn');
              var panels = document.querySelectorAll('.settings-panel');
              navBtns.forEach(function (btn) {
                btn.addEventListener('click', function () {
                  var id = btn.getAttribute('data-settings-panel');
                  navBtns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
                  panels.forEach(function (p) {
                    var match = p.getAttribute('data-settings-panel') === id;
                    p.classList.toggle('is-active', match);
                    if (match) p.removeAttribute('hidden');
                    else p.setAttribute('hidden', '');
                  });
                });
              });

              document.querySelectorAll('.tab-btn').forEach(function (btn) {
                if (btn.dataset.tab === 'settings') {
                  btn.addEventListener('click', function () { setTimeout(syncFromBuilder, 0); });
                }
              });

              // Language
              document.querySelectorAll('[data-lang-opt]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                  var id = btn.getAttribute('data-lang-opt');
                  if (window.PsyClawI18n && window.PsyClawI18n.setLang) {
                    window.PsyClawI18n.setLang(id);
                  }
                });
              });
              setTimeout(syncFromBuilder, 0);
            }

      // ---------------------------------------------------------------
      // Bootstrap
      // ---------------------------------------------------------------

        document.addEventListener('psyclaw:langchange', function () {
          try {
            if (window.PsyClawI18n && window.PsyClawI18n.applyDom) window.PsyClawI18n.applyDom();
            if (window.PsyClawBuilder && window.PsyClawBuilder.render) window.PsyClawBuilder.render();
            // refresh file status chip + run hints
            try {
              var B = window.PsyClawBuilder;
              if (B && B.getDesign && typeof window.__psyclawUpdateFileUi === 'function') {
                window.__psyclawUpdateFileUi();
              }
            } catch (e0) {}
            var modeHint = document.getElementById('run-mode-hint');
            if (modeHint) modeHint.textContent = t('run.modeHint');
            var snapDesc = document.getElementById('settings-snap-desc');
            if (snapDesc && window.PsyClawBuilder && window.PsyClawBuilder.getSnapMs) {
              snapDesc.textContent = t('settings.snapDescMs', { ms: window.PsyClawBuilder.getSnapMs() });
            }
            // re-paint system host panels if we have a snapshot
                        try {
                          if (lastSystemSnapshot && typeof renderDeviceFigure === 'function') {
                            renderDeviceFigure(
                              lastSystemSnapshot.facts,
                              lastSystemSnapshot.checks,
                              lastSystemSnapshot.overall,
                              lastSystemSnapshot.counts,
                              lastSystemSnapshot.browserExtra
                            );
                          }
                        } catch (e1) {}
            // idle probe labels if not armed
            var keyArm = document.getElementById('sys-key-arm');
            var keyResult = document.getElementById('sys-key-result');
            if (keyArm && keyArm.textContent && keyArm.textContent.indexOf('…') < 0 && keyArm.textContent.indexOf('Waiting') < 0) {
              keyArm.textContent = t('sys.kbArm');
              if (keyResult && /idle|空闲|disarmed|已取消/.test(keyResult.textContent || '')) keyResult.textContent = t('sys.kbIdle');
            }
            var mouseArm = document.getElementById('sys-mouse-arm');
            var mouseResult = document.getElementById('sys-mouse-result');
            if (mouseArm && mouseArm.textContent && mouseArm.textContent.indexOf('…') < 0 && mouseArm.textContent.indexOf('Waiting') < 0) {
              mouseArm.textContent = t('sys.mouseArm');
              if (mouseResult && /idle|空闲|disarmed|已取消/.test(mouseResult.textContent || '')) mouseResult.textContent = t('sys.mouseIdle');
            }
          } catch (e) { /* ignore */ }
        });
      function boot() {
        activateTab('flow');
        wireSystemTab();
        wireRunTab();
                wireProjectFiles();
                wireSettingsTab();
                wireNetStatus();
                document.querySelectorAll('.tab-btn').forEach(function (btn) {
                  btn.addEventListener('click', function () {
                    if (!window.PsyClawBuilder) return;
                    if (btn.dataset.tab === 'flow') {
                      setTimeout(function () { window.PsyClawBuilder.render(); }, 0);
                    }
                    // Display card is on System — refresh design.display fields when tab opens
                    if (btn.dataset.tab === 'system' && window.PsyClawBuilder.renderDisplayPanel) {
                      setTimeout(function () { window.PsyClawBuilder.renderDisplayPanel(); }, 0);
                    }
                  });
                });
        if (window.PsyClawBuilder) {
          setTimeout(function () { window.PsyClawBuilder.render(); }, 0);
        }
      }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
