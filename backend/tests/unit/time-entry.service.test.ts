import { TimeEntryService } from '../../src/services/business/time-entry.service';
import { ProjectService } from '../../src/services/business/project.service';
import { ClientService } from '../../src/services/business/client.service';
import { CreateTimeEntryDto } from '../../src/models/business/time-entry.model';
import { Client } from '../../src/models/business/client.model';
import { Project } from '../../src/models/business/project.model';
import { TEST_USER_ID } from '../setup';

describe('TimeEntryService', () => {
  let timeEntryService: TimeEntryService;
  let projectService: ProjectService;
  let clientService: ClientService;
  let testClient: Client;
  let testProject: Project;

  beforeAll(async () => {
    timeEntryService = new TimeEntryService();
    projectService = new ProjectService();
    clientService = new ClientService();

    // Use global test user
    testClient = await clientService.create({ user_id: TEST_USER_ID, name: 'Test Client for Time Entries' });
    testProject = await projectService.create({ user_id: TEST_USER_ID, name: 'Test Project for Time Entries', client_id: testClient.id });
  });

  beforeEach(async () => {
    // Database cleanup is handled by global setup
  });

  afterEach(async () => {
    // Database cleanup is handled by global setup
  });

  afterAll(async () => {
    // Database cleanup is handled by global setup
  });

  describe('create', () => {
    it('should create a new time entry', async () => {
      const dateStart = new Date();
      const dateEnd = new Date(dateStart.getTime() + 60 * 60 * 1000); // 1 hour later
      const timeEntryData: CreateTimeEntryDto = {
        user_id: TEST_USER_ID,
        project_id: testProject.id,
        description: 'Doing some work',
        entry_date: new Date(),
        entry_time: '10:00',
        duration_hours: 1,
        is_billable: true,
        category: 'development',
      };

      const timeEntry = await timeEntryService.create(timeEntryData);

      expect(timeEntry).toBeDefined();
      expect(timeEntry.id).toBeDefined();
      expect(timeEntry.description).toBe('Doing some work');
      expect(parseFloat(timeEntry.duration_hours as any)).toBe(1); // 1 hour (PostgreSQL returns decimal as string)
      expect(timeEntry.project).toBeDefined();
      expect(timeEntry.project?.id).toBe(testProject.id);
    });
  });

  describe('findAll', () => {
    it('should find all time entries for a project', async () => {
      const dateStart = new Date();
      await timeEntryService.create({ 
        user_id: TEST_USER_ID, 
        project_id: testProject.id, 
        entry_date: new Date(),
        entry_time: '10:00',
        duration_hours: 1
      });
      await timeEntryService.create({ 
        user_id: TEST_USER_ID, 
        project_id: testProject.id, 
        entry_date: new Date(),
        entry_time: '12:00',
        duration_hours: 1
      });

      const entries = await timeEntryService.findAll({ user_id: TEST_USER_ID, project_id: testProject.id });
      // Should have at least 2 entries (may have more from previous test runs)
      expect(entries.length).toBeGreaterThanOrEqual(2);
      // Verify they all belong to the test project
      entries.forEach(entry => {
        expect(entry.project_id).toBe(testProject.id);
      });
    });
  });

  describe('update', () => {
    it('should update a time entry', async () => {
      const dateStart = new Date();
      const newEntry = await timeEntryService.create({ 
        user_id: TEST_USER_ID, 
        project_id: testProject.id, 
        entry_date: new Date(),
        entry_time: '10:00',
        duration_hours: 1,
        description: 'Original' 
      });
      
      const updatedData = { description: 'Updated description' };
      const updatedEntry = await timeEntryService.update(newEntry.id, updatedData);

      expect(updatedEntry).toBeDefined();
      expect(updatedEntry?.description).toBe('Updated description');
    });
  });

  describe('delete', () => {
    it('should delete a time entry', async () => {
      const dateStart = new Date();
      const newEntry = await timeEntryService.create({ 
        user_id: TEST_USER_ID, 
        project_id: testProject.id, 
        entry_date: new Date(),
        entry_time: '10:00',
        duration_hours: 1
      });
      
      const result = await timeEntryService.delete(newEntry.id);
      expect(result).toBe(true);

      const foundEntry = await timeEntryService.findById(newEntry.id);
      expect(foundEntry).toBeNull();
    });
  });
});
