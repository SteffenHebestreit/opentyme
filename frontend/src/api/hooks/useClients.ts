import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientService } from '@/api/services/client.service';

export const useClients = () => {
  const queryClient = useQueryClient();

  const getAllClients = useQuery({
    queryKey: ['clients'],
    queryFn: clientService.fetchClients,
  });

  const getClient = (id: string) => useQuery({
    queryKey: ['clients', id],
    queryFn: () => clientService.fetchClient(id),
    enabled: !!id,
  });

  const createClient = useMutation({
    mutationFn: clientService.createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  const updateClient = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      clientService.updateClient(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  const deleteClient = useMutation({
    mutationFn: clientService.deleteClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  return {
    getAllClients,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    clients: getAllClients.data,
    isLoading: getAllClients.isLoading,
  };
};