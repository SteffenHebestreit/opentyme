/**
 * Which nodes a canvas frames when it opens.
 *
 * A flow that fits is shown whole. A longer one is not squeezed into the frame
 * until its nodes are unreadable: the editor opens at its start, a run where it
 * stands (its waiting or failed node), and the rest is a pan away.
 */
import type { FlowNode } from './flowGraph';
import type { NodeRunState } from './runStatus';

/** Flow units (px at zoom 1) a canvas shows at once before its nodes get too small to read. */
export const READABLE_SPAN = 1300;

export function initialFocus(
  nodes: Array<Pick<FlowNode, 'id' | 'position'>>,
  runStates?: Record<string, Pick<NodeRunState, 'status'>> | null
): Array<{ id: string }> | undefined {
  if (nodes.length === 0) return undefined;
  const xs = nodes.map((node) => node.position.x);
  const minX = Math.min(...xs);
  if (Math.max(...xs) - minX <= READABLE_SPAN) return undefined;
  const resting = runStates
    ? nodes.find((node) => ['waiting', 'failed', 'active'].includes(runStates[node.id]?.status ?? ''))
    : undefined;
  const from = resting ? Math.max(minX, resting.position.x - READABLE_SPAN / 2) : minX;
  const framed = nodes.filter((node) => node.position.x >= from && node.position.x <= from + READABLE_SPAN);
  return framed.length > 0 ? framed.map((node) => ({ id: node.id })) : undefined;
}
