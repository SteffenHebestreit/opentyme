/**
 * What a canvas frames when it opens: a short flow whole, a long one at its
 * start (editor) or where the run stands — never squeezed until unreadable.
 */
import { READABLE_SPAN, initialFocus } from '../../src/components/workflows/graph/focus';

const at = (id: string, x: number) => ({ id, position: { x, y: 100 } });
const long = Array.from({ length: 11 }, (_, index) => at(`n${index}`, index * 260));

it('shows a flow that fits as a whole', () => {
  expect(initialFocus([])).toBeUndefined();
  expect(initialFocus([at('a', 0), at('b', 400), at('c', READABLE_SPAN)])).toBeUndefined();
});

it('opens a long flow at its start in the editor', () => {
  expect(initialFocus(long)?.map((node) => node.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
});

it('opens a run where it stands', () => {
  const states = { n0: { status: 'completed' as const }, n7: { status: 'waiting' as const } };
  expect(initialFocus(long, states)?.map((node) => node.id)).toEqual(['n5', 'n6', 'n7', 'n8', 'n9']);
  const failed = { n10: { status: 'failed' as const } };
  expect(initialFocus(long, failed)?.map((node) => node.id)).toEqual(['n8', 'n9', 'n10']);
  // A run that has ended has no resting node: back to the start.
  expect(initialFocus(long, { n0: { status: 'completed' as const } })?.[0]).toEqual({ id: 'n0' });
});
