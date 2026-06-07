import { RecurringInvoiceService } from '../../src/services/financial/recurring-invoice.service';
import { InvoiceService } from '../../src/services/financial/invoice.service';
import { ClientService } from '../../src/services/business/client.service';
import { getDbClient } from '../../src/utils/database';
import { Client } from '../../src/models/business/client.model';
import { TEST_USER_ID } from '../setup';

/** Local YYYY-MM-DD for a date offset by N months from today. */
function ymdMonthsFromNow(months: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function today(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

describe('RecurringInvoiceService', () => {
  let service: RecurringInvoiceService;
  let invoiceService: InvoiceService;
  let clientService: ClientService;
  let testClient: Client;
  const db = getDbClient();

  beforeAll(async () => {
    service = new RecurringInvoiceService();
    invoiceService = new InvoiceService();
    clientService = new ClientService();

    // Ensure the table exists (mirrors the startup migration) so the test is
    // self-contained regardless of the test container's init.sql vintage.
    await db.query(`
      CREATE TABLE IF NOT EXISTS recurring_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
        start_date DATE NOT NULL,
        end_date DATE,
        next_occurrence DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
        tax_rate_id VARCHAR(50),
        payment_terms_days INTEGER NOT NULL DEFAULT 30,
        invoice_headline VARCHAR(255),
        notes TEXT,
        line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
        last_generated_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query('DELETE FROM recurring_invoices WHERE user_id = $1', [TEST_USER_ID]);

    testClient = await clientService.create({ user_id: TEST_USER_ID, name: 'Retainer Client' });
  });

  afterAll(async () => {
    await db.query('DELETE FROM recurring_invoices WHERE user_id = $1', [TEST_USER_ID]);
  });

  describe('create', () => {
    it('creates a schedule and stores line items', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'Monthly Retainer',
        frequency: 'monthly',
        start_date: today(),
        currency: 'EUR',
        line_items: [{ description: 'Support retainer', quantity: 1, unit_price: 1000 }],
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.title).toBe('Monthly Retainer');
      expect(schedule.is_active).toBe(true);
      expect(schedule.line_items).toHaveLength(1);
      expect(Number(schedule.line_items[0].unit_price)).toBe(1000);
      // start_date is today → first occurrence is today
      expect(schedule.next_occurrence).toBe(today());
    });

    it('does not back-date the first occurrence for a past start date', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'Old Retainer',
        frequency: 'monthly',
        start_date: ymdMonthsFromNow(-5), // 5 months ago
        line_items: [{ description: 'Retainer', quantity: 1, unit_price: 500 }],
      });

      // next_occurrence must be today or later — never in the past
      expect(schedule.next_occurrence! >= today()).toBe(true);
    });
  });

  describe('generateForSchedule', () => {
    it('generates a single draft invoice when due today and advances the occurrence', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'Due Today',
        frequency: 'monthly',
        start_date: today(),
        currency: 'EUR',
        invoice_headline: 'Monthly Services',
        line_items: [
          { description: 'Retainer', quantity: 1, unit_price: 1000 },
          { description: 'Extra hours', quantity: 2, unit_price: 100 },
        ],
      });

      const ids = await service.generateForSchedule(schedule);
      expect(ids).toHaveLength(1);

      const invoice = await invoiceService.findById(ids[0]);
      expect(invoice).not.toBeNull();
      expect(invoice!.status).toBe('draft');
      expect(Number(invoice!.total_amount)).toBe(1200); // 1000 + 2*100
      expect((invoice as any).items).toHaveLength(2);

      // Occurrence advanced one month into the future
      const updated = await service.findById(schedule.id, TEST_USER_ID);
      expect(updated!.next_occurrence).toBe(ymdMonthsFromNow(1));
      expect(updated!.last_generated_at).not.toBeNull();
    });

    it('does not generate when the next occurrence is in the future', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'Future',
        frequency: 'monthly',
        start_date: ymdMonthsFromNow(2),
        line_items: [{ description: 'Retainer', quantity: 1, unit_price: 800 }],
      });

      const ids = await service.generateForSchedule(schedule);
      expect(ids).toHaveLength(0);
    });

    it('deactivates the schedule once it passes its end date', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'Ending Soon',
        frequency: 'monthly',
        start_date: today(),
        end_date: today(), // ends today; after generating today it should deactivate
        line_items: [{ description: 'Final retainer', quantity: 1, unit_price: 300 }],
      });

      const ids = await service.generateForSchedule(schedule);
      expect(ids).toHaveLength(1);

      const updated = await service.findById(schedule.id, TEST_USER_ID);
      expect(updated!.is_active).toBe(false);
      expect(updated!.next_occurrence).toBeNull();
    });
  });

  describe('update', () => {
    it('recomputes next_occurrence when the frequency changes', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'Changing',
        frequency: 'monthly',
        start_date: today(),
        line_items: [{ description: 'Retainer', quantity: 1, unit_price: 200 }],
      });

      const updated = await service.update(schedule.id, TEST_USER_ID, { frequency: 'yearly' });
      expect(updated!.frequency).toBe('yearly');
      expect(updated!.next_occurrence! >= today()).toBe(true);
    });

    it('returns null for a non-existent schedule', async () => {
      const updated = await service.update('00000000-0000-0000-0000-000000000000', TEST_USER_ID, { title: 'X' });
      expect(updated).toBeNull();
    });
  });

  describe('findAllByUser / delete', () => {
    it('lists schedules with client names and deletes one', async () => {
      const schedule = await service.create({
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        title: 'To Delete',
        frequency: 'quarterly',
        start_date: today(),
        line_items: [{ description: 'Retainer', quantity: 1, unit_price: 100 }],
      });

      const list = await service.findAllByUser(TEST_USER_ID);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.find((s) => s.id === schedule.id)?.client_name).toBe('Retainer Client');

      const deleted = await service.delete(schedule.id, TEST_USER_ID);
      expect(deleted).toBe(true);
      expect(await service.findById(schedule.id, TEST_USER_ID)).toBeNull();
    });
  });
});
