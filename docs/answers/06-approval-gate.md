# Module 06 — Answer Key: Approval Gate

## Exercise 1: Trigger the approval gate

First create a test file under `data/`, for example: *"Please create a file at data/tmp/test.txt with content 'hello'"*.

Then send: *"Please delete data/tmp/test.txt"*

**Expected sequence:**

1. Agent calls `delete_path({ target_path: "data/tmp/test.txt" })`
2. The path is resolved under `DATA_ROOT`
3. `delete_path` checks `isApproved(sessionId, 'delete', resolved)`
4. No approval exists → returns `{ requires_approval: true, operation: "delete", path: resolved, description: "Delete file: ..." }`
5. The UI shows an approval card
6. Click **Approve once**
7. `POST /api/approval` stores the one-time approval in memory
8. The agent loop retries with approval granted
9. The file is deleted and the one-time approval is consumed

---

## Exercise 2: Grant a session approval

Create two test files first:

- *"Create data/tmp/test1.txt with content 'a'"*
- *"Create data/tmp/test2.txt with content 'b'"*

Ask: *"Delete data/tmp/test1.txt"*

When the approval card appears, click **Allow this session**.

Then ask: *"Delete data/tmp/test2.txt"*

**Expected:** No approval prompt appears for the second deletion within the same chat session. `isApproved()` returns true because the session-level approval was stored under the `delete` operation in the in-memory approval store.

**Scope difference:**

- **Once**: stored as `operation:path` and cleared by `consumeOnce()` after successful use
- **Session**: stored as the operation type and lasts until server restart
- **Permanent**: stored in SQLite by operation type and survives restart

---

## Exercise 3: Inspect permanent approvals

Grant a permanent approval by clicking **Always allow** during a delete operation.

Then inspect the DB:

```bash
sqlite3 data/db/agent.db
sqlite> SELECT * FROM permanent_approvals;
```

**Expected output:**

```text
delete
```

Now navigate to the Approvals page. You should see the permanent approval listed with a **Revoke** button. Click it.

Verify removal:

```bash
sqlite3 data/db/agent.db
sqlite> SELECT * FROM permanent_approvals;
-- no rows
```

---

## Exercise 4: Review sub-agent safety

Create a restricted agent with a narrow `Tools:` allowlist, then launch it with `run_subagent_async`.

**Expected:** The sub-agent only receives tools permitted by its agent config and global built-in-tool settings. Because async sub-agents have no browser `sessionId`, tools that require interactive approval and cannot show the UI, such as `delete_path` and `run_shell`, return an error instead of executing.

**Why:** approval-backed dangerous tools require a session context. Main chat turns can pause and show the approval card; background sub-agent turns cannot, so these tools fail closed.
