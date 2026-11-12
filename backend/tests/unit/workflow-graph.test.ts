/**
 * Workflow graphs: references and conditions over a run's data, what makes a
 * draft publishable, and which permissions a flow's runs end up with.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  collectPaths,
  evaluateCondition,
  getPath,
  interpolate,
  resolveValue,
} from '../../src/services/workflow/workflow-expression';
import { derivePermissions, validateGraph } from '../../src/services/workflow/workflow-graph';
import { getWorkflowTemplate } from '../../src/services/workflow/workflow-templates';
import { nextScheduledStart } from '../../src/services/workflow/workflow-definition.service';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '../../src/types/workflow.types';

const data = {
  client: { id: 'c1', name: 'Acme GmbH', email: '' },
  period: { start: '2026-10-01', end: '2026-10-31' },
  steps: { n1: { totalHours: 12.5, tags: ['a', 'b'], outcome: 'out' } },
};

describe('run data', () => {
  it('reads paths from own properties only', () => {
    expect(getPath(data, 'client.name')).toBe('Acme GmbH');
    expect(getPath(data, 'steps.n1.totalHours')).toBe(12.5);
    expect(getPath(data, 'client.missing.deeper')).toBeUndefined();
    expect(getPath(data, 'client.__proto__')).toBeUndefined();
    expect(getPath(data, 'constructor.prototype')).toBeUndefined();
    expect(getPath(data, 'client..name')).toBeUndefined();
  });

  it('resolves references, placeholders and lists', () => {
    expect(resolveValue({ $ref: 'client.id' }, data)).toBe('c1');
    expect(resolveValue({ $ref: 'client.nope' }, data)).toBeNull();
    expect(resolveValue('Hours for {{ client.name }} in {{period.start}}{{nope}}', data)).toBe('Hours for Acme GmbH in 2026-10-01');
    expect(resolveValue([{ $ref: 'client.id' }, 'x', 3], data)).toEqual(['c1', 'x', 3]);
    expect(resolveValue(true, data)).toBe(true);
    expect(interpolate('{{steps.n1.tags}}', data)).toBe('["a","b"]');
  });

  it('lists every path a value refers to', () => {
    expect(collectPaths([{ $ref: 'a.b' }, 'x {{c.d}} y {{ e }}', 5])).toEqual(['a.b', 'c.d', 'e']);
  });

  it('compares numbers as numbers and dates as text', () => {
    const rule = (left: string, op: any, right?: any) => evaluateCondition({ match: 'all', rules: [{ left, op, right }] }, data);
    expect(rule('steps.n1.totalHours', 'gt', 0)).toBe(true);
    expect(rule('steps.n1.totalHours', 'gt', '9')).toBe(true); // 12.5 > 9, not "12.5" < "9"
    expect(rule('steps.n1.totalHours', 'lte', 12.5)).toBe(true);
    expect(rule('period.end', 'gte', '2026-10-15')).toBe(true);
    expect(rule('client.email', 'empty')).toBe(true);
    expect(rule('client.name', 'not_empty')).toBe(true);
    expect(rule('client.name', 'contains', 'acme')).toBe(true);
    expect(rule('steps.n1.tags', 'contains', 'b')).toBe(true);
    expect(rule('steps.n1.outcome', 'eq', 'out')).toBe(true);
    // A missing value is not "less than" anything.
    expect(rule('steps.nope.totalHours', 'lt', 5)).toBe(false);
  });

  it('combines rules with all / any, and an empty rule list never holds', () => {
    const rules = [
      { left: 'steps.n1.totalHours', op: 'gt' as const, right: 100 },
      { left: 'client.name', op: 'eq' as const, right: 'Acme GmbH' },
    ];
    expect(evaluateCondition({ match: 'all', rules }, data)).toBe(false);
    expect(evaluateCondition({ match: 'any', rules }, data)).toBe(true);
    expect(evaluateCondition({ match: 'all', rules: [] }, data)).toBe(false);
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

const TEMPLATE_ID = '11111111-1111-4111-8111-111111111111';

/** The shipped template with its email templates chosen — a complete, valid flow. */
function validFlow(): WorkflowGraph {
  const graph = JSON.parse(JSON.stringify(getWorkflowTemplate('signed-timesheet-invoice', 'de')!.graph)) as WorkflowGraph;
  for (const node of graph.nodes) {
    if (node.type === 'action' && node.data.action === 'email.send') node.data.input.templateId = TEMPLATE_ID;
  }
  return graph;
}

const codes = (graph: unknown, subject: any = 'client') => validateGraph(graph, subject).issues.map((issue) => issue.code);

function withNode(graph: WorkflowGraph, id: string, change: (node: any) => void): WorkflowGraph {
  change(graph.nodes.find((node) => node.id === id));
  return graph;
}

describe('validateGraph', () => {
  it('accepts the shipped template once its email templates are chosen', () => {
    const template = getWorkflowTemplate('signed-timesheet-invoice', 'en')!.graph;
    const raw = validateGraph(template, 'client');
    expect(raw.valid).toBe(false);
    expect(raw.issues.map((issue) => `${issue.code}:${issue.nodeId}:${issue.field}`).sort()).toEqual([
      'MISSING_INPUT:n_mail_invoice:templateId',
      'MISSING_INPUT:n_mail_sheet:templateId',
      'MISSING_INPUT:n_remind:templateId',
    ]);
    expect(validateGraph(validFlow(), 'client')).toMatchObject({ valid: true, issues: [] });
  });

  it('grants a flow exactly what its actions need', () => {
    expect(derivePermissions(validFlow())).toEqual({
      resources: { reports: 'read', clients: 'write', invoices: 'write', templates: 'read' },
      capabilities: ['email_send'],
    });
    // Without the invoice mail that marks the invoice as sent, sending needs no invoice access of its own.
    const graph = validFlow();
    withNode(graph, 'n_mail_invoice', (node) => {
      node.data.input.markInvoiceSent = false;
      delete node.data.input.attachInvoiceId;
    });
    graph.nodes = graph.nodes.filter((node) => node.id !== 'n_invoice' && node.id !== 'n_link');
    expect(derivePermissions(graph).resources.invoices).toBeUndefined();
  });

  it('refuses anything that is not a graph', () => {
    expect(codes(null)).toEqual(['BAD_GRAPH']);
    expect(codes({ nodes: 'x', edges: [] })).toEqual(['BAD_GRAPH']);
    expect(codes({ nodes: [{ id: 'bad id!', type: 'start', data: {} }], edges: [] })).toContain('BAD_NODE_ID');
    expect(codes({ nodes: [{ id: 'a', type: 'teleport', data: {} }], edges: [] })).toContain('BAD_NODE');
    // Settings the engine reads as text have to be text — a number here must not get as far as a run.
    expect(codes({ nodes: [{ id: 'a', type: 'task', data: { kind: 'confirm', title: 42 } }], edges: [] })).toEqual(['BAD_NODE']);
    expect(codes({ nodes: [{ id: 'a', type: 'end', data: { result: { $ref: 'client.name' } } }], edges: [] })).toEqual(['BAD_NODE']);
  });

  it('needs one start, an end, and everything connected', () => {
    expect(codes({ nodes: [], edges: [] })).toEqual(expect.arrayContaining(['NO_START', 'NO_END']));
    const graph = validFlow();
    graph.nodes.push({ id: 'n_start2', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'manual' } });
    expect(codes(graph)).toEqual(expect.arrayContaining(['MULTIPLE_STARTS', 'UNREACHABLE', 'NO_EXIT']));
  });

  it('wires every exit at most once, except on a branch', () => {
    const graph = validFlow();
    graph.edges.push({ id: 'e_extra', source: 'n_sheet', target: 'n_end' });
    expect(codes(graph)).toContain('MULTIPLE_EXITS');

    const dangling = validFlow();
    dangling.edges = dangling.edges.filter((edge) => edge.id !== 'e_link');
    expect(codes(dangling)).toEqual(expect.arrayContaining(['NO_EXIT', 'UNREACHABLE']));
  });

  it('only offers the exits a node really has', () => {
    const graph = validFlow();
    // "rejected" exists on confirm tasks only, "timeout" only with a due date.
    graph.edges.push({ id: 'e_bad', source: 'n_upload', target: 'n_end', sourceHandle: 'rejected' });
    expect(codes(graph)).toContain('BAD_HANDLE');

    const noDue = withNode(validFlow(), 'n_upload', (node) => delete node.data.dueInDays);
    expect(codes(noDue)).toContain('BAD_HANDLE');

    const confirm = validFlow();
    confirm.edges.push({ id: 'e_rej', source: 'n_review', target: 'n_end_empty', sourceHandle: 'rejected' });
    expect(validateGraph(confirm, 'client').valid).toBe(true);
  });

  it('checks references against what a run will have at that point', () => {
    // n_sheet runs before n_sum's result exists? No — n_invoice runs AFTER n_sheet, so the reverse is the mistake:
    const early = withNode(validFlow(), 'n_sheet', (node) => (node.data.input.title = 'Invoice {{steps.n_invoice.invoiceNumber}}'));
    expect(validateGraph(early, 'client').issues).toEqual([
      expect.objectContaining({ code: 'BAD_REFERENCE', nodeId: 'n_sheet', field: 'title' }),
    ]);

    const unknownKey = withNode(validFlow(), 'n_link', (node) => (node.data.input.documentId = { $ref: 'steps.n_upload.nothing' }));
    expect(codes(unknownKey)).toEqual(['BAD_REFERENCE']);

    // project.* does not exist for a flow about a client.
    const wrongSubject = withNode(validFlow(), 'n_review', (node) => (node.data.title = 'Check {{project.name}}'));
    expect(codes(wrongSubject)).toEqual(['BAD_REFERENCE']);
    expect(codes(wrongSubject, 'project')).toEqual([]);
  });

  it('checks branch conditions and allows one "otherwise" exit', () => {
    const graph = validFlow();
    const yes = graph.edges.find((edge) => edge.id === 'e_yes') as WorkflowEdge;
    yes.condition = { match: 'all', rules: [] };
    expect(codes(graph)).toEqual(['BAD_CONDITION']);

    yes.condition = null;
    expect(codes(graph)).toEqual(['MULTIPLE_DEFAULTS']);

    const onAction = validFlow();
    (onAction.edges.find((edge) => edge.id === 'e_sheet') as WorkflowEdge).condition = {
      match: 'all',
      rules: [{ left: 'client.name', op: 'not_empty' }],
    };
    expect(codes(onAction)).toEqual(['BAD_CONDITION']);
  });

  it('checks each kind of node', () => {
    const check = (id: string, change: (node: any) => void) => codes(withNode(validFlow(), id, change));
    expect(check('n_sum', (node) => (node.data.action = 'does.not.exist'))).toContain('UNKNOWN_ACTION');
    expect(check('n_sum', (node) => (node.data.mode = 'maybe'))).toEqual(['BAD_MODE']);
    expect(check('n_invoice', (node) => delete node.data.input.clientId)).toEqual(['ACTION_INVALID']);
    expect(check('n_upload', (node) => (node.data.documentType = 'selfie'))).toEqual(['BAD_DOCUMENT_TYPE']);
    expect(check('n_upload', (node) => (node.data.dueInDays = 900))).toEqual(['BAD_DUE']);
    expect(check('n_review', (node) => (node.data.title = ' '))).toEqual(['MISSING_TITLE']);
    expect(check('n_review', (node) => Object.assign(node.data, { kind: 'form', fields: [] }))).toEqual(['NO_FORM_FIELDS']);
    expect(
      check('n_review', (node) =>
        Object.assign(node.data, { kind: 'form', fields: [{ key: 'po', label: 'PO', type: 'text' }, { key: 'po', label: 'Again', type: 'text' }] })
      )
    ).toEqual(['BAD_FORM_FIELD']);
    expect(check('n_review', (node) => Object.assign(node.data, { kind: 'form', fields: [{ key: 'po', label: 7, type: 'text' }] }))).toEqual(['BAD_FORM_FIELD']);
    expect(check('n_review', (node) => Object.assign(node.data, { kind: 'form', fields: ['po'] }))).toEqual(['BAD_FORM_FIELD']);
  });

  it('checks the schedule of a start', () => {
    const scheduled = (schedule: any, subject: any = 'client') =>
      codes(withNode(validFlow(), 'n_start', (node) => Object.assign(node.data, { trigger: 'schedule', schedule })), subject);
    expect(scheduled({ dayOfMonth: 'last', period: 'current_month', subjectIds: ['c1'] })).toEqual([]);
    expect(scheduled({ dayOfMonth: 31, period: 'current_month', subjectIds: ['c1'] })).toEqual(['BAD_SCHEDULE']);
    expect(scheduled({ dayOfMonth: 1, period: 'previous_month', subjectIds: [] })).toEqual(['NO_SCHEDULE_SUBJECTS']);
  });

  it('a wait needs a duration', () => {
    const graph = validFlow();
    const wait: WorkflowNode = { id: 'n_wait', type: 'wait', position: { x: 0, y: 0 }, data: {} };
    graph.nodes.push(wait);
    graph.edges = graph.edges.filter((edge) => edge.id !== 'e_sheet');
    graph.edges.push({ id: 'e_a', source: 'n_sheet', target: 'n_wait' }, { id: 'e_b', source: 'n_wait', target: 'n_mail_sheet' });
    expect(codes(graph)).toEqual(['BAD_DURATION']);
    wait.data.days = 2;
    expect(codes(graph)).toEqual([]);
  });
});

describe('nextScheduledStart', () => {
  const at = (value: string) => new Date(value);
  it('is the given day at 06:00 UTC, strictly after the reference', () => {
    const schedule = { dayOfMonth: 15, period: 'current_month' as const, subjectIds: [] };
    expect(nextScheduledStart(schedule, at('2026-11-12T10:00:00Z')).toISOString()).toBe('2026-11-15T06:00:00.000Z');
    expect(nextScheduledStart(schedule, at('2026-11-15T06:00:00Z')).toISOString()).toBe('2026-12-15T06:00:00.000Z');
    expect(nextScheduledStart(schedule, at('2026-12-20T00:00:00Z')).toISOString()).toBe('2027-01-15T06:00:00.000Z');
  });

  it('follows the length of the month for "last"', () => {
    const schedule = { dayOfMonth: 'last' as const, period: 'current_month' as const, subjectIds: [] };
    expect(nextScheduledStart(schedule, at('2027-02-01T00:00:00Z')).toISOString()).toBe('2027-02-28T06:00:00.000Z');
    expect(nextScheduledStart(schedule, at('2028-02-01T00:00:00Z')).toISOString()).toBe('2028-02-29T06:00:00.000Z');
    expect(nextScheduledStart(schedule, at('2026-11-30T06:00:00Z')).toISOString()).toBe('2026-12-31T06:00:00.000Z');
  });
});
