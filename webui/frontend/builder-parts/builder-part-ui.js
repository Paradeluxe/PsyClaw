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
          var nameHint = defaultLoopName(flowCopy, kids, {
            nested: !!(parentPath && parentPath.length),
          });
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
                                            var gTotal = brInfo.node ? loopTrialCount(brInfo.node) : (gC > 0 ? (gR * gC) : gR);
                                            var reps = el('span', 'flow-bracket-reps', '\u00d7' + gTotal);
                                            reps.title = gC > 0 ? (gR + ' reps \u00d7 rows/weights = ' + gTotal + ' trials') : (gR + ' reps');
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
                        var totalTrials = b.node ? loopTrialCount(b.node) : (nC > 0 ? (nR * nC) : nR);
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
                          ? ((b.node && String(b.node.loopType || '').toLowerCase() === 'weighted')
                              ? (nR + ' reps \u00d7 sum(weight) = ' + totalTrials + ' trials')
                              : (nR + ' reps \u00d7 ' + nC + ' rows = ' + totalTrials + ' trials'))
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


