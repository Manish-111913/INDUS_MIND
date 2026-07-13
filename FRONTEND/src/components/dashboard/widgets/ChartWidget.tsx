import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
} from 'recharts';
import { formatCurrency } from '../../../lib/format';

interface ChartSeries {
  key: string;
  name: string;
  color?: string;
  type?: 'line' | 'bar' | 'area';
}

interface ChartWidgetProps {
  title: string;
  type: 'line' | 'bar' | 'area' | 'donut' | 'pareto';
  data: any[];
  xAxisKey?: string;
  series: ChartSeries[];
  description?: string;
}

const colors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

function getSeriesColor(s: ChartSeries, index: number): string {
  const key = s.key.toLowerCase();
  // Failures / incidents / errors / backlog / target always chart-5
  if (
    key.includes('fail') || 
    key.includes('error') || 
    key.includes('incident') || 
    key.includes('backlog') || 
    key.includes('target')
  ) {
    return 'var(--chart-5)';
  }
  // AI / predictions always chart-2
  if (
    key.includes('predict') || 
    key.includes('forecast') || 
    key.includes('ai') || 
    key.includes('graph') || 
    key.includes('cumulativepercent') || 
    key.includes('cum')
  ) {
    return 'var(--chart-2)';
  }
  // Completed / positive metrics
  if (key.includes('completed') || key.includes('closed') || key.includes('success')) {
    return 'var(--chart-4)';
  }
  // Primary series
  if (key.includes('vector') || key.includes('primary') || key.includes('emissions')) {
    return 'var(--chart-1)';
  }
  return colors[index % colors.length];
}

export function ChartWidget({
  title,
  type,
  data,
  xAxisKey = 'name',
  series,
  description,
}: ChartWidgetProps) {

  // Custom tooltip styling
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface border border-border-strong p-2.5 rounded shadow-pop font-mono text-[11px] space-y-1">
          <p className="font-bold text-text-primary mb-1 uppercase">{label}</p>
          {payload.map((p: any, idx: number) => {
            const seriesColor = p.color || p.fill || 'var(--primary)';
            return (
              <div key={idx} className="flex items-center space-x-2 text-text-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seriesColor }} />
                <span>{p.name}:</span>
                <span className="font-bold text-text-primary">
                  {typeof p.value === 'number' && p.value > 100000 
                    ? formatCurrency(p.value)
                    : p.value}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <YAxis stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
            {series.map((s, idx) => {
              const activeColor = getSeriesColor(s, idx);
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={activeColor}
                  radius={[2, 2, 0, 0]}
                />
              );
            })}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <YAxis stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
            {series.map((s, idx) => {
              const activeColor = getSeriesColor(s, idx);
              return (
                <React.Fragment key={s.key}>
                  <defs>
                    <linearGradient id={`color-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeColor} stopOpacity={0.14}/>
                      <stop offset="95%" stopColor={activeColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={activeColor}
                    fill={`url(#color-${s.key})`}
                    strokeWidth={2}
                  />
                </React.Fragment>
              );
            })}
          </AreaChart>
        );

      case 'donut':
        const donutSeries = series[0];
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={75}
              paddingAngle={3}
              dataKey={donutSeries?.key || 'value'}
              nameKey={xAxisKey}
            >
              {data.map((entry, index) => {
                const cellColor = getSeriesColor({ key: entry[xAxisKey] || '', name: entry[xAxisKey] || '' }, index);
                return (
                  <Cell key={`cell-${index}`} fill={cellColor} />
                );
              })}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
          </PieChart>
        );

      case 'pareto':
        return (
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <YAxis yAxisId="left" stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <YAxis yAxisId="right" orientation="right" stroke="var(--chart-2)" fontSize={10} className="font-mono" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
            {series.map((s, idx) => {
              if (s.type === 'line' || s.key === 'cumulativePercent' || s.key.toLowerCase().includes('cum')) {
                const activeColor = getSeriesColor(s, idx);
                return (
                  <Line
                    key={s.key}
                    yAxisId="right"
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={activeColor}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                );
              }
              const activeColor = getSeriesColor(s, idx);
              return (
                <Bar
                  key={s.key}
                  yAxisId="left"
                  dataKey={s.key}
                  name={s.name}
                  fill={activeColor}
                  radius={[2, 2, 0, 0]}
                />
              );
            })}
          </ComposedChart>
        );

      case 'line':
      default:
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <YAxis stroke="var(--text-3)" fontSize={10} className="font-mono" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
            {series.map((s, idx) => {
              const activeColor = getSeriesColor(s, idx);
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={activeColor}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              );
            })}
          </LineChart>
        );
    }
  };

  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between h-full shadow">
      <div>
        <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
          {title}
        </h4>
        {description && (
          <p className="text-[10px] text-text-2 font-mono mb-4 leading-normal">
            {description.toUpperCase()}
          </p>
        )}
      </div>

      <div className="flex-1 w-full min-h-[180px] h-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
