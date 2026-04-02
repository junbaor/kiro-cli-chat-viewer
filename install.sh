#!/usr/bin/env bash
set -euo pipefail

REPO="junbaor/kiro-cli-chat-viewer"
APP_NAME="kiro-cli-chat-viewer"
INSTALL_DIR="/usr/local/bin"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "${ARCH}" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)
    echo "Error: unsupported architecture: ${ARCH}"
    exit 1
    ;;
esac

case "${OS}" in
  darwin|linux) ;;
  *)
    echo "Error: unsupported OS: ${OS}"
    exit 1
    ;;
esac

BINARY="${APP_NAME}-${OS}-${ARCH}"

# Get latest version
echo "Fetching latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "${LATEST}" ]; then
  echo "Error: failed to fetch latest release"
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${LATEST}/${BINARY}"

echo "Downloading ${APP_NAME} ${LATEST} (${OS}/${ARCH})..."
TMP=$(mktemp)
curl -fSL -o "${TMP}" "${URL}"
chmod +x "${TMP}"

echo "Installing to ${INSTALL_DIR}/${APP_NAME}..."
if [ -w "${INSTALL_DIR}" ]; then
  mv "${TMP}" "${INSTALL_DIR}/${APP_NAME}"
else
  sudo mv "${TMP}" "${INSTALL_DIR}/${APP_NAME}"
fi

echo "Done! Run 'kiro-cli-chat-viewer' to start."
