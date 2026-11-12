/**
 * What a node may refer to: the subject's variables and the outputs of steps
 * upstream of it — never its own, never those of steps that come later — and,
 * per field, only values of a fitting type.
 */
import { toFlowEdges, toFlowNodes } from '../../src/components/workflows/graph/flowGraph';
import {
  acceptsType,
  allowsPlaceholders,
  isRef,
  isReferenceOnly,
  nodeOutputs,
  referenceOptions,
  referencedPaths,
  referencesFor,
  upstreamNodeIds,
} from '../../src/components/workflows/graph/references';
import { catalog, graph } from '../mocks/workflowFixtures';

const nodes = toFlowNodes(graph);
const edges = toFlowEdges(graph);
const optionsFor = (nodeId: string) => referenceOptions({ nodeId, nodes, edges, catalog, subjectType: 'client' });
const paths = (nodeId: string) => optionsFor(nodeId).map((option) => option.path);

describe('upstream nodes', () => {
  it('walks every path back to the start', () => {
    expect(upstreamNodeIds('n5', edges).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(upstreamNodeIds('n1', edges)).toEqual([]);
  });

  it('follows loops without including the node itself', () => {
    // n6 → (timeout) → n7 → n6: the reminder is upstream of the task, the task is not upstream of itself
    expect(upstreamNodeIds('n6', edges).sort()).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n7']);
    expect(upstreamNodeIds('n7', edges)).toContain('n6');
    expect(upstreamNodeIds('n7', edges)).not.toContain('n7');
  });
});

describe('reference options', () => {
  it('lists the subject’s variables first, then upstream outputs in graph order', () => {
    expect(paths('n5')).toEqual([
      'client.id',
      'client.name',
      'client.invoice_email',
      'period.start',
      'steps.n2.totalHours',
      'steps.n2.entryCount',
      'steps.n4.documentId',
      'steps.n4.filename',
    ]);
  });

  it('offers a task’s outputs — and the exit it took — to what follows it', () => {
    const fromTask = optionsFor('n8').filter((option) => option.source.kind === 'step' && option.source.nodeId === 'n6');
    expect(fromTask.map((option) => option.path)).toEqual(['steps.n6.documentId', 'steps.n6.filename', 'steps.n6.outcome']);
    expect(fromTask[0].source).toMatchObject({ nodeType: 'task', taskKind: 'upload' });
  });

  it('uses the variables of the flow’s subject type', () => {
    const forProject = referenceOptions({ nodeId: 'n2', nodes, edges, catalog, subjectType: 'project' });
    expect(forProject.map((option) => option.path)).toEqual(['project.id']);
  });

  it('adds a form task’s own fields to its outputs', () => {
    const form = {
      id: 'f1',
      type: 'task' as const,
      data: {
        config: {
          kind: 'form',
          title: 'PO number',
          fields: [
            { key: 'po', label: 'PO number', type: 'text' },
            { key: 'amount', label: 'Amount', type: 'number' },
          ],
        },
      },
    };
    expect(nodeOutputs(form, catalog)).toEqual([
      { key: 'po', type: 'string', label: 'PO number' },
      { key: 'amount', type: 'number', label: 'Amount' },
      { key: 'outcome', type: 'string', label: 'Outcome' },
    ]);
    expect(nodeOutputs({ id: 'g', type: 'gateway', data: { config: {} } }, catalog)).toEqual([]);
  });
});

describe('type filtering', () => {
  it('offers a document field only documents', () => {
    expect(referencesFor('documents', optionsFor('n5')).map((option) => option.path)).toEqual(['steps.n4.documentId']);
    expect(referencesFor('document', optionsFor('n2'))).toEqual([]);
  });

  it('offers an email field addresses and text, a client field only clients', () => {
    expect(referencesFor('email', optionsFor('n5')).map((option) => option.path)).toEqual([
      'client.name',
      'client.invoice_email',
      'steps.n4.filename',
    ]);
    expect(referencesFor('client', optionsFor('n5')).map((option) => option.path)).toEqual(['client.id']);
    expect(referencesFor('number', optionsFor('n5')).map((option) => option.path)).toEqual(['steps.n2.totalHours', 'steps.n2.entryCount']);
  });

  it('keeps ids out of text', () => {
    expect(acceptsType('text', 'document')).toBe(false);
    expect(acceptsType('text', 'client')).toBe(false);
    expect(acceptsType('text', 'number')).toBe(true);
    expect(acceptsType('string', 'email')).toBe(true);
  });

  it('knows which fields are reference-only and which take placeholders', () => {
    expect(isReferenceOnly('document')).toBe(true);
    expect(isReferenceOnly('documents')).toBe(true);
    expect(isReferenceOnly('client')).toBe(false);
    expect(allowsPlaceholders('text')).toBe(true);
    expect(allowsPlaceholders('number')).toBe(false);
  });
});

describe('values', () => {
  it('tells references from literals', () => {
    expect(isRef({ $ref: 'client.id' })).toBe(true);
    expect(isRef('client.id')).toBe(false);
    expect(isRef([{ $ref: 'a' }])).toBe(false);
    expect(isRef(null)).toBe(false);
  });

  it('finds the paths a value uses, as reference or placeholder', () => {
    expect(referencedPaths({ $ref: 'steps.n4.documentId' })).toEqual(['steps.n4.documentId']);
    expect(referencedPaths('Hours for {{client.name}} in {{ period.label }}')).toEqual(['client.name', 'period.label']);
    expect(referencedPaths([{ $ref: 'a.b' }, { $ref: 'c.d' }])).toEqual(['a.b', 'c.d']);
    expect(referencedPaths(42)).toEqual([]);
    expect(referencedPaths(undefined)).toEqual([]);
  });
});
