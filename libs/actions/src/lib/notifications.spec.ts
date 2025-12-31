import { InjectNotifications, MultiLineMessage, notifications } from './notifications.js';

jest.mock('clean-stack', () => ({
  __esModule: true,
  default: jest.fn(() => 'clean-stack'),
}));

describe('MultiLineMessage', () => {
  it('adds and edits lines', () => {
    const mlm = new MultiLineMessage();

    mlm.add('one');
    mlm.add('two');
    expect(mlm.toString()).toBe('one\ntwo');

    mlm.edit('last');
    expect(mlm.toString()).toBe('one\nlast');
  });

  it('edit adds when empty', () => {
    const mlm = new MultiLineMessage();
    mlm.edit('first');
    expect(mlm.toString()).toBe('first');
  });
});

describe('InjectNotifications', () => {
  const createContext = () => {
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 101 });
    const editMessageText = jest.fn().mockResolvedValue(true);
    const bot = { api: { sendMessage, editMessageText } };
    const extend = jest.fn((values) => Object.assign(context, values));
    const context = {
      bot,
      chatId: 1,
      adminId: 2,
      cleanStack: jest.fn(() => 'clean-stack'),
      extend,
    } as any;

    return { context, sendMessage, editMessageText };
  };

  it('sends and edits multiline messages', async () => {
    const action = new InjectNotifications();
    const { context, sendMessage, editMessageText } = createContext();

    await action.execute(context);

    await context.tadd('line1');
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await context.tlog('line2');
    expect(editMessageText).toHaveBeenCalledTimes(1);

    await context.tlog('line2');
    expect(editMessageText).toHaveBeenCalledTimes(1);
  });

  it('sends error to admin for string message', async () => {
    const action = new InjectNotifications();
    const { context, sendMessage } = createContext();

    await action.execute(context);
    await context.terr('boom');

    expect(sendMessage).toHaveBeenCalledWith(2, 'boom');
  });

  it('sends stack trace to admin for Error', async () => {
    const action = new InjectNotifications();
    const { context, sendMessage } = createContext();

    await action.execute(context);
    await context.terr(new Error('boom'));

    const args = sendMessage.mock.calls[0];
    expect(args[0]).toBe(2);
    expect(args[1]).toContain('```');
  });

  it('logs when adminId is missing', async () => {
    const action = new InjectNotifications();
    const sendMessage = jest.fn();
    const editMessageText = jest.fn();
    const bot = { api: { sendMessage, editMessageText } };
    const extend = jest.fn((values) => Object.assign(context, values));
    const context = {
      bot,
      chatId: 1,
      adminId: 0,
      cleanStack: jest.fn(() => 'clean-stack'),
      extend,
    } as any;

    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await action.execute(context);
    await context.terr('boom');

    expect(console.error).toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    (console.error as jest.Mock).mockRestore();
  });
});

describe('notifications helpers', () => {
  it('tlog calls context.tlog', async () => {
    const ActionClass = notifications.tlog('msg');
    const action = new ActionClass();
    const tlog = jest.fn();

    await action.execute({ tlog } as any);

    expect(tlog).toHaveBeenCalledWith('msg', undefined);
  });

  it('tlog resolves message from function', async () => {
    const ActionClass = notifications.tlog<{ id: number }>((ctx) => `msg:${ctx.id}`);
    const action = new ActionClass();
    const tlog = jest.fn();

    await action.execute({ tlog, id: 7 } as any);

    expect(tlog).toHaveBeenCalledWith('msg:7', undefined);
  });

  it('tadd calls context.tadd', async () => {
    const ActionClass = notifications.tadd('msg');
    const action = new ActionClass();
    const tadd = jest.fn();

    await action.execute({ tadd } as any);

    expect(tadd).toHaveBeenCalledWith('msg', undefined);
  });

  it('tadd resolves message from function', async () => {
    const ActionClass = notifications.tadd<{ id: number }>((ctx) => `msg:${ctx.id}`);
    const action = new ActionClass();
    const tadd = jest.fn();

    await action.execute({ tadd, id: 3 } as any);

    expect(tadd).toHaveBeenCalledWith('msg:3', undefined);
  });
});
