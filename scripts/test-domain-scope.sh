#!/bin/sh
# Compiles the iOS plugin's pure domain-pinning rules with the checks beside them and runs them,
# including the Public Suffix vectors every platform passes (shared/public-suffix).
# Needs only swiftc (Xcode command line tools).
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
plugin="$root/src-tauri/plugins/tauri-plugin-siteview/ios"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

swiftc -o "$out/domain-scope-check" \
  "$plugin/Sources/DomainScope.swift" \
  "$plugin/Sources/PublicSuffix.swift" \
  "$plugin/Sources/PublicSuffixRules.swift" \
  "$plugin/Tests/DomainScopeCheck/main.swift"
"$out/domain-scope-check" "$root/shared/public-suffix"
