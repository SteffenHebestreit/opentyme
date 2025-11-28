import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/api/services/project.service';

export const useProjects = () => {
  const queryClient = useQueryClient();

  const getAllProjects = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.fetchProjects,
  });

  const getProject = (id: string) => useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectService.fetchProject(id),
    enabled: !!id,
  });

  const createProject = useMutation({
    mutationFn: projectService.createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const updateProject = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      projectService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: projectService.deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    getAllProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    projects: getAllProjects.data,
    isLoading: getAllProjects.isLoading,
  };
};