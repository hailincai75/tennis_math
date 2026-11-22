import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { backupReminder, loadPrefs, savePrefs, SNOOZE_MS } from './prefs';
import { loadMatchSummaries, type MatchSummary } from './matchSummary';
import { PLAYER_NAME, STATUS_LABEL, SURFACE_LABEL } from './labels';
import { href } from './router';

function MatchRow({ s }: { s: MatchSummary }) {
  const { match } = s;
  const live = match.status === 'in_progress';
  const result =
    s.winner === 'elsa' ? { text: '胜', cls: 'win' } : s.winner === 'opp' ? { text: '负', cls: 'loss' } : null;
  const meta = [match.date, match.event, match.round, match.surface && SURFACE_LABEL[match.surface]]
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <a className={`match-row${live ? ' ongoing' : ''}`} href={href({ name: live ? 'match' : 'stats', id: match.id })}>
        <div className="match-main">
          <div className="match-title">
            {PLAYER_NAME} vs {s.opponent?.name ?? '（对手已删除）'}
          </div>
          <div className="match-meta">{meta}</div>
        </div>
        <div className="match-side">
          <div className="match-score">{s.score || '0-0'}</div>
          {result ? (
            <span className={`tag ${result.cls}`}>{result.text}</span>
          ) : (
            <span className={`tag${live ? ' ongoing' : ''}`}>{live ? '继续记分 ›' : STATUS_LABEL[match.status]}</span>
          )}
        </div>
      </a>
    </li>
  );
}

function BackupBanner({ summaries }: { summaries: MatchSummary[] }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const { due, pending } = backupReminder(summaries.map((s) => s.match), prefs, Date.now());
  if (!due) return null;
  return (
    <div className="banner">
      <span className="grow">
        有 {pending} 场比赛还没备份。数据只存在这台手机上，建议导出一份。
      </span>
      <a className="button" href={href({ name: 'settings' })}>
        去备份
      </a>
      <button className="secondary" onClick={() => setPrefs(savePrefs({ backupSnoozeUntil: Date.now() + SNOOZE_MS }))}>
        稍后
      </button>
    </div>
  );
}

export function Home() {
  const summaries = useLiveQuery(loadMatchSummaries, []);

  return (
    <main>
      <a className="button primary big" href={href({ name: 'new' })}>
        ＋ 新比赛
      </a>
      {summaries && <BackupBanner summaries={summaries} />}

      {summaries === undefined ? null : summaries.length === 0 ? (
        <section className="card empty">
          <div className="ball" aria-hidden />
          <h2>还没有比赛</h2>
          <p>点上面的“新比赛”开始记第一场。</p>
        </section>
      ) : (
        <ul className="match-list">
          {summaries.map((s) => (
            <MatchRow key={s.match.id} s={s} />
          ))}
        </ul>
      )}

    </main>
  );
}
