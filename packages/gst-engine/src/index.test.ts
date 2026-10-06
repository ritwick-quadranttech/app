import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@repo/gst-engine', () => {
  it('is wired up', () => {
    expect(PACKAGE_NAME).toBe('@repo/gst-engine');
  });
});
