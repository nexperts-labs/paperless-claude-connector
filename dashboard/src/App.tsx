import { useCallback, useEffect, useState } from "react";
import { StatCard } from "./components/StatCard";
import { TokenBar } from "./components/TokenBar";
import { ResultsTable } from "./components/ResultsTable";
import { Settings } from "./components/Settings";
import { Reprocess } from "./components/Reprocess";
import { ProcessingResult, Stats } from "./types";

const REFRESH_INTERVAL_MS = 30_000;
type Tab = "overview" | "settings" | "reprocess";

function formatLastScan(iso: string | null): string {
  if (!iso) return "Noch kein Scan";
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, resultsRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/results?limit=100"),
      ]);
      if (!statsRes.ok || !resultsRes.ok) throw new Error("API error");
      const [statsData, resultsData] = await Promise.all([
        statsRes.json() as Promise<Stats>,
        resultsRes.json() as Promise<ProcessingResult[]>,
      ]);
      setStats(statsData);
      setResults(resultsData);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Verbindung zum Server fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalTokens =
    (stats?.total_prompt_tokens ?? 0) + (stats?.total_completion_tokens ?? 0);

  const successRate =
    stats && stats.total_processed + stats.total_errors > 0
      ? Math.round(
          (stats.total_processed / (stats.total_processed + stats.total_errors)) * 100
        )
      : null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-sm">
              P
            </div>
            <div>
              <h1 className="font-semibold text-gray-100 leading-none">
                Paperless Claude Connector
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Letzter Scan:{" "}
                <span className="text-gray-400">
                  {formatLastScan(stats?.last_scan ?? null)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastRefresh && activeTab === "overview" && (
              <span className="text-xs text-gray-600 hidden sm:block">
                Aktualisiert{" "}
                {lastRefresh.toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            {activeTab === "overview" && (
              <button
                onClick={fetchData}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Aktualisieren
              </button>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 -mb-px">
          {(
            [
              { id: "overview", label: "Übersicht" },
              { id: "settings", label: "Einstellungen" },
              { id: "reprocess", label: "Neuverarbeitung" },
            ] as { id: Tab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Error banner */}
        {error && activeTab === "overview" && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Overview tab */}
        {activeTab === "overview" && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-600">
                Lade Daten...
              </div>
            ) : (
              <>
                <section>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Übersicht
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                      label="Heute verarbeitet"
                      value={stats?.processed_today ?? 0}
                      icon={<span>📄</span>}
                      accent
                    />
                    <StatCard
                      label="Gesamt verarbeitet"
                      value={(stats?.total_processed ?? 0).toLocaleString("de-DE")}
                      sub={successRate !== null ? `${successRate}% Erfolgsrate` : undefined}
                      icon={<span>✅</span>}
                    />
                    <StatCard
                      label="Fehler gesamt"
                      value={stats?.total_errors ?? 0}
                      icon={<span>⚠️</span>}
                    />
                    <StatCard
                      label="Tokens gesamt"
                      value={
                        totalTokens >= 1_000_000
                          ? (totalTokens / 1_000_000).toFixed(2) + "M"
                          : totalTokens >= 1_000
                          ? (totalTokens / 1_000).toFixed(1) + "K"
                          : String(totalTokens)
                      }
                      sub="Prompt + Completion"
                      icon={<span>🧠</span>}
                    />
                  </div>
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Token-Verteilung
                  </h2>
                  <TokenBar
                    promptTokens={stats?.total_prompt_tokens ?? 0}
                    completionTokens={stats?.total_completion_tokens ?? 0}
                  />
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Verarbeitungs-History
                  </h2>
                  <ResultsTable results={results} />
                </section>
              </>
            )}
          </>
        )}

        {/* Settings tab */}
        {activeTab === "settings" && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Einstellungen
            </h2>
            <Settings />
          </section>
        )}

        {/* Reprocess tab */}
        {activeTab === "reprocess" && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Neuverarbeitung
            </h2>
            <Reprocess />
          </section>
        )}
      </main>
    </div>
  );
}
