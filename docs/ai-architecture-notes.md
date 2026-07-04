# AI assistant — architecture review notes (June 2026)

Findings from a sourced review of 2025–2026 agent-architecture practice
(Anthropic/LangChain/OpenAI Agents SDK/Vercel AI SDK guidance, qwen + local-server
documentation and issue trackers), compared against this codebase.

## Validated — keep as is
- **The plain tool-calling (ReAct-style) loop is the production default.** Frameworks
  converged on model+tools+prompt in a loop with hooks; plan-and-execute is a niche for
  long stable pipelines and is a poor fit for our short, feedback-driven, HITL-paused
  chats. No architecture migration warranted.
- **Iteration budget 12 + forced tool-free wrap-up** sits inside the industry band
  (OpenAI 10, Vercel 20, LangGraph 25) and mirrors LangGraph's graceful degradation.
- **Tool-result size caps + bounded window** are a *reliability* lever for Qwen-class
  models (format adherence degrades with long context), not just cost control.
- **HITL design** (gate all non-GET, batch approval, resume endpoint, stale-approval
  supersession) matches or exceeds what LangChain 1.0 ships as middleware.
- **Tool curation** is architecturally what Anthropic productized as the Tool Search
  Tool (~85% token reduction, accuracy gains). Keep.

## Integrated (this iteration)
- **Sampling**: temperature 0.2 → **0.7**, top_p **0.8** (Qwen function-calling docs).
  Near-greedy decoding is a documented *cause* of repeated-tool-call loops on Qwen MoE.
  Optional `AI_PRESENCE_PENALTY` env.
- **Tool cap 24 → 20** (documented ~20-tool reliability cliff for small models).
- **Repeat-call guard**: identical call (name + normalized args) executes at most twice
  per run; further repeats get a synthetic "result will not change" tool result.
- **Per-tool circuit breaker**: 3 consecutive execution failures disable the tool for
  the rest of the run and tell the model to switch approach.
- **Duplicate dedup**: byte-identical tool calls within one assistant response execute
  once (documented LM Studio duplicate-emission bug); keeps approval batches clean.
- **Malformed-argument repair**: invalid tool-call JSON is no longer silently executed
  as `{}` — the model receives a precise repair message; double-stringified arguments
  (a known qwen habit) are unwound automatically.
- **Prefix-cache stability** (biggest latency lever for LM Studio/llama.cpp):
  deterministic tool ordering, sticky per-conversation tool selection (append-only
  union, bounded), and history-window hysteresis (anchor trims to 30 and holds instead
  of sliding every turn).
- **Prompt rule**: answer directly without tools when the answer is already in context
  (counters documented eager tool calling by local models); never do arithmetic in the
  model.

## Operator checklist (LM Studio — no code)
- **preserve_thinking ON** for qwen3.6 (stripping interleaved thinking between tool
  calls degrades tool calling badly; documented for this exact model).
- **No restrictive max_tokens** on the server side — truncated tool-argument JSON
  surfaces as parse failures / wrong-arg loops.
- **Keep LM Studio updated** (changelog contains fixes for dropped parallel tool calls
  and stripped `$defs`).
- If tool-JSON validity is ever a persistent pain: run the same GGUF under
  `llama-server --jinja` (grammar-constrained arguments) or vLLM — a compose swap,
  not an app change.

## Deferred (adopt only on observed need)
- **Composite task-shaped tools** (e.g. `log_time(project_name, date, hours)` resolving
  the project server-side) — the highest-leverage next step *if* multi-hop chains keep
  misfiring; cuts 3-call chains to 1.
- **Schema pruning in the OpenAPI converter** (drop optional filter/pagination params,
  ≤~5 params/tool, everything required) — documented qwen failure shape; do a converter
  pass if wrong/omitted-parameter loops are observed.
- **Plan/todo no-op tool** — only if genuinely long tasks (>6 calls) become common.
- **Reflection/self-critique pass** — skip; grounded feedback already exists via tool
  results. Extend deterministic verification tools (get_time_pattern pattern) instead.
- **Approve-with-edited-args** in the approval UI — adopt if reject-retry churn shows up.
- **Per-iteration re-curation of tools** — only if missing-tool failures are observed.
- **List-response field projection** — only if 8k truncation is observed in logs.

## Round 2 (all five lenses complete; gap analysis + 2-lens adversarial verify ran)
55 findings total; 8 concrete gaps proposed against the code, 7 survived both
adversarial reviewers and were integrated:
- **Stream-stall watchdog** — axios timeout only covers time-to-first-byte; a mid-
  stream stall hung the run forever. Idle timer (AI_STREAM_IDLE_TIMEOUT_MS) destroys
  the stream so the loop errors out cleanly.
- **Atomic approval claim** — two concurrent /approve requests could double-execute
  the pending writes (SELECT→execute→UPDATE race). Now a single atomic UPDATE…
  RETURNING claims the newest pending row; the loser gets NO_PENDING.
- **Schema validation before execution/approval** — required keys, primitive types,
  enums checked against the OpenAPI-derived schema with field-path repair messages;
  invalid writes never reach the approval card.
- **finish_reason + max_tokens** — output capped (AI_MAX_OUTPUT_TOKENS); truncated
  tool calls are discarded with a retry instruction instead of executing garbage;
  truncated final answers are flagged.
- **`<think>` hygiene** — Qwen3 reasoning blocks stripped from the final content
  before persisting/replaying (incl. dangling unclosed blocks).
- **Timezone-correct dates** — "today"/"this month" in the prompt now use the app
  timezone (getCurrentDate), not UTC; CET users no longer get yesterday's date for
  the first hours after midnight.
- **Explicit error envelope** — failed tool results are wrapped as
  {error:true, http_status, body} so a 404 body can't read as success data.

Refuted by the verify panel (over-engineering at this scale): a whole-prompt token
budget on top of the existing window + tool-result caps.

Restored earlier (same research thread): chat history + pending-approval card after
page reload.

## Adversarial self-review (pre-push, 8 finder angles + verify pass)
Fixed immediately: approval re-arm on post-claim failure; atomic supersede claim
(no more approve/new-message race or metadata stomp); 404-only thread-wipe on
reload restore; canonical tool-argument encoding everywhere (approval card shows
exactly what executes; malformed args no longer share identity with valid calls);
stream-time <think> suppression (UI == persisted == A2A; empty-after-strip replies
fall to wrap-up); circuit breaker counts only infra failures (5xx/transport) and
once per round; TZ-safe calendar dates in get_time_pattern; deterministic tool-
result persistence order + ORDER BY id tiebreakers; ai_messages composite +
partial-pending indexes; conversation fetch bounded to newest 200.

Deferred (verified but consciously not churned now):
- Consolidate the two stuck-guards (batch-signature guard preempts the repeat
  guard's repair message for consecutive identical batches).
- Dead defensive parse branch in executeCall (unreachable from both call paths).
- Shared persistToolResult already added; supersede/reject paths could also share
  the synthetic-emit shape; 7× insights catch blocks → one helper in
  insights-shared.ts (also stop echoing raw DB errors to the model).
- Sticky tool set: FIFO eviction (Map.set doesn't refresh order), in-memory only
  (lost on redeploy — follow-up turns like "yes, create it" lose context);
  CORE_TOOL_NAMES has no startup existence check against built tools.
- Resume re-embeds the same user message per approve click (sticky fast path).
- Dead underscore-parked frontend state (ExpenseDetailModal notes UI — dead on
  origin/main too; ExpensesPage statusFilter; WeeklyHoursChart selectedTask;
  TimeEntryTable onStop/isStoppingId props) — delete rather than park.
- backup verify: stream tar listing instead of 10MB maxBuffer (false-fail at
  ~100k+ archive entries).
- think-strip regex duplicated in expense-extraction (divergent dangling-block
  handling); frontend/backend JSON helpers can't share without a common package.

## Delta self-review (post-fix commits 9eae8ca..HEAD, 4 finder angles on Opus)
Fixed: at-most-once resume (mark writes processed BEFORE execution, so a crash
mid-write never re-arms → no duplicate time entries on retry); supersession-aware
re-arm (skip if a newer user message exists + status-guarded UPDATE); edited args
execute on a CLONE (shared pending/audit list stays = the model's proposal);
stream `<think>` filter is case-insensitive (matches the /gi final pass; no live
CoT leak on <THINK>); think end-flush emits the held-back tail as a delta (live ==
persisted); backup tar verify discards stderr (no pipe-fill deadlock on a corrupt
archive); log_time_entry task_name/description optional (were `required` yet
documented as ""-if-absent, which validateToolArguments rejected — broke the
flagship back-logging workflow); empty-project guard in resolveProject; bounded
no-forward-progress break (stuck identical-batch loop stops in ~2 rounds after the
repair message instead of running to MAX_ITERATIONS).

Consciously deferred (single backend replica; documented, not fixed):
- **No per-conversation serialization.** `/run` and `/approve` are independent SSE
  endpoints; the approval lifecycle relies on atomic single-row claims rather than
  a conversation lock. Residual windows: (a) runLoop arms the approval metadata a
  moment after inserting the assistant row, so a supersede scanning in that gap
  sees no awaiting_approval row; (b) sticky-tool-set persist is a read-modify-write
  that last-writer-wins under two concurrent same-conversation turns. Both are rare
  (a user rarely fires two turns at once), self-heal (sticky set re-unions next
  turn; a mis-armed write still needs an explicit Approve), and would be closed
  properly by a Postgres advisory lock keyed on conversation_id if multi-replica or
  observed contention ever makes it worth the complexity.
- Cosmetic: parallel read-result cards can display in completion order live but
  load in call order on reload (results key by tool_call_id, so correctness holds);
  approve-with-edit live emit shows the raw tool result while the persisted form is
  the wrapped edited_by_user envelope.
