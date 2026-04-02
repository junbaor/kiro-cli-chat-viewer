#!/usr/bin/env bash
set -euo pipefail

APP_NAME="kiro-cli-chat-viewer"
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
LDFLAGS="-s -w -X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}"
DIST_DIR="release"

PLATFORMS=(
  "darwin/amd64"
  "darwin/arm64"
  "linux/amd64"
  "linux/arm64"
)

echo "==> 构建前端..."
(cd frontend && npm ci && npm run build)

echo "==> 前端构建完成，开始编译 Go 二进制..."
mkdir -p "${DIST_DIR}"

for platform in "${PLATFORMS[@]}"; do
  IFS='/' read -r GOOS GOARCH <<< "${platform}"
  output="${DIST_DIR}/${APP_NAME}-${GOOS}-${GOARCH}"
  echo "    编译 ${GOOS}/${GOARCH} -> ${output}"
  (cd server && CGO_ENABLED=0 GOOS="${GOOS}" GOARCH="${GOARCH}" go build -ldflags "${LDFLAGS}" -o "../${output}")
done

echo ""
echo "==> 构建完成："
ls -lh "${DIST_DIR}/"
