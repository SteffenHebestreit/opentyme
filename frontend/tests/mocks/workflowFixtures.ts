/**
 * Shared test data for the workflow UI: a small catalog and the "timesheet
 * with signature" flow (start → summarize → branch → timesheet → mail →
 * upload with a reminder loop → end).
 */
import type {
  WorkflowCatalog,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowRun,
  WorkflowStep,
  WorkflowTask,
} from '../../src/api/types/workflow.types';

export const catalog: WorkflowCatalog = {
  actions: [
    {
      key: 'time.summarize',
      category: 'time',
      title: 'Summarize time entries',
      description: 'Adds up the time entries of the period.',
      effect: 'read',
      defaultMode: 'auto',
      input: [
        { key: 'clientId', type: 'client', label: 'Client', required: true, default: { $ref: 'client.id' } },
        { key: 'start', type: 'date', label: 'From', required: true, default: { $ref: 'period.start' } },
      ],
      output: [
        { key: 'totalHours', type: 'number', label: 'Total hours' },
        { key: 'entryCount', type: 'number', label: 'Entries' },
      ],
    },
    {
      key: 'timesheet.generate',
      category: 'time',
      title: 'Create timesheet',
      description: 'Creates the timesheet PDF.',
      effect: 'write',
      defaultMode: 'auto',
      input: [
        { key: 'clientId', type: 'client', label: 'Client', required: true, default: { $ref: 'client.id' } },
        { key: 'hidePrices', type: 'boolean', label: 'Without prices', default: true },
      ],
      output: [
        { key: 'documentId', type: 'document', label: 'Timesheet' },
        { key: 'filename', type: 'string', label: 'File name' },
      ],
    },
    {
      key: 'email.send',
      category: 'communication',
      title: 'Send email',
      description: 'Sends a mail from a template.',
      effect: 'external',
      defaultMode: 'approval',
      input: [
        { key: 'to', type: 'email', label: 'To', required: true, default: { $ref: 'client.invoice_email' } },
        { key: 'templateId', type: 'emailTemplate', label: 'Template', required: true },
        { key: 'attachDocumentIds', type: 'documents', label: 'Attach documents' },
      ],
      output: [{ key: 'messageId', type: 'string', label: 'Message ID' }],
    },
  ],
  variables: {
    client: [
      { path: 'client.id', type: 'client', label: 'Client' },
      { path: 'client.name', type: 'string', label: 'Client name' },
      { path: 'client.invoice_email', type: 'email', label: 'Invoice email' },
      { path: 'period.start', type: 'date', label: 'Period start' },
    ],
    project: [{ path: 'project.id', type: 'project', label: 'Project' }],
    invoice: [{ path: 'invoice.id', type: 'invoice', label: 'Invoice' }],
    none: [],
  },
  taskOutputs: {
    confirm: [{ key: 'comment', type: 'string', label: 'Comment' }],
    upload: [
      { key: 'documentId', type: 'document', label: 'Uploaded document' },
      { key: 'filename', type: 'string', label: 'File name' },
    ],
    form: [],
  },
  documentTypes: ['contract', 'timesheet', 'timesheet_signed', 'other'],
  events: [
    {
      key: 'invoice.paid',
      subject_type: 'invoice',
      title: 'Invoice paid',
      description: 'The invoice is paid in full.',
      output: [
        { key: 'status', type: 'string', label: 'Status of the invoice' },
        { key: 'previous_status', type: 'string', label: 'Status before' },
      ],
    },
    {
      key: 'invoice.corrected',
      subject_type: 'invoice',
      title: 'Invoice corrected',
      description: 'A correction of the invoice was saved.',
      output: [{ key: 'reason', type: 'string', label: 'Reason for the correction' }],
    },
  ],
};

export const graph: WorkflowGraph = {
  nodes: [
    { id: 'n1', type: 'start', position: { x: 0, y: 100 }, data: { trigger: 'manual' } },
    {
      id: 'n2',
      type: 'action',
      position: { x: 120, y: 80 },
      data: { action: 'time.summarize', input: { clientId: { $ref: 'client.id' }, start: { $ref: 'period.start' } }, mode: 'auto' },
    },
    { id: 'n3', type: 'gateway', position: { x: 380, y: 96 }, data: { label: 'Hours logged?' } },
    {
      id: 'n4',
      type: 'action',
      position: { x: 500, y: 80 },
      data: { action: 'timesheet.generate', input: { clientId: { $ref: 'client.id' }, hidePrices: true }, mode: 'auto' },
    },
    {
      id: 'n5',
      type: 'action',
      position: { x: 760, y: 80 },
      data: {
        label: 'Timesheet to client',
        action: 'email.send',
        input: { to: { $ref: 'client.invoice_email' }, templateId: 'tpl-1', attachDocumentIds: [{ $ref: 'steps.n4.documentId' }] },
        mode: 'approval',
      },
    },
    {
      id: 'n6',
      type: 'task',
      position: { x: 1020, y: 80 },
      data: { kind: 'upload', title: 'Upload the signed timesheet', documentType: 'timesheet_signed', dueInDays: 5 },
    },
    {
      id: 'n7',
      type: 'action',
      position: { x: 1020, y: 260 },
      data: { label: 'Remind client', action: 'email.send', input: { to: { $ref: 'client.invoice_email' }, templateId: 'tpl-2' }, mode: 'auto' },
    },
    { id: 'n8', type: 'end', position: { x: 1300, y: 100 }, data: {} },
    { id: 'n9', type: 'end', position: { x: 380, y: 260 }, data: { label: 'Nothing to bill' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'out' },
    { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'out' },
    { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'out', condition: { match: 'all', rules: [{ left: 'steps.n2.totalHours', op: 'gt', right: 0 }] } },
    { id: 'e4', source: 'n3', target: 'n9', sourceHandle: 'out', condition: null },
    { id: 'e5', source: 'n4', target: 'n5', sourceHandle: 'out' },
    { id: 'e6', source: 'n5', target: 'n6', sourceHandle: 'out' },
    { id: 'e7', source: 'n6', target: 'n8', sourceHandle: 'out' },
    { id: 'e8', source: 'n6', target: 'n7', sourceHandle: 'timeout' },
    { id: 'e9', source: 'n7', target: 'n6', sourceHandle: 'out' },
  ],
};

export function definition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'def-1',
    name: 'Timesheet with signature',
    description: 'Monthly billing through an intermediary',
    subject_type: 'client',
    status: 'active',
    published_version: 2,
    has_unpublished_changes: false,
    active_runs: 1,
    next_run_at: null,
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
    graph,
    published_permissions: { resources: { reports: 'read', clients: 'write' }, capabilities: ['email_send'] },
    ...overrides,
  };
}

export function step(overrides: Partial<WorkflowStep> & Pick<WorkflowStep, 'id' | 'node_id' | 'seq'>): WorkflowStep {
  return {
    node_type: 'action',
    status: 'completed',
    attempt: 1,
    input: null,
    output: null,
    outcome: 'out',
    error: null,
    created_at: '2026-11-12T09:00:00Z',
    started_at: '2026-11-12T09:00:00Z',
    finished_at: '2026-11-12T09:00:05Z',
    ...overrides,
  };
}

export function task(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    id: 'task-1',
    run_id: 'run-1',
    step_id: 'step-6',
    node_id: 'n6',
    kind: 'upload',
    title: 'Upload the signed timesheet',
    description: null,
    payload: { documentType: 'timesheet_signed' },
    status: 'open',
    due_at: null,
    result: null,
    created_at: '2026-11-12T09:01:00Z',
    completed_at: null,
    definition_id: 'def-1',
    definition_name: 'Timesheet with signature',
    subject_type: 'client',
    subject_id: 'client-1',
    subject_label: 'ACME GmbH',
    test_mode: false,
    ...overrides,
  };
}

export function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    definition_id: 'def-1',
    definition_name: 'Timesheet with signature',
    version: 2,
    subject_type: 'client',
    subject_id: 'client-1',
    subject_label: 'ACME GmbH',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    status: 'waiting',
    test_mode: false,
    started_by: 'manual',
    current_node_label: 'Upload the signed timesheet',
    result: null,
    started_at: '2026-11-12T09:00:00Z',
    ended_at: null,
    graph,
    steps: [
      step({ id: 'step-1', node_id: 'n1', node_type: 'start', seq: 1 }),
      step({ id: 'step-2', node_id: 'n2', seq: 2, output: { totalHours: 42 } }),
      step({ id: 'step-3', node_id: 'n3', node_type: 'gateway', seq: 3, outcome: 'e3' }),
      step({ id: 'step-4', node_id: 'n4', seq: 4, output: { documentId: 'doc-1' } }),
      step({ id: 'step-5', node_id: 'n5', seq: 5 }),
      step({ id: 'step-6', node_id: 'n6', node_type: 'task', seq: 6, status: 'waiting', outcome: null, finished_at: null }),
    ],
    tasks: [task()],
    ...overrides,
  };
}
