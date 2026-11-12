/**
 * The canvas a flow is drawn on — shared by the editor (interactive) and the
 * run view (read-only, with each node's run state).
 */
import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { OnConnect, OnEdgesChange, OnNodesChange, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useApp } from '../../../store/AppContext';
import type { GatewayNodeData, WorkflowCatalog } from '../../../api/types/workflow.types';
import type { FlowEdge, FlowNode, PaletteItem } from '../graph/flowGraph';
import type { NodeRunState } from '../graph/runStatus';
import { initialFocus } from '../graph/focus';
import { useWorkflowLabels } from '../useWorkflowLabels';
import { PALETTE_MIME, WorkflowCanvasContext } from './canvasContext';
import { workflowNodeTypes } from './nodeTypes';

export type FlowInstance = ReactFlowInstance<FlowNode, FlowEdge>;

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  catalog?: WorkflowCatalog;
  /** No dragging, connecting or deleting — selection still works (pass onNodesChange to keep it). */
  readOnly?: boolean;
  onNodesChange?: OnNodesChange<FlowNode>;
  onEdgesChange?: OnEdgesChange<FlowEdge>;
  onConnect?: OnConnect;
  /** A palette item was dropped at this canvas position. */
  onDropItem?: (item: PaletteItem, position: { x: number; y: number }) => void;
  onInit?: (instance: FlowInstance) => void;
  /** Validation issues per node id, and the edges an issue points at. */
  issueCounts?: Record<string, number>;
  issueEdgeIds?: Set<string>;
  /** Run view: each node's state and the edges the run took. */
  runStates?: Record<string, NodeRunState> | null;
  traversedEdgeIds?: Set<string>;
  ariaLabel: string;
}

const EDGE_COLORS = { taken: '#019bbf', issue: '#ef4444' };
const EMPTY_COUNTS: Record<string, number> = {};

function FlowCanvasInner({
  nodes,
  edges,
  catalog,
  readOnly = false,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDropItem,
  onInit,
  issueCounts = EMPTY_COUNTS,
  issueEdgeIds,
  runStates = null,
  traversedEdgeIds,
  ariaLabel,
}: FlowCanvasProps) {
  const theme = useApp().state.theme;
  const labels = useWorkflowLabels(catalog);
  const [instance, setInstance] = useState<FlowInstance | null>(null);
  // Decided once, for the graph the canvas opens with — later edits must not move the view
  const [focus] = useState(() => initialFocus(nodes, runStates));

  // Labels, arrows and colours are derived for display only — never stored on the edges
  const displayEdges = useMemo(() => {
    // Only a branch that chooses shows what it chooses by; a parallel one takes every exit
    const choosing = new Set(
      nodes.filter((node) => node.type === 'gateway' && (node.data.config as GatewayNodeData).mode !== 'parallel').map((node) => node.id)
    );
    return edges.map((edge) => {
      // A gateway exit shows its condition; a task's extra exits are already named at their handles
      const label = edge.data?.label?.trim() || (choosing.has(edge.source) ? labels.conditionSummary(edge.data?.condition) : undefined);
      const color = issueEdgeIds?.has(edge.id) ? EDGE_COLORS.issue : traversedEdgeIds?.has(edge.id) ? EDGE_COLORS.taken : undefined;
      return {
        ...edge,
        type: 'smoothstep',
        label,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, ...(color ? { color } : {}) },
        style: color ? { stroke: color, strokeWidth: 2 } : { strokeWidth: 1.5 },
        labelStyle: { fontSize: 11, fontWeight: 500 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
      };
    });
  }, [edges, nodes, labels, issueEdgeIds, traversedEdgeIds]);

  const contextValue = useMemo(() => ({ catalog, issueCounts, runStates }), [catalog, issueCounts, runStates]);

  const handleInit = useCallback(
    (flow: FlowInstance) => {
      setInstance(flow);
      onInit?.(flow);
    },
    [onInit]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(PALETTE_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const raw = event.dataTransfer.getData(PALETTE_MIME);
      if (!raw || !instance || !onDropItem) return;
      event.preventDefault();
      try {
        onDropItem(JSON.parse(raw) as PaletteItem, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      } catch {
        // not one of our palette items — ignore the drop
      }
    },
    [instance, onDropItem]
  );

  return (
    <WorkflowCanvasContext.Provider value={contextValue}>
      <div className="h-full w-full" onDragOver={readOnly ? undefined : handleDragOver} onDrop={readOnly ? undefined : handleDrop}>
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={workflowNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={readOnly ? undefined : onConnect}
          onInit={handleInit}
          colorMode={theme}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1, ...(focus ? { nodes: focus } : {}) }}
          minZoom={0.25}
          maxZoom={1.75}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          edgesReconnectable={false}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          aria-label={ariaLabel}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
          <Controls showInteractive={false} />
          {!readOnly && <MiniMap pannable zoomable className="!hidden xl:!block" />}
        </ReactFlow>
      </div>
    </WorkflowCanvasContext.Provider>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
