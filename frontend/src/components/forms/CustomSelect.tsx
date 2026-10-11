import React, { useState, useRef, useEffect, useId } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { fieldClasses, fieldErrorClass, fieldLabelClass } from './fieldStyles';

/**
 * Props for the CustomSelect component.
 */
interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  error?: string;
  /** id of the trigger button (the label points at it) */
  id?: string;
  /** Accessible name when there is no visible label */
  'aria-label'?: string;
}

/**
 * Custom select dropdown component with full styling control.
 * 
 * Features:
 * - Fully styled dropdown with purple accents
 * - Keyboard navigation support
 * - Click outside to close
 * - Transparent background with bottom border only
 * - Purple highlight on hover/focus
 * - Dark mode support
 * 
 * @component
 * @example
 * <CustomSelect
 *   label="Client"
 *   value={clientId}
 *   onChange={setClientId}
 *   options={clients.map(c => ({ value: c.id, label: c.name }))}
 *   placeholder="Select a client"
 * />
 */
export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  required = false,
  disabled = false,
  size = 'md',
  className = '',
  error,
  id,
  'aria-label': ariaLabel,
}) => {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const listboxId = `${buttonId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Reset highlighted index when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(currentIndex);
    }
  }, [isOpen, value, options]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
        } else {
          setIsOpen(true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => 
            prev < options.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label htmlFor={buttonId} className={fieldLabelClass(!!error)}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div
        ref={containerRef}
        className="relative"
      >
        {/* Select button */}
        <button
          id={buttonId}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={clsx(
            fieldClasses({ size, error: !!error }),
            'flex items-center justify-between text-left',
            isOpen && !error && 'border-purple-500 ring-4 ring-purple-500/15 dark:border-purple-400 dark:ring-purple-400/15',
            {
              'cursor-not-allowed opacity-60': disabled,
              'cursor-pointer': !disabled,
              '!text-gray-400 dark:!text-gray-500': !selectedOption,
            }
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-label={ariaLabel}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown
            className={clsx(
              'ml-2 h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500',
              isOpen && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>

        {/* Dropdown list */}
        {isOpen && (
          <ul
            ref={dropdownRef}
            role="listbox"
            id={listboxId}
            aria-label={label ?? ariaLabel}
            className={clsx(
              'absolute z-50 mt-1.5 w-full min-w-[12rem] origin-top animate-scale-in',
              'bg-white dark:bg-gray-900',
              'border border-gray-200 dark:border-gray-800',
              'rounded-xl shadow-lifted',
              'max-h-64 overflow-auto overscroll-contain',
              'p-1'
            )}
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No options available
              </li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={clsx(
                    'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm',
                    'transition-colors duration-100',
                    option.value === value
                      ? 'font-medium text-purple-700 dark:text-purple-300'
                      : 'text-gray-700 dark:text-gray-200',
                    index === highlightedIndex && 'bg-gray-100 dark:bg-white/5'
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {error && (
        <p className={fieldErrorClass}>{error}</p>
      )}
    </div>
  );
};
