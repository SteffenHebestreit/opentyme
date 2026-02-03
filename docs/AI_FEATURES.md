# AI Features & Integration

> Complete documentation for AI-powered features including receipt analysis, expense extraction, and depreciation analysis.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [MCP Server](#mcp-server)
  - [Backend AI Services](#backend-ai-services)
  - [Integration Flow](#integration-flow)
- [Current Status](#current-status)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [User Settings](#user-settings)
- [API Reference](#api-reference)
  - [Receipt Analysis](#receipt-analysis)
  - [Depreciation Analysis](#depreciation-analysis)
- [Implementation Guide](#implementation-guide)
  - [Database Schema](#database-schema)
  - [Service Methods](#service-methods)
  - [Frontend Integration](#frontend-integration)
- [Testing](#testing)
- [Related Documentation](#related-documentation)

---

## Overview

The OpenTYME project has a multi-layered AI integration architecture designed for:

1. **Receipt/Expense PDF Extraction** - Using MCP (Model Context Protocol) server with file-to-markdown conversion
2. **Structured Expense Data Extraction** - Using OpenAI-compatible LLM APIs
3. **Depreciation Analysis** - AI-assisted German tax law compliance for asset depreciation (see [Depreciation Feature](./DEPRECIATION_FEATURE.md))

> **Note**: AI is currently **DISABLED by default** (`AI_ENABLED=false`). Enable it in your environment configuration.

---

## Architecture

### MCP Server

The MCP (Model Context Protocol) server handles PDF-to-text extraction.

**Configuration** (docker-compose.yml):
```yaml
mcp-server:
  image: fastapi_mcp_template
  container: opentyme-mcp-server
  port: 8001 (external) → 8000 (internal)
  url: http://mcp-server:8000
  traefik: mcp.localhost
```

**Environment Variables**:
```bash
HOST=0.0.0.0
PORT=8000
ENABLED_TOOLS=file_converter
MAX_FILE_SIZE=10485760  # 10 MB
FTMD_MARKITDOWN_ENABLE_LLM=${MCP_ENABLE_LLM:-false}
FTMD_OPENAI_API_KEY=${MCP_OPENAI_API_KEY:-}
FTMD_OPENAI_BASE_URL=${MCP_OPENAI_BASE_URL:-}
FTMD_OPENAI_MODEL=${MCP_OPENAI_MODEL:-gpt-4o-mini}
```

**Health Check**: `GET /api/health` (interval: 30s, timeout: 10s)

### Backend AI Services

| Service | File | Purpose |
|---------|------|---------|
| **Expense Extraction** | `services/ai/expense-extraction.service.ts` | Extract structured data from receipts |
| **MCP Client** | `services/ai/mcp-client.service.ts` | Communicate with MCP server |
| **AI Depreciation** | `services/financial/ai-depreciation.service.ts` | Analyze depreciation requirements |

#### Expense Extraction Service

Extracts structured expense data from PDF text using OpenAI-compatible APIs.

**Extracted Fields**:
```typescript
{
  amount?: number;
  currency?: string;
  date?: string;          // YYYY-MM-DD
  vendor?: string;
  category?: string;      // office_supplies, travel, meals, software, utilities
  description?: string;
  tax_amount?: number;
  tax_rate?: number;
  confidence?: number;    // 0-100
  raw_text?: string;      // First 500 chars
}
```

**Confidence Scoring**:
| Field | Points |
|-------|--------|
| amount | 30 |
| date | 25 |
| vendor | 20 |
| category | 15 |
| currency | 10 |
| **Total** | **100** |

### Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Upload                               │
│                    (PDF Receipt Image)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Backend                               │
│              POST /api/expenses/analyze-receipt                  │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                MCP Client Service                                │
│     Calls MCP Server: POST /api/tools/file_to_markdown          │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server                                    │
│           file_to_markdown tool (PDF→Text)                      │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Expense Extraction Service                          │
│     Calls OpenAI-compatible API with structured prompt          │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Response to User                               │
│           Structured expense data with confidence               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Current Status

### ✅ Working Features
- MCP Server container configured and running
- PDF text extraction via MCP `file_to_markdown` tool
- Receipt analysis endpoint `/api/expenses/analyze-receipt`
- Structured data extraction with OpenAI-compatible LLMs
- Modular, extensible service architecture
- Graceful fallbacks when AI is disabled

### ⚠️ Partially Implemented
- **Depreciation Analysis Service** - Code exists but not fully integrated
- **Settings Management** - No UI for configuring AI providers

### ❌ Not Yet Implemented
- DuckDuckGo MCP search integration
- Depreciation API endpoints and frontend
- Bulk analysis features
- Asset register

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# AI Toggle (master switch)
AI_ENABLED=true

# MCP Server
MCP_SERVER_URL=http://mcp-server:8000
MCP_ENABLE_LLM=false

# OpenAI-compatible API (for expense extraction)
MCP_OPENAI_API_KEY=your-api-key
MCP_OPENAI_BASE_URL=https://api.openai.com/v1
MCP_OPENAI_MODEL=gpt-4o-mini

# Or for local LLM (LM Studio, Ollama, etc.)
MCP_OPENAI_BASE_URL=http://localhost:1234/v1
MCP_OPENAI_MODEL=llama-3.2-3b-instruct
```

### User Settings

AI settings are stored per-user in the `settings` table:

```sql
SELECT ai_enabled, ai_provider, ai_api_url, ai_api_key, ai_model,
       mcp_server_url, mcp_server_api_key
FROM settings WHERE user_id = $1;
```

| Setting | Description | Example |
|---------|-------------|---------|
| `ai_enabled` | Enable AI features | `true` |
| `ai_provider` | Provider name | `openai`, `local` |
| `ai_api_url` | API endpoint | `http://localhost:1234/v1` |
| `ai_api_key` | API key | `sk-...` |
| `ai_model` | Model name | `gpt-4o-mini` |
| `mcp_server_url` | MCP server URL | `http://mcp-server:8000` |

---

## API Reference

### Receipt Analysis

**Endpoint**: `POST /api/expenses/analyze-receipt`

**Request**:
```bash
curl -X POST http://localhost:8000/api/expenses/analyze-receipt \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@receipt.pdf"
```

**Response** (AI enabled):
```json
{
  "success": true,
  "data": {
    "amount": 450.50,
    "currency": "EUR",
    "date": "2025-11-15",
    "vendor": "Amazon",
    "category": "software",
    "description": "Software License",
    "tax_amount": 71.93,
    "tax_rate": 0.19,
    "confidence": 95
  },
  "message": "Receipt analyzed successfully"
}
```

**Response** (AI disabled):
```json
{
  "success": true,
  "data": {
    "raw_text": "First 1000 characters of extracted text...",
    "confidence": 0
  },
  "message": "AI extraction is disabled. Please enable it in settings."
}
```

### Depreciation Analysis

> See [Depreciation Feature](./DEPRECIATION_FEATURE.md) for full API documentation.

---

## Implementation Guide

### Database Schema

Migration script for depreciation support:

```sql
-- Add depreciation columns to expenses table
ALTER TABLE expenses ADD COLUMN depreciation_type VARCHAR(20) 
  DEFAULT 'none' CHECK (depreciation_type IN ('none', 'immediate', 'partial'));
ALTER TABLE expenses ADD COLUMN depreciation_years INTEGER;
ALTER TABLE expenses ADD COLUMN depreciation_start_date DATE;
ALTER TABLE expenses ADD COLUMN useful_life_category VARCHAR(100);
ALTER TABLE expenses ADD COLUMN tax_deductible_amount NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN ai_analysis_performed BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN ai_recommendation JSONB;

-- Create depreciation schedule table
CREATE TABLE expense_depreciation_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  cumulative_amount NUMERIC(12,2) NOT NULL,
  remaining_value NUMERIC(12,2) NOT NULL,
  is_final_year BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_expense_year UNIQUE(expense_id, year)
);

-- Indexes
CREATE INDEX idx_depreciation_schedule_expense ON expense_depreciation_schedule(expense_id);
CREATE INDEX idx_depreciation_schedule_user_year ON expense_depreciation_schedule(user_id, year);
CREATE INDEX idx_expenses_depreciation_type ON expenses(depreciation_type);
```

### Service Methods

Key methods in `ExpenseService`:

```typescript
// Analyze expense for depreciation
async analyzeDepreciation(expenseId: string, userId: string): Promise<{
  analysis: DepreciationAnalysis;
  schedule: DepreciationScheduleEntry[];
}>

// Get depreciation schedule
async getDepreciationSchedule(expenseId: string, userId: string): Promise<DepreciationScheduleEntry[]>

// Update depreciation settings
async updateDepreciationSettings(expenseId: string, userId: string, settings: {
  depreciation_type?: string;
  depreciation_years?: number;
  useful_life_category?: string;
}): Promise<void>
```

### Frontend Integration

React hook for depreciation analysis:

```typescript
import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';

export function useDepreciationAnalysis() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const analyzeExpense = useCallback(async (expenseId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post(`/expenses/${expenseId}/analyze-depreciation`);
      setAnalysis(response.data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, analysis, error, analyzeExpense };
}
```

---

## Testing

### Test MCP Server
```bash
# Health check
curl http://localhost:8001/api/health

# List available tools
curl http://localhost:8001/api/tools
```

### Test Receipt Analysis
```bash
curl -X POST http://localhost:8000/api/expenses/analyze-receipt \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-receipt.pdf"
```

### Test with Local LLM
1. Start LM Studio or Ollama with a model
2. Set `MCP_OPENAI_BASE_URL=http://host.docker.internal:1234/v1`
3. Set `MCP_OPENAI_MODEL=your-model-name`
4. Test receipt analysis endpoint

---

## Related Documentation

- [Depreciation Feature](./DEPRECIATION_FEATURE.md) - German tax law depreciation (AfA) feature specification
- [Storage Architecture](./STORAGE_ARCHITECTURE.md) - MinIO per-user bucket storage
- [README](../README.md) - Main project documentation
