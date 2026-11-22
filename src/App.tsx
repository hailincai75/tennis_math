import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isStandalone } from './platform';
import { Home } from './ui/Home';
import { LiveMatch } from './ui/LiveMatch';
import { MatchStats } from './ui/MatchStats';
import { NewMatch } from './ui/NewMatch';
import { useRoute } from './ui/router';

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

export default function App() {
  const route = useRoute();
  const online = useOnline();
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // The scoring and stats pages have their own compact header.
  if (route.name === 'match' || route.name === 'stats') {
    return (
      <div className="app">
        {route.name === 'match' ? <LiveMatch id={route.id} /> : <MatchStats id={route.id} />}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>{route.name === 'new' ? '新比赛' : 'Tennis Math'}</h1>
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

      {route.name === 'new' ? <NewMatch /> : <Home offlineReady={offlineReady} />}
    </div>
  );
}
