# ClaireMed Demo

A demo of Claire, an AI clinical intake assistant for outpatient clinics: patients complete a
conversational AI intake chat before their appointment, the transcript is structured into a
clinical history, and a draft SOAP note is generated for the physician to review and sign. This
repo is a Django (DRF) + MySQL backend, a Vite/React SPA frontend, and a production Docker
Compose stack (nginx + gunicorn + MySQL) fronting them.

See the spec and plan for the full feature scope and implementation approach:

- [Design spec](docs/superpowers/specs/2026-07-18-clairemed-demo-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-18-clairemed-demo.md)
- [Feature extraction notes](FEATURES.md)

## Run locally (dev)

Requires Docker (for MySQL), Python 3.12, and Node 22.

```bash
# 1. Start MySQL only
docker compose up -d db

# 2. Backend (Django dev server on :8000)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MYSQL_HOST=127.0.0.1 MYSQL_DATABASE=clairemed MYSQL_USER=clairemed MYSQL_PASSWORD=clairemed-dev
python manage.py migrate
python manage.py runserver

# 3. Frontend (Vite dev server on :5173, proxies /api to :8000)
cd frontend
npm install
npm run dev
```

Without `MYSQL_HOST` set, the backend falls back to a local `db.sqlite3` file — handy for
quick frontend-only iteration.

## Run with Docker (production-style)

```bash
cp .env.example .env
# edit .env: set a real OPENAI_API_KEY and non-default passwords/secret key
docker compose up -d --build
```

This builds and starts three services:

- `db` — MySQL 8
- `web` — Django/gunicorn backend (runs migrations on start)
- `nginx` — serves the built SPA and proxies `/api/` to `web` (streaming-safe: buffering is
  disabled so SSE responses arrive incrementally)

The app is served at `http://localhost/`. Health check: `curl http://localhost/api/health/`.

To stop: `docker compose down` (add `-v` to also drop the MySQL data volume).

## Environment variables (`.env`)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key used for the intake chat and note generation. |
| `CHAT_MODEL` | Chat model used for the intake conversation and SOAP note drafting. |
| `TRANSCRIBE_MODEL` | Model used to transcribe patient voice input. |
| `DJANGO_SECRET_KEY` | Django's `SECRET_KEY`. Set to a unique random value in production. |
| `DJANGO_DEBUG` | `1` for dev-style debug output, `0` in production. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames Django will accept requests for. |
| `MYSQL_HOST` | Hostname of the MySQL server (`db` in the Docker Compose network). |
| `MYSQL_DATABASE` | MySQL database name. |
| `MYSQL_USER` | MySQL application user. |
| `MYSQL_PASSWORD` | Password for `MYSQL_USER`. |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (used for the container healthcheck). |
