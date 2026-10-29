#!/usr/bin/env bash
set -euo pipefail

appimage="$(realpath "${1:?Usage: check-appimage.sh <AppImage>}")"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

cd "$workdir"
"$appimage" --appimage-extract > /dev/null

# Host Mesa needs the host's Wayland client, including symbols absent on the build runner.
bundled="$(find squashfs-root -name 'libwayland-client.so*' -print)"
if [[ -n "$bundled" ]]; then
    printf 'AppImage must use the host Wayland client; found:\n%s\n' "$bundled" >&2
    exit 1
fi

echo "AppImage contains no bundled Wayland client."
