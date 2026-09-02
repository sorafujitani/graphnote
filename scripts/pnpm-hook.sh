#!/bin/sh
set -eu

if command -v pnpm >/dev/null 2>&1; then
  exec pnpm "$@"
fi

if command -v mise >/dev/null 2>&1; then
  exec mise exec node@26.4.0 pnpm@11.18.0 -- pnpm "$@"
fi

printf '%s\n' 'pnpm is not on PATH; add pnpm or mise to PATH.' >&2
exit 127
