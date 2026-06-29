#!/usr/bin/env bash
set -euo pipefail

# Load cargo/rustc into PATH when the shell doesn't inherit it (e.g. Tauri's beforeDevCommand)
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

cd "$(dirname "$0")/.."

TRIPLE="$(rustc -vV | sed -n 's/host: //p' | tr -d '\r')"
echo "Detected triple: $TRIPLE"
BIN_DIR="src-tauri/binaries"
mkdir -p "$BIN_DIR"

NATS_VERSION="2.10.22"
PANDOC_VERSION="3.6.3"
TYPST_VERSION="0.13.0"

# On Windows binaries have a .exe extension; Tauri expects it in the filename.
case "$TRIPLE" in
  *windows*) EXT=".exe" ;;
  *)         EXT=""     ;;
esac

# Helper: download a zip and find a binary by name inside it.
extract_from_zip() {
  local url="$1" name="$2" dest="$3"
  local tmp
  tmp=$(mktemp -d)
  curl -fsSL "$url" -o "$tmp/archive.zip"
  unzip -q "$tmp/archive.zip" -d "$tmp"
  find "$tmp" -name "$name" -type f | head -1 | xargs -I{} mv {} "$dest"
  rm -rf "$tmp"
}

# Helper: download a tar and find a binary by name inside it.
extract_from_tar() {
  local url="$1" name="$2" dest="$3" flags="$4"
  local tmp
  tmp=$(mktemp -d)
  curl -fsSL "$url" | tar "-x${flags}f" - -C "$tmp"
  find "$tmp" -name "$name" -type f | head -1 | xargs -I{} mv {} "$dest"
  rm -rf "$tmp"
}

# Helper: download once, skip if the file is already non-empty.
download_once() {
  local dest="$1" label="$2"
  if [ -s "$dest" ]; then
    echo "$label already present, skipping download"
    return 1  # signal: skip
  fi
  echo "Downloading $label..."
  return 0  # signal: proceed
}

# --- Worker (always rebuild from source) ---
cargo build -p worker
cp "target/debug/worker$EXT" "$BIN_DIR/worker-$TRIPLE$EXT"
chmod +x "$BIN_DIR/worker-$TRIPLE$EXT"

# --- nats-server ---
NATS_BIN="$BIN_DIR/nats-server-$TRIPLE$EXT"
if download_once "$NATS_BIN" "nats-server $NATS_VERSION"; then
  case "$TRIPLE" in
    x86_64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/nats-io/nats-server/releases/download/v$NATS_VERSION/nats-server-v$NATS_VERSION-linux-amd64.tar.gz" \
        "nats-server" "$NATS_BIN" "z" ;;
    aarch64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/nats-io/nats-server/releases/download/v$NATS_VERSION/nats-server-v$NATS_VERSION-linux-arm64.tar.gz" \
        "nats-server" "$NATS_BIN" "z" ;;
    x86_64-apple-darwin)
      extract_from_zip \
        "https://github.com/nats-io/nats-server/releases/download/v$NATS_VERSION/nats-server-v$NATS_VERSION-darwin-amd64.zip" \
        "nats-server" "$NATS_BIN" ;;
    aarch64-apple-darwin)
      extract_from_zip \
        "https://github.com/nats-io/nats-server/releases/download/v$NATS_VERSION/nats-server-v$NATS_VERSION-darwin-arm64.zip" \
        "nats-server" "$NATS_BIN" ;;
    x86_64-pc-windows-msvc | x86_64-pc-windows-gnu)
      extract_from_zip \
        "https://github.com/nats-io/nats-server/releases/download/v$NATS_VERSION/nats-server-v$NATS_VERSION-windows-amd64.zip" \
        "nats-server.exe" "$NATS_BIN" ;;
    *)
      echo "No automatic nats-server download for $TRIPLE — place the binary manually at $NATS_BIN" >&2
      exit 1 ;;
  esac
  chmod +x "$NATS_BIN"
  echo "nats-server ready at $NATS_BIN"
fi

# --- ffmpeg ---
FFMPEG_BIN="$BIN_DIR/ffmpeg-$TRIPLE$EXT"
if download_once "$FFMPEG_BIN" "ffmpeg"; then
  case "$TRIPLE" in
    x86_64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz" \
        "ffmpeg" "$FFMPEG_BIN" "J" ;;
    aarch64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz" \
        "ffmpeg" "$FFMPEG_BIN" "J" ;;
    x86_64-apple-darwin | aarch64-apple-darwin)
      extract_from_zip \
        "https://evermeet.cx/ffmpeg/getrelease/zip" \
        "ffmpeg" "$FFMPEG_BIN" ;;
    x86_64-pc-windows-msvc | x86_64-pc-windows-gnu)
      extract_from_zip \
        "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" \
        "ffmpeg.exe" "$FFMPEG_BIN" ;;
    *)
      echo "No automatic ffmpeg download for $TRIPLE — place the binary manually at $FFMPEG_BIN" >&2
      exit 1 ;;
  esac
  chmod +x "$FFMPEG_BIN"
  echo "ffmpeg ready at $FFMPEG_BIN"
fi

# --- pandoc ---
PANDOC_BIN="$BIN_DIR/pandoc-$TRIPLE$EXT"
if download_once "$PANDOC_BIN" "pandoc $PANDOC_VERSION"; then
  case "$TRIPLE" in
    x86_64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/jgm/pandoc/releases/download/$PANDOC_VERSION/pandoc-$PANDOC_VERSION-linux-amd64.tar.gz" \
        "pandoc" "$PANDOC_BIN" "z" ;;
    aarch64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/jgm/pandoc/releases/download/$PANDOC_VERSION/pandoc-$PANDOC_VERSION-linux-arm64.tar.gz" \
        "pandoc" "$PANDOC_BIN" "z" ;;
    x86_64-apple-darwin | aarch64-apple-darwin)
      extract_from_zip \
        "https://github.com/jgm/pandoc/releases/download/$PANDOC_VERSION/pandoc-$PANDOC_VERSION-macOS.zip" \
        "pandoc" "$PANDOC_BIN" ;;
    x86_64-pc-windows-msvc | x86_64-pc-windows-gnu)
      extract_from_zip \
        "https://github.com/jgm/pandoc/releases/download/$PANDOC_VERSION/pandoc-$PANDOC_VERSION-windows-x86_64.zip" \
        "pandoc.exe" "$PANDOC_BIN" ;;
    *)
      echo "No automatic pandoc download for $TRIPLE — place the binary manually at $PANDOC_BIN" >&2
      exit 1 ;;
  esac
  chmod +x "$PANDOC_BIN"
  echo "pandoc ready at $PANDOC_BIN"
fi

# --- typst (PDF engine for pandoc) ---
TYPST_BIN="$BIN_DIR/typst-$TRIPLE$EXT"
if download_once "$TYPST_BIN" "typst $TYPST_VERSION"; then
  case "$TRIPLE" in
    x86_64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/typst/typst/releases/download/v$TYPST_VERSION/typst-x86_64-unknown-linux-musl.tar.xz" \
        "typst" "$TYPST_BIN" "J" ;;
    aarch64-unknown-linux-gnu)
      extract_from_tar \
        "https://github.com/typst/typst/releases/download/v$TYPST_VERSION/typst-aarch64-unknown-linux-musl.tar.xz" \
        "typst" "$TYPST_BIN" "J" ;;
    x86_64-apple-darwin)
      extract_from_tar \
        "https://github.com/typst/typst/releases/download/v$TYPST_VERSION/typst-x86_64-apple-darwin.tar.xz" \
        "typst" "$TYPST_BIN" "J" ;;
    aarch64-apple-darwin)
      extract_from_tar \
        "https://github.com/typst/typst/releases/download/v$TYPST_VERSION/typst-aarch64-apple-darwin.tar.xz" \
        "typst" "$TYPST_BIN" "J" ;;
    x86_64-pc-windows-msvc | x86_64-pc-windows-gnu)
      extract_from_zip \
        "https://github.com/typst/typst/releases/download/v$TYPST_VERSION/typst-x86_64-pc-windows-msvc.zip" \
        "typst.exe" "$TYPST_BIN" ;;
    *)
      echo "No automatic typst download for $TRIPLE — place the binary manually at $TYPST_BIN" >&2
      exit 1 ;;
  esac
  chmod +x "$TYPST_BIN"
  echo "typst ready at $TYPST_BIN"
fi
