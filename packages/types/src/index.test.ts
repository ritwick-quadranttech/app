import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@repo/types', () => {
  it('is wired up', () => {
    expect(PACKAGE_NAME).toBe('@repo/types');
  });
});
