import { Request, Response } from 'express';
import { ProjectController } from '../../src/controllers/business/project.controller';
import { ProjectService } from '../../src/services/business/project.service';
import { ProjectRateService } from '../../src/services/business/project-rate.service';
import { ClientService } from '../../src/services/business/client.service';
import { TimeEntryService } from '../../src/services/business/time-entry.service';
import { getDbClient } from '../../src/utils/database';
import { TEST_USER_ID } from '../setup';

function ymd(daysFromToday = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().split('T')[0];
}

/**
 * Changing a project's hourly rate through the API must always say from which
 * day the new rate applies. Without a date the change silently applied "from
 * today" — wrong for a contract extension that starts on the 1st of next month.
 */
describe('ProjectController.update — hourly rate changes need a start date', () => {
  const controller = new ProjectController();
  const projectService = new ProjectService();
  const rateService = new ProjectRateService();
  const db = getDbClient();
  let clientId: string;

  beforeAll(async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_rate_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        hourly_rate NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
        valid_from DATE NOT NULL,
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_rate_history_project_date
        ON project_rate_history(project_id, valid_from);
    `);
    clientId = (await new ClientService().create({ user_id: TEST_USER_ID, name: 'Rate Update Client' })).id;
  });

  function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response & { status: jest.Mock; json: jest.Mock };
  }

  async function hourlyProject(rate = 80) {
    return projectService.create({
      user_id: TEST_USER_ID,
      name: 'Rate Update Project',
      client_id: clientId,
      rate_type: 'hourly',
      hourly_rate: rate,
      start_date: ymd(-90) as any,
    } as any);
  }

  async function put(projectId: string, body: Record<string, unknown>, userId = TEST_USER_ID) {
    const res = mockRes();
    await controller.update(
      { params: { id: projectId }, body, user: { id: userId } } as unknown as Request,
      res
    );
    return res;
  }

  it('rejects a rate change without a start date', async () => {
    const project = await hourlyProject(80);

    const res = await put(project.id, { rate_type: 'hourly', hourly_rate: 95 });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('RATE_START_DATE_REQUIRED');
    // Nothing was changed.
    expect(await rateService.getEffectiveRate(project.id, TEST_USER_ID)).toBe(80);
  });

  it('applies a rate change from the given day, not from today', async () => {
    const project = await hourlyProject(80);

    const res = await put(project.id, {
      rate_type: 'hourly',
      hourly_rate: 95,
      hourly_rate_valid_from: ymd(30),
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(await rateService.getEffectiveRate(project.id, TEST_USER_ID)).toBe(80);
    expect(await rateService.getEffectiveRate(project.id, TEST_USER_ID, ymd(30))).toBe(95);
  });

  it('does not create a rate period when only other fields change', async () => {
    const project = await hourlyProject(80);
    const before = (await rateService.listRates(project.id, TEST_USER_ID)).length;

    // The form re-sends the unchanged rate on every save.
    const res = await put(project.id, { name: 'Renamed', rate_type: 'hourly', hourly_rate: 80 });

    expect(res.status).toHaveBeenCalledWith(200);
    expect((await rateService.listRates(project.id, TEST_USER_ID)).length).toBe(before);
  });

  it('refuses to update another tenant project', async () => {
    const project = await hourlyProject(80);

    const res = await put(project.id, { name: 'Hijacked' }, '99999999-9999-4999-8999-999999999999');

    expect(res.status).toHaveBeenCalledWith(404);
    expect((await projectService.findById(project.id, TEST_USER_ID))?.name).toBe('Rate Update Project');
  });
  it('moves entries dated from the start date when the rate is changed on the project form', async () => {
    // The reported case, through the exact path it took: the project form.
    const project = await hourlyProject(80);
    const timeEntryService = new TimeEntryService();
    const entries = [];
    for (const day of [-9, -8, -5, -2]) {
      entries.push(
        await timeEntryService.create({
          user_id: TEST_USER_ID, project_id: project.id, description: 'logged before the change',
          entry_date: ymd(day) as any, entry_time: '09:00:00', duration_hours: 3, is_billable: true,
        } as any)
      );
    }
    const earlier = await timeEntryService.create({
      user_id: TEST_USER_ID, project_id: project.id, description: 'before the start date',
      entry_date: ymd(-20) as any, entry_time: '09:00:00', duration_hours: 3, is_billable: true,
    } as any);

    const res = await put(project.id, { rate_type: 'hourly', hourly_rate: 85, hourly_rate_valid_from: ymd(-10) });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].repriced_entries).toBe(4);
    for (const entry of entries) {
      expect(parseFloat((await timeEntryService.findById(entry.id, TEST_USER_ID))?.hourly_rate as any)).toBe(85);
    }
    expect(parseFloat((await timeEntryService.findById(earlier.id, TEST_USER_ID))?.hourly_rate as any)).toBe(80);
  });
});
