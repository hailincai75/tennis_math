import { href, type Route } from './router';

const TABS: { route: Route; label: string; icon: string; match: Route['name'][] }[] = [
  { route: { name: 'home' }, label: '比赛', icon: '🎾', match: ['home', 'new'] },
  { route: { name: 'analysis' }, label: '分析', icon: '📈', match: ['analysis'] },
  { route: { name: 'opponents' }, label: '对手', icon: '👥', match: ['opponents', 'opponent'] },
  { route: { name: 'settings' }, label: '设置', icon: '⚙️', match: ['settings'] },
];

export function TabBar({ current }: { current: Route['name'] }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <a
          key={t.label}
          href={href(t.route)}
          className={t.match.includes(current) ? 'on' : ''}
          aria-current={t.match.includes(current) ? 'page' : undefined}
        >
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
