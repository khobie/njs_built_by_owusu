'use client';

import { memo, useMemo, type CSSProperties } from 'react';
import type { DashboardAggregates } from '@/lib/dashboard-aggregates';

type Props = { aggregates: DashboardAggregates };

export const DelegatesByAreaChart = memo(function DelegatesByAreaChart({ aggregates }: Props) {
  const max = useMemo(
    () => Math.max(1, ...aggregates.byElectoralArea.map((a) => a.count)),
    [aggregates.byElectoralArea]
  );

  if (aggregates.byElectoralArea.length === 0) {
    return <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No delegate data for this filter.</p>;
  }

  return (
    <div>
      {aggregates.byElectoralArea.map((row) => (
        <div key={row.areaName} className="chart-bar-row">
          <span className="chart-bar-label" title={row.areaName}>
            {row.areaName}
          </span>
          <div className="chart-bar-track">
            <div className="chart-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <span style={{ flex: '0 0 2rem', textAlign: 'right', fontWeight: 700, fontSize: '0.8rem' }}>{row.count}</span>
        </div>
      ))}
    </div>
  );
});

export const ContestDonut = memo(function ContestDonut({ aggregates }: Props) {
  const { style, legend } = useMemo(() => {
    const c = aggregates.contestedSlots;
    const u = aggregates.unopposedSlots;
    const t = c + u;
    if (t === 0) {
      return {
        style: { background: 'var(--gray-200)' } as CSSProperties,
        legend: [
          { label: 'Contests', color: 'var(--contested)', value: 0 },
          { label: 'Unopposed', color: 'var(--unopposed)', value: 0 },
        ],
      };
    }
    const cDeg = (c / t) * 360;
    const bg = `conic-gradient(var(--contested) 0deg ${cDeg}deg, var(--unopposed) ${cDeg}deg 360deg)`;
    return {
      style: { background: bg } as CSSProperties,
      legend: [
        { label: 'Contested slots', color: 'var(--contested)', value: c },
        { label: 'Unopposed slots', color: 'var(--unopposed)', value: u },
      ],
    };
  }, [aggregates.contestedSlots, aggregates.unopposedSlots]);

  return (
    <div className="chart-donut-wrap">
      <div className="chart-donut" style={style}>
        <div className="chart-donut-hole" />
      </div>
      <div className="chart-legend">
        {legend.map((item) => (
          <div key={item.label} className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: item.color }} />
            <span>
              {item.label}: <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong>
            </span>
          </div>
        ))}
        <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', maxWidth: '14rem', marginTop: '0.25rem' }}>
          Slots = unique polling station code + position. Contested if more than one delegate shares the same pair.
        </p>
      </div>
    </div>
  );
});

export const VerificationDonut = memo(function VerificationDonut({ aggregates }: Props) {
  const { style, legend } = useMemo(() => {
    const v = aggregates.verificationVerified;
    const p = aggregates.verificationPending;
    const r = aggregates.verificationRejected;
    const t = v + p + r;
    if (t === 0) {
      return {
        style: { background: 'var(--gray-200)' } as CSSProperties,
        legend: [
          { label: 'Verified', color: 'var(--success)', value: 0 },
          { label: 'Pending', color: 'var(--warning)', value: 0 },
          { label: 'Rejected', color: 'var(--danger)', value: 0 },
        ],
      };
    }
    const a1 = (v / t) * 360;
    const a2 = (p / t) * 360;
    const bg = `conic-gradient(var(--success) 0deg ${a1}deg, var(--warning) ${a1}deg ${a1 + a2}deg, var(--danger) ${a1 + a2}deg 360deg)`;
    return {
      style: { background: bg } as CSSProperties,
      legend: [
        { label: 'Verified', color: 'var(--success)', value: v },
        { label: 'Pending', color: 'var(--warning)', value: p },
        { label: 'Rejected (vetting)', color: 'var(--danger)', value: r },
      ],
    };
  }, [aggregates.verificationPending, aggregates.verificationRejected, aggregates.verificationVerified]);

  return (
    <div className="chart-donut-wrap">
      <div className="chart-donut" style={style}>
        <div className="chart-donut-hole" />
      </div>
      <div className="chart-legend">
        {legend.map((item) => (
          <div key={item.label} className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: item.color }} />
            <span>
              {item.label}: <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
