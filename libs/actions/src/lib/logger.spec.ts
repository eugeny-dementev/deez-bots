import { InjectLogger, Logger, loggerFactory } from './logger.js';

const originalEnv = { ...process.env };

describe('Logger', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
    process.env = { ...originalEnv };
  });

  it('respects minimum log level', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = loggerFactory();

    logger.debug('debug');
    logger.info('info');

    expect(console.log).toHaveBeenCalledTimes(1);
    expect((console.log as jest.Mock).mock.calls[0][0]).toContain('[info]');
  });

  it('filters out lower level logs', () => {
    process.env.LOG_LEVEL = 'error';
    const logger = loggerFactory();

    logger.info('info');
    logger.error(new Error('boom'));

    expect(console.log).toHaveBeenCalledTimes(1);
    expect((console.log as jest.Mock).mock.calls[0][0]).toContain('[error]');
  });

  it('defaults when log level is invalid', () => {
    process.env.LOG_LEVEL = 'nope';
    const logger = loggerFactory();

    logger.debug('debug');
    logger.info('info');

    expect(console.log).toHaveBeenCalledTimes(1);
    expect((console.log as jest.Mock).mock.calls[0][0]).toContain('[info]');
  });

  it('uses provided level in constructor', () => {
    const logger = new Logger('warn');

    logger.info('info');
    logger.warn('warn');

    expect(console.log).toHaveBeenCalledTimes(1);
    expect((console.log as jest.Mock).mock.calls[0][0]).toContain('[warn]');
  });
});

describe('InjectLogger', () => {
  it('does not override existing logger', async () => {
    const action = new InjectLogger();
    const logger = { info: jest.fn() } as any;
    const extend = jest.fn();

    await action.execute({ logger, extend } as any);

    expect(extend).not.toHaveBeenCalled();
  });

  it('injects logger when missing', async () => {
    const action = new InjectLogger();
    const extend = jest.fn();

    await action.execute({ extend } as any);

    expect(extend).toHaveBeenCalled();
  });
});
