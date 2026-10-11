/**
 * @fileoverview Timer starter card component for quickly initiating time tracking.
 * 
 * Provides a quick-start interface for beginning time tracking with minimal friction.
 * Users can select a project and optionally add a description before starting a timer.
 * Designed for prominent placement on time tracking pages for easy access.
 * 
 * Features:
 * - Project selection dropdown (required to start timer)
 * - Optional task description input
 * - Timer icon visual indicator
 * - Start button with loading state
 * - Error message display
 * - Responsive layout: fields stack on mobile and sit in one row on wide screens
 * 
 * @module components/business/time-tracking/TimerStarterCard
 */

import { ChangeEvent, FC } from 'react';
import { Play, TimerIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Project, Client } from '../../../api/types';
import { Button } from '../../common/Button';
import { CustomSelect } from '../../forms';
import { fieldClasses, fieldLabelClass } from '../../forms/fieldStyles';

/**
 * Props for the TimerStarterCard component.
 * 
 * @interface TimerStarterCardProps
 * @property {string} projectId - Currently selected project ID (empty string for no selection)
 * @property {string} taskName - Current task name value
 * @property {string} description - Current task description value
 * @property {(value: string) => void} onProjectChange - Handler for project selection changes
 * @property {(value: string) => void} onTaskNameChange - Handler for task name input changes
 * @property {(value: string) => void} onDescriptionChange - Handler for description input changes
 * @property {Project[]} projects - Available projects for the dropdown
 * @property {() => void} onStart - Handler for start timer button click
 * @property {boolean} isStarting - Loading state during timer start operation
 * @property {string | null} [error] - Error message to display below the form
 */
interface TimerStarterCardProps {
  projectId: string;
  taskName: string;
  description: string;
  onProjectChange: (value: string) => void;
  onTaskNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  projects: Project[];
  clients: Client[];
  clientFilter: string;
  onClientFilterChange: (value: string) => void;
  onStart: () => void;
  isStarting: boolean;
  error?: string | null;
}

/**
 * Quick-start card component for initiating time tracking.
 * 
 * Provides a user-friendly interface for starting a timer with minimal required input.
 * Features a prominent design to encourage regular time tracking usage.
 * 
 * Form Elements:
 * - **Project dropdown**: Select the project to track time against (required)
 * - **Description input**: Optional text field for task details
 * - **Start button**: Initiates timer creation with selected values
 * 
 * Layout:
 * - **Mobile**: fields stacked, full width
 * - **sm–lg**: two fields per row
 * - **xl**: all fields and the start button in one row
 * 
 * Interaction Flow:
 * 1. User selects project from dropdown
 * 2. User optionally enters task description
 * 3. User clicks "Start timer" button
 * 4. Parent component creates time entry with start_time = now
 * 5. Timer card disabled during creation (isStarting = true)
 * 6. On success, form typically resets or redirects to active timer view
 * 7. On error, error message displays below form fields
 * 
 * Validation:
 * - Project selection is required (enforced by parent component)
 * - Description is optional
 * - Start button can be enabled/disabled by parent
 * 
 * Loading State:
 * - Button shows "Starting…" when isStarting is true
 * - Button is disabled during timer creation
 * 
 * Error Handling:
 * - Displays error message in red below form when error prop is set
 * - Error typically cleared when user modifies inputs
 * 
 * Styling:
 * - Standard surface card, bordered fields with a soft focus ring
 * - Brand-violet icon chip and primary start button
 * - Dark mode support throughout
 * 
 * @component
 * @example
 * // Basic usage with controlled inputs
 * const [projectId, setProjectId] = useState('');
 * const [description, setDescription] = useState('');
 * 
 * <TimerStarterCard
 *   projectId={projectId}
 *   description={description}
 *   onProjectChange={setProjectId}
 *   onDescriptionChange={setDescription}
 *   projects={projects}
 *   onStart={() => {
 *     if (!projectId) {
 *       setError('Please select a project');
 *       return;
 *     }
 *     startTimerMutation.mutate({
 *       project_id: projectId,
 *       description: description || undefined,
 *       start_time: new Date().toISOString(),
 *     });
 *   }}
 *   isStarting={startTimerMutation.isPending}
 *   error={error}
 * />
 * 
 * @example
 * // With validation and navigation
 * <TimerStarterCard
 *   projectId={selectedProjectId}
 *   description={taskDescription}
 *   onProjectChange={(id) => {
 *     setSelectedProjectId(id);
 *     setError(null); // Clear error on change
 *   }}
 *   onDescriptionChange={(desc) => {
 *     setTaskDescription(desc);
 *     setError(null);
 *   }}
 *   projects={projects}
 *   onStart={async () => {
 *     if (!selectedProjectId) {
 *       setError('Project is required to start a timer');
 *       return;
 *     }
 *     const timer = await startTimerMutation.mutateAsync({
 *       project_id: selectedProjectId,
 *       task_name: taskDescription,
 *       start_time: new Date().toISOString(),
 *       billable: true,
 *     });
 *     navigate(`/time-entries?activeTimer=${timer.id}`);
 *   }}
 *   isStarting={startTimerMutation.isPending}
 *   error={error || startTimerMutation.error?.message}
 * />
 * 
 * @param {TimerStarterCardProps} props - Component props
 * @returns {JSX.Element} Timer starter card component
 */
export const TimerStarterCard: FC<TimerStarterCardProps> = ({
  projectId,
  taskName,
  description,
  onProjectChange,
  onTaskNameChange,
  onDescriptionChange,
  projects,
  clients,
  clientFilter,
  onClientFilterChange,
  onStart,
  isStarting,
  error,
}) => {
  const { t } = useTranslation('time-tracking');
  
  const handleTaskNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onTaskNameChange(event.target.value);
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    onDescriptionChange(event.target.value);
  };

  // Client options for filter
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: client.name,
  }));

  // Project options for CustomSelect
  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: project.client?.name 
      ? `${project.name} (${project.client.name})`
      : project.name,
  }));

  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="timer-starter-title">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
          <TimerIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="timer-starter-title" className="section-title">
            {t('timer.start')}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('timer.subtitle')}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <CustomSelect
          label={t('filters.client')}
          value={clientFilter}
          onChange={onClientFilterChange}
          options={clientOptions}
          placeholder={t('filters.allClients')}
          size="md"
        />
        <CustomSelect
          label={t('filters.project')}
          value={projectId}
          onChange={onProjectChange}
          options={projectOptions}
          placeholder={t('timer.selectProject')}
          size="md"
        />
        <div>
          <label htmlFor="timer-task-name" className={fieldLabelClass()}>
            {t('form.taskName.label')}
          </label>
          <input
            id="timer-task-name"
            type="text"
            value={taskName}
            onChange={handleTaskNameChange}
            placeholder={t('form.taskName.placeholder')}
            className={fieldClasses({ size: 'md' })}
          />
        </div>
        <div>
          <label htmlFor="timer-description" className={fieldLabelClass()}>
            {t('timer.description')}
          </label>
          <input
            id="timer-description"
            type="text"
            value={description}
            onChange={handleDescriptionChange}
            placeholder={t('timer.descriptionPlaceholder')}
            className={fieldClasses({ size: 'md' })}
          />
        </div>
        <Button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          isLoading={isStarting}
          leftIcon={<Play className="h-4 w-4" />}
          className="h-10 w-full sm:col-span-2 xl:col-span-1 xl:w-auto"
        >
          {isStarting ? t('timer.starting') : t('timer.start')}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 animate-fade-in text-sm font-medium text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
};
