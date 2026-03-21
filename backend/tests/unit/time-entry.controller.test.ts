import { Request, Response } from 'express';
import { TimeEntryController } from '../../src/controllers/business/time-entry.controller';
import { TimeEntryService } from '../../src/services/business/time-entry.service';

describe('TimeEntryController timer flow', () => {
  let controller: TimeEntryController;
  let res: Response;

  beforeEach(() => {
    controller = new TimeEntryController();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks starting a timer when an active entry already exists', async () => {
    jest.spyOn(TimeEntryService.prototype, 'findAll').mockResolvedValue([
      {
        id: 'active-entry',
        user_id: 'user-1',
        project_id: 'project-1',
        description: '',
        task_name: null,
        entry_date: new Date('2026-03-16T10:00:00Z'),
        entry_time: '10:00:00',
        entry_end_time: null,
        duration_hours: 0,
        is_billable: true,
        category: null,
        tags: null,
        hourly_rate: null,
        created_at: new Date('2026-03-16T10:00:00Z'),
        updated_at: new Date('2026-03-16T10:00:00Z'),
        date_start: new Date('2026-03-16T10:00:00Z'),
      },
    ] as any);

    const req = {
      body: { project_id: 'project-2' },
      user: { id: 'user-1' },
    } as unknown as Request;

    await controller.startTimer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('already have an active timer'),
      })
    );
  });

  it('stops the requested active timer when time_entry_id is provided', async () => {
    const updateSpy = jest.spyOn(TimeEntryService.prototype, 'update').mockResolvedValue({
      id: 'older-active',
      user_id: 'user-1',
      project_id: 'project-1',
      description: '',
      task_name: null,
      entry_date: new Date('2026-03-16T09:00:00Z'),
      entry_time: '09:00:00',
      entry_end_time: '09:15:00',
      duration_hours: 0.25,
      is_billable: true,
      category: null,
      tags: null,
      hourly_rate: null,
      created_at: new Date('2026-03-16T09:00:00Z'),
      updated_at: new Date('2026-03-16T09:15:00Z'),
      date_start: new Date('2026-03-16T09:00:00Z'),
    } as any);

    jest.spyOn(TimeEntryService.prototype, 'findAll').mockResolvedValue([
      {
        id: 'newer-active',
        user_id: 'user-1',
        project_id: 'project-2',
        description: '',
        task_name: null,
        entry_date: new Date('2026-03-18T10:00:00Z'),
        entry_time: '10:00:00',
        entry_end_time: null,
        duration_hours: 0,
        is_billable: true,
        category: null,
        tags: null,
        hourly_rate: null,
        created_at: new Date('2026-03-18T10:00:00Z'),
        updated_at: new Date('2026-03-18T10:00:00Z'),
        date_start: new Date('2026-03-18T10:00:00Z'),
      },
      {
        id: 'older-active',
        user_id: 'user-1',
        project_id: 'project-1',
        description: '',
        task_name: null,
        entry_date: new Date('2026-03-16T09:00:00Z'),
        entry_time: '09:00:00',
        entry_end_time: null,
        duration_hours: 0,
        is_billable: true,
        category: null,
        tags: null,
        hourly_rate: null,
        created_at: new Date('2026-03-16T09:00:00Z'),
        updated_at: new Date('2026-03-16T09:00:00Z'),
        date_start: new Date('2026-03-16T09:00:00Z'),
      },
    ] as any);

    const req = {
      body: { time_entry_id: 'older-active' },
      user: { id: 'user-1' },
    } as unknown as Request;

    await controller.stopTimer(req, res);

    expect(updateSpy).toHaveBeenCalledWith('older-active', expect.any(Object));
    expect(updateSpy).toHaveBeenCalledWith('newer-active', expect.any(Object));
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});