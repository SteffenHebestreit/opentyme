/**
 * Common UI Components Module
 * 
 * Barrel export file for reusable UI components used throughout the application.
 * All components support dark mode and follow consistent styling patterns.
 * 
 * @module components/common
 * 
 * @example
 * // Import multiple components
 * import { Button, Card, CardBody, Alert } from '@/components/common';
 * 
 * @example
 * // Use components together
 * <Card>
 *   <CardBody>
 *     <Alert type="info" message="Welcome!" />
 *     <Button>Get Started</Button>
 *   </CardBody>
 * </Card>
 */

// Alert components for notifications and messages
export { Alert, ErrorAlert, SuccessAlert } from './Alert';

// Button component with variants and loading states
export { Button } from './Button';

// Card components for structured content containers
export { Card, CardHeader, CardBody, CardFooter } from './Card';

// Header component with navigation and theme toggle
export { default as Header } from './Header';

// Layout component for consistent page structure
export { default as Layout } from './Layout';

// Skeleton components for loading states
export { SkeletonItem, SkeletonText, SkeletonCard, SkeletonCardList } from './Skeleton';

// Loading spinner component
export { LoadingSpinner } from './LoadingSpinner';
export type { SpinnerSize } from './LoadingSpinner';

// Badge component for status and labels
export { Badge } from './Badge';
export type { BadgeVariant, BadgeSize } from './Badge';

// Stat card component for metrics display
export { StatCard } from './StatCard';
export type { StatCardVariant } from './StatCard';

// Tabs navigation component
export { Tabs, TabPanel } from './Tabs';
export type { Tab } from './Tabs';

// Page header component
export { PageHeader } from './PageHeader';

// Empty state component
export { EmptyState } from './EmptyState';

// Chart card component
export { ChartCard } from './ChartCard';

// Progress components
export { ProgressBar, CircularProgress } from './Progress';

// Modal components
export { Modal, ConfirmModal } from './Modal';

// Tooltip component
export { Tooltip } from './Tooltip';

// Dropdown component
export { Dropdown } from './Dropdown';
export type { DropdownItem } from './Dropdown';

// Breadcrumb navigation
export { Breadcrumb } from './Breadcrumb';
export type { BreadcrumbItem } from './Breadcrumb';

// Accordion component
export { Accordion } from './Accordion';
export type { AccordionItemData } from './Accordion';

// Table component
export { Table } from './Table';
export type { Column, TableProps, PaginationProps } from './Table';