import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { LucideIcon, ChevronDown } from 'lucide-react';

/**
 * Available dropdown alignments.
 * @type {('left' | 'right')}
 */
type DropdownAlign = 'left' | 'right';

/**
 * Dropdown menu item.
 */
export interface DropdownItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

/**
 * Props for the Dropdown component.
 * 
 * @interface DropdownProps
 * @property {DropdownItem[]} items - Menu items
 * @property {ReactNode} [trigger] - Custom trigger element
 * @property {string} [label] - Button label if using default trigger
 * @property {LucideIcon} [icon] - Icon for default trigger
 * @property {DropdownAlign} [align='left'] - Menu alignment
 * @property {string} [className] - Additional CSS classes
 */
interface DropdownProps {
  items: DropdownItem[];
  trigger?: ReactNode;
  label?: string;
  icon?: LucideIcon;
  align?: DropdownAlign;
  /** Open below (default) or above the trigger — e.g. in a dialog footer */
  placement?: 'bottom' | 'top';
  className?: string;
}

/**
 * Dropdown menu component.
 * 
 * Features:
 * - Custom or default trigger button
 * - Left/right alignment
 * - Icon support for items
 * - Disabled items
 * - Danger styling for destructive actions
 * - Dividers between sections
 * - Click outside to close
 * - Keyboard navigation (Escape to close)
 * - Dark mode support
 * - Accessible (role="menu", aria-expanded, etc.)
 * 
 * @component
 * @example
 * // Basic dropdown
 * <Dropdown
 *   label="Actions"
 *   items={[
 *     { label: 'Edit', icon: Edit, onClick: () => {} },
 *     { label: 'Delete', icon: Trash2, onClick: () => {}, danger: true },
 *   ]}
 * />
 * 
 * @example
 * // With custom trigger
 * <Dropdown
 *   trigger={<button className="icon-btn">⋮</button>}
 *   items={actions}
 *   align="right"
 * />
 * 
 * @example
 * // With dividers
 * <Dropdown
 *   label="More"
 *   items={[
 *     { label: 'View', onClick: () => {} },
 *     { divider: true, label: '', onClick: () => {} },
 *     { label: 'Delete', danger: true, onClick: () => {} },
 *   ]}
 * />
 * 
 * @param {DropdownProps} props - Component props
 * @returns {JSX.Element} Dropdown element
 */
export const Dropdown: React.FC<DropdownProps> = ({
  items,
  trigger,
  label = 'Options',
  icon: Icon,
  align = 'left',
  placement = 'bottom',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    // Capture phase + preventDefault: Escape closes only this menu, not a dialog around it
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape, true);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled || item.divider) return;
    item.onClick();
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger */}
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-haspopup="menu">
          {trigger}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Menu */}
      {isOpen && (
        <div
          role="menu"
          className={`absolute z-50 min-w-[12rem] animate-scale-in rounded-xl border border-gray-200 bg-white p-1 shadow-lifted dark:border-gray-800 dark:bg-gray-900 ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'mt-1.5'
          } ${
            align === 'right'
              ? placement === 'top' ? 'right-0 origin-bottom-right' : 'right-0 origin-top-right'
              : placement === 'top' ? 'left-0 origin-bottom-left' : 'left-0 origin-top-left'
          }`}
        >
          {items.map((item, index) => {
            if (item.divider) {
              return (
                <div
                  key={index}
                  className="my-1 border-t border-gray-100 dark:border-gray-800"
                />
              );
            }

            const ItemIcon = item.icon;

            return (
              <button
                key={index}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                role="menuitem"
                type="button"
                className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  item.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : item.danger
                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5'
                }`}
              >
                {ItemIcon && <ItemIcon className="h-4 w-4" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
