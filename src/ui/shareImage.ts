// Builds a shareable PNG of one match's stats, in English (for the coach).
// The image is drawn on a <canvas> entirely on the phone; nothing is uploaded.

import { formatSetScores, type ReplayResult } from '../domain/scoring';
import type { MatchStats, MomentumPoint } from '../domain/stats';
import type { Match, Side, Surface } from '../domain/types';
import { formatStat, LABEL_EN, SECTION_EN, visibleSections } from './statRows';

const SURFACE_EN: Record<Surface, string> = { hard: 'Hard', clay: 'Clay', grass: 'Grass', indoor: 'Indoor' };

export interface ShareRow {
  label: string;
  elsa: string;
  opp: string;
  better: Side | null;
}

export interface ShareModel {
  names: Record<Side, string>;
  title: string;
  subtitle: string;
  result: string;
  score: string;
  sections: { title: string; rows: ShareRow[] }[];
  momentum: MomentumPoint[];
  footer: string;
}

export function formatDateEn(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildShareModel(
  match: Match,
  replay: ReplayResult,
  stats: MatchStats,
  names: Record<Side, string>,
): ShareModel {
  const winner = replay.final.winner;
  const result =
    match.status === 'completed' && winner
      ? winner === 'elsa'
        ? `${names.elsa} won`
        : `${names.elsa} lost`
      : match.status === 'retired' && match.retiredSide
        ? `${names[match.retiredSide]} retired`
        : match.status === 'abandoned'
          ? 'Match abandoned'
          : 'In progress';
  const subtitle = [formatDateEn(match.date), match.event, match.round, match.surface && SURFACE_EN[match.surface]]
    .filter(Boolean)
    .join(' · ');
  const quick = stats.totalPoints - stats.detailedPoints;
  return {
    names,
    title: `${names.elsa} vs ${names.opp}`,
    subtitle,
    result,
    score: formatSetScores(replay.final.completedSets, replay.final) || '0-0',
    sections: visibleSections(stats).map((sec) => ({
      title: SECTION_EN[sec.title] ?? sec.title,
      rows: sec.rows.map((r) => ({
        label: LABEL_EN[r.row.key] ?? r.row.label,
        elsa: formatStat(r.elsa),
        opp: formatStat(r.opp),
        better: r.better,
      })),
    })),
    momentum: stats.momentum,
    footer:
      `${stats.totalPoints} points charted` +
      (quick > 0 ? ` (${quick} without serve/shot detail)` : '') +
      ' · Tennis Math',
  };
}

// ---- drawing ---------------------------------------------------------------

const W = 1080;
const PAD = 64;
const C = {
  bg: '#ffffff',
  head: '#0f5132',
  headText: '#ffffff',
  ball: '#d4e83a',
  text: '#1b1f1d',
  muted: '#66706b',
  line: '#e1e6e3',
  elsa: '#1f8a5b',
  opp: '#3d6fb0',
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", Roboto, sans-serif';
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

const ROW_H = 54;
const SECTION_H = 76;
const CHART_H = 300;

function measureHeight(m: ShareModel): number {
  const rows = m.sections.reduce((n, s) => n + s.rows.length, 0);
  // title 80 + subtitle/gap 60 + chart + set labels/legend 70 + spacing 40
  const chart = m.momentum.length > 1 ? 80 + 60 + CHART_H + 70 + 40 : 0;
  return 300 + 90 + m.sections.length * SECTION_H + rows * ROW_H + chart + 100;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function drawMomentum(ctx: CanvasRenderingContext2D, m: ShareModel, top: number) {
  const pts = m.momentum;
  const left = PAD + 40;
  const right = W - PAD;
  const h = CHART_H;
  const maxAbs = Math.max(1, ...pts.map((p) => Math.abs(p.diff)));
  const x = (i: number) => left + (i / Math.max(1, pts.length - 1)) * (right - left);
  const y = (d: number) => top + h / 2 - (d / maxAbs) * (h / 2 - 10);
  const mid = top + h / 2;

  ctx.fillStyle = 'rgba(31,138,91,0.08)';
  ctx.fillRect(left, top, right - left, h / 2);
  ctx.fillStyle = 'rgba(61,111,176,0.08)';
  ctx.fillRect(left, mid, right - left, h / 2);

  ctx.fillStyle = C.muted;
  ctx.font = font(24);
  ctx.textAlign = 'left';
  ctx.fillText(`${m.names.elsa} ahead`, left + 12, top + 32);
  ctx.fillText(`${m.names.opp} ahead`, left + 12, top + h - 14);
  ctx.textAlign = 'right';
  ctx.fillText(`+${maxAbs}`, left - 10, top + 20);
  ctx.fillText('0', left - 10, mid + 8);
  ctx.fillText(`+${maxAbs}`, left - 10, top + h);

  // set boundaries
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.textAlign = 'left';
  pts.forEach((p, i) => {
    if (i > 0 && p.setIndex !== pts[i - 1].setIndex) {
      const sx = (x(i - 1) + x(i)) / 2;
      ctx.beginPath();
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, top + h);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(`Set ${p.setIndex + 1}`, sx + 8, top + h + 30);
    }
  });

  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, mid);
  ctx.lineTo(right, mid);
  ctx.stroke();

  ctx.strokeStyle = C.text;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p.diff)));
  ctx.stroke();

  for (const [i, p] of pts.entries()) {
    if (!p.breakPoint) continue;
    ctx.beginPath();
    ctx.arc(x(i), y(p.diff), 9, 0, Math.PI * 2);
    ctx.fillStyle = p.winner === 'elsa' ? C.elsa : C.opp;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.bg;
    ctx.stroke();
  }

  // legend
  const ly = top + h + 70;
  let lx = left;
  ctx.font = font(24);
  for (const [side, label] of [
    ['elsa', `Break point won by ${m.names.elsa}`],
    ['opp', `Break point won by ${m.names.opp}`],
  ] as const) {
    ctx.beginPath();
    ctx.arc(lx + 9, ly - 8, 9, 0, Math.PI * 2);
    ctx.fillStyle = C[side];
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.fillText(label, lx + 26, ly);
    lx += ctx.measureText(label).width + 70;
  }
}

/** Draw the share image. Returns the canvas (1080px wide). */
export function drawShareImage(m: ShareModel): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const H = measureHeight(m);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = C.head;
  ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = C.ball;
  ctx.beginPath();
  ctx.arc(W - PAD - 30, 72, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.headText;
  ctx.textAlign = 'left';
  ctx.font = font(56, 700);
  ctx.fillText(fitText(ctx, m.title, W - PAD * 2 - 90), PAD, 96);
  ctx.font = font(30);
  ctx.globalAlpha = 0.85;
  ctx.fillText(fitText(ctx, m.subtitle, W - PAD * 2), PAD, 146);
  ctx.globalAlpha = 1;
  ctx.font = font(34, 600);
  ctx.fillText(m.result, PAD, 226);
  ctx.font = font(64, 700);
  ctx.textAlign = 'right';
  ctx.fillText(fitText(ctx, m.score, W - PAD * 2 - ctx.measureText(m.result).width), W - PAD, 238);

  // Column headers
  let yPos = 300 + 70;
  const colElsa = W - PAD - 300;
  const colOpp = W - PAD;
  ctx.font = font(30, 700);
  for (const [side, xRight] of [
    ['elsa', colElsa],
    ['opp', colOpp],
  ] as const) {
    const name = fitText(ctx, m.names[side], 240);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.text;
    ctx.fillText(name, xRight, yPos);
    const w = ctx.measureText(name).width;
    ctx.beginPath();
    ctx.arc(xRight - w - 20, yPos - 10, 9, 0, Math.PI * 2);
    ctx.fillStyle = C[side];
    ctx.fill();
  }
  yPos += 20;

  // Sections
  for (const sec of m.sections) {
    yPos += SECTION_H - 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.font = font(32, 700);
    ctx.fillText(sec.title, PAD, yPos);
    yPos += 22;
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, yPos - 8, W - PAD * 2, 2);
    for (const row of sec.rows) {
      yPos += ROW_H;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.muted;
      ctx.font = font(28);
      ctx.fillText(fitText(ctx, row.label, colElsa - 260 - PAD), PAD, yPos - 16);
      ctx.textAlign = 'right';
      for (const [side, xRight] of [
        ['elsa', colElsa],
        ['opp', colOpp],
      ] as const) {
        ctx.fillStyle = C.text;
        ctx.font = font(28, row.better === side ? 700 : 400);
        ctx.fillText(row[side], xRight, yPos - 16);
      }
    }
  }

  // Momentum
  if (m.momentum.length > 1) {
    yPos += 80;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.font = font(32, 700);
    ctx.fillText('Momentum', PAD, yPos);
    ctx.fillStyle = C.muted;
    ctx.font = font(24);
    ctx.fillText('Running points difference (+1 per point won, −1 per point lost)', PAD, yPos + 36);
    drawMomentum(ctx, m, yPos + 60);
    yPos += 60 + CHART_H + 70;
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = C.muted;
  ctx.font = font(24);
  ctx.fillText(m.footer, W / 2, H - 40);
  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], filename, { type: 'image/png' })) : reject(new Error('无法生成图片'))), 'image/png'),
  );
}

/** "Elsa-vs-Mia-2026-11-22.png" (non-ASCII names are kept; iOS handles them). */
export function shareFileName(match: Match, names: Record<Side, string>): string {
  return `${names.elsa}-vs-${names.opp}-${match.date}.png`.replace(/[\\/:*?"<>|\s]+/g, '-');
}
