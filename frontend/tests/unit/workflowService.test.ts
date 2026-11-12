/**
 * The workflow API service: each function calls the endpoint the contract
 * (docs/WORKFLOW_ENGINE.md) names, with the body it expects — uploads as
 * multipart `file` — and error bodies are read into a typed shape.
 */
import apiClient from '../../src/api/services/client';
import {
  approveWorkflowTask,
  cancelWorkflowRun,
  completeWorkflowTask,
  createWorkflowDefinition,
  deleteWorkflowDefinition,
  dismissWorkflowTask,
  getWorkflowCatalog,
  getWorkflowDefinition,
  getWorkflowDefinitions,
  getWorkflowRun,
  getWorkflowRuns,
  getWorkflowSubjectOptions,
  getWorkflowTaskCount,
  getWorkflowTasks,
  getWorkflowTemplates,
  publishWorkflowDefinition,
  rejectWorkflowTask,
  retryWorkflowStep,
  setWorkflowDefinitionStatus,
  skipWorkflowStep,
  skipWorkflowTask,
  startWorkflowRun,
  updateWorkflowDefinition,
  validateWorkflowDefinition,
  workflowApiError,
} from '../../src/api/services/workflow.service';
import { graph } from '../mocks/workflowFixtures';

jest.mock('../../src/api/services/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const client = apiClient as unknown as Record<'get' | 'post' | 'put' | 'delete', jest.Mock>;

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset().mockResolvedValue({ data: { ok: true } });
});

describe('reads', () => {
  it.each([
    ['catalog', () => getWorkflowCatalog(), '/workflows/catalog'],
    ['templates', () => getWorkflowTemplates(), '/workflows/templates'],
    ['definitions', () => getWorkflowDefinitions(), '/workflows/definitions'],
    ['one definition', () => getWorkflowDefinition('d1'), '/workflows/definitions/d1'],
    ['one run', () => getWorkflowRun('r1'), '/workflows/runs/r1'],
    ['the open-task count', () => getWorkflowTaskCount(), '/workflows/tasks/count'],
  ])('gets %s', async (_name, call, url) => {
    await expect(call()).resolves.toEqual({ ok: true });
    expect(client.get.mock.calls[0][0]).toBe(url);
  });

  it('asks for templates in the language of the app', async () => {
    await getWorkflowTemplates('de');
    expect(client.get).toHaveBeenCalledWith('/workflows/templates', { params: { lang: 'de' } });
  });

  it('asks for the catalog in the language of the app, so an addon’s texts arrive translated', async () => {
    await getWorkflowCatalog('de');
    expect(client.get).toHaveBeenCalledWith('/workflows/catalog', { params: { lang: 'de' } });
  });

  it('lists the records of any kind of subject, also one an addon registered', async () => {
    client.get.mockResolvedValue({ data: [{ id: 'a1', label: 'Backend developer · ACME' }] });
    await expect(getWorkflowSubjectOptions('applications.application')).resolves.toEqual([{ id: 'a1', label: 'Backend developer · ACME' }]);
    expect(client.get).toHaveBeenLastCalledWith('/workflows/subjects/applications.application/options', undefined);
    await getWorkflowSubjectOptions('crm/lead', 'acme');
    expect(client.get).toHaveBeenLastCalledWith('/workflows/subjects/crm%2Flead/options', { params: { search: 'acme' } });
  });

  it('lists runs with only the filters that are set', async () => {
    await getWorkflowRuns({ definition_id: 'd1', status: undefined, subject_id: '', limit: 50 });
    expect(client.get).toHaveBeenCalledWith('/workflows/runs', { params: { definition_id: 'd1', limit: 50 } });
  });

  it('lists tasks by status, optionally for one run', async () => {
    await getWorkflowTasks();
    expect(client.get).toHaveBeenLastCalledWith('/workflows/tasks', { params: { status: 'open' } });
    await getWorkflowTasks('closed', 'r1');
    expect(client.get).toHaveBeenLastCalledWith('/workflows/tasks', { params: { status: 'closed', run_id: 'r1' } });
  });
});

describe('definitions', () => {
  it('creates from scratch or from a template', async () => {
    await createWorkflowDefinition({ name: 'Billing', subject_type: 'client' });
    expect(client.post).toHaveBeenLastCalledWith('/workflows/definitions', { name: 'Billing', subject_type: 'client' });
    await createWorkflowDefinition({ template: 'timesheet-signature' });
    expect(client.post).toHaveBeenLastCalledWith('/workflows/definitions', { template: 'timesheet-signature' });
  });

  it('saves the draft, validates, publishes, changes the status and deletes', async () => {
    await updateWorkflowDefinition('d1', { name: 'New name', graph });
    expect(client.put).toHaveBeenCalledWith('/workflows/definitions/d1', { name: 'New name', graph });

    await validateWorkflowDefinition('d1');
    expect(client.post).toHaveBeenLastCalledWith('/workflows/definitions/d1/validate', {});
    await validateWorkflowDefinition('d1', graph);
    expect(client.post).toHaveBeenLastCalledWith('/workflows/definitions/d1/validate', { graph });

    await publishWorkflowDefinition('d1');
    expect(client.post.mock.calls[client.post.mock.calls.length - 1][0]).toBe('/workflows/definitions/d1/publish');

    await setWorkflowDefinitionStatus('d1', 'paused');
    expect(client.post).toHaveBeenLastCalledWith('/workflows/definitions/d1/status', { status: 'paused' });

    await deleteWorkflowDefinition('d1');
    expect(client.delete).toHaveBeenCalledWith('/workflows/definitions/d1');
  });
});

describe('runs', () => {
  it('starts, cancels, retries and skips', async () => {
    const request = { subject_id: 'c1', period_start: '2026-10-01', period_end: '2026-10-31', test: true };
    await startWorkflowRun('d1', request);
    expect(client.post).toHaveBeenLastCalledWith('/workflows/definitions/d1/runs', request);
    await cancelWorkflowRun('r1');
    expect(client.post.mock.calls[1][0]).toBe('/workflows/runs/r1/cancel');
    await retryWorkflowStep('r1', 's1');
    expect(client.post.mock.calls[2][0]).toBe('/workflows/runs/r1/steps/s1/retry');
    await skipWorkflowStep('r1', 's1');
    expect(client.post.mock.calls[3][0]).toBe('/workflows/runs/r1/steps/s1/skip');
  });
});

describe('tasks', () => {
  it('completes a confirmation with its comment and a form with its values', async () => {
    await completeWorkflowTask('t1', { comment: '  looks fine ' });
    expect(client.post).toHaveBeenLastCalledWith('/workflows/tasks/t1/complete', { comment: 'looks fine' });
    await completeWorkflowTask('t1', { values: { po: 'A-1', amount: 3 } });
    expect(client.post).toHaveBeenLastCalledWith('/workflows/tasks/t1/complete', { values: { po: 'A-1', amount: 3 } });
    await completeWorkflowTask('t1');
    expect(client.post).toHaveBeenLastCalledWith('/workflows/tasks/t1/complete', {});
  });

  it('uploads a file as multipart `file` with an optional title', async () => {
    const file = new File(['%PDF'], 'signed.pdf', { type: 'application/pdf' });
    await completeWorkflowTask('t1', { file, title: ' Signed October ' });
    const [url, body, config] = client.post.mock.calls[0];
    expect(url).toBe('/workflows/tasks/t1/complete');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('title')).toBe('Signed October');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

    await completeWorkflowTask('t2', { file });
    expect((client.post.mock.calls[1][1] as FormData).has('title')).toBe(false);
  });

  it('rejects, approves, skips and dismisses', async () => {
    await rejectWorkflowTask('t1', 'wrong month');
    expect(client.post).toHaveBeenLastCalledWith('/workflows/tasks/t1/reject', { comment: 'wrong month' });
    await rejectWorkflowTask('t1');
    expect(client.post).toHaveBeenLastCalledWith('/workflows/tasks/t1/reject', {});
    await approveWorkflowTask('t1');
    expect(client.post.mock.calls[2][0]).toBe('/workflows/tasks/t1/approve');
    await skipWorkflowTask('t1');
    expect(client.post.mock.calls[3][0]).toBe('/workflows/tasks/t1/skip');
    await dismissWorkflowTask('t1');
    expect(client.post.mock.calls[4][0]).toBe('/workflows/tasks/t1/dismiss');
  });
});

describe('error bodies', () => {
  it('reads a duplicate run, an invalid draft and a plain message', () => {
    expect(workflowApiError({ response: { status: 409, data: { code: 'RUN_EXISTS', run_id: 'r9', message: 'exists' } } })).toEqual({
      status: 409,
      message: 'exists',
      code: 'RUN_EXISTS',
      issues: undefined,
      runId: 'r9',
    });
    const issues = [{ code: 'NO_START', message: 'The flow has no start.' }];
    expect(workflowApiError({ response: { status: 422, data: { message: 'Invalid', issues } } })).toMatchObject({ status: 422, issues });
  });

  it('is empty for errors without a response', () => {
    expect(workflowApiError(new Error('Network Error'))).toEqual({
      status: undefined,
      message: undefined,
      code: undefined,
      issues: undefined,
      runId: undefined,
    });
    expect(workflowApiError(null).message).toBeUndefined();
  });
});
