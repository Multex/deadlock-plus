#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)-$(uname -m)" != Linux-x86_64 ]]; then
    echo "AppImage packaging requires Linux x86_64." >&2
    exit 1
fi

# Tauri's default linuxdeploy predates the exclusion of libwayland-client from AppImages.
version="1-alpha-20251107-1"
sha256="c20cd71e3a4e3b80c3483cef793cda3f4e990aca14014d23c544ca3ce1270b4d"
tools_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"
tool="$tools_dir/linuxdeploy-x86_64.AppImage"
if [[ -f "$tool" ]] && [[ "$(sha256sum "$tool" | cut -d ' ' -f1)" == "$sha256" ]]; then
    exit 0
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
curl --fail --location --retry 3 \
    "https://github.com/linuxdeploy/linuxdeploy/releases/download/$version/linuxdeploy-x86_64.AppImage" \
    --output "$workdir/linuxdeploy.AppImage"
printf '%s  %s\n' "$sha256" "$workdir/linuxdeploy.AppImage" | sha256sum --check
mkdir -p "$tools_dir"
install -m 755 "$workdir/linuxdeploy.AppImage" "$tool"
