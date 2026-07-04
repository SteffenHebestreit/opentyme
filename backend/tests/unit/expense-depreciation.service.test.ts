import { ExpenseService } from '../../src/services/business/expense.service';
import { ExpenseDepreciationService } from '../../src/services/business/expense-depreciation.service';
import { CreateExpenseData } from '../../src/models/business/expense.model';
import { TEST_USER_ID } from '../setup';

/**
 * AfA depreciation-schedule tests. The service only implements LINEAR
 * depreciation (pro-rated first year, remainder absorbed by the last year);
 * these lock in that behaviour, the sum-to-net-amount invariant, the single-year
 * fix, and the fact that 'degressive' currently falls back to linear.
 */
describe('ExpenseDepreciationService.calculateDepreciationSchedule', () => {
  let expenseService: ExpenseService;
  let depreciation: ExpenseDepreciationService;

  beforeAll(() => {
    expenseService = new ExpenseService();
    depreciation = new ExpenseDepreciationService();
  });

  async function makeExpense(netAmount: number): Promise<string> {
    const data: CreateExpenseData = {
      category: 'equipment',
      description: 'Depreciable asset',
      amount: netAmount,
      net_amount: netAmount,
      tax_rate: 0,
      tax_amount: 0,
      currency: 'EUR',
      expense_date: '2024-01-15',
      is_billable: false,
      is_reimbursable: false,
    };
    const expense = await expenseService.createExpense(TEST_USER_ID, data);
    return expense.id;
  }

  const nums = (rows: any[]) => rows.map((r) => Number(parseFloat(r.amount).toFixed(2)));
  const sum = (rows: any[]) => rows.reduce((a, r) => a + parseFloat(r.amount), 0);

  it('splits a full-year (Jan 1) start evenly across the years', async () => {
    const id = await makeExpense(1200);
    await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, 3, new Date(2024, 0, 1));
    const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);

    expect(schedule).toHaveLength(3);
    expect(nums(schedule)).toEqual([400, 400, 400]);
    expect(schedule.map((r) => Number(parseFloat(r.cumulative_amount).toFixed(2)))).toEqual([400, 800, 1200]);
    expect(schedule.map((r) => Number(parseFloat(r.remaining_value).toFixed(2)))).toEqual([800, 400, 0]);
    expect(schedule[2].is_final_year).toBe(true);
    expect(schedule[0].is_final_year).toBe(false);
  });

  it('pro-rates the first year for a mid-year start and lands the remainder on the last year', async () => {
    const id = await makeExpense(1200);
    // Start July → 6 remaining months → first year gets half the annual amount.
    await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, 3, new Date(2024, 6, 1));
    const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);

    expect(nums(schedule)).toEqual([200, 400, 600]);
    expect(sum(schedule)).toBeCloseTo(1200, 2); // invariant: fully depreciated
  });

  it('depreciates the FULL net amount for a single-year schedule, even mid-year (regression: years === 1)', async () => {
    const id = await makeExpense(1000);
    await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, 1, new Date(2024, 6, 1));
    const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);

    expect(schedule).toHaveLength(1);
    expect(parseFloat(schedule[0].amount)).toBeCloseTo(1000, 2); // was 500 before the ordering fix
    expect(parseFloat(schedule[0].remaining_value)).toBeCloseTo(0, 2);
    expect(schedule[0].is_final_year).toBe(true);
  });

  it('always sums to the net amount across a range of years, start months, and methods (invariant)', async () => {
    for (const method of ['linear', 'degressive'] as const) {
      for (const years of [2, 4, 5]) {
        for (const month of [0, 3, 9]) {
          const id = await makeExpense(999.99);
          await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, years, new Date(2024, month, 1), method);
          const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);
          expect(schedule).toHaveLength(years);
          expect(sum(schedule)).toBeCloseTo(999.99, 2);
          expect(parseFloat(schedule[years - 1].remaining_value)).toBeCloseTo(0, 2);
        }
      }
    }
  });

  it('degressive AfA is front-loaded (declining balance) then switches to straight-line', async () => {
    // years=10 → linear rate 10%, degressive rate min(2×10%, 20%) = 20% of book.
    const id = await makeExpense(10000);
    await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, 10, new Date(2024, 0, 1), 'degressive');
    const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);
    const amounts = nums(schedule);

    expect(schedule).toHaveLength(10);
    expect(amounts[0]).toBeCloseTo(2000, 2); // 20% of 10000
    expect(amounts[1]).toBeCloseTo(1600, 2); // 20% of remaining 8000
    // Strictly declining while degressive, never increasing (flat once switched).
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeLessThanOrEqual(amounts[i - 1] + 0.01);
    }
    expect(sum(schedule)).toBeCloseTo(10000, 2);
    expect(parseFloat(schedule[9].remaining_value)).toBeCloseTo(0, 2);
    // Front-loaded vs linear: first-year degressive deduction exceeds linear (1000).
    expect(amounts[0]).toBeGreaterThan(10000 / 10);
  });

  it('respects DEPRECIATION_DEGRESSIVE_FACTOR / _CAP overrides', async () => {
    const prevFactor = process.env.DEPRECIATION_DEGRESSIVE_FACTOR;
    const prevCap = process.env.DEPRECIATION_DEGRESSIVE_CAP;
    process.env.DEPRECIATION_DEGRESSIVE_FACTOR = '2.5';
    process.env.DEPRECIATION_DEGRESSIVE_CAP = '0.25';
    try {
      const id = await makeExpense(10000);
      await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, 10, new Date(2024, 0, 1), 'degressive');
      const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);
      // rate = min(2.5 × 10%, 25%) = 25% → first year 2500.
      expect(parseFloat(schedule[0].amount)).toBeCloseTo(2500, 2);
      expect(sum(schedule)).toBeCloseTo(10000, 2);
    } finally {
      process.env.DEPRECIATION_DEGRESSIVE_FACTOR = prevFactor;
      process.env.DEPRECIATION_DEGRESSIVE_CAP = prevCap;
    }
  });
});
