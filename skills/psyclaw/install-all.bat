@echo off
setlocal EnableExtensions
echo === PsyClaw monorepo install ===

REM One-shot: clone/update monorepo + webui venv + remember path.
REM Skill install is CLI-specific (printed only; not forced).
REM Usage: install-all.bat [MONOREPO_DIR]
REM   default MONOREPO_DIR = %USERPROFILE%\psyclaw
REM Non-interactive: set PSYCLAW_NONINTERACTIVE=1 (skips final pause)

set "MONOREPO_DIR=%USERPROFILE%\psyclaw"
if not "%~1"=="" set "MONOREPO_DIR=%~1"

REM --- resolve python (prefer a working interpreter; py -3 may point at a broken install) ---
set "PY="
where python >nul 2>&1 && python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul && set "PY=python"
if not defined PY where py >nul 2>&1 && py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul && set "PY=py -3"
if not defined PY where python3 >nul 2>&1 && python3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul && set "PY=python3"
if not defined PY (
  echo ERROR: need a working Python 3.10+ on PATH ^(python / py -3 / python3^).
  echo Tip: if `py -3` is broken, install Python from python.org and ensure `python` works.
  exit /b 1
)
echo Using: %PY%
%PY% -c "import sys; print(sys.version)"

REM --- 1. Clone or update monorepo ---
if exist "%MONOREPO_DIR%\.git" (
  echo Monorepo already exists — updating...
  git -C "%MONOREPO_DIR%" pull
  if errorlevel 1 (
    echo WARNING: git pull failed; continuing with existing tree.
  )
) else (
  echo Cloning Paradeluxe/psyclaw to %MONOREPO_DIR%...
  git clone https://github.com/Paradeluxe/psyclaw.git "%MONOREPO_DIR%"
  if errorlevel 1 (
    echo ERROR: git clone failed.
    exit /b 1
  )
)

if not exist "%MONOREPO_DIR%\webui\start.py" (
  echo ERROR: %MONOREPO_DIR% does not look like Paradeluxe/psyclaw monorepo ^(missing webui\start.py^).
  exit /b 1
)

REM --- 2. Skill install instructions ---
echo.
echo === Skill install ===
echo Skill source: %MONOREPO_DIR%\skills\psyclaw\
echo.
echo Install command depends on your AI CLI:
echo   Hermes:       cd /d "%MONOREPO_DIR%" ^& hermes install Paradeluxe/psyclaw/skills/psyclaw
echo   Claude Code:  xcopy /E /I "%MONOREPO_DIR%\skills\psyclaw" "%%USERPROFILE%%\.claude\skills\psyclaw"
echo   Generic:      Point your agent at %MONOREPO_DIR%\skills\psyclaw\
echo.

REM --- 3. WebUI setup ---
echo === WebUI setup ===
set "WEBUI_DIR=%MONOREPO_DIR%\webui"
cd /d "%WEBUI_DIR%"
if errorlevel 1 (
  echo ERROR: cannot cd to %WEBUI_DIR%
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating Python venv...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo ERROR: python -m venv failed.
    exit /b 1
  )
)

echo Installing Flask dependencies...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR: pip install -r requirements.txt failed.
  exit /b 1
)

echo Remembering webui path...
".venv\Scripts\python.exe" scripts\user_config.py remember
if errorlevel 1 (
  echo WARNING: could not write ~/.psyclaw/config.json webui_root
)

echo.
echo === Install complete ===
echo Monorepo:  %MONOREPO_DIR%
echo WebUI:     %WEBUI_DIR%
echo Start:     cd /d "%WEBUI_DIR%" ^& python start.py
echo   or:      cd /d "%WEBUI_DIR%" ^& start.bat
echo URL:       http://127.0.0.1:8876
echo Config:    %%USERPROFILE%%\.psyclaw\config.json  ^(webui_root^)
echo.
if /i "%PSYCLAW_NONINTERACTIVE%"=="1" exit /b 0
pause
exit /b 0
