import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './router';

describe('router', () => {
  it.each<Route>([
    { name: 'home' },
    { name: 'new' },
    { name: 'match', id: 'a b/c' },
    { name: 'stats', id: 'abc' },
    { name: 'analysis' },
    { name: 'opponents' },
    { name: 'opponent', id: 'o1' },
    { name: 'settings' },
  ])('round-trips %o', (route) => {
    expect(parseRoute(href(route))).toEqual(route);
  });

  it('falls back to home for unknown or empty hashes', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/nope')).toEqual({ name: 'home' });
    expect(parseRoute('#/match')).toEqual({ name: 'home' });
  });
});
