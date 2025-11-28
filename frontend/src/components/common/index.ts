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