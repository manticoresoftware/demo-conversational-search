# ConvApparel Conversational Product Search

FastAPI demo for asking shopping questions against ConvApparel apparel products through Manticore `CALL CHAT`.
User queries go directly to the Manticore chat model; the app exposes only the chat endpoint.

The project entry point is `docker-compose.yml`. It runs the app and Manticore on the same Compose network, which matters because the app connects to Manticore through the Compose service name `manticore`.

## Dataset

This project uses the `google/ConvApparel` dataset from Hugging Face: conversations between shoppers and an apparel recommendation assistant. The dataset contains product recommendations for footwear, outerwear, tops, and bottoms.

The preparation script builds a deduplicated product corpus from recommendation items:

- `item_id`
- `title`
- `description`
- `features`
- `image_url`
- inferred apparel category

ConvApparel v1 currently yields 82,524 unique product IDs from 175,751 recommendation occurrences.

The repository includes a split SQL dump with product rows and precomputed `embedding_vector` values:

- `dumps/convapparel_products_with_embeddings.sql.xz.part-*`

Restoring this dump is much faster than downloading ConvApparel and waiting for Manticore to calculate 82k embeddings during setup.

Raw downloaded data and locally generated non-embedding SQL are intentionally ignored by git:

- `data/raw/ConvApparel.zip`
- `dumps/convapparel_products.sql.gz`

## Quick Start

Create the environment file and set your OpenRouter key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENROUTER_API_KEY=
```

Initialize Manticore from the checked-in precomputed dump and recreate the chat model:

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

The key is passed into the `manticore` service and used when creating the Manticore chat model.

## API

- `POST /api/assistant/chat`
  - Body: `message`, optional `conversation_uuid`

Example:

```bash
curl -X POST "http://127.0.0.1:8000/api/assistant/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"I need waterproof black running shoes for jogging"}'
```

## Manticore Initialization

The Quick Start runs `./scripts/init_manticore.sh` once before starting the app. That script starts the `manticore` service, removes old orphan services, waits for the MySQL protocol, drops any existing `convapparel_products` table and `assistant` chat model, restores `dumps/convapparel_products_with_embeddings.sql.xz.part-*`, and applies `dumps/create_chat_model.sql`.

Run the initialization script again when you need to reset the `convapparel_products` table or recreate the `assistant` chat model. Edit `dumps/create_chat_model.sql` if the chat model definition needs to change.

## Local Python Development

The Compose setup is the supported way to run the full app because `app.py` connects to Manticore at `http://manticore:9308`. If you run Uvicorn directly on the host, that service name will not resolve unless you provide an equivalent local hostname or adjust the code/configuration for local development.

For app-only iteration after handling Manticore connectivity:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
