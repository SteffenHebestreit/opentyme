/**
 * The building blocks on the left of the editor. Click adds one in the middle
 * of the canvas; dragging places it where it is dropped.
 */
import { FC, ReactNode } from 'react';
import { CircleDot, Clock, FileUp, GitBranch, ListChecks, Play, SquareCheck, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { WorkflowCatalog } from '../../../api/types/workflow.types';
import type { PaletteItem } from '../graph/flowGraph';
import { PALETTE_MIME } from '../canvas/canvasContext';
import { useWorkflowLabels } from '../useWorkflowLabels';

interface PaletteProps {
  catalog?: WorkflowCatalog;
  /** A flow has exactly one start — the entry is disabled once it exists. */
  hasStart: boolean;
  onAdd: (item: PaletteItem) => void;
}

const TASK_ICONS: Record<string, LucideIcon> = { confirm: SquareCheck, upload: FileUp, form: ListChecks };

function PaletteButton({
  item,
  icon: Icon,
  tone,
  label,
  hint,
  disabled,
  onAdd,
}: {
  item: PaletteItem;
  icon: LucideIcon;
  tone: 'neutral' | 'action' | 'task';
  label: string;
  hint?: string;
  disabled?: boolean;
  onAdd: (item: PaletteItem) => void;
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      title={hint}
      onClick={() => onAdd(item)}
      onDragStart={(event) => {
        event.dataTransfer.setData(PALETTE_MIME, JSON.stringify(item));
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'flex w-full cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm leading-snug text-gray-700 transition-colors',
        'hover:border-gray-200 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:cursor-grabbing',
        'disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-white/[0.04]'
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
          tone === 'action' && 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
          tone === 'task' && 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
          tone === 'neutral' && 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400'
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="line-clamp-2 min-w-0 break-words">{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="eyebrow mb-1 px-2">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export const Palette: FC<PaletteProps> = ({ catalog, hasStart, onAdd }) => {
  const labels = useWorkflowLabels(catalog);
  const { t } = labels;

  const categories: Array<{ key: string; actions: NonNullable<WorkflowCatalog['actions']> }> = [];
  for (const action of catalog?.actions ?? []) {
    const group = categories.find((candidate) => candidate.key === action.category);
    if (group) group.actions.push(action);
    else categories.push({ key: action.category, actions: [action] });
  }

  return (
    <nav aria-label={t('palette.title')}>
      <Group title={t('palette.flow')}>
        <PaletteButton
          item={{ type: 'start' }}
          icon={Play}
          tone="neutral"
          label={labels.nodeTypeLabel('start')}
          hint={hasStart ? t('palette.oneStart') : undefined}
          disabled={hasStart}
          onAdd={onAdd}
        />
        <PaletteButton item={{ type: 'gateway' }} icon={GitBranch} tone="neutral" label={labels.nodeTypeLabel('gateway')} onAdd={onAdd} />
        <PaletteButton item={{ type: 'wait' }} icon={Clock} tone="neutral" label={labels.nodeTypeLabel('wait')} onAdd={onAdd} />
        <PaletteButton item={{ type: 'end' }} icon={CircleDot} tone="neutral" label={labels.nodeTypeLabel('end')} onAdd={onAdd} />
      </Group>

      <Group title={t('palette.tasks')}>
        {(['confirm', 'upload', 'form'] as const).map((kind) => (
          <PaletteButton
            key={kind}
            item={{ type: 'task', kind }}
            icon={TASK_ICONS[kind]}
            tone="task"
            label={labels.taskKindLabel(kind)}
            hint={t(`task.kindHints.${kind}`)}
            onAdd={onAdd}
          />
        ))}
      </Group>

      {categories.map((category) => (
        <Group key={category.key} title={t(`categories.${category.key}`, {
            // An addon's own category: the name the addon gives it, in the app's language where it ships one
            defaultValue: category.actions.find((action) => action.categoryTitle)?.categoryTitle ?? category.key,
          })}>
          {category.actions.map((action) => (
            <PaletteButton
              key={action.key}
              item={{ type: 'action', action: action.key }}
              icon={Zap}
              tone="action"
              label={labels.actionTitle(action.key)}
              hint={labels.actionDescription(action.key)}
              onAdd={onAdd}
            />
          ))}
        </Group>
      ))}
      {!catalog && <p className="px-2 text-xs text-gray-500 dark:text-gray-400">{t('palette.loading')}</p>}
    </nav>
  );
};
