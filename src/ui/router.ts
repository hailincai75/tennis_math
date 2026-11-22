// Tiny hash router: #/ , #/new , #/match/<id>
// Hash routes work with GitHub Pages and the offline service worker without
// any server-side rewrites.
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'match'; id: string }
  | { name: 'stats'; id: string }
  | { name: 'analysis' }
  | { name: 'opponents' }
  | { name: 'opponent'; id: string }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const id = parts[1] ? decodeURIComponent(parts[1]) : '';
  switch (parts[0]) {
    case 'new':
      return { name: 'new' };
    case 'match':
      if (!id) break;
      return parts[2] === 'stats' ? { name: 'stats', id } : { name: 'match', id };
    case 'analysis':
      return { name: 'analysis' };
    case 'opponents':
      return id ? { name: 'opponent', id } : { name: 'opponents' };
    case 'settings':
      return { name: 'settings' };
  }
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
    case 'stats':
      return `#/match/${encodeURIComponent(route.id)}/stats`;
    case 'analysis':
      return '#/analysis';
    case 'opponents':
      return '#/opponents';
    case 'opponent':
      return `#/opponents/${encodeURIComponent(route.id)}`;
    case 'settings':
      return '#/settings';
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
