import { Download } from "lucide-react";
import { exportToCSV } from "../hooks/useExportCSV";

const ExportButton = ({ data, filename }: { data: Record<string, any>[]; filename: string }) => (
  <button
    onClick={() => exportToCSV(data, filename)}
    disabled={!data.length}
    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-body font-medium hover:bg-white/5 transition-colors disabled:opacity-30"
    style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}
    title="Export as CSV"
  >
    <Download className="w-3 h-3" />
    CSV
  </button>
);

export default ExportButton;
