/**
 * The two workflow queries that depend on more than an id: the catalog is read
 * in the app's language (an addon's texts arrive translated), and the records
 * of a subject are only asked for where there is a subject to pick.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import apiClient from '../../src/api/services/client';
import { useWorkflowCatalog, useWorkflowSubjectOptions } from '../../src/hooks/api/useWorkflows';

jest.mock('../../src/api/services/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

let mockLanguage = 'de';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: mockLanguage } }),
}));

const get = (apiClient as unknown as { get: jest.Mock }).get;

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockLanguage = 'de';
  get.mockReset().mockImplementation(async (url: string, config?: { params?: { lang?: string } }) => ({
    data: url.endsWith('/catalog') ? { lang: config?.params?.lang } : [{ id: 'a1', label: 'Backend developer · ACME' }],
  }));
});

it('reads the catalog in the language of the app, and again when the language changes', async () => {
  const { result, rerender } = renderHook(() => useWorkflowCatalog(), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.data).toEqual({ lang: 'de' }));
  expect(get).toHaveBeenCalledWith('/workflows/catalog', { params: { lang: 'de' } });

  mockLanguage = 'en';
  rerender();
  await waitFor(() => expect(result.current.data).toEqual({ lang: 'en' }));
  expect(get).toHaveBeenCalledTimes(2);
});

it('lists the records of a subject — and asks nothing where there is nothing to pick', async () => {
  const provider = wrapper();
  renderHook(() => useWorkflowSubjectOptions('none'), { wrapper: provider });
  renderHook(() => useWorkflowSubjectOptions(undefined), { wrapper: provider });
  renderHook(() => useWorkflowSubjectOptions('client', false), { wrapper: provider });
  const { result } = renderHook(() => useWorkflowSubjectOptions('applications.application'), { wrapper: provider });

  await waitFor(() => expect(result.current.data).toEqual([{ id: 'a1', label: 'Backend developer · ACME' }]));
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/workflows/subjects/applications.application/options', undefined);
});
