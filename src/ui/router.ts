// Tiny hash router: #/ , #/new , #/match/<id>
// Hash routes work with GitHub Pages and the offline service worker without
// any server-side rewrites.
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'match'; id: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'match' && parts[1]) return { name: 'match', id: decodeURIComponent(parts[1]) };
  return { name: 'home' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'new':
      return '#/new';
    case 'match':
      return `#/match/${encodeURIComponent(route.id)}`;
  }
}

/** Go to a route. `replace` avoids adding a history entry (e.g. after creating a match). */
export function navigate(route: Route, replace = false) {
  const target = href(route);
  if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseRoute(hash);
}
