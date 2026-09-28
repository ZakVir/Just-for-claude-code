#!/usr/bin/env bash
# Packs the extension into dist/snap-orion.zip for Orion's "Add Extension".
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/snap-orion.zip
zip -r -q dist/snap-orion.zip manifest.json loader.js page
echo "built dist/snap-orion.zip"
