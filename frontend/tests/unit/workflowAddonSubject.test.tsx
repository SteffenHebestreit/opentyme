/**
 * A subject an addon registered — here a job application, with something that
 * happens to it and an action — through the workflow UI: it is named the way
 * the catalog names it, a flow can be created and started for it, and the
 * editor offers its event and its records. The app's real German texts are
 * used, so the fallbacks for what has no translation of its own are the ones
 * a user reads.
 */
import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { MemoryRouter } from 'react-router-dom';
import de from '../../src/i18n/locales/de/workflows.json';
import { CreateWorkflowDialog } from '../../src/components/workflows/CreateWorkflowDialog';
import { StartRunDialog } from '../../src/components/workflows/StartRunDialog';
import { Palette } from '../../src/components/workflows/editor/Palette';
import { PropertiesPanel } from '../../src/components/workflows/editor/PropertiesPanel';
import { toFlowNodes } from '../../src/components/workflows/graph/flowGraph';
import { useWorkflowLabels } from '../../src/components/workflows/useWorkflowLabels';
import type { StartNodeData, WaitNodeData, WorkflowCatalog, WorkflowNode } from '../../src/api/types/workflow.types';
import { ADDON_SUBJECT, addonCatalog, definition } from '../mocks/workflowFixtures';

const mockI18n = i18next.createInstance();
jest.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown> | string) =>
      mockI18n.t(key, { ns: ns ?? 'workflows', ...(typeof options === 'string' ? { defaultValue: options } : options) }),
    i18n: { language: 'de' },
  }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../src/hooks/api/useClients', () => ({ useClients: () => ({ data: [{ id: 'c1', name: 'ACME GmbH' }] }) }));
jest.mock('../../src/hooks/api/useProjects', () => ({ useProjects: () => ({ data: [{ id: 'p1', name: 'Website' }] }) }));
jest.mock('../../src/hooks/api/useInvoices', () => ({
  useInvoices: () => ({ data: [{ id: 'inv-1', invoice_number: '2026-10-003', client_name: 'ACME GmbH' }] }),
}));
jest.mock('../../src/api/hooks/useEmailTemplates', () => ({ useEmailTemplates: () => ({ data: [] }) }));

const mockCatalog = jest.fn();
const mockSubjectOptions = jest.fn();
const mockStart = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../src/hooks/api/useWorkflows', () => ({
  useWorkflowCatalog: () => ({ data: mockCatalog() }),
  useWorkflowSubjectOptions: (type: string, enabled?: boolean) => mockSubjectOptions(type, enabled),
  useStartWorkflowRun: () => ({ mutateAsync: mockStart, isPending: false }),
  useCreateWorkflow: () => ({ mutateAsync: mockCreate, isPending: false }),
  useWorkflowTemplates: () => ({ data: [] }),
}));

const APPLICATIONS = [
  { id: 'app-1', label: 'Werkstudent Backend · ACME' },
  { id: 'app-2', label: 'Senior Developer · Globex' },
];

beforeAll(async () => {
  await mockI18n.init({
    lng: 'de',
    fallbackLng: 'de',
    ns: ['workflows'],
    defaultNS: 'workflows',
    resources: { de: { workflows: de } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog.mockReturnValue(addonCatalog('de'));
  // Only asked where the app has no list of its own (clients, projects)
  mockSubjectOptions.mockImplementation((type: string, enabled?: boolean) => ({
    data: enabled !== false && type === ADDON_SUBJECT ? APPLICATIONS : undefined,
  }));
  mockStart.mockResolvedValue({ id: 'run-7' });
});

const optionTexts = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent);

describe('names', () => {
  const labels = (catalog: WorkflowCatalog | undefined = addonCatalog('de')) => renderHook(() => useWorkflowLabels(catalog)).result.current;

  it('calls the subject what the catalog calls it, and OpenTyme’s own by their translation', () => {
    expect(labels().subjectTypeLabel(ADDON_SUBJECT)).toBe('Bewerbung');
    expect(labels().subjectTypeLabel('client')).toBe('Kunde');
    expect(labels().subjectTypeLabel('none')).toBe('Ohne Gegenstand');
    // an addon that ships no German keeps its English title; a kind nobody registered keeps its key
    expect(labels(addonCatalog('en')).subjectTypeLabel(ADDON_SUBJECT)).toBe('Application');
    expect(labels().subjectTypeLabel('crm.lead')).toBe('crm.lead');
    expect(labels(undefined).subjectTypeLabel('invoice')).toBe('Rechnung');
  });

  it('names the addon’s event, action and run data from the catalog', () => {
    const names = labels();
    expect(names.eventTitle('applications.answered')).toBe('Antwort erhalten');
    expect(names.eventDescription('applications.answered')).toBe('Auf die Bewerbung kam eine Antwort.');
    expect(names.actionTitle('applications.setStatus')).toBe('Status der Bewerbung setzen');
    expect(names.fieldLabel('applications.setStatus', { key: 'applicationId', label: 'Bewerbung' })).toBe('Bewerbung');
    expect(names.eventTitle('invoice.paid')).toBe('Rechnung bezahlt');
  });

  it('says what a wait could not find, and what the server does not know', () => {
    const names = labels();
    expect(
      names.stepErrorText({ error: 'There is no application in this run to wait for.', error_code: 'WAIT_NO_SUBJECT', error_params: { subject: ADDON_SUBJECT } })
    ).toBe('In diesem Lauf fehlt, worauf der Schritt wartet (Bewerbung).');
    // a step from before subjects could be anything was waiting for an invoice
    expect(names.stepErrorText({ error: 'There is no invoice in this run to wait for.', error_code: 'WAIT_NO_SUBJECT', error_params: {} })).toBe(
      'In diesem Lauf fehlt, worauf der Schritt wartet (Rechnung).'
    );
    expect(
      names.stepErrorText({ error: 'The event is not available.', error_code: 'WAIT_UNKNOWN_EVENT', error_params: { event: 'applications.answered' } })
    ).toBe('Das Ereignis „applications.answered“ kennt der Server gerade nicht (ist das Addon aktiv?).');
    expect(names.issueText({ code: 'UNKNOWN_SUBJECT', message: 'Flows cannot be about "applications.application" at the moment.' })).toBe(
      'Wofür dieser Ablauf läuft, kennt der Server gerade nicht (ist das Addon aktiv?).'
    );
    expect(names.issueText({ code: 'EVENT_SUBJECT', message: 'This event happens to another kind of record.' })).not.toMatch(/Rechnung/);
  });
});

describe('a new flow', () => {
  const renderDialog = () => {
    const onCreated = jest.fn();
    render(<CreateWorkflowDialog open onClose={jest.fn()} onCreated={onCreated} />);
    return { onCreated, user: userEvent.setup() };
  };

  it('can be about whatever the server lists, or about nothing', async () => {
    mockCreate.mockResolvedValue(definition({ id: 'def-9', subject_type: ADDON_SUBJECT }));
    const { user, onCreated } = renderDialog();
    const subject = screen.getByLabelText('Ein Lauf gilt für');
    expect(optionTexts(subject)).toEqual(['Kunde', 'Projekt', 'Rechnung', 'Bewerbung', 'Ohne Gegenstand']);

    await user.type(screen.getByLabelText(/^Name/), 'Bewerbungsprozess');
    await user.selectOptions(subject, ADDON_SUBJECT);
    await user.click(screen.getByRole('button', { name: 'Ablauf anlegen' }));
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Bewerbungsprozess', subject_type: ADDON_SUBJECT });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'def-9' }));
  });

  it('offers OpenTyme’s own kinds while the catalog is loading', () => {
    mockCatalog.mockReturnValue(undefined);
    renderDialog();
    expect(optionTexts(screen.getByLabelText('Ein Lauf gilt für'))).toEqual(['Kunde', 'Projekt', 'Rechnung', 'Ohne Gegenstand']);
  });
});

describe('starting a run', () => {
  it('asks which application — listed by the workflow API — and for no period', async () => {
    const onClose = jest.fn();
    render(
      <MemoryRouter>
        <StartRunDialog definition={definition({ name: 'Bewerbungsprozess', subject_type: ADDON_SUBJECT })} open onClose={onClose} />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    const subject = screen.getByLabelText(/^Bewerbung/);
    expect(optionTexts(subject)).toEqual(['Auswählen …', 'Werkstudent Backend · ACME', 'Senior Developer · Globex']);
    expect(screen.queryByLabelText('Zeitraum von')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lauf starten' }));
    expect(screen.getByText('Wählen Sie, wofür der Lauf gilt (Bewerbung).')).toBeInTheDocument();
    expect(mockStart).not.toHaveBeenCalled();

    await user.selectOptions(subject, 'app-2');
    await user.click(screen.getByRole('button', { name: 'Lauf starten' }));
    expect(mockStart).toHaveBeenCalledWith({ definitionId: 'def-1', request: { test: false, subject_id: 'app-2' } });
  });
});

describe('the editor', () => {
  const start = (data: StartNodeData): WorkflowNode => ({ id: 's', type: 'start', position: { x: 0, y: 0 }, data });
  const wait = (data: WaitNodeData): WorkflowNode => ({ id: 'w', type: 'wait', position: { x: 0, y: 0 }, data });
  const monthly: StartNodeData = { trigger: 'schedule', schedule: { dayOfMonth: 'last', period: 'current_month', subjectIds: [] } };

  function renderPanel(subjectType: string, node: WorkflowNode, catalog: WorkflowCatalog = addonCatalog('de')) {
    const nodes = toFlowNodes({ nodes: [node], edges: [] });
    const onNodeConfig = jest.fn();
    render(
      <PropertiesPanel
        subjectType={subjectType}
        name="Bewerbungsprozess"
        description=""
        onMetaChange={jest.fn()}
        nodes={nodes}
        edges={[]}
        selectedNode={nodes[0]}
        catalog={catalog}
        issues={[]}
        onNodeConfig={onNodeConfig}
        onEdgeData={jest.fn()}
        onMoveEdge={jest.fn()}
        onSelectEdge={jest.fn()}
        onDeleteSelected={jest.fn()}
      />
    );
    return { onNodeConfig, user: userEvent.setup() };
  }

  it('says what the flow is about', () => {
    const nodes = toFlowNodes({ nodes: [start({ trigger: 'manual' })], edges: [] });
    render(
      <PropertiesPanel
        subjectType={ADDON_SUBJECT}
        name="Bewerbungsprozess"
        description=""
        onMetaChange={jest.fn()}
        nodes={nodes}
        edges={[]}
        catalog={addonCatalog('de')}
        issues={[]}
        onNodeConfig={jest.fn()}
        onEdgeData={jest.fn()}
        onMoveEdge={jest.fn()}
        onSelectEdge={jest.fn()}
        onDeleteSelected={jest.fn()}
      />
    );
    expect(screen.getByText('Läuft für: Bewerbung')).toBeInTheDocument();
  });

  it('lets a flow about an application start with what happens to one — not on a schedule', async () => {
    const { user, onNodeConfig } = renderPanel(ADDON_SUBJECT, start({ trigger: 'manual' }));
    const trigger = screen.getByLabelText('Startet');
    expect(within(trigger).getByRole('option', { name: 'Monatlich von selbst' })).toBeDisabled();
    expect(within(trigger).getByRole('option', { name: 'Wenn etwas passiert' })).toBeEnabled();
    await user.selectOptions(trigger, 'event');
    expect(onNodeConfig).toHaveBeenCalledWith('s', { label: undefined, trigger: 'event', event: { type: 'applications.answered' } });
  });

  it('offers the events of the flow’s own subject, and the client filter only where there is a client', () => {
    const application = renderPanel(ADDON_SUBJECT, start({ trigger: 'event', event: { type: 'applications.answered' } }));
    expect(optionTexts(screen.getByLabelText('Ereignis'))).toEqual(['Antwort erhalten']);
    expect(screen.getByText('Auf die Bewerbung kam eine Antwort.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Nur bei diesen Kunden (keine Auswahl = alle)' })).not.toBeInTheDocument();
    expect(application.onNodeConfig).not.toHaveBeenCalled();
  });

  it('keeps the client filter for a flow about invoices', async () => {
    const { user, onNodeConfig } = renderPanel('invoice', start({ trigger: 'event', event: { type: 'invoice.paid' } }));
    expect(optionTexts(screen.getByLabelText('Ereignis'))).toEqual(['Rechnung bezahlt', 'Rechnung korrigiert']);
    const clients = screen.getByRole('group', { name: 'Nur bei diesen Kunden (keine Auswahl = alle)' });
    await user.click(within(clients).getByRole('checkbox', { name: 'ACME GmbH' }));
    expect(onNodeConfig).toHaveBeenCalledWith('s', { trigger: 'event', event: { type: 'invoice.paid', clientIds: ['c1'] } });
  });

  it('schedules a flow about nothing without asking for whom', () => {
    renderPanel('none', start(monthly));
    expect(within(screen.getByLabelText('Startet')).getByRole('option', { name: 'Monatlich von selbst' })).toBeEnabled();
    expect(screen.getByLabelText('Tag im Monat')).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('schedules a flow for the records of an addon’s subject where the server allows it', async () => {
    const base = addonCatalog('de');
    const schedulable = { ...base, subjects: base.subjects.map((subject) => (subject.key === ADDON_SUBJECT ? { ...subject, schedulable: true } : subject)) };
    const { user, onNodeConfig } = renderPanel(ADDON_SUBJECT, start(monthly), schedulable);
    const records = screen.getByRole('group', { name: 'Für diese Einträge starten (Bewerbung)' });
    await user.click(within(records).getByRole('checkbox', { name: 'Senior Developer · Globex' }));
    expect(onNodeConfig).toHaveBeenCalledWith('s', { trigger: 'schedule', schedule: { dayOfMonth: 'last', period: 'current_month', subjectIds: ['app-2'] } });
  });

  it('lists a client flow’s clients from the app’s own list, not from the workflow API', () => {
    renderPanel('client', start(monthly));
    expect(within(screen.getByRole('group', { name: 'Für diese Kunden starten' })).getByRole('checkbox', { name: 'ACME GmbH' })).toBeInTheDocument();
    expect(mockSubjectOptions).toHaveBeenCalledWith('client', false);
  });

  it('waits for what happens to the run’s own application without asking which', async () => {
    const { user, onNodeConfig } = renderPanel(ADDON_SUBJECT, wait({ mode: 'duration', days: 1 }));
    // offered first: an event of what the flow is about
    await user.selectOptions(screen.getByLabelText('Wartet'), 'event');
    expect(onNodeConfig).toHaveBeenCalledWith('w', { label: undefined, mode: 'event', event: 'applications.answered' });
  });

  it('names the record a wait is about after the event’s subject — optional when it is the run’s own', () => {
    renderPanel(ADDON_SUBJECT, wait({ mode: 'event', event: 'applications.answered' }));
    expect(optionTexts(screen.getByLabelText('Ereignis'))).toEqual(['Rechnung bezahlt', 'Rechnung korrigiert', 'Antwort erhalten']);
    const subject = screen.getByLabelText('Bewerbung (leer = Gegenstand dieses Laufs)');
    expect(optionTexts(subject)).toEqual(['Auswählen …', 'Werkstudent Backend · ACME', 'Senior Developer · Globex']);
  });

  it('asks which application a flow about something else waits for', async () => {
    const { user, onNodeConfig } = renderPanel('client', wait({ mode: 'event', event: 'applications.answered' }));
    const subject = screen.getByLabelText(/^Bewerbung\*?$/);
    expect(subject).not.toHaveAccessibleName(/leer/);
    await user.selectOptions(subject, 'app-1');
    expect(onNodeConfig).toHaveBeenCalledWith('w', { mode: 'event', event: 'applications.answered', subject: 'app-1' });
  });

  it('still picks an invoice for an invoice event, and drops it when the event is about another kind of record', async () => {
    const { user, onNodeConfig } = renderPanel('client', wait({ mode: 'event', event: 'invoice.paid', subject: 'inv-1' }));
    expect(screen.getByLabelText(/^Rechnung\*?$/)).toHaveValue('inv-1');
    expect(screen.getByRole('option', { name: '2026-10-003 · ACME GmbH' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Ereignis'), 'invoice.corrected');
    expect(onNodeConfig).toHaveBeenLastCalledWith('w', { mode: 'event', event: 'invoice.corrected', subject: 'inv-1' });
    await user.selectOptions(screen.getByLabelText('Ereignis'), 'applications.answered');
    expect(onNodeConfig).toHaveBeenLastCalledWith('w', { mode: 'event', event: 'applications.answered', subject: undefined });
  });
});

describe('the palette', () => {
  it('heads an addon’s actions with the name the addon gives its category', () => {
    render(<Palette catalog={addonCatalog('de')} hasStart={false} onAdd={jest.fn()} />);
    expect(screen.getByText('Bewerbungen')).toBeInTheDocument();
    expect(screen.getByText('Status der Bewerbung setzen')).toBeInTheDocument();
    // OpenTyme's own categories keep the app's translation
    for (const action of addonCatalog('de').actions.filter((candidate) => !candidate.categoryTitle)) {
      expect(screen.getByText(de.categories[action.category as keyof typeof de.categories])).toBeInTheDocument();
    }
  });

  it('falls back to the category key when the addon names nothing', () => {
    const catalog = addonCatalog('de');
    catalog.actions = catalog.actions.map(({ categoryTitle: _title, ...action }) => action);
    render(<Palette catalog={catalog} hasStart={false} onAdd={jest.fn()} />);
    expect(screen.getByText('applications')).toBeInTheDocument();
  });
});
