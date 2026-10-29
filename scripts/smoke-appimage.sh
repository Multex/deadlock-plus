#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC2317 # Invoked by the EXIT trap.
cleanup() {
    if [[ -n "$app_pid" ]]; then
        kill -TERM -- "-$app_pid" 2> /dev/null || true
        sleep 1
        kill -KILL -- "-$app_pid" 2> /dev/null || true
        wait "$app_pid" 2> /dev/null || true
    fi
    if [[ -d "$XDG_DATA_HOME/app.deadlockplus/logs" ]]; then
        cp -a "$XDG_DATA_HOME/app.deadlockplus/logs" "$results/logs"
    fi
    rm -rf "$workdir"
}

unset LD_PRELOAD LD_LIBRARY_PATH APPDIR APPIMAGE WAYLAND_DISPLAY
if [[ "${1:-}" != --display ]]; then
    exec dbus-run-session -- xvfb-run -a -s '-screen 0 1600x1000x24' bash "$0" --display "$@"
fi
shift

appimage="$(realpath "${1:?Usage: smoke-appimage.sh <AppImage> <results-directory>}")"
mkdir -p "${2:?Results directory required}"
results="$(realpath "$2")"
workdir="$(mktemp -d)"
app_pid=""
export XDG_DATA_HOME="$workdir/data" XDG_CONFIG_HOME="$workdir/config" XDG_CACHE_HOME="$workdir/cache"
export XDG_RUNTIME_DIR="$workdir/runtime"
mkdir -m 700 "$XDG_RUNTIME_DIR"

trap 'cleanup' EXIT

cd "$workdir"
"$appimage" --appimage-extract > "$results/extract.log"
setsid "$workdir/squashfs-root/AppRun" > "$results/process.log" 2>&1 &
app_pid=$!
log="$XDG_DATA_HOME/app.deadlockplus/logs/latest.log"

for ((attempt = 0; attempt < 45; attempt++)); do
    if ! kill -0 "$app_pid" 2> /dev/null; then
        break
    fi
    window="$(xwininfo -root -tree | awk '/"Deadlock\+"/ { print $1; exit }')"
    # This command is sent by the frontend; a native window alone can still be blank.
    if [[ -n "$window" ]] && grep -q 'close to tray \(enabled\|disabled\)' "$log" 2> /dev/null; then
        sleep 2
        if kill -0 "$app_pid" 2> /dev/null && xwininfo -id "$window" | grep -q 'Map State: IsViewable'; then
            import -window "$window" "$results/window.png"
            colors="$(identify -format '%k' "$results/window.png")"
            if ((colors > 16)); then
                echo "AppImage frontend started and rendered without LD_PRELOAD."
                exit 0
            fi
        fi
    fi
    sleep 1
done

import -window root "$results/failure.png" || true
echo "AppImage did not start a visible, rendered frontend." >&2
cat "$results/process.log" >&2
if [[ -f "$log" ]]; then tail -n 40 "$log" >&2; fi
exit 1
