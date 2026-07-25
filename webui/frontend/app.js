/* psyclaw-webui SPA shell
 *
 * Tabs: Builder · System · Run
 * System → app-system.js (window.PsyClawSystem)
 * Run    → app-run.js    (window.PsyClawRun)
 * This file: tabs, net status, project files, settings, boot.
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
                          if (window.PsyClawSystem && typeof window.PsyClawSystem.refreshHostUI === 'function') {
                            window.PsyClawSystem.refreshHostUI();
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
        if (window.PsyClawSystem) window.PsyClawSystem.wire();
        if (window.PsyClawRun) window.PsyClawRun.wire();
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
