@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Windows entry: prefer repo .venv; else system Python so start.py can bootstrap.
set "VENV_PY=%~dp0.venv\Scripts\python.exe"
set "START_PY=%~dp0start.py"
set "ERR=0"

if exist "%VENV_PY%" (
  "%VENV_PY%" "%START_PY%" %*
  set "ERR=%ERRORLEVEL%"
  goto :after
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
  if %ERRORLEVEL%==0 (
    echo psyclaw-webui: no .venv yet — bootstrapping with system python...
    python "%START_PY%" %*
    set "ERR=%ERRORLEVEL%"
    goto :after
  )
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
  if %ERRORLEVEL%==0 (
    echo psyclaw-webui: no .venv yet — bootstrapping with py -3...
    py -3 "%START_PY%" %*
    set "ERR=%ERRORLEVEL%"
    goto :after
  )
)

echo.
echo psyclaw-webui: need Python 3.10+ on PATH, or create .venv:
echo   python -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
echo Then double-click start.bat again.  See docs\INSTALL.md
set "ERR=1"

:after
if not "%ERR%"=="0" (
  echo.
  echo Failed ^(exit %ERR%^).
  pause
)
exit /b %ERR%
