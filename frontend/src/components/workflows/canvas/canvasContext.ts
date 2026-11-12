import { createContext, useContext } from 'react';
import type { WorkflowCatalog } from '../../../api/types/workflow.types';
import type { NodeRunState } from '../graph/runStatus';

/**
 * What the node components need besides their own data: the catalog (to name
 * actions), which nodes have validation issues, and — in the run view — where
 * the run stands. Kept in context so dragging a node never rebuilds node data.
 */
export interface WorkflowCanvasContextValue {
  catalog?: WorkflowCatalog;
  /** Number of validation issues per node id. */
  issueCounts: Record<string, number>;
  /** Run view only: each visited node's latest state. */
  runStates: Record<string, NodeRunState> | null;
}

export const WorkflowCanvasContext = createContext<WorkflowCanvasContextValue>({ issueCounts: {}, runStates: null });

export const useWorkflowCanvas = (): WorkflowCanvasContextValue => useContext(WorkflowCanvasContext);

/** Data-transfer type of a palette item dragged onto the canvas. */
export const PALETTE_MIME = 'application/x-opentyme-workflow-node';
