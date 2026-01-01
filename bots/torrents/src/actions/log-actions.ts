import { Action } from '@libs/actions';
import { omit } from '../helpers.js';

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'extend', 'name', 'browser', 'page', 'tlog', 'terr', 'abort'));
  }
}
