/**
 * What an addon adds to flows: a subject of its own, an action and events —
 * registered the way a plugin does it (PluginContext.workflows) and then
 * offered, validated, started and run like OpenTyme's own.
 *
 * The stand-in is a small "job applications" addon that keeps its records in
 * memory, where a real one has its own tables.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from 'crypto';
import { getDbClient } from '../../src/utils/database';
import { TEST_USER_ID } from '../setup';
import { ensureWorkflowSchema } from '../../src/services/workflow/workflow-schema';
import { WorkflowDefinitionService, WorkflowInputError } from '../../src/services/workflow/workflow-definition.service';
import { WorkflowEngine, WorkflowNotFoundError, WorkflowStateError } from '../../src/services/workflow/workflow-engine.service';
import { buildWorkflowCatalog, registerWorkflowAction } from '../../src/services/workflow/workflow-actions';
import { emitWorkflowEvent, onWorkflowEventEmitted, registerWorkflowEvent } from '../../src/services/workflow/workflow-events';
import { registerWorkflowSubject } from '../../src/services/workflow/workflow-subjects';
import { validateGraph } from '../../src/services/workflow/workflow-graph';
import type { WorkflowContext } from '../../src/types/plugin.types';
import type { WorkflowGraph, WorkflowNode, WorkflowRun } from '../../src/types/workflow.types';

const db = getDbClient();
const definitions = new WorkflowDefinitionService();
const OTHER_USER = '99999999-9999-4999-8999-999999999999';
const APPLICATION = 'applications.application';

// ── The addon ────────────────────────────────────────────────────────────────

interface Application {
  id: string;
  userId: string;
  position: string;
  company: string;
  status: 'draft' | 'sent' | 'invited' | 'declined';
}
const applications = new Map<string, Application>();

function newApplication(position: string, company: string, userId: string = TEST_USER_ID, status: Application['status'] = 'draft'): Application {
  const application: Application = { id: crypto.randomUUID(), userId, position, company, status };
  applications.set(application.id, application);
  return application;
}
const mine = (userId: string, id: string) => {
  const application = applications.get(id);
  return application && application.userId === userId ? application : undefined;
};

/** What a plugin's initialize(context) does with context.workflows. */
function initializeAddon(workflows: WorkflowContext): void {
  workflows.registerSubject({
    key: APPLICATION,
    title: 'Application',
    schedulable: false,
    variables: [
      { path: 'application.id', type: 'string', label: 'Application' },
      { path: 'application.position', type: 'string', label: 'Application: position' },
      { path: 'application.company', type: 'string', label: 'Application: company' },
      { path: 'application.status', type: 'string', label: 'Application: status' },
    ],
    load: async (userId, id) => {
      const application = mine(userId, id);
      if (!application) return null;
      const { position, company, status } = application;
      return { id, label: `${position} · ${company}`, blocks: { application: { id, position, company, status } } };
    },
    options: async (userId, search) =>
      Array.from(applications.values())
        .filter((application) => application.userId === userId)
        .filter((application) => `${application.position} ${application.company}`.toLowerCase().includes((search ?? '').toLowerCase()))
        .map((application) => ({ id: application.id, label: `${application.position} · ${application.company}` })),
    i18n: { de: { title: 'Bewerbung' } },
  });

  workflows.registerAction({
    key: 'applications.setStatus',
    category: 'applications',
    categoryTitle: 'Applications',
    title: 'Set application status',
    description: 'Moves the application to another status.',
    effect: 'write',
    defaultMode: 'auto',
    input: [
      { key: 'applicationId', type: 'string', label: 'Application', required: true, default: { $ref: 'application.id' } },
      { key: 'status', type: 'select', label: 'New status', required: true, options: ['sent', 'invited', 'declined'] },
    ],
    output: [{ key: 'previousStatus', type: 'string', label: 'Status before' }],
    // Works on the addon's own records, in-process: nothing of the OpenTyme API is needed.
    needs: () => ({}),
    execute: async (input, ctx) => {
      const application = mine(ctx.userId, String(input.applicationId));
      if (!application) throw new Error('The application does not exist.');
      const previousStatus = application.status;
      application.status = input.status as Application['status'];
      return { previousStatus };
    },
    i18n: {
      de: {
        category: 'Bewerbungen',
        title: 'Status der Bewerbung setzen',
        description: 'Setzt die Bewerbung auf einen anderen Status.',
        fields: { applicationId: 'Bewerbung', status: 'Neuer Status' },
        outputs: { previousStatus: 'Status davor' },
      },
    },
  });

  workflows.registerEvent({
    key: 'applications.answered',
    subject_type: APPLICATION,
    title: 'Application answered',
    description: 'The company has answered the application.',
    output: [{ key: 'answer', type: 'string', label: 'Answer (invited / declined)' }],
    // An answer stays: a run that starts waiting afterwards goes on with it.
    reached: async (userId, id) => {
      const status = mine(userId, id)?.status;
      return status === 'invited' || status === 'declined' ? { answer: status } : false;
    },
    i18n: { de: { title: 'Bewerbung beantwortet', outputs: { answer: 'Antwort (eingeladen / abgesagt)' } } },
  });
}

/** The addon's own code path for "the company has answered". */
async function answer(application: Application, status: 'invited' | 'declined'): Promise<void> {
  application.status = status;
  await context.emitEvent({ userId: application.userId, type: 'applications.answered', subjectId: application.id, payload: { answer: status } });
}

/** The context the plugin loader hands to an addon. */
const context: WorkflowContext = {
  registerSubject: registerWorkflowSubject,
  registerAction: registerWorkflowAction,
  registerEvent: registerWorkflowEvent,
  emitEvent: emitWorkflowEvent,
};

// ── Flows about an application ───────────────────────────────────────────────

const at = { position: { x: 0, y: 0 } };
const node = (id: string, type: WorkflowNode['type'], data: Record<string, unknown>): WorkflowNode => ({ id, type, ...at, data } as WorkflowNode);
const chain = (nodes: WorkflowNode[]): WorkflowGraph => ({
  nodes,
  edges: nodes.slice(1).map((target, index) => ({ id: `c${index}`, source: nodes[index].id, target: target.id })),
});

/** Send the application, wait for the answer, say what it was. */
const sendAndWait = (): WorkflowGraph =>
  chain([
    node('s', 'start', { trigger: 'manual' }),
    node('send', 'action', { action: 'applications.setStatus', mode: 'auto', input: { applicationId: { $ref: 'application.id' }, status: 'sent' } }),
    node('w', 'wait', { mode: 'event', event: 'applications.answered' }),
    node('e', 'end', { result: '{{application.position}}: {{steps.w.answer}} (vorher {{steps.send.previousStatus}})' }),
  ]);

const codes = (graph: WorkflowGraph, subject: string): string[] => validateGraph(graph, subject).issues.map((issue) => issue.code);

let engine: WorkflowEngine;

async function published(graph: WorkflowGraph, subjectType: string = APPLICATION, userId: string = TEST_USER_ID): Promise<string> {
  const definition = await definitions.create(userId, { name: `Addon ${crypto.randomUUID().slice(0, 8)}`, subject_type: subjectType, graph });
  const result = await definitions.publish(definition.id, userId);
  if (!result?.ok) throw new Error(`Not publishable: ${JSON.stringify(result)}`);
  return definition.id;
}
const runOf = async (runId: string) => (await engine.getRun(runId, TEST_USER_ID)) as WorkflowRun;
const stepOf = (run: WorkflowRun, nodeId: string) => run.steps.find((step) => step.node_id === nodeId);

beforeAll(async () => {
  initializeAddon(context);
  await ensureWorkflowSchema(db);
  await db.query(`DELETE FROM workflow_definitions WHERE user_id IN ($1, $2)`, [TEST_USER_ID, OTHER_USER]);
});

beforeEach(async () => {
  engine = new WorkflowEngine(
    {
      resolveOwner: async () => ({ email: 'owner@example.com', name: 'Olivia Owner' }),
      mailOwner: async () => undefined,
      // The addon's action needs nothing of the API; a call would be a mistake.
      createApi: () => new Proxy({}, { get: () => () => Promise.reject(new Error('unexpected API call')) }) as any,
    },
    definitions
  );
  // Events are global: what earlier tests raised must not be handled here.
  await db.query(`DELETE FROM workflow_events`);
  await db.query(`UPDATE workflow_definitions SET status = 'archived' WHERE user_id = $1 AND subject_type = $2`, [TEST_USER_ID, APPLICATION]);
});

afterAll(() => onWorkflowEventEmitted(() => undefined));

// ── The catalog ──────────────────────────────────────────────────────────────

describe('the catalog', () => {
  it('offers what the addon registered next to what OpenTyme brings', () => {
    const catalog = buildWorkflowCatalog();
    expect(catalog.subjects).toEqual(
      expect.arrayContaining([
        { key: 'client', title: 'Client', schedulable: true },
        { key: 'project', title: 'Project', schedulable: true },
        { key: 'invoice', title: 'Invoice', schedulable: false },
        { key: APPLICATION, title: 'Application', schedulable: false },
      ])
    );
    // Run data: the subject's own, plus what every run has. `none` has only the latter.
    expect(catalog.variables[APPLICATION].map((variable) => variable.path)).toEqual(
      expect.arrayContaining(['application.id', 'application.position', 'period.start', 'owner.email', 'today'])
    );
    expect(catalog.variables.none.map((variable) => variable.path)).not.toContain('client.id');
    expect(catalog.variables.invoice.map((variable) => variable.path)).toEqual(expect.arrayContaining(['invoice.number', 'client.name', 'project.name']));
    expect(catalog.actions.find((action) => action.key === 'applications.setStatus')).toMatchObject({
      category: 'applications',
      categoryTitle: 'Applications',
      title: 'Set application status',
      input: [expect.objectContaining({ key: 'applicationId', label: 'Application' }), expect.objectContaining({ key: 'status', label: 'New status' })],
    });
    expect(catalog.events.find((event) => event.key === 'applications.answered')).toEqual({
      key: 'applications.answered',
      subject_type: APPLICATION,
      title: 'Application answered',
      description: 'The company has answered the application.',
      output: [{ key: 'answer', type: 'string', label: 'Answer (invited / declined)' }],
    });
    // OpenTyme's own categories are named by the frontend.
    expect(catalog.actions.find((action) => action.key === 'email.send')).not.toHaveProperty('categoryTitle');
    // Functions and translations stay on the server.
    expect(JSON.stringify(catalog)).not.toContain('i18n');
  });

  it('names the addon\'s entries in the language asked for, where the addon ships it', () => {
    for (const lang of ['de', 'de-DE', 'DE']) {
      const catalog = buildWorkflowCatalog(lang);
      expect(catalog.subjects.find((subject) => subject.key === APPLICATION)?.title).toBe('Bewerbung');
      expect(catalog.actions.find((action) => action.key === 'applications.setStatus')).toMatchObject({
        categoryTitle: 'Bewerbungen',
        title: 'Status der Bewerbung setzen',
        description: 'Setzt die Bewerbung auf einen anderen Status.',
        input: [expect.objectContaining({ key: 'applicationId', label: 'Bewerbung' }), expect.objectContaining({ key: 'status', label: 'Neuer Status' })],
        output: [{ key: 'previousStatus', type: 'string', label: 'Status davor' }],
      });
      // Only the title and the output are translated; the description falls back to English.
      expect(catalog.events.find((event) => event.key === 'applications.answered')).toMatchObject({
        title: 'Bewerbung beantwortet',
        description: 'The company has answered the application.',
        output: [{ key: 'answer', type: 'string', label: 'Antwort (eingeladen / abgesagt)' }],
      });
    }
    expect(buildWorkflowCatalog('fr').subjects.find((subject) => subject.key === APPLICATION)?.title).toBe('Application');
  });

  it('refuses keys that could not be told apart or stored', () => {
    const subject = (key: string) => () =>
      registerWorkflowSubject({ key, title: 'X', variables: [], load: async () => null, options: async () => [] });
    expect(subject('none')).toThrow(/not a valid workflow subject key/);
    expect(subject('Applications')).toThrow(/not a valid/);
    expect(subject('a'.repeat(61))).toThrow(/not a valid/);
    expect(() => registerWorkflowEvent({ key: 'Has Spaces', subject_type: APPLICATION, title: 'X', description: '', output: [] })).toThrow(/not a valid/);
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe('drawing a flow about an addon\'s record', () => {
  it('accepts its run data, its action and waiting for its event', () => {
    expect(validateGraph(sendAndWait(), APPLICATION)).toMatchObject({ valid: true, issues: [], permissions: { resources: {}, capabilities: [] } });
    // Its events can start a flow about it …
    const onAnswer = chain([
      node('s', 'start', { trigger: 'event', event: { type: 'applications.answered' } }),
      node('e', 'end', { result: '{{application.company}}: {{event.answer}}' }),
    ]);
    expect(codes(onAnswer, APPLICATION)).toEqual([]);
    // … but not one about something else, and they carry only what they declare.
    expect(codes(onAnswer, 'invoice')).toEqual(expect.arrayContaining(['EVENT_SUBJECT']));
    (onAnswer.nodes[1].data as any).result = '{{event.previous_status}}';
    expect(codes(onAnswer, APPLICATION)).toEqual(['BAD_REFERENCE']);
  });

  it('knows what such a flow cannot do', () => {
    // Run data of other subjects is not there.
    const graph = sendAndWait();
    (graph.nodes[3].data as any).result = '{{client.name}}';
    expect(codes(graph, APPLICATION)).toEqual(['BAD_REFERENCE']);
    // The subject is not one a schedule can list.
    const scheduled = sendAndWait();
    Object.assign(scheduled.nodes[0].data, { trigger: 'schedule', schedule: { dayOfMonth: 1, period: 'previous_month', subjectIds: [crypto.randomUUID()] } });
    expect(codes(scheduled, APPLICATION)).toEqual(['BAD_SCHEDULE']);
    // An upload is filed with a client, and an application has none.
    const upload = chain([
      node('s', 'start', { trigger: 'manual' }),
      node('up', 'task', { kind: 'upload', title: 'Zeugnis hochladen', documentType: 'other' }),
      node('e', 'end', {}),
    ]);
    expect(codes(upload, APPLICATION)).toEqual(['UPLOAD_NEEDS_CLIENT']);
    expect(codes(upload, 'project')).toEqual([]);
  });

  it('a wait for an event of another kind of record must say which record', () => {
    const clientFlow = chain([
      node('s', 'start', { trigger: 'manual' }),
      node('w', 'wait', { mode: 'event', event: 'applications.answered' }),
      node('e', 'end', {}),
    ]);
    expect(codes(clientFlow, 'client')).toEqual(['WAIT_NO_SUBJECT']);
    // In a flow about an application the wait is about that application.
    expect(codes(clientFlow, APPLICATION)).toEqual([]);
    // And a flow about an invoice still waits for its invoice without being told.
    (clientFlow.nodes[1].data as any).event = 'invoice.paid';
    expect(codes(clientFlow, 'invoice')).toEqual([]);
    expect(codes(clientFlow, APPLICATION)).toEqual(['WAIT_NO_SUBJECT']);
  });

  it('a flow about something no addon provides (any more) is not valid, and cannot be created', async () => {
    expect(codes(sendAndWait(), 'crm.lead')).toEqual(expect.arrayContaining(['UNKNOWN_SUBJECT']));
    await expect(definitions.create(TEST_USER_ID, { name: 'Leads', subject_type: 'crm.lead' })).rejects.toThrow(WorkflowInputError);
  });
});

// ── Running ──────────────────────────────────────────────────────────────────

describe('running a flow about an addon\'s record', () => {
  it('loads the record, runs the addon\'s action and goes on when the addon reports its event', async () => {
    const flow = await published(sendAndWait());
    const application = newApplication('Mendix-Entwickler', 'Acme GmbH');

    let run = await runOf(await engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: application.id }));
    expect(run).toMatchObject({ status: 'waiting', subject_type: APPLICATION, subject_id: application.id, subject_label: 'Mendix-Entwickler · Acme GmbH' });
    expect(application.status).toBe('sent');
    expect(stepOf(run, 'send')?.output).toEqual({ previousStatus: 'draft' });

    // An answer to another application is not what this run waits for.
    await answer(newApplication('Tester', 'Globex AG'), 'declined');
    expect(await engine.processEvents()).toBe(1);
    expect((await runOf(run.id)).status).toBe('waiting');

    await answer(application, 'invited');
    expect(await engine.processEvents()).toBe(1);
    run = await runOf(run.id);
    expect(run).toMatchObject({ status: 'completed', result: 'Mendix-Entwickler: invited (vorher draft)' });
    expect(stepOf(run, 'w')?.output).toEqual({ event: 'applications.answered', answer: 'invited' });
  });

  it('does not wait for what has happened already', async () => {
    const flow = await published(
      chain([
        node('s', 'start', { trigger: 'manual' }),
        node('w', 'wait', { mode: 'event', event: 'applications.answered' }),
        node('e', 'end', { result: '{{steps.w.answer}}' }),
      ])
    );
    const declined = newApplication('Architekt', 'Initech', TEST_USER_ID, 'declined');
    const run = await runOf(await engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: declined.id }));
    expect(run).toMatchObject({ status: 'completed', result: 'declined' });
    expect(stepOf(run, 'w')?.output).toEqual({ event: 'applications.answered', answer: 'declined', alreadyHappened: true });
  });

  it('starts the flows that begin with the addon\'s event, for the record it happened to', async () => {
    const onAnswer = await published(
      chain([
        node('s', 'start', { trigger: 'event', event: { type: 'applications.answered' } }),
        node('e', 'end', { result: '{{application.company}}: {{event.answer}}' }),
      ])
    );
    // A start limited to some clients never fits a record that belongs to none.
    const forOneClient = await published(
      chain([
        node('s', 'start', { trigger: 'event', event: { type: 'applications.answered', clientIds: [crypto.randomUUID()] } }),
        node('e', 'end', {}),
      ])
    );
    const nudged = jest.fn();
    onWorkflowEventEmitted(nudged);

    const application = newApplication('Entwickler', 'Hooli', TEST_USER_ID, 'sent');
    await answer(application, 'invited');
    // The engine is told at once; it does not have to wait for its next tick.
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(await engine.processEvents()).toBe(1);

    const runs = await engine.listRuns(TEST_USER_ID, { definitionId: onAnswer });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'completed', started_by: 'event', subject_id: application.id, subject_label: 'Entwickler · Hooli', result: 'Hooli: invited' });
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: forOneClient })).toHaveLength(0);
    // Handled once: looking again starts nothing.
    expect(await engine.processEvents()).toBe(0);
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: onAnswer })).toHaveLength(1);

    // Somebody else's record sets off nobody else's flow.
    await answer(newApplication('Fremd', 'Anderswo', OTHER_USER, 'sent'), 'invited');
    await engine.processEvents();
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: onAnswer })).toHaveLength(1);
  });

  it('an event recorded long ago starts nothing', async () => {
    const onAnswer = await published(
      chain([node('s', 'start', { trigger: 'event', event: { type: 'applications.answered' } }), node('e', 'end', {})])
    );
    const application = newApplication('Entwickler', 'Umbrella', TEST_USER_ID, 'sent');
    await answer(application, 'declined');
    await db.query(`UPDATE workflow_events SET created_at = CURRENT_TIMESTAMP - interval '2 days' WHERE subject_id = $1`, [application.id]);
    expect(await engine.processEvents()).toBe(1);
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: onAnswer })).toHaveLength(0);
  });

  it('only records events that are registered', async () => {
    await expect(context.emitEvent({ userId: TEST_USER_ID, type: 'applications.withdrawn', subjectId: crypto.randomUUID() })).rejects.toThrow(
      /not registered/
    );
    expect((await db.query(`SELECT count(*)::int AS n FROM workflow_events`)).rows[0].n).toBe(0);
  });

  it('refuses a record that is missing, not the caller\'s, or of a subject that is gone', async () => {
    const flow = await published(sendAndWait());
    const start = (subjectId?: string) => engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId });
    await expect(start()).rejects.toThrow('Choose the application the flow runs for.');
    await expect(start(crypto.randomUUID())).rejects.toThrow(WorkflowNotFoundError);
    await expect(start(newApplication('Fremd', 'Anderswo', OTHER_USER).id)).rejects.toThrow('Application not found.');

    // The addon was removed after the flow was published.
    await db.query(`UPDATE workflow_definitions SET subject_type = 'crm.lead' WHERE id = $1`, [flow]);
    await expect(start(newApplication('Entwickler', 'Acme GmbH').id)).rejects.toThrow(WorkflowStateError);
    await expect(start(newApplication('Entwickler', 'Acme GmbH').id)).rejects.toThrow(/is its addon enabled/);
    expect((await definitions.validate(flow, TEST_USER_ID))?.issues.map((issue) => issue.code)).toContain('UNKNOWN_SUBJECT');
  });
});
