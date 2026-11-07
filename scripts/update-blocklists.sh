#!/usr/bin/env bash
# Refreshes the bundled filter lists from their upstream. Run by a developer, never by the app.
set -euo pipefail

cd "$(dirname "$0")/../blocklists"

fetch() {
  local name="$1" url="$2" tmp
  tmp="$(mktemp)"
  curl --fail --silent --show-error --location "$url" --output "$tmp"
  if ! head -n 1 "$tmp" | grep -q '^\[Adblock Plus'; then
    echo "unexpected content from $url" >&2
    rm -f "$tmp"
    exit 1
  fi
  mv "$tmp" "$name"
  grep -m1 '^! Version:' "$name" | sed "s/^/$name /"
}

fetch easylist.txt https://easylist.to/easylist/easylist.txt
fetch easyprivacy.txt https://easylist.to/easylist/easyprivacy.txt
