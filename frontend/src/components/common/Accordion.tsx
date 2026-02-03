import React, { useState, ReactNode } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

/**
 * Accordion item data.
 */
export interface AccordionItemData {
  id: string;
  title: string;
  content: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

/**
 * Props for the AccordionItem component.
 */
interface AccordionItemProps {
  item: AccordionItemData;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Individual accordion item component.
 * 
 * @internal
 */
const AccordionItem: React.FC<AccordionItemProps> = ({ item, isOpen, onToggle }) => {
  const ItemIcon = item.icon;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={onToggle}
        disabled={item.disabled}
        className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
          item.disabled
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
        aria-expanded={isOpen}
        aria-controls={`accordion-content-${item.id}`}
      >
        <div className="flex items-center gap-3">
          {ItemIcon && (
            <ItemIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          )}
          <span className="font-medium text-gray-900 dark:text-white">
            {item.title}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div
          id={`accordion-content-${item.id}`}
          className="overflow-hidden"
          style={{
            animation: 'accordionSlideDown 0.2s ease-out',
          }}
        >
          <div className="px-4 pb-4 pt-2 text-gray-700 dark:text-gray-300">
            {item.content}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Props for the Accordion component.
 * 
 * @interface AccordionProps
 * @property {AccordionItemData[]} items - Accordion items
 * @property {string | string[]} [defaultOpen] - Initially open item(s) ID(s)
 * @property {boolean} [allowMultiple=false] - Allow multiple items open
 * @property {string} [className] - Additional CSS classes
 */
interface AccordionProps {
  items: AccordionItemData[];
  defaultOpen?: string | string[];
  allowMultiple?: boolean;
  className?: string;
}

/**
 * Accordion component for collapsible content sections.
 * 
 * Features:
 * - Single or multiple items open
 * - Optional icons for items
 * - Disabled items
 * - Smooth animation
 * - Dark mode support
 * - Accessible (aria-expanded, aria-controls)
 * - Keyboard navigation
 * 
 * @component
 * @example
 * // Basic accordion (single open)
 * <Accordion
 *   items={[
 *     { id: '1', title: 'Section 1', content: <p>Content 1</p> },
 *     { id: '2', title: 'Section 2', content: <p>Content 2</p> },
 *   ]}
 * />
 * 
 * @example
 * // Multiple items open
 * <Accordion
 *   allowMultiple
 *   defaultOpen={['1', '2']}
 *   items={[
 *     { id: '1', title: 'General', content: <GeneralSettings />, icon: Settings },
 *     { id: '2', title: 'Security', content: <SecuritySettings />, icon: Lock },
 *   ]}
 * />
 * 
 * @example
 * // With disabled items
 * <Accordion
 *   items={[
 *     { id: '1', title: 'Available', content: <p>Content</p> },
 *     { id: '2', title: 'Coming Soon', content: <p>...</p>, disabled: true },
 *   ]}
 * />
 * 
 * @param {AccordionProps} props - Component props
 * @returns {JSX.Element} Accordion element
 */
export const Accordion: React.FC<AccordionProps> = ({
  items,
  defaultOpen,
  allowMultiple = false,
  className = '',
}) => {
  const [openItems, setOpenItems] = useState<Set<string>>(() => {
    if (!defaultOpen) return new Set();
    return new Set(Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]);
  });

  const handleToggle = (id: string) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        if (!allowMultiple) {
          newSet.clear();
        }
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div className={`overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          item={item}
          isOpen={openItems.has(item.id)}
          onToggle={() => handleToggle(item.id)}
        />
      ))}
    </div>
  );
};
