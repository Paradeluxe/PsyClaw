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

