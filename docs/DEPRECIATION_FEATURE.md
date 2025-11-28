# Depreciation Feature (AfA - Absetzung für Abnutzung)

> AI-assisted expense depreciation according to German tax law, allowing expenses to be split over multiple years with intelligent analysis.

## Table of Contents

- [Overview](#overview)
- [German Tax Law Reference](#german-tax-law-reference)
  - [GWG Thresholds](#gwg-thresholds)
  - [AfA Tables (Useful Life)](#afa-tables-useful-life)
  - [Depreciation Methods](#depreciation-methods)
  - [Legal References](#legal-references)
- [Database Schema](#database-schema)
- [Backend Architecture](#backend-architecture)
  - [AI Depreciation Service](#ai-depreciation-service)
  - [Expense Service Updates](#expense-service-updates)
  - [API Endpoints](#api-endpoints)
- [Frontend Components](#frontend-components)
- [Report Integration](#report-integration)
- [Implementation Status](#implementation-status)
- [Related Documentation](#related-documentation)

---

## Overview

Implement automatic and AI-assisted expense depreciation according to German tax law (AfA - Absetzung für Abnutzung). The system:

1. **Analyzes expenses** using AI to determine depreciation requirements
2. **Applies German tax rules** for GWG thresholds and useful life
3. **Generates depreciation schedules** for multi-year assets
4. **Integrates with reports** showing tax-deductible amounts per year

---

## German Tax Law Reference

### GWG Thresholds

**GWG (Geringwertige Wirtschaftsgüter) - Low-Value Assets**

| Net Amount | Rule | Options |
|------------|------|---------|
| < €250 | Optional immediate deduction | No records required |
| €250 - €800 | Immediate deduction (Sofortabzug) | Records required, or pooled item |
| €800 - €1,000 | Choice (Wahlrecht) | Immediate, depreciation, or pooled |
| > €1,000 | **Mandatory depreciation** | Must use AfA over useful life |

> **Important**: All thresholds refer to **NET amounts** (without VAT). VAT is **always immediately deductible**.

### Sammelposten (Pooled Items)
- Items €250 - €1,000 can be pooled
- Pool depreciated over **5 years** (20% per year)
- Pro-rata in first and last year

### AfA Tables (Useful Life)

Official source: [Bundesfinanzministerium AfA-Tabellen](https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/AfA_Tabellen/)

#### IT Equipment
| Asset | Useful Life | Annual Rate |
|-------|-------------|-------------|
| Computer/Laptop/Tablet | 3 years | 33.3% |
| Server | 3 years | 33.3% |
| Monitor/Printer/Router | 3 years | 33.3% |
| Software | 3 years | 33.3% |

#### Office Equipment
| Asset | Useful Life | Annual Rate |
|-------|-------------|-------------|
| Office furniture (desk, chair) | 13 years | 7.7% |
| Telephone system | 5 years | 20% |
| Coffee machine | 5 years | 20% |
| Air conditioner | 10 years | 10% |
| Safe | 23 years | 4.3% |

#### Vehicles
| Asset | Useful Life | Annual Rate |
|-------|-------------|-------------|
| Cars (PKW) | 6 years | 16.7% |
| Motorcycles | 7 years | 14.3% |
| Bicycles/E-Bikes | 7 years | 14.3% |
| Trucks | 9 years | 11.1% |

#### Other
| Asset | Useful Life | Annual Rate |
|-------|-------------|-------------|
| Camera equipment | 7 years | 14.3% |
| Hand tools | 5 years | 20% |
| Commercial buildings | 33 years | 3% |
| Residential buildings | 50 years | 2% |

### Depreciation Methods

#### Linear Depreciation (Lineare AfA) - Standard
```
Annual depreciation = Net acquisition cost ÷ Useful life (years)
```

**Example**: Laptop €2,380 (incl. 19% VAT)
- Net amount: €2,000
- VAT: €380 (immediately deductible)
- Useful life: 3 years
- Annual depreciation: €2,000 ÷ 3 = €666.67

#### Pro-Rata Calculation
Depreciation starts in the **month of acquisition**:

```typescript
function calculateProRata(annualAmount: number, startMonth: number): number {
  const monthsInFirstYear = 13 - startMonth;  // July = month 7 → 6 months
  return (annualAmount / 12) * monthsInFirstYear;
}
```

**Example**: Car purchased in July for €30,000 (6-year life)
- Annual amount: €30,000 ÷ 6 = €5,000
- Year 1 (July-Dec): €5,000 × 6/12 = €2,500
- Years 2-6: €5,000 each
- Final adjustment in last year

#### Degressive AfA (NEW 2025-2027)
- **Period**: July 1, 2025 - December 31, 2027
- **Rate**: Up to **30%** per year
- **Applies to**: New movable assets acquired during this period
- Can switch to linear when more advantageous

### Legal References

| Paragraph | Topic |
|-----------|-------|
| § 6 Abs. 2 EStG | GWG immediate deduction (< €800) |
| § 6 Abs. 2a EStG | Pooled items (Sammelposten) |
| § 7 Abs. 1 EStG | Depreciation over useful life |
| § 7 Abs. 2 EStG | Declining balance method |
| § 7g EStG | Special depreciation (Sonderabschreibung) |

---

## Database Schema

### Expenses Table - New Columns

```sql
ALTER TABLE expenses ADD COLUMN depreciation_type VARCHAR(20) 
  DEFAULT 'none' CHECK (depreciation_type IN ('none', 'full', 'partial'));
ALTER TABLE expenses ADD COLUMN depreciation_years INTEGER;
ALTER TABLE expenses ADD COLUMN depreciation_start_date DATE;
ALTER TABLE expenses ADD COLUMN useful_life_category VARCHAR(50);
ALTER TABLE expenses ADD COLUMN tax_deductible_amount NUMERIC(10,2);
ALTER TABLE expenses ADD COLUMN ai_analysis_performed BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN ai_recommendation JSONB;
```

### Depreciation Schedule Table

```sql
CREATE TABLE expense_depreciation_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  cumulative_amount NUMERIC(10,2) NOT NULL,
  remaining_value NUMERIC(10,2) NOT NULL,
  is_final_year BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expense_id, year)
);

CREATE INDEX idx_depreciation_schedule_expense ON expense_depreciation_schedule(expense_id);
CREATE INDEX idx_depreciation_schedule_year ON expense_depreciation_schedule(year);
```

---

## Backend Architecture

### AI Depreciation Service

**File**: `backend/src/services/financial/ai-depreciation.service.ts`

```typescript
interface DepreciationAnalysis {
  recommendation: 'none' | 'immediate' | 'partial';
  reasoning: string;
  suggested_years?: number;
  useful_life_category?: string;
  tax_deductible_amount: number;
  references?: string[];  // § references
  confidence: number;
  gwg_applicable?: boolean;
  requires_depreciation?: boolean;
}
```

**Analysis Flow**:
1. Initialize with user settings (AI provider, API key)
2. Extract expense details (amount, description, category, date)
3. Apply German tax rules (GWG thresholds, AfA tables)
4. Optionally call LLM for complex categorization
5. Return structured recommendation

**Default Rules (No AI)**:
| Amount | Recommendation | Confidence |
|--------|----------------|------------|
| < €250 | Immediate | 0.9 |
| €250 - €800 | GWG immediate | 0.95 |
| €800 - €1,000 | Optional (recommend immediate) | 0.85 |
| > €1,000 | Depreciation 5 years | 0.8 |

### Expense Service Updates

New methods in `ExpenseService`:

```typescript
// Analyze expense for depreciation
async analyzeDepreciation(expenseId: string, userId: string): Promise<{
  analysis: DepreciationAnalysis;
  schedule: DepreciationScheduleEntry[];
}>

// Calculate linear depreciation schedule
calculateDepreciationSchedule(
  netAmount: number,
  years: number,
  startDate: Date
): DepreciationScheduleEntry[]

// Get depreciation schedule for expense
async getDepreciationSchedule(expenseId: string, userId: string): Promise<DepreciationScheduleEntry[]>

// Update depreciation settings
async updateDepreciationSettings(expenseId: string, userId: string, settings: {
  depreciation_type?: string;
  depreciation_years?: number;
  useful_life_category?: string;
}): Promise<void>

// Get tax deductible amount for specific year
async getTaxDeductibleAmount(expenseId: string, year: number): Promise<number>
```

### API Endpoints

```typescript
// Analyze depreciation for expense
POST /api/expenses/:id/analyze-depreciation

// Update depreciation settings
PUT /api/expenses/:id/depreciation

// Get depreciation schedule
GET /api/expenses/:id/depreciation-schedule

// Bulk analyze multiple expenses
POST /api/expenses/bulk-analyze
```

---

## Frontend Components

### DepreciationAnalysisSection
```tsx
// Features:
// - "Analyze with AI" button
// - Loading spinner during analysis
// - Display AI recommendation with reasoning
// - Manual override controls (type, years, amount)
// - Preview of first year deduction
```

### DepreciationScheduleModal
```tsx
// Display full depreciation timeline
// Table: Year | Amount | Cumulative | Remaining
// Visual progress bar
// Export schedule as CSV
```

### Updated ExpensesPage
- Filter by depreciation status
- Column: "Tax Deductible This Year"
- Summary cards: Total Expenses vs Tax Deductible
- Bulk analysis action

---

## Report Integration

### Tax Declaration Report

```
Betriebsausgaben (Business Expenses)
------------------------------------
Beleg-Nr. | Beschreibung | Brutto | Abschreibung | Steuerwirksam

E-12345   | Laptop Dell  | 2.380€ | 3 Jahre (1/3)| 793,33€
          | └─ Abschreibung bis 2027

Gesamt Ausgaben (Brutto): 15.000€
Davon steuerwirksam 2025: 12.500€
Aufgeschobene Abschreibung: 2.500€
```

### Report Service Updates

```sql
-- Use tax_deductible_amount instead of amount
SELECT 
  SUM(COALESCE(tax_deductible_amount, amount)) as total_deductible,
  SUM(amount) as gross_total,
  SUM(CASE WHEN depreciation_type = 'partial' 
      THEN amount - tax_deductible_amount ELSE 0 END) as deferred_amount
FROM expenses 
WHERE user_id = $1 AND EXTRACT(YEAR FROM expense_date) = $2;
```

---

## Implementation Status

### ✅ Completed
- German tax law research
- Database schema design
- AI Depreciation Service (code exists)

### ⚠️ In Progress
- Integration with expense controller
- API endpoints

### ❌ Not Started
- Frontend components
- Report integration
- Migration of existing expenses
- Documentation updates

### Estimated Effort
| Phase | Tasks | Time |
|-------|-------|------|
| Database & Core | Schema, migrations, calculations | 4 hours |
| AI Service | Integration, testing | 8 hours |
| Backend APIs | Endpoints, validation | 6 hours |
| Frontend | Components, modals, hooks | 12 hours |
| Reports | PDF updates, translations | 6 hours |
| **Total** | | **~36 hours** |

---

## Related Documentation

- [AI Features](./AI_FEATURES.md) - AI/MCP architecture and implementation
- [Storage Architecture](./STORAGE_ARCHITECTURE.md) - File storage for receipts
- [README](../README.md) - Main project documentation

---

## Quick Reference

### Key Numbers

| Threshold | Rule |
|-----------|------|
| < €250 | Optional immediate, no records |
| €250 - €800 | Immediate (Sofortabzug) |
| €800 - €1,000 | Choice (Wahlrecht) |
| > €1,000 | Mandatory depreciation |

### Common Assets

| Asset | Useful Life |
|-------|-------------|
| Computer/Laptop | 3 years |
| Office furniture | 13 years |
| Cars (PKW) | 6 years |
| Software | 3 years |

**VAT Treatment**: Always immediately deductible, never depreciated!

---

*Research completed: November 2025 | Valid for tax year 2025+*
