import { Request, Response } from 'express';
import { ClientController } from '../../src/controllers/business/client.controller';
import { ClientService } from '../../src/services/business/client.service';

/**
 * Regression coverage for the controller's Joi whitelists.
 *
 * Joi rejects unknown keys, so any field the form submits that is missing from
 * createClientSchema/updateClientSchema fails the request with a 400 instead of
 * being persisted. The billing fields were supported by the service and the
 * schema all along, but absent from both whitelists.
 */
describe('ClientController validation', () => {
  let controller: ClientController;
  let res: Response;

  beforeEach(() => {
    controller = new ClientController();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const billingPayload = {
    name: 'NovaSearch',
    status: 'active',
    use_separate_billing_address: true,
    billing_contact_person: 'Finance Team',
    billing_email: 'finance@nova-search.com',
    billing_phone: '+49 (30) 123-4567',
    billing_address: 'Jungfernstieg 7',
    billing_city: 'Hamburg',
    billing_state: 'HH',
    billing_postal_code: '20354',
    billing_country: 'Germany',
    billing_tax_id: 'DE123456789',
  };

  it('accepts billing fields on update and forwards them to the service', async () => {
    const updateSpy = jest
      .spyOn(ClientService.prototype, 'update')
      .mockResolvedValue({ id: 'client-1', ...billingPayload } as any);

    const req = {
      params: { id: 'client-1' },
      body: billingPayload,
    } as unknown as Request;

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledWith('client-1', expect.objectContaining(billingPayload));
  });

  it('accepts billing fields on create and forwards them to the service', async () => {
    const createSpy = jest
      .spyOn(ClientService.prototype, 'create')
      .mockResolvedValue({ id: 'client-1', ...billingPayload } as any);

    const req = {
      body: billingPayload,
      user: { id: 'user-1' },
    } as unknown as Request;

    await controller.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining(billingPayload));
  });

  it('updates a single billing field without requiring the rest', async () => {
    const updateSpy = jest
      .spyOn(ClientService.prototype, 'update')
      .mockResolvedValue({ id: 'client-1' } as any);

    const req = {
      params: { id: 'client-1' },
      body: { billing_email: 'finance@nova-search.com' },
    } as unknown as Request;

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledWith('client-1', { billing_email: 'finance@nova-search.com' });
  });

  it('still rejects a malformed billing email', async () => {
    const updateSpy = jest.spyOn(ClientService.prototype, 'update');

    const req = {
      params: { id: 'client-1' },
      body: { billing_email: 'not-an-email' },
    } as unknown as Request;

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('still rejects genuinely unknown fields', async () => {
    const updateSpy = jest.spyOn(ClientService.prototype, 'update');

    const req = {
      params: { id: 'client-1' },
      body: { not_a_column: 'nope' },
    } as unknown as Request;

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
