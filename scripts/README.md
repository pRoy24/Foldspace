# Agentverse Registration Script

This lightweight Python entry point registers the Foldspace T2V price discovery endpoint as an Agentverse chat agent.

## Prerequisites
- Python 3.10+ (confirmed with `uagents-core==0.3.11`)
- Agentverse API key and agent seed phrase

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
python -m ensurepip --upgrade  # ensures pip inside the venv on macOS
python -m pip install -r requirements.txt
```

## Usage
Export the required secrets and run the script:
```bash
export AGENTVERSE_API_KEY="your-agentverse-api-key"
export AGENT_SEED_PHRASE="urge stay ... seed phrase ..."
python register_t2v_agent.py
```

Upon success the script prints the registered agent label and endpoint. Missing environment variables cause the script to exit with a non-zero status and a helpful message.

## FastAPI Web Server
The original Express adapter has been reimplemented in FastAPI under `fastapi_server.py`.  
It exposes the same endpoints (`/`, `/health`, `/status`, `/chat`, `/request_pricing`, `/sessions/...`, `/facilitator/...`, `/payments/...`, `/agentverse/register`) with placeholder responses so you can start wiring integrations from Python.

### Local uv workflow
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh            # install uv once
uv venv .venv                                             # create a managed virtualenv
source .venv/bin/activate
uv pip install -r scripts/requirements.txt
uv run uvicorn scripts.fastapi_server:app --host 0.0.0.0 --port 3000 --reload
```

`uv run` automatically picks the `.venv` interpreter. Update the project root `.env` (or supply `FOLDSPACE_ENV_FILE`) so the app has `AGENT_SEED_PHRASE`.  
If the seed phrase is omitted the server still starts, but `/chat` becomes receive-only.

### Classic virtualenv
```bash
source .venv/bin/activate  # if not already active
export AGENT_SEED_PHRASE="urge stay ... seed phrase ..."
python -m uvicorn scripts.fastapi_server:app --host 0.0.0.0 --port 3000 --reload
```

Environment variables are loaded from the project `.env` automatically via `python-dotenv` (with `scripts/.env` kept as a fallback). Provide `AGENT_SEED_PHRASE` to enable outbound `/chat` responses; otherwise the endpoint will log a warning and skip replies.

### Ubuntu uv + PM2 bootstrap
Use the helper script to automate uv installation, dependency sync, and PM2 startup:
```bash
bash scripts/setup_uv_pm2.sh
```
The script:
- Installs uv (`~/.local/bin/uv`) if missing.
- Creates or reuses `.venv` (override with `UV_ENV_DIR=/path/to/env`).
- Installs `scripts/requirements.txt`.
- Installs PM2 via npm when absent, then runs `pm2 start` with name `foldspace-fastapi` on port `3000` (override via `PM2_APP_NAME` and `PORT`).

After it finishes run `pm2 status` to confirm the FastAPI worker is healthy; `pm2 logs foldspace-fastapi` tails runtime logs.

## Agentverse Hosted Chat Agent
`scripts/hosted_agent/agent.py` wires the Foldspace proxy into the lightweight uAgents chat protocol so you can expose the API as a hosted Agentverse experience.

- **Slash commands** & responses explicitly show the HTTP method, URL, request JSON, and response JSON for `/create`, `/status`, and `/sessions`. Users are prompted to format `/create` exactly as:
  ```
  /create
  Prompt - vivid description
  Image Model - model-name
  Video Model - model-name
  Duration - 30s
  ```
  `/status <sessionId>` and `/sessions` fetch proxy state, while `/suggest <rough idea>` (optional) calls OpenAI to polish prompts.
- **Proxy configuration** via `FOLDSPACE_PROXY_BASE_URL` (defaults to `http://localhost:4001`). All other environment variables reuse the project `.env` loader or accept overrides via `FOLDSPACE_ENV_FILE`.
- **OpenAI adapter** (`scripts/hosted_agent/openai_adapter.py`) provides chat completions and embeddings; enable it by exporting `OPENAI_API_KEY` (and optionally `OPENAI_ORGANIZATION`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`).
- **Running locally**
  ```bash
  source .venv/bin/activate
  python -m pip install -r scripts/requirements.txt
  FOLDSPACE_PROXY_BASE_URL="http://localhost:4001" \
  python scripts/hosted_agent/agent.py
  ```
  The agent publishes the chat protocol manifest automatically; point an Agentverse hosted agent at the resulting endpoint/identity to expose the chat interface.
