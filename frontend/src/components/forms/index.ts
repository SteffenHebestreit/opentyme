/**
 * Form Components Module
 * 
 * Reusable form input components with validation and error handling.
 * All components support ref forwarding, error states, and accessibility.
 * Features minimal, modern styling with floating labels.
 * 
 * @module components/forms
 * 
 * @example
 * // Import form components
 * import { Input, TextInput, EmailInput, PasswordInput, Select, Textarea } from '@/components/forms';
 * 
 * @example
 * // Use in a form
 * <form>
 *   <TextInput label="Name" required />
 *   <EmailInput label="Email" error={emailError} />
 *   <PasswordInput label="Password" helperText="Min 8 characters" />
 *   <Select label="Category">
 *     <option value="">Choose...</option>
 *   </Select>
 *   <Textarea label="Description" rows={4} />
 * </form>
 */

// Form input components
export { Input, TextInput, EmailInput, PasswordInput } from './Input';
export { Select } from './Select';
export { CustomSelect } from './CustomSelect';
export { Textarea } from './Textarea';

// Form container and grouping
export { Form } from './Form';
export { FormGroup } from './FormGroup';

// Checkbox, Radio, and Switch
export { Checkbox, Radio, Switch } from './CheckboxRadioSwitch';

// Specialized inputs
export { NumberInput, DateInput } from './NumberDateInput';