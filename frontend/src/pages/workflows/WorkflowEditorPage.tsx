/**
 * /workflows/:id — the canvas editor of one flow.
 */
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Workflow } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { buttonClasses } from '../../components/common/buttonStyles';
import { WorkflowEditor } from '../../components/workflows/editor/WorkflowEditor';
import { useWorkflowDefinition } from '../../hooks/api/useWorkflows';

export default function WorkflowEditorPage() {
  const { t } = useTranslation('workflows');
  const { id } = useParams<{ id: string }>();
  const { data: definition, isLoading, isError } = useWorkflowDefinition(id);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SkeletonItem className="h-9 w-72" />
        <SkeletonItem className="h-[60vh] w-full" />
      </div>
    );
  }

  if (isError || !definition) {
    return (
      <EmptyState
        icon={Workflow}
        title={t('editor.notFound')}
        description={t('editor.notFoundHint')}
        action={
          <Link to="/workflows" className={buttonClasses('secondary')}>
            {t('editor.back')}
          </Link>
        }
      />
    );
  }

  // Keyed by id: another flow gets a fresh editor instead of inheriting this one's draft state
  return <WorkflowEditor key={definition.id} definition={definition} />;
}
