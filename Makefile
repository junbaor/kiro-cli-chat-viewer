APP_NAME := kiro-chat-viewer
VERSION  := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

LDFLAGS := -s -w -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)

DIST_DIR := release

.PHONY: all clean frontend build-darwin-amd64 build-darwin-arm64 build-linux-amd64 build-linux-arm64 release

all: release

## 构建前端
frontend:
	cd frontend && npm ci && npm run build

## 单平台构建（需要先构建前端）
build-darwin-amd64: frontend
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-darwin-amd64

build-darwin-arm64: frontend
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-darwin-arm64

build-linux-amd64: frontend
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-linux-amd64

build-linux-arm64: frontend
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-linux-arm64

## 构建所有平台
release: frontend
	@mkdir -p $(DIST_DIR)
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-darwin-amd64
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-darwin-arm64
	cd server && CGO_ENABLED=0 GOOS=linux  GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-linux-amd64
	cd server && CGO_ENABLED=0 GOOS=linux  GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o ../$(DIST_DIR)/$(APP_NAME)-linux-arm64
	@echo ""
	@echo "构建完成："
	@ls -lh $(DIST_DIR)/

clean:
	rm -rf $(DIST_DIR) server/dist
