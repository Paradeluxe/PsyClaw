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
  var systemCheckInFlight = false;
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

  function _summarizeInputs(list, kind) {
    // kind: 'keyboard' | 'mouse' | undefined — collapses multi-HID noise (one physical → many Win32 rows)
    list = list || [];
    if (!list.length) {
      return { text: t('sys.notDetected'), conn: 'other', multi: false, title: '', empty: true, status: 'info' };
    }
    function isVirtual(d) {
      var s = ((d && d.instance_id) || '') + ' ' + ((d && d.name) || '');
      return /GVINPUT|GameViewer|AskLink|ALBHID|ALHID|VIRTUAL|RDP|VMware|vhid|TsUsb|Citrix|Parsec|Sunshine|Virtual\s*HID/i.test(s);
    }
    function physicalKey(d) {
      var id = String((d && d.instance_id) || '');
      var m = id.match(/VID_[0-9A-F]+&PID_[0-9A-F]+/i);
      if (m) return m[0].toUpperCase();
      // same composite root without VID (e.g. HID\FOO&COL01)
      m = id.match(/^(?:HID|USB)\\([^\\]+)/i);
      if (m) return m[1].replace(/&COL[0-9A-F]+$/i, '').toUpperCase();
      return id.toUpperCase() || String((d && d.name) || '');
    }
    function isGenericName(n) {
      n = String(n || '').trim();
      return !n || /^(HID-compliant\s+(mouse|device|consumer control device)|USB\s+Input\s+Device|USB\s+Pointing\s+Device|HID Keyboard Device|Enhanced \(101- or 102-key\)|Standard PS\/2 Keyboard|PS\/2 Compatible Mouse)$/i.test(n);
    }
    function vendorLabel(d) {
      var id = String((d && d.instance_id) || '');
      var m = id.match(/VID_([0-9A-F]{4})/i);
      if (!m) return '';
      var map = {
        '046D': 'Logitech',
        '045E': 'Microsoft',
        '05AC': 'Apple',
        '1532': 'Razer',
        '0951': 'HyperX',
        '1B1C': 'Corsair',
        '0B05': 'ASUS',
        '1038': 'SteelSeries',
        '04F2': 'Chicony',
        '0A5C': 'Broadcom',
        '8087': 'Intel',
        '0BDA': 'Realtek',
      };
      return map[m[1].toUpperCase()] || '';
    }
    function shortLabel(d) {
      var v = vendorLabel(d);
      if (v) return v;
      var n = String((d && d.name) || '').trim();
      if (!isGenericName(n)) return n;
      return '';
    }
    var real = list.filter(function (d) { return !isVirtual(d); });
    var onlyVirtual = !real.length && list.length > 0;
    var pool = real.length ? real : list;
    // collapse HID collections → one row per physical device
    var byPhys = {};
    var physOrder = [];
    pool.forEach(function (d) {
      var k = physicalKey(d);
      if (!byPhys[k]) {
        byPhys[k] = d;
        physOrder.push(k);
      } else {
        // prefer VID entry / non-generic name
        var cur = byPhys[k];
        var score = function (x) {
          var s = 0;
          if (/VID_/i.test(x.instance_id || '')) s += 2;
          if (shortLabel(x)) s += 1;
          return s;
        };
        if (score(d) > score(cur)) byPhys[k] = d;
      }
    });
    var ranked = physOrder.map(function (k) { return byPhys[k]; }).sort(function (a, b) {
      var order = { bluetooth: 0, usb: 1, ps2: 2, 'built-in': 3, other: 4 };
      var sa = order[a.connection] != null ? order[a.connection] : 5;
      var sb = order[b.connection] != null ? order[b.connection] : 5;
      var na = /VID_/i.test(a.instance_id || '') ? 0 : 1;
      var nb = /VID_/i.test(b.instance_id || '') ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return na - nb;
    });
    var primary = ranked[0];
    var conn = primary.connection || 'other';
    var labels = [];
    ranked.forEach(function (d) {
      var lab = shortLabel(d);
      if (lab && labels.indexOf(lab) < 0) labels.push(lab);
    });
    var nPhys = ranked.length;
    var noun = (kind === 'keyboard')
      ? (nPhys === 1 ? 'keyboard' : 'keyboards')
      : (kind === 'mouse')
        ? (nPhys === 1 ? 'mouse' : 'mice')
        : (nPhys === 1 ? 'device' : 'devices');
    // Compact face: USB · Logitech  |  USB · Logitech (+1)  |  USB · 2 mice
    var text;
    if (labels.length === 1 && nPhys === 1) {
      text = _connLabel(conn) + ' · ' + labels[0];
    } else if (labels.length === 1 && nPhys > 1) {
      text = _connLabel(conn) + ' · ' + labels[0] + ' (+' + (nPhys - 1) + ')';
    } else if (labels.length >= 2) {
      text = _connLabel(conn) + ' · ' + labels.slice(0, 2).join(' · ');
      if (nPhys > 2) text += ' (+' + (nPhys - 2) + ')';
    } else {
      // all generic names after collapse
      text = _connLabel(conn) + ' · ' + (nPhys > 1 ? (nPhys + ' ' + noun) : noun);
    }
    var st = onlyVirtual ? 'warn' : 'pass';
    var titleBits = ranked.map(function (d) {
      var lab = shortLabel(d) || d.name || '?';
      return _connLabel(d.connection) + ': ' + lab + (d.instance_id ? ' · ' + d.instance_id : '');
    });
    if (onlyVirtual) titleBits.push('(virtual only)');
    if (list.length > nPhys) titleBits.push('(' + list.length + ' HID rows → ' + nPhys + ' physical)');
    return {
      text: text,
      conn: conn,
      multi: nPhys > 1,
      title: titleBits.join('\n'),
      empty: false,
      status: st,
      count: nPhys,
    };
  }


  /** Mic / speaker summary. Prefer real OK endpoints over drivers/virtual. */
  var lastHostMics = [];
  function _summarizeNameDevices(list, emptyKey) {
    list = list || [];
    function isVirt(d) {
      if (d && d.virtual) return true;
      var s = String((d && (d.name || d.label)) || '') + ' ' + String((d && d.instance_id) || '') + ' ' + String((d && d.deviceId) || '');
      return /VIRTUAL|VB-?AUDIO|CABLE\s*INPUT|CABLE\s*OUTPUT|STEREO\s*MIX|WHAT\s*U\s*HEAR|NVIDIA\s*VIRTUAL|NVIDIA\s*BROADCAST|\bBROADCAST\b|DEFAULT\s*-|COMMUNICATIONS\s*-/i.test(s);
    }
    function isGenericMicLabel(d) {
      var n = String((d && (d.name || d.label)) || '').trim();
      // Browser placeholders before permission / bare defaults — not proof of hardware
      return !n || /^(microphone|mic|麦克风|unnamed|default)$/i.test(n);
    }
    function statusOk(d) {
      var st = String((d && d.status) || '').toUpperCase();
      // browser lists have no status → ok unless host said unplugged/disabled
      if (!st) return true;
      if (st === 'OK' || st === 'STARTED' || st === 'ACTIVE') return true;
      return false; // Unplugged / NotPresent / Disabled / Unknown
    }
    var okPool = list.filter(statusOk);
    var pool = okPool.length ? okPool : [];
    var real = pool.filter(function (d) { return !isVirt(d) && !isGenericMicLabel(d); });
    var use = real.length ? real : pool.filter(function (d) { return !isGenericMicLabel(d); });
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
    var onlyVirtual = !real.length && use.length > 0;
    // pass = at least one real OK endpoint; warn = driver-only or virtual-only
    var st = (driverOnly || onlyVirtual) ? 'warn' : 'pass';
    var titleBits = names.slice();
    if (driverOnly) titleBits.push('(sound driver — not a playback endpoint)');
    if (onlyVirtual) titleBits.push('(virtual only — no physical microphone)');
    return {
      text: text,
      empty: false,
      title: titleBits.join('\n'),
      conn: 'other',
      multi: names.length > 1,
      status: st,
    };
  }


  function _monConnLabel(c) {
    c = String(c || '').toLowerCase();
    if (c === 'hdmi') return 'HDMI';
    if (c === 'displayport' || c === 'dp') return 'DisplayPort';
    if (c === 'dvi') return 'DVI';
    if (c === 'vga') return 'VGA';
    if (c === 'internal') return 'Internal';
    if (c === 'miracast' || c === 'wireless') return 'Wireless';
    return '';
  }

  /** Per-monitor trust: backend trust field, with client-side safety net. */
  function _monitorTrust(m) {
    m = m || {};
    var t0 = String(m.trust || '').toLowerCase();
    if (t0 === 'real' || t0 === 'geometry' || t0 === 'virtual' || t0 === 'unknown') return t0;
    var nm = String(m.name || '').trim();
    var blob = [nm, m.label, m.manufacturer, m.device, m.instance, m.connection].join(' ');
    if (m.virtual || /virtual|mirror|rdp|vmware|vbox|hyper-?v|parsec|sunshine|idd_|basicrender|citrix/i.test(blob)) {
      return 'virtual';
    }
    if (String(m.connection || '').toLowerCase() === 'miracast') return 'virtual';
    if (String(m.source || '').toLowerCase() === 'edid' && nm && !m.generic) return 'real';
    if (nm && !/^(generic|default\s+monitor)/i.test(nm) && !/pnp monitor/i.test(nm) && !m.generic) return 'real';
    if ((m.width && m.height) || String(m.source || '') === 'geometry') return 'geometry';
    return 'unknown';
  }

  /** Monitor list → text + pass/warn. Pass if ≥1 real; virtual-only/geometry-only → warn. */
  function _summarizeMonitors(list, browserDetail, refreshHz) {
    list = list || [];
    if (!list.length) {
      var fb = browserDetail || '';
      if (fb && fb !== '—' && fb !== '\u2014') {
        return {
          text: fb + (refreshHz && refreshHz !== '—' && refreshHz !== '\u2014' ? (' \u00b7 ' + refreshHz) : ''),
          empty: false,
          multi: false,
          title: 'Browser screen only (no host EDID)',
          status: 'warn',
        };
      }
      return { text: t('sys.notDetected') || 'Not detected', empty: true, multi: false, title: '', status: 'info' };
    }
    // Prefer real panels in the visible line
    var ranked = list.slice().sort(function (a, b) {
      var _rank = { real: 0, geometry: 1, unknown: 2, virtual: 3 };
      var ra = _rank[_monitorTrust(a)]; if (ra == null) ra = 9;
      var rb = _rank[_monitorTrust(b)]; if (rb == null) rb = 9;
      if (ra !== rb) return ra - rb;
      return (b.primary ? 1 : 0) - (a.primary ? 1 : 0);
    });
    var parts = [];
    var titles = [];
    var nReal = 0, nVirt = 0, nGeom = 0, nUnk = 0;
    for (var i = 0; i < ranked.length; i++) {
      var m = ranked[i] || {};
      var trust = _monitorTrust(m);
      if (trust === 'real') nReal++;
      else if (trust === 'virtual') nVirt++;
      else if (trust === 'geometry') nGeom++;
      else nUnk++;
      var wh = (m.width && m.height) ? (m.width + '\u00d7' + m.height) : '';
      var nm = String(m.name || '').trim();
      var lab = String(m.label || '').trim();
      if (!lab) {
        lab = nm || ('Monitor ' + ((m.index != null ? Number(m.index) : i) + 1));
        if (m.primary && lab.indexOf('Primary') < 0) lab += ' \u00b7 Primary';
      }
      var conn = _monConnLabel(m.connection);
      if (trust === 'virtual' && !conn) conn = 'Virtual';
      var bit = [lab, wh].filter(Boolean).join(' ');
      if (conn && bit.indexOf(conn) < 0) bit += ' \u00b7 ' + conn;
      parts.push(bit);
      var tbits = [lab, wh, conn || m.connection, m.manufacturer, m.device, m.serial, 'trust=' + trust].filter(Boolean);
      if (m.width_cm && m.height_cm) tbits.push(m.width_cm + 'cm\u00d7' + m.height_cm + 'cm');
      if (m.evidence) tbits.push('evidence=' + m.evidence);
      if (trust === 'virtual') tbits.push('(virtual display)');
      if (trust === 'geometry') tbits.push('(geometry only — no EDID product name)');
      titles.push(tbits.join(' \u00b7 '));
    }
    var text = parts.slice(0, 2).join(' \u00b7 ');
    if (parts.length > 2) text += ' \u00b7 +' + (parts.length - 2);
    if (refreshHz && refreshHz !== '—' && refreshHz !== '\u2014' && text.indexOf('Hz') < 0) {
      text = text + ' \u00b7 ' + refreshHz;
    }
    // Gate: need at least one real panel for Pass
    var st = 'pass';
    var reason = '';
    if (nReal > 0) {
      st = 'pass';
      if (nVirt > 0) reason = nReal + ' real + ' + nVirt + ' virtual';
    } else if (nVirt > 0 && nGeom === 0) {
      st = 'warn';
      reason = 'virtual display only';
    } else if (nGeom > 0 || nUnk > 0) {
      st = 'warn';
      reason = 'no EDID product name (geometry/browser only)';
    } else {
      st = 'info';
      reason = 'not detected';
    }
    var title = titles.join('\n');
    if (reason) title = title ? (title + '\n' + reason) : reason;
    return {
      text: text,
      empty: false,
      multi: parts.length > 1,
      title: title,
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

  /** I/O row with inline path-test control (KB / Mouse / Speaker). */
  function _ioTestHtml(btnId, resultId, btnLabel) {
    return (
      '<div class="sys-io-test">' +
        '<button type="button" class="btn btn-secondary sys-io-test-btn" id="' + _escHtml(btnId) + '">' +
          _escHtml(btnLabel) +
        '</button>' +
        '<span class="sys-io-test-result" id="' + _escHtml(resultId) + '"></span>' +
      '</div>'
    );
  }

  function _infoRowTest(k, vHtml, multi, title, testHtml) {
    return (
      '<div class="sys-info-row sys-info-row-test">' +
        '<div class="sys-info-k">' + _escHtml(k) + '</div>' +
        '<div class="sys-info-v' + (multi ? ' is-multi' : '') + '"' +
          (title ? ' title="' + _escHtml(title) + '"' : '') + '>' +
          vHtml +
        '</div>' +
        (testHtml || '') +
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

  /** Last host gate — Run badge reads this when idle (not mid-flight). */
  var lastRunGate = null;
  /** Best proven live run for open project: run > pilot > autopilot (normal end only). */
  var lastProvenMode = null;
  /** Env fingerprint at last successful probe; drift → stale. */
  var probeEnvFp = null;
  var systemStale = false;
  var systemStaleReason = '';
  var _envDriftTimer = null;

  function hostEnvFingerprint() {
    var parts = [];
    try {
      if (window.screen) {
        parts.push(
          's:' + screen.width + 'x' + screen.height +
          '@' + (screen.colorDepth || 0)
        );
        if (screen.availWidth != null) {
          parts.push('a:' + screen.availWidth + 'x' + screen.availHeight);
        }
      }
    } catch (e0) { /* ignore */ }
    try {
      parts.push('dpr:' + String(window.devicePixelRatio || 1));
    } catch (e1) { /* ignore */ }
    try {
      var od = window.screen && screen.orientation && screen.orientation.type;
      if (od) parts.push('o:' + od);
    } catch (e2) { /* ignore */ }
    return parts.join('|');
  }

  function markProbeEnvBaseline() {
    probeEnvFp = hostEnvFingerprint();
    systemStale = false;
    systemStaleReason = '';
  }

  function checkEnvDrift() {
    if (!probeEnvFp) return false;
    var now = hostEnvFingerprint();
    if (now === probeEnvFp) return false;
    if (!systemStale) {
      systemStale = true;
      systemStaleReason = 'display';
      try {
        var g = lastRunGate || (lastSystemSnapshot && lastSystemSnapshot.gate);
        if (g && !g.checking) {
          paintRunStatusGate(g, lastSystemSnapshot && lastSystemSnapshot.counts);
        }
      } catch (eRep) { /* ignore */ }
    }
    return true;
  }

  function scheduleEnvDriftCheck() {
    if (_envDriftTimer) clearTimeout(_envDriftTimer);
    _envDriftTimer = setTimeout(function () {
      _envDriftTimer = null;
      checkEnvDrift();
    }, 450);
  }

  function forceSystemStale(reason) {
    if (!probeEnvFp) return;
    if (systemStale && systemStaleReason === reason) return;
    systemStale = true;
    systemStaleReason = reason || 'env';
    try {
      var g = lastRunGate || (lastSystemSnapshot && lastSystemSnapshot.gate);
      if (g && !g.checking) {
        paintRunStatusGate(g, lastSystemSnapshot && lastSystemSnapshot.counts);
      }
    } catch (eFS) { /* ignore */ }
  }

  function wireEnvDriftWatchers() {
    try {
      window.addEventListener('resize', scheduleEnvDriftCheck);
    } catch (eR) { /* ignore */ }
    try {
      if (window.screen && screen.orientation && screen.orientation.addEventListener) {
        screen.orientation.addEventListener('change', scheduleEnvDriftCheck);
      }
    } catch (eO) { /* ignore */ }
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        // device list not in screen fingerprint — force stale on plug/unplug
        navigator.mediaDevices.addEventListener('devicechange', function () {
          forceSystemStale('device');
        });
      }
    } catch (eM) { /* ignore */ }
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') scheduleEnvDriftCheck();
      });
    } catch (eV) { /* ignore */ }
  }

  function formatLastProven(mode) {
    if (!mode) return '';
    var m = String(mode).toLowerCase();
    try {
      if (m === 'run' || m === 'participant') return t('run.gateLastStart') || 'Last status: Start';
      if (m === 'pilot') return t('run.gateLastPilot') || 'Last status: Pilot';
      if (m === 'autopilot') return t('run.gateLastAutopilot') || 'Last status: Autopilot';
    } catch (eF) { /* fall */ }
    if (m === 'run' || m === 'participant') return 'Last status: Start';
    if (m === 'pilot') return 'Last status: Pilot';
    if (m === 'autopilot') return 'Last status: Autopilot';
    return '';
  }

  function setLastProvenMode(mode) {
    var next = null;
    if (mode) {
      var s = String(mode).trim().toLowerCase();
      if (s === 'participant' || s === 'run' || s === 'start') next = 'run';
      else if (s === 'pilot') next = 'pilot';
      else if (s === 'autopilot') next = 'autopilot';
    }
    lastProvenMode = next;
    if (!isRunFlightActive()) {
      try {
        var g = lastRunGate || (lastSystemSnapshot && lastSystemSnapshot.gate);
        if (g && !g.checking) {
          paintRunStatusGate(g, lastSystemSnapshot && lastSystemSnapshot.counts);
        }
      } catch (eP) { /* ignore */ }
    }
  }

  function isRunFlightActive() {
    try {
      var b = document.getElementById('run-status-badge');
      if (!b) return false;
      if (b.getAttribute('data-flight') === '1') return true;
      var st = b.getAttribute('data-run-status') || '';
      return /^(starting|compiling|compiled|running)$/i.test(st);
    } catch (e) {
      return false;
    }
  }

  function formatGateProgress(counts) {
    counts = counts || {};
    var p = counts.pass || 0;
    var w = counts.warn || 0;
    var f = counts.fail || 0;
    try {
      if (typeof t === 'function') {
        return t('run.gateProgress', { pass: p, warn: w, fail: f });
      }
    } catch (e0) { /* fall */ }
    return p + ' pass · ' + w + ' warn · ' + f + ' fail';
  }

  /** Gate + check progress → #run-status-badge (Recheck button stays action-only). */
  function paintRunStatusGate(gate, counts) {
    var badge = document.getElementById('run-status-badge');
    if (!badge) return;
    if (isRunFlightActive()) {
      if (gate && !gate.checking) lastRunGate = gate;
      return;
    }
    if (!gate || gate.checking) {
      badge.textContent = t('run.gateChecking') || t('sys.checking') || 'Checking…';
      badge.className = 'status-badge status-idle gate-checking';
      badge.setAttribute('data-gate', 'checking');
      badge.removeAttribute('data-run-status');
      badge.removeAttribute('data-proven');
      badge.removeAttribute('data-stale');
      badge.title = t('sys.probing') || '';
      return;
    }
    lastRunGate = gate;
        var label = gate.label || '—';
        // Minimalist main line: Last status: Mode. Color = last proven mode; block overrides red.
        var provenTxt = formatLastProven(lastProvenMode);
        var main = provenTxt || (t('run.gateLastNone') || 'Last status: —');
        var bits = [main];
        if (systemStale) {
          bits.push(t('run.gateStaleShort') || 'stale');
        }
        badge.textContent = bits.join(' · ');
        var lvl = gate.level || gate.css || 'run';
        if (lvl === 'pass') lvl = 'run';
        if (lvl === 'warn') lvl = 'pilot';
        if (lvl === 'fail') lvl = 'block';
        var modeKey = lastProvenMode || 'none';
        // Color = last proven mode. Only real block keeps gate-block (red override).
        var cls = 'status-badge status-idle last-mode-' + modeKey;
        if (lvl === 'block') cls += ' gate-block';
        if (systemStale) cls += ' gate-stale';
        badge.className = cls;
        badge.setAttribute('data-gate', lvl);
        if (lastProvenMode) badge.setAttribute('data-proven', lastProvenMode);
        else badge.removeAttribute('data-proven');
        if (systemStale) badge.setAttribute('data-stale', '1');
        else badge.removeAttribute('data-stale');
        badge.removeAttribute('data-run-status');
        var titleBits = [];
        titleBits.push(label);
        if (gate.reason && gate.reason !== label) titleBits.push(gate.reason);
        titleBits.push(main);
        if (systemStale) {
          titleBits.push(t('run.gateStale') || 'Host may have changed — Recheck');
        }
        badge.title = titleBits.join(' · ');
      }

  function paintGate(gate, metaText, counts) {
      var n = summaryNodes();
      var metaInline = document.getElementById('sys-meta-inline');
      var gateWrap = document.getElementById('sys-gate');
      // Recheck button = action only (not Pilot/Ready label).
      if (n.btn) {
        if (!gate || gate.checking) {
          if (n.label) n.label.textContent = t('sys.recheckBusy') || t('sys.checking') || 'Checking…';
          n.btn.className = 'sys-summary status-idle is-checking';
          n.btn.title = t('sys.probing') || t('sys.recheckHint');
          setSummaryBusy(true);
        } else {
          if (n.label) n.label.textContent = t('sys.recheck') || 'Recheck';
          n.btn.className = 'sys-summary status-' + (gate.css || 'idle');
          n.btn.title = t('sys.recheckHint');
          setSummaryBusy(false);
        }
      }
      var c = counts;
      if (!c && lastSystemSnapshot && lastSystemSnapshot.counts) c = lastSystemSnapshot.counts;
      // Successful probe snapshot → reset env baseline (clears stale).
      if (gate && !gate.checking) {
        markProbeEnvBaseline();
      }
      paintRunStatusGate(gate, c);

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

        var kb = _summarizeInputs(hw.keyboards, 'keyboard');
        var mouse = _summarizeInputs(hw.mice, 'mouse');
        // Host microphones[] is authority (incl. empty = no capture endpoint).
        // Do not fall back to browser lists when probe returned the field.
        var micList = Array.isArray(hw.microphones) ? hw.microphones : lastHostMics;
        var mic = _summarizeNameDevices(micList, 'builder.ioMicNone');
        var spk = _summarizeNameDevices(hw.speakers || [], 'builder.ioSpkNone');
        var audio = _checkById(checks, 'audio_api'); // still feed I/O cards

        // Monitor row: EDID name + geometry + connection; pass/warn like Speaker
        var mons = hw.monitors || [];
        var monSum = _summarizeMonitors(mons, disp, refresh);
        var monText = monSum.text;
        var monTitle = monSum.title || monText;

        // Input status only (path tests live in Display/Speaker I/O cards below)
        var inputRows =
          _infoRow(
            t('sys.keyboard'),
            kb.empty
              ? _val('info', kb.text || t('sys.notDetected'), { pillLabel: statusLabel('info') })
              : _val(kb.status || 'pass', kb.text, { pillLabel: statusLabel(kb.status || 'pass') }),
            !!kb.multi,
            kb.title || kb.text
          ) +
          _infoRow(
            t('sys.mouse'),
            mouse.empty
              ? _val('info', mouse.text || t('sys.notDetected'), { pillLabel: statusLabel('info') })
              : _val(mouse.status || 'pass', mouse.text, { pillLabel: statusLabel(mouse.status || 'pass') }),
            !!mouse.multi,
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
          _infoRow(
            t('sys.monitor'),
            monSum.empty
              ? _val('info', monText || t('sys.notDetected'))
              : _val(monSum.status || 'pass', monText),
            !!monSum.multi,
            monTitle
          );

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

        try {
          if (typeof window.__psyclawApplyIoTests === 'function') {
            window.__psyclawApplyIoTests();
          }
        } catch (eIo) { /* path-test labels must not block host table paint */ }

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
                                                                .map(function (d) {
                                                                  var lab = (d.label || '').trim();
                                                                  var bare = !lab;
                                                                  var name = lab || (t('builder.ioMicUnnamed') || 'Microphone');
                                                                  var virt = /VIRTUAL|VB-?AUDIO|CABLE|STEREO\s*MIX|NVIDIA\s*BROADCAST|\bBROADCAST\b|DEFAULT\s*-|COMMUNICATIONS\s*-/i.test(name);
                                                                  return {
                                                                    deviceId: d.deviceId,
                                                                    label: name,
                                                                    name: name,
                                                                    virtual: virt || bare,
                                                                    source: bare ? 'browser-generic' : 'browser',
                                                                  };
                                                                });
                                                              var outs = devs.filter(function (d) { return d.kind === 'audiooutput'; })
                                                                .map(function (d) { return { deviceId: d.deviceId, name: d.label || (t('builder.ioSpkUnnamed') || 'Speaker'), label: d.label || (t('builder.ioSpkUnnamed') || 'Speaker') }; });

                                                              if (window.PsyClawBuilder) {
                                                                if (typeof window.PsyClawBuilder.setHostMics === 'function') {
                                                                  // Device picker may list browser endpoints; I/O status uses host authority
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

                                                              var hostMicKnown = Array.isArray(hw.microphones);
                                                              var hostMicSum = hostMicKnown
                                                                ? _summarizeNameDevices(hw.microphones, 'builder.ioMicNone')
                                                                : null;
                                                              var browserMicSum = _summarizeNameDevices(mics, 'builder.ioMicNone');
                                                              // Host probe is authority for I/O Mic status. Browser only fills gap when host omitted field.
                                                              var micSumForUi = hostMicKnown ? hostMicSum : browserMicSum;
                                                              if (!hostMicKnown) {
                                                                lastHostMics = mics || [];
                                                              }

                                                              if (micEl) {
                                                                if (micSumForUi && !micSumForUi.empty) {
                                                                  setIoStatus(micEl, micSumForUi.text, false);
                                                                  try { micEl.classList.toggle('is-pending', micSumForUi.status === 'info'); } catch (eP) {}
                                                                } else {
                                                                  var audioDetail = audioCheck && (audioCheck.detail || audioCheck.status);
                                                                  if (audioDetail && !hostMicKnown) {
                                                                    setIoStatus(micEl, String(audioDetail), audioCheck && audioCheck.status === 'fail');
                                                                  } else {
                                                                    setIoStatus(micEl, t('builder.ioMicNone') || 'No microphone listed', true);
                                                                  }
                                                                }
                                                              }

                                                              // Host Input panel Mic/Speaker rows — same pill+text as Engine checks
                                                              var inputMic = document.getElementById('sys-input-mic');
                                                              if (inputMic && micSumForUi) {
                                                                inputMic.innerHTML = micSumForUi.empty
                                                                  ? _val('info', micSumForUi.text || t('sys.notDetected'), { pillLabel: statusLabel('info') })
                                                                  : _val(micSumForUi.status || 'warn', micSumForUi.text, { pillLabel: statusLabel(micSumForUi.status || 'warn') });
                                                                var micV = inputMic.parentElement;
                                                                if (micV) micV.title = micSumForUi.title || micSumForUi.text || '';
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

                  async function runSystemChecks(opts) {
    opts = opts || {};
    var forceFresh = !!opts.fresh;
    var allEl = document.getElementById('sys-checks-all')
      || document.getElementById('sys-checks-host');
    var overallEl = document.getElementById('sys-overall');
    var elapsedEl = document.getElementById('sys-elapsed');
    var checkedEl = document.getElementById('sys-checked-at');
    var metaInline = document.getElementById('sys-meta-inline');
    var reportEl = document.getElementById('sys-report');

    var myGen = ++systemCheckGen;
    systemCheckInFlight = true;
    paintGate({ checking: true }, '…');
        if (allEl && !lastSystemSnapshot) {
          allEl.innerHTML = '<li class="sys-check sys-check-info"><span class="sys-badge">…</span><div>' + t('sys.probing') + '</div></li>';
        }
        // Soft recheck: keep previous host table visible (no skeleton wipe).
        // Hard empty first paint only → skeleton.
        var devCard = document.getElementById('sys-device-card');
        if (devCard) {
          devCard.hidden = false;
          var lab = document.getElementById('sys-device-label');
          if (lab && !lastSystemSnapshot) lab.textContent = t('sys.checking');
          if (!lastSystemSnapshot) {
            renderHostSkeleton();
          } else {
            var hpSoft = document.getElementById('sys-host-panels');
            if (hpSoft) hpSoft.classList.add('is-checking');
          }
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
          var qs = [];
          if (expPath) qs.push('path=' + encodeURIComponent(expPath));
          if (forceFresh) qs.push('fresh=1');
          var sysUrl = '/api/system' + (qs.length ? ('?' + qs.join('&')) : '');
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
                        paintGate(gate, metaLine, counts);

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
            systemCheckInFlight = false;
            var hp = document.getElementById('sys-host-panels');
            if (hp) hp.classList.remove('is-checking');
            // Always drop busy when the latest probe ends (success, fail, or early return).
            // Stale superseded probes leave busy to the newer gen.
            try {
              var nBusy = summaryNodes();
              if (nBusy.btn && nBusy.btn.classList.contains('is-busy')) {
                // If we never painted a final gate (exception path already does), clear busy
                // only when button still says checking / still busy after success paint.
                // paintGate(final) already clears busy; this is the safety net for stale/early exit.
                if (!lastSystemSnapshot) {
                  setSummaryBusy(false);
                } else {
                  // snapshot exists but UI may still be "checking" if paintGate was skipped (stale race)
                  var lab = nBusy.label ? (nBusy.label.textContent || '') : '';
                  if (/检测|checking|…|\.\.\./i.test(lab) || (nBusy.btn.getAttribute('data-gate') || '') === 'checking') {
                    try {
                      var gDone = lastSystemSnapshot.gate || computeRunGate(
                        lastSystemSnapshot.checks || [],
                        false,
                        lastSystemSnapshot.facts || {}
                      );
                      var metaEl = document.getElementById('sys-meta-inline');
                      paintGate(gDone, metaEl ? metaEl.textContent : null, lastSystemSnapshot && lastSystemSnapshot.counts);
                    } catch (ePaint) {
                      setSummaryBusy(false);
                    }
                  }
                }
              }
            } catch (eF) { /* ignore */ }
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

    // I/O inline path tests (KB / Mouse / Speaker) — live in host I/O panel.
    // Buttons are re-created on each system paint → event delegation + restore labels.
    var ioKeyResult = '';
    var ioMouseResult = '';
    var ioAudioResult = '';
    var keyArmed = false;
    var keyArmHandler = null;
    var mouseArmed = false;
    var mouseArmHandler = null;

    function ioEls() {
      return {
        keyArm: document.getElementById('sys-key-arm'),
        keyResult: document.getElementById('sys-key-result'),
        mouseArm: document.getElementById('sys-mouse-arm'),
        mouseResult: document.getElementById('sys-mouse-result'),
        audioBtn: document.getElementById('sys-audio-beep'),
        audioResult: document.getElementById('sys-audio-result'),
      };
    }

    function applyIoTests() {
      var el = ioEls();
      if (el.keyArm) {
        el.keyArm.textContent = keyArmed ? t('sys.waitingCancel') : t('sys.kbArm');
        el.keyArm.classList.toggle('is-armed', !!keyArmed);
      }
      if (el.keyResult) {
        el.keyResult.textContent = ioKeyResult || t('sys.kbIdleShort');
        el.keyResult.title = el.keyResult.textContent;
      }
      if (el.mouseArm) {
        el.mouseArm.textContent = mouseArmed ? t('sys.waitingCancel') : t('sys.mouseArm');
        el.mouseArm.classList.toggle('is-armed', !!mouseArmed);
      }
      if (el.mouseResult) {
        el.mouseResult.textContent = ioMouseResult || t('sys.mouseIdleShort');
        el.mouseResult.title = el.mouseResult.textContent;
      }
      if (el.audioBtn) el.audioBtn.textContent = t('sys.audioBeep');
      if (el.audioResult) {
        el.audioResult.textContent = ioAudioResult || t('sys.audioIdleShort');
        el.audioResult.title = el.audioResult.textContent;
      }
    }
    window.__psyclawApplyIoTests = applyIoTests;
    applyIoTests();

    function disarmKey() {
      keyArmed = false;
      if (keyArmHandler) {
        window.removeEventListener('keydown', keyArmHandler, true);
        keyArmHandler = null;
      }
      applyIoTests();
    }

    function disarmMouse() {
      mouseArmed = false;
      if (mouseArmHandler) {
        window.removeEventListener('pointerdown', mouseArmHandler, true);
        mouseArmHandler = null;
      }
      applyIoTests();
    }

    function armKey() {
      if (keyArmed) {
        disarmKey();
        ioKeyResult = t('sys.disarmed');
        applyIoTests();
        return;
      }
      keyArmed = true;
      ioKeyResult = t('sys.armedKey');
      applyIoTests();
      var t0 = performance.now();
      keyArmHandler = function (ev) {
        var dt = Math.round((performance.now() - t0) * 10) / 10;
        ioKeyResult =
          'key=' + (ev.key || '?') +
          ' code=' + (ev.code || '?') +
          ' · RT ' + dt + ' ms';
        disarmKey();
      };
      window.addEventListener('keydown', keyArmHandler, true);
    }

    function armMouse(ev) {
      if (ev) ev.stopPropagation();
      if (mouseArmed) {
        disarmMouse();
        ioMouseResult = t('sys.disarmed');
        applyIoTests();
        return;
      }
      mouseArmed = true;
      ioMouseResult = t('sys.armedMouse');
      applyIoTests();
      var t0 = performance.now();
      var skip = true;
      mouseArmHandler = function (e2) {
        if (skip) {
          skip = false;
          return;
        }
        var dt = Math.round((performance.now() - t0) * 10) / 10;
        var btn = e2.button === 0 ? 'L' : (e2.button === 2 ? 'R' : String(e2.button));
        var x = Math.round(e2.clientX);
        var y = Math.round(e2.clientY);
        ioMouseResult =
          'btn=' + btn + ' @ ' + x + ',' + y +
          ' · RT ' + dt + ' ms' +
          (e2.pointerType ? ' · ' + e2.pointerType : '');
        disarmMouse();
      };
      window.addEventListener('pointerdown', mouseArmHandler, true);
    }

    function playBeep() {
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
        ioAudioResult = t('sys.playedTone');
      } catch (e) {
        ioAudioResult = t('sys.fail', { msg: (e.message || e) });
      }
      applyIoTests();
    }

    var sysTab = document.getElementById('tab-system') || document;
    sysTab.addEventListener('click', function (ev) {
      var tEl = ev.target;
      if (!tEl) return;
      var id = tEl.id || (tEl.closest && tEl.closest('button') && tEl.closest('button').id) || '';
      if (id === 'sys-key-arm') {
        ev.preventDefault();
        armKey();
        return;
      }
      if (id === 'sys-mouse-arm') {
        ev.preventDefault();
        armMouse(ev);
        return;
      }
      if (id === 'sys-audio-beep') {
        ev.preventDefault();
        playBeep();
      }
    });

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
              // Repaint host table only when we already have a real host paint
              // (or hardware facts). Never paint a disk-only shell — that
              // races auto-open vs first /api/system and leaves empty rows
              // after refresh until the user manually rechecks.
              var panels = document.getElementById('sys-host-panels');
              var factsNow = lastSystemSnapshot.facts || {};
              var hwNow = factsNow.hardware || null;
              var hasHw = !!(hwNow && (hwNow.cpu || (hwNow.gpus && hwNow.gpus.length) || hwNow.ram_gb != null));
              if (panels && (panels.dataset.hasData || hasHw)) {
                try {
                  renderDeviceFigure(
                    factsNow,
                    lastSystemSnapshot.checks || [],
                    lastSystemSnapshot.overall,
                    lastSystemSnapshot.counts,
                    lastSystemSnapshot.browserExtra
                  );
                  if (hasHw) panels.dataset.hasData = '1';
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
                  paintGate(g2, metaEl ? metaEl.textContent : null, lastSystemSnapshot && lastSystemSnapshot.counts);
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

            function hostTableNeedsPaint() {
              var panels = document.getElementById('sys-host-panels');
              if (!panels) return false;
              // Mid-probe is NOT a reason to start another probe (that cancels the live one).
              if (systemCheckInFlight || panels.classList.contains('is-checking')) return false;
              if (!panels.dataset.hasData) return true;
              if ((panels.innerHTML || '').indexOf('is-skel') >= 0 && !panels.dataset.hasData) return true;
              if (!(panels.innerHTML || '').trim()) return true;
              return false;
            }

            function ensureSystemChecked(force) {
              // Coalesce: one in-flight probe. force only supersedes after stuck, or when idle.
              if (systemCheckInFlight && !force) return;
              if (force || !systemCheckedOnce || hostTableNeedsPaint()) {
                systemCheckedOnce = true;
                // Button / stuck recheck → fresh=1; first paint / tab fill → cache OK
                runSystemChecks({ fresh: !!force });
              }
            }

            var summaryBtn = document.getElementById('sys-summary');
            var busySince = 0;
            if (summaryBtn) {
              summaryBtn.addEventListener('click', function () {
                var busy = summaryBtn.disabled || summaryBtn.classList.contains('is-busy');
                if (busy || systemCheckInFlight) {
                  // stuck busy >15s → allow force recheck (gen invalidates in-flight)
                  if (!busySince) busySince = Date.now();
                  if (Date.now() - busySince < 15000) return;
                } else {
                  busySince = 0;
                }
                ensureSystemChecked(true);
              });
            }
            // first page load — one probe
            setTimeout(function () { ensureSystemChecked(false); }, 0);

            // System tab shown: fill empty table once; never restart a live probe
            document.querySelectorAll('.tab-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                if (btn.dataset.tab !== 'system') return;
                setTimeout(function () {
                  if (systemCheckInFlight) return;
                  if (hostTableNeedsPaint()) {
                    ensureSystemChecked(false);
                  } else if (lastSystemSnapshot && typeof renderDeviceFigure === 'function') {
                    try {
                      renderDeviceFigure(
                        lastSystemSnapshot.facts,
                        lastSystemSnapshot.checks,
                        lastSystemSnapshot.overall,
                        lastSystemSnapshot.counts,
                        lastSystemSnapshot.browserExtra
                      );
                    } catch (eTab) { /* ignore */ }
                  }
                }, 0);
              });
            });

            // project folder → disk row only; full probe only if table still empty AND idle
            function onExperimentPathChanged(ev) {
              var path =
                (ev && ev.detail && (ev.detail.path || ev.detail.projectDir)) ||
                getExperimentPath();
              refreshDiskForExperimentPath(path || '', true);
              if (!systemCheckInFlight && hostTableNeedsPaint()) {
                setTimeout(function () { ensureSystemChecked(false); }, 50);
              }
            }
            document.addEventListener('psyclaw:file-state', onExperimentPathChanged);
            document.addEventListener('psyclaw:project-opened', onExperimentPathChanged);

            // Light env drift: resolution / orientation / AV device plug — no full probe.
            wireEnvDriftWatchers();
          }

  // ---------------------------------------------------------------
  // Run tab
  // ---------------------------------------------------------------


  window.PsyClawSystem = {
    wire: wireSystemTab,
    getSnapshot: function () { return lastSystemSnapshot; },
    getGate: function () { return lastRunGate || (lastSystemSnapshot && lastSystemSnapshot.gate) || null; },
    getLastProven: function () { return lastProvenMode; },
    setLastProven: setLastProvenMode,
    isSystemStale: function () { return !!systemStale; },
    paintRunGate: function () {
      var g = lastRunGate || (lastSystemSnapshot && lastSystemSnapshot.gate);
      if (g) paintRunStatusGate(g, lastSystemSnapshot && lastSystemSnapshot.counts);
    },
    refreshHostUI: function () {
      if (lastSystemSnapshot && typeof renderDeviceFigure === 'function') {
        try {
          renderDeviceFigure(
            lastSystemSnapshot.facts,
            lastSystemSnapshot.checks,
            lastSystemSnapshot.overall,
            lastSystemSnapshot.counts,
            lastSystemSnapshot.browserExtra
          );
        } catch (eRH) { /* ignore */ }
      } else if (typeof runSystemChecks === 'function') {
        runSystemChecks();
      }
    },
    recheck: typeof runSystemChecks === 'function' ? function () { return runSystemChecks({ fresh: true }); } : null,
  };
})();
