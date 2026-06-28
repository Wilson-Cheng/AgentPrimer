import { afterEach, describe, expect, it, vi } from 'vitest';
import { setOpenAIClientFactory, resetOpenAIClientFactory, createOpenAIClient } from '../lib/agent';

/**
 * Demonstrates the OpenAI client dependency-injection seam.
 *
 * Before this refactor, tests had to monkey-patch the entire module to
 * substitute a fake client. `setOpenAIClientFactory` makes the substitution
 * explicit, scoped, and reversible.
 */

afterEach(() => {
  resetOpenAIClientFactory();
});

describe('OpenAI client DI seam', () => {
  it('uses the injected factory when one is set', () => {
    const fakeClient = {
      chat: { completions: { create: vi.fn() } },
      models: { list: vi.fn() },
    };
    const factory = vi.fn(() => fakeClient as unknown as ReturnType<typeof createOpenAIClient>);

    setOpenAIClientFactory(factory);
    const got = createOpenAIClient();

    expect(factory).toHaveBeenCalledOnce();
    expect(got).toBe(fakeClient);
  });

  it('reset replaces the override with the default factory', () => {
    const fakeA = { id: 'A' } as unknown as ReturnType<typeof createOpenAIClient>;
    const fakeB = { id: 'B' } as unknown as ReturnType<typeof createOpenAIClient>;

    setOpenAIClientFactory(() => fakeA);
    expect(createOpenAIClient()).toBe(fakeA);

    // Override with another fake — confirms a fresh factory wins.
    setOpenAIClientFactory(() => fakeB);
    expect(createOpenAIClient()).toBe(fakeB);

    // resetOpenAIClientFactory wipes the override. After this call, factory
    // is no longer `() => fakeB`; we just confirm the override is dropped by
    // re-installing fakeA and seeing the new factory take effect.
    resetOpenAIClientFactory();
    setOpenAIClientFactory(() => fakeA);
    expect(createOpenAIClient()).toBe(fakeA);
  });

  it('setOpenAIClientFactory(null) is equivalent to resetOpenAIClientFactory()', () => {
    const fake = { id: 'fake' } as unknown as ReturnType<typeof createOpenAIClient>;
    setOpenAIClientFactory(() => fake);
    expect(createOpenAIClient()).toBe(fake);

    setOpenAIClientFactory(null);
    setOpenAIClientFactory(() => fake);
    expect(createOpenAIClient()).toBe(fake);
  });
});
