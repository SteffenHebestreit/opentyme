import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert, ErrorAlert, SuccessAlert } from '../../src/components/common/Alert';

describe('Alert', () => {
  it('renders with message', () => {
    render(<Alert message="Test message" />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders with title and message', () => {
    render(<Alert message="Test message" title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders with info type by default', () => {
    render(<Alert message="Info message" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-blue-500');
  });

  it('renders with success type', () => {
    render(<Alert message="Success message" type="success" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-green-500');
  });

  it('renders with warning type', () => {
    render(<Alert message="Warning message" type="warning" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-yellow-500');
  });

  it('renders with error type', () => {
    render(<Alert message="Error message" type="error" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-red-500');
  });

  it('renders icon for each type', () => {
    const { rerender } = render(<Alert message="Test" type="info" />);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Alert message="Test" type="warning" />);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Alert message="Test" type="error" />);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();
  });

  it('does not render close button when onClose is not provided', () => {
    render(<Alert message="Test message" />);
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });

  it('renders close button when onClose is provided', () => {
    const handleClose = jest.fn();
    render(<Alert message="Test message" onClose={handleClose} />);
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const handleClose = jest.fn();
    const user = userEvent.setup();

    render(<Alert message="Test message" onClose={handleClose} />);
    await user.click(screen.getByLabelText('Dismiss'));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('has proper ARIA role', () => {
    render(<Alert message="Test message" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('ErrorAlert', () => {
  it('renders as error type', () => {
    render(<ErrorAlert message="Error occurred" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-red-500');
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('supports title and onClose', async () => {
    const handleClose = jest.fn();
    const user = userEvent.setup();

    render(<ErrorAlert message="Error" title="Error Title" onClose={handleClose} />);
    expect(screen.getByText('Error Title')).toBeInTheDocument();
    
    await user.click(screen.getByLabelText('Dismiss'));
    expect(handleClose).toHaveBeenCalled();
  });
});

describe('SuccessAlert', () => {
  it('renders as success type', () => {
    render(<SuccessAlert message="Operation successful" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-green-500');
    expect(screen.getByText('Operation successful')).toBeInTheDocument();
  });

  it('supports title and onClose', async () => {
    const handleClose = jest.fn();
    const user = userEvent.setup();

    render(<SuccessAlert message="Success" title="Success Title" onClose={handleClose} />);
    expect(screen.getByText('Success Title')).toBeInTheDocument();
    
    await user.click(screen.getByLabelText('Dismiss'));
    expect(handleClose).toHaveBeenCalled();
  });
});
