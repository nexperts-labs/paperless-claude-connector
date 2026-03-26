import { useEffect, useRef, useState } from "react";

interface PaperlessDoc {
  id: number;
  title: string;
  created: string;
}

type Status = "idle" | "loading" | "submitting" | "success" | "error";

export function Reprocess() {
  const [documents, setDocuments] = useState<PaperlessDoc[]>([]);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [manualIds, setManualIds] = useState("");

  const [actionStatus, setActionStatus] = useState<Status>("idle");
  const [actionMsg, setActionMsg] = useState("");

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoadStatus("loading");
    fetch("/api/paperless/documents")
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d.error || "Fehler"));
        return r.json();
      })
      .then((data: PaperlessDoc[]) => {
        // Sort by id descending (newest first)
        data.sort((a, b) => b.id - a.id);
        setDocuments(data);
        setLoadStatus("loaded");
      })
      .catch((e) => {
        setLoadError(String(e));
        setLoadStatus("error");
      });
  }, []);

  const filtered = documents.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      String(d.id).includes(search)
  );

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  }

  function parseManualIds(): number[] {
    return manualIds
      .split(/[\s,;]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  }

  async function submitIds(ids: number[]) {
    setActionStatus("submitting");
    try {
      const r = await fetch("/api/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Fehler");
      setActionStatus("success");
      setActionMsg(`${data.queued} Dokument(e) zur Neuverarbeitung eingeplant.`);
    } catch (e) {
      setActionStatus("error");
      setActionMsg(String(e));
    }
  }

  async function submitAll() {
    if (!confirm("Wirklich ALLE Dokumente neu verarbeiten? Das kann sehr lange dauern.")) return;
    setActionStatus("submitting");
    try {
      const r = await fetch("/api/reprocess/all", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Fehler");
      setActionStatus("success");
      setActionMsg("Alle Dokumente zur Neuverarbeitung eingeplant.");
    } catch (e) {
      setActionStatus("error");
      setActionMsg(String(e));
    }
  }

  function handleReprocessSelected() {
    const ids = [...selected];
    const manual = parseManualIds();
    const merged = [...new Set([...ids, ...manual])];
    if (merged.length === 0) {
      setActionStatus("error");
      setActionMsg("Keine Dokumente ausgewählt oder eingegeben.");
      return;
    }
    submitIds(merged);
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d.id));

  const selectedCount = selected.size + parseManualIds().filter(
    (id) => !selected.has(id)
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Action feedback */}
      {actionStatus === "success" && (
        <div className="rounded-lg border border-green-700 bg-green-950/40 px-4 py-3 text-green-400 text-sm flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionStatus("idle")} className="ml-4 text-green-600 hover:text-green-400">✕</button>
        </div>
      )}
      {actionStatus === "error" && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-400 text-sm flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionStatus("idle")} className="ml-4 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Manual ID input + reprocess all */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-gray-300">Direkte ID-Eingabe</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={manualIds}
            onChange={(e) => setManualIds(e.target.value)}
            placeholder="z.B. 42, 137, 889"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={handleReprocessSelected}
            disabled={actionStatus === "submitting"}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            {actionStatus === "submitting" ? "Wird eingeplant..." : `Ausgewählte verarbeiten${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
          <button
            onClick={submitAll}
            disabled={actionStatus === "submitting"}
            className="px-4 py-2 rounded-lg bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            Alle neu verarbeiten
          </button>
        </div>
        <p className="text-xs text-gray-600">
          IDs kommagetrennt eingeben — oder Dokumente unten aus der Liste wählen.
        </p>
      </div>

      {/* Document list */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">
            Dokumente
            {loadStatus === "loaded" && (
              <span className="ml-2 text-gray-600 font-normal">({documents.length})</span>
            )}
          </h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach ID oder Titel..."
            className="w-full sm:w-72 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-sky-500"
          />
        </div>

        {loadStatus === "loading" && (
          <div className="py-16 text-center text-gray-600 text-sm">Lade Dokumente...</div>
        )}
        {loadStatus === "error" && (
          <div className="py-8 px-4 text-center text-red-400 text-sm">{loadError}</div>
        )}

        {loadStatus === "loaded" && (
          <>
            {/* Select all row */}
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-3 bg-gray-900/60">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
                className="accent-sky-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs text-gray-500">
                {selected.size > 0
                  ? `${selected.size} ausgewählt`
                  : `Alle ${filtered.length > 0 ? `${filtered.length} ` : ""}auswählen`}
              </span>
            </div>

            {/* Scrollable list */}
            <div ref={listRef} className="overflow-y-auto max-h-[480px] divide-y divide-gray-800/60">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-gray-600 text-sm">
                  Keine Dokumente gefunden.
                </div>
              ) : (
                filtered.map((doc) => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      className="accent-sky-500 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-xs text-gray-600 w-12 flex-shrink-0 font-mono">
                      #{doc.id}
                    </span>
                    <span className="text-sm text-gray-200 truncate flex-1">{doc.title}</span>
                    <span className="text-xs text-gray-600 flex-shrink-0 hidden sm:block">
                      {doc.created ? new Date(doc.created).toLocaleDateString("de-DE") : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
