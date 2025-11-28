import { ClientService } from '../../src/services/business/client.service';
import { CreateClientDto } from '../../src/models/business/client.model';
import { TEST_USER_ID } from '../setup';

describe('ClientService', () => {
  let clientService: ClientService;

  beforeAll(async () => {
    // Service will use real PostgreSQL test database via database.ts
    clientService = new ClientService();
  });

  describe('create', () => {
    it('should create a new client', async () => {
      const clientData: CreateClientDto = {
        user_id: TEST_USER_ID,
        name: 'Test Client',
        email: 'client@test.com',
      };

      const client = await clientService.create(clientData);

      expect(client).toBeDefined();
      expect(client.id).toBeDefined();
      expect(client.user_id).toBe(TEST_USER_ID);
      expect(client.name).toBe('Test Client');
      expect(client.email).toBe('client@test.com');
    });
  });

  describe('findAll', () => {
    it('should return all clients', async () => {
      await clientService.create({ user_id: TEST_USER_ID, name: 'Client A' });
      await clientService.create({ user_id: TEST_USER_ID, name: 'Client B' });

      const clients = await clientService.findAll(TEST_USER_ID);
      // Should have at least 2 clients (may have more from previous test runs)
      expect(clients.length).toBeGreaterThanOrEqual(2);
      // Verify our specific clients exist
      const clientNames = clients.map(c => c.name);
      expect(clientNames).toContain('Client A');
      expect(clientNames).toContain('Client B');
    });
  });

  describe('findById', () => {
    it('should return a client if found', async () => {
      const newClient = await clientService.create({ user_id: TEST_USER_ID, name: 'Find Me' });
      const foundClient = await clientService.findById(newClient.id);
      expect(foundClient).toBeDefined();
      expect(foundClient?.id).toBe(newClient.id);
    });

    it('should return null if client not found', async () => {
      const foundClient = await clientService.findById('00000000-0000-0000-0000-000000000000');
      expect(foundClient).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a client', async () => {
      const newClient = await clientService.create({ user_id: TEST_USER_ID, name: 'To Be Updated' });
      const updatedData = { name: 'Updated Client', status: 'inactive' as const };
      const updatedClient = await clientService.update(newClient.id, updatedData);

      expect(updatedClient).toBeDefined();
      expect(updatedClient?.name).toBe('Updated Client');
      expect(updatedClient?.status).toBe('inactive');
    });
  });

  describe('delete', () => {
    it('should delete a client and return true', async () => {
      const newClient = await clientService.create({ user_id: TEST_USER_ID, name: 'To Be Deleted' });
      const result = await clientService.delete(newClient.id);
      expect(result).toBe(true);

      const foundClient = await clientService.findById(newClient.id);
      expect(foundClient).toBeNull();
    });

    it('should return false if client to delete is not found', async () => {
      const result = await clientService.delete('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });
});
