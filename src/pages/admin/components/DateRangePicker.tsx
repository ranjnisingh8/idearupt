import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange, DateRangePreset } from "../types";
import type { DateRange as DayPickerRange } from "react-day-picker";

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 Days" },
  { key: "last30", label: "30 Days" },
  { key: "custom", label: "Custom" },
];

interface DateRangePickerProps {
  dateRange: DateRange;
  onRangeChange: (preset: DateRangePreset, customStart?: Date, customEnd?: Date) => void;
}

const DateRangePicker = ({ dateRange, onRangeChange }: DateRangePickerProps) => {
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>();
  const [open, setOpen] = useState(false);

  const handlePreset = (preset: DateRangePreset) => {
    if (preset === "custom") {
      setOpen(true);
      return;
    }
    onRangeChange(preset);
  };

  const handleCustomSelect = (range: DayPickerRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      onRangeChange("custom", range.from, range.to);
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-surface)" }}>
      {PRESETS.map((p) => {
        if (p.key === "custom") {
          return (
            <Popover key={p.key} open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-body font-medium transition-colors flex items-center gap-1"
                  style={{
                    color: dateRange.preset === "custom" ? "var(--text-primary)" : "var(--text-tertiary)",
                    background: dateRange.preset === "custom" ? "var(--bg-elevated)" : "transparent",
                  }}
                >
                  <CalendarIcon className="w-3 h-3" />
                  {dateRange.preset === "custom"
                    ? `${format(dateRange.startDate, "MMM d")} - ${format(dateRange.endDate, "MMM d")}`
                    : "Custom"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={handleCustomSelect}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                />
              </PopoverContent>
            </Popover>
          );
        }
        return (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className="px-2.5 py-1.5 rounded-md text-[11px] font-body font-medium transition-colors"
            style={{
              color: dateRange.preset === p.key ? "var(--text-primary)" : "var(--text-tertiary)",
              background: dateRange.preset === p.key ? "var(--bg-elevated)" : "transparent",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
};

export default DateRangePicker;
