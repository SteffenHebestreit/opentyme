# Workflow engine

Business flows — "have the timesheet signed, then send the invoice with the signed sheet
attached" — are drawn on a canvas from building blocks of OpenTyme and then run per client and
period. This document describes the model, the semantics and the API. The types live in
`backend/src/types/workflow.types.ts` (mirrored in `frontend/src/api/types/workflow.types.ts`).

Built so far: the engine, the canvas editor, the task list, manual and scheduled starts, the
billing actions and test runs (stage 1); events as starts and as something to wait for, the
cancellation and correction documents, parallel branches (stage 2). An addon API for further
subjects, actions and events is the next stage.

## Concepts

| Term | Meaning |
|---|---|
| **Flow** (definition) | The drawing: a graph of nodes and edges, owned by one user. Has an editable *draft* and, once published, immutable *versions*. |
| **Run** | One execution of a published version for a *subject* (a client, project or invoice) and a period. Table `workflow_runs`. |
| **Step** | One visit of a run to a node, with its input, output, outcome and error. The steps are the run's history. |
| **Task** | Something that waits for the user: an upload, a confirmation, a form, the approval of an action — or a notice that blocks nothing. |
| **Run data** | What nodes can refer to: the subject, the period, and every earlier step's output. |

## Nodes

| Type | Does | Exits (`sourceHandle`) |
|---|---|---|
| `start` | Where a run begins. `trigger: 'manual'`, `'schedule'` (monthly, per listed subject) or `'event'` (whenever the event happens, optionally only for some clients). Exactly one per graph. | `out` |
| `action` | Runs a catalog action with resolved input. `mode: 'auto'` runs at once; `'approval'` opens an approval task first. | `out` |
| `task` | Opens a task and waits. Kinds: `confirm`, `upload`, `form`. With `dueInDays` it expires. | `out`, `rejected` (confirm only), `timeout` (with `dueInDays`) |
| `wait` | `mode: 'duration'` (default) waits `days` / `hours`. `mode: 'event'` waits until `event` happens to `subject` (an invoice; default: the run's own), at most `timeoutDays`. | `out`, `timeout` (event wait with `timeoutDays`) |
| `gateway` | `mode: 'exclusive'` (default) takes exactly one exit: edges are tried in order, the first whose `condition` holds wins; an edge without a condition is "otherwise". `mode: 'parallel'` takes all exits at once; with several entries it is a join and waits for every one of them. | `out` (several edges) |
| `end` | Ends its branch, optionally with a `result` text. The run ends when no branch is left. | — |

Only gateways may have more than one `out` edge. Loops are allowed (e.g. reminder → back to the
task). If a task has no edge for `rejected` / `timeout`, rejecting cancels the run and the task
simply stays open past its due date.

## Run data, references and conditions

A value in a node's configuration is a literal or a reference `{ "$ref": "path" }`. Text may embed
`{{path}}` placeholders. Paths:

| Path | Content |
|---|---|
| `subject.id`, `subject.type`, `subject.label` | The run's subject |
| `client.id`, `client.name`, `client.email`, `client.invoice_email`, `client.contact_person` | The client (subject `client`, `project`, `invoice`). `invoice_email` is the billing address if set, else the contact address. |
| `project.id`, `project.name` | Subject `project` (and `invoice`, if the invoice has one) |
| `invoice.id`, `invoice.number`, `invoice.total`, `invoice.status` | Subject `invoice` |
| `period.start`, `period.end`, `period.label` | `YYYY-MM-DD`; label e.g. `2026-10` |
| `owner.email`, `owner.name` | The flow's owner |
| `run.id`, `run.test`, `today` | |
| `event.type`, `event.<key>` | In a run an event started: what happened (`status`, `previous_status`, `reason` — see the catalog's `events`) |
| `steps.<nodeId>.<key>` | Output of an earlier step; `steps.<nodeId>.outcome` is the exit it took. A wait for an event outputs what the event carried. |

A condition is `{ match: 'all' | 'any', rules: [{ left: path, op, right }] }` with the operators
`eq ne gt gte lt lte contains empty not_empty`. Numbers compare numerically when both sides are
numeric. There is no free-form code anywhere in a flow.

## Execution

- A run pins the version it started with; publishing a new version never changes running runs.
- Every step is written to the database before it executes and again when it finishes. After a
  crash, steps left `running` are marked failed ("interrupted") and the run becomes an
  **incident** — an action with an outside effect is never repeated automatically.
- An incident waits for the user: **retry** the failed step, **skip** it (the run continues
  through `out` without the step's output) or **cancel** the run.
- A failed step keeps what went wrong as English text (`error`). Failures the engine raises
  itself also carry `error_code` and `error_params` — `INPUT_EMPTY` and `INPUT_NOT_ID` (with
  `action`, `field`, `label`), `NO_BRANCH`, `INTERRUPTED`, `TOO_MANY_STEPS`, `STEP_MISSING` — so
  the UI can say it in the user's language. What an API route or the mail server answered has
  no code; its text is shown as it is.
- An approval task's `payload.preview` is a list of rows `{ key?, label, value, valueKey? }`:
  `label` / `value` are English fallbacks, `key` names an input field of the action or a row
  of its own (`to`, `insteadOf`, `template`, `subject`, `attachments`, `afterwards`), and
  `valueKey` marks a fixed sentence (`invoiceMarkedSent`). What is approved is what runs: the
  input is resolved when the task opens and kept on the step.
- Actions call OpenTyme's own REST API over loopback with a short-lived internal credential that
  carries exactly the permissions the flow was published with (same model as API tokens,
  `services/auth/api-token-permissions.ts`). A flow cannot reach settings, system administration,
  token management or the workflow API itself.
- One run per flow, subject and period: a second start with the same key is refused (test runs
  are exempt).
- A **test run** executes the real flow, but mails go to the owner's address with a `[Test]`
  subject, invoices are not marked as sent, and stored documents get a `[Test]` title prefix.
- Timers (task due dates, waits, scheduled starts) are rows in `workflow_timers`; a one-minute tick
  fires what is due, including what came due while the server was down.

## Actions (stage 1)

| Key | Effect | Default mode | Input → Output |
|---|---|---|---|
| `time.summarize` | read | auto | client/project, period → `totalHours`, `billableHours`, `entryCount`, `billableValue` |
| `timesheet.generate` | write | auto | client/project, period, `hidePrices`, `lang` → `documentId`, `filename`, `totalHours` |
| `invoice.createDraft` | write | auto | client/project, period, `headline` → `invoiceId`, `invoiceNumber`, `total` |
| `invoice.pdf` | write | auto | `invoiceId`, `kind` (`invoice` \| `cancellation` \| `correction`), `zugferd` → `documentId`, `filename` |
| `invoice.cancel` | external | approval | `invoiceId` → `status` (needs the right to delete invoices; not executed in a test run) |
| `email.send` | external | approval | `to`, `templateId`, `attachInvoiceId`, `attachDocumentIds`, `markInvoiceSent` → `messageId`, `to` |
| `invoice.markSent` | write | auto | `invoiceId` → `status` |
| `document.link` | write | auto | `documentId`, `invoiceId`, `documentType` → `documentId` |
| `notify.owner` | write | auto | `message`, `email` → — (opens a notice in the task list) |

New actions are registered with `registerWorkflowAction()` (`services/workflow/workflow-actions.ts`).

## Events

| Event | Happens when |
|---|---|
| `invoice.created` | an invoice is inserted — by hand, from time entries, from a recurring invoice |
| `invoice.sent`, `invoice.partially_paid`, `invoice.paid`, `invoice.cancelled` | the invoice's status changes to that |
| `invoice.corrected` | a correction is saved (`correction_date` changes) |

- A database trigger on `invoices` writes the event into `workflow_events` inside the transaction
  that changed the invoice. That covers every writer — the service, the payment sync, the mail
  route's own status update — and an event exists exactly when the change does. The trigger
  swallows its own failures: it can never stop an invoice from being saved.
- `processEvents()` claims events on every tick, and right after a write to invoices, payments or
  mail (`workflowScheduler.nudge()`). For each event, runs waiting for it continue, and active flows
  about an invoice whose start is this event (and whose client filter fits) get a run of their own —
  one per event, started by `event`.
- Guards: an event starts nothing if the invoice itself was not created / changed within the last
  24 hours (a restore or an import is not news; a dump is also restored with an empty search path,
  under which the trigger writes nothing); a flow is started by events at most 60 times an hour; a
  flow that starts on `invoice.created` and creates an invoice is refused at publish (`EVENT_LOOP`).
- A wait for a status event (`sent`, `partially_paid`, `paid`, `cancelled`) that the invoice has
  already reached continues at once.

## Parallel branches

A parallel gateway's exits carry no conditions; each becomes a branch with its own steps. Where the
branches meet, a second parallel gateway collects them (`input.arrived` on its waiting step) and
runs when all its entries have arrived. Without a join, each branch runs to its own end, and the
run completes with the last one. An incident in one branch makes the run an incident; cancelling
ends all branches.

## API

All routes are under `/api/workflows`, authenticated like the rest of the API, and scoped to the
caller's own flows. API tokens need the `workflows` permission (`read` to look, `write` to start
runs and settle tasks). Creating, editing, publishing and deleting flows needs a signed-in
session, and so does approving or skipping an action — the approval exists so that a person
looks at what is about to be sent. A token can only start a flow whose permissions it holds itself.

| Method and path | Body → Response |
|---|---|
| `GET /catalog` | → `WorkflowCatalog` |
| `GET /templates` | query `lang` (`de` \| `en`; default: the request's `Accept-Language`) → `WorkflowTemplate[]` |
| `GET /definitions` | → `WorkflowDefinitionSummary[]` |
| `POST /definitions` | `{ name, description?, subject_type, graph? }` or `{ template: key, lang?, name? }` → `WorkflowDefinition` (201) |
| `GET /definitions/:id` | → `WorkflowDefinition` |
| `PUT /definitions/:id` | `{ name?, description?, graph? }` → `WorkflowDefinition` (saves the draft; never touches published versions) |
| `DELETE /definitions/:id` | → 204. Refused (409) while runs are active; history is deleted with the flow. |
| `POST /definitions/:id/validate` | `{ graph? }` (default: the draft) → `WorkflowValidation` |
| `POST /definitions/:id/publish` | → `WorkflowDefinition`; 422 `{ message, issues }` if the draft is invalid |
| `POST /definitions/:id/status` | `{ status: 'active' \| 'paused' \| 'archived' }` → `WorkflowDefinition` |
| `POST /definitions/:id/runs` | `StartRunRequest` → `WorkflowRun` (201); 409 `{ code: 'RUN_EXISTS', run_id }` for a duplicate |
| `GET /runs` | query `definition_id`, `subject_type`, `subject_id`, `status`, `limit` → `WorkflowRunSummary[]` |
| `GET /runs/:id` | → `WorkflowRun` |
| `POST /runs/:id/cancel` | → `WorkflowRun` |
| `POST /runs/:id/steps/:stepId/retry` | → `WorkflowRun` |
| `POST /runs/:id/steps/:stepId/skip` | → `WorkflowRun` |
| `GET /tasks` | query `status` = `open` (default) \| `closed` \| `all`, `run_id` → `WorkflowTask[]` |
| `GET /tasks/count` | → `{ open: number }` |
| `POST /tasks/:id/complete` | `confirm`: `{ comment? }`; `form`: `{ values }`; `upload`: multipart with `file` (+ optional `title`) → `WorkflowTask` |
| `POST /tasks/:id/reject` | `{ comment? }` — `confirm` tasks → `WorkflowTask` |
| `POST /tasks/:id/approve` | `approval` tasks: run the action → `WorkflowTask` |
| `POST /tasks/:id/skip` | `approval` tasks: skip the action, continue → `WorkflowTask` |
| `POST /tasks/:id/dismiss` | `notice` tasks → `WorkflowTask` |

Errors are `{ message }` with 400 (bad input), 404 (not found or not yours), 409 (wrong state,
e.g. a task that is already settled) and 422 (invalid graph).

## Tables

`workflow_definitions`, `workflow_versions`, `workflow_runs`, `workflow_steps`, `workflow_tasks`,
`workflow_timers`, `workflow_events` (what happened to an invoice) and `workflow_waits` (runs parked
until an event) — created at startup (`ensureWorkflowTables()`) and by `init.sql`, together with the
trigger `workflow_invoice_events` on `invoices`. `client_documents` gains the
types `timesheet` and `timesheet_signed` and the columns `invoice_id`, `period_start`, `period_end`.
