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
 * - Responsive layout: stacked on mobile, horizontal on desktop
 * - Prominent styling to encourage time tracking
 * 
 * @module components/business/time-tracking/TimerStarterCard
 */

import { ChangeEvent, FC } from 'react';
import { TimerIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Project, Client } from '../../../api/types';
import { Button } from '../../common/Button';
import { Input, CustomSelect } from '../../forms';

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
 * - **Mobile (< md)**: Vertical stacked layout with full-width elements
 * - **Desktop (≥ md)**: Horizontal layout with inputs in 2-column grid
 * - Timer icon in colored circle for visual prominence
 * - Button aligned to right on desktop
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
 * - White card with border and shadow for prominence
 * - Indigo accent color for timer icon and focus states
 * - Responsive padding and spacing
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
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:flex-row md:items-center">
      <div className="flex flex-1 items-start gap-4">
        <span className="mt-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-600 text-white">
          <TimerIcon className="h-6 w-6" />
        </span>
        <div className="w-full">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('timer.start')}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t('timer.subtitle')}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
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
            <Input
              id="timer-task-name"
              label={t('form.taskName.label')}
              type="text"
              value={taskName}
              onChange={handleTaskNameChange}
              placeholder={t('form.taskName.placeholder')}
              inputSize="md"
            />
            <Input
              id="timer-description"
              label={t('timer.description')}
              type="text"
              value={description}
              onChange={handleDescriptionChange}
              placeholder={t('timer.descriptionPlaceholder')}
              inputSize="md"
            />
          </div>
          {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
        </div>
      </div>
      <div className="flex flex-none items-center">
        <Button type="button" onClick={onStart} disabled={isStarting}>
          {isStarting ? t('timer.starting') : t('timer.start')}
        </Button>
      </div>
    </div>
  );
};
