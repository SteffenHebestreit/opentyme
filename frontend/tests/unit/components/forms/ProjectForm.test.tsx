import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectForm } from '../ProjectForm';
import { useClients } from '../../../api/hooks/useClients';
import { useCreateProject, useUpdateProject } from '../../../api/hooks/useProjects';

// Mock the hooks
jest.mock('../../../api/hooks/useClients');
jest.mock('../../../api/hooks/useProjects');

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
  { id: '1', name: 'Acme Corporation', email: 'contact@acme.com' },
  { id: '2', name: 'Tech Startup LLC', email: 'hello@techstartup.com' },
];

const mockProject = {
  id: '1',
  name: 'Website Redesign',
  description: 'Complete website overhaul with modern design',
  client_id: '1',
  status: 'active',
  start_date: new Date('2024-01-01'),
  end_date: new Date('2024-03-01'),
  hourly_rate: 85,
  budget: 15000,
  notes: 'Client prefers weekly updates',
};

describe('ProjectForm', () => {
  const mockUseClients = useClients as jest.MockedFunction<typeof useClients>;
  const mockUseCreateProject = useCreateProject as jest.MockedFunction<typeof useCreateProject>;
  const mockUseUpdateProject = useUpdateProject as jest.MockedFunction<typeof useUpdateProject>;
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();

  const mockCreateMutation = {
    mutate: jest.fn(),
    isLoading: false,
    error: null,
  };

  const mockUpdateMutation = {
    mutate: jest.fn(),
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    mockUseClients.mockReturnValue({
      clients: mockClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseCreateProject.mockReturnValue(mockCreateMutation);
    mockUseUpdateProject.mockReturnValue(mockUpdateMutation);

    mockOnSuccess.mockClear();
    mockOnCancel.mockClear();
    mockCreateMutation.mutate.mockClear();
    mockUpdateMutation.mutate.mockClear();
  });

  it('renders create form correctly', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/client/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hourly rate/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders edit form with pre-filled values', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm 
          project={mockProject}
          onSuccess={mockOnSuccess} 
          onCancel={mockOnCancel} 
        />
      </Wrapper>
    );

    expect(screen.getByDisplayValue('Website Redesign')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Complete website overhaul with modern design')).toBeInTheDocument();
    expect(screen.getByDisplayValue('85')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15000')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /update project/i })).toBeInTheDocument();
  });

  it('displays validation errors for required fields', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const submitButton = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/project name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/client is required/i)).toBeInTheDocument();
      expect(screen.getByText(/start date is required/i)).toBeInTheDocument();
    });
  });

  it('displays validation error for negative hourly rate', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const hourlyRateInput = screen.getByLabelText(/hourly rate/i);
    await userEvent.type(hourlyRateInput, '-50');

    const submitButton = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/hourly rate must be positive/i)).toBeInTheDocument();
    });
  });

  it('displays validation error when end date is before start date', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const startDateInput = screen.getByLabelText(/start date/i);
    const endDateInput = screen.getByLabelText(/end date/i);

    await userEvent.type(startDateInput, '2024-03-01');
    await userEvent.type(endDateInput, '2024-02-01');

    const submitButton = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
    });
  });

  it('populates client dropdown with available clients', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const clientSelect = screen.getByLabelText(/client/i);
    expect(clientSelect).toBeInTheDocument();

    // Check if clients are in the dropdown options
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.getByText('Tech Startup LLC')).toBeInTheDocument();
  });

  it('handles client loading state', () => {
    mockUseClients.mockReturnValue({
      clients: [],
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    expect(screen.getByText(/loading clients/i)).toBeInTheDocument();
  });

  it('calls create mutation with correct data on form submission', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    // Fill out the form
    await userEvent.type(screen.getByLabelText(/project name/i), 'New Project');
    await userEvent.type(screen.getByLabelText(/description/i), 'Project description');
    await userEvent.selectOptions(screen.getByLabelText(/client/i), '1');
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'active');
    await userEvent.type(screen.getByLabelText(/start date/i), '2024-01-01');
    await userEvent.type(screen.getByLabelText(/hourly rate/i), '75');

    const submitButton = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutation.mutate).toHaveBeenCalledWith({
        name: 'New Project',
        description: 'Project description',
        client_id: '1',
        status: 'active',
        start_date: '2024-01-01',
        hourly_rate: 75,
      });
    });
  });

  it('calls update mutation with correct data when editing', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm 
          project={mockProject}
          onSuccess={mockOnSuccess} 
          onCancel={mockOnCancel} 
        />
      </Wrapper>
    );

    // Modify the project name
    const nameInput = screen.getByDisplayValue('Website Redesign');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Website Redesign');

    const submitButton = screen.getByRole('button', { name: /update project/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateMutation.mutate).toHaveBeenCalledWith({
        id: '1',
        name: 'Updated Website Redesign',
        description: 'Complete website overhaul with modern design',
        client_id: '1',
        status: 'active',
        start_date: '2024-01-01',
        end_date: '2024-03-01',
        hourly_rate: 85,
        budget: 15000,
        notes: 'Client prefers weekly updates',
      });
    });
  });

  it('shows loading state during form submission', () => {
    mockCreateMutation.isLoading = true;
    mockUseCreateProject.mockReturnValue(mockCreateMutation);

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const submitButton = screen.getByRole('button', { name: /creating/i });
    expect(submitButton).toBeDisabled();
  });

  it('displays mutation error', () => {
    mockCreateMutation.error = new Error('Failed to create project');
    mockUseCreateProject.mockReturnValue(mockCreateMutation);

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    expect(screen.getByText(/failed to create project/i)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('handles status dropdown correctly', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    const statusSelect = screen.getByLabelText(/status/i);
    
    // Check available status options
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.getByText(/on hold/i)).toBeInTheDocument();

    await userEvent.selectOptions(statusSelect, 'completed');
    expect(statusSelect).toHaveValue('completed');
  });

  it('includes optional fields in form submission when provided', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    // Fill out required and optional fields
    await userEvent.type(screen.getByLabelText(/project name/i), 'New Project');
    await userEvent.selectOptions(screen.getByLabelText(/client/i), '1');
    await userEvent.type(screen.getByLabelText(/start date/i), '2024-01-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2024-12-31');
    await userEvent.type(screen.getByLabelText(/budget/i), '25000');
    await userEvent.type(screen.getByLabelText(/notes/i), 'Additional project notes');

    const submitButton = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutation.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          end_date: '2024-12-31',
          budget: 25000,
          notes: 'Additional project notes',
        })
      );
    });
  });

  it('resets form when switching between create and edit modes', () => {
    const Wrapper = createTestWrapper();
    const { rerender } = render(
      <Wrapper>
        <ProjectForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      </Wrapper>
    );

    // Fill out form in create mode
    const nameInput = screen.getByLabelText(/project name/i);
    userEvent.type(nameInput, 'Test Project');

    // Switch to edit mode
    rerender(
      <Wrapper>
        <ProjectForm 
          project={mockProject}
          onSuccess={mockOnSuccess} 
          onCancel={mockOnCancel} 
        />
      </Wrapper>
    );

    // Should now show the project data
    expect(screen.getByDisplayValue('Website Redesign')).toBeInTheDocument();
  });
});