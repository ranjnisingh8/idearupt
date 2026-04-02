import { useState, useEffect } from "react";

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const getNextDrop = () => {
      const now = new Date();
      // Target: 6:00 PM IST = 12:30 PM UTC
      const utcHour = 12;
      const utcMin = 30;
      
      const target = new Date(now);
      target.setUTCHours(utcHour, utcMin, 0, 0);
      
      if (now >= target) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      
      return target.getTime() - now.getTime();
    };

    const update = () => {
      const diff = getNextDrop();
      if (diff <= 0) {
        setTimeLeft("Dropping now!");
        return;
      }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${h}h ${m}m`);
    };

    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg">
      <span className="inline-flex rounded-full h-1.5 w-1.5" style={{ background: 'var(--text-tertiary)' }} />
      <span className="font-mono text-[11px] font-medium tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
        Next drop {timeLeft}
      </span>
    </div>
  );
};

export default CountdownTimer;
