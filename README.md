# OpenTYME — Track Your Money & Effort

<div align="center">
  <img src="opentyme_purple.svg" alt="OpenTYME Logo" width="120" height="120"/>
</div>

[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-blue)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue)]()

Time tracking, invoicing, and expense management for freelancers — with Keycloak SSO, a plugin/addon system, and an optional AI assistant.

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/SteffenHebestreit/opentyme.git
cd opentyme
```

### 2. Hosts file

OpenTYME's services use subdomains. Add them to your hosts file (replace `<IP>` with your machine's LAN IP — not `127.0.0.1`):

```
<IP>  auth.localhost
<IP>  traefik.localhost
<IP>  mail.localhost
<IP>  s3.localhost
```

Scripts are provided: `scripts/setup-hosts.sh` (Linux/macOS) or `scripts/setup-hosts.bat` (Windows, run as Administrator).

### 3. Start

```bash
docker compose up -d
# Wait ~60-90 seconds until "Keycloak realm imported successfully"
```

### 4. Access

| Service | URL | Default credentials |
|---------|-----|---------------------|
| App | http://localhost | admin / Admin123! |
| Keycloak admin | http://auth.localhost | admin / admin |
| MailHog | http://mail.localhost | — |
| API docs | http://localhost/api/api-docs | — |

---

## Features

- **Time tracking** — start/stop timers, manual entries, billable/non-billable
- **Invoicing** — generate from time entries, PDF export, ZUGFeRD/Factur-X, payment tracking
- **Expenses** — receipt upload (S3), tax breakdown, AfA depreciation schedules
- **Reports** — VAT (Umsatzsteuervoranmeldung), EÜR, invoice/expense/time reports; export to PDF/CSV/XLSX
- **Email** — per-user SMTP, MJML template editor with live preview
- **AI assistant** — conversational access to all your data; configurable provider (local LLM, OpenAI-compatible)
- **Addon system** — manifest-driven plugins; slot-based frontend injection; AI tool registration

---

## Configuration

Copy `.env.example` to `.env`. The defaults work for local development. Key variables to change for production:

```bash
POSTGRES_PASSWORD=...
KEYCLOAK_CLIENT_SECRET=...
KEYCLOAK_ADMIN_CLIENT_SECRET=...
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
```

---

## AI Assistant (optional)

Enable in **Settings → AI**. Any OpenAI-compatible API works (local LLM via LM Studio, self-hosted, or cloud).

Set `INTERNAL_API_URL=http://localhost:8000` in the backend environment so the assistant can call the API on the user's behalf.

Speech-to-text (mic button) is configured under **Settings → AI → Speech**.

The built-in STT service uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) and is started separately:

```bash
docker compose --profile stt up -d
```

Set `WHISPER_MODEL_SIZE` in `.env` — choose a **multilingual** model for non-English:

| Model | Size | Speed (CPU) | Languages |
|-------|------|-------------|-----------|
| `medium` | ~1.5 GB | ~3–4× realtime | Multilingual |
| `large-v3` | ~3 GB | ~1× realtime | Multilingual (best quality) |
| `distil-large-v3` | ~1.5 GB | ~5–10× realtime | **English only** |

Then configure in Settings:
- **STT Engine**: `faster-whisper (recommended)`
- **STT Server URL**: `http://faster-whisper:8000` (internal Docker hostname)

---

## Addon System

Addons are declared in `addons.config.json` at the project root:

```json
{
  "addons": [
    {
      "name": "my-addon",
      "enabled": true,
      "source": { "type": "local", "path": "./path/to/addon" }
    },
    {
      "name": "another-addon",
      "enabled": true,
      "source": { "type": "github", "repo": "org/repo", "ref": "v1.0.0" }
    }
  ]
}
```

Run `./scripts/install-addons.sh` then `docker compose up --build` to apply changes.

**Boilerplate**: [opentyme-addon-boilerplate](https://github.com/SteffenHebestreit/opentyme-addon-boilerplate)

### AI integration for addon developers

Addons receive `context.ai` in `initialize()` — three paths:

1. **Auto** — add `@swagger` JSDoc with an `operationId` to any route → becomes an LLM tool automatically
2. **Custom tool** — `context.ai.registerTool({ name, description, parameters, execute })`
3. **System prompt** — `context.ai.registerSystemPromptExtension('addon-name', '1-3 sentences')`

### Frontend slots

| Slot | Where | Context |
|------|-------|---------|
| `expense-form-actions` | Add Expense modal | `{ setDescription, setAmount, setCurrency, setCategory, setExpenseDate, setNotes }` |
| `expense-detail-actions` | Expense Detail modal | `{ expense, onExpenseUpdated, isEditing }` |
| `dashboard-widgets` | Dashboard (after Recent Invoices) | `{ metrics }` |
| `settings-tabs` | Admin → Settings | `{ activeTab }` — component must expose static `.tabMeta = { id, label, icon }` |
| `ai-chat-actions` | Above AI chat input | `{ onSend, isStreaming }` |
| `email-template-builder` | Email Template editor Code tab | `{ templateId?, mjmlContent, setMjmlContent, onSave? }` |

---

## Testing

```bash
# Backend unit tests
docker compose --profile test run --rm backend-tests

# Frontend unit tests
docker compose --profile test run --rm frontend-tests

# E2E (Playwright)
docker compose --profile test run --rm playwright
```

---

## Stack

**Frontend**: React 18, TypeScript, Vite, TailwindCSS, React Query
**Backend**: Node.js, Express, TypeScript, PostgreSQL
**Auth**: Keycloak (OAuth 2.0 / OIDC, PKCE)
**Storage**: SeaweedFS (S3-compatible)
**Infra**: Docker Compose, Traefik, Redis, MailHog

---

## License

[CC BY-NC 4.0](LICENSE) — free for personal and non-commercial use.
