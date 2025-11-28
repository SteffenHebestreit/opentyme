import { ProjectService } from '../../src/services/business/project.service';
import { ClientService } from '../../src/services/business/client.service';
import { CreateProjectDto } from '../../src/models/business/project.model';
import { Client } from '../../src/models/business/client.model';
import { TEST_USER_ID } from '../setup';

describe('ProjectService', () => {
  let projectService: ProjectService;
  let clientService: ClientService;
  let testClient: Client;

  beforeAll(async () => {
    projectService = new ProjectService();
    clientService = new ClientService();
    
    // Create a test client for foreign key relationships using global test user
    testClient = await clientService.create({ user_id: TEST_USER_ID, name: 'Test Client' });
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
    it('should create a new project with an associated client', async () => {
      const projectData: CreateProjectDto = {
        user_id: TEST_USER_ID,
        name: 'Test Project',
        client_id: testClient.id,
        status: 'active' as const,
      };

      const project = await projectService.create(projectData);

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Project');
      expect(project.client).toBeDefined();
      expect(project.client?.id).toBe(testClient.id);
    });

    it('should throw an error for an invalid client ID', async () => {
      const projectData: CreateProjectDto = {
        user_id: TEST_USER_ID,
        name: 'Invalid Project',
        client_id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(projectService.create(projectData)).rejects.toThrow('Invalid client ID specified.');
    });
  });

  describe('findAll', () => {
    it('should return all projects with their clients', async () => {
      await projectService.create({ user_id: TEST_USER_ID, name: 'Project A', client_id: testClient.id });
      await projectService.create({ user_id: TEST_USER_ID, name: 'Project B', client_id: testClient.id });

      const projects = await projectService.findAll(TEST_USER_ID);
      // Should have at least 2 projects (may have more from previous test runs)
      expect(projects.length).toBeGreaterThanOrEqual(2);
      // Verify our specific projects exist
      const projectNames = projects.map(p => p.name);
      expect(projectNames).toContain('Project A');
      expect(projectNames).toContain('Project B');
      // Verify client join works
      expect(projects[0].client).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should return a project with its client if found', async () => {
      const newProject = await projectService.create({ user_id: TEST_USER_ID, name: 'Find Me Project', client_id: testClient.id });
      const foundProject = await projectService.findById(newProject.id);
      expect(foundProject).toBeDefined();
      expect(foundProject?.id).toBe(newProject.id);
      expect(foundProject?.client?.id).toBe(testClient.id);
    });
  });

  describe('update', () => {
    it('should update a project', async () => {
      const newProject = await projectService.create({ user_id: TEST_USER_ID, name: 'To Be Updated Project', client_id: testClient.id });
      const updatedData = { name: 'Updated Project', status: 'completed' as const };
      const updatedProject = await projectService.update(newProject.id, updatedData);

      expect(updatedProject).toBeDefined();
      expect(updatedProject?.name).toBe('Updated Project');
      expect(updatedProject?.status).toBe('completed');
    });
  });

  describe('delete', () => {
    it('should delete a project and return true', async () => {
      const newProject = await projectService.create({ user_id: TEST_USER_ID, name: 'To Be Deleted Project', client_id: testClient.id });
      const result = await projectService.delete(newProject.id);
      expect(result).toBe(true);

      const foundProject = await projectService.findById(newProject.id);
      expect(foundProject).toBeNull();
    });
  });
});
