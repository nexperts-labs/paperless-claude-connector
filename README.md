# paperless-claude-connector

An intelligent document processor for [Paperless-NGX](https://docs.paperless-ngx.com/) powered by [Claude AI](https://www.anthropic.com/claude). It automatically analyzes newly scanned documents using OCR text and populates metadata — title, correspondent, document type, tags, and storage path — directly in Paperless-NGX.

> **Beta** — Actively developed and used in production. Feedback and contributions welcome.

---

## Features

- **Automatic metadata extraction** — title, correspondent, document type, tags, and storage path via Claude AI
- **Fuzzy matching** — reuses existing Paperless entries (correspondents, types, tags) before creating new ones; configurable similarity threshold
- **Document type whitelist** — 57 predefined German document types across 14 categories; prevents Claude from inventing types
- **Tag-based workflow** — processes documents tagged `Neu` (configurable), adds `ai-processed` on completion
- **Storage path assignment** — Claude selects the appropriate storage path from your configured Paperless paths
- **Reprocess queue** — trigger reprocessing of individual documents or all documents via the dashboard
- **Web dashboard** — processing stats, token usage, result history, settings management, and reprocess controls
- **Docker Compose** deployment — runs as two containers alongside your existing Paperless-NGX setup

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Compose                                             │
│                                                             │
│  ┌──────────────────┐   shared volume   ┌───────────────┐  │
│  │  connector       │ ──/data (rw)────► │  dashboard    │  │
│  │  Python asyncio  │                   │  Express.js   │  │
│  │                  │                   │  port: 3001   │  │
│  └────────┬─────────┘                   └───────┬───────┘  │
│           │                                     │           │
│           │ HTTPS                               │ HTTP      │
│           ▼                                     ▼           │
│  Paperless-NGX API              Browser / React SPA         │
│  Anthropic Claude API                                       │
└─────────────────────────────────────────────────────────────┘
```

### Processing Flow

1. A document is uploaded or scanned into Paperless-NGX
2. The tag **`Neu`** (or your configured tag) is assigned — manually or via a Paperless automation rule
3. The connector polls for documents with that tag every 5 minutes (configurable)
4. Claude AI analyzes the OCR text and returns structured JSON with title, correspondent, document type, tags, summary, and storage path
5. The connector resolves each field against existing Paperless entries using fuzzy matching — creating new entries only when necessary
6. The document is updated in Paperless; the `Neu` tag is removed and `ai-processed` is added

---

## Prerequisites

- **Docker** and **Docker Compose** (v2) installed on your server
- A running **Paperless-NGX** instance (v1.17+)
- An **Anthropic API key** — [get one here](https://console.anthropic.com/)
- Network access from the connector container to your Paperless instance

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/nexperts-labs/paperless-claude-connector.git
cd paperless-claude-connector
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Required
PAPERLESS_URL=https://your-paperless-instance.example.com
PAPERLESS_TOKEN=your_paperless_api_token
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional — defaults shown
CLAUDE_MODEL=claude-sonnet-4-5
SCAN_INTERVAL_SECONDS=300
TAG_NEW=Neu
TAG_PROCESSED=ai-processed
FUZZY_THRESHOLD=80
LOG_LEVEL=INFO
```

### 3. Get your Paperless API token

1. Log in to your Paperless-NGX instance
2. Go to **Settings → API → Generate Token**
3. Copy the token to `PAPERLESS_TOKEN` in your `.env`

### 4. Start the services

```bash
docker compose up -d
```

This builds and starts two containers:
- `paperless-claude-connector` — the Python processing service
- `paperless-claude-dashboard` — the web dashboard on port 3001

### 5. Verify it's running

```bash
# Check connector logs
docker compose logs -f connector

# Check dashboard
curl http://localhost:3001/api/health
```

The connector will log something like:
```
paperless-claude-connector starting up
  Paperless URL:    https://your-paperless-instance.example.com
  Claude Model:     claude-sonnet-4-5
  Scan Interval:    300s
  Tag New:          Neu
  Tag Processed:    ai-processed
Ready. Starting processing loop...
```

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `PAPERLESS_URL` | `http://localhost:8000` | Base URL of your Paperless-NGX instance |
| `PAPERLESS_TOKEN` | — | **Required.** API token from Paperless settings |
| `ANTHROPIC_API_KEY` | — | **Required.** Anthropic API key (`sk-ant-...`) |
| `CLAUDE_MODEL` | `claude-sonnet-4-5` | Claude model (see [models](#claude-models)) |
| `CLAUDE_MAX_TOKENS` | `2048` | Max tokens per Claude response |
| `SCAN_INTERVAL_SECONDS` | `300` | How often to poll Paperless for new documents |
| `TAG_NEW` | `Neu` | Tag that marks documents for processing |
| `TAG_PROCESSED` | `ai-processed` | Tag added after successful processing |
| `FUZZY_THRESHOLD` | `80` | Minimum similarity score for matching existing entries (0–100) |
| `LOG_LEVEL` | `INFO` | Logging verbosity: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `DATA_DIR` | `/data` | Directory for shared JSON files (leave as-is for Docker) |

### Claude Models

| Model ID | Speed | Cost | Best for |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | Fastest | Lowest | High-volume, simple documents |
| `claude-sonnet-4-5` | Balanced | Medium | **Recommended default** |
| `claude-sonnet-4-6` | Balanced | Medium | Latest Sonnet generation |
| `claude-opus-4-6` | Slower | Highest | Complex or ambiguous documents |

You can switch models at any time from the **Settings** tab in the dashboard — no restart required.

---

## Dashboard

Access the dashboard at `http://<your-server>:3001`

### Overview Tab
- Documents processed today and in total
- Success rate
- Token usage (prompt / completion / total)
- Processing history — the last 100 results with title, document type, correspondent, tokens, and duration

### Settings Tab
- Switch Claude model (restarts the connector automatically)
- Configure the `TAG_NEW` and `TAG_PROCESSED` tag names
- View or update the Anthropic API key

### Reprocess Tab
- **Search and select** documents from your full Paperless library
- **Enter IDs manually** (comma-separated) to reprocess specific documents
- **Reprocess all** — triggers reprocessing of every document in the system

> After clicking "Reprocess", the connector picks up the queue within 1 second — it does not wait for the next scan interval.

---

## Workflow Integration

### Automatic tagging with Paperless rules

Instead of manually tagging documents with `Neu`, create a Paperless automation rule:

1. Go to **Paperless → Settings → Workflows**
2. Create a new workflow: trigger = **Document added**, action = **Assign tag** → `Neu`

This way, every newly added document is automatically queued for processing.

### Storage paths

The connector reads your configured storage paths from Paperless and presents them to Claude for selection. Claude chooses based on the document content and correspondent.

To improve accuracy, customize the storage path hints in `connector/claude_client.py` (the `user_message` template, section „Hinweise zur Speicherpfad-Auswahl") to describe what each of your storage paths is for.

---

## Document Type Whitelist

The connector enforces a whitelist of 57 document types across 14 categories to prevent Claude from creating arbitrary types. If no match is found, it falls back to `Korrespondenz`.

**Categories:** General correspondence, Invoicing, Banking & Finance, Contracts, Tax & Government, Payroll, Insurance, Vehicles, Telecommunications & Energy, Real estate, Projects, Healthcare, Family, Pets

Full list available in `connector/config.py` (`DOCUMENT_TYPE_WHITELIST`).

---

## Project Structure

```
paperless-claude-connector/
├── connector/
│   ├── main.py              # Entry point — scan loop and reprocess queue
│   ├── config.py            # All configuration via env vars + document type whitelist
│   ├── models.py            # Data classes (PaperlessDocument, ClaudeAnalysis, etc.)
│   ├── paperless_client.py  # Paperless-NGX REST API client (async httpx)
│   ├── claude_client.py     # Anthropic API client + system prompt
│   ├── processor.py         # Core logic — fuzzy matching and metadata resolution
│   ├── storage.py           # JSON persistence for dashboard (results.json, stats.json)
│   ├── requirements.txt
│   └── Dockerfile
├── dashboard/
│   ├── server.js            # Express backend — API routes + serves React SPA
│   ├── src/
│   │   ├── App.tsx          # Main app — tab navigation
│   │   ├── components/
│   │   │   ├── Settings.tsx     # Model, tags, API key configuration
│   │   │   ├── Reprocess.tsx    # Document list with search and reprocess controls
│   │   │   ├── ResultsTable.tsx # Processing history
│   │   │   ├── StatCard.tsx
│   │   │   └── TokenBar.tsx
│   │   └── types.ts
│   ├── package.json         # Vite + React + TypeScript + Tailwind CSS
│   └── Dockerfile           # Multi-stage: Vite build + node:22-alpine production
├── docker-compose.yml
├── .env.example
├── CLAUDE.md                # Developer context for Claude Code
└── README.md
```

---

## Development

### Connector (Python)

```bash
cd connector
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Set required env vars
export PAPERLESS_URL=https://your-paperless-instance.example.com
export PAPERLESS_TOKEN=your_token
export ANTHROPIC_API_KEY=sk-ant-your-key

python main.py
```

### Dashboard (Node.js / React)

```bash
cd dashboard
npm install

# Development server (API requests proxied to Express)
npm run dev      # Vite dev server on port 5173

# Build production assets
npm run build
node server.js   # Express server on port 3001
```

---

## Troubleshooting

### Connector doesn't pick up documents

- Verify the `TAG_NEW` tag exists in Paperless (the connector creates it automatically on startup)
- Check that the document has OCR text: documents without content are skipped
- Check connector logs: `docker compose logs connector`

### SSL certificate errors

The connector uses `certifi` for SSL verification inside the Alpine-based container. If you're using a self-signed certificate, set `PAPERLESS_URL` to use `http://` or mount your certificate into the container.

### Claude returns invalid JSON

Rare but possible — the connector falls back to `Korrespondenz` as document type with no tags. The raw response is logged at `ERROR` level. Try switching to a more capable model.

### Dashboard shows stale data

The dashboard reads from shared JSON files; data refreshes every 30 seconds automatically. Use the **Refresh** button for immediate updates.

---

## Cost Estimate

Typical token usage per document: ~3,000–5,000 tokens (input) + ~200 tokens (output).

| Documents | Approximate cost (Sonnet) |
|---|---|
| 10 | ~$0.02 |
| 100 | ~$0.20 |
| 1,000 | ~$2.00 |

Using `claude-haiku-4-5-20251001` reduces cost by ~20×.

---

## Contributing

Pull requests are welcome. Please open an issue first for significant changes.

Branch strategy:
- `main` — stable releases
- `develop` — active development

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

Built with [Paperless-NGX](https://github.com/paperless-ngx/paperless-ngx), [Anthropic Claude](https://www.anthropic.com/claude), [rapidfuzz](https://github.com/rapidfuzz/RapidFuzz), [httpx](https://www.python-httpx.org/), [React](https://react.dev/), and [Tailwind CSS](https://tailwindcss.com/).
