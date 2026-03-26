# Contributing

## Branch Strategy

- `main` — stable releases only, no direct pushes
- `develop` — active development; open PRs against this branch

## Development Setup

### Connector (Python)

```bash
cd connector
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp ../.env.example ../.env
# Edit .env with your credentials

python main.py
```

### Dashboard (Node.js)

```bash
cd dashboard
npm install
npm run dev    # Vite dev server on port 5173
```

For the full stack locally:

```bash
docker compose up -d
```

## Known Quirks

- **`docker compose restart` does not pull a new image** — always use `docker compose up -d` after a build.
- **SSL in containers:** `httpx` uses `certifi` instead of the system CA bundle (Let's Encrypt certs are missing from Alpine).
- **Storage path hints** in `connector/claude_client.py` are generic by default — customize the `user_message` template to match your Paperless storage path names for better assignment accuracy.

## Open TODOs

- [ ] Dashboard: progress indicator during reprocessing (poll `/api/stats`)
- [ ] Dashboard: real-time log stream from connector (SSE or WebSocket)
- [ ] Dashboard: make storage path hints configurable via Settings tab
- [ ] Connector: retry logic for transient Claude API errors (429, 529)
- [ ] Connector: extract document date from content and write to Paperless `created` field
