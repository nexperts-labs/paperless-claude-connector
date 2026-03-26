interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  icon: React.ReactNode;
}

export function StatCard({ label, value, sub, accent, icon }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 flex flex-col gap-3 ${
        accent
          ? "border-sky-500/40 bg-sky-950/30"
          : "border-gray-800 bg-gray-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400 font-medium">{label}</span>
        <span className={`text-xl ${accent ? "text-sky-400" : "text-gray-500"}`}>
          {icon}
        </span>
      </div>
      <div>
        <span
          className={`text-3xl font-bold tabular-nums ${
            accent ? "text-sky-300" : "text-gray-100"
          }`}
        >
          {value}
        </span>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
