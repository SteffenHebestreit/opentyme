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

  it('always sums to the net amount across a range of years and start months (invariant)', async () => {
    for (const years of [2, 4, 5]) {
      for (const month of [0, 3, 9]) {
        const id = await makeExpense(999.99);
        await depreciation.calculateDepreciationSchedule(id, TEST_USER_ID, years, new Date(2024, month, 1));
        const schedule = await depreciation.getDepreciationSchedule(id, TEST_USER_ID);
        expect(schedule).toHaveLength(years);
        expect(sum(schedule)).toBeCloseTo(999.99, 2);
      }
    }
  });

  it("currently treats 'degressive' as linear (documents the unimplemented method)", async () => {
    const linId = await makeExpense(1200);
    await depreciation.calculateDepreciationSchedule(linId, TEST_USER_ID, 3, new Date(2024, 0, 1), 'linear');
    const linear = await depreciation.getDepreciationSchedule(linId, TEST_USER_ID);

    const degId = await makeExpense(1200);
    await depreciation.calculateDepreciationSchedule(degId, TEST_USER_ID, 3, new Date(2024, 0, 1), 'degressive');
    const degressive = await depreciation.getDepreciationSchedule(degId, TEST_USER_ID);

    // Known limitation: degressive is not implemented, so both are identical.
    expect(nums(degressive)).toEqual(nums(linear));
  });
});
