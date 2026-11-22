import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isStandalone } from './platform';
import { Analysis } from './ui/Analysis';
import { Home } from './ui/Home';
import { LiveMatch } from './ui/LiveMatch';
import { MatchStats } from './ui/MatchStats';
import { NewMatch } from './ui/NewMatch';
import { OpponentDetail, Opponents } from './ui/Opponents';
import { useRoute, type Route } from './ui/router';
import { Settings } from './ui/Settings';
import { TabBar } from './ui/TabBar';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Tennis Math',
  new: '新比赛',
  analysis: '分析',
  opponents: '对手',
  opponent: '对手',
  settings: '设置',
};

export default function App() {
  const route = useRoute();
  const online = useOnline();
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // The scoring and stats pages have their own compact header and no tab bar.
  if (route.name === 'match' || route.name === 'stats') {
    return (
      <div className="app">
        {route.name === 'match' ? <LiveMatch id={route.id} /> : <MatchStats id={route.id} />}
      </div>
    );
  }

  let page;
  switch (route.name) {
    case 'new':
      page = <NewMatch />;
      break;
    case 'analysis':
      page = <Analysis />;
      break;
    case 'opponents':
      page = <Opponents />;
      break;
    case 'opponent':
      page = <OpponentDetail id={route.id} />;
      break;
    case 'settings':
      page = <Settings offlineReady={offlineReady} />;
      break;
    default:
      page = <Home />;
  }

  return (
    <div className={`app${route.name === 'new' ? '' : ' with-tabs'}`}>
      <header className="topbar">
        <h1>{TITLES[route.name]}</h1>
        <span className={online ? 'pill ok' : 'pill warn'}>{online ? '在线' : '离线'}</span>
      </header>

      {needRefresh && (
        <div className="banner">
          有新版本可用
          <button onClick={() => updateServiceWorker(true)}>更新</button>
        </div>
      )}

      {route.name === 'home' && !isStandalone() && (
        <div className="banner info">
          请在 Safari 中点 <b>分享</b> → <b>添加到主屏幕</b>，之后从主屏图标打开。
          <br />
          <small>主屏 app 和 Safari 标签页的数据是分开存的，记比赛请始终用主屏图标。</small>
        </div>
      )}

      {page}
      {route.name !== 'new' && <TabBar current={route.name} />}
    </div>
  );
}
