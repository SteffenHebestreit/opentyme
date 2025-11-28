import { InvoiceService } from '../../src/services/financial/invoice.service';
import { ClientService } from '../../src/services/business/client.service';
import { CreateInvoiceDto, InvoiceItem } from '../../src/models/financial/invoice.model';
import { Client } from '../../src/models/business/client.model';
import { TEST_USER_ID } from '../setup';

describe('InvoiceService', () => {
  let invoiceService: InvoiceService;
  let clientService: ClientService;
  let testClient: Client;

  beforeAll(async () => {
    invoiceService = new InvoiceService();
    clientService = new ClientService();

    testClient = await clientService.create({ user_id: TEST_USER_ID, name: 'Test Client for Invoices' });
  });

  afterEach(async () => {
    // Database cleanup is handled by global setup
  });

  afterAll(async () => {
    // Database cleanup is handled by global setup
  });

  describe('create', () => {
    it('should create a new invoice with a generated invoice number', async () => {
      const invoiceData: CreateInvoiceDto = {
        user_id: TEST_USER_ID,
        client_id: testClient.id,
        issue_date: new Date(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      };

      const invoice = await invoiceService.create(invoiceData);

      expect(invoice).toBeDefined();
      expect(invoice.id).toBeDefined();
      expect(invoice.invoice_number).toBeDefined();
      expect(invoice.status).toBe('draft');
    });
  });

  describe('findAll', () => {
    it('should return all invoices', async () => {
      await invoiceService.create({ user_id: TEST_USER_ID, client_id: testClient.id, issue_date: new Date(), due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      await invoiceService.create({ user_id: TEST_USER_ID, client_id: testClient.id, issue_date: new Date(), due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });

      const invoices = await invoiceService.findAll(TEST_USER_ID);
      // Should have at least 2 invoices (may have more from previous test runs)
      expect(invoices.length).toBeGreaterThanOrEqual(2);
      // Verify they have the expected structure
      expect(invoices[0].invoice_number).toBeDefined();
      expect(invoices[0].user_id).toBe(TEST_USER_ID);
    });
  });

  describe('findById', () => {
    it('should return an invoice if found', async () => {
      const newInvoice = await invoiceService.create({ user_id: TEST_USER_ID, client_id: testClient.id, issue_date: new Date(), due_date: new Date() });
      const foundInvoice = await invoiceService.findById(newInvoice.id);
      expect(foundInvoice).toBeDefined();
      expect(foundInvoice?.id).toBe(newInvoice.id);
    });

    it('should return null if invoice not found', async () => {
      const foundInvoice = await invoiceService.findById('00000000-0000-0000-0000-000000000000');
      expect(foundInvoice).toBeNull();
    });
  });

  describe('update', () => {
    it('should update an invoice', async () => {
      const newInvoice = await invoiceService.create({ user_id: TEST_USER_ID, client_id: testClient.id, issue_date: new Date(), due_date: new Date(), status: 'draft' });
      const updatedData = { status: 'sent' as const };
      const updatedInvoice = await invoiceService.update(newInvoice.id, updatedData);

      expect(updatedInvoice).toBeDefined();
      expect(updatedInvoice?.status).toBe('sent');
    });
  });

  describe('delete', () => {
    it('should delete an invoice and return true', async () => {
      const newInvoice = await invoiceService.create({ user_id: TEST_USER_ID, client_id: testClient.id, issue_date: new Date(), due_date: new Date() });
      const result = await invoiceService.delete(newInvoice.id);
      expect(result).toBe(true);

      const foundInvoice = await invoiceService.findById(newInvoice.id);
      expect(foundInvoice).toBeNull();
    });

    it('should return false if invoice to delete is not found', async () => {
      const result = await invoiceService.delete('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });

  describe('addLineItems and calculateInvoiceTotals', () => {
    it('should add line items to an invoice and calculate totals', async () => {
      const newInvoice = await invoiceService.create({ 
        user_id: TEST_USER_ID,
        client_id: testClient.id, 
        issue_date: new Date(),
        due_date: new Date(),
      });

      await invoiceService.addLineItems(newInvoice.id, [
        { description: 'Item 1', quantity: 2, unit_price: 50, total_price: 100 } as any,
        { description: 'Item 2', quantity: 1, unit_price: 75, total_price: 75 } as any,
      ]);

      // Re-fetch the invoice to see calculated totals
      const updatedInvoice = await invoiceService.findById(newInvoice.id);
      expect(updatedInvoice).toBeDefined();
      expect(parseFloat(updatedInvoice?.sub_total as any)).toBe(175); // 100 + 75
      expect(parseFloat(updatedInvoice?.total_amount as any)).toBe(175); // No tax in this example
    });
  });
});
