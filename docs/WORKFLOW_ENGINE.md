# Workflow engine

Business flows — "have the timesheet signed, then send the invoice with the signed sheet
attached" — are drawn on a canvas from building blocks of OpenTyme and then run per client and
period. This document describes the model, the semantics and the API. The types live in
`backend/src/types/workflow.types.ts` (mirrored in `frontend/src/api/types/workflow.types.ts`).

Built so far: the engine, the canvas editor, the task list, manual and scheduled starts, the
billing actions and test runs (stage 1); events as starts and as something to wait for, the
cancellation and correction documents, parallel branches (stage 2); subjects, actions and events
from addons and the assistant's flow tools (stage 3).

## Concepts

| Term | Meaning |
|---|---|
| **Flow** (definition) | The drawing: a graph of nodes and edges, owned by one user. Has an editable *draft* and, once published, immutable *versions*. |
| **Run** | One execution of a published version for a *subject* (a client, project or invoice — or a record of an addon) and a period. Table `workflow_runs`. |
| **Step** | One visit of a run to a node, with its input, output, outcome and error. The steps are the run's history. |
| **Task** | Something that waits for the user: an upload, a confirmation, a form, the approval of an action — or a notice that blocks nothing. |
| **Run data** | What nodes can refer to: the subject, the period, and every earlier step's output. |

## Nodes

| Type | Does | Exits (`sourceHandle`) |
|---|---|---|
| `start` | Where a run begins. `trigger: 'manual'`, `'schedule'` (monthly, per listed subject) or `'event'` (whenever the event happens, optionally only for some clients). Exactly one per graph. | `out` |
| `action` | Runs a catalog action with resolved input. `mode: 'auto'` runs at once; `'approval'` opens an approval task first. | `out` |
| `task` | Opens a task and waits. Kinds: `confirm`, `upload`, `form`. With `dueInDays` it expires. | `out`, `rejected` (confirm only), `timeout` (with `dueInDays`) |
| `wait` | `mode: 'duration'` (default) waits `days` / `hours`. `mode: 'event'` waits until `event` happens to `subject` (the record's id; default: the run's own subject, if the event happens to that kind of record), at most `timeoutDays`. | `out`, `timeout` (event wait with `timeoutDays`) |
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
| `<block>.<key>` | Run data of an addon's subject, e.g. `application.company` (see the catalog's `variables`) |
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

New actions are registered with `registerWorkflowAction()` (`services/workflow/workflow-actions.ts`);
addons do it through `context.workflows` — see [Addons](#addons).

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
  about that kind of record whose start is this event (and whose client filter fits) get a run of
  their own — one per event, started by `event`.
- Everything else — above all an addon — records its events with `emitWorkflowEvent()`
  (`services/workflow/workflow-events.ts`); the engine is told at once.
- Guards: an event starts nothing if the invoice itself was not created / changed within the last
  24 hours (a restore or an import is not news; a dump is also restored with an empty search path,
  under which the trigger writes nothing); a flow is started by events at most 60 times an hour; a
  flow that starts on `invoice.created` and creates an invoice is refused at publish (`EVENT_LOOP`).
- A wait for a status event (`sent`, `partially_paid`, `paid`, `cancelled`) that the invoice has
  already reached continues at once (an event's `reached` hook).

## Parallel branches

A parallel gateway's exits carry no conditions; each becomes a branch with its own steps. Where the
branches meet, a second parallel gateway collects them (`input.arrived` on its waiting step) and
runs when all its entries have arrived. Without a join, each branch runs to its own end, and the
run completes with the last one. An incident in one branch makes the run an incident; cancelling
ends all branches.

## Subjects

What a flow is about is registered like the actions (`services/workflow/workflow-subjects.ts`). A
subject loads its record for the owner, names it in lists, lists the owner's records for pickers
and contributes run data.

| Subject | Run data | Scheduled start |
|---|---|---|
| `client` | `client.*` | yes, for a list of clients |
| `project` | `project.*`, `client.*` | yes, for a list of projects |
| `invoice` | `invoice.*`, `client.*`, `project.*` (if it has one) | no — invoices come and go; start by event instead |
| `none` | — (not a subject but the absence of one) | yes, once |

## Addons

An addon makes its own records, features and events part of the flows users draw. It gets
`context.workflows` in `initialize()`:

```typescript
async initialize(context: PluginContext): Promise<void> {
  const { database: db, workflows } = context;

  // 1. Something a flow can be about.
  workflows.registerSubject({
    key: 'applications.application',          // lower case, prefixed with the addon's name
    title: 'Application',
    schedulable: false,                       // true: a scheduled start can list such records
    variables: [                              // run data, besides what every run has
      { path: 'application.id', type: 'string', label: 'Application' },
      { path: 'application.company', type: 'string', label: 'Application: company' },
    ],
    // The record for its owner — null when it does not exist or is not theirs.
    load: async (userId, id) => {
      const { rows } = await db.query('SELECT id, position, company FROM applications WHERE id = $1 AND user_id = $2', [id, userId]);
      if (!rows[0]) return null;
      return { id, label: `${rows[0].position} · ${rows[0].company}`, blocks: { application: rows[0] } };
    },
    // For pickers (start dialog, assistant): at most a few hundred, best matches first.
    options: async (userId, search) => { /* … → [{ id, label }] */ },
    i18n: { de: { title: 'Bewerbung' } },
  });

  // 2. A step users can put into a flow.
  workflows.registerAction({
    key: 'applications.setStatus',
    category: 'applications',
    categoryTitle: 'Applications',            // heading in the palette
    title: 'Set application status',
    description: 'Moves the application to another status.',
    effect: 'write',                          // 'external' = leaves the system; never repeated automatically
    defaultMode: 'auto',                      // or 'approval'
    input: [
      { key: 'applicationId', type: 'string', label: 'Application', required: true, default: { $ref: 'application.id' } },
      { key: 'status', type: 'select', label: 'New status', required: true, options: ['sent', 'invited', 'declined'] },
    ],
    output: [{ key: 'previousStatus', type: 'string', label: 'Status before' }],
    // What of OpenTyme's API the action calls through ctx.api — granted to the flow when it is published.
    needs: () => ({}),
    execute: async (input, ctx) => { /* ctx.userId, ctx.testMode, ctx.api, ctx.notify … */ return { previousStatus }; },
    i18n: { de: { category: 'Bewerbungen', title: 'Status der Bewerbung setzen', fields: { status: 'Neuer Status' } } },
  });

  // 3. Something that can happen to the subject: flows start with it or wait for it.
  workflows.registerEvent({
    key: 'applications.answered',
    subject_type: 'applications.application',
    title: 'Application answered',
    description: 'The company has answered the application.',
    output: [{ key: 'answer', type: 'string', label: 'Answer' }],
    // Optional, for a state the record reaches and keeps: a wait that starts afterwards goes on at once.
    reached: async (userId, id) => { /* … → false, true or what the event would have carried */ },
  });
}

// 4. Where the addon changes the record:
await context.workflows.emitEvent({ userId, type: 'applications.answered', subjectId: application.id, payload: { answer: 'invited' } });
```

- **Ids are UUIDs** — a run stores its subject's id in a `uuid` column, and so does an event.
- **`load` and `options` are scoped to the user they are given.** A record of somebody else is
  "not found"; the engine relies on that.
- **Keys** are lower case (`a-z`, digits, `.`, `_`, `-`; at most 60 characters) and carry the
  addon's name as a prefix. Registering a key again replaces the earlier definition.
- **Run data** of an addon's subject is typed `string`, `number`, `boolean`, `date` or `email`; ids
  of its own records are `string`s. If a subject belongs to a client, put a `client` block (`id`,
  `name`, `email`, `invoice_email`, `contact_person`) into `blocks` and list its `client.*`
  variables: then mails to the client, uploads (which are filed with a client) and the client
  filter of an event start work for it too.
- **Actions** run in the backend with the run's own credential: `ctx.api` reaches exactly what
  `needs()` declares, shown to the user before publishing. Work on the addon's own tables needs
  nothing declared. In a test run (`ctx.testMode`) nothing may reach a third party or become final.
- **Events:** `emitEvent` inserts the event and has the engine look at it right away; it survives a
  restart. Flows of the given user that start with it get a run each (at most 60 an hour per flow),
  runs waiting for it on that record continue with the payload as the step's output. An event
  recorded more than 24 hours ago starts nothing (`occurredAt` lets the record's own timestamp
  decide instead, as for invoices).
- **One run per record and period:** started by hand, a flow runs once per record and period
  (the current month, unless the start dialog asks for one — it does for schedulable subjects).
  Starts by event are not limited that way: every event gets its run.
- **Texts:** `title`, `description` and the labels are English; `i18n` holds other languages. The
  catalog is requested with the user's language, so the editor shows the addon's own translation.
- **When an addon is disabled**, flows about its subject stay but are not valid (`UNKNOWN_SUBJECT`)
  and cannot be started; a run that reaches one of its actions stops as an incident.

## Assistant

The assistant has five tools for flows (`services/ai/workflow-tools.ts`). They call the routes
below with the user's own authorization.

| Tool | Does |
|---|---|
| `list_workflows` | The flows, what each runs for, whether it can be started. |
| `start_workflow_run` | Starts a flow by name for a client, project, invoice (…) named by the user. The names are resolved before the approval card is shown; an unknown or ambiguous name goes back as a question. |
| `list_workflow_tasks` | What flows are waiting for, and how each task is settled. |
| `settle_workflow_task` | Confirms or rejects a confirmation, fills in a form, dismisses a notice. |
| `get_workflow_runs` | Recent runs, or one run with its steps and what went wrong. |

Approving an action stays on the Tasks page — the approval exists so that a person sees what is
about to be sent — and so do uploads. Drawing and publishing flows stays in the editor.

## API

All routes are under `/api/workflows`, authenticated like the rest of the API, and scoped to the
caller's own flows. API tokens need the `workflows` permission (`read` to look, `write` to start
runs and settle tasks). Creating, editing, publishing and deleting flows needs a signed-in
session, and so does approving or skipping an action — the approval exists so that a person
looks at what is about to be sent. A token can only start a flow whose permissions it holds itself.

| Method and path | Body → Response |
|---|---|
| `GET /catalog` | query `lang` (default: the request's `Accept-Language`) — the language addons' entries are named in → `WorkflowCatalog` |
| `GET /subjects/:type/options` | query `search` → `Array<{ id, label }>` (at most 200): the caller's records of a subject type, for pickers; 404 for a type flows cannot be about |
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
until an event) — `subject_type` columns are free text, since addons bring subjects of their own — created at startup (`ensureWorkflowTables()`) and by `init.sql`, together with the
trigger `workflow_invoice_events` on `invoices`. `client_documents` gains the
types `timesheet` and `timesheet_signed` and the columns `invoice_id`, `period_start`, `period_end`.
