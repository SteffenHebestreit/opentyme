# OpenTYME - Frontend

> React 18 + TypeScript + Vite SPA with TailwindCSS, React Query, and Keycloak authentication.

---

## 📁 Project Structure

```
frontend/
├── src/
│   ├── main.tsx                    # Application entry point
│   ├── App.tsx                     # Root component with routing
│   ├── index.css                   # Global styles & Tailwind imports
│   ├── vite-env.d.ts              # Vite type definitions
│   ├── jest.d.ts                  # Jest type definitions
│   │
│   ├── api/                        # API layer (axios configuration)
│   │   ├── types.ts               # API request/response types
│   │   ├── interceptors/          # Axios interceptors
│   │   │   └── auth.interceptor.ts # Auto-attach auth token
│   │   ├── hooks/                 # Query/mutation wrappers
│   │   │   ├── useAuth.ts         # Auth query hooks
│   │   │   ├── useClients.ts      # Client query hooks
│   │   │   ├── usePlugins.ts      # Plugin query hooks
│   │   │   └── useProjects.ts     # Project query hooks
│   │   └── services/              # API service functions
│   │       ├── client.ts          # Axios instance
│   │       ├── analytics.service.ts
│   │       ├── auth.service.ts
│   │       ├── client.service.ts
│   │       ├── dashboard.service.ts
│   │       ├── email-template.service.ts
│   │       ├── expense.service.ts
│   │       ├── invoice.service.ts
│   │       ├── invoice-text-template.service.ts
│   │       ├── payment.service.ts
│   │       ├── plugin.service.ts
│   │       ├── project.service.ts
│   │       ├── report.service.ts
│   │       ├── tax-rate.service.ts
│   │       └── timeEntry.service.ts
│   │
│   ├── components/                 # React components
│   │   ├── admin/                 # Admin-only components
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── BackupManagement.tsx
│   │   │   ├── SettingsForm.tsx
│   │   │   └── UserManagement.tsx
│   │   ├── auth/                  # Authentication components
│   │   │   ├── AuthGuard.tsx      # Protected route wrapper
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   ├── business/              # Business logic components
│   │   │   ├── clients/
│   │   │   │   ├── ClientCard.tsx
│   │   │   │   ├── ClientForm.tsx
│   │   │   │   └── ClientList.tsx
│   │   │   ├── expenses/
│   │   │   │   ├── ExpenseCard.tsx
│   │   │   │   ├── ExpenseForm.tsx
│   │   │   │   └── ExpenseList.tsx
│   │   │   ├── projects/
│   │   │   │   ├── ProjectCard.tsx
│   │   │   │   ├── ProjectForm.tsx
│   │   │   │   └── ProjectList.tsx
│   │   │   └── time-tracking/
│   │   │       ├── TimeEntryCard.tsx
│   │   │       ├── TimeEntryForm.tsx
│   │   │       ├── TimeEntryList.tsx
│   │   │       └── Timer.tsx
│   │   ├── common/                # Shared UI components
│   │   │   ├── Alert.tsx          # Alert notifications
│   │   │   ├── Button.tsx         # Button component
│   │   │   ├── Card.tsx           # Card container
│   │   │   ├── CurrencyDisplay.tsx # Currency formatter
│   │   │   ├── Header.tsx         # App header/nav
│   │   │   ├── Layout.tsx         # Page layout wrapper
│   │   │   ├── Skeleton.tsx       # Loading skeleton
│   │   │   └── index.ts           # Barrel export
│   │   ├── dashboard/             # Dashboard components
│   │   │   ├── Dashboard.tsx      # Main dashboard
│   │   │   └── DashboardStats.tsx # Statistics cards
│   │   ├── forms/                 # Form components
│   │   │   ├── CustomSelect.tsx   # Custom dropdown
│   │   │   ├── Input.tsx          # Text input
│   │   │   ├── Select.tsx         # Select dropdown
│   │   │   ├── Textarea.tsx       # Textarea input
│   │   │   └── index.ts           # Barrel export
│   │   └── ui/                    # Generic UI components
│   │       └── Modal.tsx          # Modal dialog
│   │
│   ├── config/                     # Configuration files
│   │   └── keycloak.config.ts     # Keycloak settings
│   │
│   ├── constants/                  # Application constants
│   │   └── currencies.ts          # Currency codes
│   │
│   ├── contexts/                   # React contexts
│   │   └── AuthContext.tsx        # Authentication state
│   │
│   ├── hooks/                      # Custom React hooks
│   │   └── api/                   # React Query hooks
│   │       ├── index.ts           # Hook exports
│   │       ├── queryKeys.ts       # Query key factory
│   │       ├── useAnalytics.ts
│   │       ├── useClients.ts
│   │       ├── useDashboard.ts
│   │       ├── useExpenses.ts
│   │       ├── useInvoices.ts
│   │       ├── useInvoiceTextTemplates.ts
│   │       ├── usePayments.ts
│   │       ├── useProjects.ts
│   │       ├── useTaxRates.ts
│   │       └── useTimeEntries.ts
│   │
│   ├── pages/                      # Page components (routes)
│   │   ├── admin/
│   │   │   ├── AdminPage.tsx      # Settings / Plugins hub
│   │   │   └── PluginsPage.tsx    # Plugin management UI
│   │   ├── auth/
│   │   │   ├── ForgotPassword.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   └── ResetPassword.tsx
│   │   ├── expenses/
│   │   │   └── ExpensesPage.tsx
│   │   ├── finances/
│   │   │   └── FinancesPage.tsx
│   │   ├── payments/
│   │   │   └── PaymentsPage.tsx
│   │   ├── profile/
│   │   │   └── ProfilePage.tsx
│   │   ├── Reports.tsx
│   │   └── LandingPage.tsx
│   │
│   ├── plugins/                    # Addon plugin system
│   │   ├── plugin-loader.ts       # Discovers and loads frontend addons
│   │   └── plugin-registry.ts     # In-memory frontend plugin registry
│   │
│   ├── types/                      # Shared TypeScript types
│   │   └── plugin.types.ts        # Plugin / addon type definitions
│   │
│   ├── services/                   # Business logic services
│   │   └── auth/
│   │       └── tokenManager.ts    # JWT token management
│   │
│   ├── store/                      # Global state management
│   │   └── AppContext.tsx         # Application context
│   │
│   └── utils/                      # Utility functions
│       ├── auth.ts                # Auth helpers
│       ├── currency.ts            # Currency formatting
│       └── validation.ts          # Form validation
│
├── tests/                          # Test suites
│   ├── e2e/                       # End-to-end tests (Playwright)
│   │   ├── auth.spec.ts
│   │   ├── clients.spec.ts
│   │   └── projects.spec.ts
│   └── unit/                      # Unit tests (Jest)
│       ├── setup.test.ts
│       ├── Alert.test.tsx
│       ├── Button.test.tsx
│       ├── Card.test.tsx
│       ├── Header.test.tsx
│       ├── Layout.test.tsx
│       ├── Skeleton.test.tsx
│       ├── ForgotPassword.test.tsx
│       ├── Login.test.tsx
│       ├── Register.test.tsx
│       ├── ResetPassword.test.tsx
│       └── components/
│           ├── auth/
│           │   └── LoginForm.test.tsx
│           ├── business/
│           │   └── ClientList.test.tsx
│           ├── dashboard/
│           │   └── DashboardStats.test.tsx
│           └── forms/
│               └── ProjectForm.test.tsx
│
├── public/                         # Static assets
│   └── vite.svg                   # App icon
│
├── docs/                           # TypeDoc generated docs
│   ├── index.html                 # API documentation
│   └── ...                        # Auto-generated docs
│
├── playwright-report/              # E2E test reports
├── test-results/                   # Test artifacts
│
├── .env                            # Environment variables (local)
├── .env.example                    # Environment template
├── .vscode/                        # VS Code settings
├── Dockerfile                      # Production Docker image
├── Dockerfile.dev                  # Development Docker image
├── index.html                      # HTML entry point
├── jest.config.js                  # Jest configuration
├── nginx.conf                      # Production nginx config
├── package.json                    # Dependencies & scripts
├── playwright.config.ts            # Playwright E2E config
├── postcss.config.js               # PostCSS config
├── tailwind.config.js              # TailwindCSS config
├── tsconfig.json                   # TypeScript config
├── tsconfig.node.json              # Node TypeScript config
├── tsconfig.typedoc.json           # TypeDoc config
├── typedoc.json                    # TypeDoc settings
├── vite.config.js                  # Vite bundler config
└── README.md                       # This file
```

---

## 🏗️ Architecture

### Component Hierarchy

```
App.tsx (Router)
  └─ AuthProvider (Context)
      └─ Layout (Common wrapper)
          ├─ Header (Navigation)
          └─ Routes
              ├─ Public Routes
              │   ├─ LandingPage
              │   ├─ Login
              │   ├─ Register
              │   └─ ForgotPassword
              └─ Protected Routes (AuthGuard)
                  ├─ Dashboard
                  ├─ ClientList
                  ├─ ProjectList
                  ├─ TimeEntryList
                  ├─ ExpensesPage
                  ├─ FinancesPage
                  ├─ ProfilePage
                  └─ AdminPage (admin role only)
```

### State Management Strategy

1. **Authentication**: React Context (`AuthContext`)
   - User state, token, login/logout methods
   - Persisted to localStorage
   - Auto-refresh on app load

2. **Server State**: React Query (`@tanstack/react-query`)
   - All API data fetching and caching
   - Automatic background refetching
   - Optimistic updates for mutations
   - Query invalidation on mutations

3. **Global App State**: React Context (`AppContext`)
   - Settings, theme, notifications
   - Non-persisted runtime state

4. **Local Component State**: `useState` & `useReducer`
   - Form inputs, UI toggles, modals
   - Ephemeral component-level data

### Data Flow

```
Component
    ↓
Custom Hook (useClients, useProjects)
    ↓
React Query (useQuery, useMutation)
    ↓
Service Function (clientService.fetchClients)
    ↓
API Client (axios with interceptor)
    ↓
Backend API
```

---

## 🔐 Authentication

### Keycloak Direct Access Grant Flow

The application uses **Direct Access Grant** (Resource Owner Password Credentials):

1. User submits credentials to frontend
2. Frontend calls backend `/auth/login`
3. Backend authenticates with Keycloak
4. Backend returns JWT access token + refresh token
5. Frontend stores tokens in localStorage
6. All API requests include `Authorization: Bearer <token>`

### Token Management

```typescript
// services/auth/tokenManager.ts
- setTokens(access, refresh): Store tokens
- getAccessToken(): Retrieve access token
- getRefreshToken(): Retrieve refresh token
- clearTokens(): Remove tokens (logout)
- getUserFromToken(): Decode JWT payload
```

### Auth Interceptor

```typescript
// api/interceptors/auth.interceptor.ts
// Automatically attaches token to every request
request.headers.Authorization = `Bearer ${token}`;

// Handles 401 responses
if (error.response?.status === 401) {
  clearTokens();
  window.location.href = '/login';
}
```

### Protected Routes

```tsx
<Route
  path="/dashboard"
  element={
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  }
/>
```

**AuthGuard** checks:
- ✅ User is authenticated
- ✅ Token is valid
- ❌ Redirects to `/login` if not

---

## 🎨 Styling

### TailwindCSS Configuration

- **Design System**: Custom color palette, spacing, typography
- **Dark Mode**: Not implemented (future enhancement)
- **Responsive**: Mobile-first breakpoints (sm, md, lg, xl)
- **Custom Components**: Button variants, card styles

### Component Patterns

```tsx
// Consistent prop patterns
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
```

### Form Components

- **Input**: Text, email, password, number
- **Select**: Dropdown with search
- **Textarea**: Multi-line text
- **CustomSelect**: Enhanced dropdown with custom rendering

All form components support:
- ✅ Label + placeholder
- ✅ Error messages
- ✅ Disabled state
- ✅ Required indicator
- ✅ Accessibility (ARIA labels)

---

## 📡 API Integration

### Service Layer Pattern

Each backend resource has a dedicated service:

```typescript
// api/services/client.service.ts
export const clientService = {
  fetchClients(params?): Promise<Client[]>
  fetchClient(id): Promise<Client>
  createClient(payload): Promise<Client>
  updateClient(id, payload): Promise<Client>
  deleteClient(id): Promise<void>
}
```

### React Query Hooks

Custom hooks wrap services with React Query:

```typescript
// hooks/api/useClients.ts
export const useClients = (params?) => {
  return useQuery({
    queryKey: ['clients', params],
    queryFn: () => clientService.fetchClients(params)
  });
};

export const useCreateClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clientService.createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    }
  });
};
```

### Usage in Components

```tsx
const ClientList = () => {
  const { data: clients, isLoading, error } = useClients();
  const createClient = useCreateClient();

  const handleCreate = async (data) => {
    await createClient.mutateAsync(data);
    // Query automatically refetches
  };

  if (isLoading) return <Skeleton />;
  if (error) return <Alert type="error">{error.message}</Alert>;

  return <div>{clients.map(c => <ClientCard key={c.id} {...c} />)}</div>;
};
```

---

## 🧪 Testing

### Running Tests

```bash
# Unit tests (Jest + React Testing Library)
npm test
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e
npm run test:e2e:ui       # Interactive UI mode
npm run test:e2e:debug    # Debug mode

# Generate test report
npm run test:report
```

### Unit Test Structure

```typescript
describe('ClientList', () => {
  it('renders clients correctly', async () => {
    render(<ClientList />);
    
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
  });

  it('handles create client', async () => {
    const { user } = render(<ClientList />);
    
    await user.click(screen.getByText('Add Client'));
    await user.type(screen.getByLabelText('Name'), 'New Client');
    await user.click(screen.getByText('Save'));
    
    await waitFor(() => {
      expect(screen.getByText('New Client')).toBeInTheDocument();
    });
  });
});
```

### E2E Test Structure

```typescript
test('user can create a client', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="username"]', 'test@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  await page.waitForURL('/dashboard');
  await page.click('text=Clients');
  await page.click('text=Add Client');
  
  await page.fill('[name="name"]', 'Test Client');
  await page.fill('[name="email"]', 'test@client.com');
  await page.click('button:has-text("Save")');
  
  await expect(page.locator('text=Test Client')).toBeVisible();
});
```

---

## 🚀 Development

### Prerequisites

- Node.js 18+
- npm 9+
- Backend API running on `http://localhost:8000`

### Local Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your settings

# Start development server
npm run dev

# App runs on http://localhost:5173
```

### Environment Variables

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:8000

# Keycloak Configuration
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=opentyme
VITE_KEYCLOAK_CLIENT_ID=opentyme-frontend

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_DARK_MODE=false
```

### Available Scripts

```bash
npm run dev          # Start dev server (Vite HMR)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix linting issues
npm run type-check   # TypeScript validation
npm run test         # Run unit tests
npm run test:e2e     # Run E2E tests
npm run docs         # Generate TypeDoc documentation
```

---

## 📦 Build & Deploy

### Production Build

```bash
# Build optimized bundle
npm run build

# Output in dist/ directory
# - Minified JavaScript
# - Optimized CSS
# - Asset fingerprinting
# - Source maps
```

### Docker Deployment

```bash
# Development image (hot reload)
docker build -f Dockerfile.dev -t opentyme-frontend:dev .

# Production image (nginx)
docker build -t opentyme-frontend:prod .

# Run production container
docker run -p 80:80 opentyme-frontend:prod
```

### Production Configuration (nginx)

```nginx
server {
  listen 80;
  
  # Serve static files
  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
  }
  
  # Proxy API requests
  location /api {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
  }
}
```

---

## 🔧 Configuration Files

### Vite Configuration

```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',  // Import shortcut: import { ... } from '@/...'
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',  // API proxy for dev
    },
  },
});
```

### TypeScript Configuration

- **Target**: ES2020
- **Module**: ESNext
- **Strict Mode**: Enabled
- **Path Aliases**: `@/*` → `src/*`

### TailwindCSS Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {...},
        secondary: {...},
      },
    },
  },
};
```

---

## 📊 Performance

### Optimization Strategies

1. **Code Splitting**: Lazy-loaded routes
2. **Bundle Analysis**: Vite visualizer
3. **Tree Shaking**: Automatic dead code elimination
4. **Asset Optimization**: Image compression, lazy loading
5. **React Query Caching**: Reduced API calls
6. **Memoization**: `useMemo`, `useCallback` for expensive computations

### Lighthouse Metrics (Target)

- Performance: 90+
- Accessibility: 95+
- Best Practices: 90+
- SEO: 85+

---

## 🔒 Security

### Implemented Security Measures

- ✅ **XSS Prevention**: React auto-escapes JSX
- ✅ **CSRF Protection**: SameSite cookies
- ✅ **JWT Validation**: Token expiry checks
- ✅ **Secure Storage**: HttpOnly cookies (refresh tokens)
- ✅ **Input Sanitization**: Form validation
- ✅ **Content Security Policy**: Helmet headers (nginx)
- ✅ **HTTPS Only**: Production deployment

---

## 🐛 Debugging

### React DevTools

Install React DevTools browser extension:
- Inspect component tree
- View props and state
- Profile performance

### Redux DevTools (React Query)

React Query DevTools (built-in):
```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

### VS Code Debug Configuration

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug Frontend",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/frontend/src"
}
```

---

## 📚 Documentation

### TypeDoc

Auto-generated API documentation:

```bash
# Generate docs
npm run docs

# Open docs/index.html in browser
```

### Component Documentation

All components include JSDoc comments:

```tsx
/**
 * Client card component displaying client information.
 * 
 * @param {Client} client - The client object to display
 * @param {Function} onEdit - Callback when edit is clicked
 * @param {Function} onDelete - Callback when delete is clicked
 * 
 * @example
 * <ClientCard
 *   client={client}
 *   onEdit={() => setEditMode(true)}
 *   onDelete={() => handleDelete(client.id)}
 * />
 */
export const ClientCard: React.FC<ClientCardProps> = ({ ... }) => { ... }
```

---

## 🤝 Contributing

### Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Use functional components with hooks
- Add JSDoc comments to all exported functions/components
- Write tests for new features

### Component Guidelines

1. **Single Responsibility**: One component, one purpose
2. **Composition over Inheritance**: Compose smaller components
3. **Props Validation**: Use TypeScript interfaces
4. **Accessibility**: ARIA labels, semantic HTML
5. **Error Boundaries**: Wrap error-prone components

### Pull Request Process

1. Create feature branch from `main`
2. Write tests (unit + E2E)
3. Update documentation
4. Pass all tests and linting
5. Request code review

---

## 📄 License

CC BY-NC 4.0 License - See root LICENSE file

---

**Frontend Version**: 1.0.0
**React**: 18.3.1
**Vite**: 5.4.11
**TypeScript**: 5.7.3
**Last Updated**: March 2026
