#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting app from: $(pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on PATH."
  echo "Install Node.js, then run this script again."
  read -r -p "Press Enter to exit..." _
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not on PATH."
  echo "Reinstall Node.js (npm is included), then run this script again."
  read -r -p "Press Enter to exit..." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "node_modules not found. Installing dependencies..."
  npm install
fi

echo "Launching app on http://localhost:8080"
npm start
