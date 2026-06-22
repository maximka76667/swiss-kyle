#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
BIN_DIR="src-tauri/binaries"
mkdir -p "$BIN_DIR"

cargo build -p worker
cp "target/debug/worker" "$BIN_DIR/worker-$TRIPLE"

NATS_SERVER_BIN="$(command -v nats-server)"
cp "$NATS_SERVER_BIN" "$BIN_DIR/nats-server-$TRIPLE"
chmod +x "$BIN_DIR/worker-$TRIPLE" "$BIN_DIR/nats-server-$TRIPLE"
