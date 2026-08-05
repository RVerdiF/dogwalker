import { describe, it, expect } from 'vitest';
import { extractJsonObjects } from './broker';

// The contract loop relies on pulling the peer's JSON answer out of a noisy
// terminal capture that may also contain the injected schema's braces.
describe('extractJsonObjects', () => {
  it('returns every top-level JSON object in order', () => {
    expect(extractJsonObjects('noise {"a":1} more {"b":2} end')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips brace runs that are not valid JSON', () => {
    expect(extractJsonObjects('a {not json} b {"ok":true} c')).toEqual([{ ok: true }]);
  });

  it('treats a nested object as one top-level object', () => {
    expect(extractJsonObjects('x {"a":{"b":1}} y')).toEqual([{ a: { b: 1 } }]);
  });

  it('is unfazed by braces inside strings', () => {
    expect(extractJsonObjects('{"s":"a } b {"}')).toEqual([{ s: 'a } b {' }]);
  });

  it('returns nothing when there is no JSON object', () => {
    expect(extractJsonObjects('just some prose, no objects here')).toEqual([]);
  });
});
