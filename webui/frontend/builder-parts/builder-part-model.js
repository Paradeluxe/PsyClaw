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



  /** Sanitize one path segment for loop names (readable, no codes). */
  function slugLoopStem(s) {
    var t = String(s || '')
      .trim()
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    // drop empty / pure numeric stems (not meaningful)
    if (!t || /^[0-9]+$/.test(t)) return '';
    // strip leading loop_ if user pasted full name
    if (t.indexOf('loop_') === 0) t = t.slice(5).replace(/^_+/, '');
    // refuse opaque code-like tails: single letter + digits (b1, a2)
    if (/^[a-z][0-9]+$/.test(t)) return '';
    return t.slice(0, 48);
  }

  function collectLoopNames(nodes, out) {
    out = out || [];
    (nodes || []).forEach(function (n) {
      if (!n) return;
      if (n.kind === 'loop') {
        out.push(String(n.name || ''));
        collectLoopNames(n.children, out);
      } else if (n.children) {
        collectLoopNames(n.children, out);
      }
    });
    return out;
  }

  /**
   * Default loop.name: always loop_<readable>.
   * stem from child routine(s); nested → loop_nested_*;
   * clash → _copy / _followup / _extra (no b1 / x2 codes).
   */
  function defaultLoopName(flowRoot, children, opts) {
    opts = opts || {};
    var nested = !!opts.nested;
    var forced = opts.name != null && String(opts.name).trim() !== '' ? String(opts.name).trim() : '';
    var stem = '';
    if (forced) {
      stem = slugLoopStem(forced);
    } else {
      var names = [];
      function firstRoutine(node, depth) {
        if (!node || depth > 8) return;
        if (node.routine) {
          names.push(String(node.routine));
          return;
        }
        if (node.kind === 'loop' && node.children) {
          for (var i = 0; i < node.children.length && names.length < 2; i++) {
            firstRoutine(node.children[i], depth + 1);
          }
        }
      }
      (children || []).forEach(function (ch) { firstRoutine(ch, 0); });
      if (names.length === 1) {
        stem = slugLoopStem(names[0]);
      } else if (names.length >= 2) {
        var a = slugLoopStem(names[0]);
        var b = slugLoopStem(names[1]);
        stem = [a, b].filter(Boolean).join('_');
      }
      if (!stem) stem = nested ? 'nested' : 'main';
      // practice keyword in routine → prefer practice
      var blob = names.join(' ').toLowerCase();
      if (!forced && /practice|prac|练习|練習/.test(blob)) stem = 'practice';
    }
    if (!stem) stem = nested ? 'nested' : 'main';
    if (nested && stem !== 'nested' && stem.indexOf('nested_') !== 0 && stem !== 'practice') {
      stem = 'nested_' + stem;
    }
    var base = 'loop_' + stem;
    var used = {};
    collectLoopNames(flowRoot || [], []).forEach(function (n) {
      used[String(n).toLowerCase()] = true;
    });
    if (!used[base.toLowerCase()]) return base;
    // readable clash suffixes — words, not b1/a2
    var suffixes = ['copy', 'followup', 'extra', 'alt', 'more'];
    var i, cand;
    for (i = 0; i < suffixes.length; i++) {
      cand = base + '_' + suffixes[i];
      if (!used[cand.toLowerCase()]) return cand;
    }
    cand = base + '_copy_again';
    if (!used[cand.toLowerCase()]) return cand;
    var n = 2;
    while (used[(base + '_copy_again_' + n).toLowerCase()]) n++;
    return base + '_copy_again_' + n;
  }


  /** Stimlist row weight for loopType=weighted. Missing/invalid → 1; negative → 0. */
  function rowWeight(row) {
    if (!row || typeof row !== 'object') return 1;
    if (row.weight === undefined || row.weight === null || row.weight === '') return 1;
    var n = Number(row.weight);
    if (!isFinite(n)) return 1;
    n = Math.floor(n);
    if (n < 0) return 0;
    return n;
  }

  /** Total trials a loop expands to (matches design_compiler). */
  function loopTrialCount(loop) {
    if (!loop) return 1;
    var nR = Number(loop.nReps);
    if (!isFinite(nR) || nR < 1) nR = 1;
    nR = Math.floor(nR);
    var conds = loop.conditions;
    if (!Array.isArray(conds) || !conds.length) return nR;
    var lt = String(loop.loopType || 'sequential').toLowerCase().replace(/[_-]/g, '');
    if (lt === 'weighted' || lt === 'weightedrandom' || lt === 'proportion' || lt === 'proportional') {
      var sum = 0;
      for (var i = 0; i < conds.length; i++) sum += rowWeight(conds[i]);
      return nR * sum;
    }
    return nR * conds.length;
  }

  /** Ensure every conditions row has weight when loopType is weighted. */
  function ensureWeightColumn(loop) {
    if (!loop) return;
    if (!Array.isArray(loop.conditions)) loop.conditions = [];
    loop.conditions.forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      if (row.weight === undefined || row.weight === null || row.weight === '') row.weight = 1;
    });
  }

  /**
   * Word-like preferred column width (ch): max of header + cell text lengths.
   * Floor/ceiling keep weight compact and long text from blowing the panel.
   */
  function condColCharWidths(cols, conditions) {
    var out = {};
    (cols || []).forEach(function (c) {
      var m = String(c || '').length;
      (conditions || []).forEach(function (row) {
        if (!row || typeof row !== 'object') return;
        var s = row[c] == null ? '' : String(row[c]);
        if (s.length > m) m = s.length;
      });
      var floor = c === 'weight' ? 3 : 4;
      var pad = c === 'weight' ? 1 : 2;
      out[c] = Math.min(56, Math.max(floor, m + pad));
    });
    return out;
  }

  function applyContentChWidth(el, ch) {
    if (!el) return;
    var n = Math.max(1, Math.min(56, Math.floor(Number(ch) || 4)));
    // Under table-layout:fixed, only size/attr matter — never force minWidth
    // that steals free space into one column.
    el.style.width = '100%';
    el.style.minWidth = '0';
    el.setAttribute('size', String(n));
    el.dataset.contentCh = String(n);
  }

  /** Keep size attr in sync while typing; width stays 100% of cell. */
  function growInputToContent(inp, floorCh) {
    if (!inp) return;
    var floor = Math.max(1, Math.floor(Number(floorCh) || 4));
    var need = Math.min(56, Math.max(floor, String(inp.value || '').length + 2));
    applyContentChWidth(inp, need);
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

