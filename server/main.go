package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed dist
var staticFiles embed.FS

func dbPath() string {
	home := os.Getenv("HOME")
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library/Application Support/kiro-cli/data.sqlite3")
	}
	return filepath.Join(home, ".local/share/kiro-cli/data.sqlite3")
}

func openDB() (*sql.DB, error) {
	return sql.Open("sqlite", dbPath()+"?mode=ro")
}

// --- JSON types for parsing conversation value ---

type envContext struct {
	EnvState struct {
		CurrentWorkingDirectory string `json:"current_working_directory"`
	} `json:"env_state"`
}

type convValue struct {
	EnvContext envContext        `json:"env_context"`
	History    []json.RawMessage `json:"history"`
}

type convSummary struct {
	ID             string `json:"id"`
	Key            string `json:"key"`
	ConversationID string `json:"conversation_id"`
	CreatedAt      int64  `json:"created_at"`
	UpdatedAt      int64  `json:"updated_at"`
	CWD            string `json:"cwd"`
	History        []any  `json:"history"`
	MessageCount   int    `json:"message_count"`
}

type convGroup struct {
	Key           string        `json:"key"`
	Path          string        `json:"path"`
	Conversations []convSummary `json:"conversations"`
}

type message struct {
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	ToolCalls []toolCall `json:"tool_calls,omitempty"`
	Name      string     `json:"name,omitempty"`
}

type toolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function toolFunction `json:"function"`
}

type toolFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// --- Content extraction ---

func getTextContent(c json.RawMessage) string {
	if len(c) == 0 {
		return ""
	}
	var s string
	if json.Unmarshal(c, &s) == nil {
		return s
	}
	var arr []map[string]json.RawMessage
	if json.Unmarshal(c, &arr) == nil {
		var parts []string
		for _, item := range arr {
			if text, ok := item["Text"]; ok {
				var t string
				json.Unmarshal(text, &t)
				parts = append(parts, t)
			} else if _, ok := item["image_url"]; ok {
				parts = append(parts, "[image]")
			}
		}
		return strings.Join(parts, "")
	}
	var obj map[string]json.RawMessage
	if json.Unmarshal(c, &obj) == nil {
		if prompt, ok := obj["Prompt"]; ok {
			var p struct {
				Prompt string `json:"prompt"`
			}
			json.Unmarshal(prompt, &p)
			return p.Prompt
		}
		if tur, ok := obj["ToolUseResults"]; ok {
			var t struct {
				ToolUseResults []struct {
					Content json.RawMessage `json:"content"`
				} `json:"tool_use_results"`
			}
			json.Unmarshal(tur, &t)
			var parts []string
			for _, r := range t.ToolUseResults {
				var cs string
				if json.Unmarshal(r.Content, &cs) == nil {
					parts = append(parts, cs)
					continue
				}
				var items []map[string]json.RawMessage
				if json.Unmarshal(r.Content, &items) == nil {
					for _, item := range items {
						if text, ok := item["Text"]; ok {
							var t string
							json.Unmarshal(text, &t)
							parts = append(parts, t)
						}
					}
				}
			}
			return strings.Join(parts, "")
		}
	}
	return ""
}

func getCWD(val *convValue) string {
	return val.EnvContext.EnvState.CurrentWorkingDirectory
}

// --- Parse history ---

func parseHistory(history []json.RawMessage) []message {
	var messages []message
	for _, raw := range history {
		var turn map[string]json.RawMessage
		if json.Unmarshal(raw, &turn) != nil {
			continue
		}
		if userRaw, ok := turn["user"]; ok {
			var user map[string]json.RawMessage
			if json.Unmarshal(userRaw, &user) == nil {
				if content, ok := user["content"]; ok {
					if text := getTextContent(content); text != "" {
						messages = append(messages, message{Role: "user", Content: text})
					}
				}
			}
		}
		if assistantRaw, ok := turn["assistant"]; ok {
			var assistant map[string]json.RawMessage
			if json.Unmarshal(assistantRaw, &assistant) != nil {
				continue
			}
			if tuRaw, ok := assistant["ToolUse"]; ok {
				var tu struct {
					Content  string `json:"content"`
					ToolUses []struct {
						ID       string          `json:"id"`
						Name     string          `json:"name"`
						OrigName string          `json:"orig_name"`
						Args     json.RawMessage `json:"args"`
					} `json:"tool_uses"`
				}
				if json.Unmarshal(tuRaw, &tu) != nil {
					continue
				}
				if strings.TrimSpace(tu.Content) != "" {
					messages = append(messages, message{Role: "assistant", Content: strings.TrimSpace(tu.Content)})
				}
				for _, tc := range tu.ToolUses {
					name := tc.Name
					if name == "" {
						name = tc.OrigName
					}
					if name == "" {
						name = "unknown"
					}
					argsStr := string(tc.Args)
					if tc.Args != nil {
						var argsObj map[string]any
						if json.Unmarshal(tc.Args, &argsObj) == nil {
							b, _ := json.Marshal(argsObj)
							argsStr = string(b)
						}
					}
					messages = append(messages, message{
						Role: "assistant", Content: "", Name: name,
						ToolCalls: []toolCall{{
							ID: tc.ID, Type: "function",
							Function: toolFunction{Name: name, Arguments: argsStr},
						}},
					})
				}
			}
		}
	}
	return messages
}

func countMessages(history []json.RawMessage) int {
	count := 0
	for _, raw := range history {
		var turn map[string]json.RawMessage
		if json.Unmarshal(raw, &turn) != nil {
			continue
		}
		if userRaw, ok := turn["user"]; ok {
			var user map[string]json.RawMessage
			if json.Unmarshal(userRaw, &user) == nil {
				if content, ok := user["content"]; ok && len(content) > 0 {
					count++
				}
			}
		}
		if _, ok := turn["assistant"]; ok {
			count++
		}
	}
	return count
}

// --- HTTP handlers ---

func handleListConversations(w http.ResponseWriter, r *http.Request) {
	db, err := openDB()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer db.Close()

	rows, err := db.Query("SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 ORDER BY created_at DESC")
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	groups := make(map[string]*convGroup)
	var groupOrder []string

	for rows.Next() {
		var key, convID, value string
		var createdAt, updatedAt int64
		if err := rows.Scan(&key, &convID, &createdAt, &updatedAt, &value); err != nil {
			continue
		}
		var val convValue
		json.Unmarshal([]byte(value), &val)

		summary := convSummary{
			ID: convID, Key: key, ConversationID: convID,
			CreatedAt: createdAt, UpdatedAt: updatedAt,
			CWD: getCWD(&val), History: []any{},
			MessageCount: countMessages(val.History),
		}

		if _, ok := groups[key]; !ok {
			parts := strings.Split(key, "/")
			p := key
			if len(parts) > 0 {
				p = parts[len(parts)-1]
			}
			groups[key] = &convGroup{Key: key, Path: p, Conversations: []convSummary{}}
			groupOrder = append(groupOrder, key)
		}
		groups[key].Conversations = append(groups[key].Conversations, summary)
	}

	result := make([]convGroup, 0, len(groups))
	for _, key := range groupOrder {
		result = append(result, *groups[key])
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func handleGetConversation(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/conversations/"):]
	db, err := openDB()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer db.Close()

	var key, convID, value string
	var createdAt, updatedAt int64
	err = db.QueryRow("SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 WHERE conversation_id = ?", id).
		Scan(&key, &convID, &createdAt, &updatedAt, &value)
	if err != nil {
		http.Error(w, "Not found", 404)
		return
	}
	var val convValue
	json.Unmarshal([]byte(value), &val)

	result := struct {
		ID             string    `json:"id"`
		Key            string    `json:"key"`
		ConversationID string    `json:"conversation_id"`
		CreatedAt      int64     `json:"created_at"`
		UpdatedAt      int64     `json:"updated_at"`
		CWD            string    `json:"cwd"`
		History        []message `json:"history"`
	}{
		ID: convID, Key: key, ConversationID: convID,
		CreatedAt: createdAt, UpdatedAt: updatedAt,
		CWD: getCWD(&val), History: parseHistory(val.History),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.ToLower(r.URL.Query().Get("q"))
	db, err := openDB()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]any{})
		return
	}
	defer db.Close()

	rows, err := db.Query("SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 ORDER BY created_at DESC")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]any{})
		return
	}
	defer rows.Close()

	var results []convSummary
	for rows.Next() {
		var key, convID, value string
		var createdAt, updatedAt int64
		if err := rows.Scan(&key, &convID, &createdAt, &updatedAt, &value); err != nil {
			continue
		}
		if strings.Contains(strings.ToLower(value), q) {
			var val convValue
			json.Unmarshal([]byte(value), &val)
			results = append(results, convSummary{
				ID: convID, Key: key, ConversationID: convID,
				CreatedAt: createdAt, UpdatedAt: updatedAt,
				CWD: getCWD(&val), History: []any{},
			})
		}
		if len(results) >= 50 {
			break
		}
	}
	if results == nil {
		results = []convSummary{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/export/"):]
	db, err := openDB()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer db.Close()

	var key, convID, value string
	var createdAt, updatedAt int64
	err = db.QueryRow("SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 WHERE conversation_id = ?", id).
		Scan(&key, &convID, &createdAt, &updatedAt, &value)
	if err != nil {
		http.Error(w, "Not found", 404)
		return
	}
	var val convValue
	json.Unmarshal([]byte(value), &val)

	cwd := getCWD(&val)
	ts := time.UnixMilli(createdAt).Format("2006-01-02 15:04:05")

	type exportMsg struct {
		role, content string
	}
	var msgs []exportMsg
	for _, raw := range val.History {
		var turn map[string]json.RawMessage
		if json.Unmarshal(raw, &turn) != nil {
			continue
		}
		if userRaw, ok := turn["user"]; ok {
			var user map[string]json.RawMessage
			if json.Unmarshal(userRaw, &user) == nil {
				if content, ok := user["content"]; ok {
					if text := getTextContent(content); text != "" {
						msgs = append(msgs, exportMsg{"user", text})
					}
				}
			}
		}
		if assistantRaw, ok := turn["assistant"]; ok {
			var assistant map[string]json.RawMessage
			if json.Unmarshal(assistantRaw, &assistant) == nil {
				if tuRaw, ok := assistant["ToolUse"]; ok {
					var tu struct {
						Content  string `json:"content"`
						ToolUses []struct {
							Name     string `json:"name"`
							OrigName string `json:"orig_name"`
						} `json:"tool_uses"`
					}
					if json.Unmarshal(tuRaw, &tu) == nil {
						if strings.TrimSpace(tu.Content) != "" {
							msgs = append(msgs, exportMsg{"assistant", strings.TrimSpace(tu.Content)})
						}
						for _, tc := range tu.ToolUses {
							name := tc.Name
							if name == "" {
								name = tc.OrigName
							}
							if name == "" {
								name = "unknown"
							}
							msgs = append(msgs, exportMsg{"tool", name})
						}
					}
				}
			}
		}
	}

	lines := []string{"# Conversation Export", "", "**Directory:** " + cwd, "**Created:** " + ts, "", "---", ""}
	for i, m := range msgs {
		roleName := "User"
		if m.role == "assistant" {
			roleName = "Assistant"
		} else if m.role == "tool" {
			roleName = "Tool (" + m.content + ")"
		}
		lines = append(lines, fmt.Sprintf("## [%d] %s", i+1, roleName))
		if m.content != "" {
			lines = append(lines, m.content)
		}
		lines = append(lines, "")
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Write([]byte(strings.Join(lines, "\n")))
}

func main() {
	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/conversations", handleListConversations)
	mux.HandleFunc("/api/conversations/", handleGetConversation)
	mux.HandleFunc("/api/search", handleSearch)
	mux.HandleFunc("/api/export/", handleExport)

	// Serve embedded static files (production)
	subFS, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		log.Fatal("Failed to get sub filesystem:", err)
	}
	fileServer := http.FileServer(http.FS(subFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") {
			return
		}
		if strings.Contains(r.URL.Path, ".") {
			fileServer.ServeHTTP(w, r)
			return
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	log.Printf("Kiro Chat Viewer starting on http://0.0.0.0:%s", port)
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, mux))
}
