import React from 'react';

/**
 * Props for the Card container component.
 * 
 * @interface CardProps
 * @property {React.ReactNode} children - Content to render inside the card
 * @property {string} [className] - Additional CSS classes for customization
 */
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card container component for grouping related content.
 * 
 * Provides a white background with shadow and rounded corners.
 * Use with CardHeader, CardBody, and CardFooter subcomponents for structured layouts.
 * 
 * @component
 * @example
 * // Basic card
 * <Card>
 *   <CardHeader title="User Profile" />
 *   <CardBody>Profile content here</CardBody>
 * </Card>
 * 
 * @example
 * // Card with custom styling
 * <Card className="max-w-md">
 *   <CardBody>Narrow card content</CardBody>
 * </Card>
 * 
 * @param {CardProps} props - Component props
 * @returns {JSX.Element} Card container element
 */
export const Card: React.FC<CardProps> = ({ children, className }) => (
  <div
    className={`bg-gray-800/50 backdrop-blur-lg border border-purple-500/20 rounded-2xl shadow-xl overflow-hidden ${className}`}
  >
    {children}
  </div>
);

/**
 * Props for the CardHeader component.
 * 
 * @interface CardHeaderProps
 * @property {string} [title] - Main header title text
 * @property {string} [subtitle] - Secondary subtitle text
 * @property {React.ReactNode} [action] - Action buttons or links (e.g., "Edit", "Delete")
 * @property {React.ReactNode} [children] - Alternative to action prop for custom content
 * @property {string} [className] - Additional CSS classes
 */
interface CardHeaderProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode; // For buttons or links in the header
  children?: React.ReactNode;
  className?: string;
}

/**
 * CardHeader component for card title and actions.
 * 
 * Displays title/subtitle on the left and action buttons on the right.
 * Includes bottom border to separate from card body.
 * 
 * @component
 * @example
 * // Header with title and subtitle
 * <CardHeader 
 *   title="Project Details" 
 *   subtitle="Last updated 2 hours ago"
 * />
 * 
 * @example
 * // Header with action button
 * <CardHeader 
 *   title="Invoice #001"
 *   action={<Button size="sm">Edit</Button>}
 * />
 * 
 * @example
 * // Header with custom children
 * <CardHeader>
 *   <CustomHeaderContent />
 * </CardHeader>
 * 
 * @param {CardHeaderProps} props - Component props
 * @returns {JSX.Element} Card header element
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
}) => (
  <div
    className={`px-6 py-4 border-b border-purple-500/20 flex justify-between items-center ${className}`}
  >
    {(title || subtitle) && (
      <div>
        {title && (
          <h3 className="text-lg leading-6 font-medium text-gray-100">
            {title}
          </h3>
        )}
        {subtitle && (
          <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
        )}
      </div>
    )}
    {(action || children) && (
      <div>{action || children}</div>
    )}
  </div>
);

/**
 * Props for the CardBody component.
 * 
 * @interface CardBodyProps
 * @property {React.ReactNode} children - Main card content
 * @property {string} [className] - Additional CSS classes
 */
interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * CardBody component for main card content.
 * 
 * Provides consistent padding for card content area.
 * 
 * @component
 * @example
 * <CardBody>
 *   <p>This is the main content</p>
 * </CardBody>
 * 
 * @example
 * // With custom styling
 * <CardBody className="space-y-4">
 *   <p>Paragraph 1</p>
 *   <p>Paragraph 2</p>
 * </CardBody>
 * 
 * @param {CardBodyProps} props - Component props
 * @returns {JSX.Element} Card body element
 */
export const CardBody: React.FC<CardBodyProps> = ({ children, className }) => (
  <div className={`px-6 py-4 ${className}`}>{children}</div>
);

/**
 * Props for the CardFooter component.
 * 
 * @interface CardFooterProps
 * @property {React.ReactNode} children - Footer content (typically buttons or links)
 * @property {string} [className] - Additional CSS classes
 */
interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * CardFooter component for card action area.
 * 
 * Provides light gray background with top border to separate from body.
 * Typically used for action buttons or metadata.
 * 
 * @component
 * @example
 * <CardFooter>
 *   <Button>Save</Button>
 *   <Button variant="secondary">Cancel</Button>
 * </CardFooter>
 * 
 * @example
 * // With custom styling
 * <CardFooter className="flex justify-end space-x-2">
 *   <Button>Submit</Button>
 * </CardFooter>
 * 
 * @param {CardFooterProps} props - Component props
 * @returns {JSX.Element} Card footer element
 */
export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className,
}) => (
  <div
    className={`px-6 py-4 border-t border-gray-200 bg-gray-50 ${className}`}
  >
    {children}
  </div>
);
