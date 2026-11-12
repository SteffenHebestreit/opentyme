/**
 * @fileoverview Where a run stands, node by node.
 *
 * A run's history is its list of steps; a node can be visited more than once
 * (loops). The canvas shows each node's latest visit and which edges the run
 * actually took.
 */
import type { WorkflowGraph, WorkflowStep, WorkflowStepStatus } from '../../../api/types/workflow.types';

export type NodeRunStatus = 'idle' | 'active' | 'waiting' | 'completed' | 'failed' | 'skipped' | 'cancelled';

const STATUS_OF: Record<WorkflowStepStatus, NodeRunStatus> = {
  pending: 'active',
  running: 'active',
  waiting: 'waiting',
  completed: 'completed',
  failed: 'failed',
  skipped: 'skipped',
  cancelled: 'cancelled',
};

export interface NodeRunState {
  status: NodeRunStatus;
  /** How often the run came through this node. */
  visits: number;
  /** The latest visit. */
  step: WorkflowStep;
}

/** Each visited node's latest state, by node id. Unvisited nodes are absent (= idle). */
export function nodeRunStates(steps: WorkflowStep[]): Record<string, NodeRunState> {
  const states: Record<string, NodeRunState> = {};
  for (const step of [...steps].sort((a, b) => a.seq - b.seq)) {
    states[step.node_id] = { status: STATUS_OF[step.status] ?? 'idle', visits: (states[step.node_id]?.visits ?? 0) + 1, step };
  }
  return states;
}

/**
 * Ids of the edges the run went along. A step's `outcome` names the exit it
 * took: a handle (`out`, `rejected`, `timeout`) or, for a gateway, the edge id.
 * A skipped step continues through `out`.
 */
export function traversedEdgeIds(graph: WorkflowGraph, steps: WorkflowStep[]): Set<string> {
  const taken = new Set<string>();
  const typeOf = new Map(graph.nodes.map((node) => [node.id, node.type]));
  for (const step of steps) {
    if (step.status !== 'completed' && step.status !== 'skipped') continue;
    const outcome = step.outcome ?? 'out';
    for (const edge of graph.edges) {
      if (edge.source !== step.node_id) continue;
      const matches = typeOf.get(step.node_id) === 'gateway' ? edge.id === outcome : (edge.sourceHandle ?? 'out') === outcome;
      if (matches) taken.add(edge.id);
    }
  }
  return taken;
}

/** The step a user can act on in an incident: the latest failed one. */
export function failedStep(steps: WorkflowStep[]): WorkflowStep | undefined {
  return [...steps].sort((a, b) => b.seq - a.seq).find((step) => step.status === 'failed');
}
