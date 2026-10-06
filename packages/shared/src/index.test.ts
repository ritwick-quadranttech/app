import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@repo/shared', () => {
  it('is wired up', () => {
    expect(PACKAGE_NAME).toBe('@repo/shared');
  });
});
