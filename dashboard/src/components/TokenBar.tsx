interface TokenBarProps {
  promptTokens: number;
  completionTokens: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function TokenBar({ promptTokens, completionTokens }: TokenBarProps) {
  const total = promptTokens + completionTokens;
  const promptPct = total > 0 ? (promptTokens / total) * 100 : 50;
  const completionPct = 100 - promptPct;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-4">
      <span className="text-sm text-gray-400 font-medium">Token Usage</span>

      <div>
        <span className="text-3xl font-bold tabular-nums text-gray-100">
          {fmt(total)}
        </span>
        <span className="text-sm text-gray-500 ml-2">total</span>
      </div>

      {/* Stacked bar */}
      <div className="h-2 rounded-full overflow-hidden bg-gray-800 flex">
        <div
          className="bg-sky-500 transition-all duration-500"
          style={{ width: `${promptPct}%` }}
        />
        <div
          className="bg-violet-500 transition-all duration-500"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      <div className="flex gap-6 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" />
          <span className="text-gray-400">Prompt</span>
          <span className="text-gray-200 font-medium tabular-nums ml-1">
            {fmt(promptTokens)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />
          <span className="text-gray-400">Completion</span>
          <span className="text-gray-200 font-medium tabular-nums ml-1">
            {fmt(completionTokens)}
          </span>
        </div>
      </div>
    </div>
  );
}
