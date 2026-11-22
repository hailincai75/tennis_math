import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ensurePersistentStorage, isStandalone, type StorageStatus } from './platform';

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

function formatMB(bytes?: number) {
  return bytes === undefined ? '?' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const online = useOnline();
  const standalone = isStandalone();
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    ensurePersistentStorage().then(setStorage).catch(() => setStorage({ persisted: null }));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Tennis Math</h1>
        <span className={online ? 'pill ok' : 'pill warn'}>{online ? '在线' : '离线'}</span>
      </header>

      {needRefresh && (
        <div className="banner">
          有新版本可用
          <button onClick={() => updateServiceWorker(true)}>更新</button>
        </div>
      )}

      {!standalone && (
        <div className="banner info">
          请在 Safari 中点 <b>分享</b> → <b>添加到主屏幕</b>，之后从主屏图标打开。
          <br />
          <small>主屏 app 和 Safari 标签页的数据是分开存的，记比赛请始终用主屏图标。</small>
        </div>
      )}

      <main>
        <section className="card empty">
          <div className="ball" aria-hidden />
          <h2>还没有比赛</h2>
          <p>记分功能将在 M3 加入。</p>
          <button className="primary" disabled>
            ＋ 新比赛
          </button>
        </section>

        <section className="card status">
          <h3>状态</h3>
          <dl>
            <dt>运行方式</dt>
            <dd>{standalone ? '主屏 app ✓' : 'Safari 标签页'}</dd>
            <dt>离线可用</dt>
            <dd>{offlineReady || navigator.serviceWorker?.controller ? '是 ✓' : '准备中…'}</dd>
            <dt>持久存储</dt>
            <dd>
              {storage === null
                ? '检查中…'
                : storage.persisted === null
                  ? '不支持'
                  : storage.persisted
                    ? '已开启 ✓'
                    : '未开启（请定期导出备份）'}
            </dd>
            <dt>已用空间</dt>
            <dd>
              {formatMB(storage?.usageBytes)} / {formatMB(storage?.quotaBytes)}
            </dd>
            <dt>版本</dt>
            <dd>{__APP_VERSION__}</dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
