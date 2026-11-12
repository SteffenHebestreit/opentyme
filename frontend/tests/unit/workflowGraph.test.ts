/**
 * Between the contract's graph and the canvas: what is saved is exactly what
 * was loaded plus the user's edits, gateway exits keep their order, only
 * gateways branch, and a run's steps tell each node's state.
 */
import {
  connectNodes,
  createFlowNode,
  defaultNodeData,
  graphFingerprint,
  moveGatewayEdge,
  nextNodeId,
  pruneEdges,
  sourceHandles,
  toFlowEdges,
  toFlowNodes,
  toWorkflowGraph,
} from '../../src/components/workflows/graph/flowGraph';
import { failedStep, nodeRunStates, traversedEdgeIds } from '../../src/components/workflows/graph/runStatus';
import { currentMonth } from '../../src/components/workflows/graph/period';
import { byRecency, byUrgency } from '../../src/components/workflows/tasks/taskOrder';
import type { TaskNodeData, WorkflowGraph } from '../../src/api/types/workflow.types';
import { catalog, graph, step, task } from '../mocks/workflowFixtures';

describe('graph conversion', () => {
  it('round-trips the contract graph unchanged', () => {
    expect(toWorkflowGraph(toFlowNodes(graph), toFlowEdges(graph))).toEqual({
      nodes: graph.nodes,
      // only gateway exits carry a condition; everything else comes back as it was
      edges: graph.edges,
    });
  });

  it('fills in the default exit and keeps canvas-only state out of the saved graph', () => {
    const nodes = toFlowNodes({ nodes: graph.nodes.slice(0, 2), edges: [] });
    const edges = toFlowEdges({ nodes: [], edges: [{ id: 'e1', source: 'n1', target: 'n2' }] });
    expect(edges[0].sourceHandle).toBe('out');
    nodes[0] = { ...nodes[0], selected: true, position: { x: 10.4, y: 19.6 } };
    const saved = toWorkflowGraph(nodes, edges);
    expect(saved.nodes[0]).toEqual({ id: 'n1', type: 'start', position: { x: 10, y: 20 }, data: { trigger: 'manual' } });
    expect(saved.edges[0]).toEqual({ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'out' });
  });

  it('changes its fingerprint with the graph but not with the selection', () => {
    const nodes = toFlowNodes(graph);
    const edges = toFlowEdges(graph);
    const before = graphFingerprint(nodes, edges);
    expect(graphFingerprint(nodes.map((node) => ({ ...node, selected: true })), edges)).toBe(before);
    expect(graphFingerprint(nodes.slice(1), edges)).not.toBe(before);
  });
});

describe('new nodes', () => {
  it('numbers ids past the ones in use', () => {
    expect(nextNodeId([])).toBe('n1');
    expect(nextNodeId([{ id: 'n1' }, { id: 'n3' }])).toBe('n2');
    expect(nextNodeId(graph.nodes)).toBe('n10');
  });

  it('pre-fills an action from the catalog and takes its default mode', () => {
    expect(defaultNodeData({ type: 'action', action: 'email.send' }, catalog)).toEqual({
      action: 'email.send',
      input: { to: { $ref: 'client.invoice_email' } },
      mode: 'approval',
    });
    // an action the catalog doesn't know asks before it runs
    expect(defaultNodeData({ type: 'action', action: 'made.up' }, catalog)).toMatchObject({ mode: 'approval', input: {} });
  });

  it('starts an upload task with the signed-timesheet type and other blocks with sensible defaults', () => {
    expect(defaultNodeData({ type: 'task', kind: 'upload' }, catalog)).toEqual({ kind: 'upload', title: '', documentType: 'timesheet_signed' });
    expect(defaultNodeData({ type: 'task', kind: 'form' }, catalog)).toEqual({ kind: 'form', title: '', fields: [] });
    expect(defaultNodeData({ type: 'start' }, catalog)).toEqual({ trigger: 'manual' });
    expect(defaultNodeData({ type: 'wait' }, catalog)).toEqual({ days: 1 });
    const node = createFlowNode({ type: 'gateway' }, { x: 5, y: 6 }, toFlowNodes(graph), catalog);
    expect(node).toMatchObject({ id: 'n10', type: 'gateway', position: { x: 5, y: 6 }, data: { config: {} } });
  });
});

describe('exits and connections', () => {
  const taskData = (data: Partial<TaskNodeData>): TaskNodeData => ({ kind: 'confirm', title: 't', ...data });

  it('offers a task the exits its settings give it', () => {
    expect(sourceHandles('task', taskData({}))).toEqual(['out', 'rejected']);
    expect(sourceHandles('task', taskData({ kind: 'upload', dueInDays: 5 }))).toEqual(['out', 'timeout']);
    expect(sourceHandles('task', taskData({ kind: 'confirm', dueInDays: 2 }))).toEqual(['out', 'rejected', 'timeout']);
    expect(sourceHandles('action', { action: 'x', input: {}, mode: 'auto' })).toEqual(['out']);
    expect(sourceHandles('end', {})).toEqual([]);
  });

  it('gives a wait for an event a "time expired" exit only with a time limit', () => {
    expect(sourceHandles('wait', { days: 3 })).toEqual(['out']);
    expect(sourceHandles('wait', { mode: 'event', event: 'invoice.paid' })).toEqual(['out']);
    expect(sourceHandles('wait', { mode: 'event', event: 'invoice.paid', timeoutDays: 30 })).toEqual(['out', 'timeout']);
    // A time limit means nothing for a fixed wait
    expect(sourceHandles('wait', { mode: 'duration', days: 3, timeoutDays: 30 })).toEqual(['out']);
    // A gateway has one handle whichever way it branches; its edges fan out from there
    expect(sourceHandles('gateway', { mode: 'parallel' })).toEqual(['out']);
  });

  it('lets only gateways branch: a second edge from another exit replaces the first', () => {
    const nodes = toFlowNodes(graph);
    const edges = toFlowEdges(graph);
    const rerouted = connectNodes({ source: 'n4', target: 'n8', sourceHandle: 'out' }, nodes, edges);
    expect(rerouted.filter((edge) => edge.source === 'n4').map((edge) => edge.target)).toEqual(['n8']);

    const branched = connectNodes({ source: 'n3', target: 'n8', sourceHandle: 'out' }, nodes, edges);
    expect(branched.filter((edge) => edge.source === 'n3').map((edge) => edge.target)).toEqual(['n4', 'n9', 'n8']);
    expect(branched[branched.length - 1].id).toBe('e10');
  });

  it('ignores self-connections, duplicates and edges out of an end', () => {
    const nodes = toFlowNodes(graph);
    const edges = toFlowEdges(graph);
    expect(connectNodes({ source: 'n4', target: 'n4' }, nodes, edges)).toBe(edges);
    expect(connectNodes({ source: 'n1', target: 'n2', sourceHandle: 'out' }, nodes, edges)).toBe(edges);
    expect(connectNodes({ source: 'n8', target: 'n2' }, nodes, edges)).toBe(edges);
  });

  it('drops the edges of an exit that no longer exists', () => {
    const edges = toFlowEdges(graph);
    const nodes = toFlowNodes(graph);
    expect(pruneEdges(nodes, edges)).toBe(edges);
    const withoutDue = nodes.map((node) => (node.id === 'n6' ? { ...node, data: { config: { kind: 'upload', title: 'x' } as TaskNodeData } } : node));
    expect(pruneEdges(withoutDue, edges).map((edge) => edge.id)).not.toContain('e8');
  });

  it('reorders a gateway’s exits without touching other edges', () => {
    const edges = toFlowEdges(graph);
    const moved = moveGatewayEdge(edges, 'e4', -1);
    expect(moved.filter((edge) => edge.source === 'n3').map((edge) => edge.id)).toEqual(['e4', 'e3']);
    expect(moved.filter((edge) => edge.source !== 'n3').map((edge) => edge.id)).toEqual(['e1', 'e2', 'e5', 'e6', 'e7', 'e8', 'e9']);
    expect(moveGatewayEdge(edges, 'e3', -1)).toBe(edges);
  });
});

describe('run state', () => {
  const steps = [
    step({ id: 's1', node_id: 'n1', node_type: 'start', seq: 1 }),
    step({ id: 's2', node_id: 'n2', seq: 2 }),
    step({ id: 's3', node_id: 'n3', node_type: 'gateway', seq: 3, outcome: 'e3' }),
    step({ id: 's4', node_id: 'n4', seq: 4 }),
    step({ id: 's5', node_id: 'n5', seq: 5 }),
    step({ id: 's6', node_id: 'n6', node_type: 'task', seq: 6, outcome: 'timeout' }),
    step({ id: 's7', node_id: 'n7', seq: 7 }),
    step({ id: 's8', node_id: 'n6', node_type: 'task', seq: 8, status: 'waiting', outcome: null }),
  ];

  it('shows each node’s latest visit and counts the visits', () => {
    const states = nodeRunStates(steps);
    expect(states.n6).toMatchObject({ status: 'waiting', visits: 2 });
    expect(states.n6.step.id).toBe('s8');
    expect(states.n2).toMatchObject({ status: 'completed', visits: 1 });
    expect(states.n8).toBeUndefined();
  });

  it('marks the edges the run took — a gateway by edge id, a task by its exit', () => {
    const taken = traversedEdgeIds(graph, steps);
    expect([...taken].sort()).toEqual(['e1', 'e2', 'e3', 'e5', 'e6', 'e8', 'e9']);
  });

  it('counts every exit of a parallel branch as taken', () => {
    const parallel: WorkflowGraph = {
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'manual' } },
        { id: 'g', type: 'gateway', position: { x: 0, y: 0 }, data: { mode: 'parallel' } },
        { id: 'a', type: 'end', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'end', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'g' },
        { id: 'ea', source: 'g', target: 'a' },
        { id: 'eb', source: 'g', target: 'b' },
      ],
    };
    const done = [step({ id: 's1', node_id: 's', seq: 1 }), step({ id: 's2', node_id: 'g', seq: 2, node_type: 'gateway', outcome: 'all' })];
    expect([...traversedEdgeIds(parallel, done)].sort()).toEqual(['e1', 'ea', 'eb']);
  });

  it('finds the failed step of an incident', () => {
    expect(failedStep(steps)).toBeUndefined();
    const failed = step({ id: 's9', node_id: 'n5', seq: 9, status: 'failed', error: 'SMTP down' });
    expect(failedStep([...steps, failed])?.id).toBe('s9');
  });
});

describe('periods and task order', () => {
  it('defaults a run to the current month', () => {
    expect(currentMonth(new Date(2026, 1, 14))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(currentMonth(new Date(2026, 11, 31))).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('puts the most urgent open task first and the latest settled task first', () => {
    const tasks = [
      task({ id: 'a', due_at: null, created_at: '2026-11-01T00:00:00Z' }),
      task({ id: 'b', due_at: '2026-11-20T00:00:00Z' }),
      task({ id: 'c', due_at: '2026-11-15T00:00:00Z' }),
    ];
    expect(byUrgency(tasks).map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
    const settled = [
      task({ id: 'x', status: 'done', completed_at: '2026-11-10T00:00:00Z' }),
      task({ id: 'y', status: 'done', completed_at: '2026-11-12T00:00:00Z' }),
    ];
    expect(byRecency(settled).map((entry) => entry.id)).toEqual(['y', 'x']);
  });
});
