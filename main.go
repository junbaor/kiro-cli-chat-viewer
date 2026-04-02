package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed dist
var staticFiles embed.FS

func getPythonScript(mode string, args ...string) string {
	dbPath := filepath.Join(os.Getenv("HOME"), ".local/share/kiro-cli/data.sqlite3")

	switch mode {
	case "list_groups":
		return fmt.Sprintf(`
import sqlite3, json
db = sqlite3.connect('%s')
db.row_factory = sqlite3.Row
cur = db.cursor()
cur.execute('SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 ORDER BY created_at DESC')
groups = {}
for row in cur.fetchall():
    key = row['key']
    val = json.loads(row['value'])
    cwd = val.get('env_context', {}).get('env_state', {}).get('current_working_directory', '') or ''
    history = val.get('history', [])
    msg_count = 0
    for turn in history:
        if turn.get('user', {}).get('content'):
            msg_count += 1
        if turn.get('assistant'):
            msg_count += 1
    conv = {'id': row['conversation_id'], 'key': key, 'conversation_id': row['conversation_id'], 'created_at': row['created_at'], 'updated_at': row['updated_at'], 'cwd': cwd, 'history': [], 'message_count': msg_count}
    if key not in groups:
        parts = key.split('/')
        groups[key] = {'key': key, 'path': parts[-1] if parts else key, 'conversations': []}
    groups[key]['conversations'].append(conv)
db.close()
print(json.dumps(list(groups.values())))
`, dbPath)

	case "get_conv":
		id := args[0]
		return fmt.Sprintf(`
import sqlite3, json, sys
db = sqlite3.connect('%s')
db.row_factory = sqlite3.Row
cur = db.cursor()
cur.execute('SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 WHERE conversation_id = ?', ('%s',))
row = cur.fetchone()
if not row:
    sys.exit(1)
val = json.loads(row['value'])
cwd = val.get('env_context', {}).get('env_state', {}).get('current_working_directory', '') or ''

def get_text_content(c):
    if not c:
        return ''
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        parts = []
        for item in c:
            if isinstance(item, dict) and 'Text' in item:
                parts.append(item['Text'])
            elif isinstance(item, dict) and 'image_url' in item:
                parts.append('[image]')
        return ''.join(parts)
    if isinstance(c, dict):
        if 'Prompt' in c:
            return c['Prompt'].get('prompt', '') or ''
        if 'ToolUseResults' in c:
            parts = []
            for r in c['ToolUseResults'].get('tool_use_results', []):
                content = r.get('content', [])
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and 'Text' in item:
                            parts.append(item['Text'])
                elif isinstance(content, str):
                    parts.append(content)
            return ''.join(parts)
    return ''

history = val.get('history', [])
messages = []
for turn in history:
    user = turn.get('user', {})
    assistant = turn.get('assistant', {})

    # User message
    user_content = user.get('content')
    user_text = get_text_content(user_content)
    if user_text:
        messages.append({'role': 'user', 'content': user_text})

    # Assistant message
    if isinstance(assistant, dict):
        tu = assistant.get('ToolUse')
        if tu:
            text = tu.get('content', '') or ''
            tool_uses = tu.get('tool_uses', [])
            # Show text content
            if text and text.strip():
                messages.append({'role': 'assistant', 'content': text.strip()})
            # Show tool calls
            if tool_uses:
                for tc in tool_uses:
                    name = tc.get('name') or tc.get('orig_name', 'unknown')
                    args_val = tc.get('args', {})
                    args_str = json.dumps(args_val) if isinstance(args_val, dict) else str(args_val)
                    messages.append({'role': 'assistant', 'content': '', 'tool_calls': [{'id': tc.get('id', ''), 'type': 'function', 'function': {'name': name, 'arguments': args_str}}], 'name': name})

conv = {'id': row['conversation_id'], 'key': row['key'], 'conversation_id': row['conversation_id'], 'created_at': row['created_at'], 'updated_at': row['updated_at'], 'cwd': cwd, 'history': messages}
db.close()
print(json.dumps(conv, ensure_ascii=False))
`, dbPath, id)

	case "search":
		q := args[0]
		return fmt.Sprintf(`
import sqlite3, json, sys
q = '%s'.lower()
db = sqlite3.connect('%s')
db.row_factory = sqlite3.Row
cur = db.cursor()
cur.execute('SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 ORDER BY created_at DESC')
results = []
for row in cur.fetchall():
    if q in row['value'].lower():
        val = json.loads(row['value'])
        cwd = val.get('env_context', {}).get('env_state', {}).get('current_working_directory', '') or ''
        results.append({'id': row['conversation_id'], 'key': row['key'], 'conversation_id': row['conversation_id'], 'created_at': row['created_at'], 'updated_at': row['updated_at'], 'cwd': cwd, 'history': []})
    if len(results) >= 50:
        break
db.close()
print(json.dumps(results))
`, q, dbPath)

	case "export":
		id := args[0]
		return fmt.Sprintf(`
import sqlite3, json, sys, datetime
db = sqlite3.connect('%s')
db.row_factory = sqlite3.Row
cur = db.cursor()
cur.execute('SELECT key, conversation_id, created_at, updated_at, value FROM conversations_v2 WHERE conversation_id = ?', ('%s',))
row = cur.fetchone()
if not row:
    sys.exit(1)
val = json.loads(row['value'])
cwd = val.get('env_context', {}).get('env_state', {}).get('current_working_directory', '') or ''
ts = datetime.datetime.fromtimestamp(row['created_at']/1000).strftime('%%Y-%%m-%%d %%H:%%M:%%S')

def get_text_content(c):
    if not c:
        return ''
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        parts = []
        for item in c:
            if isinstance(item, dict) and 'Text' in item:
                parts.append(item['Text'])
        return ''.join(parts)
    if isinstance(c, dict):
        if 'Prompt' in c:
            return c['Prompt'].get('prompt', '') or ''
        if 'ToolUseResults' in c:
            parts = []
            for r in c['ToolUseResults'].get('tool_use_results', []):
                content = r.get('content', [])
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and 'Text' in item:
                            parts.append(item['Text'])
                elif isinstance(content, str):
                    parts.append(content)
            return ''.join(parts)
    return ''

history = val.get('history', [])
messages = []
for turn in history:
    user = turn.get('user', {})
    assistant = turn.get('assistant', {})
    user_text = get_text_content(user.get('content'))
    if user_text:
        messages.append(('user', user_text))
    if isinstance(assistant, dict):
        tu = assistant.get('ToolUse')
        if tu:
            text = tu.get('content', '') or ''
            if text and text.strip():
                messages.append(('assistant', text.strip()))
            for tc in tu.get('tool_uses', []):
                name = tc.get('name') or tc.get('orig_name', 'unknown')
                messages.append(('tool', name))

lines = ['# Conversation Export', '', '**Directory:** ' + cwd, '**Created:** ' + ts, '', '---', '']
for i, (role, content) in enumerate(messages):
    role_name = 'User' if role == 'user' else ('Assistant' if role == 'assistant' else 'Tool (' + content + ')')
    lines.append('## [' + str(i+1) + '] ' + role_name)
    if content:
        lines.append(content)
    lines.append('')
db.close()
print('\\n'.join(lines))
`, dbPath, id)
	}
	return ""
}

func main() {
	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	mux := http.NewServeMux()

	// API: list all conversations grouped by directory
	mux.HandleFunc("/api/conversations", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		script := getPythonScript("list_groups")
		out, err := exec.Command("python3", "-c", script).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("error: %s, output: %s", err, out), 500)
			return
		}
		w.Write(out)
	})

	// API: get single conversation
	mux.HandleFunc("/api/conversations/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/conversations/"):]
		w.Header().Set("Content-Type", "application/json")
		script := getPythonScript("get_conv", id)
		out, err := exec.Command("python3", "-c", script).CombinedOutput()
		if err != nil {
			http.Error(w, "Not found", 404)
			return
		}
		w.Write(out)
	})

	// API: search
	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		w.Header().Set("Content-Type", "application/json")
		script := getPythonScript("search", q)
		out, err := exec.Command("python3", "-c", script).CombinedOutput()
		if err != nil {
			json.NewEncoder(w).Encode([]interface{}{})
			return
		}
		w.Write(out)
	})

	// API: export
	mux.HandleFunc("/api/export/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/export/"):]
		script := getPythonScript("export", id)
		out, err := exec.Command("python3", "-c", script).CombinedOutput()
		if err != nil {
			http.Error(w, "Not found", 404)
			return
		}
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Write(out)
	})

	// Serve static files
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
