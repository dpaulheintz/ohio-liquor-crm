import { AlertTriangle } from 'lucide-react';
import { periodLabel } from '@/lib/fin/shared';

/** 12-month sparkline (cents). Gaps (no upload) break the line; a dashed zero line when values cross it. */
export function Sparkline({ values, width = 140, height = 36, label }: { values: (number | null)[]; width?: number; height?: number; label: string }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-[11px] text-muted-foreground">Not enough history</span>;
  const min = Math.min(0, ...nums), max = Math.max(0, ...nums);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const segs: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v === null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  if (cur) segs.push(cur);
  const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      {min < 0 && max > 0 && <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" />}
      {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />)}
      {values[last] !== null && <circle cx={x(last)} cy={y(values[last]!)} r={2.5} fill="currentColor" />}
    </svg>
  );
}

export function OpenBanner({ period }: { period: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900" role="status" data-open-banner>
      <AlertTriangle className="h-4 w-4 shrink-0" /> OPEN — not final. {periodLabel(period, 'long')} can still change; reupload the export as entries post.
    </div>
  );
}

export function SeverityDot({ severity }: { severity: 'high' | 'medium' | 'info' }) {
  const cls = severity === 'high' ? 'bg-red-600' : severity === 'medium' ? 'bg-amber-500' : 'bg-sky-500';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} aria-label={severity} />;
}
