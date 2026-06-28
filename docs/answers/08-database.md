# Module 08 — Answer Key: Database Design

## Exercise 1: Inspect the live database

```bash
sqlite3 data/db/agent.db
```

Inside the SQLite CLI:

```sql
.tables
```

**Expected output:**
```
agent_notifications  knowledge_chunks     messages
agent_tasks          knowledge_fts        permanent_approvals
knowledge_sources    knowledge_sources    sessions
                                         settings
                                         skills
                                         mcp_servers
                                         token_usage_log
```

```sql
SELECT * FROM settings;
```

**Expected output on a fresh install (before the user has set a model):**
```
endpoint|
api_key|
embedding_provider|local
```

**After the user picks a model under Settings → Default Model:**
```
endpoint|
api_key|sk-your-key...
default_model|claude-sonnet-4-7
embedding_provider|local
```

Only `endpoint`, `api_key`, and `embedding_provider` are seeded on first run by `lib/db.ts`. `default_model` is *not* seeded — it only appears after the operator picks one in the Settings page. Until then, the agent loop emits a friendly chat warning with a link to `/settings` instead of silently using a vendor the operator didn't choose.

---

## Exercise 2: Count tokens

After a few chat turns:

```sql
SELECT
  SUM(CAST(JSON_EXTRACT(token_usage_json, '$.input') AS INTEGER)) AS total_input,
  SUM(CAST(JSON_EXTRACT(token_usage_json, '$.cached') AS INTEGER)) AS total_cached,
  SUM(CAST(JSON_EXTRACT(token_usage_json, '$.output') AS INTEGER)) AS total_output
FROM messages
WHERE role = 'assistant';
```

**Expected output (example):**
```
total_input|total_cached|total_output
15234|1200|4567
```

Note: The `token_usage_json` field stores `{"input": N, "cached": N, "output": N}` per assistant message. The JSON_EXTRACT functions parse this at query time. There is also a `token_usage_log` table that stores one flattened row per assistant message for the Statistics page.

**Alternative query using the aggregated table:**

```sql
SELECT day, input, cached, output
FROM token_usage_log
ORDER BY day DESC
LIMIT 7;
```

---

## Exercise 3: Test WAL mode

Open two terminals:

**Terminal 1:**
```bash
sqlite3 data/db/agent.db
sqlite> BEGIN;
sqlite> UPDATE settings SET value = 'test' WHERE key = 'endpoint';
-- Do NOT commit yet
```

**Terminal 2:**
```bash
sqlite3 data/db/agent.db
sqlite> SELECT * FROM settings;
```

**Expected:** The SELECT completes immediately, showing the old value of `endpoint` (before the uncommitted UPDATE in Terminal 1). The read does not block.

This works because WAL mode maintains two copies of the database: the original (stable) file and the WAL file (pending writes). Readers read from the original file while writers append to the WAL. Only when the writer commits and a checkpoint runs does the WAL merge into the main file.

```sql
-- Verify WAL mode is active:
PRAGMA journal_mode;
-- Output: wal
```

Roll back the uncommitted transaction:
```sql
-- In Terminal 1:
ROLLBACK;
```

---

## Exercise 4: Add a new column

Add `tags_json` to the `sessions` table using the safe migration pattern.

The safe migration code (following the pattern in `lib/db.ts` lines 193-202):

```typescript
// In the migrate() function in lib/db.ts, after the existing session column migrations:
const sessCols = (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name);
if (!sessCols.includes('tags_json')) {
  db.exec("ALTER TABLE sessions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
}
```

**Why this pattern:**
- `ALTER TABLE ADD COLUMN` in SQLite is a metadata-only operation — it does not rewrite the table, even on large databases
- `PRAGMA table_info(sessions)` returns the current columns — safe to call even if the column already exists
- `IF NOT EXISTS` on the ALTER TABLE would fail (SQLite does not support it). Instead, we check via `PRAGMA table_info` first
- The `DEFAULT '[]'` ensures existing rows get an empty JSON array automatically

**Verify after restart:**
```bash
sqlite3 data/db/agent.db
sqlite> PRAGMA table_info(sessions);
```

Expected output includes the new column:
```
id|TEXT|0||0
title|TEXT|1||0
agent_name|TEXT|1||0
created_at|INTEGER|1||0
updated_at|INTEGER|1||0
pinned_chat|INTEGER|1|0|0
pinned_prompt|TEXT|0||0
tags_json|TEXT|1|'[]'|0       ← new column
```
