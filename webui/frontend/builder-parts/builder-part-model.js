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

