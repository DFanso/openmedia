#!/bin/sh
# Compiles the iOS plugin's pure domain-pinning rules with the checks beside them and runs them.
# Needs only swiftc (Xcode command line tools).
set -eu

plugin="$(cd "$(dirname "$0")/../src-tauri/plugins/tauri-plugin-siteview/ios" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

swiftc -o "$out/domain-scope-check" \
  "$plugin/Sources/DomainScope.swift" \
  "$plugin/Tests/DomainScopeCheck/main.swift"
"$out/domain-scope-check"
