import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovalsService } from './approvals.service';
import { PendingAction } from './entities/pending-action.entity';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
};

function makeService(): { service: ApprovalsService; repo: MockRepo } {
  const repo: MockRepo = {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (entity) => entity),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };
  const config = { get: () => 'http://ai-brain:8000' } as unknown as ConfigService;
  const service = new ApprovalsService(repo as unknown as never, config);
  return { service, repo };
}

describe('ApprovalsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queues a new action with pending status', async () => {
    const { service, repo } = makeService();
    const action = await service.queue('terminal_run', 'Run shell command: "ls"', { path: 'terminal/run', method: 'POST', body: { command: 'ls' } });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'terminal_run', status: 'pending' }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(action.status).toBe('pending');
  });

  it('rejects approving/rejecting an action that does not exist', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(null);
    await expect(service.approve('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reject('missing-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to re-decide an action that is not pending', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue({ id: '1', status: 'approved' } as PendingAction);
    await expect(service.approve('1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reject() marks the action rejected without calling the AI Brain', async () => {
    const { service, repo } = makeService();
    const fetchSpy = jest.spyOn(global, 'fetch');
    repo.findOne.mockResolvedValue({ id: '1', status: 'pending' } as PendingAction);

    const result = await service.reject('1');

    expect(result.status).toBe('rejected');
    expect(result.decidedAt).toBeInstanceOf(Date);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('approve() executes the stored payload against the AI Brain and marks it executed on success', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue({
      id: '1',
      status: 'pending',
      payload: { path: 'terminal/run', method: 'POST', body: { command: 'ls' } },
    } as PendingAction);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'file1\nfile2' }),
    } as Response);

    const result = await service.approve('1');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-brain:8000/v1/tools/terminal/run',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe('executed');
    expect(result.result).toEqual({ output: 'file1\nfile2' });
  });

  it('approve() marks the action failed (not thrown) when the AI Brain call errors', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue({
      id: '1',
      status: 'pending',
      payload: { path: 'terminal/run', method: 'POST', body: {} },
    } as PendingAction);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await service.approve('1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('approve() marks the action failed when the AI Brain returns a non-2xx response', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue({
      id: '1',
      status: 'pending',
      payload: { path: 'docker/restart/aios_gateway', method: 'POST', body: {} },
    } as PendingAction);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'boom' }),
    } as Response);

    const result = await service.approve('1');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('boom');
  });
});
