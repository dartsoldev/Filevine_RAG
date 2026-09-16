# Filevine RAG API

Agentic RAG (Retrieval-Augmented Generation) pipeline that ingests documents from Filevine (via Zapier), stores them in Qdrant, and answers natural-language questions about clients/cases using a self-query retriever + LangGraph workflow with relevance-checking and a fallback to avoid hallucination.

## Project Structure

```
RAG_Arav/
├── main.py                    # FastAPI endpoints only
├── schema.py                  # Pydantic request/response models
├── document_ingestion.py      # Download -> load -> chunk -> embed -> upsert -> cleanup
├── graph.py                   # Self-query retriever + LangGraph agentic RAG workflow
├── requirements.txt
├── .env                       # API keys (not committed to git)
├── downloads/                 # Temporary storage for downloaded files (auto-cleaned)
├── embedding_cache/           # Cached embeddings (avoids re-calling OpenAI for the same text)
└── received_documents.jsonl   # Log of pending/incoming documents from the webhook
```

## How It Works

### 1. Ingestion Pipeline (`document_ingestion.py`)
Triggered by the `/webhook/document` endpoint whenever Zapier sends a new document:

1. **Download** — fetches the file from Filevine's temporary signed S3 URL
2. **Load** — picks the right LangChain loader based on file extension (`.pdf`, `.docx`, `.txt`, `.csv`)
3. **Attach metadata** — tags each chunk with `case_id`, `client_name`, `doc_type`, `filename`, `received_at`
4. **Chunk** — splits text using `RecursiveCharacterTextSplitter` (chunk_size=800, overlap=120)
5. **Embed** — generates embeddings with `text-embedding-3-large` (cached locally to save API calls)
6. **Upsert** — stores vectors + metadata in the `filevine-RAG` Qdrant collection
7. **Cleanup** — removes the processed record from `received_documents.jsonl` and deletes the local file

### 2. Retrieval + Generation (`graph.py`)
Triggered by the `/chat` endpoint for every user question:

```
START → plan ── conversation → respond → END
           └── documents → retrieve → prepare_context → respond → END
```

- **Planner**: understands informal wording and separates greetings/small talk from document requests.
- **Retriever**: compares existing metadata without case or whitespace sensitivity, then searches only matching point IDs. Explicit client/case constraints are never dropped. Filenames may omit the extension. No re-upload or database migration is required.
- **Context**: passes retrieved passages and metadata directly to the answer model. A separate binary relevance gate no longer discards useful summary material. The answer model identifies which passages support its response.
- **Response**: uses a friendly tone and the user's language, cites source files, and asks a focused clarification when evidence is missing. Sources are deduplicated.

Metadata matching currently scans metadata pages for constrained searches. This is suitable for the current small collection; a large deployment should use indexed normalized payload fields with a backfill. Each `/chat` request is independent: conversation history/session memory is not persisted.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook/document` | Receives document metadata from Zapier and runs the full ingestion pipeline |
| `GET` | `/webhook/documents` | Lists documents still pending in the log file (not yet processed) |
| `POST` | `/chat` | Runs the agentic RAG pipeline for a user query; returns `answer` + `sources` |
| `GET` | `/` , `/health` | Basic health check |
| `GET` | `/qdrant/status` | Checks Qdrant connectivity and returns collection stats |

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt --break-system-packages
```

### 2. Create a `.env` file in the project root
```env
OPENAI_API_KEY=sk-...
QDRANT_URL=https://your-cluster-id.aws.cloud.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
```

### 3. Run the server
```bash
python -m uvicorn main:app --reload --port 8000
```

### 4. Expose it publicly (for Zapier to reach it)
```bash
ngrok http 8000
```
Copy the `https://xxxx.ngrok-free.app` URL and use `<that-url>/webhook/document` as the POST URL in Zapier's "Webhooks by Zapier" step.

## Example: Calling `/chat`

**Request**
```json
POST /chat
{
  "query": "how much medical bill of casename (any)?"
}
```

**Response**
```json
{
  "answer": "According to the Medical Bills document for Usama Fiaz (Case ID: 972), the total amount billed is $3,955.00...",
  "sources": [
    {
      "filename": "casefile_Medical_Bill.pdf",
      "client_name": "case name",
      "doc_type": "Medical Bills",
      "case_id": "972"
    }
  ]
}
```

## Notes

- `case_id` is used as the Qdrant **tenant field** for data isolation, but is **not required** from the chatbot user — the self-query retriever primarily filters on `client_name` and `doc_type`, since end users typically know the client's name rather than the internal case ID. If a user does mention a case ID, it's picked up as an additional filter automatically.
- The `embedding_cache/` folder should **not** be deleted casually — it saves OpenAI API costs on repeated runs.
- `downloads/` and `received_documents.jsonl` are self-cleaning: once a document is successfully processed, its local file and log entry are removed automatically.
