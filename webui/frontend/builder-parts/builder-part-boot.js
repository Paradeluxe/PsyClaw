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
