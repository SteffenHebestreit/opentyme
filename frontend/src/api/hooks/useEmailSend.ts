import { useMutation } from '@tanstack/react-query';
import { sendEmail, emailReport, SendEmailParams, EmailReportParams } from '../services/email-send.service';

export const useSendEmail = () =>
  useMutation({ mutationFn: (params: SendEmailParams) => sendEmail(params) });

export const useEmailReport = () =>
  useMutation({ mutationFn: (params: EmailReportParams) => emailReport(params) });
