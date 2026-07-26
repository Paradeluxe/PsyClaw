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
      if ((loop.loopType || '') === 'weighted') {
        ensureWeightColumn(loop);
        // weight first when active
        if (cols.indexOf('weight') < 0) {
          cols = ['weight'].concat(cols);
        } else if (cols.indexOf('weight') > 0) {
          cols = ['weight'].concat(cols.filter(function (c) { return c !== 'weight'; }));
        }
      } else {
        // Hide weight UI outside weighted; keep row.weight in data if present
        cols = cols.filter(function (c) { return c !== 'weight'; });
      }
      // size attr floors only; widths via <colgroup>
      var colCh = condColCharWidths(cols, conditions);

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
                    trials: loopTrialCount(loop)
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
        if (name === 'weight' && (loop.loopType || '') !== 'weighted') {
          alert(t('flow.weightNameReserved') || 'Column name "weight" is reserved for loopType=weighted');
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

      // Fixed layout colgroup: # + weight(optional) fixed; text cols share rest; act fixed
      var colgroup = document.createElement('colgroup');
      var colIdx = document.createElement('col');
      colIdx.className = 'cond-col-idx';
      colgroup.appendChild(colIdx);
      cols.forEach(function (c) {
        var col = document.createElement('col');
        col.className = c === 'weight' ? 'cond-col-weight' : 'cond-col-data';
        colgroup.appendChild(col);
      });
      var colAct = document.createElement('col');
      colAct.className = 'cond-col-act';
      colgroup.appendChild(colAct);
      table.appendChild(colgroup);

      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      var thIdx = document.createElement('th');
      thIdx.textContent = '#';
      headRow.appendChild(thIdx);
      cols.forEach(function (c) {
        var th = document.createElement('th');
        th.className = 'cond-col-head' + (c === 'weight' ? ' is-locked-col' : '');
        var headInner = el('div', 'cond-col-head-inner');
        var nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.className = 'cond-col-name';
        nameIn.value = c;
        var isWeightCol = (c === 'weight');
        if (isWeightCol) {
          nameIn.readOnly = true;
          nameIn.classList.add('is-locked');
          nameIn.title = t('flow.weightColLocked') || 'weight — required for loopType=weighted (cannot rename or delete)';
        } else {
          nameIn.title = 'Column name — use as $' + c + ' in component params';
          nameIn.addEventListener('change', function () {
            var neu = String(nameIn.value || '').trim();
            if (!neu || neu === c) {
              nameIn.value = c;
              return;
            }
            if (neu === 'weight') {
              alert(t('flow.weightNameReserved') || 'Column name "weight" is reserved');
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
          nameIn.addEventListener('input', function () {
            growInputToContent(nameIn, colCh[c] || 4);
          });
        }
        applyContentChWidth(nameIn, colCh[c] || 4);
        headInner.appendChild(nameIn);
        if (!isWeightCol) {
          var delC = document.createElement('button');
          delC.type = 'button';
          delC.className = 'cond-col-del';
          delC.setAttribute('aria-label', 'Delete column ' + c);
          delC.textContent = '\u00d7';
          delC.title = 'Delete column ' + c;
          delC.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (c === 'weight') return;
            if (!window.confirm('Delete column "' + c + '"?')) return;
            loop.conditions.forEach(function (row) {
              if (row) delete row[c];
            });
            emitChange();
            render();
          });
          headInner.appendChild(delC);
        } else {
          var lockMark = el('span', 'cond-col-lock', '\u00b7');
          lockMark.title = t('flow.weightColLocked') || 'weight column locked';
          lockMark.setAttribute('aria-hidden', 'true');
          headInner.appendChild(lockMark);
        }
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
          td.className = 'cond-cell' + (c === 'weight' ? ' cond-cell-weight' : '');
          var inp = document.createElement('input');
          var isWeight = (c === 'weight');
          inp.type = isWeight ? 'number' : 'text';
          if (isWeight) {
            inp.min = '0';
            inp.step = '1';
            inp.className = 'cond-cell-input cond-weight-input';
          } else {
            inp.className = 'cond-cell-input';
          }
          inp.value = row[c] == null ? '' : String(row[c]);
          inp.setAttribute('aria-label', c + ' row ' + (i + 1));
          applyContentChWidth(inp, colCh[c] || (isWeight ? 3 : 4));
          if (isWeight) inp.title = t('flow.weightHint') || 'Copies of this row in the bag (loopType=weighted)';
          inp.addEventListener('input', function () {
            if (isWeight) {
              var v = parseInt(inp.value, 10);
              row[c] = isNaN(v) || v < 0 ? 0 : v;
            } else {
              row[c] = inp.value;
            }
            growInputToContent(inp, colCh[c] || (isWeight ? 3 : 4));
            markDirty();
            softRefreshPreview();
          });
          inp.addEventListener('change', function () {
            if (isWeight) {
              var v = parseInt(inp.value, 10);
              row[c] = isNaN(v) || v < 0 ? 0 : v;
              inp.value = String(row[c]);
              emitChange();
              renderConditionsPanel();
              renderFlowList();
            } else {
              row[c] = inp.value;
              emitChange();
              softRefreshPreview();
            }
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
                      ['sequential', 'random', 'fullRandom', 'weighted'].forEach(function (lt) {
                        var opt = document.createElement('option');
                        opt.value = lt;
                        opt.textContent = lt === 'weighted' ? (t('insp.loopTypeWeighted') || 'weighted') : lt;
                        if ((loop.loopType || 'sequential') === lt) opt.selected = true;
                        typeIn.appendChild(opt);
                      });
                      typeIn.addEventListener('change', function () {
                        loop.loopType = typeIn.value || 'sequential';
                        if (loop.loopType === 'weighted') ensureWeightColumn(loop);
                        emitChange();
                        renderConditionsPanel();
                        renderFlowList();
                        renderJsonPreview();
                      });
                      lfield(t('insp.loopType'), typeIn);
                      if ((loop.loopType || '') === 'weighted') {
                        box.appendChild(el('p', 'muted builder-ms-hint', t('insp.weightedHint')));
                      }

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
