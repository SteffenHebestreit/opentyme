import apiClient from './client';
import { ApiListParams, Project, ProjectPayload } from '../types';

/**
 * Project service object providing all project-related API operations.
 */
export const projectService = {
  fetchProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
};

/**
 * Fetches all projects from the API.
 * Returns projects with associated client details, ordered by creation date.
 * 
 * @async
 * @param {ApiListParams} [params] - Optional query parameters for filtering/pagination
 * @returns {Promise<Project[]>} Array of project objects with client details
 * @throws {Error} If the API request fails
 * 
 * @example
 * const projects = await fetchProjects();
 * const activeProjects = await fetchProjects({ status: 'active' });
 */
export async function fetchProjects(params?: ApiListParams): Promise<Project[]> {
  // Transform camelCase params to snake_case for backend API
  const apiParams: Record<string, any> = {};
  if (params) {
    if (params.search) apiParams.search = params.search;
    if (params.status) apiParams.status = params.status;
    if (params.clientId) apiParams.client_id = params.clientId;
    if (params.projectId) apiParams.project_id = params.projectId;
    if (params.startDate) apiParams.start_date = params.startDate;
    if (params.endDate) apiParams.end_date = params.endDate;
  }
  
  const { data } = await apiClient.get<Project[]>('/projects', { params: apiParams });
  return data;
}

/**
 * Fetches a single project by ID from the API.
 * Returns the project with full client details.
 * 
 * @async
 * @param {string} id - The UUID of the project to fetch
 * @returns {Promise<Project>} The project object with client details
 * @throws {Error} If the project is not found or the API request fails
 * 
 * @example
 * const project = await fetchProject('123e4567-e89b-12d3-a456-426614174000');
 * console.log(`Project: ${project.name}, Client: ${project.client?.name}`);
 */
export async function fetchProject(id: string): Promise<Project> {
  const { data } = await apiClient.get<Project>(`/projects/${id}`);
  return data;
}

/**
 * Creates a new project via the API.
 * Requires a valid client_id and automatically calculates fields like currency defaults.
 * 
 * @async
 * @param {ProjectPayload} payload - The project data to create
 * @returns {Promise<Project>} The created project object with generated ID
 * @throws {Error} If validation fails or client_id is invalid
 * 
 * @example
 * const newProject = await createProject({
 *   name: 'Website Redesign',
 *   client_id: 'client-uuid',
 *   status: 'active',
 *   hourly_rate: 150,
 *   start_date: '2024-01-01'
 * });
 */
export async function createProject(payload: ProjectPayload): Promise<Project> {
  const { data } = await apiClient.post<Project>('/projects', payload);
  return data;
}

/**
 * Updates an existing project via the API.
 * Supports partial updates - only provided fields will be updated.
 * 
 * @async
 * @param {string} id - The UUID of the project to update
 * @param {ProjectPayload} payload - The project data to update (partial)
 * @returns {Promise<Project>} The updated project object
 * @throws {Error} If the project is not found or the API request fails
 * 
 * @example
 * const updated = await updateProject('project-uuid', {
 *   status: 'completed',
 *   end_date: '2024-12-31'
 * });
 */
export async function updateProject(id: string, payload: ProjectPayload): Promise<Project> {
  const { data } = await apiClient.put<Project>(`/projects/${id}`, payload);
  return data;
}

/**
 * Deletes a project from the API.
 * Will fail if the project has associated time entries due to foreign key constraints.
 * 
 * @async
 * @param {string} id - The UUID of the project to delete
 * @returns {Promise<void>} Resolves when deletion is successful
 * @throws {Error} If the project has time entries or the API request fails
 * 
 * @example
 * try {
 *   await deleteProject('project-uuid');
 *   console.log('Project deleted successfully');
 * } catch (error) {
 *   console.error('Cannot delete project with time entries');
 * }
 */
export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}
