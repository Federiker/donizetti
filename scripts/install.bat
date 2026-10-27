@echo off
rem Sets up a Windows machine for Donizetti: mise and the pinned tools (mise.toml), Rust through rustup
rem (rust-toolchain.toml), Git LFS files, the Bun packages and the Git hooks. Safe to run again.
rem The Tauri prerequisites (Microsoft C++ Build Tools, Windows SDK, WebView2; README, "Requirements")
rem are not installed here. scripts/install.sh calls this script when run from Git Bash.
setlocal
cd /d "%~dp0.."

where mise >nul 2>nul
if not errorlevel 1 goto :have_mise
echo Installing mise ^(https://mise.jdx.dev^)...
winget install --id jdx.mise --exact --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto :failed
call :refresh_path
where mise >nul 2>nul
if errorlevel 1 goto :not_on_path
:have_mise

where rustup >nul 2>nul
if not errorlevel 1 goto :have_rustup
echo Installing rustup ^(https://rustup.rs^)...
winget install --id Rustlang.Rustup --exact --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto :failed
call :refresh_path
where rustup >nul 2>nul
if errorlevel 1 goto :not_on_path
:have_rustup

echo Installing the Rust toolchain in rust-toolchain.toml...
rustup toolchain install
if errorlevel 1 goto :failed

echo Installing the tools in mise.toml...
mise trust --yes mise.toml
if errorlevel 1 goto :failed
mise install
if errorlevel 1 goto :failed

git lfs version >nul 2>nul
if errorlevel 1 (
  echo Git LFS is missing: install Git for Windows with LFS ^(https://git-lfs.com^), then run this script again.
  goto :failed
)
git lfs install --local --skip-repo
if errorlevel 1 goto :failed
git lfs pull
if errorlevel 1 goto :failed

mise exec -- bun install
if errorlevel 1 goto :failed
if exist lefthook.yml (
  mise exec -- lefthook install
  if errorlevel 1 goto :failed
)

echo.
echo Done. To use the pinned tools in every shell, add mise to it: https://mise.jdx.dev/getting-started.html
exit /b 0

:not_on_path
echo It was installed, but this window cannot find it yet: open a new terminal and run this script again.
goto :failed

:failed
echo Setup stopped: the step above failed.
exit /b 1

rem winget adds new programs to the user PATH, which only new terminals read; read it from the
rem registry (variables expanded) and add it to this window's PATH.
:refresh_path
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path', 'User')"`) do set "PATH=%PATH%;%%P"
exit /b 0
