/**
 * Email Template React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as emailTemplateService from '../services/email-template.service';
import type { CreateEmailTemplateDTO, UpdateEmailTemplateDTO } from '../services/email-template.service';

export const useEmailTemplates = () =>
  useQuery({
    queryKey: ['email-templates'],
    queryFn: emailTemplateService.listEmailTemplates,
  });

export const useEmailTemplate = (id: string) =>
  useQuery({
    queryKey: ['email-templates', id],
    queryFn: () => emailTemplateService.getEmailTemplate(id),
    enabled: !!id,
  });

export const useCreateEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEmailTemplateDTO) => emailTemplateService.createEmailTemplate(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-templates'] }),
  });
};

export const useUpdateEmailTemplate = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateEmailTemplateDTO) => emailTemplateService.updateEmailTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      queryClient.invalidateQueries({ queryKey: ['email-templates', id] });
    },
  });
};

export const useDeleteEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => emailTemplateService.deleteEmailTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-templates'] }),
  });
};

export const usePreviewEmailTemplate = () =>
  useMutation({
    mutationFn: ({ id, variables }: { id: string; variables: Record<string, string> }) =>
      emailTemplateService.previewEmailTemplate(id, variables),
  });
