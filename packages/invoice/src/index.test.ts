import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@repo/invoice', () => {
  it('is wired up', () => {
    expect(PACKAGE_NAME).toBe('@repo/invoice');
  });
});
