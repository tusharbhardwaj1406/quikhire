import { describe, expect, it } from 'vitest';
import { parseFilters, parseNaturalQuery } from '@/lib/search';
import { validateResume } from '@/lib/storage';

describe('natural-language search', () => {
  it('turns the brief’s example query into structured filters', () => {
    const { filters } = parseNaturalQuery(
      'Find 15 immediately available bridge engineers in Delhi NCR with 8–12 years of experience and Midas Civil expertise.',
      ['MIDAS Civil', 'AASHTO', 'Java']);
    expect(filters).toMatchObject({ exp_min: 8, exp_max: 12, availability: ['immediate'], city: 'Delhi', skills: ['MIDAS Civil'] });
    expect(filters.q).toBe('bridge engineers');
  });
  it('handles open-ended experience and joining windows', () => {
    const { filters } = parseNaturalQuery('remote java developers 5+ years within 15 days bangalore', ['Java']);
    expect(filters).toMatchObject({ exp_min: 5, work_modes: ['remote'], city: 'Bengaluru', skills: ['Java'],
      availability: ['immediate', 'within_7_days', 'within_15_days'] });
  });
});

describe('filter validation', () => {
  it('drops empty and invalid values and strips LIKE wildcards', () => {
    expect(parseFilters({ q: '  ', city: 'Del%hi_', exp_min: '8', availability: 'immediate,nonsense' })).toEqual({});
    expect(parseFilters({ city: 'Del%hi_', exp_min: '8', availability: 'immediate', skills: 'a, b' }))
      .toEqual({ city: 'Delhi', exp_min: 8, availability: ['immediate'], skills: ['a', 'b'] });
  });
});

describe('resume validation', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  it('accepts real documents and rejects disguised or oversized files', () => {
    expect(validateResume({ type: 'application/pdf', size: 1000 }, pdf)).toEqual({ ext: 'pdf' });
    expect(validateResume({ type: 'application/pdf', size: 1000 }, new Uint8Array([0x4d, 0x5a, 0, 0]))).toHaveProperty('error');
    expect(validateResume({ type: 'application/x-msdownload', size: 1000 }, pdf)).toHaveProperty('error');
    expect(validateResume({ type: 'application/pdf', size: 5 * 1024 * 1024 }, pdf)).toHaveProperty('error');
  });
});
