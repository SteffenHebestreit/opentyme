import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

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
}) => {
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

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-2 py-2 text-base',
    lg: 'px-2 py-3 text-lg',
  };

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 whitespace-nowrap">
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
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={clsx(
            'w-full bg-transparent border-0 border-b-2 border-gray-600 dark:border-gray-400',
            'focus:outline-none focus:border-purple-500 dark:focus:border-purple-400',
            'text-gray-900 dark:text-gray-100',
            'transition-all duration-200 ease-in-out',
            'flex items-center justify-between',
            sizeClasses[size],
            {
              'cursor-not-allowed opacity-50': disabled,
              'cursor-pointer': !disabled,
              'text-gray-500 dark:text-gray-400': !selectedOption,
            }
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="truncate">{displayText}</span>
          <svg
            className={clsx(
              'w-4 h-4 ml-2 transition-transform duration-200 flex-shrink-0',
              isOpen && 'transform rotate-180'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown list */}
        {isOpen && (
          <ul
            ref={dropdownRef}
            role="listbox"
            className={clsx(
              'absolute z-50 w-full mt-1',
              'bg-white dark:bg-gray-800',
              'border border-gray-300 dark:border-gray-600',
              'rounded-lg shadow-lg',
              'max-h-60 overflow-auto',
              'py-1'
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
                    'px-3 py-2 cursor-pointer',
                    'transition-colors duration-150',
                    'text-gray-900 dark:text-gray-100',
                    {
                      'bg-purple-500 text-white': option.value === value,
                      'bg-purple-100 dark:bg-purple-900/30': 
                        option.value !== value && index === highlightedIndex,
                      'hover:bg-purple-100 dark:hover:bg-purple-900/30':
                        option.value !== value,
                    }
                  )}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};
