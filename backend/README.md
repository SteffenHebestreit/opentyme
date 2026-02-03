# OpenTYME - Backend API

> Node.js + Express + TypeScript backend service with PostgreSQL, Keycloak authentication, and comprehensive business logic.

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── app.ts                      # Express app configuration
│   ├── index.ts                    # Server entry point
│   ├── jest.d.ts                   # Jest type definitions
│   │
│   ├── config/                     # Configuration files
│   │   ├── keycloak.config.ts     # Keycloak session & settings
│   │   └── swagger.config.ts      # API documentation config
│   │
│   ├── constants/                  # Application constants
│   │   └── currencies.ts          # Currency codes and symbols
│   │
│   ├── controllers/                # HTTP request handlers
│   │   ├── analytics/
│   │   │   ├── analytics.controller.ts
│   │   │   └── report.controller.ts
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   └── password-reset.controller.ts
│   │   ├── business/
│   │   │   ├── client.controller.ts
│   │   │   ├── expense.controller.ts
│   │   │   ├── project.controller.ts
│   │   │   └── time-entry.controller.ts
│   │   ├── financial/
│   │   │   ├── invoice.controller.ts
│   │   │   ├── invoice-text-template.controller.ts
│   │   │   ├── payment.controller.ts
│   │   │   └── tax-rate.controller.ts
│   │   └── system/
│   │       └── backup.controller.ts
│   │
│   ├── middleware/                 # Express middleware
│   │   ├── auth/
│   │   │   └── keycloak.middleware.ts
│   │   ├── auth.middleware.ts     # Token validation
│   │   ├── sanitize.middleware.ts # XSS prevention
│   │   └── upload.middleware.ts   # File upload handling
│   │
│   ├── models/                     # TypeScript interfaces
│   │   ├── auth/
│   │   │   └── user.model.ts
│   │   ├── business/
│   │   │   ├── client.model.ts
│   │   │   ├── expense.model.ts
│   │   │   ├── project.model.ts
│   │   │   └── time-entry.model.ts
│   │   └── financial/
│   │       ├── invoice.model.ts
│   │       ├── invoice-text-template.model.ts
│   │       └── tax-rate.model.ts
│   │
│   ├── routes/                     # API route definitions
│   │   ├── index.ts               # Main router
│   │   ├── analytics/
│   │   │   ├── analytics.routes.ts
│   │   │   └── report.routes.ts
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   └── password-reset.routes.ts
│   │   ├── business/
│   │   │   ├── client.routes.ts
│   │   │   ├── expense.routes.ts
│   │   │   ├── project.routes.ts
│   │   │   └── time-entry.routes.ts
│   │   ├── financial/
│   │   │   ├── invoice.routes.ts
│   │   │   ├── invoice-text-template.routes.ts
│   │   │   ├── payment.routes.ts
│   │   │   └── tax-rate.routes.ts
│   │   └── system/
│   │       └── backup.routes.ts
│   │
│   ├── schemas/                    # Joi validation schemas
│   │   ├── business/
│   │   │   └── expense.schema.ts
│   │   └── financial/
│   │       ├── invoice.schema.ts
│   │       ├── invoice-text-template.schema.ts
│   │       ├── payment.schema.ts
│   │       └── tax-rate.schema.ts
│   │
│   ├── services/                   # Business logic layer
│   │   ├── analytics/
│   │   │   ├── analytics.service.ts
│   │   │   └── report.service.ts
│   │   ├── auth/
│   │   │   └── user.service.ts
│   │   ├── business/
│   │   │   ├── client.service.ts
│   │   │   ├── expense.service.ts
│   │   │   ├── project.service.ts
│   │   │   └── time-entry.service.ts
│   │   ├── external/
│   │   │   └── email.service.ts
│   │   ├── financial/
│   │   │   ├── billing-validation.service.ts
│   │   │   ├── invoice.service.ts
│   │   │   ├── invoice-text-template.service.ts
│   │   │   └── tax-rate.service.ts
│   │   ├── storage/
│   │   │   └── minio.service.ts
│   │   └── keycloak.service.ts    # Keycloak integration
│   │
│   ├── types/                      # Custom TypeScript types
│   │   └── express.d.ts           # Express type augmentation
│   │
│   └── utils/                      # Utility functions
│       ├── database.ts            # PostgreSQL connection
│       └── logger.ts              # Winston logger
│
├── tests/                          # Test suites
│   ├── setup.ts                   # Global test setup
│   ├── helpers/
│   │   └── test-db.ts            # Test database utilities
│   ├── unit/                      # Unit tests
│   │   ├── client.service.test.ts
│   │   ├── expense.service.test.ts
│   │   ├── invoice.service.test.ts
│   │   ├── project.service.test.ts
│   │   ├── settings.service.test.ts
│   │   ├── tax-rate.service.test.ts
│   │   ├── time-entry.service.test.ts
│   │   └── user.service.test.ts
│   └── integration/               # Integration tests
│       └── auth.test.ts
│
├── dist/                           # Compiled JavaScript output
├── .dockerignore                   # Docker ignore patterns
├── .env                            # Environment variables (local)
├── .env.example                    # Environment template
├── .env.production                 # Production environment
├── Dockerfile                      # Production Docker image
├── jest.config.js                  # Jest test configuration
├── nodemon.json                    # Nodemon configuration
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
└── README.md                       # This file
```

---

## 🏗️ Architecture Patterns

### Layered Architecture

The backend follows a clean layered architecture:

```
HTTP Request
    ↓
Routes (src/routes/)           # Endpoint definitions
    ↓
Middleware (src/middleware/)   # Auth, validation, sanitization
    ↓
Controllers (src/controllers/) # Request/response handling
    ↓
Services (src/services/)       # Business logic
    ↓
Database (utils/database.ts)   # Data persistence
```

### Key Design Patterns

1. **Repository Pattern**: Services encapsulate database operations
2. **Dependency Injection**: Controllers receive service instances
3. **Middleware Chain**: Request processing pipeline
4. **DTO Pattern**: Type-safe data transfer objects (models/)
5. **Singleton Pattern**: Database connection pool, Keycloak service

### Multi-Tenant Data Isolation

All database tables include `user_id` (Keycloak UUID):
- Every query filters by `req.user.id`
- Complete data isolation between users
- No cross-user data access possible

---

## 🔐 Authentication & Authorization

### Keycloak Integration

The backend uses **Keycloak** for enterprise-grade authentication:

- **Token Validation**: JWT tokens validated on every request
- **User Management**: CRUD operations via Keycloak Admin API
- **Role-Based Access**: Admin and user roles
- **SSO Support**: Enterprise single sign-on

### Middleware Flow

```typescript
// 1. Token extraction
Authorization: Bearer <token>

// 2. Token validation (auth.middleware.ts)
keycloakService.verifyToken(token)

// 3. User info attached to request
req.user = {
  id: "uuid",
  username: "user@example.com",
  roles: ["user"]
}

// 4. Controller access
const userId = req.user.id;
```

---

## 📊 Database Access

### Connection Management

```typescript
// utils/database.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const getDbClient = () => pool;
```

### Query Pattern

```typescript
// Services use parameterized queries
const result = await db.query(
  'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
  [clientId, userId]
);
```

**Benefits:**
- ✅ SQL injection prevention
- ✅ Query plan caching
- ✅ Type safety with parameters

---

## 🛠️ Services Overview

### Authentication Services

- **`auth/user.service.ts`**: User CRUD, password hashing, token generation
- **`keycloak.service.ts`**: Keycloak Admin API integration, token validation

### Business Services

- **`business/client.service.ts`**: Client management
- **`business/project.service.ts`**: Project CRUD and status tracking
- **`business/time-entry.service.ts`**: Time tracking with timer support
- **`business/expense.service.ts`**: Expense tracking with receipt support

### Financial Services

- **`financial/invoice.service.ts`**: Invoice generation, PDF export
- **`financial/tax-rate.service.ts`**: Tax rate configuration
- **`financial/invoice-text-template.service.ts`**: Template management
- **`financial/billing-validation.service.ts`**: Payment validation logic

### External Services

- **`external/email.service.ts`**: Email notifications (SMTP)
- **`storage/minio.service.ts`**: Object storage (S3-compatible)

### System Services

- **`analytics/analytics.service.ts`**: Business metrics and reports
- **`analytics/report.service.ts`**: German tax reports (VAT, EÜR) and financial reporting
  - VAT Report (Umsatzsteuervoranmeldung) - Quarterly VAT pre-registration
  - Income/Expense Report (EÜR) - Einnahmen-Überschuss-Rechnung for tax declaration
  - Invoice Report - Comprehensive invoice listing with payment status
  - Expense Report - Expense analysis by category and tax rate
  - Time Tracking Report - Billable hours with revenue calculation
  - Client Revenue Report - Per-client revenue breakdown

---

## 🔍 Request Validation

### Joi Schema Validation

All endpoints use Joi schemas for input validation:

```typescript
// schemas/business/expense.schema.ts
export const createExpenseSchema = Joi.object({
  project_id: Joi.string().uuid().optional(),
  category: Joi.string().required(),
  description: Joi.string().required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).default('EUR'),
  expense_date: Joi.date().iso().required(),
  is_billable: Joi.boolean().default(false),
  // ...
});
```

**Benefits:**
- Clear validation rules
- Automatic error messages
- Type coercion
- Default values

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm test -- --watch

# Run specific test
npm test -- client.service

# Debug tests
npm test -- --verbose
```

### Test Structure

```typescript
// tests/unit/client.service.test.ts
describe('ClientService', () => {
  let clientService: ClientService;
  
  beforeAll(() => {
    clientService = new ClientService();
  });

  describe('create', () => {
    it('should create a new client', async () => {
      const client = await clientService.create({
        user_id: TEST_USER_ID,
        name: 'Test Client',
        email: 'test@example.com',
      });
      
      expect(client.id).toBeDefined();
      expect(client.name).toBe('Test Client');
    });
  });
});
```

### Test Database

Tests use a dedicated PostgreSQL database:
- Isolated from development data
- Migrations applied automatically
- Global test user persists across tests
- Test data cleaned after each test

---

## 📝 API Documentation

### Swagger/OpenAPI

Interactive API documentation available at:
- **Development**: `http://localhost:8000/api-docs`
- **JSON Spec**: `http://localhost:8000/api-docs.json`

### JSDoc Comments

All services and controllers include comprehensive JSDoc:

```typescript
/**
 * Creates a new client with validated data.
 * Enforces uniqueness and associates with current user.
 * 
 * @async
 * @param {CreateClientDto} clientData - Client creation data
 * @returns {Promise<Client>} The created client
 * @throws {Error} If creation fails or validation error
 * 
 * @example
 * const client = await clientService.create({
 *   user_id: userId,
 *   name: 'Acme Corp',
 *   email: 'contact@acme.com'
 * });
 */
async create(clientData: CreateClientDto): Promise<Client>
```

---

## 🚀 Development

### Prerequisites

- Node.js 18+
- PostgreSQL 17
- Redis (for sessions)
- Keycloak (for auth)

### Local Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your settings

# Run database migrations
# (handled automatically by init.sql in docker-compose)

# Start development server
npm run dev

# Server runs on http://localhost:8000
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/opentyme

# Server
NODE_ENV=development
PORT=8000

# Security
JWT_SECRET=your-jwt-secret
BACKEND_SECRET_KEY=your-backend-secret

# Keycloak
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=opentyme
KEYCLOAK_CLIENT_ID=opentyme-app
KEYCLOAK_CLIENT_SECRET=your-client-secret
KEYCLOAK_ADMIN_CLIENT_ID=opentyme-admin-service
KEYCLOAK_ADMIN_CLIENT_SECRET=your-admin-secret

# Email (MailHog for dev)
SMTP_HOST=mailhog
SMTP_PORT=1025

# MinIO Object Storage
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=receipts
```

---

## 📦 Build & Deploy

### Production Build

```bash
# Compile TypeScript
npm run build

# Output in dist/ directory
node dist/index.js
```

### Docker Deployment

```bash
# Build image
docker build -t opentyme-backend .

# Run container
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  opentyme-backend
```

### Health Checks

- **Basic**: `GET /health`
- **Detailed**: `GET /api/health`

```json
{
  "status": "ok",
  "timestamp": "2025-10-17T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

---

## 🔧 Configuration

### TypeScript Configuration

- **Target**: ES2020
- **Module**: CommonJS
- **Strict Mode**: Enabled
- **Source Maps**: Enabled
- **Incremental Compilation**: Enabled

### Nodemon Configuration

Hot-reload settings:
- Watch: `src/**/*.ts`
- Ignore: `tests/`, `dist/`
- Exec: `ts-node src/index.ts`

---

## 🐛 Debugging

### VS Code Debug Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "runtimeArgs": ["-r", "ts-node/register"],
  "args": ["src/index.ts"],
  "env": {
    "NODE_ENV": "development"
  }
}
```

### Logging

Winston logger with levels:
- `error`: Critical failures
- `warn`: Important issues
- `info`: General information
- `debug`: Development details

```typescript
import { logger } from './utils/logger';

logger.info('Server started', { port: 8000 });
logger.error('Database connection failed', { error });
```

---

## 📈 Performance

### Optimization Strategies

1. **Database Connection Pooling** (max 20 connections)
2. **Query Optimization** (indexes on all foreign keys)
3. **Compression Middleware** (gzip responses)
4. **Caching** (Redis for sessions)
5. **Rate Limiting** (configurable per endpoint)

### Monitoring

- Request logging (Morgan)
- Error tracking (Winston)
- Performance metrics (custom middleware)

---

## 🔒 Security

### Implemented Security Measures

- ✅ **Helmet.js**: Security headers
- ✅ **CORS**: Restricted origins
- ✅ **Rate Limiting**: API throttling
- ✅ **Input Sanitization**: XSS prevention
- ✅ **SQL Injection Prevention**: Parameterized queries
- ✅ **JWT Validation**: Token-based auth
- ✅ **Password Hashing**: bcrypt (10 rounds)
- ✅ **Environment Secrets**: Never hardcoded

---

## 🤝 Contributing

### Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Add JSDoc comments
- Write unit tests
- Use async/await (no callbacks)

### Pull Request Process

1. Create feature branch
2. Write tests
3. Update documentation
4. Pass all tests
5. Request review

---

## 📄 License

CC BY-NC 4.0 License - See root LICENSE file

---

**Backend Version**: 1.0.0  
**Node.js**: 18+  
**TypeScript**: 5.1+  
**Last Updated**: October 17, 2025
