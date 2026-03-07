/**
 * Unit tests for EmailTemplatesPage
 *
 * Mocks the React Query hooks and react-router-dom to test rendering
 * and interaction logic without a real API or router.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailTemplatesPage from '../../src/pages/email-templates/EmailTemplatesPage';
import type { EmailTemplate } from '../../src/api/services/email-template.service';

// ── Mocks ──

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockMutateAsync = jest.fn();
jest.mock('../../src/api/hooks/useEmailTemplates', () => ({
  useEmailTemplates: jest.fn(),
  useDeleteEmailTemplate: () => ({ mutateAsync: mockMutateAsync }),
}));

// i18n — return the key so assertions can match on it
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: jest.fn() },
  }),
}));

import { useEmailTemplates } from '../../src/api/hooks/useEmailTemplates';

// ── Fixtures ──

const TEMPLATE_FIXTURE: EmailTemplate = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  user_id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Invoice Template',
  subject: 'Invoice {{invoice.number}}',
  category: 'invoice',
  mjml_content: '<mjml></mjml>',
  html_content: '<html><body>Invoice</body></html>',
  variables: ['invoice.number'],
  is_default: false,
  language: 'en',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z',
};

const DEFAULT_TEMPLATE: EmailTemplate = {
  ...TEMPLATE_FIXTURE,
  id: 'aaaaaaaa-0000-0000-0000-000000000002',
  name: 'Default Welcome',
  category: 'welcome',
  is_default: true,
  language: 'de',
  updated_at: '2025-01-20T00:00:00.000Z',
};

// ── Helper ──

function renderPage() {
  return render(<EmailTemplatesPage />);
}

// ── Tests ──

describe('EmailTemplatesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a spinner while loading', () => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      const { container } = renderPage();
      // Spinner is an animate-spin div
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows an error message when the query fails', () => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
      });

      renderPage();
      // t('loadError') returns the key
      expect(screen.getByText('loadError')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows the empty-state prompt when no templates exist', () => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderPage();
      expect(screen.getByText('noTemplates')).toBeInTheDocument();
      // Both "New Template" buttons should be visible (header + empty state)
      expect(screen.getAllByText(/newTemplate|createFirst/).length).toBeGreaterThanOrEqual(1);
    });

    it('navigates to /email-templates/new when "createFirst" is clicked', async () => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderPage();
      const btn = screen.getByText('createFirst');
      await userEvent.click(btn);
      expect(mockNavigate).toHaveBeenCalledWith('/email-templates/new');
    });
  });

  describe('list rendering', () => {
    beforeEach(() => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: [TEMPLATE_FIXTURE, DEFAULT_TEMPLATE],
        isLoading: false,
        error: null,
      });
    });

    it('renders all templates in the table', () => {
      renderPage();
      expect(screen.getByText('Invoice Template')).toBeInTheDocument();
      expect(screen.getByText('Default Welcome')).toBeInTheDocument();
    });

    it('shows the category badge for each template', () => {
      renderPage();
      expect(screen.getByText('invoice')).toBeInTheDocument();
      expect(screen.getByText('welcome')).toBeInTheDocument();
    });

    it('shows the language in uppercase', () => {
      renderPage();
      expect(screen.getByText('EN')).toBeInTheDocument();
      expect(screen.getByText('DE')).toBeInTheDocument();
    });

    it('shows a checkmark for the default template', () => {
      renderPage();
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('navigates to editor when Edit is clicked', async () => {
      renderPage();
      const editBtns = screen.getAllByText('action.edit');
      await userEvent.click(editBtns[0]);
      expect(mockNavigate).toHaveBeenCalledWith(
        `/email-templates/${TEMPLATE_FIXTURE.id}`
      );
    });
  });

  describe('delete flow', () => {
    beforeEach(() => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: [TEMPLATE_FIXTURE],
        isLoading: false,
        error: null,
      });
    });

    it('shows confirm / cancel buttons after clicking delete', async () => {
      renderPage();
      await userEvent.click(screen.getByText('action.delete'));
      expect(screen.getByText('action.confirmDelete')).toBeInTheDocument();
      expect(screen.getByText('action.cancel')).toBeInTheDocument();
    });

    it('calls mutateAsync with the template id when confirmed', async () => {
      mockMutateAsync.mockResolvedValue(undefined);
      renderPage();

      await userEvent.click(screen.getByText('action.delete'));
      await userEvent.click(screen.getByText('action.confirmDelete'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(TEMPLATE_FIXTURE.id);
      });
    });

    it('hides confirm buttons when cancel is clicked', async () => {
      renderPage();
      await userEvent.click(screen.getByText('action.delete'));
      await userEvent.click(screen.getByText('action.cancel'));

      expect(screen.queryByText('action.confirmDelete')).not.toBeInTheDocument();
    });
  });

  describe('header navigation', () => {
    it('navigates to /email-templates/new from the header button', async () => {
      (useEmailTemplates as jest.Mock).mockReturnValue({
        data: [TEMPLATE_FIXTURE],
        isLoading: false,
        error: null,
      });

      renderPage();
      // The header "+ newTemplate" button is the first one
      const newBtn = screen.getAllByText(/newTemplate/)[0];
      await userEvent.click(newBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/email-templates/new');
    });
  });
});
