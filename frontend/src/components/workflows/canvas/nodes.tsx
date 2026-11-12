/**
 * The building blocks as they are drawn on the canvas: start and end as
 * circles, the gateway as a diamond, and action / task / wait as cards with a
 * coloured stripe (cyan = the software acts, violet = waits for the user).
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Ban, Check, Clock, Loader2, Play, SkipForward, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { ActionNodeData, TaskNodeData } from '../../../api/types/workflow.types';
import { TARGET_HANDLE, sourceHandles } from '../graph/flowGraph';
import type { FlowNode } from '../graph/flowGraph';
import type { NodeRunState, NodeRunStatus } from '../graph/runStatus';
import { useWorkflowLabels } from '../useWorkflowLabels';
import { useWorkflowCanvas } from './canvasContext';

const handleClass =
  '!h-2.5 !w-2.5 !rounded-full !border-2 !border-white !bg-gray-400 transition-colors hover:!bg-brand-500 dark:!border-gray-900 dark:!bg-gray-500';

const RUN_ICONS: Record<Exclude<NodeRunStatus, 'idle'>, { icon: typeof Check; className: string; spin?: boolean }> = {
  completed: { icon: Check, className: 'bg-emerald-500 text-white' },
  active: { icon: Loader2, className: 'bg-brand-500 text-white', spin: true },
  waiting: { icon: Clock, className: 'bg-amber-500 text-white' },
  failed: { icon: X, className: 'bg-red-500 text-white' },
  skipped: { icon: SkipForward, className: 'bg-gray-400 text-white dark:bg-gray-600' },
  cancelled: { icon: Ban, className: 'bg-gray-400 text-white dark:bg-gray-600' },
};

const RUN_BORDERS: Record<NodeRunStatus, string> = {
  idle: 'border-gray-200 opacity-60 dark:border-gray-800',
  completed: 'border-emerald-400 dark:border-emerald-500/70',
  active: 'border-brand-500 ring-2 ring-brand-500/25',
  waiting: 'border-amber-400 ring-2 ring-amber-400/25 dark:border-amber-500/80',
  failed: 'border-red-500 ring-2 ring-red-500/25',
  skipped: 'border-gray-300 dark:border-gray-700',
  cancelled: 'border-gray-300 dark:border-gray-700',
};

/** Border and ring of a node: run state in the run view, else selection / validation issues. */
function useNodeFrame(id: string, selected: boolean | undefined) {
  const { issueCounts, runStates } = useWorkflowCanvas();
  const issues = issueCounts[id] ?? 0;
  const run: NodeRunState | undefined = runStates?.[id];
  const frame = runStates
    ? cn(RUN_BORDERS[run?.status ?? 'idle'], selected && 'outline outline-2 outline-offset-2 outline-brand-500')
    : cn(
        issues > 0 ? 'border-red-400 dark:border-red-500/70' : 'border-gray-200 dark:border-gray-700',
        selected && 'border-brand-500 ring-2 ring-brand-500/30 dark:border-brand-400'
      );
  return { frame, issues, run, inRun: !!runStates };
}

/** Run state (check, clock, …) and issue count, pinned to a node's top-right corner. */
function CornerBadges({ run, issues, labelFor }: { run?: NodeRunState; issues: number; labelFor: (status: NodeRunStatus) => string }) {
  const runIcon = run && run.status !== 'idle' ? RUN_ICONS[run.status] : null;
  if (!runIcon && issues === 0) return null;
  const Icon = runIcon?.icon;
  return (
    <span className="absolute -right-2 -top-2 flex items-center gap-1">
      {issues > 0 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm" data-testid="node-issue">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
      {runIcon && Icon && run && (
        <span
          className={cn('flex h-5 items-center justify-center gap-0.5 rounded-full px-1 shadow-sm', runIcon.className, run.visits > 1 ? 'min-w-[2rem]' : 'w-5')}
          title={labelFor(run.status)}
          data-run-status={run.status}
        >
          <Icon className={cn('h-3 w-3', runIcon.spin && 'animate-spin')} aria-hidden="true" />
          {run.visits > 1 && <span className="text-[10px] font-semibold leading-none">×{run.visits}</span>}
        </span>
      )}
    </span>
  );
}

function Pill({ tone, children }: { tone: 'plain' | 'approval' | 'task'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px text-[10px] font-semibold leading-4',
        tone === 'plain' && 'text-gray-500 ring-1 ring-inset ring-gray-200 dark:text-gray-400 dark:ring-gray-700',
        tone === 'approval' && 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
        tone === 'task' && 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
      )}
    >
      {children}
    </span>
  );
}

/** Action, task and wait: a card with stripe, type, title and pills. */
export const CardNode = memo(function CardNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const { catalog } = useWorkflowCanvas();
  const labels = useWorkflowLabels(catalog);
  const { t } = labels;
  const { frame, issues, run } = useNodeFrame(id, selected);
  const config = data.config;
  const exits = sourceHandles(type, config);
  const isAction = type === 'action';
  const isTask = type === 'task';
  const task = config as TaskNodeData;

  return (
    <div
      className={cn('relative w-[212px] rounded-xl border bg-white py-2.5 pl-4 pr-3 shadow-soft transition-[border-color,box-shadow] dark:bg-gray-900', frame)}
      aria-label={`${labels.nodeTypeLabel(type)}: ${labels.nodeTitle(type, config)}`}
    >
      <Handle type="target" position={Position.Left} id={TARGET_HANDLE} className={handleClass} />
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-2.5 left-1.5 top-2.5 w-[3px] rounded-full',
          isAction ? 'bg-brand-500 dark:bg-brand-400' : isTask ? 'bg-violet-500 dark:bg-violet-400' : 'bg-gray-300 dark:bg-gray-600'
        )}
      />
      <p
        className={cn(
          'font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.1em]',
          isAction ? 'text-brand-700 dark:text-brand-400' : isTask ? 'text-violet-700 dark:text-violet-300' : 'text-gray-500 dark:text-gray-400'
        )}
      >
        {labels.nodeTypeLabel(type)}
      </p>
      <p className="mt-0.5 line-clamp-2 break-words text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
        {labels.nodeTitle(type, config)}
      </p>
      {(isAction || isTask) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {isAction &&
            ((config as ActionNodeData).mode === 'approval' ? (
              <Pill tone="approval">{t('mode.approval')}</Pill>
            ) : (
              <Pill tone="plain">{t('mode.auto')}</Pill>
            ))}
          {isTask && <Pill tone="task">{labels.taskKindLabel(task.kind)}</Pill>}
          {isTask && !!task.dueInDays && <Pill tone="plain">{t('task.dueShort', { count: task.dueInDays })}</Pill>}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" className={handleClass} />
      {exits.includes('rejected') && (
        <>
          <Handle type="source" position={Position.Bottom} id="rejected" style={{ left: '28%' }} className={handleClass} />
          <span className="pointer-events-none absolute left-[28%] top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {labels.handleLabel('rejected')}
          </span>
        </>
      )}
      {exits.includes('timeout') && (
        <>
          <Handle type="source" position={Position.Bottom} id="timeout" style={{ left: '72%' }} className={handleClass} />
          <span className="pointer-events-none absolute left-[72%] top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {labels.handleLabel('timeout')}
          </span>
        </>
      )}
      <CornerBadges run={run} issues={issues} labelFor={(status) => t(`nodeRunStatus.${status}`)} />
    </div>
  );
});

function CaptionBelow({ children, muted }: { children: ReactNode; muted?: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 w-36 -translate-x-1/2 text-center">
      <span className="block truncate text-xs font-semibold text-gray-900 dark:text-white">{children}</span>
      {muted && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{muted}</span>}
    </span>
  );
}

export const StartNode = memo(function StartNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const { catalog } = useWorkflowCanvas();
  const labels = useWorkflowLabels(catalog);
  const { frame, issues, run } = useNodeFrame(id, selected);
  const title = labels.nodeTitle(type, data.config);
  return (
    <div
      className={cn('relative flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] bg-white shadow-soft dark:bg-gray-900', frame)}
      aria-label={`${labels.nodeTypeLabel('start')}: ${title}`}
    >
      <Play className="h-4 w-4 translate-x-px fill-current text-gray-500 dark:text-gray-400" aria-hidden="true" />
      <Handle type="source" position={Position.Right} id="out" className={handleClass} />
      <CaptionBelow>{title}</CaptionBelow>
      <CornerBadges run={run} issues={issues} labelFor={(status) => labels.t(`nodeRunStatus.${status}`)} />
    </div>
  );
});

export const EndNode = memo(function EndNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const { catalog } = useWorkflowCanvas();
  const labels = useWorkflowLabels(catalog);
  const { frame, issues, run } = useNodeFrame(id, selected);
  const title = labels.nodeTitle(type, data.config);
  return (
    <div
      className={cn('relative flex h-11 w-11 items-center justify-center rounded-full border-[3.5px] bg-white shadow-soft dark:bg-gray-900', frame)}
      aria-label={`${labels.nodeTypeLabel('end')}: ${title}`}
    >
      <Handle type="target" position={Position.Left} id={TARGET_HANDLE} className={handleClass} />
      <CaptionBelow>{title}</CaptionBelow>
      <CornerBadges run={run} issues={issues} labelFor={(status) => labels.t(`nodeRunStatus.${status}`)} />
    </div>
  );
});

export const GatewayNode = memo(function GatewayNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const { catalog } = useWorkflowCanvas();
  const labels = useWorkflowLabels(catalog);
  const { frame, issues, run } = useNodeFrame(id, selected);
  const title = labels.nodeTitle(type, data.config);
  return (
    <div className="relative h-14 w-14" aria-label={`${labels.nodeTypeLabel('gateway')}: ${title}`}>
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 w-40 -translate-x-1/2 truncate text-center text-xs font-semibold text-gray-900 dark:text-white">
        {title}
      </span>
      <div className={cn('absolute inset-[7px] flex rotate-45 items-center justify-center rounded-[5px] border-[1.5px] bg-white shadow-soft dark:bg-gray-900', frame)}>
        <X className="h-4 w-4 -rotate-45 text-gray-500 dark:text-gray-400" aria-hidden="true" />
      </div>
      <Handle type="target" position={Position.Left} id={TARGET_HANDLE} className={handleClass} />
      <Handle type="source" position={Position.Right} id="out" className={handleClass} />
      <CornerBadges run={run} issues={issues} labelFor={(status) => labels.t(`nodeRunStatus.${status}`)} />
    </div>
  );
});
