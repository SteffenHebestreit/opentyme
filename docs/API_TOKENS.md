# API tokens

Personal access tokens let scripts, AI agents and MCP clients use OpenTyme on
your behalf — through the REST API, the OpenTyme assistant (AG-UI or A2A) and
OpenTyme's MCP server. A token acts as you, but can only do what you allowed
when you created it.

- [Create a token](#create-a-token)
- [Permissions](#permissions)
- [REST API](#rest-api)
- [The OpenTyme assistant](#the-opentyme-assistant)
- [A2A (agent to agent)](#a2a-agent-to-agent)
- [MCP](#mcp)
- [Connecting MCP clients by URL (OAuth)](#connecting-mcp-clients-by-url-oauth)
- [Activity, expiry and revoking](#activity-expiry-and-revoking)
- [Administrators](#administrators)
- [Running OpenTyme with tokens](#running-opentyme-with-tokens)

## Create a token

**Configuration → Integrations → API tokens → New token.**

- **Name** — what uses the token, e.g. "Claude Code on my laptop".
- **Expiration** — 7, 30 or 90 days, one year, a date, or none. Prefer an
  expiry: a token without one works until you revoke it. You get an email a
  week before a token expires.
- **Data access** — None, Read, Write or Delete per area (see below). Presets
  fill in common combinations.
- **Features** — the OpenTyme assistant, the MCP server, sending emails.
- **Approvals** (with the assistant) — who confirms changes: the connected
  app itself, or you in the OpenTyme chat. *You in OpenTyme* is a hard limit:
  such a token changes data only through the assistant, after your approval —
  never directly (API, MCP write tools, email).

The token (`oty_pat_…`) is shown **once**. OpenTyme stores only its SHA-256
hash and can't show it again; if you lose it, regenerate it. You get an email
whenever a token is added to your account.

## Permissions

Levels build on each other: **Delete** includes Write, **Write** includes Read.
A GET request needs Read, POST/PUT/PATCH need Write and DELETE needs Delete —
except that previews and payment validation are reads, and cancelling an
invoice (irreversible) needs Delete.

| Area | Covers | Levels |
|---|---|---|
| Clients | clients and their documents | None – Delete |
| Projects | projects and hourly rates | None – Delete |
| Time entries | time entries and the timer | None – Delete |
| Expenses | expenses and receipts | None – Delete |
| Invoices | invoices and recurring invoices | None – Delete |
| Payments | payments received | None – Delete |
| Tax | tax rates, prepayments, depreciation, tax package | None – Delete |
| Templates | invoice text and email templates | None – Delete |
| Reports | analytics, reports, summaries | None, Read |
| Addons | routes of installed addons | None – Delete |

| Feature | Allows |
|---|---|
| OpenTyme assistant | `/api/ai/*` — chatting with the assistant (AG-UI and A2A) |
| MCP server | `/api/mcp` |
| Send emails | `POST /api/email/send`; attaching invoices needs Invoices: Read, attaching or emailing reports Reports: Read, marking the invoice as sent Invoices: Write |

Some requests need more than their path suggests: the tax package download
needs Read on invoices, expenses and reports for the parts it includes, and
setting an invoice's status to cancelled needs Delete, like `/cancel`.

**Never available to a token**, whatever its permissions: sign-in and profile
(`/api/auth`), password reset, settings, system administration, addon
management and token management itself — a token can't create or widen
tokens. A token never acts as an administrator.

Anything not listed is refused, and a test walks every API route and fails
if a route has no classification.

## REST API

Send the token as a bearer token:

```bash
curl -H "Authorization: Bearer oty_pat_…" https://opentyme.example.com/api/time-entries
```

`GET /api/api-tokens/current` describes the calling token — its permissions,
approval mode, expiry and owner — so a client can check what it may do.

| Status | Meaning |
|---|---|
| `401` + `WWW-Authenticate: Bearer error="invalid_token"` | unknown, revoked or expired token, or its owner is disabled |
| `403` + `error="insufficient_scope", scope="…"` | the token lacks a permission; the body's `required` says which (`invoices:read`, `capability:email_send`) |
| `403` + `code: "APPROVAL_IN_APP"` | the token's changes need your approval in OpenTyme — it may not write directly |
| `429` | the token's rate limit is used up (`RateLimit-*` headers say when it resets) |
| `503` | the token couldn't be checked (Keycloak unreachable) — retry |

The API reference is at `/api-docs`.

## The OpenTyme assistant

Needs the **OpenTyme assistant** feature. The assistant uses the LLM you
configured under Configuration → General.

`POST /api/ai/run` with `{ "message": "…", "threadId": "<optional>" }` streams
[AG-UI](https://docs.ag-ui.com) events (server-sent events). The assistant's
tools call the API with your token, so it can only reach what the token
allows — and is only offered those tools.

Changes wait for approval: the stream ends with `TOOL_APPROVAL_REQUIRED`
listing the actions. Then, depending on the token's approval setting:

- **The connected app approves** — answer with
  `POST /api/ai/run/<threadId>/approve` and
  `{ "approvals": [{ "toolCallId": "…", "decision": "approve" }], "batchId": "…" }`.
- **You approve in OpenTyme** — the event carries `"approvalMode": "in_app"`
  and `/approve` answers `403 APPROVAL_IN_APP`. The conversation shows up in
  the OpenTyme chat (the chat button gets a dot); after your decision, read
  the outcome with `GET /api/ai/conversations/<threadId>`.

A token sees only the conversations it started — never your other chats. A
conversation started with a token stays limited to that token's permissions
for good, even when you continue it in the app; once the token is revoked,
the assistant can't use any tools in it.

## A2A (agent to agent)

Needs the **OpenTyme assistant** feature. Agents that speak
[A2A](https://a2a-protocol.org) 0.3 find the assistant through its public
agent card:

```
https://opentyme.example.com/.well-known/agent-card.json
```

The card points to the JSON-RPC endpoint `POST /api/ai/a2a`. Supported:
`message/send` (waits for the answer unless `configuration.blocking` is
`false`), `message/stream`, `tasks/get` and `tasks/cancel`. Push
notifications and `tasks/resubscribe` aren't — poll `tasks/get`.

A conversation is an A2A *context*; each message you send starts a *task*.
Changes pause the task in `input-required`, with the pending actions in a
data part. Decide on the same task:

```json
{
  "jsonrpc": "2.0", "id": 2, "method": "message/send",
  "params": { "message": {
    "kind": "message", "role": "user", "messageId": "m2", "taskId": "<task id>",
    "parts": [{ "kind": "data", "data": { "decision": "approve" } }]
  } }
}
```

Per action: `{ "approvals": [{ "toolCallId": "…", "decision": "reject" }] }`.
A text message on the task instead declines the actions and continues with
the text. Tokens whose owner approves in the app get error `-32004`; their
task completes once you decide in OpenTyme.

## MCP

Needs the **MCP server** feature. The server speaks Streamable HTTP at
`/api/mcp` (stateless; plain JSON responses).

Claude Code:

```bash
claude mcp add --transport http opentyme https://opentyme.example.com/api/mcp \
  --header "Authorization: Bearer oty_pat_…"
```

Clients configured with an `mcpServers` block (e.g. Cursor):

```json
{
  "mcpServers": {
    "opentyme": {
      "url": "https://opentyme.example.com/api/mcp",
      "headers": { "Authorization": "Bearer oty_pat_…" }
    }
  }
}
```

The token's setup dialog shows both, filled in.

The server offers a curated set of tools — looking up clients, projects, time
entries and invoices; summaries of time, revenue, expenses and profit; logging
time (`log_time_entry` takes a project *name*), the timer; creating clients,
projects and invoices from time entries — and lists only those the token
allows. There's no OpenTyme approval step: tools are marked read-only or
destructive, and your MCP client asks you before changes. Tokens whose owner
approves in OpenTyme get read-only tools only.

## Connecting MCP clients by URL (OAuth)

Clients that support MCP authorization — claude.ai and Claude Desktop
connectors, for example — need only the URL, no token:

```
https://opentyme.example.com/api/mcp
```

The client registers itself with OpenTyme and opens OpenTyme in your browser.
After you sign in, OpenTyme asks what the client may do — the same choices as
a new token, starting from read-only, with the MCP server always on and a
30-day expiry. The page shows where the client will send you back: client
names are chosen by the client, so check that address. **Allow access**
creates an ordinary API token for the client; it appears in your token list
marked *Connected via OAuth*, and you edit or revoke it there like any other.
When it expires, the client asks you again — there are no refresh tokens.

OpenTyme is its own OAuth 2.1 authorization server for this; Keycloak isn't
involved beyond signing you in. Details for client authors:

- `401` responses from `/api/mcp` carry `WWW-Authenticate: Bearer
  resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`.
- Metadata: `/.well-known/oauth-protected-resource` (RFC 9728) and
  `/.well-known/oauth-authorization-server` (RFC 8414).
- Dynamic client registration at `/api/oauth/register` (RFC 7591). Redirect
  URIs must be `https`, or `http` on `localhost`/`127.0.0.1`/`[::1]`. Public
  clients (`none`) and `client_secret_post`/`client_secret_basic`.
- Authorization code grant only, with PKCE `S256` required. Codes are
  single-use and live ten minutes. The `resource` parameter (RFC 8707), if
  sent, must be the MCP URL; the redirect carries `iss` (RFC 9207). The only
  scope is `mcp`.
- The access token is an `oty_pat_…` token — it also works for the REST API
  and the assistant within the permissions you granted.

## Activity, expiry and revoking

**Recent activity** on the API tokens page lists what happened to your tokens:
created, changed, regenerated, revoked, first used, and used from a new
address — tokens revoked since included.

**Regenerate** issues a new token for the same name and permissions; the old
one stops working at once. It's also how you change the expiry.

**Revoke** deletes the token; it stops working on its next request. Changes to
permissions apply on the next request too. Disabling or deleting the owner's
Keycloak account stops their tokens within five minutes.

## Administrators

**System admin → API tokens** lists every user's tokens — name, owner,
permissions, expiry, last use — without their secrets, and lets an
administrator revoke any of them, e.g. after someone leaves. The owner sees
the revocation in their activity log. This page, like all administration,
needs a signed-in session; a token can't reach it.

## Running OpenTyme with tokens

| Variable | Default | |
|---|---|---|
| `API_TOKEN_RATE_LIMIT_MAX` | `600` | requests per token per window (the assistant's and MCP's tool calls count too) |
| `API_TOKEN_RATE_LIMIT_WINDOW_MS` | `60000` | rate limit window |
| `API_TOKEN_EXPIRY_CRON` | `0 9 * * *` | when expiry reminders are sent |
| `FRONTEND_URL` | — | links in reminder and password-reset emails |
| `PUBLIC_URL` | request host | base URL in the A2A agent card, OAuth metadata and the MCP resource URL |
| `TRUST_PROXY` | — | number of proxy hops; without it "last used from" and the activity log show the proxy's address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | — | system mail for expiry reminders |

Traefik routes `/api`, `/.well-known/agent-card.json` (plus the older
`/.well-known/agent.json`) and `/.well-known/oauth-*` to the backend. Set
`PUBLIC_URL` when OpenTyme is reachable under more than one host name: OAuth
metadata and the MCP resource URL are built from it.

The backend assumes a single replica: token lookups are cached in memory for a
minute (evicted at once when a token changes), and rate limits and the
assistant's run locks live in memory too.
