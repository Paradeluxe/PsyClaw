/* psyclaw-webui — Run tab (roster / instrument / Start·Pilot·Autopilot)
 * Loaded before app.js. Exposes window.PsyClawRun.
 */
(function () {
  'use strict';

  function t(key, vars) {
    return (window.PsyClawI18n && window.PsyClawI18n.t)
      ? window.PsyClawI18n.t(key, vars)
      : (window.t ? window.t(key, vars) : key);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wireRunTab() {
      var startBtn = document.getElementById('start-run-btn');
      var stopBtn = document.getElementById('stop-run-btn');
      var downloadBtn = document.getElementById('download-csv-btn');
      var downloadPackBtn = document.getElementById('download-pack-btn');
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
            var lastTerminalStatus = null;
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

            /** Best empirical proof from roster: Start > Pilot > Autopilot (normal end only). */
            function computeLastProvenFromEntries(entries) {
              var rank = { run: 3, pilot: 2, autopilot: 1 };
              var best = null;
              var bestR = 0;
              (entries || []).forEach(function (e) {
                if (!e) return;
                var end = normalizeEndStatus(e.end_status);
                if (end !== 'normal') return;
                var m = normalizeRunMode(e.mode);
                var r = rank[m] || 0;
                if (r > bestR) {
                  bestR = r;
                  best = m;
                }
              });
              return best;
            }

            function pushLastProven(modeOrNull) {
              try {
                if (window.PsyClawSystem && typeof window.PsyClawSystem.setLastProven === 'function') {
                  window.PsyClawSystem.setLastProven(modeOrNull);
                }
              } catch (eLP) { /* ignore */ }
            }

            function isAiExperimenter(name) {
              var s = String(name || '').trim();
              if (!s) return false;
              var low = s.toLowerCase();
              return (
                s === 'PsyClaw AI' ||
                s === 'PsyClaw AI' ||
                s === 'PsyClaw-AI' ||
                s === 'AI assistant' ||
                s === 'AI助手' ||
                (low.indexOf('psyclaw') >= 0 && low.indexOf('ai') >= 0)
              );
            }

            /** Roster / session: label + small robot when AI experimenter */
            function formatExperimenterCell(name) {
              var s = String(name || '').trim();
              if (!s) return escHtml('—');
              if (!isAiExperimenter(s)) return escHtml(s);
              var label = 'PsyClaw AI';
              return (
                '<span class="run-exp-ai" title="' + escHtml(label) + '">' +
                  '<span class="run-exp-ai-label">' + escHtml(label) + '</span>' +
                  '<span class="run-exp-ai-icon" aria-hidden="true">' +
                    '<svg class="run-exp-robot" viewBox="0 0 16 16" width="18" height="18" focusable="false">' +
                      '<rect x="4" y="5" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/>' +
                      '<rect x="6.5" y="2" width="3" height="3" rx="0.6" fill="currentColor"/>' +
                      '<circle cx="6.5" cy="8" r="1" fill="currentColor"/>' +
                      '<circle cx="9.5" cy="8" r="1" fill="currentColor"/>' +
                      '<path d="M3 8h1.2M11.8 8H13" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
                      '<path d="M6 12.5h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
                    '</svg>' +
                  '</span>' +
                '</span>'
              );
            }

            function formatRunMode(m) {
              var n = normalizeRunMode(m);
              if (n === 'pilot') return t('run.modePilot');
              if (n === 'autopilot') return t('run.modeAutopilot');
              return t('run.modeRun');
            }

            function statusLabel(status) {
              var map = {
                starting: 'run.statusStarting',
                compiling: 'run.statusCompiling',
                compiled: 'run.statusCompiling',
                running: 'run.statusRunning',
                stopped: 'run.statusStopped',
                failed: 'run.statusFailed',
                finished: 'run.statusFinished',
                error: 'run.statusFailed',
              };
              var key = map[status];
              if (!key) return String(status || '—');
              try {
                var loc = t(key);
                if (loc && loc !== key) return loc;
              } catch (eSL) { /* fall */ }
              return String(status || '—');
            }

            function formatFlightStatus(mode, status) {
              return formatRunMode(mode || 'participant') + ' · ' + statusLabel(status);
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
                                                  // Badge empirical ladder (Start > Pilot > Autopilot)
                                                  try {
                                                    if (!data) pushLastProven(null);
                                                    else pushLastProven(computeLastProvenFromEntries(used));
                                                  } catch (eProv) { /* ignore */ }
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
                                                      '<td class="run-roster-exp">' + formatExperimenterCell(e.experimenter) + '</td>' +
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
                            pushLastProven(null);
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
        if (expEl) {
          if (typeof isAiExperimenter === 'function' && isAiExperimenter(sess.experimenter)) {
            expEl.innerHTML = formatExperimenterCell(sess.experimenter);
          } else {
            expEl.textContent = sess.experimenter || '—';
          }
        }
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
        var running = (status === 'running' || status === 'starting' || status === 'compiling' || status === 'compiled');
        var idleish = !status || status === 'idle' || status === 'ready' || status === 'ready to compile';
        var terminal = (status === 'finished' || status === 'failed' || status === 'stopped' || status === 'error');
        if (terminal) lastTerminalStatus = status;
        if (running) lastTerminalStatus = null;
        if (idleish && !running) {
          statusBadge.removeAttribute('data-flight');
          statusBadge.removeAttribute('data-run-status');
          try {
            if (window.PsyClawSystem && typeof window.PsyClawSystem.paintRunGate === 'function') {
              window.PsyClawSystem.paintRunGate();
            } else {
              statusBadge.textContent = status || '—';
              statusBadge.className = 'status-badge status-idle';
            }
          } catch (eG) {
            statusBadge.textContent = status || '—';
            statusBadge.className = 'status-badge status-idle';
          }
        } else {
          statusBadge.setAttribute('data-flight', running ? '1' : '0');
          statusBadge.setAttribute('data-run-status', status || '');
          var modeNorm = normalizeRunMode(lastArmMode || 'participant');
          statusBadge.textContent = formatFlightStatus(lastArmMode, status);
          statusBadge.className = 'status-badge status-' + status + ' mode-' + modeNorm;
          statusBadge.title = statusBadge.textContent;
        }
        // After finished/stopped/failed: Start re-enabled (no Reset button)
        startBtn.disabled = running;
                var pilotBtn = document.getElementById('pilot-run-btn');
                if (pilotBtn) pilotBtn.disabled = running;
                var autopilotBtn = document.getElementById('autopilot-run-btn');
                if (autopilotBtn) autopilotBtn.disabled = running;
                stopBtn.disabled = (!running);
        // Downloads follow last finished terminal, not idle badge after paintRunGate.
        var dlOk = (!running && lastTerminalStatus === 'finished');
        if (downloadBtn) downloadBtn.disabled = !dlOk;
        if (downloadPackBtn) downloadPackBtn.disabled = !dlOk;
        if (!running && status && !idleish) {
          statusBadge.setAttribute('data-flight', '0');
        }
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
                                                  // Empirical proof for badge (only normal finish)
                                                  try {
                                                    var finMode = normalizeRunMode(
                                                      (d.instrument && d.instrument.mode) ||
                                                      (d.spec && d.spec.mode) ||
                                                      lastArmMode ||
                                                      'participant'
                                                    );
                                                    var curP = null;
                                                    try {
                                                      if (window.PsyClawSystem && window.PsyClawSystem.getLastProven) {
                                                        curP = window.PsyClawSystem.getLastProven();
                                                      }
                                                    } catch (eGP) { curP = null; }
                                                    var rank = { run: 3, pilot: 2, autopilot: 1 };
                                                    if (!curP || (rank[finMode] || 0) >= (rank[curP] || 0)) {
                                                      pushLastProven(finMode);
                                                    }
                                                  } catch (eFinP) { /* ignore */ }
                                                  var dataHint = '';
                                                  if (d.instrument) {
                                                    var csvFull = d.instrument.csv_project || d.instrument.csv || '';
                                                    if (csvFull) {
                                                      var slash = Math.max(csvFull.lastIndexOf('/'), csvFull.lastIndexOf('\\'));
                                                      var dataDirHint = slash >= 0 ? csvFull.slice(0, slash) : csvFull;
                                                      dataHint = dataDirHint;
                                                    }
                                                  }
                                                  if (dataHint) {
                                                    appendLog('SUCCESS', t('run.dataReady', { dir: dataHint }));
                                                  } else {
                                                    appendLog('SUCCESS', t('run.dataReadyGeneric'));
                                                  }
                                                  // production run: auto next free ID; pilot/autopilot: roster only
                                                  if (lastArmMode === 'pilot' || lastArmMode === 'autopilot') {
                                                    refreshParticipantSuggest({ assignNext: false });
                                                  } else {
                                                    goNextParticipant();
                                                  }
                                                  // Normal finish → restore idle Last status: Mode (proven already pushed).
                                                  setStatus('idle');
                                                } else {
                                                  // stopped (ESC / Stop) or failed — keep ID, show mode · terminal (no proven lift)
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
                  // Agent/smoke path — always record experimenter as PsyClaw AI
                  session.experimenter = 'PsyClaw AI';
                  if (elExp) elExp.value = 'PsyClaw AI';
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
                var a = document.createElement('a');
                a.href = '/api/runs/' + currentRunId + '/data/trials.csv';
                a.setAttribute('download', '');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              });
            }
            if (downloadPackBtn) {
              downloadPackBtn.addEventListener('click', function () {
                if (!currentRunId) return;
                var a = document.createElement('a');
                a.href = '/api/runs/' + currentRunId + '/data-pack.zip';
                a.setAttribute('download', '');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              });
            }

            setStatus('idle');
            if (runProgress) runProgress.textContent = '0%';
          }

  window.PsyClawRun = {
    wire: wireRunTab,
  };
})();
