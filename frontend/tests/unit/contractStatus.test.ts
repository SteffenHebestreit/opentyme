import { contractStatus, contractStatusRank, titleFromFilename } from '../../src/utils/contractStatus';
import { addMonthsYmd, formatYmd, parseYmd } from '../../src/utils/date';

const TODAY = '2026-10-06';

describe('contractStatus', () => {
  it('has no status without a term', () => {
    expect(contractStatus(null, null, TODAY)).toBeNull();
  });

  it('is running while the end is far away', () => {
    expect(contractStatus('2026-01-01', '2027-06-30', TODAY)).toEqual({ kind: 'active' });
  });

  it('warns within 60 days of the end', () => {
    expect(contractStatus('2026-04-01', '2026-10-31', TODAY)).toEqual({ kind: 'expiring', days: 25 });
  });

  it('counts the last day as still running', () => {
    expect(contractStatus('2026-01-01', TODAY, TODAY)).toEqual({ kind: 'expiring', days: 0 });
  });

  it('is expired the day after the end', () => {
    expect(contractStatus('2026-01-01', '2026-10-05', TODAY)).toEqual({ kind: 'expired', days: 1 });
  });

  it('has not started before its first day', () => {
    expect(contractStatus('2026-11-01', '2027-10-31', TODAY)).toEqual({ kind: 'upcoming', days: 26 });
  });

  it('sorts what needs attention first', () => {
    const ranks = [
      contractStatus('2026-01-01', '2026-10-05', TODAY),
      contractStatus(null, null, TODAY),
      contractStatus('2026-01-01', '2026-10-31', TODAY),
      contractStatus('2026-01-01', '2027-06-30', TODAY),
    ].map(contractStatusRank);
    expect([...ranks].sort((a, b) => a - b)).toEqual([0, 1, 3, 4]);
    expect(ranks[2]).toBe(0); // expiring comes first
  });
});

describe('titleFromFilename', () => {
  it('drops the extension and separators', () => {
    expect(titleFromFilename('Rahmenvertrag_2027-final.pdf')).toBe('Rahmenvertrag 2027 final');
  });
});

describe('date-only helpers', () => {
  it('never shifts a calendar day through UTC', () => {
    const date = parseYmd('2026-11-01') as Date;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 1]);
  });

  it('formats German dates', () => {
    expect(formatYmd('2026-11-01', 'de-DE')).toBe('01.11.2026');
  });

  it('clamps month arithmetic to the end of the month', () => {
    expect(addMonthsYmd('2026-01-31', 1)).toBe('2026-02-28');
  });
});
