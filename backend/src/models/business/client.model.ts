import { BaseUser } from '../auth/user.model';

/**
 * Valid status values for a client.
 * @typedef {'active' | 'inactive'} ClientStatus
 */
export type ClientStatus = 'active' | 'inactive'; // Can be expanded

/**
 * Data transfer object for creating a new client.
 * Used when receiving client creation requests from API endpoints.
 * 
 * @interface CreateClientDto
 * @property {string} user_id - The UUID of the authenticated user who owns this client (required)
 * @property {string} name - The client's name or company name (required)
 * @property {string} [contact_person] - The primary contact person name (optional)
 * @property {string} [email] - The client's email address (optional)
 * @property {string} [phone] - The client's phone number (optional)
 * @property {string} [address] - The client's physical address (optional)
 * @property {string} [city] - The client's city (optional)
 * @property {string} [state] - The client's state/province (optional)
 * @property {string} [postal_code] - The client's postal/ZIP code (optional)
 * @property {string} [country] - The client's country (optional)
 * @property {string} [tax_id] - The client's tax ID/VAT number (optional)
 * @property {boolean} [use_separate_billing_address] - If true, use separate billing address fields (optional)
 * @property {string} [billing_contact_person] - Billing contact person name (optional)
 * @property {string} [billing_email] - Billing email address (optional)
 * @property {string} [billing_phone] - Billing phone number (optional)
 * @property {string} [billing_address] - Billing address (optional)
 * @property {string} [billing_city] - Billing city (optional)
 * @property {string} [billing_state] - Billing state/province (optional)
 * @property {string} [billing_postal_code] - Billing postal/ZIP code (optional)
 * @property {string} [billing_country] - Billing country (optional)
 * @property {string} [notes] - Additional notes about the client (optional)
 * @property {ClientStatus} [status] - The client's status (defaults to 'active')
 * 
 * @example
 * const newClient: CreateClientDto = {
 *   user_id: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'Acme Corporation',
 *   contact_person: 'John Doe',
 *   email: 'contact@acme.com',
 *   use_separate_billing_address: true,
 *   billing_contact_person: 'Jane Smith',
 *   billing_email: 'billing@acme.com',
 *   status: 'active'
 * };
 */
export interface CreateClientDto {
  user_id: string; // Required - the authenticated user who owns this client
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_id?: string | null;
  use_separate_billing_address?: boolean;
  billing_contact_person?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  notes?: string | null;
  status?: ClientStatus; 
}

/**
 * Data transfer object for updating an existing client.
 * All fields are optional to support partial updates.
 * 
 * @interface UpdateClientDto
 * @extends {Partial<CreateClientDto>}
 * 
 * @example
 * const updateData: UpdateClientDto = {
 *   status: 'inactive',
 *   notes: 'Client requested temporary suspension'
 * };
 */
export interface UpdateClientDto extends Partial<CreateClientDto> {}

/**
 * Base client structure representing a client entity from the database.
 * Contains all fields returned by the database including timestamps.
 * 
 * @interface BaseClient
 * @property {string} id - The unique identifier (UUID) for the client
 * @property {string} user_id - The UUID of the user who owns this client
 * @property {string} name - The client's name or company name
 * @property {string | null} contact_person - The primary contact person name
 * @property {string | null} email - The client's email address
 * @property {string | null} phone - The client's phone number
 * @property {string | null} address - The client's physical address
 * @property {string | null} city - The client's city
 * @property {string | null} state - The client's state/province
 * @property {string | null} postal_code - The client's postal/ZIP code
 * @property {string | null} country - The client's country
 * @property {string | null} tax_id - The client's tax ID/VAT number
 * @property {boolean} use_separate_billing_address - If true, use separate billing address
 * @property {string | null} billing_contact_person - Billing contact person name
 * @property {string | null} billing_email - Billing email address
 * @property {string | null} billing_phone - Billing phone number
 * @property {string | null} billing_address - Billing address
 * @property {string | null} billing_city - Billing city
 * @property {string | null} billing_state - Billing state/province
 * @property {string | null} billing_postal_code - Billing postal/ZIP code
 * @property {string | null} billing_country - Billing country
 * @property {string | null} notes - Additional notes about the client
 * @property {ClientStatus} status - The client's current status ('active' or 'inactive')
 * @property {Date} created_at - Timestamp when the client was created
 * @property {Date} updated_at - Timestamp when the client was last updated
 */
export interface BaseClient {
  id: string;
  user_id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  tax_id: string | null;
  use_separate_billing_address: boolean;
  billing_contact_person: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  notes: string | null;
  status: ClientStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Full client structure returned by API endpoints.
 * Currently identical to BaseClient, but can be extended with additional properties.
 * 
 * @interface Client
 * @extends {BaseClient}
 */
export interface Client extends BaseClient {}

/**
 * Extended client structure that includes related project information.
 * Used when fetching clients with aggregated project data.
 * 
 * @interface ClientWithProjects
 * @extends {Client}
 * @property {number} [projects_count] - The number of projects associated with this client
 * 
 * @example
 * const client: ClientWithProjects = {
 *   id: 'uuid',
 *   name: 'Acme Corp',
 *   projects_count: 5,
 *   // ... other client fields
 * };
 */
export interface ClientWithProjects extends Client {
  projects_count?: number; // If we want to include project count from DB directly
}
