/**
 * @fileoverview Expense model definitions for expense tracking.
 * 
 * Defines TypeScript interfaces and types for expense management including:
 * - Expense categories (travel, software, meals, etc.)
 * - Expense status (pending, approved, rejected, reimbursed)
 * - Expense entity with all fields
 * - Expense filter and query options
 * 
 * @module models/business/expense
 */

/**
 * Expense category enum
 * Categories aligned with German AfA (depreciation) tables
 */
export enum ExpenseCategory {
  // IT & Digital Equipment (1 year depreciation since 2021)
  COMPUTER = 'computer',
  SOFTWARE = 'software',
  PERIPHERALS = 'peripherals',
  STORAGE = 'storage',
  DISPLAY = 'display',
  PRINTER = 'printer',
  
  // Office Equipment
  OFFICE_FURNITURE = 'office_furniture',
  OFFICE_EQUIPMENT = 'office_equipment',
  OFFICE_SUPPLIES = 'office_supplies',
  
  // Vehicles
  VEHICLE_CAR = 'vehicle_car',
  VEHICLE_MOTORCYCLE = 'vehicle_motorcycle',
  
  // Professional Tools & Equipment
  CAMERA = 'camera',
  TOOLS = 'tools',
  MACHINERY = 'machinery',
  
  // Services & Operating Expenses
  INSURANCE = 'insurance',
  PROFESSIONAL_SERVICES = 'professional_services',
  MARKETING = 'marketing',
  UTILITIES = 'utilities',
  TRAVEL = 'travel',
  MEALS = 'meals',
  TRAINING = 'training',
  RENT = 'rent',
  TELECOMMUNICATIONS = 'telecommunications',
  
  // Other
  OTHER = 'other',
}

/**
 * Recurrence frequency enum
 * Defines how often recurring expenses should be generated
 */
export enum RecurrenceFrequency {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

/**
 * Expense status enum
 * Tracks approval and reimbursement status
 */
export enum ExpenseStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REIMBURSED = 'reimbursed',
}

/**
 * Main expense interface
 * 
 * @interface Expense
 * @property {string} id - Unique expense identifier (UUID)
 * @property {string} user_id - User who created the expense (Keycloak UUID)
 * @property {string | null} project_id - Optional project assignment
 * @property {ExpenseCategory | string} category - Expense category
 * @property {string} description - Expense description
 * @property {number} amount - Expense amount
 * @property {string} currency - ISO 4217 currency code (EUR, USD, etc.)
 * @property {string} expense_date - Date expense was incurred (YYYY-MM-DD)
 * @property {string | null} receipt_url - Path to receipt file in MinIO
 * @property {string | null} receipt_filename - Original receipt filename
 * @property {number | null} receipt_size - Receipt file size in bytes
 * @property {string | null} receipt_mimetype - Receipt file MIME type
 * @property {boolean} is_billable - Whether expense should be billed to client
 * @property {boolean} is_reimbursable - Whether user should be reimbursed
 * @property {ExpenseStatus} status - Approval/reimbursement status
 * @property {string[]} tags - Custom tags for categorization
 * @property {string | null} notes - Additional notes
 * @property {boolean} is_recurring - Whether this is a recurring expense
 * @property {RecurrenceFrequency | string | null} recurrence_frequency - How often to recur
 * @property {string | null} recurrence_start_date - When to start generating (YYYY-MM-DD)
 * @property {string | null} recurrence_end_date - Optional end date (YYYY-MM-DD)
 * @property {string | null} parent_expense_id - For auto-generated expenses, parent template ID
 * @property {string | null} next_occurrence - Next date to generate expense (YYYY-MM-DD)
 * @property {string} created_at - Timestamp when expense was created
 * @property {string} updated_at - Timestamp when expense was last updated
 */
export interface Expense {
  id: string;
  user_id: string;
  project_id: string | null;
  category: ExpenseCategory | string;
  description: string;
  amount: number;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  currency: string;
  expense_date: string;
  receipt_url: string | null;
  receipt_filename: string | null;
  receipt_size: number | null;
  receipt_mimetype: string | null;
  is_billable: boolean;
  is_reimbursable: boolean;
  status: ExpenseStatus;
  tags: string[];
  notes: string | null;
  is_recurring: boolean;
  recurrence_frequency: RecurrenceFrequency | string | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  parent_expense_id: string | null;
  next_occurrence: string | null;
  depreciation_type: 'none' | 'immediate' | 'partial';
  depreciation_years: number | null;
  depreciation_start_date: string | null;
  depreciation_method: 'linear' | 'degressive';
  useful_life_category: string | null;
  tax_deductible_amount: number | null;
  tax_deductible_percentage: number; // 0-100, default 100
  tax_deductibility_reasoning: string | null;
  tax_deductibility_analysis_date: string | null;
  ai_analysis_performed: boolean;
  ai_recommendation: string | null;
  ai_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Expense with project details
 * Extended expense interface with project information
 */
export interface ExpenseWithProject extends Expense {
  project_name?: string;
  client_name?: string;
}

/**
 * Expense filter options for querying
 * 
 * @interface ExpenseFilters
 * @property {string} [user_id] - Filter by user
 * @property {string} [project_id] - Filter by project
 * @property {ExpenseCategory | string} [category] - Filter by category
 * @property {ExpenseStatus} [status] - Filter by status
 * @property {boolean} [is_billable] - Filter by billable status
 * @property {boolean} [is_reimbursable] - Filter by reimbursable status
 * @property {string} [date_from] - Filter from date (YYYY-MM-DD)
 * @property {string} [date_to] - Filter to date (YYYY-MM-DD)
 * @property {string} [search] - Search in description
 * @property {number} [limit] - Maximum number of results
 * @property {number} [offset] - Offset for pagination
 * @property {string} [sort_by] - Field to sort by
 * @property {string} [sort_order] - Sort order (asc/desc)
 */
export interface ExpenseFilters {
  user_id?: string;
  project_id?: string;
  category?: ExpenseCategory | string;
  status?: ExpenseStatus;
  is_billable?: boolean;
  is_reimbursable?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Expense summary
 * Aggregated expense data for reporting
 */
export interface ExpenseSummary {
  total_expenses: number;
  total_amount: number;
  net_amount: number;
  tax_amount: number;
  billable_amount: number;
  non_billable_amount: number;
  pending_amount: number;
  approved_amount: number;
  approved_net_amount: number;
  approved_tax_amount: number;
  by_category: {
    category: string;
    count: number;
    total_amount: number;
  }[];
}

/**
 * Expense creation data
 * Data required to create a new expense
 */
export interface CreateExpenseData {
  project_id?: string | null;
  category: ExpenseCategory | string;
  description: string;
  amount: number;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  currency: string;
  expense_date: string;
  is_billable?: boolean;
  is_reimbursable?: boolean;
  tags?: string[];
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_frequency?: RecurrenceFrequency | string | null;
  recurrence_start_date?: string | null;
  recurrence_end_date?: string | null;
  // Depreciation fields
  depreciation_type?: 'none' | 'immediate' | 'partial' | null;
  depreciation_years?: number | null;
  depreciation_start_date?: string | null;
  depreciation_method?: 'linear' | 'degressive' | null;
  useful_life_category?: string | null;
}

/**
 * Expense update data
 * Data that can be updated for an existing expense
 */
export interface UpdateExpenseData {
  project_id?: string | null;
  category?: ExpenseCategory | string;
  description?: string;
  amount?: number;
  net_amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  currency?: string;
  expense_date?: string;
  is_billable?: boolean;
  is_reimbursable?: boolean;
  status?: ExpenseStatus;
  tags?: string[];
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_frequency?: RecurrenceFrequency | string | null;
  recurrence_start_date?: string | null;
  recurrence_end_date?: string | null;
  // Depreciation fields
  depreciation_type?: 'none' | 'immediate' | 'partial' | null;
  depreciation_years?: number | null;
  depreciation_start_date?: string | null;
  depreciation_method?: 'linear' | 'degressive' | null;
  useful_life_category?: string | null;
  tax_deductible_amount?: number | null;
  tax_deductible_percentage?: number | null;
  tax_deductibility_reasoning?: string | null;
}

/**
 * Receipt file information
 */
export interface ExpenseReceipt {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}
