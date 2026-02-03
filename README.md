# OpenTYME - Track Your Money & Effort

<div align="center">
  <img src="opentyme_purple.svg" alt="OpenTYME Logo" width="120" height="120"/>
  <br />
  <br />
</div>

[![Status](https://img.shields.io/badge/status-production%20ready-brightgreen)]()
[![Backend Tests](https://img.shields.io/badge/tests-48%2F48%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-blue)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue)]()

> A modern, full-stack application for freelance developers to track time, manage finances, generate invoices, and handle expenses, all with enterprise-grade security via Keycloak SSO.


---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Authentication & Security](#authentication--security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

**OpenTYME (Track Your Money & Effort)** is a comprehensive financial and time management system designed for freelance developers, consultants, and digital nomads. Built with modern technologies and enterprise-grade security, it provides everything you need to track billable time, manage client relationships, generate professional invoices, and track business expenses.

### Why OpenTYME?

- **Enterprise Authentication**: Keycloak SSO with OAuth 2.0/OIDC
- **Complete Multi-Tenancy**: Full data isolation per user
- **Modern Stack**: React 18, TypeScript, Node.js, PostgreSQL
- **Production Ready**: Docker containerization with Traefik reverse proxy
- **Expense Tracking**: Track business expenses with receipt upload support
- **Comprehensive Testing**: 48+ unit tests, E2E tests with Playwright
- **Professional Invoicing**: Generate PDF invoices with customizable templates

---

## ✨ Key Features

### 🕐 Time & Effort Tracking
- Start/stop/pause timer for real-time tracking
- Manual time entry with duration calculation
- Associate time with projects and tasks
- Billable vs non-billable tracking
- Tag-based categorization
- Recurring project payments (monthly retainers)

### 👥 Client Management
- Complete client profiles with contact information
- Multiple projects per client
- Client status tracking (active/inactive)
- Client-specific notes and tax IDs

### 📊 Financial Organization
- Create and manage multiple projects
- Set hourly rates per project
- Project status tracking (active, completed, on-hold, cancelled)
- Budget tracking and deadline management
- Multi-currency support (EUR default)

### 💰 Invoice Generation
- Automatic invoice generation from time entries
- Manual invoice creation with line items
- Customizable tax rates (19%, 7%, or custom)
- Invoice status tracking (draft, sent, paid, overdue)
- Sequential invoice numbering
- Professional PDF export with company branding
- ZUGFeRD/Factur-X e-invoice support (EN 16931 standard)
- Payment tracking with partial payment support

### 💳 Payment Management
- Record payments against invoices
- Partial payment support
- Track payment methods and transaction IDs
- Payment/refund type distinction
- Automatic invoice status updates

### 💸 Expense Tracking
- Track project and general business expenses
- **Tax breakdown tracking** (net amount, tax rate, tax amount) for tax declaration
- Receipt upload support (MinIO object storage)
- Expense categories and tagging
- Billable vs reimbursable expense tracking
- Approval workflow (pending, approved, rejected, reimbursed)
- Receipt metadata (size, MIME type)
- German tax rates supported: 0%, 7% (reduced), 19% (standard VAT)
- **Asset depreciation (AfA)** - German tax law compliant depreciation schedules
  - Linear depreciation calculation
  - Multi-year depreciation tracking
  - Annual depreciation amounts for tax declaration

### 📊 Reports & Analytics
- **VAT Report (Umsatzsteuervoranmeldung)** - Quarterly VAT pre-registration for German tax authority
  - Revenue VAT (Umsatzsteuer) vs Input VAT (Vorsteuer)
  - Tax liability calculation (Zahllast/Erstattung)
  - Breakdown by tax rate (19%, 7%, tax-free)
- **Income/Expense Report (EÜR)** - Einnahmen-Überschuss-Rechnung for annual tax declaration
  - Business income and expenses categorization
  - Profit/loss calculation
  - Tax rate breakdown
- **Invoice Report** - Comprehensive invoice listing with payment status
- **Expense Report** - Expense analysis by category and tax rate
- **Time Tracking Report** - Billable hours with revenue calculation
- **Client Revenue Report** - Per-client revenue breakdown
- Export to PDF, CSV, Excel (XLSX), and JSON
- On-the-fly report generation (no storage required)
- Custom date range selection with quick presets
- Full bilingual support (English/German)

### 📈 Financial Dashboard
- Yearly financial summary with profit/loss
- Revenue by client visualization
- Project profitability charts
- Billable hours ratio tracking
- Depreciation schedule overview (AfA)
- Tax prepayments tracking (VAT & income tax)
- Recent invoices and time entries widgets

### ⚙️ Administration
- User settings and preferences
- Company information and branding
- Tax rate configuration
- Invoice text templates (header, footer, terms)
- Currency and timezone settings
- AI-powered expense extraction settings (optional)

### 🔧 System Administration
- Scheduled backup system with cron expressions
- Manual backup creation and restore
- Backup retention policy configuration
- Comprehensive backup (PostgreSQL + Keycloak + MinIO)
- Backup history and status tracking

### 🎨 User Interface
- Modern, responsive design with TailwindCSS
- Dark/Light theme toggle
- Intuitive navigation and breadcrumbs
- Real-time form validation
- Toast notifications for user feedback
- Mobile-friendly interface

### 🔐 Security
- Keycloak SSO authentication
- Role-based access control (RBAC)
- JWT token-based authorization
- Automatic token refresh (5 min before expiry)
- Complete multi-tenant data isolation
- Input sanitization and XSS prevention
- SQL injection protection via parameterized queries

### 🤖 AI Integration (Optional)
- **Receipt OCR & Extraction** - Extract expense data from uploaded PDFs (vendor, amount, date, tax rate)
- **Depreciation Research** - AI-assisted lookup of German AfA tables and useful life periods
- **Web Research** - DuckDuckGo MCP integration for researching tax regulations and asset categories
- **MCP Server Integration** - Model Context Protocol for extensible AI tool usage
- **LM Studio Support** - Use local AI models for privacy-conscious processing
- **Expense Auto-Fill** - Automatically populate expense forms from receipts
- Disabled by default (`AI_ENABLED=false`)

---

## 🛠️ Technology Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 18.2 | UI library with modern hooks |
| **TypeScript** | 5.0 | Type safety and IDE support |
| **Vite** | 4.4 | Fast build tool with HMR |
| **TailwindCSS** | 3.3 | Utility-first CSS framework |
| **React Router** | 6.14 | Client-side routing |
| **React Hook Form** | 7.45 | Efficient form management |
| **Axios** | 1.4 | HTTP client with interceptors |
| **Keycloak JS** | 26.2 | Keycloak integration |
| **Zustand** | 4.3 | Lightweight state management |
| **Chart.js** | 4.5 | Data visualization |
| **Lucide React** | 0.263 | Modern icon library |
| **Playwright** | 1.48 | E2E testing framework |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 18+ | JavaScript runtime |
| **Express** | 4.18 | Web application framework |
| **TypeScript** | 5.1 | Type safety |
| **PostgreSQL** | 17 | Relational database |
| **node-postgres (pg)** | 8.11 | PostgreSQL client |
| **Keycloak Admin Client** | 25.0 | Keycloak management |
| **Jest** | 29.6 | Testing framework |
| **Joi** | 17.9 | Request validation |
| **PDFKit** | 0.17 | PDF generation |
| **Multer** | 1.4 | File upload handling |
| **MinIO Client** | 8.0 | Object storage client |
| **Redis** | 4.6 | Session cache |
| **Axios** | 1.6 | HTTP client |
| **Helmet** | 7.0 | Security headers |
| **Compression** | 1.7 | Response compression |

### Infrastructure
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Docker** | 24+ | Containerization |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Traefik** | 2.11 | Reverse proxy and load balancer |
| **Keycloak** | 26.0.7 | Identity and access management |
| **PostgreSQL** | 17-alpine | Application database |
| **PostgreSQL** | 17-alpine | Keycloak database (isolated) |
| **Redis** | 7.4-alpine | Session cache |
| **MinIO** | 2024.10 | S3-compatible object storage |
| **MailHog** | 1.0 | Email testing (development) |
| **Nginx** | 1.27-alpine | Static file serving |
| **MCP Server** | FastAPI | AI-powered PDF extraction (optional) |

---

## 🏗️ Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         TRAEFIK                              │
│              (Reverse Proxy & Load Balancer)                 │
│    Routes: /api/* → backend, /* → frontend, /auth → kc      │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴───────────┬──────────────┐
        │                        │              │
        ▼                        ▼              ▼
┌──────────────┐        ┌──────────────┐  ┌──────────────┐
│   FRONTEND   │        │   BACKEND    │  │  KEYCLOAK    │
│              │        │              │  │              │
│ React + Vite │◄──────►│  Node.js     │◄─►│   Auth       │
│  TypeScript  │  REST  │  Express     │  │   Server     │
│  Tailwind    │  API   │  TypeScript  │  │              │
└──────┬───────┘        └──────┬───────┘  └──────┬───────┘
       │                       │                  │
       │                       ├──────────┬───────┼────────┐
       │                       │          │       │        │
       │                       ▼          ▼       ▼        ▼
       │                 ┌──────────┐ ┌──────┐ ┌────┐ ┌──────┐
       │                 │PostgreSQL│ │Redis │ │KC  │ │MinIO │
       │                 │(Main DB) │ │Cache │ │DB  │ │ S3   │
       │                 └──────────┘ └──────┘ └────┘ └──────┘
       └──────────► Authentication Flow (OAuth 2.0 + PKCE)
```

### Multi-Tenant Data Isolation

All tables include a `user_id` column (Keycloak UUID) ensuring complete data isolation:

```
Keycloak User (sub claim)
         ↓
    user_id (UUID)
         ↓
    ┌────┴────┐
    ▼         ▼
clients    settings
    ↓
projects
    ↓
time_entries
    ↓
invoices ← invoice_items ← payments
    ↓
expenses (project-level or general)
```

### Request Flow

```
1. User → Frontend (React)
2. Frontend → Keycloak (OAuth 2.0 login)
3. Keycloak → Frontend (access token)
4. Frontend → Backend (API request + Bearer token)
5. Backend → Keycloak (validate token)
6. Backend → Database (query with user_id filter)
7. Database → Backend (filtered results)
8. Backend → Frontend (JSON response)
```

---

## 📦 Prerequisites

### Required Software

- **Docker** 24.0+ and **Docker Compose** 2.0+
- **Git** for version control
- **Node.js** 18+ (for local development only)
- **PostgreSQL** client (optional, for database access)

### System Requirements

- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: 10GB free space
- **OS**: Linux, macOS, or Windows with WSL2
- **Network**: Internet connection for image pulls

---

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/SteffenHebestreit/opentyme.git
cd opentyme

# Create environment file (optional - defaults work for development)
cp .env.example .env
```

### 2. Configure Local Domains (Required)

OpenTYME uses subdomains for its services (e.g., `auth.localhost` for Keycloak). You need to add these to your hosts file:

**Windows (PowerShell as Administrator):**
```powershell
# Option 1: Run the setup script (auto-detects your local IP)
.\scripts\setup-hosts.bat

# Option 2: Manual - Add these lines to C:\Windows\System32\drivers\etc\hosts
# Replace <YOUR_LOCAL_IP> with your machine's IP (e.g., 192.168.1.100)
# Run 'ipconfig' to find your IPv4 address
# <YOUR_LOCAL_IP>  auth.localhost
# <YOUR_LOCAL_IP>  traefik.localhost
# <YOUR_LOCAL_IP>  mail.localhost
# <YOUR_LOCAL_IP>  minio.localhost
# <YOUR_LOCAL_IP>  s3.localhost
# <YOUR_LOCAL_IP>  mcp.localhost
```

**Linux/macOS:**
```bash
# Option 1: Run the setup script (auto-detects your local IP)
chmod +x scripts/setup-hosts.sh
sudo ./scripts/setup-hosts.sh

# Option 2: Manual - Add these lines to /etc/hosts
# Replace <YOUR_LOCAL_IP> with your machine's IP (e.g., 192.168.1.100)
# Run 'ip addr' or 'ifconfig' to find your IP address
# <YOUR_LOCAL_IP>  auth.localhost
# <YOUR_LOCAL_IP>  traefik.localhost
# <YOUR_LOCAL_IP>  mail.localhost
# <YOUR_LOCAL_IP>  minio.localhost
# <YOUR_LOCAL_IP>  s3.localhost
# <YOUR_LOCAL_IP>  mcp.localhost
```

> **Important**: Do NOT use `127.0.0.1` - Docker containers interpret this as themselves. Use your machine's local network IP address (e.g., `192.168.x.x` or `10.x.x.x`). The setup scripts will auto-detect the correct IP.

### 3. Start All Services

```bash
# Start all containers in detached mode
docker-compose up -d

# Watch logs (optional)
docker-compose logs -f

# Wait for all services to be healthy (~60-90 seconds)
# You'll see "Keycloak realm imported successfully" when ready
```

### 4. Access the Application

Once all services are running:

| Service | URL | Credentials |
|---------|-----|-------------|
| **OpenTYME App** | http://localhost | admin / Admin123! |
| **Backend API** | http://localhost/api | (via token) |
| **Keycloak Admin** | http://auth.localhost | admin / admin |
| **Traefik Dashboard** | http://traefik.localhost | (no auth required) |
| **MailHog** | http://mail.localhost | (no auth required) |
| **MinIO Console** | http://minio.localhost | minioadmin / minioadmin123 |
| **API Documentation** | http://localhost/api/api-docs | (no auth required) |
| **MCP Server** | http://mcp.localhost | (optional, for AI features) |

### 5. First Login

1. Open http://localhost in your browser
2. Click "Login" - you'll be redirected to Keycloak
3. Use the default admin credentials:
   - **Username**: `admin`
   - **Password**: `Admin123!`
4. You'll be redirected back to the application dashboard

### 6. Create Your First Project

1. Navigate to **Clients** and create a new client
2. Navigate to **Projects** and create a project for that client
3. Go to **Time Tracking** and start your first timer
4. When done, go to **Invoices** to generate an invoice

### 7. Enable AI Features (Optional)

OpenTYME includes AI-powered features that enhance productivity:

- **Receipt Extraction** - Automatically extract expense data from uploaded PDFs (vendor, amount, date, tax)
- **Depreciation Research** - AI-assisted lookup of German AfA tables (useful life periods, depreciation methods)
- **Web Research** - DuckDuckGo integration for researching asset categories and tax regulations

These features are **disabled by default** (`AI_ENABLED=false`).

#### Option A: Use Docker Desktop MCP Servers (Recommended)

If you're using Docker Desktop with MCP (Model Context Protocol) servers:

1. **Enable MCP servers in Docker Desktop**:
   - Open Docker Desktop → Settings → Features in Development
   - Enable "Docker MCP Toolkit" or "Enable Docker MCP Server"
   - The DuckDuckGo MCP server provides web research capabilities

2. **Configure the MCP Gateway** in your `.env`:
   ```bash
   AI_ENABLED=true
   ```

3. **Restart services**:
   ```bash
   docker-compose up -d mcp-gateway backend
   ```

4. The `mcp-gateway` service aggregates all Docker Desktop MCP servers, enabling:
   - Web search via DuckDuckGo for depreciation research
   - File processing for receipt extraction
   - Other MCP tools you have enabled

#### Option B: Use the Built-in MCP Server

The project includes a FastAPI-based MCP server for PDF extraction:

1. **Enable AI in your `.env`**:
   ```bash
   AI_ENABLED=true
   
   # Optional: Enable LLM-enhanced OCR
   MCP_ENABLE_LLM=true
   MCP_OPENAI_API_KEY=your-api-key
   MCP_OPENAI_BASE_URL=http://localhost:1234/v1  # For LM Studio
   MCP_OPENAI_MODEL=gpt-4o-mini
   ```

2. **Restart services**:
   ```bash
   docker-compose up -d mcp-server backend
   ```

3. **Verify MCP server**: Visit http://mcp.localhost/api/health

#### Option C: Use LM Studio (Local AI)

For privacy-conscious users who want local AI processing:

1. **Install LM Studio** from https://lmstudio.ai
2. **Download a model** (e.g., Llama 3, Mistral, or Phi-3)
3. **Start the local server** in LM Studio (default: http://localhost:1234)
4. **Configure your `.env`**:
   ```bash
   AI_ENABLED=true
   MCP_ENABLE_LLM=true
   MCP_OPENAI_BASE_URL=http://host.docker.internal:1234/v1
   MCP_OPENAI_MODEL=local-model
   ```

> **Note**: See [docs/AI_FEATURES.md](docs/AI_FEATURES.md) for detailed AI integration documentation.

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root (or use defaults):

```bash
# ============================================
# DATABASE CONFIGURATION
# ============================================
POSTGRES_DB=opentyme_db
POSTGRES_PASSWORD=password

# Keycloak Database (Isolated)
KEYCLOAK_DB=keycloak
KEYCLOAK_DB_USER=keycloak_user
KEYCLOAK_DB_PASSWORD=keycloak_password

# ============================================
# BACKEND CONFIGURATION
# ============================================
NODE_ENV=development
BACKEND_PORT=8000
BACKEND_SECRET_KEY=your-super-secret-key-here
JWT_SECRET=your-jwt-secret-here
DEBUG=true

# ============================================
# KEYCLOAK CONFIGURATION
# ============================================
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KEYCLOAK_PORT=8080
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_PUBLIC_URL=http://auth.localhost
KEYCLOAK_REALM=opentyme
KEYCLOAK_CLIENT_ID=opentyme-app
KEYCLOAK_CLIENT_SECRET=opentyme-secret-change-in-production
KEYCLOAK_ADMIN_CLIENT_ID=opentyme-admin-service
KEYCLOAK_ADMIN_CLIENT_SECRET=admin-service-secret-change-in-production
KEYCLOAK_ENABLED=true

# ============================================
# FRONTEND CONFIGURATION
# ============================================
FRONTEND_PORT=3000
VITE_APP_ENVIRONMENT=development
VITE_API_BASE_URL=http://backend:8000
VITE_API_URL=http://backend:8000
VITE_KEYCLOAK_URL=http://auth.localhost
VITE_KEYCLOAK_REALM=opentyme
VITE_KEYCLOAK_CLIENT_ID=opentyme-frontend
VITE_KEYCLOAK_ENABLED=true

# ============================================
# MINIO (OBJECT STORAGE)
# ============================================
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET=receipts

# ============================================
# EMAIL CONFIGURATION (MailHog for dev)
# ============================================
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@opentyme.local

# ============================================
# PROXY CONFIGURATION
# ============================================
NGINX_PORT=8888
```

### Keycloak Realm Configuration

The Keycloak realm is automatically imported from `keycloak/realm-import.json` on first startup. It includes:

- **Realm**: `opentyme`
- **Clients**:
  - `opentyme-app` - Backend service client (confidential)
  - `opentyme-frontend` - Frontend SPA client (public with PKCE)
  - `opentyme-admin-service` - Admin service client
  - `minio` - MinIO integration
- **Default Users**:
  - `admin` (role: admin)
  - `user` (role: user)
- **Roles**: `admin`, `user`

### Company Settings

After first login, configure your company information:

1. Navigate to **Settings** in the application
2. Fill in:
   - Company Name
   - Company Address
   - Tax ID
   - Email, Phone, Website
   - Invoice Terms
   - Invoice Prefix and Numbering

---

## 🗄️ Database Schema

### Core Tables

The application uses a comprehensive PostgreSQL schema with the following tables:

#### Authentication & Settings
- **settings** - User preferences, company info, invoice configuration

#### Business Management
- **clients** - Client contact information and status
- **projects** - Projects linked to clients with rates and budgets
- **time_entries** - Time tracking with start/end timestamps

#### Financial Management
- **invoices** - Invoice headers with totals and status
- **invoice_items** - Line items for invoices
- **payments** - Payment tracking with partial payment support
- **expenses** - Business expense tracking with **tax breakdown** (net, tax rate, tax amount) and receipt support

#### Configuration
- **tax_rates** - Configurable tax rates per user
- **invoice_text_templates** - Customizable invoice text blocks

#### System
- **system_backups** - Backup operation history and status
- **system_backup_schedule** - Scheduled backup configurations

#### Advanced Features
- **tax_prepayments** - VAT and income tax prepayment tracking
- **expense_depreciation_schedule** - Multi-year asset depreciation (AfA)

### Key Features

- **UUID Primary Keys**: All tables use UUIDs for security
- **User Isolation**: Every table has `user_id` (Keycloak UUID)
- **Soft Deletes**: Status fields instead of hard deletes where appropriate
- **Timestamps**: All tables track `created_at` and `updated_at`
- **Indexes**: Comprehensive indexing for performance
- **Constraints**: Foreign keys, check constraints, unique constraints
- **Triggers**: Automatic timestamp updates
- **Views**: `invoice_details_view` for aggregated data

### Database Initialization

The database is automatically initialized on first startup using `init.sql` which includes:

1. Extension creation (uuid-ossp)
2. All table definitions
3. Indexes for performance
4. Triggers for automatic updates
5. Check constraints for data integrity
6. Comments for documentation
7. Views for complex queries

---

## 📡 API Documentation

### Interactive API Documentation

The backend provides a Swagger/OpenAPI interface:

- **URL**: http://localhost/api/api-docs
- **JSON Spec**: http://localhost/api/api-docs.json

### Authentication

All API endpoints (except `/health` and `/api-docs`) require authentication:

```bash
# Include JWT token in Authorization header
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     http://localhost/api/clients
```

### Core API Endpoints

#### Health Check
```
GET /health                    # Simple health check
GET /api/health                # Detailed health check
```

#### Clients
```
GET    /api/clients            # List all clients (paginated)
POST   /api/clients            # Create new client
GET    /api/clients/:id        # Get client by ID
PUT    /api/clients/:id        # Update client
DELETE /api/clients/:id        # Delete client
```

#### Projects
```
GET    /api/projects           # List all projects
POST   /api/projects           # Create new project
GET    /api/projects/:id       # Get project by ID
PUT    /api/projects/:id       # Update project
DELETE /api/projects/:id       # Delete project
GET    /api/projects/:id/time-entries  # Get project time entries
```

#### Time Entries
```
GET    /api/time-entries       # List all time entries
POST   /api/time-entries       # Create time entry
GET    /api/time-entries/:id   # Get time entry by ID
PUT    /api/time-entries/:id   # Update time entry
DELETE /api/time-entries/:id   # Delete time entry
GET    /api/time-entries/active  # Get active timer
POST   /api/time-entries/start # Start timer
POST   /api/time-entries/stop  # Stop timer
```

#### Invoices
```
GET    /api/invoices           # List all invoices
POST   /api/invoices           # Create invoice manually
GET    /api/invoices/:id       # Get invoice by ID
PUT    /api/invoices/:id       # Update invoice
DELETE /api/invoices/:id       # Delete invoice
GET    /api/invoices/:id/pdf   # Download invoice PDF
POST   /api/invoices/generate  # Generate from time entries
```

#### Payments
```
GET    /api/payments           # List all payments
POST   /api/payments           # Record payment
GET    /api/payments/:id       # Get payment by ID
PUT    /api/payments/:id       # Update payment
DELETE /api/payments/:id       # Delete payment
```

#### Expenses
```
GET    /api/expenses           # List all expenses
POST   /api/expenses           # Create expense
GET    /api/expenses/:id       # Get expense by ID
PUT    /api/expenses/:id       # Update expense
DELETE /api/expenses/:id       # Delete expense
POST   /api/expenses/:id/receipt  # Upload receipt
```

#### Reports
```
GET    /api/reports/vat                  # Generate VAT report (Umsatzsteuervoranmeldung)
GET    /api/reports/income-expense       # Generate EÜR (Income/Expense report)
GET    /api/reports/invoices             # Generate invoice report
GET    /api/reports/expenses             # Generate expense report
GET    /api/reports/time-tracking        # Generate time tracking report
GET    /api/reports/client-revenue       # Generate client revenue report
```

#### Admin - Tax Rates
```
GET    /api/admin/tax-rates    # List tax rates
POST   /api/admin/tax-rates    # Create tax rate
GET    /api/admin/tax-rates/:id  # Get tax rate
PUT    /api/admin/tax-rates/:id  # Update tax rate
DELETE /api/admin/tax-rates/:id  # Delete tax rate
POST   /api/admin/tax-rates/:id/set-default  # Set as default
```

#### Admin - Invoice Templates
```
GET    /api/admin/invoice-text-templates       # List templates
POST   /api/admin/invoice-text-templates       # Create template
GET    /api/admin/invoice-text-templates/:id   # Get template
PUT    /api/admin/invoice-text-templates/:id   # Update template
DELETE /api/admin/invoice-text-templates/:id   # Delete template
```

#### Settings
```
GET    /api/settings           # Get user settings
POST   /api/settings           # Create/update settings
```

#### System Backups (Admin)
```
GET    /api/system/backups/schedules     # List backup schedules
POST   /api/system/backups/schedules     # Create backup schedule
PUT    /api/system/backups/schedules/:id # Update schedule
DELETE /api/system/backups/schedules/:id # Delete schedule
POST   /api/system/backups               # Create manual backup
POST   /api/system/backups/cleanup       # Cleanup old backups
```

#### Analytics
```
GET    /api/analytics/yearly-summary     # Dashboard financial summary
```

### Request/Response Examples

#### Create Client
```bash
POST /api/clients
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "name": "Acme Corporation",
  "email": "contact@acme.com",
  "phone": "+1-555-0123",
  "address": "123 Main St, City, Country",
  "tax_id": "DE123456789"
}

# Response 201 Created
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "3f68bd45-624d-4059-ae2e-9feb1198da99",
  "name": "Acme Corporation",
  "email": "contact@acme.com",
  "phone": "+1-555-0123",
  "address": "123 Main St, City, Country",
  "tax_id": "DE123456789",
  "is_active": true,
  "created_at": "2025-10-17T10:30:00Z",
  "updated_at": "2025-10-17T10:30:00Z"
}
```

#### Start Timer
```bash
POST /api/time-entries/start
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "project_id": "660e8400-e29b-41d4-a716-446655440000",
  "description": "Working on feature X",
  "task_name": "Feature Implementation"
}

# Response 200 OK
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "user_id": "3f68bd45-624d-4059-ae2e-9feb1198da99",
  "project_id": "660e8400-e29b-41d4-a716-446655440000",
  "description": "Working on feature X",
  "task_name": "Feature Implementation",
  "start_time": "2025-10-17T10:30:00Z",
  "end_time": null,
  "duration": null,
  "is_billable": true,
  "created_at": "2025-10-17T10:30:00Z"
}
```

---

## 🔐 Authentication & Security

### Keycloak OAuth 2.0 Flow

The application uses **OAuth 2.0 Authorization Code Flow with PKCE** for secure authentication:

1. **User initiates login** → Frontend redirects to Keycloak
2. **User authenticates** → Keycloak validates credentials
3. **Keycloak redirects back** → With authorization code
4. **Frontend exchanges code** → For access token (JWT)
5. **Token stored** → In browser's sessionStorage
6. **API requests** → Include Bearer token in Authorization header
7. **Backend validates** → Token with Keycloak before processing
8. **Auto-refresh** → Token refreshed 5 minutes before expiry

### Security Features

#### Authentication
- **Enterprise SSO**: Keycloak-based authentication
- **JWT Tokens**: Cryptographically signed tokens
- **Token Expiration**: 5-minute access tokens, 30-minute refresh tokens
- **Auto Refresh**: Proactive token renewal before expiration
- **Logout**: Proper session cleanup on logout

#### Authorization
- **Role-Based Access Control (RBAC)**: Admin and user roles
- **Multi-Tenant**: Complete data isolation per user
- **Row-Level Security**: All queries filtered by user_id
- **Ownership Validation**: Users can only access their own data

#### Data Protection
- **Input Sanitization**: DOMPurify removes XSS attempts
- **SQL Injection Prevention**: Parameterized queries only
- **CORS Configuration**: Restricted allowed origins
- **Security Headers**: Helmet.js for HTTP security headers
- **HTTPS Ready**: Production SSL/TLS support via Traefik
- **Password Requirements**:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character

#### Infrastructure Security
- **Network Isolation**: Docker bridge network
- **Service Communication**: Internal network only
- **Database Isolation**: Separate Keycloak database
- **Object Storage**: MinIO with Keycloak OIDC integration
- **Rate Limiting**: Configurable API rate limits (disabled in dev)

---

## 🧪 Testing

### Backend Unit Tests

The backend has comprehensive unit test coverage:

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test suite
npm test -- client.service

# Watch mode for development
npm test -- --watch
```

**Test Statistics:**
- ✅ 48/48 tests passing
- 📊 Comprehensive service coverage
- 🧪 Testing frameworks: Jest, Supertest
- 🗄️ Dedicated PostgreSQL test database (Docker)

**Test Structure:**
```
backend/tests/
├── basic.test.ts               # Basic Jest setup verification
├── setup.ts                    # Global test setup
├── helpers/
│   └── test-db.ts             # Database utilities
├── unit/
│   ├── client.service.test.ts
│   ├── project.service.test.ts
│   ├── time-entry.service.test.ts
│   ├── invoice.service.test.ts
│   └── placeholder.test.ts    # Invoice placeholder processing
└── integration/
    └── auth.test.ts
```

### Frontend Unit Tests

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:unit:watch
```

### End-to-End Tests (Playwright)

```bash
# Navigate to frontend directory
cd frontend

# Install Playwright browsers (first time only)
npm run test:ui:install

# Run E2E tests
npm run test:ui

# Run in headed mode (see browser)
npm run test:ui:headed

# Run specific test file
npx playwright test tests/ui/theme-and-nav.spec.ts
```

**E2E Test Coverage:**
- Theme switching (dark/light mode)
- Navigation and routing
- Authentication flows
- Form submissions
- Data creation and updates

### Integration Testing

The project includes a Docker Compose service for running E2E tests:

```bash
# Run UI tests in Docker
docker-compose up frontend-ui-tests

# View test results
cat frontend/playwright-report/index.html
```

---

## 🚢 Deployment

### Development Deployment

Development mode includes hot-reload for both frontend and backend:

```bash
# Start all services
docker-compose up -d

# Watch logs
docker-compose logs -f backend frontend

# Restart after code changes
docker-compose restart backend
docker-compose restart frontend
```

### Production Deployment

#### 1. Environment Configuration

Create a `.env.production` file:

```bash
# Copy and modify for production
cp .env .env.production

# Update critical values:
# - Change all passwords
# - Set NODE_ENV=production
# - Configure production URLs
# - Set secure JWT secrets
# - Enable HTTPS
```

#### 2. Production Build

```bash
# Build production images
docker-compose -f docker-compose.yml build

# Start in production mode
docker-compose -f docker-compose.yml up -d
```

#### 3. SSL/TLS Configuration

Update `traefik/traefik.yml` for Let's Encrypt:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@domain.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web
```

#### 4. Database Backups

Set up automated backups:

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec opentyme-db pg_dump \
  -U postgres opentyme_db \
  > backups/backup_$DATE.sql

# Keep only last 30 days
find backups/ -name "backup_*.sql" -mtime +30 -delete
```

Add to crontab:
```bash
# Daily at 2 AM
0 2 * * * /path/to/backup-script.sh
```

#### 5. Monitoring Setup

Consider adding monitoring services:

```yaml
# Add to docker-compose.yml
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

#### 6. Production Checklist

- [ ] Change all default passwords and secrets
- [ ] Configure SSL/TLS certificates (Let's Encrypt)
- [ ] Set up database backups (daily + offsite)
- [ ] Configure monitoring and alerting
- [ ] Set up log aggregation (ELK stack or similar)
- [ ] Enable rate limiting on API
- [ ] Configure firewall rules
- [ ] Set up CI/CD pipeline
- [ ] Document disaster recovery procedures
- [ ] Test backup restoration
- [ ] Configure SMTP for production emails
- [ ] Set up error tracking (Sentry, etc.)

### Scaling Considerations

#### Horizontal Scaling

```yaml
# Scale backend service
backend:
  deploy:
    replicas: 3
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
```

#### Database Optimization

- Enable PostgreSQL connection pooling
- Add read replicas for heavy loads
- Optimize indexes based on query patterns
- Enable query caching in Redis

#### Load Balancing

Traefik automatically load balances across multiple backend replicas.

---

## 💻 Development

### Local Development Setup

#### Without Docker

```bash
# 1. Install PostgreSQL and Redis locally
brew install postgresql redis  # macOS
sudo apt install postgresql redis-server  # Ubuntu

# 2. Create database
createdb opentyme_db

# 3. Initialize database
psql opentyme_db < init.sql

# 4. Backend setup
cd backend
npm install
npm run dev  # Starts on port 8000

# 5. Frontend setup (in new terminal)
cd frontend
npm install
npm run dev  # Starts on port 3000
```

#### With Docker (Recommended)

```bash
# Use docker-compose for full environment
docker-compose up -d

# Backend hot-reload is enabled via volume mounts
# Frontend hot-reload is enabled via Vite HMR
```

### Project Structure

```
opentyme/
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── api/               # API client services
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── i18n/              # Internationalization (en/de)
│   │   ├── pages/             # Page components
│   │   ├── store/             # Zustand state management
│   │   └── utils/             # Utilities (export, currency, etc.)
│   ├── tests/                 # Frontend tests (Jest + Playwright)
│   ├── Dockerfile.dev         # Development container
│   └── package.json
├── backend/                    # Node.js backend
│   ├── src/
│   │   ├── config/            # Configuration
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Express middleware
│   │   ├── models/            # Data models
│   │   ├── routes/            # API routes
│   │   ├── schemas/           # Joi validation schemas
│   │   ├── services/          # Business logic
│   │   │   ├── ai/            # AI integration
│   │   │   ├── analytics/     # Reports & analytics
│   │   │   ├── business/      # Core business services
│   │   │   ├── financial/     # Invoice, payment services
│   │   │   ├── storage/       # MinIO file storage
│   │   │   └── system/        # Backup, scheduling
│   │   └── utils/             # Utilities
│   ├── scripts/               # Backup/restore scripts
│   ├── tests/                 # Backend tests (Jest)
│   ├── Dockerfile
│   └── package.json
├── docs/                       # Documentation
│   ├── AI_FEATURES.md
│   ├── DEPRECIATION_FEATURE.md
│   └── STORAGE_ARCHITECTURE.md
├── keycloak/
│   └── realm-import.json      # Keycloak realm configuration
├── traefik/
│   ├── traefik.yml           # Traefik static config
│   └── traefik-dynamic.yml   # Dynamic routing rules
├── scripts/                    # Host-side backup scripts
├── backups/                    # Backup storage
├── init.sql                   # Database schema
├── docker-compose.yml         # Service orchestration
├── LICENSE                    # CC BY-NC 4.0 License
└── README.md                  # This file
```

### Code Style

#### Backend (TypeScript)

```typescript
// Use async/await
async function getClient(id: string): Promise<Client> {
  const result = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
  return result.rows[0];
}

// Proper error handling
try {
  const client = await clientService.create(data);
  res.status(201).json(client);
} catch (error) {
  logger.error('Create client error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

// Use interfaces for type safety
interface CreateClientDto {
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
}
```

#### Frontend (TypeScript + React)

```typescript
// Use functional components with hooks
const ClientForm: React.FC<ClientFormProps> = ({ onSubmit }) => {
  const [formData, setFormData] = useState<ClientFormData>(initialState);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
};

// Use custom hooks for reusable logic
const useClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  
  const fetchClients = async () => {
    setLoading(true);
    const data = await api.clients.getAll();
    setClients(data);
    setLoading(false);
  };
  
  return { clients, loading, fetchClients };
};
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create pull request
git push origin feature/new-feature
```

**Commit Convention** (Conventional Commits):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting, missing semicolons, etc.
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

---

## 🔧 Troubleshooting

### Common Issues

#### Services not starting

```bash
# Check if ports are already in use
lsof -i :80     # Traefik
lsof -i :3000   # Frontend
lsof -i :8000   # Backend
lsof -i :5432   # PostgreSQL
lsof -i :8080   # Keycloak

# Stop conflicting services or change ports in .env
```

#### Database connection errors

```bash
# Check if PostgreSQL is running
docker-compose ps db

# View database logs
docker-compose logs db

# Restart database
docker-compose restart db

# Verify database initialization
docker exec -it opentyme-db psql -U postgres -d opentyme_db -c "\dt"
```

#### Keycloak not accessible

```bash
# Check Keycloak status
docker-compose ps keycloak

# Wait for Keycloak to fully start (can take 60-90 seconds)
docker-compose logs -f keycloak

# Verify realm import
# Look for "Realm imported successfully" in logs
```

#### Frontend not loading

```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose build frontend
docker-compose restart frontend

# Clear browser cache
# Open DevTools > Application > Clear Storage
```

#### API requests failing

```bash
# Check backend logs
docker-compose logs backend

# Test API directly
curl http://localhost/api/health

# Verify Keycloak token
# Use browser DevTools > Network tab to inspect Authorization header
```

#### MinIO/Receipt upload issues

```bash
# Check MinIO status
docker-compose ps minio

# Access MinIO console
open http://minio.localhost

# Verify bucket exists
# Login with minioadmin/minioadmin123
# Check "receipts" bucket
```

### Reset Everything

```bash
# Stop and remove all containers, volumes, and images
docker-compose down -v --rmi all

# Remove database volumes
docker volume rm $(docker volume ls -q | grep opentyme)

# Start fresh
docker-compose up -d
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f keycloak

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Increase Docker memory limit (Docker Desktop)
# Settings > Resources > Memory > 4GB+

# Optimize database
docker exec -it opentyme-db psql -U postgres -d opentyme_db
# Run: VACUUM ANALYZE;
```

---

## 📚 Documentation

Detailed documentation for specific features and integrations can be found in the `docs/` directory:

- [AI Features](docs/AI_FEATURES.md) - AI integration architecture, implementation guide, and usage
- [Depreciation Feature](docs/DEPRECIATION_FEATURE.md) - Asset depreciation with German tax law compliance (AfA)
- [Storage Architecture](docs/STORAGE_ARCHITECTURE.md) - MinIO object storage design and per-user bucket system

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Follow code style guidelines
   - Add tests for new features
   - Update documentation
4. **Test your changes**
   ```bash
   npm test  # Backend tests
   npm run test:ui  # Frontend E2E tests
   ```
5. **Commit with conventional commits**
   ```bash
   git commit -m "feat: add amazing feature"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**
   - Describe your changes
   - Link related issues
   - Ensure CI passes

### Development Guidelines

- Write clean, readable code
- Add comments for complex logic
- Follow TypeScript best practices
- Maintain test coverage above 80%
- Update documentation for API changes
- Test edge cases and error scenarios

### Code Review Process

1. Automated checks (linting, tests)
2. Manual code review by maintainer
3. Changes requested or approval
4. Merge to main branch

---

## 📝 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

**You are free to:**
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

**Under the following terms:**
- **Attribution** — You must give appropriate credit and indicate if changes were made.
- **NonCommercial** — You may not use the material for commercial purposes.

For commercial licensing inquiries, please contact the copyright holder.

Full license: https://creativecommons.org/licenses/by-nc/4.0/

Copyright (c) 2025-2026 Steffen Hebestreit

---

## 🙏 Acknowledgments

- **React Team** - For the amazing frontend framework
- **Node.js Community** - For the vast ecosystem
- **Keycloak Team** - For enterprise-grade authentication
- **PostgreSQL** - For reliable data storage
- **Docker** - For containerization made simple
- **Traefik** - For modern reverse proxy
- **TailwindCSS** - For beautiful, utility-first styling
- **All Contributors** - Thank you for your contributions!

---

## 📧 Support & Contact

### Getting Help

- **Documentation**: You're reading it!
- **GitHub Issues**: https://github.com/SteffenHebestreit/opentyme/issues
- **Discussions**: https://github.com/SteffenHebestreit/opentyme/discussions

### Reporting Bugs

When reporting bugs, please include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Environment details (OS, Docker version)
5. Relevant logs

### Feature Requests

We love hearing your ideas! Open a GitHub issue with:
1. Use case description
2. Proposed solution
3. Alternative approaches
4. Screenshots/mockups (if applicable)

---

## 🗺️ Roadmap

### Completed ✅
- [x] Time tracking with start/stop/pause timer
- [x] Client and project management
- [x] Invoice generation and PDF export
- [x] Payment tracking with partial payments
- [x] Expense tracking with receipt uploads
- [x] Asset depreciation (AfA) with German tax law compliance
- [x] Tax prepayments tracking (VAT & income tax)
- [x] **Reports & Analytics** - VAT, EÜR, Invoice, Expense, Time Tracking, and Client Revenue reports
- [x] **Financial Dashboard** - Yearly summary, profitability charts, depreciation overview
- [x] Keycloak SSO authentication
- [x] Multi-tenant data isolation
- [x] Dark/Light theme support
- [x] Comprehensive test coverage
- [x] Docker containerization
- [x] API documentation (Swagger)
- [x] Multi-language support (i18n) - English & German
- [x] Export data (PDF, CSV, Excel, JSON)
- [x] E-invoice support (ZUGFeRD/Factur-X XML schema) - Toggleable activation
- [x] Expense approval workflow (pending, approved, rejected, reimbursed)
- [x] Recurring payments (fixed monthly payments for retainer projects without invoices)
- [x] Scheduled backup system with retention policies
- [x] AI-powered receipt extraction (optional, via MCP server)

### In Progress 🚧
- [ ] Email invoice delivery

### Planned 📋
- [ ] Report templates and scheduling
- [ ] Multi-currency support improvements (exchange rate API integration)
- [ ] Custom report builder
- [ ] Timesheet templates
- [ ] Automated late payment reminders

---

**Built with ❤️ by developers, for developers**

**Version**: 1.0.0 | **Last Updated**: November 2025 | **Status**: Production Ready ✅
