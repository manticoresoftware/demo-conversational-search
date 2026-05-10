# FIQA Comments Conversational Search

Minimal FastAPI app for searching FIQA comments in Manticore and running conversational search.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Open: `http://127.0.0.1:8000`

## Environment

Set in `.env`:

```env
OPENROUTER_API_KEY=
```

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

Initialize Manticore from the checked-in SQL files:

```bash
./scripts/init_manticore.sh
docker compose up --build app
```

The script starts the `manticore` service, removes old orphan services, waits for
the MySQL protocol, drops any existing `fiqa_docs` table and `assistant` chat model,
restores the split archive at `dumps/fiqa_docs_with_embeddings.sql.tar.gz.part-*`,
and applies `dumps/create_chat_model.sql`.

```sql
CREATE CHAT MODEL assistant (
    model='openai:gpt-4o-mini',
    timeout=60,
    retrieval_limit=5,
    max_document_length=0
);
```
