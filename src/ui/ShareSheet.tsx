import { useEffect, useState } from 'react';
import type { ReplayResult } from '../domain/scoring';
import type { MatchStats } from '../domain/stats';
import type { Match, Side } from '../domain/types';
import { errorText } from './matchData';
import { buildShareModel, canvasToFile, drawShareImage, shareFileName } from './shareImage';
import { Sheet } from './Sheet';

/**
 * Generates the English stats image when opened, then shares it on tap.
 * The file is prepared up front because iOS only allows navigator.share()
 * directly inside a tap, not after an async step.
 */
export function ShareSheet({
  match,
  replay,
  stats,
  names,
  onClose,
}: {
  match: Match;
  replay: ReplayResult;
  stats: MatchStats;
  names: Record<Side, string>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    const canvas = drawShareImage(buildShareModel(match, replay, stats, names));
    canvasToFile(canvas, shareFileName(match, names))
      .then((f) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(f);
        setFile(f);
        setUrl(objectUrl);
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Generate once when the sheet opens; the parent re-creates these objects on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canShare = !!file && !!navigator.canShare?.({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      onClose();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(errorText(e));
    }
  }

  return (
    <Sheet title="分享统计图片（英文）" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {url ? <img className="share-preview" src={url} alt="Match stats image" /> : !error && <p className="muted">正在生成图片…</p>}
      <div className="row">
        <button className="secondary" onClick={onClose}>
          关闭
        </button>
        {canShare ? (
          <button className="primary grow" onClick={share}>
            分享…
          </button>
        ) : (
          url && (
            <a className="button primary grow" href={url} download={file?.name}>
              保存图片
            </a>
          )
        )}
      </div>
      <p className="muted small">分享菜单里可以选“信息”、微信、邮件，或“存储图像”。</p>
    </Sheet>
  );
}
