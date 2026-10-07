#!/usr/bin/env bash
# Rebuilds the self-hosted IBM Plex subsets (design-dna 3.5, Plan 1B decision D1).
# Needs npm and Python with fonttools + brotli. Outputs are committed; CI never runs this.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
npm pack @ibm/plex-sans@1.1.0 @ibm/plex-mono@2.5.0 --silent >/dev/null
mkdir sans mono
tar -xzf ibm-plex-sans-1.1.0.tgz -C sans
tar -xzf ibm-plex-mono-2.5.0.tgz -C mono
UNICODES="U+0020-007E,U+00A0-00FF,U+2009,U+200B,U+2010-2015,U+2018-201F,U+2022,U+2026,U+2032-2033,U+202F,U+20B9,U+2190-2193,U+2212,U+2248,U+2264-2265,U+25A0-25A1"
FEATURES="kern,liga,calt,tnum,pnum,lnum,case"
subset() { # input output flavor
  python -m fontTools.subset "$1" --unicodes="$UNICODES" --layout-features="$FEATURES" \
    --flavor="$3" --no-hinting --output-file="$2"
}
mkdir -p "$ROOT/src/app/fonts" "$ROOT/assets/og"
for pair in Regular:400 Medium:500 SemiBold:600; do
  subset "sans/package/fonts/complete/woff/IBMPlexSans-${pair%%:*}.woff" "$ROOT/src/app/fonts/plex-sans-${pair##*:}.woff2" woff2
done
for pair in Regular:400 Medium:500; do
  subset "mono/package/fonts/complete/woff/IBMPlexMono-${pair%%:*}.woff" "$ROOT/src/app/fonts/plex-mono-${pair##*:}.woff2" woff2
done
# next/og reads only ttf/otf/woff (Next docs, ImageResponse).
subset sans/package/fonts/complete/woff/IBMPlexSans-Regular.woff "$ROOT/assets/og/plex-sans-400.woff" woff
subset sans/package/fonts/complete/woff/IBMPlexSans-SemiBold.woff "$ROOT/assets/og/plex-sans-600.woff" woff
subset mono/package/fonts/complete/woff/IBMPlexMono-Medium.woff "$ROOT/assets/og/plex-mono-500.woff" woff
# The rupee sign must survive the subset (design-dna 3.5).
python - "$ROOT/src/app/fonts/plex-sans-400.woff2" <<'PY'
import sys
from fontTools.ttLib import TTFont
assert 0x20B9 in TTFont(sys.argv[1]).getBestCmap(), "U+20B9 missing from the subset"
print("rupee sign present")
PY
ls -l "$ROOT/src/app/fonts" "$ROOT/assets/og"
