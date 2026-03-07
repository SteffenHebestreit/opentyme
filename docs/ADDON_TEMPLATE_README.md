# OpenTYME Addon Template

This is a template repository for creating OpenTYME addons/plugins.

## Quick Start

1. Clone this template repository
2. Update `addon-manifest.json` with your addon details
3. Implement your backend services, routes, and controllers
4. Implement your frontend components and pages
5. Test locally by adding to `addons.config.json` in the main OpenTYME project
6. Publish your addon repository

## Structure

```
addon-template/
├── addon-manifest.json          # Addon metadata and configuration
├── README.md                    # This file
├── LICENSE                      # Your chosen license
├── .gitignore                   # Git ignore rules
│
├── backend/                     # Backend code (Node.js/Express/TypeScript)
│   ├── index.ts                 # Backend entry point
│   ├── routes/
│   │   └── index.ts             # Route definitions
│   ├── controllers/
│   │   └── example.controller.ts
│   ├── services/
│   │   └── example.service.ts
│   ├── types/
│   │   └── index.ts
│   └── migrations/
│       └── .gitkeep
│
├── frontend/                    # Frontend code (React/TypeScript)
│   ├── index.ts                 # Frontend entry point
│   ├── components/
│   │   └── ExampleButton.tsx    # Slot component example
│   ├── pages/
│   │   └── ExamplePage.tsx      # Route page example
│   ├── services/
│   │   └── example.service.ts
│   └── types/
│       └── index.ts
│
└── tests/                       # Tests
    ├── backend/
    │   └── example.test.ts
    └── frontend/
        └── Example.test.tsx
```

## Addon Manifest

The `addon-manifest.json` file defines your addon's metadata, requirements, and integration points.

### Required Fields

- `name`: Unique identifier (kebab-case, e.g., "my-awesome-addon")
- `displayName`: Human-readable name
- `version`: Semantic version (e.g., "1.0.0")
- `description`: Brief description of functionality
- `author`: Your name or organization
- `compatibility.opentyme`: Compatible OpenTYME version range

### Backend Configuration

Define backend routes, services, migrations, and dependencies:

```json
"backend": {
  "entryPoint": "index.ts",
  "routes": {
    "prefix": "/api/addons/my-addon",
    "file": "routes/index.ts"
  },
  "services": ["services/example.service.ts"],
  "migrations": ["migrations/001_initial.sql"],
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

### Frontend Configuration

Define frontend routes and slot components:

```json
"frontend": {
  "entryPoint": "index.ts",
  "routes": [{
    "path": "/my-addon",
    "component": "pages/ExamplePage.tsx",
    "protected": true,
    "menuItem": {
      "label": "My Addon",
      "icon": "Sparkles",
      "section": "tools"
    }
  }],
  "slots": [{
    "name": "expense-form-actions",
    "component": "components/ExampleButton.tsx",
    "order": 10
  }]
}
```

### Settings Configuration

Define user-configurable settings:

```json
"settings": {
  "schema": {
    "enabled": { "type": "boolean", "default": false },
    "apiKey": { "type": "string", "secret": true },
    "timeout": { "type": "number", "default": 5000 }
  },
  "ui": {
    "section": "My Addon Settings",
    "icon": "Settings"
  }
}
```

## Backend Development

### Entry Point (backend/index.ts)

The backend entry point exports an `AddonPlugin` object:

```typescript
import { AddonPlugin } from '@opentyme/plugin-types';
import routes from './routes';
import { ExampleService } from './services/example.service';

export const plugin: AddonPlugin = {
  name: 'example-addon',
  
  async initialize(context) {
    // Called once on app startup
    console.log('Example addon initializing...');
    await ExampleService.initialize();
  },
  
  routes,
  
  async onUserInit(userId: string) {
    // Called when user accesses addon features
    console.log(`Initializing for user: ${userId}`);
  },
  
  async shutdown() {
    // Called on app shutdown
    await ExampleService.cleanup();
  }
};

export default plugin;
```

### Routes (backend/routes/index.ts)

Define Express routes:

```typescript
import { Router } from 'express';
import { ExampleController } from '../controllers/example.controller';
import { authenticateKeycloak, extractKeycloakUser } from '@opentyme/middleware';

const router = Router();
const controller = new ExampleController();

// Apply authentication
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

// Define routes
router.get('/data', controller.getData);
router.post('/action', controller.performAction);

export default router;
```

### Services

Services contain business logic:

```typescript
export class ExampleService {
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async doSomething(): Promise<any> {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    // Your logic here
  }
}

export const exampleService = new ExampleService();
```

## Frontend Development

### Entry Point (frontend/index.ts)

The frontend entry point exports an `AddonFrontendPlugin` object:

```typescript
import { AddonFrontendPlugin } from '@opentyme/plugin-types';
import ExamplePage from './pages/ExamplePage';
import ExampleButton from './components/ExampleButton';

export const plugin: AddonFrontendPlugin = {
  name: 'example-addon',
  
  routes: [{
    path: '/example',
    component: ExamplePage,
    protected: true
  }],
  
  slots: {
    'expense-form-actions': ExampleButton
  },
  
  async initialize() {
    console.log('Frontend addon initialized');
  }
};

export default plugin;
```

### Slot Components

Components that inject into predefined slots:

```tsx
import React from 'react';

interface SlotProps {
  // Context passed from the slot location
  expense?: any;
  onUpdate?: (data: any) => void;
}

const ExampleButton: React.FC<SlotProps> = ({ expense, onUpdate }) => {
  const handleClick = () => {
    // Use the context
    console.log('Expense:', expense);
    onUpdate?.({ updated: true });
  };

  return (
    <button onClick={handleClick}>
      Example Action
    </button>
  );
};

export default ExampleButton;
```

## Available Slots

OpenTYME provides the following injection points:

| Slot Name | Location | Context passed to component |
|-----------|----------|-----------------------------|
| `expense-form-actions` | Bottom of Add Expense modal | `{ setDescription, setAmount, setCurrency, setCategory, setExpenseDate, setNotes }` |
| `expense-detail-actions` | Bottom of Expense Detail modal | `{ expense, onExpenseUpdated, isEditing }` |
| `dashboard-widgets` | Bottom of Dashboard (after Recent Invoices) | `{ metrics }` |
| `settings-tabs` | Admin config tab area (`/config/:tab`) | `{ activeTab }` — component must also export static `.tabMeta = { id, label, icon }` |
| `email-template-builder` | Email Template Builder — Code tab | `{ templateId?, mjmlContent, setMjmlContent, onSave? }` — replaces the core textarea editor |

## Testing Locally

1. Add your addon to the main project's `addons.config.json`:

```json
{
  "addons": [
    {
      "name": "my-addon",
      "enabled": true,
      "source": {
        "type": "local",
        "path": "../path/to/my-addon"
      }
    }
  ]
}
```

2. Run the installation script:

```bash
./scripts/install-addons.sh
```

3. Restart the OpenTYME backend and frontend

## Publishing

1. Create a GitHub repository for your addon
2. Push your code
3. Create a release with a version tag (e.g., `v1.0.0`)
4. Share the repository URL

Users can then install your addon:

```json
{
  "addons": [
    {
      "name": "my-addon",
      "enabled": true,
      "source": {
        "type": "github",
        "repo": "username/my-addon",
        "ref": "v1.0.0"
      }
    }
  ]
}
```

## Best Practices

1. **Version your addon** using semantic versioning
2. **Specify version compatibility** with OpenTYME in the manifest
3. **Document your settings** in the README
4. **Test thoroughly** before publishing
5. **Handle errors gracefully** - don't crash the main app
6. **Clean up resources** in the shutdown hook
7. **Use TypeScript** for better type safety
8. **Follow OpenTYME's code style** for consistency

## Support

For questions or issues with addon development:

- OpenTYME Documentation: [docs link]
- GitHub Issues: [issues link]
- Community Forum: [forum link]

## License

Choose an appropriate license for your addon (MIT, GPL-3.0, etc.)
