/**
 * A run's history: every step in the order the run reached it, with what it
 * was given, what it produced and — if it failed — why.
 */
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import type { WorkflowCatalog, WorkflowGraph, WorkflowStep } from '../../../api/types/workflow.types';
import type { AnyNodeData } from '../graph/flowGraph';
import { formatDate } from '../../../utils/date';
import { StepStatusBadge } from '../WorkflowBadges';
import { useWorkflowLabels } from '../useWorkflowLabels';

interface StepTimelineProps {
  steps: WorkflowStep[];
  graph: WorkflowGraph;
  catalog?: WorkflowCatalog;
  /** Steps of this node are emphasised (the node clicked on the canvas). */
  highlightNodeId?: string | null;
}

const TIME: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };

const hasContent = (value: Record<string, unknown> | null): value is Record<string, unknown> => !!value && Object.keys(value).length > 0;

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <details className="group text-xs">
      <summary className="cursor-pointer select-none rounded text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:text-gray-200">
        {label}
      </summary>
      <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-gray-50 p-2.5 font-mono text-[11px] leading-relaxed text-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export const StepTimeline: FC<StepTimelineProps> = ({ steps, graph, catalog, highlightNodeId }) => {
  const { t } = useTranslation('workflows');
  const labels = useWorkflowLabels(catalog);
  const ordered = [...steps].sort((a, b) => a.seq - b.seq);
  const nodeOf = new Map(graph.nodes.map((node) => [node.id, node]));

  if (ordered.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{t('run.noSteps')}</p>;
  }

  return (
    <ol className="space-y-2">
      {ordered.map((step) => {
        const node = nodeOf.get(step.node_id);
        const title = node ? labels.nodeTitle(node.type, node.data as AnyNodeData) : step.node_id;
        const outcomeEdge = step.outcome ? graph.edges.find((edge) => edge.id === step.outcome) : undefined;
        const outcome =
          step.outcome && step.outcome !== 'out'
            ? outcomeEdge
              ? outcomeEdge.label || labels.conditionSummary(outcomeEdge.condition)
              : labels.handleLabel(step.outcome)
            : null;
        return (
          <li
            key={step.id}
            className={cn(
              'rounded-xl border bg-white p-3 transition-colors dark:bg-gray-900',
              step.node_id === highlightNodeId ? 'border-brand-400 ring-1 ring-brand-400/40 dark:border-brand-500' : 'border-gray-200 dark:border-gray-800'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  <span className="mr-1.5 font-mono text-xs tabular-nums text-gray-400 dark:text-gray-500">{step.seq}</span>
                  {title}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {labels.nodeTypeLabel(step.node_type)}
                  {step.attempt > 1 && ` · ${t('run.attempt', { n: step.attempt })}`}
                  {outcome && ` · ${t('run.outcome', { outcome })}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {formatDate(step.started_at ?? step.created_at, TIME)}
                  {step.finished_at && ` → ${formatDate(step.finished_at, TIME)}`}
                </span>
                <StepStatusBadge status={step.status} />
              </div>
            </div>
            {step.error && (
              <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800 dark:bg-red-500/10 dark:text-red-200">
                {labels.stepErrorText(step)}
              </p>
            )}
            {(hasContent(step.input) || hasContent(step.output)) && (
              <div className="mt-2 space-y-1">
                {hasContent(step.input) && <JsonBlock label={t('run.input')} value={step.input} />}
                {hasContent(step.output) && <JsonBlock label={t('run.output')} value={step.output} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};
