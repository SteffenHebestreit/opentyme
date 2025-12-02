import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../store/AppContext';
import { useProjects } from '../../../hooks/api/useProjects';
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  usePauseTimer,
  useStartTimer,
  useStopTimer,
  useTimeEntries,
  useUpdateTimeEntry,
} from '../../../hooks/api/useTimeEntries';
import { TimeEntry } from '../../../api/types';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { SkeletonCardList } from '../../common/Skeleton';
import { extractErrorMessage } from '../../../utils/error';
import { TimeEntryFilters } from './TimeEntryFilters';
import { TimeEntryTable } from './TimeEntryTable';
import { TimeEntryFormModal } from './TimeEntryFormModal';
import { TimeEntryEmptyState } from './TimeEntryEmptyState';
import { TimerStarterCard } from './TimerStarterCard';
import { ActiveTimerCard } from './ActiveTimerCard';
import { DailyHoursChart } from './DailyHoursChart';
import { WeeklyHoursChart } from './WeeklyHoursChart';
import { MonthlyHoursChart } from './MonthlyHoursChart';

function normalizeDate(value: string, endOfDay = false): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date.toISOString();
}

export default function TimeEntryList() {
  const { t } = useTranslation('time-tracking');
  const { state } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDailyDate, setSelectedDailyDate] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [timerTaskName, setTimerTaskName] = useState('');
  const [timerDescription, setTimerDescription] = useState('');
  const [timerClientFilter, setTimerClientFilter] = useState('');
  const [modalClientFilter, setModalClientFilter] = useState('');

  // Helper function to get today's date
  const getToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  
  // Calculate chart date ranges based on filters
  const chartDateRanges = useMemo(() => {
    const today = getToday();
    const todayDate = new Date(today + 'T00:00:00');
    
    // Helper: get Monday of a week
    const getMonday = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return d;
    };
    
    // Helper: get Sunday of a week
    const getSunday = (monday: Date) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + 6);
      return d;
    };
    
    // Helper: get first day of month
    const getMonthStart = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    };
    
    // Helper: get last day of month
    const getMonthEnd = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    };
    
    // Helper: format date as YYYY-MM-DD (local time, not UTC)
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    let dailyDate = today;
    let weekStart: string;
    let weekEnd: string;
    let monthStart: string;
    let monthEnd: string;
    
    if (!startDate && !endDate) {
      // No filters: use current week and month
      const monday = getMonday(todayDate);
      weekStart = formatDate(monday);
      weekEnd = formatDate(getSunday(monday));
      monthStart = formatDate(getMonthStart(todayDate));
      monthEnd = formatDate(getMonthEnd(todayDate));
    } else if (startDate && endDate) {
      // Both dates set: use the last week of the range and its month
      const end = new Date(endDate + 'T00:00:00');
      const monday = getMonday(end);
      weekStart = formatDate(monday);
      weekEnd = formatDate(getSunday(monday));
      monthStart = formatDate(getMonthStart(end));
      monthEnd = formatDate(getMonthEnd(end));
      dailyDate = endDate;
    } else if (startDate && !endDate) {
      // Only start date: use current week/month but start from startDate if in same month
      const start = new Date(startDate + 'T00:00:00');
      const startMonth = start.getMonth();
      const todayMonth = todayDate.getMonth();
      
      if (startMonth === todayMonth && start.getFullYear() === todayDate.getFullYear()) {
        // Same month - use startDate's month
        monthStart = formatDate(getMonthStart(start));
        monthEnd = formatDate(getMonthEnd(start));
      } else {
        monthStart = formatDate(getMonthStart(todayDate));
        monthEnd = formatDate(getMonthEnd(todayDate));
      }
      
      const monday = getMonday(todayDate);
      weekStart = formatDate(monday);
      weekEnd = formatDate(getSunday(monday));
    } else if (!startDate && endDate) {
      // Only end date: use the week and month of the end date
      const end = new Date(endDate + 'T00:00:00');
      const monday = getMonday(end);
      weekStart = formatDate(monday);
      weekEnd = formatDate(getSunday(monday));
      monthStart = formatDate(getMonthStart(end));
      monthEnd = formatDate(getMonthEnd(end));
      dailyDate = endDate;
    } else {
      // Fallback
      const monday = getMonday(todayDate);
      weekStart = formatDate(monday);
      weekEnd = formatDate(getSunday(monday));
      monthStart = formatDate(getMonthStart(todayDate));
      monthEnd = formatDate(getMonthEnd(todayDate));
    }
    
    return { dailyDate, weekStart, weekEnd, monthStart, monthEnd };
  }, [startDate, endDate]);
  
  // Use selected daily date or calculated one
  const effectiveDailyDate = selectedDailyDate || chartDateRanges.dailyDate;

  const listParams = useMemo(() => {
    return {
      project_id: projectFilter || undefined,
      start_date: normalizeDate(startDate),
      end_date: normalizeDate(endDate, true),
    };
  }, [endDate, projectFilter, startDate]);

  const {
    data: timeEntries = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useTimeEntries(listParams);
  const {
    data: projects = [],
    isLoading: isLoadingProjects,
    isError: isProjectError,
    error: projectError,
    refetch: refetchProjects,
  } = useProjects();

  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const pauseTimer = usePauseTimer();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  const filteredEntries = useMemo(() => {
    if (!debouncedSearch) {
      return timeEntries;
    }
    const query = debouncedSearch.toLowerCase();
    return timeEntries.filter((entry) => {
      return [entry.task_name, entry.description, entry.project_name, entry.client_name]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [debouncedSearch, timeEntries]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      return bTime - aTime;
    });
  }, [filteredEntries]);

  // Find active timer entry (one with date_start set and no entry_end_time - still being tracked)
  const activeEntry = useMemo(() => timeEntries.find((entry) => entry.date_start && !entry.entry_end_time), [timeEntries]);

  // Filter projects for timer by client
  const filteredTimerProjects = useMemo(() => {
    if (!timerClientFilter) return projects;
    return projects.filter(p => p.client_id === timerClientFilter);
  }, [projects, timerClientFilter]);

  // Filter projects for modal by client
  const filteredModalProjects = useMemo(() => {
    if (!modalClientFilter) return projects;
    return projects.filter(p => p.client_id === modalClientFilter);
  }, [projects, modalClientFilter]);

  // Get unique clients from projects
  const clients = useMemo(() => {
    const uniqueClients = new Map();
    projects.forEach(p => {
      if (p.client_id && p.client) {
        uniqueClients.set(p.client_id, p.client);
      }
    });
    return Array.from(uniqueClients.values());
  }, [projects]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingEntry(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: TimeEntry) => {
    setModalMode('edit');
    setEditingEntry(entry);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
    setFormError(null);
  };

  const handleSubmit = async (payload: Parameters<typeof createEntry.mutateAsync>[0]) => {
    setFormError(null);
    setSuccessMessage(null);
    setTimerError(null);
    try {
      if (modalMode === 'create') {
        await createEntry.mutateAsync(payload);
        setSuccessMessage(t('messages.created'));
      } else if (editingEntry) {
        await updateEntry.mutateAsync({ id: editingEntry.id, payload });
        setSuccessMessage(t('messages.updated'));
      }
      closeModal();
    } catch (submitError) {
      setFormError(extractErrorMessage(submitError));
    }
  };

  const handleDelete = async (entry: TimeEntry) => {
    const confirmed = window.confirm(t('messages.deleteConfirm'));
    if (!confirmed) {
      return;
    }
    setDeleteError(null);
    setSuccessMessage(null);
    setDeletingId(entry.id);
    try {
      await deleteEntry.mutateAsync(entry.id);
      setSuccessMessage(t('messages.deleted'));
    } catch (deleteErr) {
      setDeleteError(extractErrorMessage(deleteErr));
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartTimer = async () => {
    if (!timerProjectId) {
      setTimerError(t('form.project.required'));
      return;
    }
    setTimerError(null);
    setSuccessMessage(null);
    try {
      await startTimer.mutateAsync({
        projectId: timerProjectId,
        payload: {
          task_name: timerTaskName.trim() ? timerTaskName.trim() : undefined,
          description: timerDescription.trim() ? timerDescription.trim() : undefined,
        },
      });
      setTimerTaskName('');
      setTimerDescription('');
      setSuccessMessage(t('messages.timerStarted'));
    } catch (startError) {
      setTimerError(extractErrorMessage(startError));
    }
  };

  const handlePauseTimer = async () => {
    setSuccessMessage(null);
    setTimerError(null);
    try {
      await pauseTimer.mutateAsync();
      setSuccessMessage(t('messages.timerPaused'));
    } catch (pauseError) {
      setTimerError(extractErrorMessage(pauseError));
    }
  };

  const handleStopTimer = async (entry: TimeEntry | null) => {
    if (!entry) {
      return;
    }
    setStoppingId(entry.id);
    setSuccessMessage(null);
    setTimerError(null);
    try {
      await stopTimer.mutateAsync();
      setSuccessMessage(t('messages.timerStopped'));
    } catch (stopError) {
      setTimerError(extractErrorMessage(stopError));
    } finally {
      setStoppingId(null);
    }
  };

  const handleTimerProjectChange = (value: string) => {
    setTimerProjectId(value);
    if (timerError) {
      setTimerError(null);
    }
  };

  const handleTimerDescriptionChange = (value: string) => {
    setTimerDescription(value);
  };

  const handleTimerTaskNameChange = (value: string) => {
    setTimerTaskName(value);
  };

  if (!state.isAuthenticated) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('noAuth')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={openCreateModal}>
            {t('addEntry')}
          </Button>
        </div>
      </div>

      {activeEntry ? (
        <ActiveTimerCard
          entry={activeEntry}
          onPause={handlePauseTimer}
          onStop={() => handleStopTimer(activeEntry)}
          isPausing={pauseTimer.isPending}
          isStopping={stopTimer.isPending && stoppingId === activeEntry.id}
        />
      ) : (
        <TimerStarterCard
          projectId={timerProjectId}
          taskName={timerTaskName}
          description={timerDescription}
          onProjectChange={handleTimerProjectChange}
          onTaskNameChange={handleTimerTaskNameChange}
          onDescriptionChange={handleTimerDescriptionChange}
          projects={filteredTimerProjects}
          clients={clients}
          clientFilter={timerClientFilter}
          onClientFilterChange={setTimerClientFilter}
          onStart={handleStartTimer}
          isStarting={startTimer.isPending}
          error={timerError}
        />
      )}

      <TimeEntryFilters
        search={searchTerm}
        onSearchChange={setSearchTerm}
        projectId={projectFilter}
        onProjectChange={setProjectFilter}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        projects={projects}
      />

      {/* Time Tracking Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DailyHoursChart
          timeEntries={timeEntries}
          projects={projects}
          selectedDate={effectiveDailyDate}
          onDateChange={setSelectedDailyDate}
        />
        <WeeklyHoursChart
          timeEntries={timeEntries}
          projects={projects}
          weekStart={chartDateRanges.weekStart}
          weekEnd={chartDateRanges.weekEnd}
        />
      </div>

      <MonthlyHoursChart
        timeEntries={timeEntries}
        projects={projects}
        monthStart={chartDateRanges.monthStart}
        monthEnd={chartDateRanges.monthEnd}
      />

      {successMessage ? (
        <Alert type="success" message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}

      {deleteError ? (
        <Alert type="error" message={deleteError} onClose={() => setDeleteError(null)} />
      ) : null}

      {timerError ? (
        <Alert type="error" message={timerError} onClose={() => setTimerError(null)} />
      ) : null}

      {isError ? (
        <Alert
          type="error"
          message={extractErrorMessage(error)}
          onClose={() => void refetch()}
        />
      ) : null}

      {isProjectError ? (
        <Alert
          type="error"
          message={extractErrorMessage(projectError)}
          onClose={() => void refetchProjects()}
        />
      ) : null}

      {isLoading || isLoadingProjects ? (
        <SkeletonCardList count={3} />
      ) : sortedEntries.length === 0 ? (
        <TimeEntryEmptyState onCreate={openCreateModal} />
      ) : (
        <TimeEntryTable
          entries={sortedEntries}
          onEdit={openEditModal}
          onDelete={handleDelete}
          onStop={activeEntry ? handleStopTimer : undefined}
          isDeletingId={deletingId}
          isStoppingId={stoppingId}
        />
      )}

      <TimeEntryFormModal
        open={isModalOpen}
        mode={modalMode}
        projects={filteredModalProjects}
        clients={clients}
        clientFilter={modalClientFilter}
        onClientFilterChange={setModalClientFilter}
        initialEntry={editingEntry}
        defaultProjectId={state.activeProjectId ?? undefined}
        onSubmit={handleSubmit}
        onClose={closeModal}
        isSubmitting={createEntry.isPending || updateEntry.isPending}
        error={formError}
      />
    </div>
  );
}
