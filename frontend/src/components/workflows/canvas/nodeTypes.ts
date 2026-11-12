import { CardNode, EndNode, GatewayNode, StartNode } from './nodes';

/** Node renderers by contract node type. Module-level so React Flow never sees a new object. */
export const workflowNodeTypes = {
  start: StartNode,
  action: CardNode,
  task: CardNode,
  wait: CardNode,
  gateway: GatewayNode,
  end: EndNode,
};
