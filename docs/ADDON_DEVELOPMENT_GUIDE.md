# OpenTYME Addon Development Guide

This guide will help you create your own addon for OpenTYME using the addon boilerplate.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Creating Your First Addon](#creating-your-first-addon)
4. [Backend Development](#backend-development)
5. [Frontend Development](#frontend-development)
6. [Plugin Settings](#plugin-settings)
7. [Slot System](#slot-system)
8. [Testing](#testing)
9. [Publishing](#publishing)
10. [Best Practices](#best-practices)

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git
- Access to an OpenTYME instance for testing

### Quick Start

1. **Clone the boilerplate**
   ```bash
   git clone https://github.com/your-org/opentyme-addon-boilerplate.git my-addon
   cd my-addon
   ```

2. **Run the setup wizard**
   ```bash
   ./setup.sh
   ```
   
   This interactive wizard will:
   - Set your addon name and description
   - Configure author information
   - Update all template files
   - Initialize git repository

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start developing!**
   ```bash
   # Run type checking
   npm run type-check
   
   # Run tests
   npm test
   
   # Run linter
   npm run lint
   ```

## Project Structure

```
my-addon/
├── addon-manifest.json      # Plugin metadata and configuration
├── package.json              # NPM package configuration
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest test configuration
├── .eslintrc.json            # ESLint configuration
├── README.md                 # Your addon's documentation
├── CONTRIBUTING.md           # Contribution guidelines
├── backend/                  # Backend code
│   ├── src/
│   │   └── index.ts         # Backend entry point
│   ├── types/
│   │   └── index.ts         # Type definitions
│   ├── utils/
│   │   └── settings-helper.ts  # Settings utilities
│   └── tests/
│       └── plugin.test.ts   # Backend tests
├── frontend/                 # Frontend code
│   ├── src/
│   │   └── index.tsx        # Frontend entry point
│   ├── hooks/
│   │   └── usePluginSettings.ts  # Settings hook
│   ├── types/
│   │   └── index.ts         # Type definitions
│   └── tests/
│       └── Plugin.test.tsx  # Frontend tests
└── __mocks__/               # Jest mocks
```

## Creating Your First Addon

### 1. Define Your Addon Manifest

Edit `addon-manifest.json`:

```json
{
  "name": "my-awesome-addon",
  "version": "1.0.0",
  "displayName": "My Awesome Addon",
  "description": "Adds awesome features to OpenTYME",
  "author": "Your Name",
  "license": "MIT",
  "compatibility": { "opentyme": ">=1.0.0" },
  "backend": {
    "entryPoint": "index.ts",
    "routes": {
      "prefix": "/api/plugins/my-awesome-addon",
      "file": "index.ts"
    }
  },
  "frontend": {
    "entryPoint": "index.ts",
    "slots": [
      { "name": "expense-form-actions", "component": "components/MyButton.tsx", "order": 10 }
    ]
  },
  "settings": {
    "schema": {
      "enabled": { "type": "boolean", "default": true, "label": "Enable Addon", "description": "Master switch" },
      "apiKey": { "type": "string", "default": "", "secret": true, "label": "API Key", "description": "Your API key" }
    },
    "ui": { "section": "My Awesome Addon", "icon": "Settings" }
  }
}
```

### 2. Implement Backend Logic

Edit `backend/src/index.ts`:

```typescript
import { Router } from 'express';
import type { AddonPlugin, PluginContext } from '../types';

const router = Router();

const plugin: AddonPlugin = {
  name: 'my-awesome-addon',

  async initialize(context: PluginContext): Promise<void> {
    const { database: db, logger } = context;

    // Define your API endpoints
    router.get('/data', async (req, res) => {
      try {
        const userId = (req as any).user?.userId;

        const result = await db.query(
          'SELECT * FROM my_table WHERE user_id = $1',
          [userId]
        );

        res.json({ data: result.rows });
      } catch (error) {
        logger.error('Error fetching data:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    router.post('/action', async (req, res) => {
      // Handle POST request
    });
  },

  routes: router,
};

export default plugin;
```

### 3. Implement Frontend Components

Edit `frontend/src/index.ts` (note: `.ts`, not `.tsx` — use `React.createElement` for JSX-free files):

```typescript
import MyButton from './components/MyButton';
import type { AddonFrontendPlugin } from './types';

const plugin: AddonFrontendPlugin = {
  name: 'my-awesome-addon',

  // Optional: register pages accessible via the Addons nav dropdown
  routes: [
    {
      path: '/addons/my-addon',
      component: MyPage,
      protected: true,
      menuItem: { label: 'My Addon', icon: '⚡', section: 'tools', order: 10 },
    },
  ],

  // Register slot components (keyed by slot name → component)
  slots: {
    'expense-form-actions': MyButton,
  },

  async initialize(): Promise<void> {
    console.log('[My Addon] Frontend initialized');
  },
};

export default plugin;
```

#### Settings tab addon (special pattern)

To add a tab to the Config page (`/config/:tab`), register a `settings-tabs` slot component and attach a static `tabMeta`:

```tsx
// components/MySettingsTab.tsx
const MySettingsTab: React.FC<{ context: { activeTab: string } }> = ({ context }) => {
  if (context.activeTab !== 'my-addon-settings') return null;
  return <div>My settings UI here</div>;
};

// Required — the AdminPage reads this to add the tab button
(MySettingsTab as any).tabMeta = {
  id: 'my-addon-settings',
  label: 'My Addon',
  icon: '⚡',
};

export default MySettingsTab;
```

Then register it in `index.ts`:
```typescript
slots: { 'settings-tabs': MySettingsTab },
```

## Backend Development

### Database Access

```typescript
// Using the database pool from context
const { db } = context;

// Query
const result = await db.query('SELECT * FROM table WHERE id = $1', [id]);

// Transaction
await db.query('BEGIN');
try {
  await db.query('INSERT INTO table VALUES ($1)', [value]);
  await db.query('COMMIT');
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
}
```

### Using Settings Helper

```typescript
import { SettingsHelper } from '../utils/settings-helper';

// Get user settings
const settings = await SettingsHelper.getUserSettings(userId, 'my-addon');

// Check if enabled
const isEnabled = await SettingsHelper.isEnabled(userId, 'my-addon');

// Get specific config value
const apiKey = await SettingsHelper.getConfig(userId, 'my-addon', 'apiKey');
```

### Logging

```typescript
const { logger } = context;

logger.info('Operation started');
logger.error('Operation failed:', error);
logger.debug('Debug information', { data });
```

## Frontend Development

### Using Plugin Settings Hook

```typescript
import { usePluginSettings } from '../hooks/usePluginSettings';

function MyComponent() {
  const {
    data: settings,
    isLoading,
    error,
    updateSettings,
  } = usePluginSettings('my-addon');

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading settings</div>;

  return (
    <div>
      <pre>{JSON.stringify(settings, null, 2)}</pre>
      <button onClick={() => updateSettings({ enabled: true })}>
        Enable
      </button>
    </div>
  );
}
```

### API Calls

```typescript
// Use fetch or axios
const response = await fetch('/api/plugins/my-addon/data', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
```

## Slot System

### Available Slots

| Slot Name | Location | Context passed to component |
|-----------|----------|-----------------------------|
| `expense-form-actions` | Bottom of Add Expense modal | `{ setDescription, setAmount, setCurrency, setCategory, setExpenseDate, setNotes }` |
| `expense-detail-actions` | Bottom of Expense Detail modal | `{ expense, onExpenseUpdated, isEditing }` |
| `dashboard-widgets` | Bottom of Dashboard (after Recent Invoices) | `{ metrics }` |
| `settings-tabs` | Admin config tab area (`/config/:tab`) | `{ activeTab }` — component must also export static `.tabMeta = { id, label, icon }` |
| `email-template-builder` | Email Template Builder — Code tab | `{ templateId?, mjmlContent, setMjmlContent, onSave? }` — replaces the core textarea editor |

### Registering Slot Components

Slot components are registered as a flat map of `slotName → Component` in the plugin's `slots` object:

```typescript
const plugin: AddonFrontendPlugin = {
  name: 'my-addon',
  slots: {
    'expense-form-actions': MyActionButton,
    'dashboard-widgets': MyWidget,
  },
};
```

Slot ordering is defined in the addon manifest (`addon-manifest.json`) under `frontend.slots`:

```json
"frontend": {
  "slots": [
    { "name": "expense-form-actions", "component": "components/MyButton.tsx", "order": 10 },
    { "name": "dashboard-widgets",    "component": "components/MyWidget.tsx", "order": 5  }
  ]
}
```

### Creating Slot-Compatible Components

```typescript
interface SlotComponentProps {
  context: {
    expense?: Expense;
    // Other context data
  };
}

const MyActionButton: React.FC<SlotComponentProps> = ({ context }) => {
  const { expense } = context;

  return (
    <button
      onClick={() => handleAction(expense)}
      className="px-3 py-1 bg-blue-600 text-white rounded"
    >
      My Action
    </button>
  );
};
```

## Plugin Settings

### Schema Definition

Define settings schema in `addon-manifest.json`:

```json
{
  "settings": {
    "enabled": true,
    "apiKey": "",
    "threshold": 100,
    "options": {
      "autoAnalyze": true,
      "notifications": false
    }
  },
  "settingsSchema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "title": "Enable Plugin",
        "default": true
      },
      "apiKey": {
        "type": "string",
        "title": "API Key",
        "description": "Your API key for the service"
      },
      "threshold": {
        "type": "number",
        "title": "Threshold",
        "minimum": 0,
        "maximum": 1000
      }
    }
  }
}
```

### Accessing Settings

Backend:
```typescript
const settings = await SettingsHelper.getUserSettings(userId, 'my-addon');
console.log(settings.apiKey);
```

Frontend:
```typescript
const { data: settings } = usePluginSettings('my-addon');
console.log(settings.apiKey);
```

## Testing

### Backend Tests

```typescript
describe('My Addon Backend', () => {
  it('should handle API request', async () => {
    const req = mockRequest({ user: { userId: '123' } });
    const res = mockResponse();
    
    await myController.handleRequest(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Array) })
    );
  });
});
```

### Frontend Tests

```typescript
describe('MyComponent', () => {
  it('should render and update settings', async () => {
    render(<MyComponent />, { wrapper: createWrapper() });
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test:watch

# With coverage
npm test:coverage
```

## Publishing

### 1. Prepare for Release

```bash
# Validate everything
npm run validate

# Update version
npm version patch  # or minor, or major

# Push changes
git push origin main --tags
```

### 2. Publish to GitHub

Create a release on GitHub with your version tag.

### 3. Add to OpenTYME

Users can add your addon in `addons.config.json`:

```json
{
  "addons": [
    {
      "name": "my-awesome-addon",
      "source": "github",
      "repo": "your-org/my-awesome-addon",
      "version": "v1.0.0"
    }
  ]
}
```

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed:', error);
  return res.status(500).json({ 
    error: 'Operation failed',
    message: error.message 
  });
}
```

### 2. Type Safety

Use TypeScript for everything:

```typescript
interface MyData {
  id: string;
  value: number;
}

async function getData(): Promise<MyData[]> {
  // Implementation
}
```

### 3. Performance

- Cache expensive operations
- Use database indexes
- Avoid N+1 queries
- Debounce user input

### 4. Security

- Validate all user input
- Use parameterized queries
- Check user permissions
- Sanitize output

### 5. Documentation

- Write clear README
- Add JSDoc comments
- Include usage examples
- Document breaking changes

---

## Getting Help

- **Documentation**: https://docs.opentyme.dev
- **GitHub Issues**: https://github.com/your-org/my-addon/issues
- **Community**: Join our Discord server

Happy coding! 🚀
