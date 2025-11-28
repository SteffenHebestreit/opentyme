import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  updateProject,
} from '../../api/services/project.service';
import { ApiListParams, Project, ProjectPayload } from '../../api/types';
import { queryKeys } from './queryKeys';

/**
 * React Query hook for fetching all projects.
 * Automatically handles caching, refetching, and loading states.
 * Returns projects with associated client details.
 * 
 * @param {ApiListParams} [params] - Optional query parameters for filtering/pagination
 * @returns {UseQueryResult<Project[]>} React Query result object with projects data and query state
 * 
 * @example
 * const { data: projects, isLoading, error } = useProjects();
 * const { data: activeProjects } = useProjects({ status: 'active' });
 */
export function useProjects(params?: ApiListParams) {
  return useQuery<Project[]>({
    queryKey: queryKeys.projects.list(params),
    queryFn: () => fetchProjects(params),
  });
}

/**
 * React Query hook for fetching a single project by ID.
 * Query is disabled if no ID is provided.
 * Returns project with full client details.
 * 
 * @param {string | undefined} id - The UUID of the project to fetch
 * @returns {UseQueryResult<Project>} React Query result object with project data and query state
 * 
 * @example
 * const { data: project, isLoading } = useProject(projectId);
 * if (project) {
 *   console.log(`${project.name} - ${project.client?.name}`);
 * }
 */
export function useProject(id: string | undefined) {
  return useQuery<Project>({
    queryKey: queryKeys.projects.detail(id ?? 'pending'),
    queryFn: () => fetchProject(id as string),
    enabled: Boolean(id),
  });
}

/**
 * React Query mutation hook for creating a new project.
 * Automatically invalidates the projects list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation object with mutate function and mutation state
 * 
 * @example
 * const { mutate: createProjectMutation, isPending } = useCreateProject();
 * createProjectMutation({
 *   name: 'Website Redesign',
 *   client_id: 'client-uuid',
 *   status: 'active',
 *   hourly_rate: 150
 * }, {
 *   onSuccess: (project) => {
 *     console.log('Created:', project.id);
 *   }
 * });
 */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectPayload) => createProject(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

/**
 * React Query mutation hook for updating an existing project.
 * Automatically invalidates both the projects list and the specific project detail cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation object with mutate function and mutation state
 * 
 * @example
 * const { mutate: updateProjectMutation } = useUpdateProject();
 * updateProjectMutation({
 *   id: projectId,
 *   payload: { status: 'completed', end_date: '2024-12-31' }
 * }, {
 *   onSuccess: () => {
 *     console.log('Project updated');
 *   }
 * });
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectPayload }) => updateProject(id, payload),
    onSuccess: (_project: Project, variables: { id: string; payload: ProjectPayload }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) });
    },
  });
}

/**
 * React Query mutation hook for deleting a project.
 * Automatically invalidates the projects list cache on success.
 * Will fail if the project has associated time entries.
 * 
 * @returns {UseMutationResult} React Query mutation object with mutate function and mutation state
 * 
 * @example
 * const { mutate: deleteProjectMutation, isPending } = useDeleteProject();
 * deleteProjectMutation(projectId, {
 *   onSuccess: () => {
 *     console.log('Project deleted');
 *   },
 *   onError: (error) => {
 *     console.error('Cannot delete project with time entries');
 *   }
 * });
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
