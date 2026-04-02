import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  revenueScore: number;
  mrrDisplay: string;
}

const RevenueProjectionChart = ({ revenueScore, mrrDisplay }: Props) => {
  // Parse a base MRR from the display string, handling formats like:
  // "$50-75k MRR...", "$5,000-$10,000/mo", "$100K+/mo", "$200-300k MRR..."
  const parseBaseMrr = (): number => {
    if (!mrrDisplay) return revenueScore * 5000;
    const text = mrrDisplay.toLowerCase();

    // Try range: "$50-75k" or "$50-75K" (K after second number)
    const rangeWithK = text.match(/\$?([\d,.]+)\s*[-–]\s*\$?([\d,.]+)\s*k/);
    if (rangeWithK) {
      const low = parseFloat(rangeWithK[1].replace(/,/g, "")) * 1000;
      const high = parseFloat(rangeWithK[2].replace(/,/g, "")) * 1000;
      if (low > 0 && high > 0) return Math.round((low + high) / 2);
    }

    // Try range: "$5K-$20K" (K after each number)
    const rangeKK = text.match(/\$?([\d,.]+)\s*k\s*[-–]\s*\$?([\d,.]+)\s*k/);
    if (rangeKK) {
      const low = parseFloat(rangeKK[1].replace(/,/g, "")) * 1000;
      const high = parseFloat(rangeKK[2].replace(/,/g, "")) * 1000;
      if (low > 0 && high > 0) return Math.round((low + high) / 2);
    }

    // Try single value with K: "$50K+", "$100k"
    const singleK = text.match(/\$?([\d,.]+)\s*k/);
    if (singleK) {
      const val = parseFloat(singleK[1].replace(/,/g, "")) * 1000;
      if (val > 0) return val;
    }

    // Try range without K: "$5,000-$10,000"
    const rangeNoK = text.match(/\$?([\d,]+)\s*[-–]\s*\$?([\d,]+)/);
    if (rangeNoK) {
      const low = parseFloat(rangeNoK[1].replace(/,/g, ""));
      const high = parseFloat(rangeNoK[2].replace(/,/g, ""));
      // Only use if values look like actual dollar amounts (>100), not "200-300 users"
      if (low >= 100 && high >= 100) return Math.round((low + high) / 2);
    }

    // Try single value: "$5,000"
    const single = text.match(/\$\s*([\d,]+)/);
    if (single) {
      const val = parseFloat(single[1].replace(/,/g, ""));
      if (val > 0) return val;
    }

    // Fallback based on score
    return revenueScore * 5000;
  };

  const targetMrr = parseBaseMrr();

  // Realistic S-curve: start near $0, ramp slowly, accelerate mid-year, approach target by month 12
  // Uses logistic growth — most startups take 6-12 months to reach meaningful MRR
  const data = Array.from({ length: 12 }, (_, i) => {
    const t = i + 1;
    // Logistic curve: slow start, acceleration around month 5-7, flattens near target
    // k controls steepness, x0 is the midpoint (month where you hit ~50% of target)
    const k = 0.5 + (revenueScore / 10) * 0.3; // 0.5-0.8 steepness based on score
    const x0 = 8 - (revenueScore / 10) * 2; // midpoint: month 6-8 (higher score = earlier)
    const progress = 1 / (1 + Math.exp(-k * (t - x0)));
    // Month 1 floor: ~$0-$200 (pre-revenue / first sales)
    const floor = t === 1 ? 0 : Math.round(targetMrr * 0.02 * t);
    const mrr = Math.max(floor, Math.round(targetMrr * progress));
    return { month: `M${t}`, mrr };
  });

  // Calculate average monthly growth for display (month 6 to 12)
  const midMrr = data[5]?.mrr || 1;
  const endMrr = data[11]?.mrr || 1;
  const avgGrowth = Math.round(((endMrr / midMrr) ** (1 / 6) - 1) * 100);

  return (
    <div className="mt-4">
      <p className="font-body text-[11px] mb-3" style={{ color: "var(--text-tertiary)" }}>
        12-month projection · ~{avgGrowth}% MoM (months 6-12)
      </p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tick={{ fill: "#8B8D97", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#8B8D97", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "#0F1117",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#8B8D97" }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "MRR"]}
            />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#mrrGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#34D399", stroke: "#0F1117", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueProjectionChart;
