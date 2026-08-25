import { describe, it, expect } from 'vitest';
import { AnthropicDocAdapter, ReplayOcrAdapter, UnconfiguredLiveAdapter, getOcrAdapter } from './adapters';
import { AnthropicQueryPlanner, DisabledQueryPlanner, getQueryPlanner } from '../query/adapter';
import { costUsd, rateFor } from '@/lib/core/pricing';

// D12 — the demo, the tests and the eval must be incapable of spending money by accident.
// These tests assert the guards, not the vendors: no network call is made here.

describe('live adapters — no accidental spend, no invented prices', () => {
  it('defaults to the replay adapter and the disabled query planner', () => {
    expect(getOcrAdapter()).toBeInstanceOf(ReplayOcrAdapter);
    expect(getQueryPlanner()).toBeInstanceOf(DisabledQueryPlanner);
  });

  it('the live extraction adapter refuses to run without a key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const a = new AnthropicDocAdapter('claude-opus-5');
      await expect(a.extract(new Uint8Array([1, 2, 3]), 'invoice')).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('the live query planner refuses to run without a key', async () => {
    const p = new AnthropicQueryPlanner('claude-opus-5', '', 'https://example.invalid');
    await expect(p.plan('anything', 'fr')).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('an unknown adapter name never silently degrades to a working one', async () => {
    const a = new UnconfiguredLiveAdapter('some-vendor');
    await expect(a.extract()).rejects.toThrow(/not configured/);
  });

  it('cost is zero when no price list is configured — never a guessed rate', () => {
    expect(rateFor('claude-opus-5')).toEqual({ inPerMTok: 0, outPerMTok: 0 });
    expect(costUsd('claude-opus-5', 1_000_000, 1_000_000)).toBe(0);
  });

  it('applies the configured price list exactly', () => {
    process.env.OTTO_PRICE_IN_PER_MTOK = '3';
    process.env.OTTO_PRICE_OUT_PER_MTOK = '15';
    try {
      expect(costUsd('any-model', 2_000_000, 100_000)).toBeCloseTo(6 + 1.5, 10);
    } finally {
      delete process.env.OTTO_PRICE_IN_PER_MTOK;
      delete process.env.OTTO_PRICE_OUT_PER_MTOK;
    }
  });
});
