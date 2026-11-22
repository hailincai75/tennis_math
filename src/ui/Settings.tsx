import { useState, type ChangeEvent } from 'react';
import { db } from '../db';
import { exportBackup, importBackup, parseBackup, pointsCsv, type Backup } from '../db/backup';
import { FORMAT_PRESETS, type RecordingMode, type Side } from '../domain/types';
import { PLAYER_NAME } from './labels';
import { errorText } from './matchData';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { saveFile, stamp } from './share';
import { Sheet } from './Sheet';
import { StatusCard } from './StatusCard';

function formatTime(ms?: number) {
  return ms ? new Date(ms).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '从未备份';
}

export function Settings({ offlineReady }: { offlineReady: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<{ backup: Backup; name: string } | null>(null);
  const update = (patch: Partial<Prefs>) => setPrefs(savePrefs(patch));

  async function doExport() {
    setMsg('');
    try {
      const b = await exportBackup(db);
      const ok = await saveFile(`tennis-math-backup-${stamp()}.json`, JSON.stringify(b), 'application/json');
      if (ok) {
        update({ lastBackupAt: Date.now(), backupSnoozeUntil: undefined });
        setMsg(`已导出 ${b.matches.length} 场比赛、${b.points.length} 分`);
      }
    } catch (e) {
      setMsg(`导出失败：${errorText(e)}`);
    }
  }

  async function doCsv() {
    setMsg('');
    try {
      const b = await exportBackup(db);
      await saveFile(`tennis-math-points-${stamp()}.csv`, pointsCsv(b, PLAYER_NAME), 'text/csv');
    } catch (e) {
      setMsg(`导出失败：${errorText(e)}`);
    }
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg('');
    try {
      setPending({ backup: parseBackup(await file.text()), name: file.name });
    } catch (err) {
      setMsg(`无法导入：${errorText(err)}`);
    }
  }

  async function doImport(mode: 'merge' | 'replace') {
    if (!pending) return;
    if (mode === 'replace' && !confirm('替换会先删除手机上现有的全部数据，再导入备份。确定吗？')) return;
    try {
      const r = await importBackup(db, pending.backup, mode);
      setMsg(`已导入 ${r.matches} 场比赛、${r.opponents} 个对手、${r.points} 分`);
    } catch (e) {
      setMsg(`导入失败：${errorText(e)}`);
    }
    setPending(null);
  }

  return (
    <main>
      <section className="card form">
        <h3 className="card-title">备份</h3>
        <p className="muted small">
          数据只存在这台手机上。删除 app 或换手机前，请先导出备份，存到“文件”或发给自己。
          <br />
          上次备份：{formatTime(prefs.lastBackupAt)}
        </p>
        <button className="primary" onClick={doExport}>
          导出备份（JSON）
        </button>
        <label className="button secondary file-button">
          从备份恢复…
          <input type="file" accept="application/json,.json" onChange={pickFile} />
        </label>
        <button className="secondary" onClick={doCsv}>
          导出逐分数据（CSV，可用 Excel 打开）
        </button>
        {msg && <p className="muted">{msg}</p>}
      </section>

      <section className="card form">
        <h3 className="card-title">新比赛默认设置</h3>
        <label>
          赛制
          <select value={prefs.defaultPreset} onChange={(e) => update({ defaultPreset: e.target.value })}>
            {Object.entries(FORMAT_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          记录方式
          <select value={prefs.defaultMode} onChange={(e) => update({ defaultMode: e.target.value as RecordingMode })}>
            <option value="standard">标准（发球 + 结束方式）</option>
            <option value="quick">快速（只记谁赢）</option>
          </select>
        </label>
        <label>
          先发球
          <select
            value={prefs.defaultFirstServer}
            onChange={(e) => update({ defaultFirstServer: e.target.value as Side })}
          >
            <option value="elsa">{PLAYER_NAME}</option>
            <option value="opp">对手</option>
          </select>
        </label>
      </section>

      <StatusCard offlineReady={offlineReady} />

      {pending && (
        <Sheet title="从备份恢复" onClose={() => setPending(null)}>
          <p>
            {pending.name}
            <br />
            <span className="muted">
              {pending.backup.matches.length} 场比赛 · {pending.backup.opponents.length} 个对手 · {pending.backup.points.length} 分
              <br />
              备份时间 {new Date(pending.backup.exportedAt).toLocaleString('zh-CN')}
            </span>
          </p>
          <div className="menu">
            <button className="primary" onClick={() => doImport('merge')}>
              合并（保留手机上的其他比赛）
            </button>
            <button className="danger" onClick={() => doImport('replace')}>
              替换（先清空手机上的数据）
            </button>
            <button className="secondary" onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
