import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientList } from '../ClientList';
import { useClients } from '../../../api/hooks/useClients';

// Mock the useClients hook
jest.mock('../../../api/hooks/useClients');

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

const mockClients = [
  {
    id: '1',
    name: 'Acme Corporation',
    email: 'contact@acme.com',
    phone: '+1-555-0123',
    address: '123 Business Ave, Suite 100',
    notes: 'Long-term client, prefers email communication',
    status: 'active',
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-01-20'),
  },
  {
    id: '2',
    name: 'Tech Startup LLC',
    email: 'hello@techstartup.com',
    phone: '+1-555-0456',
    address: '456 Innovation Drive',
    notes: 'Fast-growing startup, urgent projects',
    status: 'active',
    created_at: new Date('2024-02-01'),
    updated_at: new Date('2024-02-05'),
  },
  {
    id: '3',
    name: 'Inactive Corp',
    email: 'info@inactive.com',
    phone: '+1-555-0789',
    address: '789 Old Street',
    notes: 'Paused projects temporarily',
    status: 'inactive',
    created_at: new Date('2023-12-01'),
    updated_at: new Date('2023-12-15'),
  },
];

describe('ClientList', () => {
  const mockUseClients = useClients as jest.MockedFunction<typeof useClients>;
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
  });

  it('renders loading state', () => {
    mockUseClients.mockReturnValue({
      clients: [],
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    expect(screen.getByText(/loading clients/i)).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseClients.mockReturnValue({
      clients: [],
      isLoading: false,
      error: new Error('Failed to fetch clients'),
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    expect(screen.getByText(/error loading clients/i)).toBeInTheDocument();
    expect(screen.getByText(/failed to fetch clients/i)).toBeInTheDocument();
  });

  it('renders empty state when no clients exist', () => {
    mockUseClients.mockReturnValue({
      clients: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    expect(screen.getByText(/no clients found/i)).toBeInTheDocument();
    expect(screen.getByText(/get started by adding your first client/i)).toBeInTheDocument();
  });

  it('renders list of clients', () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    // Check if all clients are rendered
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.getByText('Tech Startup LLC')).toBeInTheDocument();
    expect(screen.getByText('Inactive Corp')).toBeInTheDocument();

    // Check client details
    expect(screen.getByText('contact@acme.com')).toBeInTheDocument();
    expect(screen.getByText('+1-555-0123')).toBeInTheDocument();
  });

  it('filters clients by status', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    // Initially all clients should be visible
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.getByText('Inactive Corp')).toBeInTheDocument();

    // Filter by active status
    const statusFilter = screen.getByLabelText(/filter by status/i);
    await userEvent.selectOptions(statusFilter, 'active');

    // Only active clients should be visible
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.getByText('Tech Startup LLC')).toBeInTheDocument();
    expect(screen.queryByText('Inactive Corp')).not.toBeInTheDocument();
  });

  it('searches clients by name', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search clients/i);
    await userEvent.type(searchInput, 'Acme');

    // Only matching client should be visible
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.queryByText('Tech Startup LLC')).not.toBeInTheDocument();
    expect(screen.queryByText('Inactive Corp')).not.toBeInTheDocument();
  });

  it('searches clients by email', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search clients/i);
    await userEvent.type(searchInput, 'techstartup');

    expect(screen.getByText('Tech Startup LLC')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await userEvent.click(editButtons[0]);

    expect(mockOnEdit).toHaveBeenCalledWith(mockClients[0]);
  });

  it('calls onDelete when delete button is clicked', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await userEvent.click(deleteButtons[0]);

    expect(mockOnDelete).toHaveBeenCalledWith(mockClients[0]);
  });

  it('sorts clients by name', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const sortButton = screen.getByRole('button', { name: /sort by name/i });
    await userEvent.click(sortButton);

    // Check if clients are sorted alphabetically
    const clientNames = screen.getAllByTestId(/client-name/i);
    expect(clientNames[0]).toHaveTextContent('Acme Corporation');
    expect(clientNames[1]).toHaveTextContent('Inactive Corp');
    expect(clientNames[2]).toHaveTextContent('Tech Startup LLC');
  });

  it('displays client status badges correctly', () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    // Check active status badges
    const activeBadges = screen.getAllByText(/active/i);
    expect(activeBadges).toHaveLength(2);

    // Check inactive status badge
    const inactiveBadge = screen.getByText(/inactive/i);
    expect(inactiveBadge).toBeInTheDocument();
  });

  it('shows retry button on error and refetches data', async () => {
    const mockRefetch = jest.fn();
    mockUseClients.mockReturnValue({
      clients: [],
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('displays formatted creation date', () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    // Check if dates are formatted properly
    expect(screen.getByText(/jan 15, 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/feb 1, 2024/i)).toBeInTheDocument();
  });

  it('handles empty search results', async () => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ClientList onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </Wrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search clients/i);
    await userEvent.type(searchInput, 'nonexistentclient');

    expect(screen.getByText(/no clients match your search/i)).toBeInTheDocument();
  });
});