/**
 * @fileoverview Time slot picker component for visual time entry creation.
 * 
 * Displays a 24-hour timeline divided into 15-minute intervals, showing existing
 * time entries for the selected date across all projects. Users can click on
 * available time slots to automatically set start and end times.
 * 
 * Features:
 * - Visual 24-hour timeline with 15-minute intervals
 * - Shows existing time entries with project colors
 * - Click to select start time, click again to select end time
 * - Highlights selected time range
 * - Auto-scrolls to current time
 * 
 * @module components/business/time-tracking/TimeSlotPicker
 */

import { FC, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry, Project } from '../../../api/types';
import { Clock } from 'lucide-react';

/**
 * Represents a 15-minute time slot in the timeline.
 */
interface TimeSlot {
  /** Time in HH:mm format */
  time: string;
  /** Minutes since midnight (0-1439) */
  minutesFromMidnight: number;
  /** Whether this slot is occupied by an existing entry */
  isOccupied: boolean;
  /** The time entry occupying this slot, if any */
  entry?: TimeEntry;
}

/**
 * Props for the TimeSlotPicker component.
 */
interface TimeSlotPickerProps {
  /** Selected date in YYYY-MM-DD format */
  selectedDate: string;
  /** Existing time entries for the selected date */
  timeEntries: TimeEntry[];
  /** Available projects for color mapping */
  projects: Project[];
  /** Callback when start time is selected */
  onStartTimeChange: (time: string) => void;
  /** Callback when end time is selected */
  onEndTimeChange: (time: string) => void;
  /** Current start time value */
  startTime?: string;
  /** Current end time value */
  endTime?: string;
}

/**
 * Generates all 15-minute time slots for a 24-hour period.
 * 
 * @returns {TimeSlot[]} Array of 96 time slots (24 hours * 4 slots per hour)
 */
function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const minutesFromMidnight = hour * 60 + minute;
      slots.push({
        time,
        minutesFromMidnight,
        isOccupied: false,
      });
    }
  }
  return slots;
}

/**
 * Converts HH:mm time string to minutes from midnight.
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Checks if a time slot overlaps with a time entry.
 */
function isSlotOccupied(slot: TimeSlot, entry: TimeEntry): boolean {
  const entryStart = timeToMinutes(entry.entry_time || '');
  const entryEnd = entry.entry_end_time 
    ? timeToMinutes(entry.entry_end_time)
    : entryStart + (entry.duration_hours * 60);
  
  return slot.minutesFromMidnight >= entryStart && slot.minutesFromMidnight < entryEnd;
}

/**
 * Gets a color for a project by hashing its ID.
 */
function getProjectColor(projectId: string, projects: Project[]): string {
  const project = projects.find(p => p.id === projectId);
  if (project) {
    // Use a hash of the project name to generate consistent colors
    let hash = 0;
    for (let i = 0; i < project.name.length; i++) {
      hash = project.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 50%)`;
  }
  return 'hsl(280, 60%, 50%)'; // Default purple
}

/**
 * Time slot picker component for visual time entry creation.
 * 
 * Displays a scrollable 24-hour timeline with existing time entries and allows
 * users to click on available slots to set start/end times automatically.
 * 
 * @component
 */
export const TimeSlotPicker: FC<TimeSlotPickerProps> = ({
  selectedDate,
  timeEntries,
  projects,
  onStartTimeChange,
  onEndTimeChange,
  startTime,
  endTime,
}) => {
  const { t } = useTranslation('time-tracking');
  const [slots, setSlots] = useState<TimeSlot[]>(generateTimeSlots());
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Update occupied slots when time entries change
  useEffect(() => {
    const baseSlots = generateTimeSlots();
    const updatedSlots = baseSlots.map(slot => {
      const occupyingEntry = timeEntries.find(entry => isSlotOccupied(slot, entry));
      return {
        ...slot,
        isOccupied: !!occupyingEntry,
        entry: occupyingEntry,
      };
    });
    setSlots(updatedSlots);
  }, [timeEntries]);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (timelineRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const scrollPosition = (currentHour / 24) * timelineRef.current.scrollHeight;
      timelineRef.current.scrollTop = scrollPosition - 100;
    }
  }, []);

  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.isOccupied) return;

    if (!isSelectingEnd) {
      // First click: set start time to the beginning of the slot
      onStartTimeChange(slot.time);
      onEndTimeChange('');
      setIsSelectingEnd(true);
    } else {
      // Second click: set end time to the end of the slot (add 15 minutes)
      if (startTime && timeToMinutes(slot.time) > timeToMinutes(startTime)) {
        const slotEndMinutes = slot.minutesFromMidnight + 15;
        const endHour = Math.floor(slotEndMinutes / 60);
        const endMinute = slotEndMinutes % 60;
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
        onEndTimeChange(endTime);
        setIsSelectingEnd(false);
      } else {
        // Invalid selection, reset
        onStartTimeChange(slot.time);
        onEndTimeChange('');
      }
    }
  };

  const isSlotSelected = (slot: TimeSlot): boolean => {
    if (!startTime) return false;
    const slotMin = slot.minutesFromMidnight;
    const startMin = timeToMinutes(startTime);
    
    if (!endTime) {
      return slotMin === startMin;
    }
    
    const endMin = timeToMinutes(endTime);
    return slotMin >= startMin && slotMin < endMin;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {t('form.timeSlotPicker.label')}
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {isSelectingEnd 
            ? t('form.timeSlotPicker.selectEnd')
            : t('form.timeSlotPicker.selectStart')}
        </span>
      </div>

      <div 
        ref={timelineRef}
        className="h-64 overflow-y-auto border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
      >
        <div className="grid grid-cols-[auto_1fr] gap-0">
          {Array.from({ length: 24 }, (_, hour) => {
            const hourSlots = slots.filter(s => Math.floor(s.minutesFromMidnight / 60) === hour);
            
            return (
              <div key={hour} className="contents">
                {/* Hour label */}
                <div className="sticky left-0 bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  {String(hour).padStart(2, '0')}:00
                </div>
                
                {/* Hour slots */}
                <div className="grid grid-cols-4 border-b border-gray-200 dark:border-gray-700">
                  {hourSlots.map((slot) => {
                    const isSelected = isSlotSelected(slot);
                    const bgColor = slot.isOccupied && slot.entry
                      ? getProjectColor(slot.entry.project_id, projects)
                      : isSelected
                      ? 'bg-purple-200 dark:bg-purple-900'
                      : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700';
                    
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => handleSlotClick(slot)}
                        disabled={slot.isOccupied}
                        className={`
                          h-8 text-xs border-r border-gray-200 dark:border-gray-700 
                          transition-colors relative
                          ${slot.isOccupied ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
                        `}
                        style={slot.isOccupied && slot.entry ? { backgroundColor: bgColor } : undefined}
                        title={slot.isOccupied && slot.entry 
                          ? `${slot.entry.task_name || slot.entry.description || 'Time Entry'} (${slot.entry.entry_time} - ${slot.entry.entry_end_time || 'ongoing'})`
                          : slot.time
                        }
                      >
                        {!slot.isOccupied && (
                          <div className={`absolute inset-0 ${bgColor}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded" />
          <span>{t('form.timeSlotPicker.available')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-purple-200 dark:bg-purple-900 border border-gray-300 dark:border-gray-700 rounded" />
          <span>{t('form.timeSlotPicker.selected')}</span>
        </div>
        {/* Show actual projects with their colors */}
        {Array.from(new Set(timeEntries.map(e => e.project_id))).map(projectId => {
          const project = projects.find(p => p.id === projectId);
          if (!project) return null;
          return (
            <div key={projectId} className="flex items-center gap-2">
              <div 
                className="w-4 h-4 border border-gray-300 dark:border-gray-700 rounded" 
                style={{ backgroundColor: getProjectColor(projectId, projects) }}
              />
              <span>{project.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
