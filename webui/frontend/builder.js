/* psyclaw Builder — drag-drop design model + Flow tab UI
 *
 * window.PsyClawBuilder = {
 *   getDesign(), setDesign(d), resetDefault(),
 *   render(), selectComponent(id), selectRoutine(name)
 * }
 *
 * Design schema:
 * {
 *   name: string,
 *   display: { size: [w,h], fullscreen: bool, bgcolor: string },
 *   routines: [{ name, components: [{ id, type, name, start, duration, params }] }],
 *   flow: [{ kind: 'routine'|'loop', routine?, name?, nReps?, children? }]
 * }
 */
(function () {
  'use strict';

  /* modular parts live in builder-parts/ for editing; this file is the runtime bundle.
   * Maintainers: edit builder-parts/*.js then run: python webui/scripts/_split_builder.py --assemble
   */

  // ---- builder-part-model.js ----
function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  function componentLabel(ct) {
    if (!ct) return '';
    if (ct.labelKey) return t(ct.labelKey);
    return ct.label || ct.type || '';
  }

  var COMPONENT_TYPES = [
        { type: 'text', labelKey: 'comp.text', label: 'Text', defaults: { text: 'Hello', height: 0.05, color: 'white' } },
        { type: 'keyboard', labelKey: 'comp.keyboard', label: 'Keyboard', defaults: { keys: 'space', force_end: true } },
        { type: 'image', labelKey: 'comp.image', label: 'Image', defaults: { path: 'stim.png', size: 0.5 } },
        { type: 'video', labelKey: 'comp.video', label: 'Video', defaults: { path: 'stim.mp4', size: 0.5, volume: 1 } },
        { type: 'fixation', labelKey: 'comp.fixation', label: 'Fixation', defaults: { text: '+', height: 0.08 } },
        { type: 'code', labelKey: 'comp.code', label: 'Code', defaults: { phase: 'each_frame', code: '' } },
      ];

      /** Product-grade line icons (24 grid, Lucide-like). Palette + timeline. */
          function componentIconHtml(type, cls) {
            var t = String(type || 'unknown');
            var body;
            switch (t) {
              case 'text':
                // type / typography
                body = '<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>';
                break;
              case 'keyboard':
                body = '<rect x="2" y="7" width="20" height="12" rx="2.5"/>'
                  + '<path d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01"/>'
                  + '<path d="M8 15h8"/>';
                break;
              case 'image':
                body = '<rect x="3" y="5" width="18" height="14" rx="2.5"/>'
                  + '<circle cx="9" cy="10" r="1.6"/>'
                  + '<path d="M4 16.5 8.5 12l3.5 3 2.5-2L20 17"/>';
                break;
              case 'video':
                // film strip / play
                body = '<rect x="3" y="5" width="18" height="14" rx="2"/>'
                  + '<path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>'
                  + '<path d="M10.2 9.2 15 12l-4.8 2.8z"/>';
                break;
              case 'fixation':
                body = '<circle cx="12" cy="12" r="2.75"/>'
                  + '<path d="M12 3.5v4.25M12 16.25V20.5M3.5 12h4.25M16.25 12H20.5"/>';
                break;
              case 'code':
                body = '<path d="M8.5 8 4.5 12l4 4"/><path d="M15.5 8l4 4-4 4"/><path d="M13.5 6.5 10.5 17.5"/>';
                break;
              default:
                body = '<circle cx="12" cy="12" r="7.5"/>';
            }
          // dots need a bit of stroke so they read as keys
          if (t === 'keyboard') {
            body = '<rect x="2" y="7" width="20" height="12" rx="2.5"/>'
              + '<path d="M6.5 11h1M10.5 11h1M14.5 11h1M17.5 11h1" stroke-width="2"/>'
              + '<path d="M8 15h8"/>';
          }
          var wellCls = 'ico-well type-' + t + (cls ? (' ' + cls) : '');
          return '<span class="' + wellCls + '" aria-hidden="true">'
            + '<svg class="comp-ico" viewBox="0 0 24 24" width="16" height="16" focusable="false">'
            + body
            + '</svg></span>';
        }

    function deleteComponentById(id) {
      var found = findComponent(id);
      if (!found) return false;
      found.routine.components.splice(found.index, 1);
      if (selectedComponentId === id) selectedComponentId = null;
      render();
      emitChange();
      return true;
    }

  var SNAP = 0.05; // default grid when snap ON
        var OPEN_DISPLAY = 3; // open-ended (∞) bar visual duration on timeline
        var OPEN_DURATION = -1; // design.json duration for open-ended (∞)
        function isOpenDuration(d) {
          if (d == null || d === '') return true; // legacy null/''
          var n = Number(d);
          return !isNaN(n) && n === OPEN_DURATION;
        }
        var TIMELINE_PAD = 1; // scale end = longest edge + this
        var snapEnabled = true;
        // Inspector PREVIEW: short click on visual onset — Settings only, default OFF
        var PREVIEW_ONSET_KEY = 'psyclaw.previewOnsetClick';
        var previewOnsetClick = false;
        try {
          previewOnsetClick = localStorage.getItem(PREVIEW_ONSET_KEY) === '1';
        } catch (e0) { previewOnsetClick = false; }
        function isPreviewOnsetClick() { return !!previewOnsetClick; }
        function setPreviewOnsetClick(v) {
          previewOnsetClick = !!v;
          try { localStorage.setItem(PREVIEW_ONSET_KEY, previewOnsetClick ? '1' : '0'); } catch (e1) { /* ignore */ }
        }

      /** Visible scale end (seconds): max component edge + 1s. ∞ counts as start+3s. */
      function getTimelineMax() {
              var maxEnd = 0;
              var hasAny = false;
              var hasOpen = false;
              var r = typeof findRoutine === 'function' && selectedRoutine
                ? findRoutine(selectedRoutine)
                : null;
              if (r && r.components && r.components.length) {
                r.components.forEach(function (c) {
                  hasAny = true;
                  var s = Number(c.start) || 0;
                  if (isOpenDuration(c.duration)) {
                    // open-ended: scale reaches at least onset + OPEN_DISPLAY (bar fills to scale end)
                    hasOpen = true;
                    maxEnd = Math.max(maxEnd, s + OPEN_DISPLAY);
                  } else {
                    maxEnd = Math.max(maxEnd, s + (Number(c.duration) || 0));
                  }
                });
              }
              // longest finite/open-display edge + 1s — but if any open-ended, no trailing pad
              // (open bars fill to scale end; pad after them left a weird empty 1s strip)
              var base = hasAny ? maxEnd : OPEN_DISPLAY;
              var maxT = base + (hasOpen ? 0 : TIMELINE_PAD);
              maxT = Math.ceil(maxT * 1000 - 1e-6) / 1000;
              if (maxT < 1) maxT = 1;
              if (maxT > 300) maxT = 300;
              return maxT;
            }

      function getTimelineStep(maxT) {
        if (maxT <= 4) return 0.5;
        if (maxT <= 12) return 1;
        if (maxT <= 30) return 2;
        if (maxT <= 60) return 5;
        return 10;
      }

  var design = null;
      var selectedRoutine = null;
      var selectedComponentId = null;
      /** Top-level flow selection (null = none). Multi-select via Shift+click. */
        var selectedFlowIndex = null;
        var selectedFlowIndices = {}; // { [idx]: true }
        /** PsychoPy-style: Insert Loop arms draw mode; drag across Flow to wrap. */
        var loopDrawArmed = false;
      /** Path into nested loop for Properties, e.g. [1,0]. */
      var selectedFlowPath = null;
      /** iOS-style: long-press routine tab → jiggle + circular × delete. */
      var routineEditMode = false;
      var routineLongPressTimer = null;
      var routineLongPressFired = false;
        var uid = 0;
        function nextId(prefix) { uid += 1; return prefix + '_' + uid; }


  // ---- builder-part-display.js ----
    /** Default window size = selected monitor (or this machine's screen). */
            var hostMonitors = []; // filled by System probe {index,width,height,primary,label}
            var hostRefreshHz = null; // browser-estimated; PsychoPy cannot set OS refresh

            function setHostMonitors(list) {
              hostMonitors = Array.isArray(list) ? list.slice() : [];
              try {
                rebuildMonitorSelect();
                rebuildResSelect();
                var spec = getDisplaySpec();
                updateDisplayPreview(spec.width, spec.height, !!spec.fullscreen, spec.bgcolor);
              } catch (e) { /* ignore */ }
            }

            function setHostRefreshHz(hz) {
              var n = Number(hz);
              hostRefreshHz = (isFinite(n) && n > 0) ? Math.round(n) : null;
              try {
                var lab = document.getElementById('disp-refresh-label');
                if (lab) {
                  if (hostRefreshHz != null) {
                    lab.textContent = '~' + hostRefreshHz + ' Hz';
                    lab.title = (typeof t === 'function' ? t('builder.dispRefreshTitle') : '') ||
                      'Host estimate only — PsychoPy cannot set OS refresh rate';
                  } else {
                    lab.textContent = (typeof t === 'function' ? t('builder.dispRefreshUnknown') : '') || '—';
                  }
                }
              } catch (e2) { /* ignore */ }
            }

        function getHostMonitors() {
          return hostMonitors.slice();
        }

        function getSelectedMonitor() {
          // Do NOT call ensureDisplay here: ensureDisplay → screenDisplaySize → getSelectedMonitor (stack overflow)
          var idx = 0;
          try {
            idx = Math.max(0, parseInt((design && design.display && design.display.screen), 10) || 0);
          } catch (e) { idx = 0; }
          if (hostMonitors && hostMonitors.length) {
            for (var i = 0; i < hostMonitors.length; i++) {
              if (Number(hostMonitors[i].index) === idx) return hostMonitors[i];
            }
            // clamp to primary / first
            for (var j = 0; j < hostMonitors.length; j++) {
              if (hostMonitors[j].primary) return hostMonitors[j];
            }
            return hostMonitors[0];
          }
          return null;
        }

        function screenDisplaySize() {
          var mon = getSelectedMonitor();
          if (mon && mon.width && mon.height) {
            return [Math.max(320, Math.round(mon.width)), Math.max(240, Math.round(mon.height))];
          }
          var sw = 0, sh = 0;
          try {
            sw = (window.screen && (window.screen.width || window.screen.availWidth)) || 0;
            sh = (window.screen && (window.screen.height || window.screen.availHeight)) || 0;
          } catch (e) { sw = 0; sh = 0; }
          if (!sw || !sh) {
            sw = Math.max(1024, (window.innerWidth || 1280));
            sh = Math.max(768, (window.innerHeight || 720));
          }
          return [Math.max(320, Math.round(sw)), Math.max(240, Math.round(sh))];
        }

        function ensureDisplay(d) {
              if (!d || typeof d !== 'object') return d;
              if (!d.display || typeof d.display !== 'object') d.display = {};
              var disp = d.display;
              var sz = disp.size;
              var w = sz && Number(sz[0]);
              var h = sz && Number(sz[1]);
              if (!isFinite(w) || w <= 0 || !isFinite(h) || h <= 0) {
                disp.size = screenDisplaySize();
              } else {
                disp.size = [Math.round(w), Math.round(h)];
              }
              // Default ON: only explicit false stays off (null/undefined/'' → true)
              if (disp.fullscreen == null || disp.fullscreen === '') disp.fullscreen = true;
              if (!disp.bgcolor) disp.bgcolor = '#000000';
              else disp.bgcolor = normalizeBgcolor(disp.bgcolor);
              if (!disp.aspectFilter) disp.aspectFilter = 'all';
              var scr = parseInt(disp.screen, 10);
              if (!isFinite(scr) || scr < 0) disp.screen = 0;
              else disp.screen = Math.round(scr);
              // devices prefs (System peer cards: device pick + sample/poll rate; enable flags always on)
                                          if (!d.devices || typeof d.devices !== 'object') d.devices = {};
                                          if (d.devices.keyboard == null) d.devices.keyboard = true;
                                          if (d.devices.microphone == null) d.devices.microphone = true;
                                          if (d.devices.speaker == null) d.devices.speaker = true;
                                          // UI toggles removed — force enable (design components still gate usage)
                                          d.devices.keyboard = true;
                                          d.devices.microphone = true;
                                          d.devices.speaker = true;
                                          if (d.devices.keyboardDevice == null) d.devices.keyboardDevice = '';
                                          if (d.devices.mouseDevice == null) d.devices.mouseDevice = '';
                                          if (d.devices.mouseSampleRate == null) d.devices.mouseSampleRate = 125;
                                          if (d.devices.micDevice == null) d.devices.micDevice = '';
                                          if (d.devices.micLabel == null) d.devices.micLabel = '';
                                          if (d.devices.micSampleRate == null) d.devices.micSampleRate = 44100;
                                          if (d.devices.speakerDevice == null) d.devices.speakerDevice = '';
                                          if (d.devices.speakerLabel == null) d.devices.speakerLabel = '';
                                          if (d.devices.speakerSampleRate == null) d.devices.speakerSampleRate = 44100;
                            return d;
                          }

    function getDisplaySpec() {
          ensureDisplay(design || {});
          var disp = (design && design.display) || {};
          var sz = disp.size || screenDisplaySize();
          return {
            width: Math.max(1, Math.round(Number(sz[0]) || 1920)),
            height: Math.max(1, Math.round(Number(sz[1]) || 1080)),
            fullscreen: disp.fullscreen !== false,
            bgcolor: normalizeBgcolor(disp.bgcolor),
          };
        }

        function normalizeBgcolor(v, opts) {
                  opts = opts || {};
                  var s = String(v == null ? '' : v).trim();
                  if (!s) return opts.strict ? null : '#000000';
                  // Window bgcolor is set once at start — $stimlist vars cannot resolve here.
                  if (s.charAt(0) === '$') return opts.strict ? null : '#000000';
                  var low = s.toLowerCase();
                  // #rgb / #rrggbb
                  if (/^#[0-9a-f]{6}$/i.test(s)) return low;
                  if (/^#[0-9a-f]{3}$/i.test(s)) {
                    return '#' + low[1] + low[1] + low[2] + low[2] + low[3] + low[3];
                  }
                  // rgb(r,g,b) / rgba(...) / rgb(r g b)
                  var m = low.match(/^rgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)(?:\s*[,/]\s*[0-9.]+%?)?\s*\)$/);
                  if (m) {
                    function ch(x) {
                      if (String(x).indexOf('%') >= 0) {
                        return Math.round(Math.max(0, Math.min(100, parseFloat(x))) * 2.55);
                      }
                      var n = parseFloat(x);
                      if (!isFinite(n)) return null;
                      // PsychoPy-style -1..1
                      if (n >= -1 && n <= 1 && String(x).indexOf('.') >= 0) {
                        n = (n + 1) * 127.5;
                      }
                      return Math.round(Math.max(0, Math.min(255, n)));
                    }
                    var r = ch(m[1]), g = ch(m[2]), b = ch(m[3]);
                    if (r == null || g == null || b == null) return opts.strict ? null : '#000000';
                    return '#' + [r, g, b].map(function (n) {
                      var h = n.toString(16);
                      return h.length < 2 ? '0' + h : h;
                    }).join('');
                  }
                  // bare r,g,b or r g b (0–255)
                  var parts = low.split(/[\s,]+/).filter(Boolean);
                  if (parts.length === 3 && parts.every(function (p) { return /^-?[0-9.]+$/.test(p); })) {
                    function ch2(x) {
                      var n = parseFloat(x);
                      if (!isFinite(n)) return null;
                      if (n >= -1 && n <= 1 && String(x).indexOf('.') >= 0) n = (n + 1) * 127.5;
                      return Math.round(Math.max(0, Math.min(255, n)));
                    }
                    var r2 = ch2(parts[0]), g2 = ch2(parts[1]), b2 = ch2(parts[2]);
                    if (r2 == null || g2 == null || b2 == null) return opts.strict ? null : '#000000';
                    return '#' + [r2, g2, b2].map(function (n) {
                      var h = n.toString(16);
                      return h.length < 2 ? '0' + h : h;
                    }).join('');
                  }
                  var named = {
                    black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080',
                    'dark gray': '#404040', 'dark grey': '#404040', darkgray: '#404040', darkgrey: '#404040',
                    'light gray': '#c0c0c0', 'light grey': '#c0c0c0', lightgray: '#c0c0c0', lightgrey: '#c0c0c0',
                    red: '#ff0000', green: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
                    cyan: '#00ffff', magenta: '#ff00ff', orange: '#ffa500',
                  };
                  if (named[low]) return named[low];
                  return opts.strict ? null : '#000000';
                }

                function ensureBgcolorSelect(sel) {
                  if (!sel || sel.tagName !== 'SELECT') return;
                  if (sel.getAttribute('data-bg-options') === '1' && sel.options.length > 1) {
                    // refresh i18n labels if already built
                    var oi;
                    for (oi = 0; oi < sel.options.length; oi++) {
                      var ok = sel.options[oi].getAttribute('data-i18n-key');
                      if (ok && typeof t === 'function') {
                        var tl = t(ok);
                        if (tl && tl !== ok) sel.options[oi].textContent = tl;
                      }
                    }
                    return;
                  }
                  sel.innerHTML = '';
                  COLOR_NAME_ENTRIES.forEach(function (e) {
                    var opt = document.createElement('option');
                    opt.value = e.hex;
                    opt.setAttribute('data-i18n-key', e.key);
                    var lab = (typeof t === 'function') ? t(e.key) : e.names[0];
                    if (!lab || lab === e.key) lab = e.names[0];
                    opt.textContent = lab;
                    sel.appendChild(opt);
                  });
                  var cOpt = document.createElement('option');
                  cOpt.value = '__custom__';
                  cOpt.setAttribute('data-i18n-key', 'color.custom');
                  var cLab = (typeof t === 'function') ? t('color.custom') : 'Custom';
                  if (!cLab || cLab === 'color.custom') cLab = 'Custom';
                  cOpt.textContent = cLab;
                  sel.appendChild(cOpt);
                  sel.setAttribute('data-bg-options', '1');
                }

                function syncBgcolorInputs(hex) {
                  var raw = hex;
                  var h = normalizeBgcolor(hex) || '#000000';
                  var bgIn = document.getElementById('disp-bgcolor');
                  var picker = document.getElementById('disp-bgcolor-picker');
                  var lab = document.getElementById('disp-bgcolor-label');
                  if (bgIn) {
                    bgIn.value = h;
                    bgIn.classList.remove('is-invalid');
                  }
                  if (picker) {
                    ensureBgcolorSelect(picker);
                    var ent = colorEntryOf(raw != null ? raw : h) || colorEntryOf(h);
                    try {
                      picker.value = ent ? ent.hex : '__custom__';
                    } catch (eP) { /* ignore */ }
                  }
                  // Droplist already names the color; hide redundant chip.
                  if (lab) {
                    lab.hidden = true;
                    lab.textContent = '';
                  }
                  return h;
                }

                var BGCOLOR_OPTIONS = ['#000000', '#1a1a1a', '#404040', '#808080', '#c0c0c0', '#ffffff'];

                function pickBgcolorOption(hex) {
                  return normalizeBgcolor(hex) || '#000000';
                }

                // Named palette for UI labels (bg + component fg). Prefer PsychoPy English names in storage when exact match.
                var COLOR_NAME_ENTRIES = [
                  { hex: '#000000', names: ['black'], key: 'builder.bgBlack' },
                  { hex: '#1a1a1a', names: ['nearblack', 'near black'], key: 'builder.bgNearBlack' },
                  { hex: '#404040', names: ['darkgray', 'darkgrey', 'dark gray', 'dark grey'], key: 'builder.bgDarkGray' },
                  { hex: '#808080', names: ['gray', 'grey'], key: 'builder.bgGray' },
                  { hex: '#c0c0c0', names: ['lightgray', 'lightgrey', 'light gray', 'light grey'], key: 'builder.bgLightGray' },
                  { hex: '#ffffff', names: ['white'], key: 'builder.bgWhite' },
                  { hex: '#ff0000', names: ['red'], key: 'color.red' },
                  { hex: '#00ff00', names: ['green', 'lime'], key: 'color.green' },
                  { hex: '#0000ff', names: ['blue'], key: 'color.blue' },
                  { hex: '#ffff00', names: ['yellow'], key: 'color.yellow' },
                  { hex: '#00ffff', names: ['cyan', 'aqua'], key: 'color.cyan' },
                  { hex: '#ff00ff', names: ['magenta', 'fuchsia'], key: 'color.magenta' },
                  { hex: '#ffa500', names: ['orange'], key: 'color.orange' },
                ];

                function colorEntryOf(v) {
                  if (v == null || v === '') return null;
                  var s = String(v).trim();
                  if (!s || s.charAt(0) === '$') return null;
                  var low = s.toLowerCase().replace(/\s+/g, ' ');
                  var i, e;
                  for (i = 0; i < COLOR_NAME_ENTRIES.length; i++) {
                    e = COLOR_NAME_ENTRIES[i];
                    if (e.names.indexOf(low) >= 0) return e;
                    if (e.names.indexOf(low.replace(/\s/g, '')) >= 0) return e;
                  }
                  var hex = normalizeBgcolor(s, { strict: true });
                  if (!hex) return null;
                  for (i = 0; i < COLOR_NAME_ENTRIES.length; i++) {
                    if (COLOR_NAME_ENTRIES[i].hex === hex) return COLOR_NAME_ENTRIES[i];
                  }
                  return null;
                }

                function colorLabelOf(v) {
                  if (v != null && String(v).trim().charAt(0) === '$') {
                    return String(v).trim();
                  }
                  var e = colorEntryOf(v);
                  if (e) {
                    var lab = (typeof t === 'function') ? t(e.key) : e.names[0];
                    if (!lab || lab === e.key) lab = e.names[0];
                    return lab;
                  }
                  var raw = String(v == null ? '' : v).trim();
                  if (!raw) return '';
                  if (normalizeBgcolor(raw, { strict: true })) {
                    var c = (typeof t === 'function') ? t('color.custom') : 'Custom';
                    return (!c || c === 'color.custom') ? 'Custom' : c;
                  }
                  return '';
                }

                function preferredColorStore(v, opts) {
                  opts = opts || {};
                  var s = String(v == null ? '' : v).trim();
                  if (!s) return opts.fallback || '';
                  if (s.charAt(0) === '$') return s;
                  var e = colorEntryOf(s);
                  if (e && opts.preferName !== false) return e.names[0];
                  var hex = normalizeBgcolor(s, { strict: true });
                  return hex || s;
                }

                function setColorNameLabel(el, v) {
                  if (!el) return;
                  var lab = colorLabelOf(v);
                  el.textContent = lab || '';
                  el.hidden = !lab;
                  el.classList.toggle('is-custom', !colorEntryOf(v) && !!lab && String(v).charAt(0) !== '$');
                  el.classList.toggle('is-var', String(v || '').trim().charAt(0) === '$');
                  el.title = lab || '';
                }


    /** Local project folder path (server-side designs/ or absolute). null = unsaved. */
    var projectPath = null;
    var dirty = false;
    var lastSavedJson = '';

    function emitFileState() {
      document.dispatchEvent(new CustomEvent('psyclaw:file-state', {
        detail: {
          dirty: dirty,
          path: projectPath,
          name: design && design.name,
          marker: '{folderName}.psyclaw',
        },
      }));
    }

    function markClean(path) {
      if (path !== undefined) projectPath = path || null;
      try {
        lastSavedJson = design ? JSON.stringify(design) : '';
      } catch (e) {
        lastSavedJson = '';
      }
      dirty = false;
      emitFileState();
    }

    function markDirty() {
      if (!design) return;
      var cur;
      try { cur = JSON.stringify(design); } catch (e) { cur = ''; }
      var next = cur !== lastSavedJson;
      if (next !== dirty) {
        dirty = next;
        emitFileState();
      } else if (next) {
        dirty = true;
      }
    }

    function getFileState() {
      return { dirty: dirty, path: projectPath, name: design && design.name };
    }

    function isDirty() { return !!dirty; }

    function getProjectPath() { return projectPath; }

    function setProjectPath(p) {
      projectPath = p || null;
      emitFileState();
    }

  function defaultDesign() {
    return {
      name: 'untitled',
      display: { size: screenDisplaySize(), fullscreen: true, bgcolor: '#000000' },
      routines: [
        {
          name: 'instructions',
          components: [
            { id: nextId('c'), type: 'text', name: 'instr_text', start: 0, duration: -1,
              params: { text: 'Press SPACE to begin.', height: 0.05, color: 'white' } },
            { id: nextId('c'), type: 'keyboard', name: 'instr_key', start: 0, duration: -1,
              params: { keys: 'space', force_end: true } },
          ],
        },
        {
                  name: 'trial',
                  components: [
                    { id: nextId('c'), type: 'fixation', name: 'fix', start: 0, duration: 0.5,
                      params: { text: '+', height: 0.08 } },
                    { id: nextId('c'), type: 'text', name: 'stim', start: 0.5, duration: 1.5,
                      params: { text: '$word', height: 0.15, color: '$color' } },
                    { id: nextId('c'), type: 'keyboard', name: 'resp', start: 0.5, duration: 1.5,
                      params: { keys: 'r,g,b,y', force_end: true } },
                  ],
                },
                {
                  name: 'thanks',
                  components: [
                    { id: nextId('c'), type: 'text', name: 'thanks_text', start: 0, duration: 2,
                      params: { text: 'Thank you.', height: 0.05, color: 'white' } },
                  ],
                },
              ],
              flow: [
                { kind: 'routine', routine: 'instructions' },
                {
                  kind: 'loop',
                  name: 'trials',
                  nReps: 1,
                  loopType: 'sequential',
                  conditionsFile: 'stroop_trials.xlsx',
                  conditions: [
                    { word: 'RED', color: 'red', corrAns: 'r' },
                    { word: 'GREEN', color: 'green', corrAns: 'g' },
                    { word: 'BLUE', color: 'blue', corrAns: 'b' },
                    { word: 'YELLOW', color: 'yellow', corrAns: 'y' },
                  ],
                  children: [{ kind: 'routine', routine: 'trial' }],
                },
                { kind: 'routine', routine: 'thanks' },
              ],
            };
          }

  function getDesign() { return design; }
    function setDesign(d, opts) {
          opts = opts || {};
          design = ensureDisplay(d || defaultDesign());
          routineEditMode = false;
          clearRoutineLongPress();
          if (design && design.routines && design.routines.length) {
            if (!selectedRoutine || !design.routines.some(function (r) { return r.name === selectedRoutine; })) {
              selectedRoutine = design.routines[0].name;
            }
          }
          render();
          if (opts.clean) {
            markClean(opts.path !== undefined ? opts.path : projectPath);
          } else {
            emitChange();
          }
        }
    function resetDefault() {
            uid = 0;
            selectedFlowIndex = null;
            selectedFlowIndices = {};
            selectedComponentId = null;
            loopDrawArmed = false;
          selectedFlowPath = null;
            routineEditMode = false;
            clearRoutineLongPress();
            projectPath = null;
            setDesign(defaultDesign(), { clean: true, path: null });
          }

      function clearRoutineLongPress() {
        if (routineLongPressTimer) {
          clearTimeout(routineLongPressTimer);
          routineLongPressTimer = null;
        }
      }

      /** Drop flow nodes that reference a deleted routine; drop empty loops. */
      function pruneRoutineFromFlow(name) {
        function prune(arr) {
          if (!arr || !arr.length) return [];
          var out = [];
          for (var i = 0; i < arr.length; i++) {
            var n = arr[i];
            if (!n) continue;
            if (n.kind === 'routine') {
              if (n.routine !== name) out.push(n);
            } else if (n.kind === 'loop') {
              n.children = prune(n.children || []);
              if (n.children.length) out.push(n);
            } else {
              out.push(n);
            }
          }
          return out;
        }
        design.flow = prune(design.flow || []);
      }

      /**
       * Delete a routine definition (tabs list) + all Flow references.
       * Keeps at least one routine. Stays in edit mode after delete (iOS).
       */
      function deleteRoutineByName(name) {
        if (!design || !design.routines) return false;
        if (design.routines.length <= 1) return false;
        var ix = -1;
        for (var i = 0; i < design.routines.length; i++) {
          if (design.routines[i].name === name) { ix = i; break; }
        }
        if (ix < 0) return false;
        design.routines.splice(ix, 1);
        pruneRoutineFromFlow(name);
        if (selectedRoutine === name) {
          selectedRoutine = design.routines[0] ? design.routines[0].name : null;
          selectedComponentId = null;
        } else if (selectedComponentId) {
          // drop selection if component belonged to deleted routine
          var still = findComponent(selectedComponentId);
          if (!still) selectedComponentId = null;
        }
        clearFlowSelection();
        return true;
      }

  function clearFlowSelection() {
    selectedFlowIndex = null;
    selectedFlowIndices = {};
    selectedFlowPath = null;
  }

  function setFlowSelection(idx, multi) {
    if (idx == null || idx < 0 || idx >= design.flow.length) {
      clearFlowSelection();
      return;
    }
    if (multi) {
      if (selectedFlowIndices[idx]) delete selectedFlowIndices[idx];
      else selectedFlowIndices[idx] = true;
      var keys = Object.keys(selectedFlowIndices).map(Number).sort(function (a, b) { return a - b; });
      selectedFlowIndex = keys.length ? keys[keys.length - 1] : null;
      if (!keys.length) selectedFlowIndices = {};
    } else {
      selectedFlowIndices = {};
      selectedFlowIndices[idx] = true;
      selectedFlowIndex = idx;
    }
  }

  function selectedFlowSorted() {
    return Object.keys(selectedFlowIndices).map(Number).sort(function (a, b) { return a - b; });
  }

  /** Deep-clone a flow node (preserves nested loops + conditions/stimlist). */
    function cloneFlowNode(n) {
      if (!n) return null;
      if (n.kind === 'loop') {
        var cloned = {
          kind: 'loop',
          name: n.name || 'loop',
          nReps: n.nReps != null ? n.nReps : 1,
          loopType: n.loopType || 'sequential',
          children: (n.children || []).map(cloneFlowNode).filter(Boolean),
        };
        if (n.conditionsFile != null) cloned.conditionsFile = n.conditionsFile;
        if (Array.isArray(n.conditions)) {
          cloned.conditions = n.conditions.map(function (row) {
            return Object.assign({}, row);
          });
        }
        return cloned;
      }
      if (n.routine) return { kind: 'routine', routine: n.routine };
      return null;
    }

  /** First routine name under node (for naming). */
  function firstRoutineName(n) {
    if (!n) return null;
    if (n.kind === 'loop') {
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) {
        var r = firstRoutineName(kids[i]);
        if (r) return r;
      }
      return null;
    }
    return n.routine || null;
  }

  /** Navigate to node at path; returns { node, parentArr, index, parent }. */
  function navigatePath(path) {
    if (!path || !path.length) return null;
    var arr = design.flow;
    var parent = null;
    var node = null;
    for (var i = 0; i < path.length; i++) {
      if (!arr || path[i] < 0 || path[i] >= arr.length) return null;
      parent = i === 0 ? null : node;
      node = arr[path[i]];
      if (i < path.length - 1) {
        if (!node || node.kind !== 'loop') return null;
        arr = node.children || (node.children = []);
      } else {
        return {
          node: node,
          parentArr: i === 0 ? design.flow : (parent.children || []),
          index: path[i],
          parent: parent,
          path: path.slice(),
        };
      }
    }
    return null;
  }

  /** Children array for parentPath ([] = design.flow). */
  function childrenAt(parentPath) {
    if (!parentPath || !parentPath.length) return design.flow;
    var nav = navigatePath(parentPath);
    if (!nav || !nav.node || nav.node.kind !== 'loop') return null;
    if (!nav.node.children) nav.node.children = [];
    return nav.node.children;
  }

  /**
   * Wrap contiguous siblings under parentPath into a new loop.
   * parentPath=[] → top-level design.flow.
   */
  function wrapChildrenRange(parentPath, i0, i1, opts) {
    opts = opts || {};
    var arr = childrenAt(parentPath);
    if (!arr) return false;
    var a = Math.min(i0, i1);
    var b = Math.max(i0, i1);
    if (a < 0 || b >= arr.length || a > b) return false;
    if (a === b && arr[a].kind === 'loop' && !(opts && opts.force)) return false;
    var slice = arr.slice(a, b + 1);
    var children = slice.map(cloneFlowNode).filter(Boolean);
    if (!children.length) return false;
    var nameHint = opts.name || 'trials';
    if (!opts.name) {
      var firstR = firstRoutineName(children[0]);
      if (children.length === 1 && firstR) nameHint = firstR + '_loop';
      else if (firstR) nameHint = parentPath.length ? 'inner' : 'trials';
    }
    arr.splice(a, b - a + 1, {
      kind: 'loop',
      name: nameHint,
      nReps: opts.nReps != null ? opts.nReps : 10,
      loopType: 'sequential',
      children: children,
    });
    clearFlowSelection();
    selectedFlowPath = (parentPath || []).concat([a]);
    setFlowSelection(parentPath.length ? parentPath[0] : a, false);
    return true;
  }

  /** Top-level convenience (legacy). */
  function wrapFlowRange(i0, i1, opts) {
    return wrapChildrenRange([], i0, i1, opts);
  }

  function wrapSelectedFlow() {
    var keys = selectedFlowSorted();
    if (!keys.length) return false;
    for (var i = 1; i < keys.length; i++) {
      if (keys[i] !== keys[i - 1] + 1) return false;
    }
    return wrapFlowRange(keys[0], keys[keys.length - 1]);
  }

  /** Unwrap loop at path (nested OK). Children (incl. nested loops) expand in place. */
  function unwrapLoopAtPath(path) {
    var nav = navigatePath(path);
    if (!nav || !nav.node || nav.node.kind !== 'loop') return false;
    var kids = (nav.node.children || []).map(cloneFlowNode).filter(Boolean);
    nav.parentArr.splice.apply(nav.parentArr, [nav.index, 1].concat(kids));
    clearFlowSelection();
    selectedFlowPath = null;
    if (path.length === 1 && kids.length) setFlowSelection(path[0], false);
    else if (path.length > 1) setFlowSelection(path[0], false);
    return true;
  }

  function unwrapLoopAt(idx) {
    return unwrapLoopAtPath([idx]);
  }

  /** Expand top-level loop by absorbing neighbor (preserves nested structure). */
  function expandLoop(idx, dir) {
    var node = design.flow[idx];
    if (!node || node.kind !== 'loop') return false;
    if (dir === 'left' && idx > 0) {
      var left = cloneFlowNode(design.flow[idx - 1]);
      node.children = [left].concat(node.children || []);
      design.flow.splice(idx - 1, 1);
      setFlowSelection(idx - 1, false);
      return true;
    }
    if (dir === 'right' && idx < design.flow.length - 1) {
      var right = cloneFlowNode(design.flow[idx + 1]);
      node.children = (node.children || []).concat([right]);
      design.flow.splice(idx + 1, 1);
      setFlowSelection(idx, false);
      return true;
    }
    return false;
  }

  /** Shrink top-level loop: eject first/last child (loop or routine) onto Flow. */
  function shrinkLoop(idx, side) {
    var node = design.flow[idx];
    if (!node || node.kind !== 'loop') return false;
    var kids = node.children || [];
    if (kids.length <= 1) return unwrapLoopAt(idx);
    if (side === 'left') {
      var first = cloneFlowNode(kids.shift());
      design.flow.splice(idx, 0, first);
      setFlowSelection(idx + 1, false);
      return true;
    }
    var last = cloneFlowNode(kids.pop());
    design.flow.splice(idx + 1, 0, last);
    setFlowSelection(idx, false);
    return true;
  }

  /** Resolve loop node for inspector: selectedFlowPath or top-level selectedFlowIndex. */
  function selectedLoopNode() {
    if (selectedFlowPath && selectedFlowPath.length) {
      var nav = navigatePath(selectedFlowPath);
      if (nav && nav.node && nav.node.kind === 'loop') return nav.node;
    }
    if (selectedFlowIndex != null && design.flow[selectedFlowIndex]
        && design.flow[selectedFlowIndex].kind === 'loop') {
      return design.flow[selectedFlowIndex];
    }
    return null;
  }

  function emitChange() {
      markDirty();
      document.dispatchEvent(new CustomEvent('psyclaw:design-changed', { detail: design }));
    }

  function findRoutine(name) {
    return design.routines.find(function (r) { return r.name === name; });
  }

  function findComponent(id) {
    for (var i = 0; i < design.routines.length; i++) {
      var r = design.routines[i];
      for (var j = 0; j < r.components.length; j++) {
        if (r.components[j].id === id) return { routine: r, component: r.components[j], index: j };
      }
    }
    return null;
  }

  // ---------- Render ----------
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function render() {
      if (!design) return;
      renderPalette();
      renderDisplayPanel();
      renderRoutineTabs();
      renderTimeline();
      renderFlowList();
      renderConditionsPanel();
      renderInspector();
      renderJsonPreview();
    }

  var displayWired = false;
    var displaySilent = false;

    function formatAspect(w, h) {
          w = Math.max(1, Math.round(w));
          h = Math.max(1, Math.round(h));
          function g(a, b) {
            a = Math.abs(a); b = Math.abs(b);
            while (b) { var t = b; b = a % b; a = t; }
            return a || 1;
          }
          var d = g(w, h);
          return (w / d) + ':' + (h / d);
        }

        /** Prefer common labels (16:9…) when within ~1.2% — avoids 204:115 scale noise. */
        function prettyAspect(w, h) {
          // Order: most common first. Must all resolve via aspectPair (no null → true leak).
          var commons = ['16:9', '16:10', '21:9', '32:9', '4:3', '5:4', '3:2', '1:1'];
          for (var i = 0; i < commons.length; i++) {
            if (matchesAspectFilter(w, h, commons[i])) return commons[i];
          }
          return formatAspect(w, h);
        }

        function aspectPair(key) {
          if (key === '16:9') return [16, 9];
          if (key === '16:10') return [16, 10];
          if (key === '21:9') return [21, 9];
          if (key === '32:9') return [32, 9];
          if (key === '4:3') return [4, 3];
          if (key === '5:4') return [5, 4];
          if (key === '3:2') return [3, 2];
          if (key === '1:1') return [1, 1];
          if (key === 'screen') return screenDisplaySize();
          // Parse free-form "W:H" (e.g. design.display.aspectFilter leftovers)
          var m = String(key || '').match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
          if (m) return [parseFloat(m[1]), parseFloat(m[2])];
          return null;
        }

        function matchesAspectFilter(w, h, key) {
          if (!key || key === 'all' || key === 'free') return true;
          if (key === 'screen') {
            var scr = screenDisplaySize();
            return prettyAspect(w, h) === prettyAspect(scr[0], scr[1]);
          }
          var pair = aspectPair(key);
          // Unknown key must NOT match (old bug: null pair → true → every size labeled 32:9)
          if (!pair || !pair[0] || !pair[1]) return false;
          // tolerate 1.2% drift for integer sizes
          var target = pair[0] / pair[1];
          var got = w / h;
          return Math.abs(got - target) / target < 0.012;
        }

    /** Standard catalog (Overwatch-style) capped by host screen. */
    var RES_CATALOG = [
      [3840, 2160], [3440, 1440], [3200, 1800], [2880, 1800], [2560, 1600], [2560, 1440],
      [2048, 1536], [2048, 1152], [1920, 1200], [1920, 1080], [1680, 1050], [1600, 1200],
      [1600, 900], [1440, 900], [1366, 768], [1360, 768], [1280, 1024], [1280, 800],
      [1280, 720], [1152, 864], [1024, 768], [800, 600], [640, 480]
    ];

    function feasibleResolutions(hostW, hostH) {
      hostW = Math.max(320, Math.round(hostW) || 1920);
      hostH = Math.max(240, Math.round(hostH) || 1080);
      var out = [];
      var seen = {};
      function push(w, h, tag) {
        w = Math.round(w); h = Math.round(h);
        if (w < 320 || h < 240) return;
        if (w > hostW || h > hostH) return;
        var k = w + 'x' + h;
        if (seen[k]) return;
        seen[k] = true;
        out.push({ w: w, h: h, tag: tag || '', key: k, ratio: prettyAspect(w, h) });
      }
      push(hostW, hostH, 'native');
      // fractional scales of host (same aspect) — like game UI 75% / 50%
      [0.85, 0.75, 0.67, 0.5].forEach(function (s) {
        var w = Math.round(hostW * s / 8) * 8;
        var h = Math.round(hostH * s / 8) * 8;
        push(w, h, 'scale');
      });
      RES_CATALOG.forEach(function (p) { push(p[0], p[1], ''); });
      out.sort(function (a, b) {
        var da = a.w * a.h, db = b.w * b.h;
        if (db !== da) return db - da;
        return b.w - a.w;
      });
      return out;
    }

    function sizeFromAspect(w, h, key, lockFrom) {
      if (key === 'free' || key === 'all' || !key) return [w, h];
      if (key === 'screen') return screenDisplaySize();
      var pair = aspectPair(key);
      if (!pair) return [w, h];
      var aw = pair[0], ah = pair[1];
      if (!aw || !ah) return [w, h];
      if (lockFrom === 'h') {
        var nw = Math.max(320, Math.round(h * (aw / ah)));
        return [nw, Math.max(240, h)];
      }
      var nh = Math.max(240, Math.round(w * (ah / aw)));
      return [Math.max(320, w), nh];
    }

    function ensureDevices() {
              if (!design) {
                return {
                  keyboard: true, microphone: true, speaker: true,
                  keyboardDevice: '', mouseDevice: '', mouseSampleRate: 125,
                  micDevice: '', micLabel: '', micSampleRate: 44100,
                  speakerDevice: '', speakerLabel: '', speakerSampleRate: 44100,
                };
              }
              ensureDisplay(design);
              return design.devices;
            }

            /** Host PnP lists from System probe (keyboards / mice / speakers). */
            var hostKeyboards = [];
            var hostMice = [];
            var hostSpeakers = [];
            var hostMics = []; // browser MediaDeviceInfo-like { deviceId, label }

            function setHostInputDevices(payload) {
              payload = payload || {};
              hostKeyboards = Array.isArray(payload.keyboards) ? payload.keyboards.slice() : [];
              hostMice = Array.isArray(payload.mice) ? payload.mice.slice() : [];
              hostSpeakers = Array.isArray(payload.speakers) ? payload.speakers.slice() : [];
              if (Array.isArray(payload.mics)) hostMics = payload.mics.slice();
              rebuildDeviceSelects();
            }

            function setHostMics(list) {
              hostMics = Array.isArray(list) ? list.slice() : [];
              rebuildDeviceSelects();
            }

            function _devKey(it) {
              if (!it) return '';
              return String(it.instance_id || it.deviceId || it.id || it.name || it.label || '').trim();
            }

            function _devLabel(it) {
              if (!it) return '';
              var name = String(it.name || it.label || '').trim() || _devKey(it);
              var conn = it.connection ? String(it.connection) : '';
              if (conn && conn !== 'other') return name + ' · ' + conn;
              return name;
            }

            function _fillSelect(sel, items, selected, autoOptLabel) {
              if (!sel) return;
              var prev = selected != null ? String(selected) : String(sel.value || '');
              sel.innerHTML = '';
              var o0 = document.createElement('option');
              o0.value = '';
              o0.textContent = autoOptLabel || (typeof t === 'function' ? t('builder.ioDeviceAuto') : 'System default');
              if (o0.textContent === 'builder.ioDeviceAuto') o0.textContent = 'System default';
              o0.title = o0.textContent;
              sel.appendChild(o0);
              var seen = {};
              (items || []).forEach(function (it) {
                var val = _devKey(it);
                if (!val || seen[val]) return;
                seen[val] = true;
                var o = document.createElement('option');
                o.value = val;
                var lab = _devLabel(it) || val;
                o.textContent = lab;
                o.title = lab; // full name on hover (option list + selected)
                sel.appendChild(o);
              });
              // keep previous selection if still present; else keep stored value as orphan option
              if (prev) {
                var found = false;
                for (var i = 0; i < sel.options.length; i++) {
                  if (sel.options[i].value === prev) { found = true; break; }
                }
                if (!found) {
                  var ox = document.createElement('option');
                  ox.value = prev;
                  var oxLab = prev + ' (saved)';
                  ox.textContent = oxLab;
                  ox.title = oxLab;
                  sel.appendChild(ox);
                }
                sel.value = prev;
              } else {
                sel.value = '';
              }
              // Closed select shows truncated label; title = full selected text
              var cur = sel.options[sel.selectedIndex];
              sel.title = cur ? String(cur.title || cur.textContent || '') : '';
              if (!sel._titleSyncWired) {
                sel._titleSyncWired = true;
                sel.addEventListener('change', function () {
                  var c = sel.options[sel.selectedIndex];
                  sel.title = c ? String(c.title || c.textContent || '') : '';
                });
              }
            }

            function rebuildDeviceSelects() {
              var dev = ensureDevices();
              _fillSelect(document.getElementById('disp-kb-device'), hostKeyboards, dev.keyboardDevice);
              _fillSelect(document.getElementById('disp-mouse-device'), hostMice, dev.mouseDevice);
              _fillSelect(document.getElementById('disp-mic-device'), hostMics, dev.micDevice || dev.micLabel);
              _fillSelect(document.getElementById('disp-spk-device'), hostSpeakers, dev.speakerDevice || dev.speakerLabel);
              var mRate = document.getElementById('disp-mouse-rate');
              var micRate = document.getElementById('disp-mic-rate');
              var spkRate = document.getElementById('disp-spk-rate');
              if (mRate) {
                var mr = String(dev.mouseSampleRate || 125);
                if (![].some.call(mRate.options, function (o) { return o.value === mr; })) {
                  var o = document.createElement('option'); o.value = mr; o.textContent = mr + ' Hz'; mRate.appendChild(o);
                }
                mRate.value = mr;
              }
              if (micRate) {
                var r = String(dev.micSampleRate || 44100);
                if (![].some.call(micRate.options, function (o) { return o.value === r; })) {
                  var o2 = document.createElement('option'); o2.value = r; o2.textContent = r + ' Hz'; micRate.appendChild(o2);
                }
                micRate.value = r;
              }
              if (spkRate) {
                var sr = String(dev.speakerSampleRate || 44100);
                if (![].some.call(spkRate.options, function (o) { return o.value === sr; })) {
                  var o3 = document.createElement('option'); o3.value = sr; o3.textContent = sr + ' Hz'; spkRate.appendChild(o3);
                }
                spkRate.value = sr;
              }
            }

        var COMMON_ASPECTS = ['16:9', '16:10', '21:9', '4:3', '5:4', '1:1'];

                /** Map W×H to a common aspect option, or 'free'. */
                function aspectKeyForSize(w, h) {
                  for (var i = 0; i < COMMON_ASPECTS.length; i++) {
                    if (matchesAspectFilter(w, h, COMMON_ASPECTS[i])) return COMMON_ASPECTS[i];
                  }
                  return 'free';
                }

                /** Largest feasible size on host for a fixed aspect key. */
                                function largestSizeForAspect(key) {
                                  var host = screenDisplaySize();
                                  var hostW = host[0], hostH = host[1];
                                  if (key === 'screen' || key === 'all' || !key || key === 'free') return [hostW, hostH];
                                  var pair = aspectPair(key);
                                  if (!pair) return [hostW, hostH];
                                  // Geometric max fit into host (true largest at that ratio)
                                  var aw = pair[0], ah = pair[1];
                                  var byW = [hostW, Math.max(240, Math.round(hostW * ah / aw))];
                                  var byH = [Math.max(320, Math.round(hostH * aw / ah)), hostH];
                                  var geo = (byW[1] <= hostH) ? byW : byH;
                                  // Prefer catalog native/scale if equal aspect and ≥ geo (keep even dims)
                                  var catalog = feasibleResolutions(hostW, hostH);
                                  for (var i = 0; i < catalog.length; i++) {
                                    if (matchesAspectFilter(catalog[i].w, catalog[i].h, key)) {
                                      var c = catalog[i];
                                      if (c.w * c.h >= geo[0] * geo[1] * 0.98) return [c.w, c.h];
                                      break; // first match is largest; if smaller than geo, use geo
                                    }
                                  }
                                  return geo;
                                }

                function rebuildMonitorSelect() {
          var monSel = document.getElementById('disp-monitor');
          if (!monSel) return;
          var cur = 0;
          try {
            cur = Math.max(0, parseInt(design && design.display && design.display.screen, 10) || 0);
          } catch (e) { cur = 0; }
          monSel.innerHTML = '';
          var list = hostMonitors && hostMonitors.length ? hostMonitors : null;
          if (!list) {
            var fb = screenDisplaySize();
            var opt0 = document.createElement('option');
            opt0.value = '0';
            opt0.dataset.w = String(fb[0]);
            opt0.dataset.h = String(fb[1]);
            opt0.textContent = (t('builder.monitorFallback') || 'This browser screen') +
              '  ·  ' + fb[0] + '×' + fb[1];
            opt0.selected = true;
            monSel.appendChild(opt0);
            return;
          }
          var found = false;
          list.forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = String(m.index);
            opt.dataset.w = String(m.width);
            opt.dataset.h = String(m.height);
            var lab = m.label || ('Monitor ' + (Number(m.index) + 1));
            opt.textContent = lab + '  ·  ' + m.width + '×' + m.height;
            if (Number(m.index) === cur) {
              opt.selected = true;
              found = true;
            }
            monSel.appendChild(opt);
          });
          if (!found && monSel.options.length) {
            // prefer primary
            for (var i = 0; i < list.length; i++) {
              if (list[i].primary) {
                monSel.value = String(list[i].index);
                found = true;
                break;
              }
            }
            if (!found) monSel.selectedIndex = 0;
            if (design && design.display) {
              design.display.screen = parseInt(monSel.value, 10) || 0;
            }
          }
        }

    function isCustomDisplayMode() {
      var res = document.getElementById('disp-res');
      return !!(res && res.value === '__custom__');
    }

    function setCustomRowVisible(show) {
      var row = document.getElementById('disp-custom-row');
      if (!row) return;
      // .sys-setting-row { display:grid } beats bare [hidden] without !important
      if (show) {
        row.hidden = false;
        row.removeAttribute('hidden');
        row.classList.remove('is-hidden');
      } else {
        row.hidden = true;
        row.setAttribute('hidden', '');
        row.classList.add('is-hidden');
      }
    }

    /** Fill #disp-res with feasible sizes: "1920×1080 (16:9)" … + Custom. */
    function rebuildResSelect() {
      var resSel = document.getElementById('disp-res');
      if (!resSel) return;
      var host = screenDisplaySize();
      var catalog = feasibleResolutions(host[0], host[1]);
      var curW = 0, curH = 0;
      try {
        if (design && design.display && design.display.size) {
          curW = Math.round(Number(design.display.size[0]) || 0);
          curH = Math.round(Number(design.display.size[1]) || 0);
        }
      } catch (e) { curW = 0; curH = 0; }
      if (!curW || !curH) {
        curW = host[0];
        curH = host[1];
      }
      var curKey = curW + 'x' + curH;
      var prev = String(resSel.value || '');
      resSel.innerHTML = '';
      var found = false;
      var nativeLab = (typeof t === 'function' ? t('builder.resNative') : '') || 'native';
      if (nativeLab === 'builder.resNative') nativeLab = 'native';
      catalog.forEach(function (item) {
        var o = document.createElement('option');
        o.value = item.key;
        var tag = item.tag === 'native' ? (' · ' + nativeLab) : '';
        o.textContent = item.w + '\u00d7' + item.h + ' (' + item.ratio + ')' + tag;
        if (item.key === curKey) {
          o.selected = true;
          found = true;
        }
        resSel.appendChild(o);
      });
      if (!found && curW && curH) {
        var ox = document.createElement('option');
        ox.value = curKey;
        ox.textContent = curW + '\u00d7' + curH + ' (' + prettyAspect(curW, curH) + ')';
        ox.selected = true;
        resSel.appendChild(ox);
        found = true;
      }
      var customLab = (typeof t === 'function' ? t('builder.resCustom') : '') || 'Custom\u2026';
      if (customLab === 'builder.resCustom') customLab = 'Custom\u2026';
      var oc = document.createElement('option');
      oc.value = '__custom__';
      oc.textContent = customLab;
      resSel.appendChild(oc);
      if (!found) {
        oc.selected = true;
      }
      setCustomRowVisible(resSel.value === '__custom__');
    }

    function updateDisplayPreview(w, h, fullscreen) {
      w = Math.max(1, Math.round(Number(w) || 0));
      h = Math.max(1, Math.round(Number(h) || 0));
      var sizeEl = document.getElementById('disp-preview-size');
      var ratioLab = document.getElementById('disp-ratio-label');
      var hostEl = document.getElementById('disp-preview-host');
      var hostBadge = document.getElementById('disp-preview-host-badge');
      var inner = document.getElementById('disp-preview-inner');
      var resEl = document.getElementById('disp-preview-res');
      var fsPill = document.getElementById('disp-preview-fs');
      var stage = document.getElementById('disp-preview-stage');
      var scr = screenDisplaySize();
      var hostW = Math.max(1, scr[0]);
      var hostH = Math.max(1, scr[1]);
      if (sizeEl) sizeEl.textContent = (w && h) ? (w + ' \u00d7 ' + h) : '\u2014';
      if (ratioLab) ratioLab.textContent = (w && h) ? prettyAspect(w, h) : '\u2014';
      // Outer chassis = host monitor aspect; fill stage box (large preview)
            if (hostEl) {
              hostEl.style.aspectRatio = hostW + ' / ' + hostH;
              var stageW = 0, stageH = 0;
              if (stage) {
                var sr = stage.getBoundingClientRect();
                stageW = sr.width || 0;
                stageH = sr.height || 0;
              }
              var hostAspect = hostW / hostH;
              var fitW, fitH;
              if (stageW > 40 && stageH > 40) {
                // Fit largest host inside stage, keep aspect — fill both axes
                var pad = 2;
                var availW = Math.max(80, stageW - pad * 2);
                var availH = Math.max(60, stageH - pad * 2);
                if (availW / availH >= hostAspect) {
                  fitH = availH;
                  fitW = availH * hostAspect;
                } else {
                  fitW = availW;
                  fitH = availW / hostAspect;
                }
              } else if (stageW > 40) {
                fitW = stageW;
                fitH = fitW / hostAspect;
              } else {
                // Cold layout before stage measured
                fitW = hostW >= hostH ? 360 : 220;
                fitH = fitW / hostAspect;
              }
              hostEl.style.width = Math.round(fitW) + 'px';
              hostEl.style.height = Math.round(fitH) + 'px';
              hostEl.style.maxWidth = '100%';
              hostEl.style.maxHeight = '100%';
              hostEl.classList.remove('is-portrait');
              if (hostW < hostH) hostEl.classList.add('is-portrait');
            }
      if (hostBadge) {
        hostBadge.textContent = hostW + '\u00d7' + hostH;
        hostBadge.title = 'Host monitor \u00b7 ' + formatAspect(hostW, hostH);
      }
      if (inner && w && h) {
              // Red box = design ASPECT letterboxed inside host hardware aspect.
              var hostAspect = hostW / hostH;
              var designAspect = w / h;
              var pctW, pctH;
              if (designAspect >= hostAspect) {
                pctW = 100;
                pctH = Math.max(8, Math.min(100, (hostAspect / designAspect) * 100));
              } else {
                pctH = 100;
                pctW = Math.max(8, Math.min(100, (designAspect / hostAspect) * 100));
              }
              inner.style.width = pctW.toFixed(2) + '%';
              inner.style.height = pctH.toFixed(2) + '%';
              if (Math.abs(pctW - 100) < 0.5 && Math.abs(pctH - 100) < 0.5) {
                inner.classList.add('is-match');
              } else {
                inner.classList.remove('is-match');
              }
              var bg = normalizeBgcolor(
                arguments.length >= 4 && arguments[3] != null
                  ? arguments[3]
                  : (design && design.display && design.display.bgcolor)
              );
              inner.style.background = bg;
              try {
                var rr = parseInt(bg.slice(1, 3), 16);
                var gg = parseInt(bg.slice(3, 5), 16);
                var bb = parseInt(bg.slice(5, 7), 16);
                var L = 0.299 * rr + 0.587 * gg + 0.114 * bb;
                inner.style.color = L > 140 ? '#111' : '#f2f2f2';
              } catch (eBg) { /* ignore */ }
            }
      if (resEl) {
        resEl.textContent = (w && h) ? (w + '\u00d7' + h) : '\u2014';
        resEl.title = (w && h)
          ? ('Design ' + w + '\u00d7' + h + ' \u00b7 ' + formatAspect(w, h) +
            '  inside host ' + hostW + '\u00d7' + hostH + ' \u00b7 ' + formatAspect(hostW, hostH))
          : '';
      }
      var hintEl = document.getElementById('disp-preview-hint');
      if (hintEl) {
        var hint = (typeof t === 'function' ? t('builder.previewBlackHint') : '') ||
          'Black output preview (participant window)';
        if (hint === 'builder.previewBlackHint') hint = 'Black output preview (participant window)';
        hintEl.textContent = hint;
        hintEl.hidden = false;
      }
      if (inner) {
        inner.classList.toggle('is-empty-design', !(w && h));
        if (!(w && h)) {
          // Soft checker so pure black does not look like a broken panel
          inner.style.background = '';
          inner.style.color = '';
        }
      }
      if (hostEl) hostEl.classList.toggle('is-empty-design', !(w && h));
      if (fsPill) fsPill.hidden = !fullscreen;
      if (stage) {
              stage.title = (w && h)
                ? ('Host ' + hostW + '\u00d7' + hostH + ' \u00b7 design ' + w + '\u00d7' + h)
                : ((typeof t === 'function' ? t('builder.previewBlackHint') : '') || 'Black output preview');
              stage.style.cursor = 'default';
            }
    }

    /** Display preview: no hover zoom (user). Keep ResizeObserver re-fit only. */
        function closeDisplayPreviewZoom() {
          // no-op legacy cleanup if a portal was left
          var stage = document.getElementById('disp-preview-stage');
          if (stage) stage.classList.remove('is-source-zoomed');
          var veil = document.getElementById('disp-zoom-veil');
          var portal = document.getElementById('disp-zoom-portal');
          if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
          if (portal && portal.parentNode) portal.parentNode.removeChild(portal);
        }
        function wireDisplayPreviewZoom() {
          var stage = document.getElementById('disp-preview-stage');
          if (!stage || stage._zoomWired) return;
          stage._zoomWired = true;
          // Re-fit host chassis when stage size changes (adaptive layout / window resize)
          if (typeof ResizeObserver !== 'undefined' && !stage._previewRo) {
            var roTimer = null;
            stage._previewRo = new ResizeObserver(function () {
              if (roTimer) clearTimeout(roTimer);
              roTimer = setTimeout(function () {
                try {
                  if (!design) return;
                  ensureDisplay(design);
                                    var spec = getDisplaySpec();
                                    updateDisplayPreview(spec.width, spec.height, !!spec.fullscreen, spec.bgcolor);
                } catch (eRo) { /* ignore */ }
              }, 40);
            });
            stage._previewRo.observe(stage);
          }
        }

    function renderDisplayPanel() {
                  var wIn = document.getElementById('disp-w');
                  var hIn = document.getElementById('disp-h');
                  var fs = document.getElementById('disp-fs');
                  var bgIn = document.getElementById('disp-bgcolor');
                  var bgPicker = document.getElementById('disp-bgcolor-picker');
                  var refreshLab = document.getElementById('disp-refresh-label');
                  var hostHint = document.getElementById('disp-host-hint');
                  if (!wIn || !hIn) return;
                  ensureDisplay(design);
                  var spec = getDisplaySpec();
                  displaySilent = true;
                  try {
                    rebuildMonitorSelect();
                    wIn.value = String(spec.width);
                    hIn.value = String(spec.height);
                    if (fs) fs.checked = !!spec.fullscreen;
                    if (bgIn || bgPicker) {
                      syncBgcolorInputs(spec.bgcolor);
                    }
                    if (refreshLab) {
                      if (hostRefreshHz != null) {
                        refreshLab.textContent = '~' + hostRefreshHz + ' Hz';
                        refreshLab.title = (typeof t === 'function' ? t('builder.dispRefreshTitle') : '') ||
                          'Host estimate only — PsychoPy cannot set OS refresh rate';
                      } else {
                        refreshLab.textContent = (typeof t === 'function' ? t('builder.dispRefreshUnknown') : '') || '—';
                        refreshLab.title = (typeof t === 'function' ? t('builder.dispRefreshTitle') : '') ||
                          'Host estimate only — PsychoPy cannot set OS refresh rate';
                      }
                    }
                    rebuildResSelect();
                    rebuildDeviceSelects();
                    updateDisplayPreview(spec.width, spec.height, !!spec.fullscreen, spec.bgcolor);
                    if (hostHint) {
                                  var scr = screenDisplaySize();
                                  var mon = getSelectedMonitor();
                                  var monBit = mon
                                    ? ((mon.label || ('Monitor ' + (Number(mon.index) + 1))) + ' \u00b7 ')
                                    : '';
                                  var r = prettyAspect(scr[0], scr[1]);
                                  var msg = (typeof t === 'function')
                                    ? t('builder.hostScreen', { w: scr[0], h: scr[1], r: r })
                                    : ('Host screen ' + scr[0] + '\u00d7' + scr[1] + ' (' + r + ')');
                                  if (!msg || msg === 'builder.hostScreen') {
                                    msg = 'Host screen ' + scr[0] + '\u00d7' + scr[1] + ' (' + r + ')';
                                  }
                                  hostHint.textContent = monBit + msg;
                                }
                  } finally {
                    displaySilent = false;
                  }
                  wireDisplayCard();
                }

    function applyDisplayFields(opts) {
              if (displaySilent) return;
              opts = opts || {};
              var wIn = document.getElementById('disp-w');
              var hIn = document.getElementById('disp-h');
              var fs = document.getElementById('disp-fs');
              var bgIn = document.getElementById('disp-bgcolor');
              var bgPicker = document.getElementById('disp-bgcolor-picker');
              var resSel = document.getElementById('disp-res');
              if (!wIn || !hIn || !design) return;
              ensureDisplay(design);
              var w, h;

              if (opts.fromScreen) {
                var scr = screenDisplaySize();
                w = scr[0]; h = scr[1];
              } else if (opts.fromRes && resSel && resSel.value && resSel.value !== '__custom__') {
                var parts = String(resSel.value).split('x');
                w = parseInt(parts[0], 10);
                h = parseInt(parts[1], 10);
              } else if (opts.lockFrom || opts.showCustom || (resSel && resSel.value === '__custom__')) {
                w = parseInt(wIn.value, 10);
                h = parseInt(hIn.value, 10);
              } else if (resSel && resSel.value && resSel.value !== '__custom__') {
                var p2 = String(resSel.value).split('x');
                w = parseInt(p2[0], 10);
                h = parseInt(p2[1], 10);
              } else {
                w = parseInt(wIn.value, 10);
                h = parseInt(hIn.value, 10);
              }

              if (!isFinite(w) || w < 320) w = 320;
              if (!isFinite(h) || h < 240) h = 240;
              design.display.size = [w, h];
              if (fs) design.display.fullscreen = !!fs.checked;
              if (bgIn || bgPicker) {
                var rawBg;
                if (opts.fromPicker && bgPicker) {
                  ensureBgcolorSelect(bgPicker);
                  if (bgPicker.value === '__custom__') {
                    // Keep current design; focus free-RGB text for custom entry.
                    rawBg = bgIn ? bgIn.value : design.display.bgcolor;
                    if (bgIn) {
                      try { bgIn.focus(); bgIn.select(); } catch (eF) { /* ignore */ }
                    }
                  } else {
                    rawBg = bgPicker.value;
                  }
                } else {
                  rawBg = bgIn ? bgIn.value : design.display.bgcolor;
                }
                var normBg = normalizeBgcolor(rawBg, { strict: true });
                if (normBg) {
                  design.display.bgcolor = preferredColorStore(normBg) || normBg;
                  if (bgIn) {
                    bgIn.classList.remove('is-invalid');
                    if (!opts.liveType) bgIn.value = normBg;
                  }
                  if (bgPicker) {
                    ensureBgcolorSelect(bgPicker);
                    var entA = colorEntryOf(normBg);
                    try { bgPicker.value = entA ? entA.hex : '__custom__'; } catch (ePv) { /* ignore */ }
                  }
                  var labEl = document.getElementById('disp-bgcolor-label');
                  if (labEl) { labEl.hidden = true; labEl.textContent = ''; }
                } else if (bgIn && !opts.fromPicker) {
                  bgIn.classList.add('is-invalid');
                  if (bgPicker) {
                    ensureBgcolorSelect(bgPicker);
                    try { bgPicker.value = '__custom__'; } catch (ePv2) { /* ignore */ }
                  }
                  var labBad = document.getElementById('disp-bgcolor-label');
                  if (labBad) { labBad.hidden = true; labBad.textContent = ''; }
                }
              }
              // Keep legacy field for old designs; no longer UI-driven.
              try {
                design.display.aspectFilter = formatAspect(w, h);
              } catch (e) { /* ignore */ }

              displaySilent = true;
              try {
                wIn.value = String(w);
                hIn.value = String(h);
                rebuildResSelect();
                if (opts.showCustom || opts.lockFrom) {
                  // User typed custom W/H — force Custom option if size not in catalog.
                  if (resSel) {
                    var k = w + 'x' + h;
                    var inList = false;
                    for (var i = 0; i < resSel.options.length; i++) {
                      if (resSel.options[i].value === k) { inList = true; break; }
                    }
                    if (!inList) {
                      resSel.value = '__custom__';
                      setCustomRowVisible(true);
                    }
                  }
                }
                updateDisplayPreview(
                  w, h,
                  fs ? !!fs.checked : !!(design.display && design.display.fullscreen),
                  design.display.bgcolor
                );
              } finally {
                displaySilent = false;
              }
              emitChange();
              try {
                var host = document.getElementById('builder-inspector');
                if (host && host.querySelector('.comp-preview-root')) renderInspector();
              } catch (e) { /* ignore */ }
            }

    function applyDeviceToggles() {
          if (displaySilent || !design) return;
          ensureDisplay(design);
          var kbDev = document.getElementById('disp-kb-device');
          var mouseDev = document.getElementById('disp-mouse-device');
          var mouseRate = document.getElementById('disp-mouse-rate');
          var micDev = document.getElementById('disp-mic-device');
          var micRate = document.getElementById('disp-mic-rate');
          var spkDev = document.getElementById('disp-spk-device');
          var spkRate = document.getElementById('disp-spk-rate');
          // Enable toggles removed from UI — devices always available; design components gate usage
          design.devices.keyboard = true;
          design.devices.microphone = true;
          design.devices.speaker = true;
          if (kbDev) design.devices.keyboardDevice = String(kbDev.value || '');
          if (mouseDev) design.devices.mouseDevice = String(mouseDev.value || '');
          if (mouseRate) {
            var mr = parseInt(mouseRate.value, 10);
            design.devices.mouseSampleRate = (isFinite(mr) && mr > 0) ? mr : 125;
          }
          if (micDev) {
            var mid = String(micDev.value || '');
            design.devices.micDevice = mid;
            var mopt = micDev.options[micDev.selectedIndex];
            design.devices.micLabel = mopt && mid ? String(mopt.textContent || '').replace(/\s*\(saved\)\s*$/, '') : '';
          }
          if (micRate) {
            var r = parseInt(micRate.value, 10);
            design.devices.micSampleRate = (isFinite(r) && r > 0) ? r : 44100;
          }
          if (spkDev) {
            var sid = String(spkDev.value || '');
            design.devices.speakerDevice = sid;
            var sopt = spkDev.options[spkDev.selectedIndex];
            design.devices.speakerLabel = sopt && sid ? String(sopt.textContent || '').replace(/\s*\(saved\)\s*$/, '') : '';
          }
          if (spkRate) {
            var sr = parseInt(spkRate.value, 10);
            design.devices.speakerSampleRate = (isFinite(sr) && sr > 0) ? sr : 44100;
          }
          emitChange();
        }

        function wireDisplayCard() {
                          if (displayWired) return;
                          var wIn = document.getElementById('disp-w');
                          var hIn = document.getElementById('disp-h');
                          var fs = document.getElementById('disp-fs');
                          var bgIn = document.getElementById('disp-bgcolor');
                          var bgPicker = document.getElementById('disp-bgcolor-picker');
                          var monSel = document.getElementById('disp-monitor');
                          var resSel = document.getElementById('disp-res');
                          if (!wIn || !hIn) return;
                          displayWired = true;
                          wIn.addEventListener('change', function () { applyDisplayFields({ lockFrom: 'w', showCustom: true }); });
                          hIn.addEventListener('change', function () { applyDisplayFields({ lockFrom: 'h', showCustom: true }); });
                          if (fs) fs.addEventListener('change', function () { applyDisplayFields({}); });
                          if (bgIn) {
                            bgIn.addEventListener('change', function () { applyDisplayFields({}); });
                            bgIn.addEventListener('blur', function () { applyDisplayFields({}); });
                            bgIn.addEventListener('keydown', function (ev) {
                              if (ev.key === 'Enter') {
                                ev.preventDefault();
                                applyDisplayFields({});
                                bgIn.blur();
                              }
                            });
                          }
                          if (bgPicker) {
                            bgPicker.addEventListener('change', function () {
                              applyDisplayFields({ fromPicker: true });
                            });
                          }
                          if (monSel) {
                            monSel.addEventListener('change', function () {
                              if (!design) return;
                              ensureDisplay(design);
                              var idx = parseInt(monSel.value, 10);
                              if (!isFinite(idx) || idx < 0) idx = 0;
                              design.display.screen = idx;
                              // Switching monitor → snap size to that monitor native + rebuild res list
                              applyDisplayFields({ fromScreen: true });
                            });
                          }
                          if (resSel) {
                            resSel.addEventListener('change', function () {
                              if (!design) return;
                              if (resSel.value === '__custom__') {
                                setCustomRowVisible(true);
                                applyDisplayFields({ showCustom: true });
                              } else {
                                setCustomRowVisible(false);
                                applyDisplayFields({ fromRes: true });
                              }
                            });
                          }
                          ['disp-mic-device', 'disp-mic-rate',
                           'disp-spk-device', 'disp-spk-rate'].forEach(function (id) {
                            var elSel = document.getElementById(id);
                            if (elSel) elSel.addEventListener('change', applyDeviceToggles);
                          });
                          wireDisplayPreviewZoom();
                        }


  // ---- builder-part-ui.js ----
  function renderPalette() {
    var box = document.getElementById('builder-palette');
    if (!box) return;
    box.innerHTML = '';
    COMPONENT_TYPES.forEach(function (ct) {
      var item = el('div', 'builder-palette-item type-' + ct.type);
      item.draggable = true;
      item.dataset.componentType = ct.type;
      item.innerHTML =
        '<span class="pal-icon">' + componentIconHtml(ct.type) + '</span>' +
        '<span class="pal-copy">' +
          '<span class="pal-label">' + escapeHtml(componentLabel(ct)) + '</span>' +
          '<span class="pal-sub">' + escapeHtml(ct.type) + '</span>' +
        '</span>';
      item.title = t('comp.dragOnto');
                  item.addEventListener('dragstart', function (e) {
                    // text/plain required — Chrome often blanks custom MIME types on drop
                    try {
                      e.dataTransfer.setData('text/plain', ct.type);
                      e.dataTransfer.setData('application/x-psyclaw-type', ct.type);
                    } catch (err) { /* IE */ }
                    e.dataTransfer.effectAllowed = 'copy';
                    paletteDragType = ct.type;
                    paletteDropStart = null;
                    item.classList.add('dragging');
                    document.body.classList.add('is-palette-dragging');
                  });
                  item.addEventListener('dragend', function () {
                    item.classList.remove('dragging');
                    document.body.classList.remove('is-palette-dragging');
                    paletteDragType = null;
                    paletteDropStart = null;
                    clearPaletteDropPreview();
                    document.querySelectorAll('.builder-lanes.drag-over, .timeline-track.drag-over, .builder-drop-zone.drag-over').forEach(function (n) {
                      n.classList.remove('drag-over');
                    });
                  });
                  // click-to-add fallback (DnD flaky in some hosts)
                  item.addEventListener('dblclick', function () {
                    if (selectedRoutine) addComponent(selectedRoutine, ct.type);
                  });
                  box.appendChild(item);
    });
  }

  function renderRoutineTabs() {
      var box = document.getElementById('builder-routine-tabs');
      if (!box) return;
      box.innerHTML = '';
      box.classList.toggle('is-editing', !!routineEditMode);
      var canDelete = design.routines.length > 1;
      var LONG_MS = 480;

      design.routines.forEach(function (r, tabIdx) {
        var tab = el('button', 'builder-routine-tab'
          + (r.name === selectedRoutine ? ' active' : '')
          + (routineEditMode ? ' is-jiggling' : ''));
        tab.type = 'button';
        tab.dataset.routine = r.name;
        // name label (× is separate absolute badge)
        var label = el('span', 'builder-routine-tab-label');
        label.textContent = r.name;
        tab.appendChild(label);
        if (routineEditMode) {
          // staggered jiggle like iOS home screen
          tab.style.animationDelay = ((tabIdx % 5) * 0.03) + 's';
        }

        // Long-press → enter iOS-style delete mode (not while already editing)
        tab.addEventListener('pointerdown', function (e) {
          if (e.button != null && e.button !== 0) return;
          if (routineEditMode) return;
          if (e.target && e.target.closest && e.target.closest('.builder-routine-del')) return;
          routineLongPressFired = false;
          clearRoutineLongPress();
          var startX = e.clientX;
          var startY = e.clientY;
          routineLongPressTimer = setTimeout(function () {
                      routineLongPressTimer = null;
                      routineLongPressFired = true;
                      routineEditMode = true;
                      try {
                        if (navigator.vibrate) navigator.vibrate(12);
                      } catch (ve) { /* ignore */ }
                      render();
                      // re-render destroys the pressed tab — no end-click will arrive; clear so first tap confirms
                      setTimeout(function () { routineLongPressFired = false; }, 0);
                    }, LONG_MS);
          function onMove(ev) {
            if (Math.abs(ev.clientX - startX) > 10 || Math.abs(ev.clientY - startY) > 10) {
              clearRoutineLongPress();
            }
          }
          function onUp() {
            clearRoutineLongPress();
            tab.removeEventListener('pointermove', onMove);
            tab.removeEventListener('pointerup', onUp);
            tab.removeEventListener('pointercancel', onUp);
          }
          tab.addEventListener('pointermove', onMove);
          tab.addEventListener('pointerup', onUp);
          tab.addEventListener('pointercancel', onUp);
        });
        tab.addEventListener('contextmenu', function (e) {
          // long-press should not open browser menu on tabs
          e.preventDefault();
        });

        tab.addEventListener('click', function (e) {
                  if (e.target && e.target.closest && e.target.closest('.builder-routine-del')) return;
                  // swallow the click that ends a long-press
                  if (routineLongPressFired) {
                    routineLongPressFired = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  // Edit mode: single-click any routine confirms / exits (Done still works)
                  if (routineEditMode) {
                    routineEditMode = false;
                    selectedRoutine = r.name;
                    selectedComponentId = null;
                    clearFlowSelection();
                    render();
                    return;
                  }
                  selectedRoutine = r.name;
                  selectedComponentId = null;
                  clearFlowSelection(); // timeline focus ≠ flow loop selection
                  render();
                });

        if (routineEditMode && canDelete) {
                  var del = el('button', 'builder-routine-del');
                  del.type = 'button';
                  del.setAttribute('aria-label', t('flow.deleteRoutine', { name: r.name }));
                  del.title = t('flow.deleteRoutine', { name: r.name });
                  var xMark = document.createElement('span');
                  xMark.className = 'builder-routine-del-x';
                  xMark.setAttribute('aria-hidden', 'true');
                  xMark.textContent = '\u00d7';
                  del.appendChild(xMark);
                  del.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (deleteRoutineByName(r.name)) {
                      render();
                      emitChange();
                    }
                  });
                  del.addEventListener('pointerdown', function (e) {
                    e.stopPropagation();
                  });
                  tab.appendChild(del);
                } else if (routineEditMode && !canDelete) {
                  tab.title = t('flow.keepOneRoutine');
                }

        box.appendChild(tab);
      });

      if (routineEditMode) {
        var done = el('button', 'builder-routine-tab done');
        done.type = 'button';
        done.textContent = t('flow.doneEditRoutines');
        done.title = t('flow.doneEditRoutinesHint');
        done.addEventListener('click', function () {
          routineEditMode = false;
          render();
        });
        box.appendChild(done);
      } else {
        var add = el('button', 'builder-routine-tab add');
        add.type = 'button';
        add.textContent = t('flow.addRoutine');
        add.addEventListener('click', function () {
          var name = 'routine_' + (design.routines.length + 1);
          design.routines.push({ name: name, components: [] });
          design.flow.push({ kind: 'routine', routine: name });
          selectedRoutine = name;
          selectedComponentId = null;
          render();
          emitChange();
        });
        box.appendChild(add);
      }
    }

  function timelineScale(start, duration) {
            var maxT = getTimelineMax();
            var s = Math.max(0, Number(start) || 0);
            if (s > maxT) s = maxT;
            var open = isOpenDuration(duration);
            var left = (s / maxT) * 100;
            if (open) {
              // Open-ended: fill from start to scale end (dashed right edge = ∞)
              var wOpen = 100 - left;
              if (wOpen < 2) wOpen = 2;
              if (left + wOpen > 100) wOpen = Math.max(1, 100 - left);
              return { left: left + '%', width: wOpen + '%', open: true };
            }
            var d = Number(duration);
            if (isNaN(d) || d < 0) d = 0;
            if (s + d > maxT) d = Math.max(0, maxT - s);
            var width = (d / maxT) * 100;
            // tiny fixed bars still need a clickable sliver
            if (width < 2 && d > 0) width = 2;
            if (left + width > 100) width = Math.max(1, 100 - left);
            return { left: left + '%', width: width + '%', open: false };
          }

      function applyBarPos(bar, pos) {
        bar.style.left = pos.left;
        bar.classList.toggle('open-ended', !!pos.open);
        bar.style.width = pos.width;
        bar.style.minWidth = '';
      }

    function pxToTime(px, laneWidth) {
              if (!laneWidth) return 0;
              return (px / laneWidth) * getTimelineMax();
            }

        function quantize(t, forceSnap) {
              var doSnap = forceSnap != null ? forceSnap : snapEnabled;
              var n;
              if (!doSnap) n = Math.round(t * 1000) / 1000; // 1ms precision
              else n = Math.round(t / SNAP) * SNAP;
              // kill IEEE dust (1.6500000000000001)
              return Math.round(n * 1000) / 1000;
            }

        function roundT(t) {
          return quantize(t, snapEnabled);
        }

        /** Palette → timeline DnD: type + last previewed start (dataTransfer unreadable in dragover). */
        var paletteDragType = null;
        var paletteDropStart = null;

        function defaultDurationForType(type) {
                  if (type === 'keyboard') return OPEN_DURATION;
                  if (type === 'video') return 3;
                  return 0.5;
                }

        function clearPaletteDropPreview() {
          document.querySelectorAll(
            '.builder-lane.is-drop-preview, .timeline-drop-playhead, .timeline-drop-time'
          ).forEach(function (n) {
            if (n && n.parentNode) n.parentNode.removeChild(n);
          });
        }

        function clientXToStart(clientX, coordEl) {
          if (!coordEl) return 0;
          var rect = coordEl.getBoundingClientRect();
          var w = rect.width || 1;
          var x = clientX - rect.left;
          if (x < 0) x = 0;
          if (x > w) x = w;
          var t = roundT(pxToTime(x, w));
          if (t < 0) t = 0;
          return t;
        }

        /**
         * Live ghost bar + playhead: where a dropped component would land.
         * @returns {number} quantized start seconds
         */
        function showPaletteDropPreview(type, start, lanes) {
          if (!lanes || !type) return start || 0;
          var maxT = getTimelineMax();
          if (!(maxT > 0)) maxT = 1;
          var t = Number(start) || 0;
          if (t < 0) t = 0;
          var leftPct = (t / maxT) * 100;
          if (leftPct > 100) leftPct = 100;
          var dur = defaultDurationForType(type);
          var open = isOpenDuration(dur);
          var meta = COMPONENT_TYPES.find(function (x) { return x.type === type; }) || {};
                    var label = componentLabel(meta) || type;

          var head = lanes.querySelector(':scope > .timeline-drop-playhead');
          if (!head) {
            head = el('div', 'timeline-drop-playhead');
            lanes.appendChild(head);
          }
          head.style.left = leftPct + '%';

          var chip = lanes.querySelector(':scope > .timeline-drop-time');
          if (!chip) {
            chip = el('div', 'timeline-drop-time');
            lanes.appendChild(chip);
          }
          chip.textContent = formatTime(t) + 's';
          chip.style.left = leftPct + '%';

          var lane = lanes.querySelector(':scope > .builder-lane.is-drop-preview');
          var bar;
          if (!lane) {
            lane = el('div', 'builder-lane is-drop-preview');
            bar = el('div', 'builder-bar is-drop-ghost');
            lane.appendChild(bar);
            lanes.appendChild(lane);
          } else {
            bar = lane.querySelector('.builder-bar');
            if (!bar) {
              bar = el('div', 'builder-bar is-drop-ghost');
              lane.appendChild(bar);
            }
          }
          bar.className = 'builder-bar is-drop-ghost type-' + type + (open ? ' open-ended' : '');
          applyBarPos(bar, timelineScale(t, dur));
          bar.innerHTML =
            '<div class="builder-bar-body">' +
              '<div class="bar-row">' +
                componentIconHtml(type, 'bar-ico') +
                '<span class="bar-name">' + escapeHtml(label) + '</span>' +
              '</div>' +
              '<div class="bar-sub">' +
                '<span class="bar-range">' +
                  escapeHtml(formatTime(t) + (open ? '–∞s' : ('–' + formatTime(t + (Number(dur) || 0)) + 's'))) +
                '</span>' +
                '<span class="bar-meta-sep" aria-hidden="true">·</span>' +
                '<span class="bar-meta"><span class="bar-meta-text">drop here</span></span>' +
              '</div>' +
            '</div>';
          return t;
        }

        function formatTime(t) {
      if (t == null || t === '') return '∞';
      var n = Number(t);
      if (isNaN(n)) return '—';
      if (Math.abs(n - Math.round(n * 1000) / 1000) < 1e-9) {
        // trim trailing zeros
        return (Math.round(n * 1000) / 1000).toString();
      }
      return n.toFixed(3);
    }

    function barLabel(c) {
          var s = formatTime(c.start);
          var e = isOpenDuration(c.duration)
            ? '∞'
            : formatTime((Number(c.start) || 0) + Number(c.duration));
          return s + '–' + e + 's';
        }

        /** Type-specific cue for bar second line (after range). Long text scrolls, no hard truncate. */
                function barMeta(c) {
                  var p = c.params || {};
                  var raw = '';
                  if (c.type === 'text' || c.type === 'fixation') {
                    raw = String(p.text == null ? '' : p.text);
                  } else if (c.type === 'keyboard') {
                    raw = p.keys ? String(p.keys) : '';
                  } else if (c.type === 'image' || c.type === 'video') {
                                      raw = String(p.path == null ? '' : p.path);
                                      // basename only
                                      var parts = raw.split(/[/\\]/);
                                      raw = parts[parts.length - 1] || raw;
                                    } else if (c.type === 'code') {
                                      raw = p.phase ? String(p.phase) : '';
                                    }
                  raw = raw.replace(/\s+/g, ' ').trim();
                  return raw;
                }

                function barTitle(c) {
                  var bits = [c.name || c.type, barLabel(c)];
                  var m = barMeta(c);
                  if (m) bits.push(m);
                  return bits.join(' · ');
                }

                /** Enable marquee on .bar-meta when cue overflows track. */
                function syncBarMetaScroll(bar) {
                  if (!bar) return;
                  var meta = bar.querySelector('.bar-meta');
                  if (!meta || meta.hidden) {
                    if (meta) {
                      meta.classList.remove('is-scroll');
                      meta.style.removeProperty('--scroll-dx');
                    }
                    return;
                  }
                  var text = meta.querySelector('.bar-meta-text') || meta;
                  // measure overflow
                  meta.classList.remove('is-scroll');
                  meta.style.removeProperty('--scroll-dx');
                  var track = meta.clientWidth;
                  var need = text.scrollWidth;
                  var dx = need - track;
                  if (dx > 4) {
                    meta.classList.add('is-scroll');
                    meta.style.setProperty('--scroll-dx', (-dx) + 'px');
                    // slower for longer strings (~40px/s, clamp 4–14s)
                    var dur = Math.max(4, Math.min(14, dx / 40));
                    meta.style.setProperty('--marquee-dur', dur.toFixed(1) + 's');
                  }
                }

    function bindBarPointer(bar, c, lane) {
              var body = bar.querySelector('.builder-bar-body') || bar;
              var handleR = bar.querySelector('.builder-bar-handle.is-right')
                || bar.querySelector('.builder-bar-handle:not(.is-left)');
              var handleL = bar.querySelector('.builder-bar-handle.is-left');
              var handles = bar.querySelectorAll('.builder-bar-handle');

              var mode = null; // null | 'pending' | 'move' | 'resize' | 'resize-start'
              var originX = 0;
              var originStart = 0;
              var originDur = 0.4;
              var laneW = 1;
              var moved = false;
              var pointerId = null;

              function livePaint() {
                          var pos = timelineScale(c.start, c.duration);
                          applyBarPos(bar, pos);
                          var range = bar.querySelector('.bar-range');
                          if (range) range.textContent = barLabel(c);
                          var metaEl = bar.querySelector('.bar-meta');
                                                if (metaEl) {
                                                  var m = barMeta(c);
                                                  var textEl = metaEl.querySelector('.bar-meta-text');
                                                  if (!textEl) {
                                                    textEl = document.createElement('span');
                                                    textEl.className = 'bar-meta-text';
                                                    metaEl.textContent = '';
                                                    metaEl.appendChild(textEl);
                                                  }
                                                  textEl.textContent = m;
                                                  metaEl.hidden = !m;
                                                  // remeasure after layout
                                                  requestAnimationFrame(function () { syncBarMetaScroll(bar); });
                                                }
                                                bar.title = barTitle(c);
                          // open-ended: hide right handle only (∞ has no end); left always trims start
                                                    for (var hi = 0; hi < handles.length; hi++) {
                                                      var hh = handles[hi];
                                                      if (hh.classList && hh.classList.contains('is-left')) {
                                                        hh.hidden = false;
                                                      } else {
                                                        hh.hidden = !!pos.open;
                                                      }
                                                    }
                        }

      function markSelectedOnly() {
                          // select without full render() — full rebuild was expanding timeline layout
                          selectedComponentId = c.id;
                          document.querySelectorAll('.builder-bar.selected').forEach(function (b) {
                            if (b !== bar) b.classList.remove('selected');
                          });
                          bar.classList.add('selected');
                        }

                        function clearBarSelectionUi() {
                          selectedComponentId = null;
                          document.querySelectorAll('.builder-bar.selected').forEach(function (b) {
                            b.classList.remove('selected');
                          });
                        }

                        var wasAlreadySelected = false;

                  function freezeLaneWidth() {
                    // measure BEFORE body class changes — never capture post-scrollbar-hide width
                    laneW = lane.getBoundingClientRect().width || 1;
                  }

                  function blockPageScroll(ev) {
                    // keep page from scrolling while dragging bars (replaces overflow:hidden)
                    if (ev.cancelable) ev.preventDefault();
                  }

                  function armDragChrome() {
                    freezeLaneWidth();
                    document.body.classList.add('is-bar-dragging');
                    document.addEventListener('wheel', blockPageScroll, { passive: false, capture: true });
                    document.addEventListener('touchmove', blockPageScroll, { passive: false, capture: true });
                  }

                  function disarmDragChrome() {
                    document.body.classList.remove('is-bar-dragging');
                    document.removeEventListener('wheel', blockPageScroll, { capture: true });
                    document.removeEventListener('touchmove', blockPageScroll, { capture: true });
                  }

                  function onMove(e) {
                    if (e.cancelable) e.preventDefault();
                    if (!mode || mode === 'pending') {
                      if (mode === 'pending' && Math.abs(e.clientX - originX) > 4) {
                        mode = 'move';
                        bar.classList.add('dragging');
                        armDragChrome();
                      } else if (mode === 'pending') {
                        return;
                      }
                    }
                    if (!mode || mode === 'pending') return;
                    moved = true;
                    var dx = e.clientX - originX;
                    var dt = pxToTime(dx, laneW);
                    if (mode === 'move') {
                                                  var maxT = getTimelineMax();
                                                  var maxStart = Math.max(0, maxT - 0.05);
                                                  c.start = quantize(Math.max(0, Math.min(maxStart, originStart + dt)));
                                                } else if (mode === 'resize') {
                                                  // right edge: keep start, change duration
                                                  var d = originDur + dt;
                                                  if (d < 0.05) d = 0.05;
                                                  // hard clamp so bar never exceeds track (prevents layout thrash / jump)
                                                  var maxD = Math.max(0.05, getTimelineMax() - (Number(c.start) || 0));
                                                  // if user drags past current scale, allow growing scale (re-render expands)
                                                  if (d > maxD && maxD < 300) {
                                                    // allow duration past old max; getTimelineMax will grow on next paint
                                                    maxD = Math.min(300 - (Number(c.start) || 0), Math.max(maxD, d));
                                                  }
                                                  if (d > maxD) d = maxD;
                                                  c.duration = quantize(d);
                                                } else if (mode === 'resize-start') {
                                                                                                  // left edge: change start
                                                                                                  if (isOpenDuration(c.duration)) {
                                                                                                    // ∞: start moves; duration stays open; bar still fills to scale end
                                                                                                    var maxTOpen = getTimelineMax();
                                                                                                    var maxStartOpen = Math.max(0, maxTOpen - 0.05);
                                                                                                    c.start = quantize(Math.max(0, Math.min(maxStartOpen, originStart + dt)));
                                                                                                  } else {
                                                                                                    // finite: keep end fixed, change start + duration
                                                                                                    var endT = originStart + originDur;
                                                                                                    var ns = originStart + dt;
                                                                                                    if (ns < 0) ns = 0;
                                                                                                    if (ns > endT - 0.05) ns = endT - 0.05;
                                                                                                    ns = quantize(ns);
                                                                                                    c.start = ns;
                                                                                                    c.duration = quantize(Math.max(0.05, endT - ns));
                                                                                                  }
                                                                                                }
                                        livePaint();
                                      }

                                      function onUp(e) {
                                                          if (pointerId != null && bar.releasePointerCapture) {
                                                            try { bar.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
                                                          }
                                                          document.removeEventListener('pointermove', onMove);
                                                          document.removeEventListener('pointerup', onUp);
                                                          document.removeEventListener('pointercancel', onUp);
                                                          var wasDrag = mode === 'move' || mode === 'resize' || mode === 'resize-start';
                                                          mode = null;
                                      pointerId = null;
                                      bar.classList.remove('dragging');
                                      disarmDragChrome();
                                      if (wasDrag && moved) {
                                        // after drag: keep selected, refresh inspector/json; re-render timeline for scale/labels
                                        selectedComponentId = c.id;
                                        bar.classList.add('selected');
                                        renderTimeline();
                                        renderInspector();
                                        renderJsonPreview();
                                        emitChange();
                                      } else {
                                        // plain click: toggle select / deselect (allow blur)
                                        if (wasAlreadySelected) {
                                          clearBarSelectionUi();
                                        } else {
                                          markSelectedOnly();
                                        }
                                        renderInspector();
                                        renderJsonPreview();
                                      }
                                    }

                                    function begin(e, startMode) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      wasAlreadySelected = selectedComponentId === c.id;
                                      // provisional select for drag feedback (toggle resolved on pointerup if no drag)
                                      if (!wasAlreadySelected) markSelectedOnly();
                                      mode = startMode;
                                      moved = false;
                                      originX = e.clientX;
                                                                            originStart = Number(c.start) || 0;
                                                                            originDur = isOpenDuration(c.duration)
                                                                              ? 0.5
                                                                              : (Number(c.duration) || 0.5);
                                                                            // right-edge resize never applies to ∞ (no right handle)
                                                                            // left-edge (resize-start) on ∞ only moves start — do NOT convert duration
                                                                            if (startMode === 'resize' && isOpenDuration(c.duration)) {
                                                                              mode = null;
                                                                              return;
                                                                            }
                                                                            freezeLaneWidth();
                                                                            pointerId = e.pointerId;
                                                                            if (startMode === 'resize' || startMode === 'resize-start') {
                                                                              bar.classList.add('dragging');
                                                                              armDragChrome();
                                                                            }
                                                                            try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                                                                            document.addEventListener('pointermove', onMove, { passive: false });
                                                                            document.addEventListener('pointerup', onUp);
                                                                            document.addEventListener('pointercancel', onUp);
                                                                          }

                                            function isHandleTarget(t) {
                                                    for (var i = 0; i < handles.length; i++) {
                                                      if (t === handles[i] || (handles[i].contains && handles[i].contains(t))) return true;
                                                    }
                                                    return false;
                                                  }

                                            body.addEventListener('pointerdown', function (e) {
                                                    if (e.button != null && e.button !== 0) return;
                                                    if (isHandleTarget(e.target)) return;
                                                    begin(e, 'pending');
                                                  });

                                                  function bindEdgeHandle(h, edgeMode) {
                                                                                                      if (!h) return;
                                                                                                      h.addEventListener('pointerdown', function (e) {
                                                                                                        if (e.button != null && e.button !== 0) return;
                                                                                                        // ∞ has no right end — only left start handle works
                                                                                                        if (edgeMode === 'resize' && isOpenDuration(c.duration)) return;
                                                                                                        begin(e, edgeMode);
                                                                                                        bar.classList.add('dragging');
                                                                                                      });
                                                                                                    }
                                                                                                    bindEdgeHandle(handleR, 'resize');
                                                                                                    bindEdgeHandle(handleL, 'resize-start');
                                                                                                  }

    function renderTimeline() {
      var box = document.getElementById('builder-timeline');
      if (!box) return;
      box.innerHTML = '';
      var r = findRoutine(selectedRoutine);
      if (!r) {
        box.appendChild(el('p', 'muted', 'Select or add a routine.'));
        return;
      }

      // Timeline scale (no inline snap toolbar — Settings tab owns snap)
                  var tmax = getTimelineMax();
                  var step = getTimelineStep(tmax);

                  // Shared track: plot inset so centered 0s / Ns labels are not clipped
                              var track = el('div', 'timeline-track');
                              track.style.setProperty('--tmax', String(tmax));
                              var plot = el('div', 'timeline-plot');

                              // Ruler: major ticks labeled; minor marks when step is fractional
                                                            // NOTE: loop var must NOT be `t` — shadows outer i18n helper t() (hoisted var in this fn).
                                                            // Bug: selected bar × / empty dropHint called t('…') after loop → TypeError → timeline wiped black.
                                                            var ruler = el('div', 'builder-ruler');
                                                            var majorEvery = step < 1 ? 1 : step;
                                                            for (var tickT = 0; tickT <= tmax + 1e-9; tickT = Math.round((tickT + step) * 1000) / 1000) {
                                                              if (tickT > tmax) break;
                                                              var isMajor = Math.abs(tickT / majorEvery - Math.round(tickT / majorEvery)) < 1e-9;
                                                              var tick = el('span', 'ruler-tick' + (isMajor ? ' is-major' : ' is-minor'));
                                                              tick.style.left = ((tickT / tmax) * 100) + '%';
                                                              if (tickT === 0) tick.classList.add('tick-start');
                                                              if (Math.abs(tickT - tmax) < 1e-9) tick.classList.add('tick-end');
                                                        if (isMajor) {
                                                          var lab = (Math.abs(tickT - Math.round(tickT)) < 1e-9) ? String(Math.round(tickT)) : tickT.toFixed(1);
                                                          tick.innerHTML =
                                                            '<span class="ruler-label">' + lab + 's</span>' +
                                                            '<i class="ruler-mark"></i>';
                                                        } else {
                                                          tick.innerHTML = '<i class="ruler-mark"></i>';
                                                          tick.title = tickT.toFixed(1) + 's';
                                                        }
                                                        ruler.appendChild(tick);
                                                      }
                        plot.appendChild(ruler);

                        var lanes = el('div', 'builder-lanes');
                        lanes.dataset.routine = r.name;

                        // vertical grid aligned to ruler
                        var grid = el('div', 'timeline-grid');
                        for (var g = 0; g <= tmax + 1e-9; g = Math.round((g + step) * 1000) / 1000) {
                          if (g > tmax) break;
                          var isMaj = Math.abs(g / majorEvery - Math.round(g / majorEvery)) < 1e-9;
                          var line = el('div', 'timeline-grid-line' + (isMaj ? ' major' : ' minor'));
                          line.style.left = ((g / tmax) * 100) + '%';
                          grid.appendChild(line);
                        }
                        lanes.appendChild(grid);

      r.components.forEach(function (c, idx) {
                    var lane = el('div', 'builder-lane');
                    var open = isOpenDuration(c.duration);
                    var bar = el('div', 'builder-bar type-' + (c.type || 'unknown')
                      + (c.id === selectedComponentId ? ' selected' : '')
                      + (open ? ' open-ended' : ''));
                    bar.dataset.componentId = c.id;
                    bar.dataset.index = String(idx);
                    bar.title = barTitle(c);
                    var pos = timelineScale(c.start, c.duration);
                                  applyBarPos(bar, pos);

                                  var meta = COMPONENT_TYPES.find(function (t) { return t.type === c.type; }) || {};
                                                                    var body = el('div', 'builder-bar-body');
                                                                    var cue = barMeta(c);
                                                                    // Two lines: icon well + name / range + cue
                                                                                                      body.innerHTML =
                                                                                                        '<div class="bar-row">' +
                                                                                                          componentIconHtml(c.type, 'bar-ico') +
                                                                                                          '<span class="bar-name">' + escapeHtml(c.name || c.type) + '</span>' +
                                                                                                        '</div>' +
                                                                                                        '<div class="bar-sub">' +
                                                                                                          '<span class="bar-range">' + escapeHtml(barLabel(c)) + '</span>' +
                                                                                                          (cue
                                                                                                            ? '<span class="bar-meta-sep" aria-hidden="true">·</span>' +
                                                                                                              '<span class="bar-meta"><span class="bar-meta-text">' + escapeHtml(cue) + '</span></span>'
                                                                                                            : '<span class="bar-meta" hidden><span class="bar-meta-text"></span></span>') +
                                                                                                        '</div>';
                                                                    bar.appendChild(body);
                                                              // Selected: visible delete affordance on the bar
                                                              if (c.id === selectedComponentId) {
                                                                var xBtn = el('button', 'builder-bar-del');
                                                                xBtn.type = 'button';
                                                                xBtn.title = t('flow.deleteComponent');
                                                                                                                                xBtn.setAttribute('aria-label', t('flow.deleteComponent'));
                                                                xBtn.innerHTML = '&times;';
                                                                xBtn.addEventListener('pointerdown', function (e) {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                });
                                                                xBtn.addEventListener('click', function (e) {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  deleteComponentById(c.id);
                                                                });
                                                                bar.appendChild(xBtn);
                                                              }
                                                              // Left handle always (start may be ≠ 0 even for ∞). Right only when finite.
                                                                                                                            var handleL = el('div', 'builder-bar-handle is-left');
                                                                                                                            handleL.title = open
                                                                                                                              ? 'Drag to set start (∞ fills to scale end)'
                                                                                                                              : 'Drag to set start (end fixed)';
                                                                                                                            bar.appendChild(handleL);
                                                                                                                            var handleR = null;
                                                                                                                            if (!open) {
                                                                                                                              handleR = el('div', 'builder-bar-handle is-right');
                                                                                                                              handleR.title = 'Drag to set duration';
                                                                                                                              bar.appendChild(handleR);
                                                                                                                            }
                                                                                                                            bindBarPointer(bar, c, lane);

                                                                                  lane.appendChild(bar);
                                                                                  lanes.appendChild(lane);
                                                                                  // defer marquee measure until in layout
                                                                                  (function (b) {
                                                                                    requestAnimationFrame(function () { syncBarMetaScroll(b); });
                                                                                  })(bar);
            });

      lanes.addEventListener('dragover', function (e) {
                          e.preventDefault();
                          e.stopPropagation();
                          try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* */ }
                          lanes.classList.add('drag-over');
                          if (track) track.classList.add('drag-over');
                          if (paletteDragType) {
                            paletteDropStart = showPaletteDropPreview(
                              paletteDragType,
                              clientXToStart(e.clientX, lanes),
                              lanes
                            );
                          }
                        });
                        lanes.addEventListener('dragleave', function (e) {
                          // ignore leave into children
                          var rel = e.relatedTarget;
                          if (rel && lanes.contains(rel)) return;
                          lanes.classList.remove('drag-over');
                          // keep ghost if still over track
                          if (track && rel && track.contains(rel)) return;
                          clearPaletteDropPreview();
                          paletteDropStart = null;
                        });
                        function onPaletteDrop(e) {
                          e.preventDefault();
                          e.stopPropagation();
                          lanes.classList.remove('drag-over');
                          if (track) track.classList.remove('drag-over');
                          var type = paletteDragType || '';
                          try {
                            type = e.dataTransfer.getData('application/x-psyclaw-type')
                              || e.dataTransfer.getData('text/plain')
                              || e.dataTransfer.getData('text')
                              || type
                              || '';
                          } catch (err) { /* keep paletteDragType */ }
                          type = String(type || '').trim().split(/\s/)[0];
                          var startAt = paletteDropStart;
                          if (startAt == null && type) {
                            startAt = clientXToStart(e.clientX, lanes);
                          }
                          clearPaletteDropPreview();
                          paletteDragType = null;
                          paletteDropStart = null;
                          if (type && COMPONENT_TYPES.some(function (t) { return t.type === type; })) {
                            addComponent(r.name, type, startAt);
                          }
                        }
                        lanes.addEventListener('drop', onPaletteDrop);
                        // whole track is a drop target (empty gaps / ruler area)
                        track.addEventListener('dragover', function (e) {
                          e.preventDefault();
                          try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* */ }
                          track.classList.add('drag-over');
                          lanes.classList.add('drag-over');
                          if (paletteDragType) {
                            paletteDropStart = showPaletteDropPreview(
                              paletteDragType,
                              clientXToStart(e.clientX, lanes),
                              lanes
                            );
                          }
                        });
                        track.addEventListener('dragleave', function (e) {
                          var rel = e.relatedTarget;
                          if (rel && track.contains(rel)) return;
                          track.classList.remove('drag-over');
                          lanes.classList.remove('drag-over');
                          clearPaletteDropPreview();
                          paletteDropStart = null;
                        });
                        track.addEventListener('drop', onPaletteDrop);
                  // click empty lane / grid → deselect component
                  lanes.addEventListener('pointerdown', function (e) {
                                      if (e.button != null && e.button !== 0) return;
                                      var tgt = e.target;
                                      if (tgt.closest && tgt.closest('.builder-bar')) return;
                    if (selectedComponentId == null) return;
                    selectedComponentId = null;
                    document.querySelectorAll('.builder-bar.selected').forEach(function (b) {
                      b.classList.remove('selected');
                    });
                    renderInspector();
                    renderJsonPreview();
                  });

            plot.appendChild(lanes);
                        track.appendChild(plot);
                        box.appendChild(track);
            if (!r.components.length) {
                          var dropHint = el('div', 'builder-drop-zone');
                          dropHint.innerHTML = '<p class="muted builder-drop-hint">' + t('flow.dropHint') + '<br><span class="builder-drop-sub">' + t('flow.dropSub') + '</span></p>';
                          dropHint.addEventListener('dragover', function (e) {
                            e.preventDefault();
                            try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* */ }
                            dropHint.classList.add('drag-over');
                            if (paletteDragType && lanes) {
                              paletteDropStart = showPaletteDropPreview(
                                paletteDragType,
                                clientXToStart(e.clientX, lanes),
                                lanes
                              );
                            }
                          });
                          dropHint.addEventListener('dragleave', function (e) {
                            var rel = e.relatedTarget;
                            if (rel && dropHint.contains(rel)) return;
                            dropHint.classList.remove('drag-over');
                            if (!(track && rel && track.contains(rel))) {
                              clearPaletteDropPreview();
                              paletteDropStart = null;
                            }
                          });
                          dropHint.addEventListener('drop', function (e) {
                            e.preventDefault();
                            dropHint.classList.remove('drag-over');
                            var type = paletteDragType || '';
                            try {
                              type = e.dataTransfer.getData('application/x-psyclaw-type')
                                || e.dataTransfer.getData('text/plain')
                                || e.dataTransfer.getData('text')
                                || type
                                || '';
                            } catch (err) { /* keep */ }
                            type = String(type || '').trim().split(/\s/)[0];
                            var startAt = paletteDropStart;
                            if (startAt == null && type) {
                              startAt = clientXToStart(e.clientX, lanes);
                            }
                            clearPaletteDropPreview();
                            paletteDragType = null;
                            paletteDropStart = null;
                            if (type && COMPONENT_TYPES.some(function (t) { return t.type === type; })) {
                              addComponent(r.name, type, startAt);
                            }
                          });
                          box.appendChild(dropHint);
                        }
                      }
                    function addComponent(routineName, type, startOpt) {
                      var r = findRoutine(routineName);
                      if (!r) return;
                      var meta = COMPONENT_TYPES.find(function (t) { return t.type === type; });
                      if (!meta) return;
                      var start;
                      if (startOpt != null && !isNaN(Number(startOpt))) {
                        start = roundT(Number(startOpt));
                        if (start < 0) start = 0;
                      } else {
                        var lastEnd = 0;
                        r.components.forEach(function (c) {
                          var s = Number(c.start) || 0;
                          var open = isOpenDuration(c.duration);
                          var d = open ? OPEN_DISPLAY : (Number(c.duration) || 0);
                          lastEnd = Math.max(lastEnd, s + d);
                        });
                        start = Math.round(lastEnd * 1000) / 1000;
                      }
                      var comp = {
                        id: nextId('c'),
                        type: type,
                        name: type + '_' + (r.components.length + 1),
                        start: start,
                        duration: defaultDurationForType(type),
                        params: Object.assign({}, meta.defaults),
                      };
                      r.components.push(comp);
                      selectedComponentId = comp.id;
                      // ensure routine is selected for inspector/timeline
                      selectedRoutine = r.name;
                      render();
                      emitChange();
                    }

  function renderFlowList() {
    var box = document.getElementById('builder-flow-list');
    if (!box) return;
    box.innerHTML = '';

    // ---- flatten design.flow → leaves + bracket ranges (single visual layer) ----
    var leaves = [];   // { routine, path:[top,...], topIndex }
    var brackets = []; // { name, nReps, leafStart, leafEnd, depth, path, topIndex }

    function walk(nodes, path, depth) {
      if (!nodes) return;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var p = path.concat([i]);
        if (n && n.kind === 'loop') {
          var start = leaves.length;
          walk(n.children || [], p, depth + 1);
          var end = leaves.length - 1;
          if (end >= start) {
            brackets.push({
              name: n.name || 'loop',
              nReps: (function () { var v = Number(n.nReps); return isFinite(v) && v >= 1 ? Math.floor(v) : 1; })(),
              nCond: Array.isArray(n.conditions) ? n.conditions.length : 0,
              leafStart: start,
              leafEnd: end,
              depth: depth,
              path: p,
              topIndex: p[0],
              node: n,
            });
          }
        } else if (n && n.routine) {
          leaves.push({ routine: n.routine, path: p, topIndex: p[0], node: n });
        }
      }
    }
    walk(design.flow, [], 0);

    var maxDepth = 0;
    brackets.forEach(function (b) { if (b.depth > maxDepth) maxDepth = b.depth; });

    // ---- shell: side tools + flat canvas ----
    var shell = el('div', 'flow-shell' + (loopDrawArmed ? ' is-loop-draw-armed' : ''));

    var side = el('div', 'flow-side');
        var sideGroup = el('div', 'flow-side-group');
        sideGroup.appendChild(el('div', 'flow-side-label', t('flow.insertRoutine')));
            var insSel = document.createElement('select');
            insSel.className = 'flow-side-select';
            insSel.setAttribute('aria-label', t('flow.insertRoutine') || 'Insert Routine');
            insSel.innerHTML = '<option value="">' + escapeHtml(t('flow.pickRoutine') || 'Choose…') + '</option>';
            design.routines.forEach(function (r) {
              var opt = document.createElement('option');
              opt.value = r.name;
              opt.textContent = r.name;
              insSel.appendChild(opt);
            });
        insSel.addEventListener('change', function () {
          if (!insSel.value) return;
          var at = selectedFlowIndex != null ? selectedFlowIndex + 1 : design.flow.length;
          design.flow.splice(at, 0, { kind: 'routine', routine: insSel.value });
          setFlowSelection(at, false);
          selectedRoutine = insSel.value;
          selectedComponentId = null;
          insSel.value = '';
          loopDrawArmed = false;
          render();
          emitChange();
        });
        sideGroup.appendChild(insSel);
        side.appendChild(sideGroup);

        var loopBtn = el('button', 'flow-side-loop' + (loopDrawArmed ? ' is-armed' : ''));
        loopBtn.type = 'button';
        loopBtn.textContent = loopDrawArmed ? t('flow.cancel') : t('flow.insertLoop');
        loopBtn.title = t('flow.loopHint') || 'Then drag from one routine to another';
        loopBtn.addEventListener('click', function () {
          loopDrawArmed = !loopDrawArmed;
          render();
        });
        side.appendChild(loopBtn);
        if (loopDrawArmed) side.appendChild(el('p', 'flow-side-hint', t('flow.dragAB') || 'Drag A → B'));
        shell.appendChild(side);

    var canvas = el('div', 'flow-canvas');
    // single layer: baseline + pills row + brackets layer under
    var track = el('div', 'flow-flat-track');
    track.style.setProperty('--bracket-levels', String(maxDepth + 1));

    var baseline = el('div', 'flow-baseline');
    track.appendChild(baseline);

    var pillsRow = el('div', 'flow-pills-row');
        var bracketsLayer = el('div', 'flow-brackets-layer');
        var previewLayer = el('div', 'flow-brackets-preview');
        previewLayer.hidden = true;
        var rubber = el('div', 'flow-draw-rubber');
        rubber.hidden = true;
        track.appendChild(rubber);
        track.appendChild(previewLayer);

        // leaf index helpers
        function pillEls() {
          return Array.prototype.slice.call(pillsRow.querySelectorAll('.flow-pill[data-leaf]'));
        }
        function pillByLeaf(ix) {
          return pillsRow.querySelector('.flow-pill[data-leaf="' + ix + '"]');
        }
        function leafFromClientX(clientX) {
          var nodes = pillEls();
          if (!nodes.length) return null;
          var best = null, bestDist = Infinity;
          for (var i = 0; i < nodes.length; i++) {
            var r = nodes[i].getBoundingClientRect();
            var ix = Number(nodes[i].dataset.leaf);
            if (clientX >= r.left - 8 && clientX <= r.right + 8) return ix;
            var d = Math.abs(clientX - (r.left + r.width / 2));
            if (d < bestDist) { bestDist = d; best = ix; }
          }
          return best;
        }

        /** Shared: where a leaf range would nest (parent path + depth).
                 *
                 *  SPECIAL RULE: if the selected leaves exactly fill all children
                 *  of the parent loop AND that parent is non-empty, bubble up one
                 *  level so the new loop wraps the OLD loop (new layer → outermost).
                 *  Repeat until top-level or until range no longer fills parent.
                 */
                function leafRangeMeta(i0, i1, leafList) {
                  leafList = leafList || leaves;
                  if (!leafList.length) return { valid: false, depth: 0, parentPath: [] };
                  var a = Math.min(i0, i1), b = Math.max(i0, i1);
                  a = Math.max(0, Math.min(a, leafList.length - 1));
                  b = Math.max(0, Math.min(b, leafList.length - 1));
                  var paths = [];
                  for (var i = a; i <= b; i++) paths.push(leafList[i].path.slice());
                  var parentPath = paths[0].slice(0, -1);
                  for (var i = 1; i < paths.length; i++) {
                    var pp = paths[i].slice(0, -1);
                    var k = 0;
                    while (k < parentPath.length && k < pp.length && parentPath[k] === pp[k]) k++;
                    parentPath = parentPath.slice(0, k);
                  }
                  var childSet = {};
                  for (var i = a; i <= b; i++) {
                    var p = leafList[i].path;
                    if (p.length <= parentPath.length) return { valid: false, depth: parentPath.length, parentPath: parentPath };
                    for (var j = 0; j < parentPath.length; j++) {
                      if (p[j] !== parentPath[j]) return { valid: false, depth: parentPath.length, parentPath: parentPath };
                    }
                    childSet[p[parentPath.length]] = true;
                  }
                  var idxs = Object.keys(childSet).map(Number).sort(function (x, y) { return x - y; });
                  if (!idxs.length) return { valid: false, depth: parentPath.length, parentPath: parentPath };
                  for (var i = 1; i < idxs.length; i++) {
                    if (idxs[i] !== idxs[i - 1] + 1) return { valid: false, depth: parentPath.length, parentPath: parentPath };
                  }
                  var lo = idxs[0], hi = idxs[idxs.length - 1];

                                    // Bubble up: if the selected range EXACTLY fills all children
                                    // of the parent loop, step outward one level so the new loop
                                    // becomes the OUTERMOST layer (new layer on top).
                                    var parentPathOrig = parentPath.slice(); // snapshot for bubbleOuter flag
                                    while (parentPath.length > 0) {
                    var nav = navigatePath(parentPath);
                    if (!nav || !nav.node || nav.node.kind !== 'loop') break;
                    var totalKids = (nav.node.children || []).length;
                    if (lo === 0 && hi === totalKids - 1) {
                      // all children covered — move up
                      var oldPath = parentPath.slice();
                      parentPath = parentPath.slice(0, -1);
                      // rebuild lo/hi for this new parent level
                      if (parentPath.length === 0) {
                        // top level: the oldPath[0] node itself is the child
                        idxs = [oldPath[0]];
                      } else {
                        idxs = [oldPath[oldPath.length - 1]];
                      }
                      lo = idxs[0];
                      hi = idxs[idxs.length - 1];
                    } else {
                      break;
                    }
                  }

                  return {
                                                valid: true,
                                                bubbleOuter: (parentPathOrig && parentPathOrig.length > parentPath.length),
                                                depth: parentPath.length,
                    parentPath: parentPath,
                    lo: lo,
                    hi: hi,
                    leafA: a,
                    leafB: b,
                  };
                }

        /** Walk a flow tree → leaves + brackets (same as main walk). */
        function walkFlowTree(flowNodes) {
          var L = [], B = [];
          function walk(nodes, path, depth) {
            if (!nodes) return;
            for (var i = 0; i < nodes.length; i++) {
              var n = nodes[i];
              var p = path.concat([i]);
              if (n && n.kind === 'loop') {
                var start = L.length;
                walk(n.children || [], p, depth + 1);
                var end = L.length - 1;
                if (end >= start) {
                  B.push({
                    name: n.name || 'loop',
                    nReps: (function () { var v = Number(n.nReps); return isFinite(v) && v >= 1 ? Math.floor(v) : 1; })(),
              nCond: Array.isArray(n.conditions) ? n.conditions.length : 0,
                    leafStart: start,
                    leafEnd: end,
                    depth: depth,
                    path: p,
                    topIndex: p[0],
                    isNew: !!n.__previewNew,
                  });
                }
              } else if (n && n.routine) {
                L.push({ routine: n.routine, path: p, topIndex: p[0] });
              }
            }
          }
          walk(flowNodes || [], [], 0);
          var md = 0;
          B.forEach(function (b) { if (b.depth > md) md = b.depth; });
          return { leaves: L, brackets: B, maxDepth: md };
        }

        /**
         * Simulate wrap on a deep clone of design.flow → final bracket layout.
         * Does NOT mutate live design.
         */
        function previewAfterWrap(i0, i1) {
          var meta = leafRangeMeta(i0, i1, leaves);
          if (!meta.valid) return { ok: false, meta: meta };
          var flowCopy = JSON.parse(JSON.stringify(design.flow));
          // navigate children array on copy
          var arr = flowCopy;
          var parentPath = meta.parentPath;
          for (var d = 0; d < parentPath.length; d++) {
            var node = arr[parentPath[d]];
            if (!node || node.kind !== 'loop') return { ok: false, meta: meta };
            if (!node.children) node.children = [];
            arr = node.children;
          }
          var lo = meta.lo, hi = meta.hi;
                    if (lo < 0 || hi >= arr.length || lo > hi) return { ok: false, meta: meta };
                    if (lo === hi && arr[lo] && arr[lo].kind === 'loop' && !meta.bubbleOuter) return { ok: false, meta: meta };
                    var slice = arr.slice(lo, hi + 1);
          var kids = slice.map(function (n) { return JSON.parse(JSON.stringify(n)); });
          var nameHint = 'trials';
          var firstR = kids[0] && (kids[0].routine || (kids[0].children && kids[0].children[0] && kids[0].children[0].routine));
          if (kids.length === 1 && firstR) nameHint = firstR + '_loop';
          else if (parentPath.length) nameHint = 'inner';
          var newLoop = {
            kind: 'loop',
            name: nameHint,
            nReps: 10,
            loopType: 'sequential',
            children: kids,
            __previewNew: true,
          };
          arr.splice(lo, hi - lo + 1, newLoop);
          var walked = walkFlowTree(flowCopy);
          return { ok: true, meta: meta, flow: flowCopy, walked: walked, newName: nameHint };
        }

        /** Paint FINAL loop style preview while dragging (before mouseup). */
        function paintRubber(i0, i1) {
          var a = Math.min(i0, i1), b = Math.max(i0, i1);
          var n0 = pillByLeaf(a), n1 = pillByLeaf(b);
          if (!n0 || !n1) {
            hidePreview();
            return;
          }

          pillEls().forEach(function (p) {
            var ix = Number(p.dataset.leaf);
            p.classList.toggle('loop-draw-hit', ix >= a && ix <= b);
          });

          var preview = previewAfterWrap(a, b);
          var levelH = 26; // slight room under arc for name + ×N

          if (!preview.ok) {
            // invalid: faint rubber only
            var tr0 = track.getBoundingClientRect();
            var r0b = n0.getBoundingClientRect();
            var r1b = n1.getBoundingClientRect();
            rubber.hidden = false;
            previewLayer.hidden = true;
            bracketsLayer.classList.remove('is-previewing');
            rubber.className = 'flow-draw-rubber is-invalid';
            rubber.style.left = (Math.min(r0b.left, r1b.left) - tr0.left + track.scrollLeft) + 'px';
            rubber.style.width = Math.max(36, Math.max(r0b.right, r1b.right) - Math.min(r0b.left, r1b.left)) + 'px';
            rubber.style.top = '44px';
            rubber.title = 'Invalid range';
            return;
          }

          // Hide live brackets; show full final-structure ghost
                    bracketsLayer.classList.add('is-previewing');
                    rubber.hidden = true;
                    rubber.style.cssText = ''; // clear stale left/top/width from invalid path
                    previewLayer.hidden = false;
                    previewLayer.innerHTML = '';

                    var walked = preview.walked;
                    var md = walked.maxDepth;
                    var tr = track.getBoundingClientRect();
                    var rowR = pillsRow.getBoundingClientRect();
                    var baseTop = Math.max(36, Math.round(rowR.bottom - tr.top + 6));
                    var levelH = 26; // slight room under arc for name + ×N

                    walked.brackets.forEach(function (brInfo) {
                      // map preview leaf indices → live pill positions (leaf order unchanged by wrap)
                      var p0 = pillByLeaf(brInfo.leafStart);
                      var p1 = pillByLeaf(brInfo.leafEnd);
                      if (!p0 || !p1) return;
                      var pr0 = p0.getBoundingClientRect();
                      var pr1 = p1.getBoundingClientRect();
                      var left = Math.min(pr0.left, pr1.left) - tr.left;
                      var right = Math.max(pr0.right, pr1.right) - tr.left;
                      var nestOffset = (md - brInfo.depth) * levelH;
                      var g = el('div', 'flow-bracket flow-bracket-ghost'
                                              + (brInfo.depth > 0 ? ' is-nested' : '')
                                              + ' depth-' + brInfo.depth
                                              + (brInfo.isNew ? ' is-new' : ' is-existing'));
                                            var spanG = Math.max(40, Math.round(right - left));
                                            var wG = Math.max(spanG, 148);
                                            var midG = (left + right) / 2;
                                            g.style.left = Math.round(midG - wG / 2) + 'px';
                                            g.style.width = wG + 'px';
                                            g.style.top = (baseTop + nestOffset) + 'px';
                                            var lab = el('span', 'flow-bracket-label', escapeHtml(brInfo.name));
                                            var gR = (isFinite(brInfo.nReps) && brInfo.nReps >= 1) ? brInfo.nReps : 1;
                                            var gC = brInfo.nCond > 0 ? brInfo.nCond : 0;
                                            var gTotal = gC > 0 ? (gR * gC) : gR;
                                            var reps = el('span', 'flow-bracket-reps', '\u00d7' + gTotal);
                                            reps.title = gC > 0 ? (gR + ' reps \u00d7 ' + gC + ' rows = ' + gTotal + ' trials') : (gR + ' reps');
                                            g.appendChild(lab);
                                            g.appendChild(reps);
                                            if (brInfo.isNew) {
                                              g.appendChild(el('span', 'flow-bracket-new-tag', 'NEW'));
                                            }
                      previewLayer.appendChild(g);
                    });

                    track.style.minHeight = (baseTop + (md + 1) * levelH + 28) + 'px';
                    canvas.classList.add('is-drawing-loop');
                  }

        function hidePreview() {
          rubber.hidden = true;
          rubber.className = 'flow-draw-rubber';
          rubber.removeAttribute('data-depth');
          previewLayer.hidden = true;
          previewLayer.innerHTML = '';
          bracketsLayer.classList.remove('is-previewing');
          pillEls().forEach(function (p) { p.classList.remove('loop-draw-hit'); });
        }

        function clearDrawUi() {
          hidePreview();
          canvas.classList.remove('is-drawing-loop');
        }

        /**
         * Wrap leaf range into a loop — supports nesting.
         * Finds common parent of selected leaves, wraps sibling children under that parent.
         * Drawing inside an existing loop creates an inner loop (PsychoPy nested).
         */
        function wrapLeafRange(i0, i1, opts) {
                  opts = opts || {};
                  var meta = leafRangeMeta(i0, i1, leaves);
                  if (!meta.valid) return false;
                  // When bubbling outward, the target may be a single loop node — allow it
                  if (meta.bubbleOuter) opts.force = true;
                  return wrapChildrenRange(meta.parentPath, meta.lo, meta.hi, opts);
                }

    function beginLoopDraw(e, startLeaf) {
          if (e.button != null && e.button !== 0) return;
          if (startLeaf == null || isNaN(startLeaf) || !leaves.length) return;
          e.preventDefault();
          e.stopPropagation();
          var from = startLeaf, to = startLeaf;
          canvas.classList.add('is-drawing-loop');
          paintRubber(from, to);
          var cap = track;
          try { cap.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          function onMove(ev) {
            if (ev.cancelable) ev.preventDefault();
            var hit = leafFromClientX(ev.clientX);
            if (hit == null || isNaN(hit)) hit = from;
            to = hit;
            paintRubber(from, to);
          }
          function onUp(ev) {
            cap.removeEventListener('pointermove', onMove);
            cap.removeEventListener('pointerup', onUp);
            cap.removeEventListener('pointercancel', onUp);
            var hit = leafFromClientX(ev.clientX);
            if (hit == null || isNaN(hit)) hit = from;
            to = hit;
            clearDrawUi();
            loopDrawArmed = false;
            if (wrapLeafRange(from, to)) {
              render();
              emitChange();
            } else {
              render();
            }
          }
          cap.addEventListener('pointermove', onMove, { passive: false });
          cap.addEventListener('pointerup', onUp);
          cap.addEventListener('pointercancel', onUp);
        }

        function tryStartDrawFromEvent(e) {
          if (!loopDrawArmed || !leaves.length) return false;
          if (e.button != null && e.button !== 0) return false;
          if (e.target.closest && e.target.closest('input,select,button,.flow-pill-x,.flow-bracket-x,.flow-bracket-edge')) {
            return false;
          }
          var hit = leafFromClientX(e.clientX);
          if (hit == null) return false;
          beginLoopDraw(e, hit);
          return true;
        }

        // Capture phase so draw wins over pill drag / bracket chrome
        if (loopDrawArmed && leaves.length) {
          canvas.addEventListener('pointerdown', function (e) {
            tryStartDrawFromEvent(e);
          }, true);
        }

    // ---- pills (one row) ----
        if (!leaves.length) {
          var empty = el('div', 'flow-empty');
          empty.appendChild(el('p', 'flow-empty-title', t('flow.emptyTitle') || 'Flow is empty'));
          empty.appendChild(el('p', 'muted flow-empty-hint', t('flow.emptyHint') || 'Insert a routine on the left, then drag A→B to wrap a loop.'));
          pillsRow.appendChild(empty);
        }

        leaves.forEach(function (leaf, leafIdx) {
                  if (leafIdx > 0) {
                    var conn = el('div', 'flow-connector');
                    conn.setAttribute('aria-hidden', 'true');
                    pillsRow.appendChild(conn);
                  }
                  var top = design.flow[leaf.topIndex];
                  // Mutual exclusion: loop selection lights bracket only; routine selection lights pill only
                  var loopFocused = !!(selectedFlowPath && selectedFlowPath.length);
                  var pillFlowSel = false;
                  if (!loopFocused && top && top.kind === 'routine') {
                    pillFlowSel = !!selectedFlowIndices[leaf.topIndex];
                  }
                  var rDef = findRoutine(leaf.routine);
                  var nComp = rDef && Array.isArray(rDef.components) ? rDef.components.length : 0;
                  var openCue = false;
                  if (rDef && rDef.components) {
                    for (var ci = 0; ci < rDef.components.length; ci++) {
                      if (isOpenDuration(rDef.components[ci].duration)) { openCue = true; break; }
                    }
                  }
                  var pill = el('div', 'flow-pill'
                    + (leaf.routine === selectedRoutine && !loopFocused ? ' is-active' : '')
                    + (pillFlowSel ? ' is-flow-selected' : '')
                    + (top && top.kind === 'loop' ? ' in-loop' : '')
                    + (openCue ? ' has-open' : ''));
                  pill.dataset.leaf = String(leafIdx);
                  pill.dataset.topIndex = String(leaf.topIndex);
                  // Two-line body: name · meta (component count / ∞ cue) — readable like PsychoPy routine nodes
                  var body = el('div', 'flow-pill-body');
                            body.appendChild(el('span', 'flow-pill-name', escapeHtml(leaf.routine || '?')));
                            var metaBits = [];
                            metaBits.push(nComp === 1
                              ? (t('flow.compOne') || '1 part')
                              : (t('flow.compN', { n: nComp }) || (nComp + ' parts')));
                            if (openCue) metaBits.push('\u221e');
                            var metaEl = el('span', 'flow-pill-meta', escapeHtml(metaBits.join(' \u00b7 ')));
                            body.appendChild(metaEl);
                  pill.appendChild(body);
                  pill.title = (leaf.routine || '?')
                    + ' · ' + metaBits.join(' · ')
                    + ' · click → timeline'
                    + (loopDrawArmed ? ' · drag A→B to wrap loop' : '');

                  pill.addEventListener('click', function (e) {
                          if (loopDrawArmed) return;
                          e.stopPropagation();
                          selectedRoutine = leaf.routine;
                          selectedComponentId = null;
                          // select routine only — clear any loop highlight
                          selectedFlowPath = null;
                          if (leaf.path.length === 1 && top && top.kind === 'routine') {
                            setFlowSelection(leaf.topIndex, e.shiftKey);
                          } else {
                            clearFlowSelection();
                          }
                          render();
                        });

                    // remove leaf / top — hover-only chrome (less noise)
                    var x = el('button', 'flow-pill-x');
                    x.type = 'button';
                    x.textContent = '\u00d7';
                    x.title = 'Remove from flow';
                    x.setAttribute('aria-label', 'Remove from flow');
                    x.addEventListener('click', function (e) {
                      e.stopPropagation();
                      if (leaf.path.length === 1) {
                        design.flow.splice(leaf.topIndex, 1);
                    clearFlowSelection();
                  } else {
                    var nav = navigatePath(leaf.path);
                    if (nav) {
                      nav.parentArr.splice(nav.index, 1);
                      // unwrap empty parent loops up the chain
                      var climb = leaf.path.slice(0, -1);
                      while (climb.length) {
                        var pn = navigatePath(climb);
                        if (pn && pn.node && pn.node.kind === 'loop'
                            && (!pn.node.children || !pn.node.children.length)) {
                          unwrapLoopAtPath(climb);
                          climb = climb.slice(0, -1);
                        } else break;
                      }
                    }
                  }
                  render();
                  emitChange();
                });
                pill.appendChild(x);

          pill.draggable = false; // HTML5 drag fights loop-draw when armed
                if (loopDrawArmed) {
                  pill.addEventListener('pointerdown', function (e) {
                    tryStartDrawFromEvent(e);
                  });
                }

                // reorder by dragging top-level only (path length 1); never while drawing loop
                if (leaf.path.length === 1 && !loopDrawArmed) {
                  pill.draggable = true;
            pill.addEventListener('dragstart', function (e) {
              e.dataTransfer.setData('application/x-psyclaw-flow', String(leaf.topIndex));
              e.dataTransfer.effectAllowed = 'move';
              pill.classList.add('dragging');
            });
            pill.addEventListener('dragend', function () { pill.classList.remove('dragging'); });
            pill.addEventListener('dragover', function (e) {
              e.preventDefault();
              pill.classList.add('drag-over');
            });
            pill.addEventListener('dragleave', function () { pill.classList.remove('drag-over'); });
            pill.addEventListener('drop', function (e) {
              e.preventDefault();
              pill.classList.remove('drag-over');
              var from = Number(e.dataTransfer.getData('application/x-psyclaw-flow'));
              var to = leaf.topIndex;
              if (isNaN(from) || from === to) return;
              var item = design.flow.splice(from, 1)[0];
              design.flow.splice(to, 0, item);
              setFlowSelection(to, false);
              render();
              emitChange();
            });
          }

          pillsRow.appendChild(pill);
        });

        track.appendChild(pillsRow);
        track.appendChild(bracketsLayer);
        canvas.appendChild(track);
        shell.appendChild(canvas);
        box.appendChild(shell);

        if (loopDrawArmed) {
          box.insertBefore(
            el('p', 'flow-draw-banner', t('flow.drawBanner') || 'DRAW LOOP — drag A → B · Esc cancels'),
            shell
          );
        }

    // ---- place brackets under pills (after layout) ----
        function placeBrackets() {
          bracketsLayer.innerHTML = '';
          // never leave draw ghosts stuck
          if (previewLayer) {
            previewLayer.hidden = true;
            previewLayer.innerHTML = '';
          }
          if (rubber) {
            rubber.hidden = true;
            rubber.className = 'flow-draw-rubber';
          }
          bracketsLayer.classList.remove('is-previewing');

          if (!brackets.length || !leaves.length) return;

          var tr = track.getBoundingClientRect();
          var rowR = pillsRow.getBoundingClientRect();
          // anchor under the real pill row (not a magic 44px)
          var baseTop = Math.max(36, Math.round(rowR.bottom - tr.top + 6));
          var levelH = 26; // slight room under arc for name + ×N

          brackets.forEach(function (b) {
            var n0 = pillByLeaf(b.leafStart);
            var n1 = pillByLeaf(b.leafEnd);
            if (!n0 || !n1) return;
            var r0 = n0.getBoundingClientRect();
            var r1 = n1.getBoundingClientRect();
            // relative to track; canvas scroll moves both track & pills equally
            var left = Math.min(r0.left, r1.left) - tr.left;
            var right = Math.max(r0.right, r1.right) - tr.left;
            var nestOffset = (maxDepth - b.depth) * levelH;
            var pathSel = selectedFlowPath && selectedFlowPath.join(',') === b.path.join(',');
                        var br = el('div', 'flow-bracket'
                          + (pathSel ? ' is-selected' : '')
                          + (b.depth > 0 ? ' is-nested' : '')
                          + ' depth-' + b.depth);
            // Combined chip removed — just widen bracket so "trials ×30" fits
                        var span = Math.max(40, Math.round(right - left));
                        var minW = 148; // enough for name + ×N
                        var w = Math.max(span, minW);
                        var mid = (left + right) / 2;
                        br.style.left = Math.round(mid - w / 2) + 'px';
                        br.style.width = w + 'px';
                        br.style.top = (baseTop + nestOffset) + 'px';
                        br.dataset.topIndex = String(b.topIndex);
                        br.dataset.depth = String(b.depth);

                        var lab = el('span', 'flow-bracket-label', escapeHtml(b.name));
                        var nR = (isFinite(b.nReps) && b.nReps >= 1) ? b.nReps : 1;
                        var nC = (b.nCond > 0) ? b.nCond : 0;
                        var totalTrials = nC > 0 ? (nR * nC) : nR;
                        lab.title = (nC > 0
                          ? t('flow.nRepsCond', { n: nR, c: nC, t: totalTrials })
                          : t('flow.nRepsEdit', { n: nR }));
                        lab.addEventListener('click', function (e) {
                                                  e.stopPropagation();
                                                  selectedComponentId = null;
                                                  // loop only — clear routine/pill flow selection highlight
                                                  clearFlowSelection();
                                                  selectedFlowPath = b.path.slice();
                                                  selectedFlowIndex = b.topIndex;
                                                  render();
                                                });
                        // Always show total trials on the chip (nReps, or nReps×rows). Breakdown in title.
                        var repsLabel = '\u00d7' + totalTrials;
                        var reps = el('span', 'flow-bracket-reps', repsLabel);
                        reps.title = nC > 0
                          ? (nR + ' reps \u00d7 ' + nC + ' rows = ' + totalTrials + ' trials')
                          : (nR + ' repetitions');
                        var ux = el('button', 'flow-bracket-x');
                        ux.type = 'button';
                        ux.textContent = '\u00d7';
                        ux.title = t('flow.unwrap');
                        ux.addEventListener('click', function (e) {
                          e.stopPropagation();
                          if (unwrapLoopAtPath(b.path)) {
                            render();
                            emitChange();
                          }
                        });
                        br.appendChild(lab);
                        br.appendChild(reps);
                        br.appendChild(ux);

                        if (b.path.length === 1) {
                          var edgeL = el('div', 'flow-bracket-edge flow-bracket-edge-l');
                          var edgeR = el('div', 'flow-bracket-edge flow-bracket-edge-r');
                          edgeL.title = 'Drag left: absorb neighbor';
                          edgeR.title = 'Drag right: absorb neighbor';
                          bindEdge(edgeL, b.topIndex, 'left');
                          bindEdge(edgeR, b.topIndex, 'right');
                          br.appendChild(edgeL);
                          br.appendChild(edgeR);
                        }

                        bracketsLayer.appendChild(br);
                      });

                      var need = baseTop + (maxDepth + 1) * levelH + 20;
          track.style.minHeight = need + 'px';
        }

        function bindEdge(handle, idx, side) {
          handle.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            var startX = e.clientX;
            var acted = false;
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            function onMove(ev) {
              var dx = ev.clientX - startX;
              if (!acted && Math.abs(dx) > 28) {
                acted = true;
                var ok = false;
                if (side === 'left') ok = dx < 0 ? expandLoop(idx, 'left') : shrinkLoop(idx, 'left');
                else ok = dx > 0 ? expandLoop(idx, 'right') : shrinkLoop(idx, 'right');
                if (ok) { render(); emitChange(); }
              }
            }
            function onUp() {
              handle.removeEventListener('pointermove', onMove);
              handle.removeEventListener('pointerup', onUp);
              handle.removeEventListener('pointercancel', onUp);
            }
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
          });
        }

        // place after paint; also keep aligned on scroll/resize
        function scheduleBrackets() {
          requestAnimationFrame(function () {
            placeBrackets();
            requestAnimationFrame(placeBrackets);
          });
          setTimeout(placeBrackets, 0);
          setTimeout(placeBrackets, 50);
        }
        scheduleBrackets();

        // canvas is the horizontal scrollport — re-anchor brackets when it moves
        var relayout = function () { placeBrackets(); };
        canvas.addEventListener('scroll', relayout, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
          var ro = new ResizeObserver(relayout);
          ro.observe(track);
          ro.observe(pillsRow);
        }
        window.addEventListener('resize', relayout);
      }



  // ---- builder-part-preview.js ----
  // ---- Component stage preview (inspector) ----
  var previewCtl = null; // { stop: fn }
  var previewMode = 'solo'; // 'solo' | 'routine' — persists across remount

  function stopComponentPreview() {
    if (previewCtl && typeof previewCtl.stop === 'function') {
      try { previewCtl.stop(); } catch (err) { /* ignore */ }
    }
    previewCtl = null;
  }

  function previewBeep(freq, durMs, gain) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = (previewCtl && previewCtl.audioCtx) || new Ctx();
      if (previewCtl) previewCtl.audioCtx = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq || 880;
      g.gain.value = gain == null ? 0.04 : gain;
      o.connect(g);
      g.connect(ctx.destination);
      var t0 = ctx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (durMs || 60) / 1000);
      o.start(t0);
      o.stop(t0 + (durMs || 60) / 1000 + 0.02);
    } catch (err) { /* audio optional */ }
  }

  function buildKeyboardVisual(host, c, opts) {
      opts = opts || {};
      var p = c.params || {};
      var raw = String(p.keys == null ? 'any' : p.keys);
      var allowed = raw.split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
      if (!allowed.length) allowed = ['any'];
      var allowAny = allowed.indexOf('any') >= 0;

      // normalize allowed tokens for matching
      var allowSet = {};
      allowed.forEach(function (k) {
        allowSet[k] = true;
        if (k === ' ' || k === 'spacebar') allowSet.space = true;
        if (k === 'return') allowSet.enter = true;
        if (k === 'esc') allowSet.escape = true;
        if (k === 'escape') allowSet.esc = true;
        if (k === 'enter') allowSet.return = true;
      });

      function isLit(id) {
        if (allowAny) return true;
        id = String(id).toLowerCase();
        if (allowSet[id]) return true;
        if (id === 'space' && (allowSet[' '] || allowSet.spacebar)) return true;
        return false;
      }

      function key(id, label, cls) {
        return { id: id, label: label, cls: cls || '' };
      }

      // Full ANSI-ish layout (compact labels)
      var rows = [
        [
          key('`', '`'), key('1', '1'), key('2', '2'), key('3', '3'), key('4', '4'),
          key('5', '5'), key('6', '6'), key('7', '7'), key('8', '8'), key('9', '9'),
          key('0', '0'), key('-', '-'), key('=', '='), key('backspace', '⌫', 'is-wide'),
        ],
        [
          key('tab', 'tab', 'is-wide'),
          key('q', 'Q'), key('w', 'W'), key('e', 'E'), key('r', 'R'), key('t', 'T'),
          key('y', 'Y'), key('u', 'U'), key('i', 'I'), key('o', 'O'), key('p', 'P'),
          key('[', '['), key(']', ']'), key('\\', '\\', 'is-wide'),
        ],
        [
          key('capslock', 'caps', 'is-wide'),
          key('a', 'A'), key('s', 'S'), key('d', 'D'), key('f', 'F'), key('g', 'G'),
          key('h', 'H'), key('j', 'J'), key('k', 'K'), key('l', 'L'),
          key(';', ';'), key('\'', '\''), key('enter', '↵', 'is-wide'),
        ],
        [
          key('lshift', 'shift', 'is-wide'),
          key('z', 'Z'), key('x', 'X'), key('c', 'C'), key('v', 'V'), key('b', 'B'),
          key('n', 'N'), key('m', 'M'), key(',', ','), key('.', '.'), key('/', '/'),
          key('rshift', 'shift', 'is-wide'),
        ],
        [
          key('lctrl', 'ctrl', 'is-mod'),
          key('lalt', 'alt', 'is-mod'),
          key('space', 'space', 'is-space'),
          key('ralt', 'alt', 'is-mod'),
          key('rctrl', 'ctrl', 'is-mod'),
          key('left', '←', 'is-arrow'),
          key('up', '↑', 'is-arrow'),
          key('down', '↓', 'is-arrow'),
          key('right', '→', 'is-arrow'),
        ],
      ];

      var root = document.createElement('div');
      root.className = 'comp-preview-stim keyboard-sim is-full'
        + (opts.docked ? ' is-docked' : ' is-solo');

      var hint = document.createElement('div');
      hint.className = 'kb-hint';
      hint.textContent = allowAny ? t('insp.anyKey') : t('insp.keys', { keys: allowed.join(' · ') });
      root.appendChild(hint);

      rows.forEach(function (row) {
        var rowEl = document.createElement('div');
        rowEl.className = 'kb-row';
        row.forEach(function (k) {
          var keyEl = document.createElement('span');
          var lit = isLit(k.id)
            || (k.id === 'lshift' || k.id === 'rshift' ? isLit('shift') : false)
            || (k.id === 'lctrl' || k.id === 'rctrl' ? isLit('ctrl') || isLit('control') : false)
            || (k.id === 'lalt' || k.id === 'ralt' ? isLit('alt') || isLit('option') : false)
            || (k.id === 'enter' ? isLit('return') : false)
            || (k.id === 'escape' ? isLit('esc') : false);
          keyEl.className = 'kb-key'
            + (k.cls ? ' ' + k.cls : '')
            + (lit ? ' is-lit' : '');
          keyEl.textContent = k.label;
          keyEl.title = k.id;
          rowEl.appendChild(keyEl);
        });
        root.appendChild(rowEl);
      });

      if (p.force_end) {
        var fe = document.createElement('div');
        fe.className = 'kb-force';
        fe.textContent = t('insp.forceEnd');
        root.appendChild(fe);
      }
      host.appendChild(root);
    }

    /** First conditions row for preview $var resolution (selected loop, else first loop in flow). */
    function firstConditionsRow() {
      var loop = selectedLoopNode();
      if (loop && Array.isArray(loop.conditions) && loop.conditions.length) {
        return Object.assign({}, loop.conditions[0]);
      }
      var out = null;
      function walk(nodes) {
        if (out) return;
        (nodes || []).forEach(function (n) {
          if (out) return;
          if (n && n.kind === 'loop') {
            if (Array.isArray(n.conditions) && n.conditions.length) {
              out = Object.assign({}, n.conditions[0]);
              return;
            }
            walk(n.children);
          }
        });
      }
      walk(design.flow || []);
      return out || {};
    }

    /** First non-empty value for a conditions column across all loops. */
    function firstValueForKey(key) {
      function scan(nodes) {
        var i, n, r, row, deep;
        for (i = 0; i < (nodes || []).length; i++) {
          n = nodes[i];
          if (!n || n.kind !== 'loop') continue;
          if (Array.isArray(n.conditions)) {
            for (r = 0; r < n.conditions.length; r++) {
              row = n.conditions[r];
              if (row && row[key] != null && String(row[key]) !== '') {
                return String(row[key]);
              }
            }
          }
          deep = scan(n.children);
          if (deep != null) return deep;
        }
        return null;
      }
      return scan(design.flow || []);
    }

    /**
     * Resolve component param for PREVIEW.
     * $colName → first conditions value for that column (selected loop row0, else first in flow).
     */
    function resolveParamForPreview(val) {
      if (val == null) return val;
      var s = String(val);
      var m = s.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!m) return s;
      var key = m[1];
      var row = firstConditionsRow();
      if (row && row[key] != null && String(row[key]) !== '') return String(row[key]);
      var any = firstValueForKey(key);
      if (any != null) return any;
      return s;
    }

    function buildPreviewVisual(layer, c, stageH) {
      layer.innerHTML = '';
      layer.className = 'comp-preview-layer is-on';
      var p = c.params || {};
      if (c.type === 'text' || c.type === 'fixation') {
          var span = document.createElement('div');
          span.className = 'comp-preview-stim text';
          var rawText = p.text == null ? (c.type === 'fixation' ? '+' : '') : String(p.text);
          var showText = resolveParamForPreview(rawText);
          span.textContent = showText == null ? '' : String(showText);
          if (String(rawText).charAt(0) === '$' && showText === rawText) {
            span.classList.add('is-unbound');
            span.title = 'No stimlist value for ' + rawText + ' — add a column or import table';
          } else if (String(rawText).charAt(0) === '$') {
            span.title = rawText + ' → ' + showText + ' (first row)';
          }
          var h = Number(p.height);
                    if (isNaN(h) || h <= 0) h = c.type === 'fixation' ? 0.08 : 0.05;
                    // PsychoPy units=height: font size = height * windowHeight (true ratio)
                    var px = Math.max(1, Math.round(stageH * h));
                    span.style.fontSize = px + 'px';
                    span.style.lineHeight = '1.15';
                    span.style.maxWidth = '96%';
                    span.style.wordBreak = 'break-word';
                    span.style.textAlign = 'center';
                    var rawColor = p.color || 'white';
                    var showColor = resolveParamForPreview(rawColor);
                    var cssColor = showColor;
                    if (cssColor && String(cssColor).charAt(0) !== '$') {
                      var hexC = normalizeBgcolor(cssColor, { strict: true });
                      if (hexC) cssColor = hexC;
                    }
                    span.style.color = cssColor || '#ffffff';
                    layer.appendChild(span);
        } else if (c.type === 'keyboard') {
              buildKeyboardVisual(layer, c, { docked: false });
            } else if (c.type === 'image') {
                  var wrap = document.createElement('div');
                  wrap.className = 'comp-preview-stim image';
                  var ipath = String(resolveParamForPreview(p.path || '') || '');
                  var img = document.createElement('img');
                  img.alt = ipath || 'image';
                  img.draggable = false;
                  var sz = Number(p.size);
                  if (isNaN(sz) || sz <= 0) sz = 0.5;
                  // units=height: size ≈ fraction of window height
                  var ipx = Math.max(4, Math.round(stageH * sz));
                  img.style.width = ipx + 'px';
                  img.style.height = 'auto';
                  img.style.maxWidth = '96%';
                  img.style.maxHeight = '96%';
                  var failed = false;
                  img.onerror = function () {
                    if (failed) return;
                    failed = true;
                    wrap.classList.add('is-missing');
                    wrap.innerHTML = '<div class="img-ph">▣</div><div class="img-path"></div>';
                    wrap.querySelector('.img-path').textContent = ipath || t('insp.noPath');
                  };
                  if (ipath) {
                    img.src = ipath;
                    wrap.appendChild(img);
                  } else {
                    img.onerror();
                  }
                  layer.appendChild(wrap);
                } else if (c.type === 'video') {
                  var vwrap = document.createElement('div');
                  vwrap.className = 'comp-preview-stim video';
                  var vpath = String(resolveParamForPreview(p.path || '') || '');
                  var vsz = Number(p.size);
                  if (isNaN(vsz) || vsz <= 0) vsz = 0.5;
                  var vpx = Math.max(48, Math.round(stageH * vsz));
                  function videoMissing(msg) {
                    vwrap.classList.add('is-missing');
                    vwrap.innerHTML = '<div class="vid-ph" aria-hidden="true">▶</div><div class="img-path"></div>';
                    vwrap.querySelector('.img-path').textContent = msg || vpath || t('insp.noPath');
                  }
                  if (!vpath) {
                    videoMissing(t('insp.noPath'));
                  } else {
                    var vid = document.createElement('video');
                    vid.className = 'comp-preview-video';
                    vid.muted = true;
                    vid.playsInline = true;
                    vid.preload = 'metadata';
                    vid.controls = false;
                    vid.draggable = false;
                    vid.style.width = vpx + 'px';
                    vid.style.maxWidth = '96%';
                    vid.style.maxHeight = '96%';
                    vid.style.height = 'auto';
                    vid.style.objectFit = 'contain';
                    var vfailed = false;
                    vid.onerror = function () {
                      if (vfailed) return;
                      vfailed = true;
                      videoMissing(vpath);
                    };
                    vid.onloadeddata = function () {
                      try { vid.currentTime = 0.01; } catch (eV) { /* ignore */ }
                    };
                    vid.src = vpath;
                    vwrap.appendChild(vid);
                    var vtag = document.createElement('div');
                    vtag.className = 'vid-badge';
                    vtag.textContent = 'VIDEO';
                    vwrap.appendChild(vtag);
                  }
                  layer.appendChild(vwrap);
                } else if (c.type === 'code') {
      var code = document.createElement('div');
      code.className = 'comp-preview-stim code';
      code.innerHTML = '<span class="code-tag">&lt;/&gt;</span><span class="code-phase"></span>';
      code.querySelector('.code-phase').textContent = p.phase || 'each_frame';
      layer.appendChild(code);
    } else {
      var unk = document.createElement('div');
      unk.className = 'comp-preview-stim code';
      unk.textContent = c.type || '?';
      layer.appendChild(unk);
    }
  }

  function getRoutinePreviewSpan(r) {
        /**
         * Whole-routine preview window meta.
         * - All finite: last component offset (start+duration) — scrub loop
         * - Any open-ended (∞): static hold (no scrub end). Real PsychoPy waits
         *   for key/force_end; preview does NOT fake a 1.2s key press.
         * No TIMELINE_MIN floor (that is for the builder ruler only).
         */
        var comps = (r && r.components) || [];
        if (!comps.length) {
          return {
            end: 1, hasOpen: false, hasFinite: false,
            maxFiniteEnd: 0, maxOpenStart: 0, freezeT: 0,
          };
        }

        var maxFiniteEnd = 0;
        var hasFinite = false;
        var maxOpenStart = 0;
        var hasOpen = false;
        var maxAnyStart = 0;

        comps.forEach(function (c) {
          var s = Number(c.start) || 0;
          if (s > maxAnyStart) maxAnyStart = s;
          var open = isOpenDuration(c.duration);
          if (open) {
            hasOpen = true;
            if (s > maxOpenStart) maxOpenStart = s;
          } else {
            hasFinite = true;
            var e = s + (Number(c.duration) || 0);
            if (e > maxFiniteEnd) maxFiniteEnd = e;
          }
        });

        // freeze snapshot for open-ended routine: after last open onset / finite settle
        var freezeT = Math.max(maxOpenStart, maxFiniteEnd, maxAnyStart);
        freezeT = Math.round(freezeT * 1000) / 1000;

        var end;
        if (hasOpen) {
          // open-ended routine has no real preview end — consumer uses static ∞
          end = 0;
        } else {
          end = maxFiniteEnd;
          end = Math.round(end * 1000) / 1000;
          if (end < 0.05) end = 0.05;
          if (end > 60) end = 60;
        }

        return {
          end: end,
          hasOpen: hasOpen,
          hasFinite: hasFinite,
          forceEndAt: null,
          maxFiniteEnd: maxFiniteEnd,
          maxOpenStart: maxOpenStart,
          freezeT: freezeT,
        };
      }

    function isCompActiveAt(c, t, routineEnd) {
          var s = Number(c.start) || 0;
          if (t + 1e-9 < s) return false;
          if (isOpenDuration(c.duration)) {
            // open-ended: holds until routine preview ends (event / force_end / span)
            if (routineEnd == null) return true;
            return t <= routineEnd + 1e-9;
          }
          // inclusive end so yellow mark / last frame still shows the stim
          return t <= s + (Number(c.duration) || 0) + 1e-9;
        }

  function mountComponentPreview(host, c, opts) {
      stopComponentPreview();
      if (!host || !c) return;
      opts = opts || {};
      var routineOnly = !!opts.routineOnly;
      host.innerHTML = '';

      // routine-only inspector: always Whole routine, no component focus ring
      if (routineOnly) previewMode = 'routine';

      ensureDisplay(design);
      var dspec = getDisplaySpec();
      var aspect = dspec.width / dspec.height;
      var bg = dspec.bgcolor || '#000000';

      var routine = (typeof findRoutine === 'function' && selectedRoutine)
        ? findRoutine(selectedRoutine)
        : null;
      var peers = (routine && routine.components) ? routine.components.slice() : [c];

      var startT = Number(c.start) || 0;
      var open = isOpenDuration(c.duration);
      var dur = open ? null : Math.max(0.05, Number(c.duration) || 0.5);

      var root = el('div', 'comp-preview' + (routineOnly ? ' is-routine-only' : ''));
      var head = el('div', 'comp-preview-head');
      head.appendChild(el('span', 'comp-preview-label', t('insp.preview')));
      var hud = el('span', 'comp-preview-hud', 't=0.00s');
      head.appendChild(hud);
      var replay = el('button', 'comp-preview-replay');
      replay.type = 'button';
      replay.title = 'Replay';
      replay.textContent = '\u21bb';
      head.appendChild(replay);
      root.appendChild(head);

      // mode toggle — when routine selected (no component), keep visible but lock "This only"
            var modes = el('div', 'comp-preview-modes');
            var btnSolo = el('button', 'comp-preview-mode' + (previewMode === 'solo' && !routineOnly ? ' is-on' : ''));
            btnSolo.type = 'button';
            btnSolo.textContent = t('insp.thisOnly');
            btnSolo.title = routineOnly
              ? t('insp.thisOnlyLock')
              : 'Play only this component (local window)';
            var btnRoutine = el('button', 'comp-preview-mode' + (previewMode === 'routine' || routineOnly ? ' is-on' : ''));
            btnRoutine.type = 'button';
            btnRoutine.textContent = t('insp.wholeRoutine');
            btnRoutine.title = 'Full routine, all components equal (no focus dim)';
            modes.appendChild(btnSolo);
            modes.appendChild(btnRoutine);
            if (routineOnly) {
              btnSolo.disabled = true;
              btnSolo.setAttribute('aria-disabled', 'true');
              btnSolo.classList.add('is-disabled');
              btnSolo.classList.remove('is-on');
            }
            root.appendChild(modes);

    // DOM shell — MUST NOT be named `frame` (shadows anim callback function frame(now))
        var frameEl = el('div', 'comp-preview-frame');
            var stage = el('div', 'comp-preview-stage');
            stage.style.background = bg;
            stage.setAttribute('data-design-size', dspec.width + 'x' + dspec.height);
            var layer = el('div', 'comp-preview-center is-on');
            stage.appendChild(layer);
            var badge = el('div', 'comp-preview-badge', '');
            stage.appendChild(badge);
            frameEl.appendChild(stage);
            root.appendChild(frameEl);

        // Display size — read-only (Monitor / Res / FS live on System tab; no duplicate controls)
                var dispBar = el('div', 'comp-preview-display');
                var sizeLab = el('span', 'comp-preview-display-size', dspec.width + '\u00d7' + dspec.height);
                sizeLab.title = 'Window size from System · Display (design.display.size)';
                dispBar.appendChild(sizeLab);
                root.appendChild(dispBar);

                    var scrub = el('div', 'comp-preview-scrub');
            var fill = el('div', 'comp-preview-scrub-fill');
            var marks = el('div', 'comp-preview-marks');
            scrub.appendChild(fill);
            scrub.appendChild(marks);
            root.appendChild(scrub);

            // keyboard OUTSIDE the black screen — separate strip under scrub
            var kbDock = el('div', 'comp-preview-kb-dock');
            kbDock.hidden = true;
            root.appendChild(kbDock);

            var cap = el('p', 'muted comp-preview-caption', '');
                        root.appendChild(cap);

                host.appendChild(root);

    var stageH = 0;
            var raf = 0;
            var running = true;
            var t0 = 0;
            var lastBeepIds = {};
            var ro = null;

    // timeline window depends on mode
        var winStart = 0; // absolute
        var winSpan = 1;
        var routineEnd = null; // absolute end for whole-routine finite scrub only
        var soloStaticOpen = false;
        var staticAbsT = 0; // paint time for static ∞ (solo or whole-routine open)
        var spanMeta = null;

        var stageW = 0;
        function layoutStage() {
          ensureDisplay(design);
          var ds = getDisplaySpec();
          var aspectNow = ds.width / Math.max(1, ds.height);
          var hostW = (frameEl && frameEl.clientWidth) || (root && root.clientWidth) || 280;
          hostW = Math.max(160, hostW - 2);
          var maxH = Math.min(Math.round((window.innerHeight || 800) * 0.42), 380);
          maxH = Math.max(150, maxH);
          var w = hostW;
          var h = w / aspectNow;
          if (h > maxH) {
            h = maxH;
            w = h * aspectNow;
          }
          if (w < 160) {
            w = 160;
            h = w / aspectNow;
          }
          w = Math.round(w);
          h = Math.round(h);
          stage.style.width = w + 'px';
          stage.style.height = h + 'px';
          stage.style.aspectRatio = 'auto';
          stageW = w;
          stageH = h;
          stage.setAttribute('data-design-size', ds.width + 'x' + ds.height);
          if (sizeLab) sizeLab.textContent = ds.width + '×' + ds.height;
        }
        function measure() {
          layoutStage();
          if (!stageH) stageH = stage.clientHeight || 160;
          if (!stageW) stageW = stage.clientWidth || Math.round(stageH * aspect) || 280;
        }

        function recomputeWindow() {
          soloStaticOpen = false;
          routineEnd = null;
          spanMeta = null;
          staticAbsT = 0;
          root.classList.remove('is-open-ended');
          if (previewMode === 'routine') {
            winStart = 0;
            spanMeta = getRoutinePreviewSpan(routine || { components: peers });
            if (spanMeta.hasOpen) {
                          // any ∞ component → whole routine is open-ended: static hold, no fake 1.2s key end
                          soloStaticOpen = true;
                          staticAbsT = (spanMeta.freezeT != null ? spanMeta.freezeT : 0) + 0.001;
                          winSpan = 0;
                          routineEnd = null;
                          root.classList.add('is-open-ended');
                          badge.textContent = t('prev.routineInf');
                          hud.textContent = '∞';
                          if (spanMeta.hasFinite) {
                            cap.textContent = t('prev.wholeHold', { t: formatTime(spanMeta.freezeT), end: formatTime(spanMeta.maxFiniteEnd) });
                          } else {
                            cap.textContent = t('prev.wholeAllOpen');
                          }
                        } else {
                          winSpan = spanMeta.end;
                          routineEnd = spanMeta.end;
                          badge.textContent = t('prev.routineRange', { t: formatTime(winSpan) });
                          cap.textContent = t('prev.wholeEnds', { end: formatTime(spanMeta.maxFiniteEnd) });
                        }
          } else if (open) {
            // solo + open-ended: static hold, no scrub motion
            soloStaticOpen = true;
            winStart = startT;
            staticAbsT = startT + 0.001;
            winSpan = 0;
            root.classList.add('is-open-ended');
            badge.textContent = t('prev.openBadge');
            hud.textContent = '∞';
            cap.textContent = t('prev.openFrom', { t: formatTime(startT) });
          } else {
            // This only · finite: window starts at THIS component's start (no pre-roll, no tail)
            winStart = startT;
            winSpan = dur;
            if (winSpan > 8) winSpan = 8;
            if (winSpan < 0.05) winSpan = 0.05;
            badge.textContent = formatTime(dur) + 's';
            cap.textContent = t('prev.thisOnly', { start: formatTime(startT), dur: formatTime(dur) });
          }
          paintMarks();
        }

    function paintMarks() {
          marks.innerHTML = '';
          if (soloStaticOpen) {
            fill.style.width = '100%';
            scrub.classList.add('is-infinite');
            return;
          }
          scrub.classList.remove('is-infinite');
          function addMark(absT, cls, title) {
            if (winSpan <= 0) return;
            var pct = ((absT - winStart) / winSpan) * 100;
            if (pct < -1 || pct > 101) return;
            var m = el('div', 'comp-preview-mark ' + cls);
            m.style.left = Math.max(0, Math.min(100, pct)) + '%';
            m.title = title || '';
            marks.appendChild(m);
          }
          if (previewMode === 'routine') {
            // equal marks for every component — no focus green on selected
            peers.forEach(function (pc) {
              var s = Number(pc.start) || 0;
              var od = pc.duration;
              var isOpen = od == null || od === '';
              addMark(s, 'peer', (pc.name || pc.type) + ' onset');
              if (!isOpen) addMark(s + (Number(od) || 0), 'peer-end', (pc.name || pc.type) + ' offset');
            });
          } else {
            addMark(startT, 'onset focus', (c.name || c.type) + ' onset');
            if (!open) addMark(startT + dur, 'offset focus', (c.name || c.type) + ' offset');
          }
        }

    function paintStageAtFixed(absT) {
                  measure();
                  layer.innerHTML = '';
                  layer.className = 'comp-preview-center is-on';
                  kbDock.innerHTML = '';
                  kbDock.hidden = true;
                  var list;
                  if (previewMode === 'routine') {
                    list = peers.filter(function (pc) { return isCompActiveAt(pc, absT, routineEnd); });
                  } else if (soloStaticOpen) {
                    list = [c];
                  } else {
                    list = isCompActiveAt(c, absT, null) ? [c] : [];
                  }
                  // Whole routine: highlight selected component's active window (not when routine-only preview)
                                    var selActive = !routineOnly && previewMode === 'routine' && isCompActiveAt(c, absT, routineEnd);
                  root.classList.toggle('is-sel-active', !!selActive);
                  // stage red frame for visual focus; keyboard uses dock ring only
                  stage.classList.toggle('is-sel-active', !!selActive && c.type !== 'keyboard');
                  if (!list.length) {
                    layer.classList.add('is-empty');
                    return;
                  }
                  var visuals = [];
                  var keyboards = [];
                  list.forEach(function (pc) {
                    if (pc.type === 'keyboard') keyboards.push(pc);
                    else visuals.push(pc);
                  });
                  // center: text/image/fixation/code
                  visuals.forEach(function (pc) {
                    var tmp = document.createElement('div');
                    buildPreviewVisual(tmp, pc, stageH);
                    var wrap = document.createElement('div');
                    var cls = 'comp-preview-stack';
                    if (previewMode === 'solo') cls += ' is-focus';
                    else {
                      cls += ' is-equal';
                      if (selActive && pc.id === c.id) cls += ' is-sel-window';
                    }
                    wrap.className = cls;
                    while (tmp.firstChild) wrap.appendChild(tmp.firstChild);
                    layer.appendChild(wrap);
                  });
                  // keyboard placement:
                  // - This only (no visuals): put keyboard IN stage (avoid empty black void)
                  // - Whole routine / with visuals: dock under stage (never cover text)
                  if (keyboards.length) {
                    var dockKb = previewMode === 'routine' || visuals.length > 0;
                    if (dockKb) {
                      kbDock.hidden = false;
                      keyboards.forEach(function (pc) {
                        var wrap = document.createElement('div');
                        var kcls = 'comp-preview-kb-item is-equal';
                        if (selActive && pc.id === c.id) kcls += ' is-sel-window';
                        wrap.className = kcls;
                        buildKeyboardVisual(wrap, pc, { docked: true });
                        kbDock.appendChild(wrap);
                      });
                    } else {
                      keyboards.forEach(function (pc) {
                        var wrap = document.createElement('div');
                        wrap.className = 'comp-preview-stack is-focus is-kb-solo';
                        buildKeyboardVisual(wrap, pc, { docked: false });
                        layer.appendChild(wrap);
                      });
                    }
                  }
                  if (!visuals.length && !keyboards.length) layer.classList.add('is-empty');
                }

    function maybeBeep(absT, prevT) {
              if (!isPreviewOnsetClick()) return;
              // keyboard preview is layout-only — never sound in solo keyboard
              if (previewMode === 'solo' && c.type === 'keyboard') return;
              peers.forEach(function (pc) {
                if (previewMode === 'solo' && pc.id !== c.id) return;
                // keyboard has no visual onset — never click for it
                if (pc.type === 'keyboard') return;
                var s = Number(pc.start) || 0;
                // crossed onset
                if (prevT < s && absT >= s) {
                  if (!lastBeepIds[pc.id + '@' + s]) {
                    lastBeepIds[pc.id + '@' + s] = true;
                    if (previewMode === 'routine') {
                      previewBeep(720, 40, 0.03);
                    } else {
                      previewBeep(920, 55, 0.045);
                    }
                  }
                }
              });
            }

    function paint(localT) {
      if (soloStaticOpen) {
        hud.textContent = '\u221e';
        fill.style.width = '100%';
        paintStageAtFixed(staticAbsT || (startT + 0.001));
        return;
      }
      var absT = winStart + localT;
      hud.textContent = 't=' + (Math.round(absT * 100) / 100).toFixed(2) + 's';
      var pct = winSpan > 0 ? Math.max(0, Math.min(1, localT / winSpan)) : 0;
      fill.style.width = (pct * 100) + '%';
      paintStageAtFixed(absT);
    }

    function frame(now) {
              if (!running || soloStaticOpen) return;
              if (!t0) t0 = now;
              var localT = (now - t0) / 1000;
              if (localT < 0) localT = 0;
              var prevAbs = winStart + Math.max(0, localT - 1 / 60);
              // Play once — hold final frame. Replay (↻) or re-select restarts.
              if (localT >= winSpan) {
                paint(winSpan);
                running = false;
                root.classList.add('is-preview-done');
                return;
              }
              var absT = winStart + localT;
              maybeBeep(absT, prevAbs);
              paint(localT);
              raf = requestAnimationFrame(frame);
            }

        function startAnim() {
              if (raf) cancelAnimationFrame(raf);
              recomputeWindow();
              t0 = 0;
              lastBeepIds = {};
              running = true;
              root.classList.remove('is-preview-done');
              if (soloStaticOpen) {
                                    paint(0);
                                    // static ∞: only optional visual onset; never for keyboard-only / keyboard focus
                                    if (isPreviewOnsetClick() && c.type !== 'keyboard') {
                                      var hasVisual = peers.some(function (pc) {
                                        if (pc.type === 'keyboard') return false;
                                        if (previewMode === 'solo' && pc.id !== c.id) return false;
                                        return isCompActiveAt(pc, staticAbsT || (startT + 0.001), routineEnd);
                                      });
                                      if (hasVisual) previewBeep(920, 55, 0.045);
                                    }
                                    return;
                                  }
              raf = requestAnimationFrame(frame);
            }

    function setMode(mode) {
      if (mode !== 'solo' && mode !== 'routine') return;
      previewMode = mode;
      btnSolo.classList.toggle('is-on', mode === 'solo');
      btnRoutine.classList.toggle('is-on', mode === 'routine');
      startAnim();
    }

    btnSolo.addEventListener('click', function (e) {
          e.preventDefault();
          if (routineOnly || btnSolo.disabled) return;
          setMode('solo');
        });
        btnRoutine.addEventListener('click', function (e) {
          e.preventDefault();
          setMode('routine');
        });
    replay.addEventListener('click', function (e) {
      e.preventDefault();
      startAnim();
    });

    if (typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(function () {
            measure();
            if (soloStaticOpen) paint(0);
          });
          ro.observe(frameEl);
          if (host) ro.observe(host);
        }

    previewCtl = {
      audioCtx: null,
      stop: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) try { ro.disconnect(); } catch (err) { /* ignore */ }
      },
    };

    requestAnimationFrame(function () {
      measure();
      startAnim();
    });
  }

  function refreshPreviewIfVisible(c) {
      var host = document.querySelector('.comp-preview-host');
      if (host && c) mountComponentPreview(host, c);
    }

    /**
     * CONDITIONS · stimlist under Flow.
     * Full table edit in GUI; optional Import of valid xlsx/csv (rows embedded).
     * Guidance lives in Guide tab — keep this panel dense.
     */
    function conditionColumns(conditions) {
      var seen = {};
      var cols = [];
      (conditions || []).forEach(function (row) {
        if (!row || typeof row !== 'object') return;
        Object.keys(row).forEach(function (k) {
          if (!seen[k]) {
            seen[k] = 1;
            cols.push(k);
          }
        });
      });
      return cols;
    }

    function ensureLoopConditions(loop) {
      if (!Array.isArray(loop.conditions)) loop.conditions = [];
      return loop.conditions;
    }

    function softRefreshPreview() {
      if (!selectedComponentId) return;
      var found = findComponent(selectedComponentId);
      if (found) refreshPreviewIfVisible(found.component);
    }

    function renderConditionsPanel() {
      var card = document.getElementById('builder-conditions-card');
      var panel = document.getElementById('builder-conditions-panel');
      var titleEl = document.getElementById('builder-conditions-title');
      if (!card || !panel) return;

      var loop = (!selectedComponentId && selectedLoopNode()) ? selectedLoopNode() : null;
      if (!loop) {
        card.hidden = true;
        panel.innerHTML = '';
        return;
      }
      card.hidden = false;
      if (titleEl) titleEl.textContent = t('flow.conditionsTitle', { name: (loop.name || 'loop') });
      panel.innerHTML = '';

      var conditions = ensureLoopConditions(loop);
      var nCond = conditions.length;
      var cols = conditionColumns(conditions);

      var bar = el('div', 'cond-toolbar');
      var meta = el('div', 'cond-meta');
      var chip = el('span', 'cond-file-chip' + (loop.conditionsFile ? ' has-file' : (nCond ? ' has-file' : '')));
      if (loop.conditionsFile) {
        chip.textContent = String(loop.conditionsFile).split(/[/\\]/).pop();
        chip.title = String(loop.conditionsFile);
      } else if (nCond) {
        chip.textContent = t('flow.rowsEmbedded', { n: nCond });
        chip.title = 'Stimlist embedded in design';
      } else {
        chip.textContent = t('flow.noStimlist');
        chip.title = t('flow.addRowsHint');
      }
      meta.appendChild(chip);
      meta.appendChild(el('span', 'cond-stats',
              nCond
                ? t('flow.chipStats', {
                    rows: nCond,
                    cols: cols.length,
                    trials: ((loop.nReps || 1) * nCond)
                  })
                : (cols.length
                    ? t('flow.chipStatsEmptyRows', { cols: cols.length })
                    : t('flow.chipStatsEmpty'))));
      bar.appendChild(meta);

      var actions = el('div', 'cond-actions');

      function addRow() {
        ensureLoopConditions(loop);
        var row = {};
        var cs = conditionColumns(loop.conditions);
        if (!cs.length) cs = ['col1'];
        cs.forEach(function (c) { row[c] = ''; });
        loop.conditions.push(row);
        emitChange();
        render();
      }
      function addCol() {
        var name = window.prompt('Column name (e.g. word, color, corrAns)', 'col' + (cols.length + 1));
        if (name == null) return;
        name = String(name).trim();
        if (!name) return;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          alert('Column name must be identifier-like: letters/digits/_ (for $colName params)');
          return;
        }
        ensureLoopConditions(loop);
        if (conditionColumns(loop.conditions).indexOf(name) >= 0) {
          alert('Column already exists: ' + name);
          return;
        }
        if (!loop.conditions.length) {
          var blank = {};
          blank[name] = '';
          loop.conditions.push(blank);
        } else {
          loop.conditions.forEach(function (row) {
            if (row[name] === undefined) row[name] = '';
          });
        }
        emitChange();
        render();
      }
      function importFile(file) {
        if (!file) return;
        var fd = new FormData();
        fd.append('file', file, file.name);
        fetch('/api/conditions/parse', { method: 'POST', body: fd })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (!res.ok || !res.j || !res.j.ok) {
              alert(t('flow.importFailed', { msg: ((res.j && res.j.error) || 'invalid table') }));
              return;
            }
            loop.conditionsFile = res.j.filename || file.name;
            loop.conditions = res.j.rows || [];
            emitChange();
            render();
          })
          .catch(function (err) {
            alert(t('flow.importFailed', { msg: (err && err.message ? err.message : err) }));
          });
      }

      var fileIn = document.createElement('input');
      fileIn.type = 'file';
      fileIn.accept = '.csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileIn.hidden = true;
      fileIn.addEventListener('change', function () {
        var f = fileIn.files && fileIn.files[0];
        fileIn.value = '';
        importFile(f);
      });

      var btnImport = el('button', 'btn btn-secondary cond-upload-btn');
      btnImport.type = 'button';
      btnImport.textContent = t('flow.import');
      btnImport.title = t('flow.importTitle');
      btnImport.addEventListener('click', function () { fileIn.click(); });
      actions.appendChild(btnImport);
      actions.appendChild(fileIn);

      var btnRow = el('button', 'btn btn-secondary');
      btnRow.type = 'button';
      btnRow.textContent = t('flow.addRow');
      btnRow.addEventListener('click', addRow);
      actions.appendChild(btnRow);

      var btnCol = el('button', 'btn btn-secondary');
      btnCol.type = 'button';
      btnCol.textContent = t('flow.addCol');
      btnCol.addEventListener('click', addCol);
      actions.appendChild(btnCol);

      if (nCond || cols.length) {
        var clearBtn = el('button', 'btn btn-secondary');
        clearBtn.type = 'button';
        clearBtn.textContent = t('flow.clear');
        clearBtn.addEventListener('click', function () {
          if (!window.confirm('Clear entire stimlist?')) return;
          loop.conditions = [];
          loop.conditionsFile = '';
          emitChange();
          render();
        });
        actions.appendChild(clearBtn);
      }
      bar.appendChild(actions);
      panel.appendChild(bar);

      if (!nCond && !cols.length) {
        var empty = el('div', 'cond-empty');
        empty.textContent = t('flow.emptyStimlist');
        panel.appendChild(empty);
        return;
      }

      var wrap = el('div', 'loop-cond-preview-wrap is-wide is-editable');
      var table = document.createElement('table');
      table.className = 'loop-cond-preview is-wide is-editable';

      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      var thIdx = document.createElement('th');
      thIdx.textContent = '#';
      headRow.appendChild(thIdx);
      cols.forEach(function (c) {
        var th = document.createElement('th');
        th.className = 'cond-col-head';
        var headInner = el('div', 'cond-col-head-inner');
        var nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.className = 'cond-col-name';
        nameIn.value = c;
        nameIn.title = 'Column name — use as $' + c + ' in component params';
        nameIn.addEventListener('change', function () {
          var neu = String(nameIn.value || '').trim();
          if (!neu || neu === c) {
            nameIn.value = c;
            return;
          }
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(neu)) {
            alert('Column name must be identifier-like');
            nameIn.value = c;
            return;
          }
          if (cols.indexOf(neu) >= 0) {
            alert('Column already exists: ' + neu);
            nameIn.value = c;
            return;
          }
          loop.conditions.forEach(function (row) {
            if (!row) return;
            row[neu] = row[c];
            delete row[c];
          });
          emitChange();
          render();
        });
        headInner.appendChild(nameIn);
        var delC = document.createElement('button');
        delC.type = 'button';
        delC.className = 'cond-col-del';
        delC.setAttribute('aria-label', 'Delete column ' + c);
        delC.textContent = '\u00d7';
        delC.title = 'Delete column ' + c;
        delC.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!window.confirm('Delete column "' + c + '"?')) return;
          loop.conditions.forEach(function (row) {
            if (row) delete row[c];
          });
          emitChange();
          render();
        });
        headInner.appendChild(delC);
        th.appendChild(headInner);
        headRow.appendChild(th);
      });
      var thAct = document.createElement('th');
      thAct.className = 'cond-row-act-h';
      thAct.textContent = '';
      headRow.appendChild(thAct);
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      if (!nCond) {
        var tr0 = document.createElement('tr');
        var td0 = document.createElement('td');
        td0.colSpan = cols.length + 2;
        td0.className = 'cond-empty-row';
        td0.textContent = t('flow.noRows');
        tr0.appendChild(td0);
        tbody.appendChild(tr0);
      }
      loop.conditions.forEach(function (row, i) {
        if (!row || typeof row !== 'object') row = loop.conditions[i] = {};
        var tr = document.createElement('tr');
        var tdI = document.createElement('td');
        tdI.className = 'cond-row-i';
        tdI.textContent = String(i + 1);
        tr.appendChild(tdI);
        cols.forEach(function (c) {
          var td = document.createElement('td');
          td.className = 'cond-cell';
          var inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'cond-cell-input';
          inp.value = row[c] == null ? '' : String(row[c]);
          inp.setAttribute('aria-label', c + ' row ' + (i + 1));
          inp.addEventListener('input', function () {
            row[c] = inp.value;
            markDirty();
            softRefreshPreview();
          });
          inp.addEventListener('change', function () {
            row[c] = inp.value;
            emitChange();
            softRefreshPreview();
          });
          td.appendChild(inp);
          tr.appendChild(td);
        });
        var tdDel = document.createElement('td');
        tdDel.className = 'cond-row-act';
        var delR = document.createElement('button');
        delR.type = 'button';
        delR.className = 'cond-row-del';
        delR.textContent = '\u00d7';
        delR.title = 'Delete row ' + (i + 1);
        delR.addEventListener('click', function () {
          loop.conditions.splice(i, 1);
          emitChange();
          render();
        });
        tdDel.appendChild(delR);
        tr.appendChild(tdDel);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      panel.appendChild(wrap);
    }

    function renderInspector() {
        var box = document.getElementById('builder-inspector');
        if (!box) return;
        stopComponentPreview();
        box.innerHTML = '';

        // Flow loop properties (stimlist lives under Flow — renderConditionsPanel)
                    if (!selectedComponentId && selectedLoopNode()) {
                      var loop = selectedLoopNode();
                      if (!loop.loopType) loop.loopType = 'sequential';
                      box.appendChild(el('p', 'builder-insp-kind', t('insp.loopKind', { name: escapeHtml(loop.name || 'loop') })));
                      function lfield(label, inputEl) {
                        var wrap = el('label', 'builder-field');
                        wrap.appendChild(el('span', '', label));
                        wrap.appendChild(inputEl);
                        box.appendChild(wrap);
                      }
                      var nameIn = document.createElement('input');
                      nameIn.type = 'text';
                      nameIn.value = loop.name || 'loop';
                      nameIn.addEventListener('change', function () {
                        loop.name = nameIn.value || 'loop';
                        emitChange();
                        renderFlowList();
                        renderConditionsPanel();
                        renderJsonPreview();
                      });
                      lfield(t('insp.name'), nameIn);
                      var repsIn = document.createElement('input');
                      repsIn.type = 'number';
                      repsIn.min = '1';
                      repsIn.max = '9999';
                      repsIn.value = String(loop.nReps || 1);
                      repsIn.addEventListener('change', function () {
                        var v = parseInt(repsIn.value, 10);
                        loop.nReps = isNaN(v) || v < 1 ? 1 : v;
                        emitChange();
                        renderFlowList();
                        renderConditionsPanel();
                        renderJsonPreview();
                      });
                      lfield(t('insp.nReps'), repsIn);
                      var typeIn = document.createElement('select');
                      ['sequential', 'random', 'fullRandom'].forEach(function (t) {
                        var opt = document.createElement('option');
                        opt.value = t;
                        opt.textContent = t;
                        if ((loop.loopType || 'sequential') === t) opt.selected = true;
                        typeIn.appendChild(opt);
                      });
                      typeIn.addEventListener('change', function () {
                        loop.loopType = typeIn.value || 'sequential';
                        emitChange();
                        renderJsonPreview();
                      });
                      lfield(t('insp.loopType'), typeIn);

                      var actions = el('div', 'builder-insp-actions');
                      var unwrapBtn = el('button', 'btn btn-secondary');
                      unwrapBtn.type = 'button';
                      unwrapBtn.textContent = t('flow.unwrap');
                      unwrapBtn.addEventListener('click', function () {
                        var p = selectedFlowPath && selectedFlowPath.length ? selectedFlowPath : (selectedFlowIndex != null ? [selectedFlowIndex] : null);
                      if (p && unwrapLoopAtPath(p)) {
                          render();
                          emitChange();
                        }
                      });
                      actions.appendChild(unwrapBtn);
                      box.appendChild(actions);
                      return;
                    }

        if (!selectedComponentId) {
                var rr = findRoutine(selectedRoutine);
                if (rr) {
                  box.appendChild(el('p', 'builder-insp-kind', t('insp.routineKind', { name: escapeHtml(rr.name || '?') })));
                  var nComp = (rr.components && rr.components.length) || 0;
                  box.appendChild(el('p', 'muted builder-ms-hint',
                    nComp ? t(nComp === 1 ? 'insp.routineCount' : 'insp.routineCountN', { n: nComp })
                          : t('insp.routineEmpty')));
                  var previewHostR = el('div', 'comp-preview-host');
                  box.appendChild(previewHostR);
                  if (nComp) {
                    // anchor on first component; force Whole routine, no focus ring
                    mountComponentPreview(previewHostR, rr.components[0], { routineOnly: true });
                  }
                return;
              }
              box.appendChild(el('p', 'muted', t('insp.selectHint')));
              return;
            }
      var found = findComponent(selectedComponentId);
      if (!found) {
        box.appendChild(el('p', 'muted', t('insp.notFound')));
        return;
      }
      var c = found.component;

      function field(label, key, value, kind) {
              var wrap = el('label', 'builder-field');
              wrap.appendChild(el('span', '', label));
              var input;
              if (kind === 'textarea') {
                input = document.createElement('textarea');
                // text/code: taller default + native bottom-right resize handle
                var isTextParam = key === 'param:text' || key === 'param:code';
                input.rows = isTextParam ? 4 : 3;
                input.value = value == null ? '' : String(value);
                if (isTextParam) {
                  wrap.classList.add('builder-field-text');
                  input.className = 'builder-textarea-resize';
                  input.spellcheck = false;
                }
              } else if (kind === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = !!value;
              } else if (kind === 'number') {
                input = document.createElement('input');
              input.type = 'number';
              input.step = 'any';
              input.value = value == null ? '' : value;
            } else {
              input = document.createElement('input');
              input.type = 'text';
              input.value = value == null ? '' : String(value);
            }
            input.dataset.key = key;
            input.addEventListener('input', function () { applyInspector(c, key, input, kind); });
            input.addEventListener('change', function () { applyInspector(c, key, input, kind); });
            wrap.appendChild(input);
            return wrap;
          }

    box.appendChild(el('h3', '', escapeHtml(c.type) + ' · ' + escapeHtml(c.name)));

            var previewHost = el('div', 'comp-preview-host');
            box.appendChild(previewHost);
            mountComponentPreview(previewHost, c);
            box.appendChild(field(t('insp.name'), 'name', c.name, 'text'));

    // Precise timing — no snap on typed values
    var timing = el('div', 'builder-timing');
    timing.appendChild(el('span', 'builder-timing-label', t('insp.timing')));

    var startWrap = el('label', 'builder-field');
    startWrap.appendChild(el('span', '', t('insp.start')));
    var startIn = document.createElement('input');
    startIn.type = 'number';
    startIn.step = '0.001';
    startIn.min = '0';
    startIn.value = c.start == null ? '0' : String(c.start);
    startIn.addEventListener('change', function () {
      var v = parseFloat(startIn.value);
      if (isNaN(v) || v < 0) v = 0;
      c.start = Math.round(v * 1000) / 1000;
      renderTimeline();
      refreshPreviewIfVisible(c);
      renderJsonPreview();
      emitChange();
    });
    startWrap.appendChild(startIn);
    timing.appendChild(startWrap);

    var durWrap = el('label', 'builder-field');
    durWrap.appendChild(el('span', '', t('insp.duration')));
    var durIn = document.createElement('input');
    durIn.type = 'number';
    durIn.step = '0.001';
    durIn.min = '-1';
    durIn.placeholder = t('insp.durationPh');
    durIn.title = t('insp.durationTitle');
    durIn.value = isOpenDuration(c.duration) ? String(OPEN_DURATION) : String(c.duration);
    durIn.addEventListener('change', function () {
      if (durIn.value === '' || durIn.value == null) {
        c.duration = OPEN_DURATION;
      } else {
        var v = parseFloat(durIn.value);
        if (isNaN(v)) v = 0.5;
        // -1 (or any negative) → open-ended; normalize to OPEN_DURATION
        if (v < 0) c.duration = OPEN_DURATION;
        else c.duration = Math.round(v * 1000) / 1000;
      }
      durIn.value = isOpenDuration(c.duration) ? String(OPEN_DURATION) : String(c.duration);
      renderTimeline();
      refreshPreviewIfVisible(c);
      renderJsonPreview();
      emitChange();
    });
    durWrap.appendChild(durIn);
    timing.appendChild(durWrap);

    // No checkbox — open-ended = enter -1 in Duration
    var durHint = el('p', 'muted builder-duration-hint', t('insp.durationHint'));
    timing.appendChild(durHint);

    var msHint = el('p', 'muted builder-ms-hint', '');
        msHint.hidden = true;
        timing.appendChild(msHint);
    box.appendChild(timing);

    Object.keys(c.params || {}).forEach(function (pk) {
                      var v = c.params[pk];
                      var paramLabels = {
                        text: 'insp.paramText',
                        height: 'insp.paramHeight',
                        color: 'insp.paramColor',
                        keys: 'insp.paramKeys',
                        force_end: 'insp.paramForceEnd',
                        path: c.type === 'video' ? 'insp.paramVideoPath' : 'insp.paramPath',
                        size: 'insp.paramSize',
                        volume: 'insp.paramVolume',
                        phase: 'insp.paramPhase',
                        code: 'insp.paramCode'
                      };
                      var plabel = paramLabels[pk] ? t(paramLabels[pk]) : pk;
                      // color: picker + text + named label (same idea as Display bgcolor)
                      if (pk === 'color') {
                        box.appendChild(colorParamField(plabel, c, v));
                        return;
                      }
                      // text/code always multi-line + resize handle (even short "$word")
                      var kind = typeof v === 'boolean' ? 'checkbox'
                        : (typeof v === 'number' ? 'number'
                          : (pk === 'text' || pk === 'code' || String(v).length > 40 ? 'textarea' : 'text'));
                      box.appendChild(field(plabel, 'param:' + pk, v, kind));
                    });
              }

              function colorParamField(label, c, value) {
                var wrap = el('label', 'builder-field builder-field-color');
                wrap.appendChild(el('span', '', label));
                var row = el('div', 'bg-color-row color-param-row');
                var picker = document.createElement('input');
                picker.type = 'color';
                picker.className = 'bg-color-picker';
                picker.title = (typeof t === 'function' ? t('builder.dispBgPickerTitle') : '') || 'Pick color';
                var text = document.createElement('input');
                text.type = 'text';
                text.className = 'builder-display-select builder-display-select-full bg-color-text';
                text.spellcheck = false;
                text.autocomplete = 'off';
                text.placeholder = 'white / #fff / $col';
                text.title = (typeof t === 'function' ? t('insp.paramColorTitle') : '') ||
                  'Name, #hex, rgb(), or $stimlist column';
                var lab = el('span', 'bg-color-name');
                lab.setAttribute('aria-live', 'polite');

                function isVar(s) {
                  return String(s || '').trim().charAt(0) === '$';
                }
                function syncUI(raw) {
                  var s = String(raw == null ? '' : raw).trim();
                  text.value = s;
                  if (isVar(s)) {
                    picker.disabled = true;
                    text.classList.remove('is-invalid');
                    try { picker.value = '#ffffff'; } catch (e1) {}
                  } else {
                    picker.disabled = false;
                    var hex = normalizeBgcolor(s, { strict: true });
                    if (hex) {
                      text.classList.remove('is-invalid');
                      try { picker.value = hex; } catch (e2) {}
                    } else if (s) {
                      text.classList.add('is-invalid');
                    } else {
                      text.classList.remove('is-invalid');
                    }
                  }
                  setColorNameLabel(lab, s);
                }
                function commit(raw, fromPicker) {
                  var s = String(raw == null ? '' : raw).trim();
                  if (!s) {
                    c.params.color = 'white';
                    syncUI('white');
                    applyInspector(c, 'param:color', { value: 'white' }, 'text');
                    return;
                  }
                  if (isVar(s)) {
                    c.params.color = s;
                    syncUI(s);
                    applyInspector(c, 'param:color', { value: s }, 'text');
                    return;
                  }
                  var stored = preferredColorStore(fromPicker ? picker.value : s, { preferName: true, fallback: s });
                  var hexOk = normalizeBgcolor(stored, { strict: true }) || colorEntryOf(stored);
                  if (!hexOk && !isVar(stored)) {
                    text.classList.add('is-invalid');
                    setColorNameLabel(lab, '');
                    return;
                  }
                  c.params.color = stored;
                  syncUI(stored);
                  applyInspector(c, 'param:color', { value: stored }, 'text');
                }

                syncUI(value == null ? 'white' : value);
                picker.addEventListener('input', function () {
                  var stored = preferredColorStore(picker.value, { preferName: true });
                  text.value = stored;
                  text.classList.remove('is-invalid');
                  setColorNameLabel(lab, stored);
                  c.params.color = stored;
                  renderTimeline();
                  refreshPreviewIfVisible(c);
                  renderJsonPreview();
                  emitChange();
                });
                picker.addEventListener('change', function () {
                  commit(picker.value, true);
                });
                text.addEventListener('input', function () {
                  var s = text.value.trim();
                  if (isVar(s)) {
                    text.classList.remove('is-invalid');
                    picker.disabled = true;
                    setColorNameLabel(lab, s);
                    c.params.color = s;
                    renderTimeline();
                    refreshPreviewIfVisible(c);
                    renderJsonPreview();
                    emitChange();
                    return;
                  }
                  picker.disabled = false;
                  var hex = normalizeBgcolor(s, { strict: true });
                  if (hex) {
                    text.classList.remove('is-invalid');
                    try { picker.value = hex; } catch (e3) {}
                    setColorNameLabel(lab, s);
                    var stored = preferredColorStore(s, { preferName: true, fallback: s });
                    c.params.color = stored;
                    renderTimeline();
                    refreshPreviewIfVisible(c);
                    renderJsonPreview();
                    emitChange();
                  } else if (!s) {
                    text.classList.remove('is-invalid');
                    setColorNameLabel(lab, '');
                  } else {
                    setColorNameLabel(lab, colorEntryOf(s) ? s : '');
                  }
                });
                text.addEventListener('change', function () {
                  commit(text.value, false);
                });

                row.appendChild(picker);
                row.appendChild(text);
                row.appendChild(lab);
                wrap.appendChild(row);
                return wrap;
              }

  function applyInspector(c, key, input, kind) {
    var val;
    if (kind === 'checkbox') val = input.checked;
    else if (kind === 'number') val = input.value === '' ? null : Number(input.value);
    else val = input.value;

    if (key === 'name') c.name = val;
    else if (key === 'start') c.start = val == null ? 0 : val;
    else if (key === 'duration') c.duration = val;
    else if (key.indexOf('param:') === 0) {
      var pk = key.slice(6);
      c.params[pk] = val;
    }
    // light re-render timeline bar + stage preview
    renderTimeline();
    refreshPreviewIfVisible(c);
    renderJsonPreview();
    emitChange();
  }

  function renderJsonPreview() {
    var pre = document.getElementById('builder-json');
    if (!pre) return;
    try {
      pre.textContent = JSON.stringify(design, null, 2);
    } catch (e) {
      pre.textContent = String(e);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function selectComponent(id) {
      selectedComponentId = id;
      clearFlowSelection(); // component focus ≠ flow loop
      render();
    }
    function selectRoutine(name) {
      selectedRoutine = name;
      selectedComponentId = null;
      clearFlowSelection();
      render();
    }

  // Boot when DOM ready

  // ---- builder-part-boot.js ----
  function boot() {
    if (!document.getElementById('builder-palette')) return;
    resetDefault();
    document.addEventListener('keydown', function (e) {
          var tag = (e.target && e.target.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

          // Flow shortcuts (when no component edit in focus)
                              if (!selectedComponentId) {
                                if (e.key === 'Escape' && routineEditMode) {
                                  e.preventDefault();
                                  routineEditMode = false;
                                  render();
                                  return;
                                }
                                if (e.key === 'Escape' && loopDrawArmed) {
                                  e.preventDefault();
                                  loopDrawArmed = false;
                                  render();
                                  return;
                                }
                      if ((e.key === 'l' || e.key === 'L') && Object.keys(selectedFlowIndices).length) {
                        e.preventDefault();
                        if (wrapSelectedFlow() || (selectedFlowIndex != null && wrapFlowRange(selectedFlowIndex, selectedFlowIndex))) {
                          loopDrawArmed = false;
                          render();
                          emitChange();
                        }
                        return;
                      }
                      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFlowIndex != null) {
                        e.preventDefault();
                        var node = design.flow[selectedFlowIndex];
                        if (node && node.kind === 'loop') unwrapLoopAt(selectedFlowIndex);
                        else design.flow.splice(selectedFlowIndex, 1);
                        clearFlowSelection();
                        render();
                        emitChange();
                        return;
                      }
                    }

          if (!selectedComponentId) return;
          var found = findComponent(selectedComponentId);
          if (!found) return;
          var c = found.component;
          var step = e.shiftKey ? 0.1 : 0.05;
          if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      deleteComponentById(found.component.id);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            c.start = roundT(Math.max(0, (Number(c.start) || 0) - step));
            render();
            emitChange();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            c.start = roundT((Number(c.start) || 0) + step);
            render();
            emitChange();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            var d0 = isOpenDuration(c.duration) ? 0.4 : Number(c.duration) || 0.4;
            c.duration = roundT(d0 + step);
            render();
            emitChange();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            var d1 = isOpenDuration(c.duration) ? 0.4 : Number(c.duration) || 0.4;
            c.duration = roundT(Math.max(0.05, d1 - step));
            render();
            emitChange();
          } else if (e.key === 'Escape') {
            selectedComponentId = null;
            clearFlowSelection();
            render();
          }
        });
  }

  window.PsyClawBuilder = {
            getDesign: getDesign,
            setDesign: setDesign,
            resetDefault: resetDefault,
            render: render,
            renderDisplayPanel: renderDisplayPanel,
                        setHostMonitors: setHostMonitors,
                                    getHostMonitors: getHostMonitors,
                                    setHostRefreshHz: setHostRefreshHz,
                                    setHostInputDevices: setHostInputDevices,
                        setHostMics: setHostMics,
                        rebuildDeviceSelects: rebuildDeviceSelects,
                        selectComponent: selectComponent,
            selectRoutine: selectRoutine,
            COMPONENT_TYPES: COMPONENT_TYPES,
            getFileState: getFileState,
            isDirty: isDirty,
            getProjectPath: getProjectPath,
            setProjectPath: setProjectPath,
            markClean: markClean,
            isSnapEnabled: function () { return !!snapEnabled; },
                    setSnapEnabled: function (v) { snapEnabled = !!v; },
                    getSnapMs: function () { return Math.round(SNAP * 1000); },
                    isPreviewOnsetClick: isPreviewOnsetClick,
                    setPreviewOnsetClick: setPreviewOnsetClick,
                  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
