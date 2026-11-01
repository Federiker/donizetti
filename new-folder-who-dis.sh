#!/usr/bin/env bash
# The first command after cloning Donizetti: installs the tools and the platform's Tauri prerequisites,
# runs every CI check and makes a debug build of the demo app.
# Safe to run again: each step skips or quickly repeats what is already done. Bash only; on Windows run
# it from Git Bash. See the README, "Develop".
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Usage: ./new-folder-who-dis.sh [--skip-ci]

Sets up this clone of Donizetti from nothing to a tested debug build, in order:
  1. scripts/install.sh: mise, rustup, the pinned Rust toolchain and tools,
     the Git LFS files, the Bun packages and the Git hooks
  2. the Tauri prerequisites (Windows: C++ Build Tools, Windows SDK and
     WebView2, with winget; Debian/Ubuntu: the WebKitGTK packages, with apt;
     macOS: the Xcode command-line tools)
  3. .env from .env.example, if there is no .env yet (never overwritten; only
     releasing needs what goes in it)
  4. the Playwright browser the E2E tests use, a download of about 300 MB
     unless it is already there (mise run e2e:browser)
  5. every CI check (mise run ci): checks, types, both coverage gates, E2E
     and the demo app's frontend build
  6. a debug build of the demo app, without installers (tauri build
     --debug --no-bundle): target/debug/donizetti_app

Every step is safe to repeat: after a failure, fix what it reports and run
the script again. A first run takes a long while (downloads, then compiling
the Rust workspace several times over).

Options:
  --skip-ci  leave out step 5 (the debug build still runs)
  --help     show this help
EOF
}

skip_ci=false
for option in "$@"; do
  case "$option" in
    --skip-ci) skip_ci=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $option" >&2
      echo "Run ./new-folder-who-dis.sh --help for the options." >&2
      exit 2
      ;;
  esac
done

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) platform=windows ;;
  Darwin) platform=macos ;;
  Linux) platform=linux ;;
  *)
    echo "Unsupported system: $(uname -s). Donizetti builds on Windows (Git Bash), macOS and Linux." >&2
    exit 1
    ;;
esac

started=$SECONDS
current_step=""
summary=()

elapsed() {
  local seconds=$1
  printf '%dm %02ds' $((seconds / 60)) $((seconds % 60))
}

on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "$current_step" ]; then
    echo >&2
    echo "Setup stopped at step \"$current_step\" (exit status $status), after $(elapsed $((SECONDS - started)))." >&2
    echo "Fix what the step reports above, then run ./new-folder-who-dis.sh again:" >&2
    echo "the steps already done are safe to repeat and finish quickly." >&2
  fi
}
trap on_exit EXIT

# step <title> <function>: runs one step under a heading and records how long it took.
step() {
  local title=$1 run=$2 step_started=$SECONDS
  current_step=$title
  echo
  echo "==> $title"
  "$run"
  local line
  line="$(printf '%-34s %s' "$title" "$(elapsed $((SECONDS - step_started)))")"
  summary+=("$line")
  echo "--> $title: done in $(elapsed $((SECONDS - step_started)))"
  current_step=""
}

skipped() {
  summary+=("$(printf '%-34s %s' "$1" "skipped ($2)")")
  echo
  echo "==> $1: skipped ($2)"
}

# winget, cmd and reg take Windows-style arguments: keep Git Bash from rewriting them as paths.
windows_command() {
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' "$@"
}

winget_install() {
  windows_command winget install --id "$@" --exact --accept-source-agreements --accept-package-agreements
}

# Tools installed in step 1 are not on this shell's PATH yet: add the places the install scripts put
# them, and on Windows the user and machine PATH as a new terminal would read them.
refresh_path() {
  local directory
  for directory in "$HOME/.local/bin" "$HOME/.cargo/bin"; do
    [ -d "$directory" ] && PATH="$directory:$PATH"
  done
  if [ "$platform" = windows ]; then
    local local_app_data user_profile registry_path
    local_app_data="$(cygpath -u "${LOCALAPPDATA:-$USERPROFILE/AppData/Local}")"
    user_profile="$(cygpath -u "$USERPROFILE")"
    [ -d "$user_profile/.cargo/bin" ] && PATH="$user_profile/.cargo/bin:$PATH"
    [ -d "$local_app_data/Microsoft/WinGet/Links" ] && PATH="$local_app_data/Microsoft/WinGet/Links:$PATH"
    for directory in "$local_app_data"/Microsoft/WinGet/Packages/jdx.mise_*/mise/bin; do
      [ -d "$directory" ] && PATH="$directory:$PATH"
    done
    registry_path="$(powershell.exe -NoProfile -Command \
      "[Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')" \
      | tr -d '\r')" || registry_path=""
    if [ -n "$registry_path" ]; then
      PATH="$PATH:$(cygpath -u -p "$registry_path")"
    fi
  fi
  export PATH
}

install_tools() {
  bash scripts/install.sh
  refresh_path
  local tool
  for tool in mise rustup git; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "$tool was installed, but this shell cannot find it: open a new terminal and run this script again." >&2
      return 1
    fi
  done
}

# Windows: MSVC (vswhere), the Windows 10/11 SDK and the WebView2 runtime.
windows_prerequisites() {
  local program_files_x86 vswhere has_msvc=false has_sdk=false has_webview=false
  # CSIDL 42: Program Files (x86).
  program_files_x86="$(cygpath -u -F 42 2>/dev/null)" || program_files_x86=""
  [ -d "$program_files_x86" ] || program_files_x86="/c/Program Files (x86)"
  vswhere="$program_files_x86/Microsoft Visual Studio/Installer/vswhere.exe"

  if [ -x "$vswhere" ] && [ -n "$("$vswhere" -products '*' -latest \
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | tr -d '\r')" ]; then
    has_msvc=true
  fi
  local kits_root
  kits_root="$(windows_command reg query 'HKLM\SOFTWARE\Microsoft\Windows Kits\Installed Roots' /v KitsRoot10 2>/dev/null \
    | tr -d '\r' | sed -n 's/^ *KitsRoot10 *REG_SZ *//p')" || kits_root=""
  [ -n "$kits_root" ] || kits_root="$program_files_x86/Windows Kits/10"
  local library
  for library in "$(cygpath -u "$kits_root")"/Lib/*/um/x64/kernel32.lib; do
    [ -f "$library" ] && has_sdk=true
  done
  local key
  for key in 'HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' \
    'HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' \
    'HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'; do
    if windows_command reg query "$key" /v pv >/dev/null 2>&1; then
      has_webview=true
    fi
  done
  echo "Microsoft C++ Build Tools: $has_msvc; Windows SDK: $has_sdk; WebView2 runtime: $has_webview"

  if ! command -v winget >/dev/null 2>&1 && { ! $has_msvc || ! $has_sdk || ! $has_webview; }; then
    echo "winget is missing: install what is missing above by hand (README, \"Requirements\"), then run this again." >&2
    return 1
  fi
  if ! $has_msvc; then
    # The C++ workload with its recommended parts brings the Windows SDK too. Visual Studio's installer
    # asks for administrator rights.
    echo "Installing the Visual Studio Build Tools with the C++ workload (a few GB; it asks for administrator rights)..."
    winget_install Microsoft.VisualStudio.BuildTools \
      --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  elif ! $has_sdk; then
    echo "Installing the Windows SDK..."
    winget_install Microsoft.WindowsSDK.10.0.26100
  fi
  if ! $has_webview; then
    echo "Installing the WebView2 runtime..."
    winget_install Microsoft.EdgeWebView2Runtime
  fi
}

# The packages the Checks workflow installs on Ubuntu (.github/workflows/checks.yml).
linux_packages=(libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.1-dev build-essential curl file libssl-dev libxdo-dev)

linux_prerequisites() {
  if ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg-query >/dev/null 2>&1; then
    echo "This is not Debian or Ubuntu: install the Tauri prerequisites for your distribution" >&2
    echo "(https://tauri.app/start/prerequisites/), the equivalents of: ${linux_packages[*]}" >&2
    echo "then run this script again." >&2
    return 1
  fi
  local missing=() package
  for package in "${linux_packages[@]}"; do
    if ! dpkg-query --show --showformat='${db:Status-Status}' "$package" 2>/dev/null | grep -q '^installed$'; then
      missing+=("$package")
    fi
  done
  if [ ${#missing[@]} -eq 0 ]; then
    echo "Every Tauri package is installed."
    return 0
  fi
  echo "Installing with apt (asks for your password): ${missing[*]}"
  sudo apt-get update
  sudo apt-get install --yes "${missing[@]}"
}

macos_prerequisites() {
  if xcode-select -p >/dev/null 2>&1; then
    echo "The Xcode command-line tools are installed: $(xcode-select -p)"
    return 0
  fi
  xcode-select --install || true
  echo "Finish installing the Xcode command-line tools in the window that opened, then run this script again." >&2
  return 1
}

tauri_prerequisites() {
  case "$platform" in
    windows) windows_prerequisites ;;
    linux) linux_prerequisites ;;
    macos) macos_prerequisites ;;
  esac
}

environment_file() {
  if [ -f .env ]; then
    echo ".env already exists: left as it is."
  else
    cp .env.example .env
    echo "Created .env from .env.example; only releasing needs the token that goes in it (see its comments)."
  fi
}

playwright_browser() {
  if [ "$platform" = linux ]; then
    mise run e2e:browser -- --with-deps
  else
    mise run e2e:browser
  fi
}

ci_checks() {
  mise run ci
}

# Without bundling: the installers need extra tools (WiX and NSIS on Windows, which Tauri downloads), and
# the demo app is not released; the program itself is what a developer runs. Tauri's beforeBuildCommand
# builds the frontend, which uses the packages from their sources.
debug_build() {
  mise exec -- bun run --cwd packages/app tauri build --debug --no-bundle
}

step "1. Tools (scripts/install.sh)" install_tools
step "2. Tauri prerequisites" tauri_prerequisites
step "3. .env" environment_file
step "4. Playwright browser" playwright_browser
if $skip_ci; then
  skipped "5. CI checks" "--skip-ci"
else
  step "5. CI checks (mise run ci)" ci_checks
fi
step "6. Debug build of the demo app" debug_build

program="target/debug/donizetti_app"
[ "$platform" = windows ] && program="$program.exe"

echo
echo "Summary"
for line in "${summary[@]}"; do
  echo "  $line"
done
echo "  Total: $(elapsed $((SECONDS - started)))"
echo
echo "Done. The debug demo app is $program; run it with: mise run tauri:dev"
echo "To use the pinned tools in every shell, add mise to it: https://mise.jdx.dev/getting-started.html"
