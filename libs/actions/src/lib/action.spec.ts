import { Action, lockingClassFactory } from './action.js';

describe('Action error handling', () => {
  it('calls logger, terr, and abort on error', async () => {
    const action = new class extends Action<null> {
      async execute() {
        return;
      }
    }();

    const logger = { error: jest.fn() };
    const terr = jest.fn();
    const abort = jest.fn();

    await action.onError(new Error('boom'), { logger, terr, abort } as any);

    expect(logger.error).toHaveBeenCalled();
    expect(terr).toHaveBeenCalled();
    expect(abort).toHaveBeenCalled();
  });

  it('handles missing logger/terr gracefully', async () => {
    const action = new class extends Action<null> {
      async execute() {
        return;
      }
    }();

    const abort = jest.fn();

    await action.onError(new Error('boom'), { abort } as any);

    expect(abort).toHaveBeenCalled();
  });
});

describe('lockingClassFactory', () => {
  it('uses the same onError behavior', async () => {
    class TestAction extends lockingClassFactory<null>('scope') {
      async execute() {
        return;
      }
    }

    const action = new TestAction();
    const logger = { error: jest.fn() };
    const terr = jest.fn();
    const abort = jest.fn();

    await action.onError(new Error('boom'), { logger, terr, abort } as any);

    expect(logger.error).toHaveBeenCalled();
    expect(terr).toHaveBeenCalled();
    expect(abort).toHaveBeenCalled();
  });
});
