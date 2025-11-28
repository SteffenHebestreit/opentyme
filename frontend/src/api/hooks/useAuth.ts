import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/api/services/auth.service';

export const useAuth = () => {
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: authService.login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    },
  });

  const register = useMutation({
    mutationFn: authService.register,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    },
  });

  const logout = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });

  const getCurrentUser = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: authService.getCurrentUser,
    retry: false,
  });

  return {
    login,
    register,
    logout,
    getCurrentUser,
    user: getCurrentUser.data,
    isLoading: getCurrentUser.isLoading,
    isAuthenticated: !!getCurrentUser.data,
  };
};

export const usePasswordReset = () => {
  const forgotPassword = useMutation({
    mutationFn: authService.forgotPassword,
  });

  const resetPassword = useMutation({
    mutationFn: authService.resetPassword,
  });

  return {
    forgotPassword,
    resetPassword,
  };
};