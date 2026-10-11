# Changelog

## Unreleased (since v1.5.0)

### Security — every account only ever sees and changes its own data
- **Fixed: several endpoints did not check who owns a record.** Invoices, projects, time
  entries, payments, expenses and recurring invoices could be read, changed or deleted by id
  from another account, and records could reference another account's clients, projects or
  invoices — linking an own payment to a foreign invoice even set it to "paid". Every access
  is now limited to the signed-in user (another account's record answers "not found"), and a
  two-user test suite covers every entity.
- System initialization endpoints are admin-only.
- Payments are saved in a real database transaction (before, its steps could run on different
  connections).
- API keys and the SMTP password are no longer sent to the browser; they are write-only in the
  settings ("stored" — replace / remove).
- The document converter (MCP server) is no longer reachable from the network — it has no
  login and can fetch arbitrary URLs — and the backend no longer has access to the Docker
  socket. *Apply with `docker compose --profile mcp up -d mcp-server backend`.*

### AI assistant — reliable with local models
- **Answers stream live.** Responses were compressed and therefore held back until the run
  ended; text, tool steps and keep-alive pings now arrive as they happen.
- **Stop really stops** — the run ends on the server too. Approved changes already being
  executed finish and are recorded; the rest are offered for approval again.
- **Clear messages instead of raw errors**: model server not reachable, too slow, wrong API key,
  model not available, conversation too long, session expired, previous request still running.
- **"Test connection"** in the AI and speech-to-text settings — lists the server's models,
  one click to use one. Only providers that actually work are offered.
- Approval cards show what will really happen: "log time" names the resolved project, ambiguous
  project names are asked back instead of guessed. Edits to a proposal survive closing the
  editor; a newer proposal can no longer be declined by an outdated card.
- Dates like "last week", "last Monday" or "KW 41" are resolved reliably (the assistant gets
  the calendar of the current and previous week).
- Long runs with slow local models are no longer cut off after two minutes; an expired session
  token is renewed before the request.
- The chat keeps a message that could not be sent (retry), keeps the input focused, scrolls
  only while you are at the bottom, renders formatting (bold, lists, code) safely, and shows a
  badge when changes wait for approval. The microphone is released when the panel closes.
- Turning the assistant or voice input on or off applies without a reload.
- Fixed: updating an invoice through the assistant always failed; binary downloads (PDFs, the
  tax ZIP) are no longer offered to the model as tools.

### Receipts and AfA
- **Receipts larger than about 1 MB** (typical phone photos, scans) failed to upload to the
  document converter — fixed.
- **The AfA analysis never sent the API key**, and when the AI failed it silently returned a
  rule-based result that was shown and stored as AI analysis. Results are now marked
  "rule-based estimate" when the AI was not available and are not stored as AI analysis.
- The rule-based fallback follows the 800 € (GWG) and 1000 € (pool) limits and the category's
  useful life; 0 % deductibility and 0 % VAT are kept instead of turned into 100 % / 19 %.
- German amounts ("1.234,56") and impossible dates on receipts are handled; with the AI
  switched off the receipt text is copied to the notes.
- Fixed: deleting a time entry that appears on an invoice failed (a database trigger wrote a
  column that did not exist).

### Frontend — a modern, calmer interface that is always up to date
- **Numbers update without reloading.** Saving anything — a time entry, a timer, a payment,
  an invoice, a rate change, an action approved in the AI assistant — refreshes everything
  derived from it: dashboard totals, analytics charts, project budgets, AfA schedules. Before,
  only a few lists refreshed and the dashboard needed a hard reload. Other open tabs of the app
  update too, and coming back to the tab picks up changes made elsewhere. Changed key figures
  count to their new value and briefly highlight.
- **New app layout**: a sidebar with icons and a clear active state (collapsible; a drawer on
  phones), a slim top bar showing the current section, a **running timer visible on every
  page** (click to jump to it), a quiet indicator while data refreshes, the theme switch and
  an account menu with profile, settings, appearance (light / dark / system) and language.
- **Quick navigation with Ctrl/⌘+K**: jump to any page, settings tab or addon, switch theme or
  language by typing.
- **One consistent look**: a neutral palette with the violet brand colour (no more purple-pink
  gradients, glows and pulsing background blobs), self-hosted Inter font, bordered form fields
  with a clear focus ring, consistent tables, status badges and empty states; icons instead
  of emoji. Light mode is fully readable everywhere (several dialogs and all charts were
  styled for dark mode only).
- **Subtle motion**: pages fade in, card grids appear one after another, dialogs and menus open
  and close smoothly, tab indicators slide. All of it is switched off when the system asks
  for reduced motion.
- **Feedback where it was missing**: short confirmations after saving or deleting, styled
  confirmation dialogs instead of browser pop-ups, errors that were only logged are shown.
- Every page got a pass: a dashboard with a clear hierarchy and quick actions; a tracking page
  built around the timer; grouped client/project forms and a timeline of hourly rates;
  invoices with a clear detail view and the rare actions in a menu; expenses with drag & drop
  receipts; a settings area with its own navigation; report types as cards; a calm landing
  page and sign-in pages; a redesigned AI assistant panel (a sheet on phones).
- Many strings that were English-only or German-only are now translated in both languages.
- Fixed: reloading a page (e.g. Zeiterfassung) landed on the dashboard instead of staying there.
- Fixed: the landing page was unreachable when signed out (it redirected to the login).
- Fixed: returning to a tab after a while could log you out — an expired session token is now
  renewed before the first request.
- Fixed: "Rechnung erstellen" on the dashboard opens the invoice form; recent invoices on the
  dashboard showed amounts in USD; dates shifted by a day west of UTC on the dashboard.

### Hourly rates — a change always has a start date
- **Changing a rate now always asks from when it applies.** Editing the rate on the project
  form used to apply it silently "from today" — wrong for a contract extension starting on
  the 1st of next month. The project form now asks "Ab wann gilt der neue Stundensatz?" as a
  required field with one-click picks (today, 1st of next month, 1 January), and the API
  refuses a rate change without `hourly_rate_valid_from` (`RATE_START_DATE_REQUIRED`) so no
  other path — including the AI assistant — can skip it.
- **See what a change does before saving it**: old → new rate with the percentage, when it
  takes effect, where it ends if a later rate is already agreed, and which entries are already
  logged in the new period.
- **A rate valid from a date applies to everything dated from that day — including entries
  already logged.** Changed on the 10th, valid from the 1st: the entries of the 1st to the 9th
  move to the new rate. Entries dated before the start date are never touched, and neither are
  individually priced ones (a goodwill hour at 0 €, a rate set by hand on one entry). Moving them
  can be switched off per change, e.g. when that work is already invoiced; the form warns when
  invoices were issued to the client since the start date. The same applies when a period is
  corrected or deleted: entries that followed it follow the change.
- The rate history shows entries inside a period that do not carry its rate ("13 entries are
  still at 80,00 €") and aligns them in one click — only the entries at that rate.
- The rate dialog leads with what applies now and the next scheduled change, shows the history
  as a timeline with German dates and percentage steps, and translates the notes the system
  writes itself. Deleting a period is confirmed inline.
- Fixed: the dashboard (and any page opened again within a few minutes) kept showing totals
  from before a change. Pages now reload data that a change marked as outdated; data that has
  merely aged is still not refetched on every visit.
- The project list shows a scheduled change next to the current rate ("ab 01.01.2027: 95,00 €")
  and formats rates and dates in the app's language.
- Fixed: saving the project form without touching the rate (e.g. renaming) created a new rate
  period starting today. Fixed: updating a project was not scoped to its owner.

### Client documents — contracts you can see expiring
- **Every contract shows where it stands**: running, ends in N days (60-day warning), expired,
  or not yet started — and the ones needing attention sort to the top.
- **"Verlängern" in one step**: the extension starts the day after the current term ends,
  "+6/+12 Monate" fill the end date, the previous version stays downloadable — and if the new
  contract changes the hourly rate, it is set right there for the contract's project, with the
  same start-date requirement, preview and opt-in for already-logged entries.
- The client list flags clients with a contract ending soon, and shows how many documents are
  stored.
- Upload by drag & drop onto the dialog, the title is taken from the file name, and the save
  button sits in the footer instead of below the fold. PDFs and images open in a new tab.
- Calmer cards: one line of metadata instead of an overlapping grid (fixes text running into
  the next column), version badges only where a document actually has versions, rarely used
  actions in a "⋯" menu, delete confirmed inline.
- Fixed: opening the upload or new-rate form submitted it immediately and showed validation
  errors on an empty form — the opening button's DOM node was reused as the submit button
  mid-click.


## v1.5.0 (2026-09-09)

### Projects — hourly rates that change over time
- **Raising a rate no longer re-prices work you already logged.** A project's rate is now a
  timeline (`project_rate_history`) rather than a single number: each row is the rate valid
  from a date until the next one. Time entries capture the rate that applied on the day the
  work happened, at the moment they are created, so agreeing a new rate for January leaves
  December's hours — and any invoice built from them — exactly as they were.
- You can schedule a rise in advance: a rate whose `valid_from` is in the future sits in the
  timeline as "scheduled" and takes effect on its own date, with no further action.
- `projects.hourly_rate` is kept as the rate effective *today*, so every existing screen and
  report that shows a project's rate keeps working unchanged. It is derived from the timeline
  now, not the source of truth.
- **Migration**: existing databases are backfilled on the next backend start — one opening
  rate row per project (reaching back to that project's earliest time entry, so no logged work
  falls into a gap), then every time entry that never captured a rate is stamped with the rate
  effective on its own date. Idempotent, and it deliberately leaves `updated_at` untouched so
  years of history don't all look freshly edited.
- The time entry form now fills in the rate effective on the *entry's* date rather than the
  project's current rate — otherwise back-dating an entry after a rise would have billed it at
  the new rate.
- **Invoice fix**: generating an invoice from time entries grouped everything for a project
  under whichever rate the query returned first (the oldest entry's), so every hour after a
  rate change was mis-billed. Entries are now grouped by project *and* rate, with the rate
  named in the line description when a project contributes more than one.

### Clients — contracts and other signed documents
- Store the documents signed with a customer: multiple per client, each optionally tied to one
  of that client's projects, with title, type (contract, amendment, NDA, offer, order, terms),
  signature date and validity period.
- **Versioning**: uploading a replacement links it to the document it supersedes and keeps the
  predecessor and its file intact and downloadable — a superseded contract is history, not
  something to delete. Earlier versions are collapsed behind the current one in the UI.
- PDFs, scans and photos (JPEG/PNG/WebP) and Word/ODT files up to 25 MB, enforced server-side.
- Deleting a client now removes its stored document files first; the cascade would otherwise
  have stranded them in object storage forever, with no garbage collection anywhere.

### Fixes found while reviewing and testing the above
- **A signed document could be superseded twice.** Uploading a new version locked
  the document being replaced and derived the new version number from it — but
  nothing ever writes that number, so the lock protected nothing and two
  simultaneous uploads both became "version 2", one of them then hidden in the
  list. Being replaced is a question with one answer, so that is now enforced by
  the database; the second upload is refused with a message naming the version
  that won.
- **A deleted rate period came back.** The startup backfill decided "has this
  already run?" by asking whether the project had any rate history, so deleting a
  project's last period made the next restart re-create it. Migrations now record
  that they ran.
- **Setting an hourly rate to 0 silently cleared it**, and an entry with no rate
  is billed at the project's current rate — so writing off an hour could quietly
  re-price it later.
- **Creating a project through the UI never opened its rate timeline** (a date
  conversion produced an invalid value that was swallowed), so the first rate
  added afterwards applied to all earlier work as well.
- **Logging time with seconds in the start time returned a server error.** The API
  accepted `HH:MM:SS` and then built an invalid timestamp from it; only `HH:MM`
  worked. Pre-existing, and not reachable from the app's own forms.
- Invoices no longer show a phantom 0,00 line for a running timer, and a rate
  shown in a line description is now formatted as currency.
- Client deletion removes its document files only after the client is actually
  gone. Deleting them first destroyed every contract of a client that could not
  be deleted (any client that has ever been invoiced), with no way to get them
  back.

### Build and tooling
- **CI had not run since June.** The repository only permitted actions defined
  inside itself, so every workflow failed to start before executing a single
  step — including the v1.4.0 and v1.4.1 releases. GitHub-authored actions are
  now allowed, and the workflow can be triggered manually.
- The frontend lint gate ran with `--max-warnings 0` against a 168-warning
  backlog while the workflow documented the opposite. It is now a ratchet at 175:
  errors fail, the backlog does not block, and the count cannot grow unnoticed.
- `npm test` in the backend test container silently tested a stale copy of the
  source; the image bakes it in and mounts only the coverage directory.

### Security — multi-tenant isolation
- `ClientService.findById`, `update` and `delete` carried no `user_id` filter, so a client id
  from a request reached another tenant's data. All three are now scoped, and every new rate
  and document query carries its tenant predicate inside the statement that reads or writes.
- Starting a timer resolved the project through an unscoped lookup and stamped that project's
  rate — another tenant's project id was enough. It now verifies ownership first.


## v1.4.1 (2026-08-12)

### Clients — billing fields
- **Saving a client no longer fails with a 400.** The controller's Joi whitelists never
  gained the billing fields that the form, the service and the `clients` table already
  supported, and Joi rejects unknown keys — so any client carrying a Rechnungs-E-Mail
  (or any billing address value) was rejected outright on both create and update. Both
  schemas now share one `billingFields` block so they can't drift apart again; malformed
  values and genuinely unknown keys are still rejected.
- **The separate-billing-address checkbox persists.** `use_separate_billing_address` was
  local UI state that was never submitted, while the invoice PDF branches on it to pick the
  recipient — so a filled-in billing address never actually reached an invoice. The form now
  sends it, and prefers the stored flag when reopening (falling back to inferring from the
  data for clients saved earlier).
- New `billing_tax_id` column on `clients` (the billing address's VAT number, distinct from
  the client's own `tax_id`); the form field existed with nothing behind it. Applied
  additively at startup, so existing databases pick it up on the next boot.
- New `client.controller.test.ts` pins the validation regression; `billing_tax_id`
  round-trips are covered in the service tests.

## v1.4.0 (2026-08-04)

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

### Depreciation (AfA)
- **Degressive AfA implemented** (declining-balance per §7(2) EStG): a fixed
  percentage of the remaining book value each year with the mandatory switch to
  straight-line, first-year month pro-rata, and an exact sum to net_amount. The
  rate `min(FACTOR × linear, CAP)` is configurable (`DEPRECIATION_DEGRESSIVE_FACTOR`
  / `_CAP`, default the 2024 rule 2× / 20%) because the legal cap is year-dated.
  Previously the UI's Degressive option silently produced a linear schedule.
- **Single-year fix**: a 1-year schedule with a mid-year start now depreciates
  the full net amount (was only the pro-rated fraction).
- **Exact totals**: each year rounds to cents and the last year absorbs the
  residual, so the schedule sums to net_amount and closes at 0 book value.
- New `expense-depreciation.service.test.ts` (6 tests) covers linear, degressive,
  the invariant, and the rate overrides.

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

### Reports & time tracking
- Timesheet (Zeiterfassung) PDF is now a signable proof-of-work sheet: every page footer
  shows the worker identity (`Mitarbeiter: <name> · <email>`, taken from the company settings
  on the Konfiguration page), and the final page carries an end-customer sign-off block
  (Ort/Datum + Unterschrift, "Bestätigung durch den Auftraggeber"). Applies to the PDF
  download, emailed report, and email-attachment paths.

## v1.3.0 — Agentic AI assistant
- Human-in-the-loop write approval (batch approve/reject), per-request tool curation with
  role enforcement, plan-then-act prompting, correctness fixes (concurrency, history window,
  loop finalization), cancellation, parallel reads. Dashboard: Project Time Budgets hidden
  for projects without an estimate.
