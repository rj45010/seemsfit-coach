import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtDayKey } from '@/lib/date';

export interface Point {
  date: string; // YYYY-MM-DD
  value: number;
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string }>;
}

function NbTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface rounded-xl px-2.5 py-1.5" style={{ boxShadow: 'var(--shadow-2)' }}>
      <p className="text-[10px] font-bold">{fmtDayKey(String(label))}</p>
      <p className="font-mono text-sm font-bold">{payload[0]?.value}</p>
    </div>
  );
}

export function MetricChart({ data, stroke }: { data: Point[]; stroke: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(d) => fmtDayKey(d, 'd/M')}
            tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--color-ink-2)' }}
            axisLine={{ stroke: 'var(--color-line)', strokeWidth: 1 }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--color-ink-2)' }}
            axisLine={{ stroke: 'var(--color-line)', strokeWidth: 1 }}
            tickLine={false}
            width={40}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<NbTooltip />} cursor={{ stroke: 'var(--color-ink-3)', strokeWidth: 1, strokeDasharray: '3 3' }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={3}
            dot={{ r: 2.5, fill: stroke, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: stroke, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
