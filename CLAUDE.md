# paperless-claude-connector — Projektübersicht für Claude Code

## Was ist das?

Intelligenter Dokumenten-Prozessor für Paperless-NGX. Der Connector pollt Paperless auf Dokumente mit dem Tag `Neu`, schickt sie zur Analyse an Claude AI und schreibt Metadaten (Titel, Korrespondent, Dokumententyp, Tags, Speicherpfad) zurück. Ein React-Dashboard zeigt Statistiken und erlaubt manuelle Neuverarbeitung.

**Produktivbetrieb:** `<your-server-ip>` (Docker Compose), Dashboard unter Port `3001`.
**Paperless-URL:** Konfiguriert via `PAPERLESS_URL` in `.env`
**Deploy:** SSH-Key-basiert, User und Host aus eigenem Setup

---

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Compose                                             │
│                                                             │
│  ┌──────────────────┐   shared volume   ┌───────────────┐  │
│  │  connector       │ ──/data (rw)────► │  dashboard    │  │
│  │  Python asyncio  │                   │  Express.js   │  │
│  │  port: —         │                   │  port: 3001   │  │
│  └────────┬─────────┘                   └───────┬───────┘  │
│           │                                     │           │
│           │ HTTPS                               │ HTTP      │
│           ▼                                     ▼           │
│  Paperless-NGX API          Browser / React SPA             │
│  Anthropic Claude API       (Vite + TypeScript + Tailwind)  │
└─────────────────────────────────────────────────────────────┘
```

### Shared Volume `/data`
| Datei | Schreiber | Leser | Inhalt |
|---|---|---|---|
| `results.json` | connector | dashboard | Letzte 500 Verarbeitungsergebnisse |
| `stats.json` | connector | dashboard | Gesamtstatistiken, letzter Scan |
| `reprocess_queue.json` | dashboard | connector | Neuverarbeitungs-Queue (wird nach Lesen gelöscht) |

### `.env` / `settings.env`
Die `.env` im Projektroot wird als `/config/settings.env` in den Dashboard-Container gemountet (rw). Der Connector liest sie direkt via `env_file`. Das Dashboard liest/schreibt sie über `parseEnvFile` / `writeEnvFile` in `server.js`.

---

## Verzeichnisstruktur

```
paperless-claude-connector/
├── docker-compose.yml
├── .env                          # Secrets + Konfiguration (nicht committen)
├── .env.example
├── connector/
│   ├── main.py                   # Hauptschleife, Reprocess-Queue-Handler
│   ├── processor.py              # DocumentProcessor: Fuzzy-Matching, Metadaten-Auflösung
│   ├── claude_client.py          # Anthropic API, System-Prompt, JSON-Parsing
│   ├── paperless_client.py       # Paperless REST API (httpx, certifi für SSL)
│   ├── config.py                 # Alle Env-Vars, DOCUMENT_TYPE_WHITELIST
│   ├── models.py                 # Dataclasses: PaperlessDocument, ClaudeAnalysis, etc.
│   ├── storage.py                # JSON-Persistenz: results.json, stats.json
│   ├── requirements.txt
│   └── Dockerfile
└── dashboard/
    ├── server.js                 # Express-Backend: API-Routes + SPA-Serving
    ├── src/
    │   ├── App.tsx               # Tab-Navigation: Übersicht | Einstellungen | Neuverarbeitung
    │   ├── components/
    │   │   ├── Settings.tsx      # Claude-Modell, Tags, API-Key konfigurieren
    │   │   ├── Reprocess.tsx     # Dokumentenliste mit Suche, Checkboxen, Queue-Trigger
    │   │   ├── ResultsTable.tsx  # Verarbeitungs-History
    │   │   ├── StatCard.tsx
    │   │   └── TokenBar.tsx
    │   └── types.ts
    ├── package.json              # Vite + React + Tailwind
    └── Dockerfile                # Multi-stage: builder (Vite) + prod (node:22-alpine + docker-cli)
```

---

## Connector — Verarbeitungslogik

### Hauptschleife (`main.py`)
1. Prüft auf `reprocess_queue.json` → verarbeitet Queue (Priorität)
2. Sonst: Scannt Dokumente mit Tag `Neu`
3. Schläft `SCAN_INTERVAL_SECONDS` (default 300s), wacht aber sofort auf wenn `reprocess_queue.json` erscheint

### Reprocess-Queue-Format
```json
{ "mode": "all", "requested_at": "2026-03-26T08:40:29Z" }
{ "mode": "ids", "ids": [42, 137], "requested_at": "2026-03-26T08:40:29Z" }
```

### Fuzzy-Matching (`processor.py`, rapidfuzz WRatio)
| Entity | Threshold | Verhalten bei keinem Match |
|---|---|---|
| Korrespondent | 80% (config) | Neuen anlegen |
| Dokumententyp | 80% | Whitelist prüfen (80%), dann Fallback `Korrespondenz` |
| Tags | 90% | Neuen anlegen (max. 3 pro Dokument) |
| Speicherpfad | 70% | Leer lassen (nie neu anlegen) |

### Claude-Prompt-Wichtiges (`claude_client.py`)
- Dokumentinhalt wird auf 8.000 Zeichen gekürzt
- Systemtags (`neu`, `ai-processed`, `pre-process`) werden aus der Tag-Liste für Claude herausgefiltert
- Antwort muss valides JSON sein; Fallback bei Parse-Fehler: Typ=`Korrespondenz`, keine Tags
- Speicherpfad-Hinweise im Prompt sind generisch — für eigene Setups in `claude_client.py` anpassen

---

## Dashboard — API-Routes (`server.js`)

| Method | Path | Funktion |
|---|---|---|
| GET | `/api/stats` | Statistiken aus `stats.json` |
| GET | `/api/results?limit=N` | Ergebnisse aus `results.json` |
| GET | `/api/health` | Health-Check |
| GET | `/api/settings` | Einstellungen (API-Key maskiert) |
| GET | `/api/settings/reveal` | API-Key im Klartext |
| POST | `/api/settings` | Einstellungen speichern + Connector neustarten |
| POST | `/api/connector/restart` | Connector-Container neustarten (via `docker restart`) |
| GET | `/api/paperless/documents` | Alle Dokumente von Paperless (proxied, Auth aus settings.env) |
| POST | `/api/reprocess` | `{ ids: [number] }` → schreibt Queue-Datei |
| POST | `/api/reprocess/all` | Alle Dokumente neu verarbeiten → schreibt Queue-Datei |

---

## Konfiguration (`.env`)

```bash
# Paperless-NGX
PAPERLESS_URL=https://your-paperless-instance.example.com
PAPERLESS_TOKEN=<your-paperless-api-token>

# Claude AI
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-5        # haiku-4-5-20251001 | sonnet-4-5 | sonnet-4-6 | opus-4-6
CLAUDE_MAX_TOKENS=2048

# Connector
SCAN_INTERVAL_SECONDS=300
TAG_NEW=Neu
TAG_PROCESSED=ai-processed
FUZZY_THRESHOLD=80
LOG_LEVEL=INFO
DATA_DIR=/data
```

---

## Speicherpfad-Anpassung

Die Zuordnungshinweise für Speicherpfade sind in `claude_client.py` im `user_message`-Template zu finden (Abschnitt „Hinweise zur Speicherpfad-Auswahl"). Diese sollten auf die eigenen Speicherpfade in Paperless angepasst werden, damit Claude die richtige Zuordnung trifft.

---

## Deploy-Workflow

```bash
# Datei(en) lokal ändern, dann:
rsync -av -e "ssh -i ~/.ssh/deploy_key" \
  connector/claude_client.py \
  user@your-server:/path/to/paperless-claude-connector/connector/

ssh -i ~/.ssh/deploy_key user@your-server "
  cd /path/to/paperless-claude-connector
  docker compose build connector       # oder: dashboard
  docker compose up -d connector       # 'up -d' statt 'restart' damit neues Image gezogen wird
"
```

**Wichtig:** `docker compose restart` zieht kein neues Image — immer `docker compose up -d` nach einem Build verwenden.

---

## Bekannte Eigenheiten

- **SSL im Container:** `httpx` verwendet `certifi.where()` statt System-CA (Let's Encrypt nicht im Alpine-Bundle)
- **Pagination:** `_get_all_pages()` setzt beim ersten Request `params` korrekt, folgt dann dem `next`-URL der API direkt (ohne params neu zu setzen)
- **Tag-Inflation:** Max. 3 Tags, 90%-Threshold, Systemtags aus Prompt herausgefiltert
- **Dokumententyp-Whitelist:** 57 Typen in 14 Kategorien in `config.py`; alles andere → `Korrespondenz`

---

## Offene TODOs / mögliche Erweiterungen

- [ ] Dashboard: Fortschrittsanzeige während Neuverarbeitung läuft (Polling auf `/api/stats`)
- [ ] Dashboard: Log-Stream vom Connector in Echtzeit (z.B. via SSE oder WebSocket)
- [ ] Dashboard: Speicherpfad-Hinweise über Settings-Tab konfigurierbar machen (statt Hardcode im Prompt)
- [ ] Connector: Retry-Logik bei transienten Claude-API-Fehlern (429, 529)
- [ ] Connector: Datum aus Dokumentinhalt extrahieren und in Paperless `created`-Feld schreiben
- [ ] Connector: `pre-process`-Tag als Trigger alternativ zu `Neu` (bereits in Systemtag-Ausschluss vorbereitet)
