#!/usr/bin/env bash
# Start the Deslop MCP server (duplicate-code analysis) for this checkout.
#
# Every agent harness's MCP config points here instead of at a binary, for two reasons.
# The documented binary path embeds the extension version
# (~/.vscode/extensions/nimblesite.deslop-live-<VERSION>-<platform>/...), so a pinned path
# breaks on the next extension update. And `--root .` resolves against whatever directory
# the harness launched from; resolving the root from this file's location does not.
#
# The editor extension's bundled binary wins over one on PATH: the extension and this
# server share .deslop/cache, so they should be the same version.
#
# Written for bash 3.2 — the version macOS ships.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

bundled="$(ls -d \
  "$HOME"/.vscode/extensions/nimblesite.deslop-live-*/bin/*/deslop-mcp \
  "$HOME"/.vscode-insiders/extensions/nimblesite.deslop-live-*/bin/*/deslop-mcp \
  "$HOME"/.cursor/extensions/nimblesite.deslop-live-*/bin/*/deslop-mcp \
  2>/dev/null | sort -V | tail -n 1 || true)"

if [ -n "$bundled" ]; then
  exec "$bundled" --root "$root" "$@"
fi
if command -v deslop-mcp >/dev/null; then
  exec deslop-mcp --root "$root" "$@"
fi

echo "deslop-mcp not found: install the Deslop VS Code extension" \
  "(code --install-extension nimblesite.deslop-live) or brew install nimblesite/tap/deslop" >&2
exit 1
