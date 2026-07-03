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

## Open (research incomplete — session limit)
Three lenses did not complete and can be re-run: HITL products deep-dive,
context/memory management, streaming/AG-UI protocol evolution (includes the known
pending-approval-lost-on-reload gap).
