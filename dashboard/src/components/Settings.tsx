import { useEffect, useState } from "react";

interface SettingsData {
  anthropic_key_masked: string;
  has_key: boolean;
  scan_interval: string;
  tag_new: string;
  tag_processed: string;
  fuzzy_threshold: string;
  claude_model: string;
  settings_file_found: boolean;
}

type SaveState = "idle" | "saving" | "restarting" | "success" | "error";

const CLAUDE_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    desc: "Schnellstes Modell — ideal für einfache Dokumente",
    badge: "Schnell",
    badgeColor: "bg-emerald-900/50 text-emerald-400",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    desc: "Ausgewogenes Verhältnis aus Qualität und Geschwindigkeit",
    badge: "Standard",
    badgeColor: "bg-sky-900/50 text-sky-400",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    desc: "Neuestes Sonnet — höhere Genauigkeit bei komplexen Dokumenten",
    badge: "Neu",
    badgeColor: "bg-violet-900/50 text-violet-400",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    desc: "Leistungsstärkstes Modell — beste Qualität, höhere Kosten",
    badge: "Premium",
    badgeColor: "bg-amber-900/50 text-amber-400",
  },
];

function StatusBadge({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "idle") return null;
  const configs: Record<SaveState, { color: string; text: string } | null> = {
    idle: null,
    saving: { color: "text-sky-400", text: "Speichern..." },
    restarting: { color: "text-amber-400", text: "Connector wird neu gestartet..." },
    success: { color: "text-green-400", text: "✓ Gespeichert & Connector neu gestartet" },
    error: { color: "text-red-400", text: `✗ ${error}` },
  };
  const cfg = configs[state];
  if (!cfg) return null;
  return <span className={`text-sm ${cfg.color}`}>{cfg.text}</span>;
}

async function saveAndRestart(
  updates: Record<string, string>,
  setSaveState: (s: SaveState) => void,
  setSaveError: (e: string | null) => void,
  onSuccess: () => void,
) {
  setSaveError(null);
  setSaveState("saving");

  const saveRes = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }).catch(() => null);

  if (!saveRes || !saveRes.ok) {
    const err = saveRes ? (await saveRes.json()).error : "Netzwerkfehler";
    setSaveError(err || "Fehler beim Speichern.");
    setSaveState("error");
    return;
  }

  setSaveState("restarting");

  const restartRes = await fetch("/api/connector/restart", { method: "POST" }).catch(() => null);
  if (!restartRes || !restartRes.ok) {
    setSaveError("Gespeichert, aber Neustart fehlgeschlagen.");
    setSaveState("error");
    return;
  }

  setSaveState("success");
  onSuccess();
  setTimeout(() => setSaveState("idle"), 5000);
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // API key
  const [revealed, setRevealed] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [keySaveState, setKeySaveState] = useState<SaveState>("idle");
  const [keySaveError, setKeySaveError] = useState<string | null>(null);

  // Model
  const [selectedModel, setSelectedModel] = useState("");
  const [modelSaveState, setModelSaveState] = useState<SaveState>("idle");
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);

  // Tags
  const [tagNew, setTagNew] = useState("");
  const [tagProcessed, setTagProcessed] = useState("");
  const [tagSaveState, setTagSaveState] = useState<SaveState>("idle");
  const [tagSaveError, setTagSaveError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error();
      const data: SettingsData = await res.json();
      setSettings(data);
      setSelectedModel(data.claude_model);
      setTagNew(data.tag_new);
      setTagProcessed(data.tag_processed);
      setError(null);
    } catch {
      setError("Einstellungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleReveal = async () => {
    if (revealed) { setRevealed(false); setFullKey(null); return; }
    setRevealing(true);
    try {
      const res = await fetch("/api/settings/reveal");
      const data = await res.json();
      setFullKey(data.anthropic_api_key);
      setRevealed(true);
    } finally { setRevealing(false); }
  };

  const handleSaveTags = () =>
    saveAndRestart(
      { tag_new: tagNew.trim(), tag_processed: tagProcessed.trim() },
      setTagSaveState,
      setTagSaveError,
      fetchSettings,
    );

  const handleSaveKey = () =>
    saveAndRestart(
      { anthropic_api_key: newKey.trim() },
      setKeySaveState,
      setKeySaveError,
      () => { setNewKey(""); setRevealed(false); setFullKey(null); fetchSettings(); },
    );

  const handleSaveModel = () =>
    saveAndRestart(
      { claude_model: selectedModel },
      setModelSaveState,
      setModelSaveError,
      fetchSettings,
    );

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-600 text-sm">Lade Einstellungen...</div>
  );
  if (error) return (
    <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-400 text-sm">{error}</div>
  );

  const keyBusy = keySaveState === "saving" || keySaveState === "restarting";
  const modelBusy = modelSaveState === "saving" || modelSaveState === "restarting";
  const tagBusy = tagSaveState === "saving" || tagSaveState === "restarting";
  const modelChanged = selectedModel !== settings?.claude_model;
  const tagsChanged = tagNew.trim() !== settings?.tag_new || tagProcessed.trim() !== settings?.tag_processed;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">

      {/* Claude Model */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">Claude Modell</h2>
          <p className="text-xs text-gray-500 mt-1">
            Gilt für alle neuen Verarbeitungen. Neustart des Connectors erforderlich.
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="grid gap-3">
            {CLAUDE_MODELS.map((model) => {
              const isActive = selectedModel === model.id;
              const isCurrent = settings?.claude_model === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => !modelBusy && setSelectedModel(model.id)}
                  disabled={modelBusy}
                  className={`w-full text-left px-4 py-3.5 rounded-lg border transition-colors ${
                    isActive
                      ? "border-sky-600 bg-sky-950/30"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          isActive ? "border-sky-500" : "border-gray-600"
                        }`}
                      >
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-sky-500 block" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-200">{model.name}</span>
                          {isCurrent && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                              aktiv
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{model.desc}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${model.badgeColor}`}>
                      {model.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={handleSaveModel}
              disabled={!modelChanged || modelBusy || !settings?.settings_file_found}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
            >
              {modelSaveState === "saving"
                ? "Speichern..."
                : modelSaveState === "restarting"
                ? "Neustart..."
                : "Speichern & Connector neu starten"}
            </button>
            <StatusBadge state={modelSaveState} error={modelSaveError} />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">Tag-Konfiguration</h2>
          <p className="text-xs text-gray-500 mt-1">
            Tags müssen exakt so in Paperless existieren oder werden beim nächsten Start automatisch angelegt.
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tag New */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-2">
                Eingangs-Tag
              </label>
              <input
                type="text"
                value={tagNew}
                onChange={(e) => setTagNew(e.target.value)}
                disabled={tagBusy}
                placeholder="Neu"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-600 disabled:opacity-50 transition-colors"
              />
              <p className="text-xs text-gray-600 mt-1.5">
                Dokumente mit diesem Tag werden verarbeitet
              </p>
            </div>

            {/* Tag Processed */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-2">
                Verarbeitet-Tag
              </label>
              <input
                type="text"
                value={tagProcessed}
                onChange={(e) => setTagProcessed(e.target.value)}
                disabled={tagBusy}
                placeholder="ai-processed"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-600 disabled:opacity-50 transition-colors"
              />
              <p className="text-xs text-gray-600 mt-1.5">
                Wird nach erfolgreicher Verarbeitung gesetzt
              </p>
            </div>
          </div>

          {/* Flow visualization */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-800/60 text-xs text-gray-400">
            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
              {tagNew || "Neu"}
            </span>
            <span className="text-gray-600">→ Verarbeitung →</span>
            <span className="px-2 py-0.5 rounded bg-sky-900/60 text-sky-300 font-mono">
              {tagProcessed || "ai-processed"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSaveTags}
              disabled={!tagsChanged || tagBusy || !tagNew.trim() || !tagProcessed.trim() || !settings?.settings_file_found}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
            >
              {tagSaveState === "saving"
                ? "Speichern..."
                : tagSaveState === "restarting"
                ? "Neustart..."
                : "Speichern & Connector neu starten"}
            </button>
            <StatusBadge state={tagSaveState} error={tagSaveError} />
          </div>
        </div>
      </div>

      {/* API Key */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">Anthropic API Key</h2>
          <p className="text-xs text-gray-500 mt-1">
            Wird vom Connector für Claude AI verwendet. Nach dem Speichern wird der Connector automatisch neu gestartet.
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Current key */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Aktueller Key
            </label>
            <div className="mt-2 flex items-center gap-3">
              <code className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono text-gray-200 truncate">
                {revealed && fullKey ? fullKey : (settings?.anthropic_key_masked ?? "—")}
              </code>
              <button
                onClick={handleReveal}
                disabled={revealing || !settings?.has_key}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {revealing ? "..." : revealed ? "Verbergen" : "Anzeigen"}
              </button>
            </div>
            {!settings?.settings_file_found && (
              <p className="text-xs text-amber-500 mt-2">
                ⚠ Settings-Datei nicht gefunden — Änderungen können nicht gespeichert werden.
              </p>
            )}
          </div>

          <div className="border-t border-gray-800" />

          {/* New key input */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Neuen Key setzen
            </label>
            <div className="mt-2 flex flex-col gap-3">
              <div className="relative">
                <input
                  type={showNewKey ? "text" : "password"}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !keyBusy && newKey.trim() && handleSaveKey()}
                  placeholder="sk-ant-api03-..."
                  disabled={keyBusy}
                  className="w-full px-3 py-2 pr-24 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-600 disabled:opacity-50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                >
                  {showNewKey ? "Verbergen" : "Anzeigen"}
                </button>
              </div>

              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40">
                <span className="text-amber-500 mt-0.5 shrink-0">⟳</span>
                <p className="text-xs text-amber-400/80">
                  Nach dem Speichern wird der Connector automatisch neu gestartet. Laufende Verarbeitungen werden dabei abgebrochen.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleSaveKey}
                  disabled={!newKey.trim() || keyBusy || !settings?.settings_file_found}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {keySaveState === "saving"
                    ? "Speichern..."
                    : keySaveState === "restarting"
                    ? "Neustart..."
                    : "Speichern & Connector neu starten"}
                </button>
                <StatusBadge state={keySaveState} error={keySaveError} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Read-only config */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">Weitere Konfiguration</h2>
          <p className="text-xs text-gray-500 mt-1">
            Änderungen direkt in der <code className="text-gray-400">.env</code> Datei vornehmen.
          </p>
        </div>
        <div className="divide-y divide-gray-800/60">
          {[
            { label: "Scan Interval", value: `${settings?.scan_interval}s` },
            { label: "Fuzzy Threshold", value: `${settings?.fuzzy_threshold}%` },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">{label}</span>
              <code className="text-sm text-gray-200 bg-gray-800 px-2 py-0.5 rounded">{value}</code>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
