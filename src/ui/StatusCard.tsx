import { useEffect, useState } from 'react';
import { ensurePersistentStorage, isStandalone, type StorageStatus } from '../platform';

function formatMB(bytes?: number) {
  return bytes === undefined ? '?' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function StatusCard({ offlineReady }: { offlineReady: boolean }) {
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  useEffect(() => {
    ensurePersistentStorage().then(setStorage).catch(() => setStorage({ persisted: null }));
  }, []);

  return (
    <details className="card status">
      <summary>状态</summary>
      <dl>
        <dt>运行方式</dt>
        <dd>{isStandalone() ? '主屏 app ✓' : 'Safari 标签页'}</dd>
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
    </details>
  );
}
