import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Layout from '../../src/components/common/Layout';
import { AppProvider } from '../../src/store/AppContext';

// Mock the AppContext
const mockState = {
  theme: 'light' as 'light' | 'dark',
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

jest.mock('../../src/store/AppContext', () => ({
  ...jest.requireActual('../../src/store/AppContext'),
  useApp: () => ({
    state: mockState,
    dispatch: jest.fn(),
  }),
}));

// Mock the Header component to simplify tests
jest.mock('../../src/components/common/Header', () => {
  return function MockHeader() {
    return <header data-testid="mock-header">Header</header>;
  };
});

// Wrapper component for tests
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <AppProvider>{children}</AppProvider>
  </BrowserRouter>
);

describe('Layout Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.theme = 'light';
  });

  it('renders layout with children', () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders the header', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
  });

  it('renders the footer', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText(/© 2023 Project Tracking System/i)).toBeInTheDocument();
  });

  it('renders main content area', () => {
    render(
      <Layout>
        <div>Main Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('Main Content');
  });

  it('applies light theme styles by default', () => {
    mockState.theme = 'light';
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv.className).toContain('bg-gray-50');
    expect(layoutDiv.className).not.toContain('dark');
  });

  it('applies dark theme styles when theme is dark', () => {
    mockState.theme = 'dark';
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv.className).toContain('dark');
    expect(layoutDiv.className).toContain('bg-gray-900');
  });

  it('has min-height screen layout', () => {
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv.className).toContain('min-h-screen');
  });

  it('uses flexbox layout', () => {
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv.className).toContain('flex');
    expect(layoutDiv.className).toContain('flex-col');
  });

  it('main content area grows to fill space', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const main = screen.getByRole('main');
    expect(main.className).toContain('flex-grow');
  });

  it('footer has proper styling', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    const footer = screen.getByRole('contentinfo');
    expect(footer.className).toContain('text-center');
    expect(footer.className).toContain('text-gray-500');
    expect(footer.className).toContain('dark:text-gray-400');
  });

  it('renders multiple children', () => {
    render(
      <Layout>
        <div>First Child</div>
        <div>Second Child</div>
        <div>Third Child</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('First Child')).toBeInTheDocument();
    expect(screen.getByText('Second Child')).toBeInTheDocument();
    expect(screen.getByText('Third Child')).toBeInTheDocument();
  });

  it('preserves child component structure', () => {
    render(
      <Layout>
        <section data-testid="custom-section">
          <h1>Page Title</h1>
          <p>Page content</p>
        </section>
      </Layout>,
      { wrapper: Wrapper }
    );

    const section = screen.getByTestId('custom-section');
    expect(section).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /page title/i })).toBeInTheDocument();
  });

  it('footer displays copyright year', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText(/2023/)).toBeInTheDocument();
  });

  it('footer displays all rights reserved', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText(/all rights reserved/i)).toBeInTheDocument();
  });
});
