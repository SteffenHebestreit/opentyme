import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '../../src/components/common/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card><div data-testid="content">Card content</div></Card>);
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('custom-class');
  });

  it('has default shadow and rounded styling', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('shadow');
    expect(card.className).toContain('rounded-lg');
  });
});

describe('CardHeader', () => {
  it('renders with title', () => {
    render(<CardHeader title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders with title and subtitle', () => {
    render(<CardHeader title="Test Title" subtitle="Test Subtitle" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
  });

  it('renders with action button', () => {
    render(
      <CardHeader 
        title="Test Title" 
        action={<button>Action</button>} 
      />
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('renders children instead of action when both provided', () => {
    render(
      <CardHeader 
        title="Test Title" 
        action={<button>Action</button>}
      >
        <span data-testid="child">Child content</span>
      </CardHeader>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<CardHeader title="Title" className="custom-class" />);
    const header = container.firstChild as HTMLElement;
    expect(header.className).toContain('custom-class');
  });

  it('has border-bottom styling', () => {
    const { container } = render(<CardHeader title="Title" />);
    const header = container.firstChild as HTMLElement;
    expect(header.className).toContain('border-b');
  });
});

describe('CardBody', () => {
  it('renders children', () => {
    render(<CardBody><div data-testid="body-content">Body text</div></CardBody>);
    expect(screen.getByTestId('body-content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<CardBody className="custom-class">Content</CardBody>);
    const body = container.firstChild as HTMLElement;
    expect(body.className).toContain('custom-class');
  });

  it('has padding', () => {
    const { container } = render(<CardBody>Content</CardBody>);
    const body = container.firstChild as HTMLElement;
    expect(body.className).toContain('px-6');
    expect(body.className).toContain('py-4');
  });
});

describe('CardFooter', () => {
  it('renders children', () => {
    render(<CardFooter><div data-testid="footer-content">Footer text</div></CardFooter>);
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<CardFooter className="custom-class">Content</CardFooter>);
    const footer = container.firstChild as HTMLElement;
    expect(footer.className).toContain('custom-class');
  });

  it('has border-top and background styling', () => {
    const { container } = render(<CardFooter>Content</CardFooter>);
    const footer = container.firstChild as HTMLElement;
    expect(footer.className).toContain('border-t');
    expect(footer.className).toContain('bg-gray-50');
  });
});

describe('Card Composition', () => {
  it('renders complete card with header, body, and footer', () => {
    render(
      <Card>
        <CardHeader title="Card Title" subtitle="Card Subtitle" />
        <CardBody>Card body content</CardBody>
        <CardFooter>Card footer content</CardFooter>
      </Card>
    );

    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Subtitle')).toBeInTheDocument();
    expect(screen.getByText('Card body content')).toBeInTheDocument();
    expect(screen.getByText('Card footer content')).toBeInTheDocument();
  });
});
