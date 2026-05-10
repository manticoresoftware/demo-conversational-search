# FIQA Comments Conversational Search

FastAPI application for searching FIQA comments in Manticore and running
conversational search through a Manticore chat model.

The project entry point is `docker-compose.yml`. It runs the app and Manticore
on the same Compose network, which matters because the app connects to
Manticore through the Compose service name `manticore`.

## Dataset

This project uses the FIQA dataset: a financial question-answering dataset built
from finance-related questions, answers, and comments. The application indexes
FIQA comments in Manticore and uses them as the retrieval corpus for search and
conversational answers.

The repository includes a Manticore dump with the FIQA documents and embeddings
already prepared. Restoring that dump is much faster than downloading the raw
dataset and recalculating embeddings during setup.

If you want to build the index yourself, you can manually download the FIQA
dataset, generate embeddings, and upload the resulting documents into
Manticore instead of restoring `dumps/fiqa_docs_with_embeddings.sql.tar.gz.part-*`.

## Quick Start

Create the environment file and set your OpenRouter key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENROUTER_API_KEY=
```

Initialize Manticore from the checked-in dumps:

```bash
./scripts/init_manticore.sh
```

Start the API:

```bash
docker compose up --build app
```

Open: `http://127.0.0.1:8000`

## Environment

Set in `.env`:

```env
OPENROUTER_API_KEY=
```

The key is passed into the `manticore` service and used when creating the
Manticore chat model.

## API

- `GET /api/comments`
  - Query params: `q`, `sort`, `limit`, `offset`
- `POST /api/assistant/chat`
  - Body: `message`, optional `conversation_uuid`

Example:

```bash
curl "http://127.0.0.1:8000/api/comments?q=tax&sort=relevance&limit=5&offset=0"
```

## Manticore Initialization

The Quick Start runs `./scripts/init_manticore.sh` once before starting the app.
That script starts the `manticore` service, removes old orphan services, waits
for the MySQL protocol, drops any existing `fiqa_docs` table and `assistant`
chat model, restores the split archive at
`dumps/fiqa_docs_with_embeddings.sql.tar.gz.part-*`, and applies
`dumps/create_chat_model.sql`.

Run the initialization script again when you need to reset the `fiqa_docs` table
or recreate the `assistant` chat model from the checked-in SQL files. Edit
`dumps/create_chat_model.sql` if the chat model definition needs to change.

## Local Python Development

The Compose setup is the supported way to run the full app because `app.py`
connects to Manticore at `http://manticore:9308`. If you run Uvicorn directly on
the host, that service name will not resolve unless you provide an equivalent
local hostname or adjust the code/configuration for local development.

For app-only iteration after handling Manticore connectivity:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
