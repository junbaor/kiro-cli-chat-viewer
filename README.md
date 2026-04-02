# kiro-cli-chat-viewer

A web-based viewer for [Kiro CLI](https://kiro.dev) chat history. It reads the local SQLite database that Kiro CLI stores conversations in, and serves a clean UI to browse, search, and export them.

![Go](https://img.shields.io/badge/Go-1.25-blue)
![License](https://img.shields.io/github/license/junbaor/kiro-cli-chat-viewer)
![Release](https://img.shields.io/github/v/release/junbaor/kiro-cli-chat-viewer)

## Features

- Browse conversations grouped by workspace directory
- View full chat history including tool calls, tool results, and AI thinking process
- Toggle visibility of tool calls / tool results / thinking blocks
- Export conversations to Markdown
- Dark / Light / System theme
- Mobile-friendly responsive UI
- Single binary, zero dependencies at runtime

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/junbaor/kiro-cli-chat-viewer/master/install.sh | bash
```

This will download the latest release binary for your platform and install it to `/usr/local/bin`.

## Usage

```bash
# Start with default port 8080
kiro-cli-chat-viewer

# Custom port
PORT=3000 kiro-cli-chat-viewer
```

Then open `http://localhost:8080` in your browser.

## Data Source

The viewer reads Kiro CLI's local SQLite database in read-only mode:

| OS    | Path                                                    |
|-------|---------------------------------------------------------|
| macOS | `~/Library/Application Support/kiro-cli/data.sqlite3`   |
| Linux | `~/.local/share/kiro-cli/data.sqlite3`                  |

## Build from Source

Prerequisites: Go 1.25+, Node.js 20+

```bash
# Build all platforms
make release

# Or build for a single platform
make build-darwin-arm64
```

Output binaries are placed in the `release/` directory.

## Project Structure

```
├── frontend/          # React + TypeScript + Vite + Tailwind CSS
├── server/            # Go HTTP server with embedded frontend
│   └── main.go        # Single-file server, reads SQLite, serves SPA
├── Makefile           # Cross-platform build targets
├── build.sh           # Build script alternative
└── install.sh         # One-line installer
```

## License

MIT
