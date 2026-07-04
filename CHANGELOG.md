# Changelog

## Unreleased (since v1.3.0)

### AI assistant
- **Research-backed loop hardening** (validated against 2025/26 agent practice; sources in
  `docs/ai-architecture-notes.md`): Qwen-correct sampling defaults (temp 0.7 / top_p 0.8 —
  near-greedy decoding is a documented cause of tool-call loops), tool cap 24→20, repeat-call
  guard, per-tool circuit breaker (infra failures only, once per round), duplicate-call dedup,
  malformed-argument repair with double-stringify unwinding, schema validation before
  execution/approval, output-truncation recovery, stream-stall watchdog, stream-time `<think>`
  suppression (UI = persisted = external consumers).
- **Approval-flow safety**: atomic claim prevents double execution on double-click; failures
  after the claim re-arm the approval with the unprocessed writes; a new user message
  atomically supersedes stale approvals; tool arguments are canonicalized so the approval card
  shows exactly what will execute.
- **Prefix-cache stability** (local-inference latency): deterministic tool ordering, sticky
  per-conversation tool sets — now **persisted** on `ai_conversations.metadata` and surviving
  restarts — history-window hysteresis, deterministic result-persistence order.
- **New tools**: `get_time_pattern` (deterministic per-weekday schedule analysis from real
  entries — the model reproduces facts instead of doing arithmetic) and `log_time_entry`
  (composite: project resolved by NAME server-side, duration computed server-side; collapses
  the resolve→compute→create chain to one reviewable call).
- **Resume fast path**: approving no longer pays an embedding round trip.
- **Approve-with-edit**: correct a proposed action's arguments directly in the approval card
  (pencil icon, schema-validated) instead of rejecting and re-looping; the executed edit is
  recorded truthfully in the conversation.
- Chat history and pending approval cards are restored after a page reload; transient fetch
  failures no longer discard the conversation.
- Timezone-correct dates in the system prompt and pattern analysis.

### AI assistant — delta self-review fixes
- **At-most-once approved writes**: a write that executed but whose result failed to
  record is no longer re-armed, so retrying Approve can't create a duplicate entry.
- **Supersession-aware recovery**: a failed resume won't resurrect an approval that a
  newer user message already superseded; approve-with-edit executes on a clone so the
  stored proposal/audit stays intact.
- `log_time_entry` `task_name`/`description` are optional (were wrongly `required` yet
  documented as blank-if-absent — broke the back-logging workflow); empty project name
  is rejected with a clear message.
- Stream `<think>` filter is case-insensitive (no live chain-of-thought leak on
  `<THINK>`), and a held-back partial tag is emitted so live == persisted text.
- Backup tar verification discards stderr (a corrupt archive can no longer deadlock it).
- Bounded no-forward-progress break: a stuck identical-batch loop stops after a couple
  of rounds (once the repair message has been delivered) instead of running to the cap.

### Reliability & operations
- Backups are **verified restorable** before being marked completed (streamed tar listing) and
  can mirror off-site (`BACKUP_MIRROR_DIR`), with retention pruning both copies.
- `restart: unless-stopped` + measured memory limits on all runtime services; test containers
  moved behind the `test` compose profile.
- Optional Sentry error tracking (`SENTRY_DSN` + `@sentry/node`) and process-level
  unhandled-rejection/exception capture.
- Opt-in global API rate limiting (`RATE_LIMIT_ENABLED` after `TRUST_PROXY`).
- Insights endpoints no longer echo raw internal error text to clients/the model.
- New indexes: `time_entries(user_id, project_id, entry_date)`,
  `ai_messages(conversation_id, created_at)` + partial pending-approval index.

### Code quality
- CI quality gates now blocking: backend type-check + lint, frontend type-check + lint + build
  + unit tests (backend tests pending first real CI-run validation).
- ESLint error backlog cleared (61→0) incl. real rules-of-hooks violations;
  frontend tsc backlog cleared (97→0) incl. missing API-returned type fields and a
  react-query context-object-as-params bug; `eslint-plugin-unused-imports` auto-removes
  unused imports.
- God-files split: AI assistant service, AI insights controller, expense controller
  (facades keep public surfaces; routes untouched).
- Test suite 340 → 367 backend tests, incl. 10 integration tests for the tool loop and
  approval flow; deterministic uuid stub unblocks jest for ESM-only uuid.
- Full pre-push adversarial review (8 finder angles + verification) — all confirmed
  correctness findings fixed; deferred items catalogued in `docs/ai-architecture-notes.md`.
- Dead code removed (legacy frontend router, A2A executor, parked dead UI state).

### Frontend performance
- Route-level code splitting + vendor chunking: initial JS ~4.4 MB → ~190 kB entry
  (+ on-demand chunks); pdfmake/exceljs/chart.js load only when used.

## v1.3.0 — Agentic AI assistant
- Human-in-the-loop write approval (batch approve/reject), per-request tool curation with
  role enforcement, plan-then-act prompting, correctness fixes (concurrency, history window,
  loop finalization), cancellation, parallel reads. Dashboard: Project Time Budgets hidden
  for projects without an estimate.
