/**
 * Tests for the hourly rate dialog: a new rate always needs a start date, and
 * is saved from exactly the day chosen.
 *
 * Note on the footer button keys in ProjectRatesModal: reusing the DOM node of
 * the "set new rate" button for the "save" submit button made real browsers
 * submit the empty form during the very click that opened it. jsdom does NOT
 * reproduce that (React re-renders after the click there, not during it), so
 * these tests cannot guard it — it was verified in Chromium via Playwright.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectRatesModal } from '../../src/components/business/projects/ProjectRatesModal';
import type { ProjectRatePeriod } from '../../src/api/services/project-rate.service';
import type { Project } from '../../src/api/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: 'de' },
  }),
}));

jest.mock('../../src/hooks/api/useProjectRates', () => ({
  useRateImpact: () => ({ data: undefined, isFetching: false }),
}));

const project = {
  id: 'p1',
  name: 'Website-Relaunch',
  currency: 'EUR',
  hourly_rate: 85,
} as unknown as Project;

const rates: ProjectRatePeriod[] = [
  {
    id: 'r1',
    user_id: 'u1',
    project_id: 'p1',
    hourly_rate: 85,
    valid_from: '2026-04-01',
    valid_until: null,
    is_current: true,
    note: 'Initial rate',
    created_at: '',
    updated_at: '',
  },
];

function renderModal(onSubmit = jest.fn().mockResolvedValue(null)) {
  render(
    <ProjectRatesModal
      open
      project={project}
      rates={rates}
      isLoading={false}
      onSubmit={onSubmit}
      onDelete={jest.fn().mockResolvedValue(true)}
      onAlign={jest.fn().mockResolvedValue(0)}
      onClose={jest.fn()}
      isSubmitting={false}
    />
  );
  return onSubmit;
}

describe('ProjectRatesModal', () => {
  it('opens the new-rate form', async () => {
    const onSubmit = renderModal();

    await userEvent.click(screen.getByRole('button', { name: /rates.setNew/ }));

    expect(screen.getByText('rates.form.addTitle')).toBeInTheDocument();
    expect(screen.queryByText('rates.form.rate.required')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to save a new rate without a start date', async () => {
    const onSubmit = renderModal();

    await userEvent.click(screen.getByRole('button', { name: /rates.setNew/ }));
    await userEvent.type(screen.getByLabelText('rates.form.rate.label'), '95');
    await userEvent.click(screen.getByRole('button', { name: 'rates.form.save' }));

    await waitFor(() =>
      expect(screen.getByText('rates.form.validFrom.requiredOnChange')).toBeInTheDocument()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves the rate from the chosen day', async () => {
    const onSubmit = renderModal(jest.fn().mockResolvedValue({ ...rates[0], hourly_rate: 95, valid_from: '2026-11-01' }));

    await userEvent.click(screen.getByRole('button', { name: /rates.setNew/ }));
    await userEvent.type(screen.getByLabelText('rates.form.rate.label'), '95');
    await userEvent.type(screen.getByLabelText('rates.form.validFrom.labelRequired'), '2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'rates.form.save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Entries dated from the start follow the new rate unless the user opts out.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ hourly_rate: 95, valid_from: '2026-11-01', apply_to_existing: true });
  });

  it('offers to align entries a period left behind', async () => {
    const onAlign = jest.fn().mockResolvedValue(13);
    render(
      <ProjectRatesModal
        open
        project={project}
        rates={[{ ...rates[0], deviating: [{ rate: 80, count: 13, hours: 39.25 }] }]}
        isLoading={false}
        onSubmit={jest.fn()}
        onDelete={jest.fn()}
        onAlign={onAlign}
        onClose={jest.fn()}
        isSubmitting={false}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /rates.deviation.align/ }));

    // Only the entries at 80 € — never an individually priced one swept along.
    expect(onAlign).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 80);
    await waitFor(() => expect(screen.getByText(/rates.messages.aligned/)).toBeInTheDocument());
  });
});
