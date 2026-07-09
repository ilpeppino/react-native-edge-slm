#!/usr/bin/env bash
#
# Secret & private-infrastructure leak gate.
#
# Fails if likely secrets or private hosting identifiers appear in tracked source. This keeps
# credentials and private infrastructure out of the public tree. Run it in CI and before commits.
#
# Usage:  bash scripts/check-no-private-assets.sh
# Exit:   0 = clean, 1 = a forbidden pattern was found.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Generic secret / private-infrastructure patterns (extended regex). Add more as needed.
PATTERNS=(
  'r2\.dev'                              # Cloudflare R2 public bucket URLs
  'r2\.cloudflarestorage\.com'           # Cloudflare R2 S3 endpoints
  '100\.6[4-9]\.[0-9]+\.[0-9]+'          # Tailscale / CGNAT IPs (100.64.0.0/10)
  'AKIA[0-9A-Z]{16}'                     # AWS access key id
  'ghp_[0-9A-Za-z]{36}'                  # GitHub personal access token
  'gho_[0-9A-Za-z]{36}'                  # GitHub OAuth token
  'AIza[0-9A-Za-z_-]{35}'                # Google API key
  'xox[baprs]-[0-9A-Za-z-]{10,}'         # Slack token
  'sk-[A-Za-z0-9]{20,}'                  # OpenAI-style secret key
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'   # PEM private keys
  '_authToken='                          # npm auth token (e.g. in .npmrc)
)

# Paths that never contain committed source (excluded from the scan). This script lists the
# patterns literally, so it must exclude itself.
EXCLUDES=(
  ':(exclude)node_modules/**'
  ':(exclude)**/node_modules/**'
  ':(exclude)**/lib/**'
  ':(exclude)**/build/**'
  ':(exclude)scripts/check-no-private-assets.sh'
)

joined="$(IFS='|'; echo "${PATTERNS[*]}")"

# Scan tracked files only.
if matches="$(git grep -n -I -E "$joined" -- "${EXCLUDES[@]}" 2>/dev/null)"; then
  echo "✖ Secret / private-asset leak gate FAILED. Forbidden patterns found:" >&2
  echo "" >&2
  echo "$matches" >&2
  echo "" >&2
  echo "Secrets and private infrastructure must not appear in this repo. See docs/security.md." >&2
  exit 1
fi

echo "✓ Secret / private-asset leak gate passed."
