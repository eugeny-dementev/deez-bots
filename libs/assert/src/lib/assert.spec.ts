import { assert } from './assert';

describe('assert', () => {
  it('should work', () => {
    expect(() => assert(false, 'some', {})).toThrow(new Error('some'));
  });
});
