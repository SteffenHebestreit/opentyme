import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardStats } from '../DashboardStats';
import { useDashboardData } from '../../../api/hooks/useDashboard';

// Mock the dashboard data hook
jest.mock('../../../api/hooks/useDashboard');

// Create a test wrapper with providers
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

const mockDashboardData = {
  totalClients: 15,
  activeProjects: 8,
  pendingInvoices: 5,
  totalRevenue: 125000,
  thisMonthRevenue: 15000,
  hoursThisMonth: 160,
  averageHourlyRate: 85,
  recentActivities: [
    {
      id: '1',
      type: 'time_entry',
      description: 'Logged 8 hours for Website Redesign project',
      timestamp: new Date('2024-01-20T10:30:00Z'),
      client: 'Acme Corporation',
    },
    {
      id: '2',
      type: 'invoice',
      description: 'Invoice #INV-2024-001 sent to Tech Startup LLC',
      timestamp: new Date('2024-01-19T16:45:00Z'),
      client: 'Tech Startup LLC',
    },
    {
      id: '3',
      type: 'project',
      description: 'New project "Mobile App Development" created',
      timestamp: new Date('2024-01-18T09:15:00Z'),
      client: 'Innovation Corp',
    },
  ],
  upcomingDeadlines: [
    {
      id: '1',
      projectName: 'Website Redesign',
      client: 'Acme Corporation',
      deadline: new Date('2024-02-01T00:00:00Z'),
      status: 'in_progress',
    },
    {
      id: '2',
      projectName: 'E-commerce Platform',
      client: 'Retail Solutions',
      deadline: new Date('2024-02-15T00:00:00Z'),
      status: 'planning',
    },
  ],
};

describe('DashboardStats', () => {
  const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;

  beforeEach(() => {
    mockUseDashboardData.mockReturnValue({
      data: mockDashboardData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders loading state', () => {
    mockUseDashboardData.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument();
    // Check for skeleton loaders
    expect(screen.getAllByTestId('stats-skeleton')).toHaveLength(4);
  });

  it('renders error state', () => {
    mockUseDashboardData.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to load dashboard data'),
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    expect(screen.getByText(/error loading dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/failed to load dashboard data/i)).toBeInTheDocument();
  });

  it('renders all key metrics correctly', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    // Check total clients
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/total clients/i)).toBeInTheDocument();

    // Check active projects
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/active projects/i)).toBeInTheDocument();

    // Check pending invoices
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/pending invoices/i)).toBeInTheDocument();

    // Check total revenue (formatted as currency)
    expect(screen.getByText('$125,000')).toBeInTheDocument();
    expect(screen.getByText(/total revenue/i)).toBeInTheDocument();
  });

  it('renders this month statistics', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    // Check this month revenue
    expect(screen.getByText('$15,000')).toBeInTheDocument();
    expect(screen.getByText(/this month revenue/i)).toBeInTheDocument();

    // Check hours this month
    expect(screen.getByText('160')).toBeInTheDocument();
    expect(screen.getByText(/hours this month/i)).toBeInTheDocument();

    // Check average hourly rate
    expect(screen.getByText('$85')).toBeInTheDocument();
    expect(screen.getByText(/average hourly rate/i)).toBeInTheDocument();
  });

  it('renders recent activities section', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    expect(screen.getByText(/recent activities/i)).toBeInTheDocument();
    
    // Check individual activities
    expect(screen.getByText(/logged 8 hours for website redesign/i)).toBeInTheDocument();
    expect(screen.getByText(/invoice #inv-2024-001 sent/i)).toBeInTheDocument();
    expect(screen.getByText(/new project "mobile app development" created/i)).toBeInTheDocument();

    // Check client names in activities
    expect(screen.getByText(/acme corporation/i)).toBeInTheDocument();
    expect(screen.getByText(/tech startup llc/i)).toBeInTheDocument();
    expect(screen.getByText(/innovation corp/i)).toBeInTheDocument();
  });

  it('renders upcoming deadlines section', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    expect(screen.getByText(/upcoming deadlines/i)).toBeInTheDocument();
    
    // Check project deadlines
    expect(screen.getByText(/website redesign/i)).toBeInTheDocument();
    expect(screen.getByText(/e-commerce platform/i)).toBeInTheDocument();

    // Check deadline dates (formatted)
    expect(screen.getByText(/feb 1, 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/feb 15, 2024/i)).toBeInTheDocument();

    // Check project statuses
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/planning/i)).toBeInTheDocument();
  });

  it('displays activity timestamps correctly', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    // Check relative time displays (assuming the component shows "2 days ago" etc.)
    expect(screen.getByText(/jan 20/i)).toBeInTheDocument();
    expect(screen.getByText(/jan 19/i)).toBeInTheDocument();
    expect(screen.getByText(/jan 18/i)).toBeInTheDocument();
  });

  it('shows different activity type icons', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    // Check for activity type indicators (icons or badges)
    expect(screen.getByTestId('time-entry-icon')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-icon')).toBeInTheDocument();
    expect(screen.getByTestId('project-icon')).toBeInTheDocument();
  });

  it('shows deadline urgency indicators', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    // Check for urgency indicators (e.g., red for urgent, yellow for upcoming)
    const urgentDeadlines = screen.getAllByTestId(/deadline-urgency/i);
    expect(urgentDeadlines).toHaveLength(2);
  });

  it('handles empty states gracefully', () => {
    mockUseDashboardData.mockReturnValue({
      data: {
        ...mockDashboardData,
        recentActivities: [],
        upcomingDeadlines: [],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    expect(screen.getByText(/no recent activities/i)).toBeInTheDocument();
    expect(screen.getByText(/no upcoming deadlines/i)).toBeInTheDocument();
  });

  it('formats large numbers correctly', () => {
    mockUseDashboardData.mockReturnValue({
      data: {
        ...mockDashboardData,
        totalRevenue: 1250000, // 1.25 million
        thisMonthRevenue: 75000, // 75k
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    expect(screen.getByText('$1,250,000')).toBeInTheDocument();
    expect(screen.getByText('$75,000')).toBeInTheDocument();
  });

  it('shows growth indicators for metrics', () => {
    mockUseDashboardData.mockReturnValue({
      data: {
        ...mockDashboardData,
        revenueGrowth: 15.5, // 15.5% growth
        projectGrowth: -5.2, // 5.2% decline
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    // Check for growth indicators
    expect(screen.getByText(/15.5%/i)).toBeInTheDocument();
    expect(screen.getByText(/-5.2%/i)).toBeInTheDocument();
    
    // Check for growth direction indicators (up/down arrows)
    expect(screen.getByTestId('growth-up-icon')).toBeInTheDocument();
    expect(screen.getByTestId('growth-down-icon')).toBeInTheDocument();
  });

  it('provides refresh functionality', async () => {
    const mockRefetch = jest.fn();
    mockUseDashboardData.mockReturnValue({
      data: mockDashboardData,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    );

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await userEvent.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalled();
  });
});