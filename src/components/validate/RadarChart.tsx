import { motion } from "framer-motion";

interface RadarChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

const RadarChart = ({ data, size = 220 }: RadarChartProps) => {
  const center = size / 2;
  const radius = size * 0.38;
  const angleStep = (2 * Math.PI) / data.length;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 10) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1];

  const polygonPoints = data.map((d, i) => {
    const pt = getPoint(i, Number(d.value ?? 0));
    return `${pt.x},${pt.y}`;
  }).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid */}
        {gridLevels.map((level, li) => (
          <polygon
            key={li}
            points={data.map((_, i) => {
              const pt = getPoint(i, level * 10);
              return `${pt.x},${pt.y}`;
            }).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {data.map((_, i) => {
          const pt = getPoint(i, 10);
          return <line key={i} x1={center} y1={center} x2={pt.x} y2={pt.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
        })}

        {/* Data polygon */}
        <motion.polygon
          points={polygonPoints}
          fill="rgba(139,92,246,0.15)"
          stroke="#8B5CF6"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Data points */}
        {data.map((d, i) => {
          const pt = getPoint(i, d.value);
          return (
            <motion.circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={4}
              fill={d.color}
              stroke="#0F1117"
              strokeWidth="2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            />
          );
        })}

        {/* Labels */}
        {data.map((d, i) => {
          const pt = getPoint(i, 12);
          return (
            <text
              key={i}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-body"
              style={{ fontSize: "10px", fill: "var(--text-secondary)" }}
            >
              {d.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
            <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {d.label}: {Number(d.value ?? 0).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RadarChart;
