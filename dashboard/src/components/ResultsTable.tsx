import { ProcessingResult } from "../types";

interface ResultsTableProps {
  results: ProcessingResult[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}
    >
      {children}
    </span>
  );
}

export function ResultsTable({ results }: ResultsTableProps) {
  const successResults = results.filter((r) => r.success);
  const errorResults = results.filter((r) => !r.success);

  return (
    <div className="flex flex-col gap-6">
      {/* Recent successful results */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-gray-100">Letzte Verarbeitungen</h2>
          <span className="text-xs text-gray-500">{successResults.length} Einträge</span>
        </div>

        {successResults.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-600 text-sm">
            Noch keine Dokumente verarbeitet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Titel</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Typ</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Korrespondent</th>
                  <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Tags</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Tokens</th>
                  <th className="text-right px-5 py-3 font-medium">Zeit</th>
                </tr>
              </thead>
              <tbody>
                {successResults.map((r, i) => (
                  <tr
                    key={r.document_id}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${
                      i === successResults.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-200 truncate max-w-[200px] lg:max-w-[280px]">
                        {r.document_title}
                      </div>
                      {r.analysis?.summary && (
                        <div className="text-xs text-gray-500 truncate max-w-[200px] lg:max-w-[280px] mt-0.5">
                          {r.analysis.summary}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {r.analysis?.document_type && (
                        <Badge color="bg-sky-900/60 text-sky-300">
                          {r.analysis.document_type}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-400 truncate max-w-[160px]">
                      {r.analysis?.correspondent || "—"}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {r.analysis?.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} color="bg-gray-800 text-gray-400">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-right tabular-nums text-gray-500 text-xs">
                      {r.total_tokens.toLocaleString("de-DE")}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(r.processed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error log */}
      {errorResults.length > 0 && (
        <div className="rounded-xl border border-red-900/50 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-900/50 flex items-center gap-2">
            <span className="text-red-400">⚠</span>
            <h2 className="font-semibold text-red-400">Fehler-Log</h2>
            <span className="ml-auto text-xs text-gray-500">{errorResults.length} Fehler</span>
          </div>
          <div className="divide-y divide-gray-800/50">
            {errorResults.map((r) => (
              <div key={`err-${r.document_id}-${r.processed_at}`} className="px-5 py-3 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-gray-300 font-medium">
                    #{r.document_id} — {r.document_title}
                  </span>
                  <span className="text-xs text-gray-600 whitespace-nowrap shrink-0">
                    {formatDate(r.processed_at)}
                  </span>
                </div>
                <span className="text-xs text-red-400 font-mono bg-red-950/30 px-2 py-1 rounded">
                  {r.error}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
