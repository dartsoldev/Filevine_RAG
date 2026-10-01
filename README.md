# Filevine RAG API

Agentic RAG (Retrieval-Augmented Generation) pipeline that ingests documents from Filevine (via Zapier), stores them in Qdrant, and answers natural-language questions about clients/cases using a self-query retriever + LangGraph workflow with fuzzy client matching, short-term session memory, and a grounded answer step that avoids hallucination.

## Project Structure

```
RAG_Arav/
├── main.py                        # FastAPI endpoints only
├── backend/
│   ├── schema.py                  # Pydantic request/response models
│   ├── document_ingestion.py      # Download -> load -> chunk -> embed -> upsert -> cleanup (+ model config)
│   └── graph.py                   # Self-query retriever + LangGraph agentic RAG workflow + session memory
├── tests/
│   └── test_fuzzy_retrieval.py    # Unit tests (no network: Qdrant/OpenAI are faked)
├── requirements.txt
├── .env                           # API keys (not committed to git)
├── downloads/                     # Temporary storage for downloaded files (auto-cleaned)
├── embedding_cache/               # Cached embeddings (avoids re-calling OpenAI for the same text)
└── received_documents.jsonl       # Log of pending/incoming documents from the webhook
```

## How It Works

### 1. Ingestion Pipeline (`backend/document_ingestion.py`)
Triggered by the `/webhook/document` endpoint whenever Zapier sends a new document:

1. **Download** — fetches the file from Filevine's temporary signed S3 URL
2. **Load** — picks the right LangChain loader based on file extension (`.pdf`, `.docx`, `.txt`, `.csv`)
3. **Attach metadata** — tags each chunk with `case_id`, `client_name`, `doc_type`, `filename`, `received_at`
4. **Chunk** — splits text using `RecursiveCharacterTextSplitter` (chunk_size=800, overlap=150)
5. **Embed** — generates embeddings with `text-embedding-3-large` (cached locally to save API calls)
6. **Upsert** — stores vectors + metadata in the `filevine-RAG` Qdrant collection
7. **Cleanup** — removes the processed record from `received_documents.jsonl`, deletes the local file, and refreshes the retriever's cached list of known client names / doc types

### 2. Retrieval + Generation (`backend/graph.py`)
Triggered by the `/chat` endpoint for every user question:

```
START → plan ── conversation → respond → END
           └── documents → retrieve → prepare_context → respond → END
```

- **Planner** (`gpt-5.4-mini`): understands informal wording (English, Urdu, Roman Urdu, typos) and separates greetings/small talk from document requests. It receives the list of **known client names and doc types** from Qdrant and maps whatever the user typed onto the closest real value. It also receives the **recent conversation**, so follow-ups like "Noman Test2 wala" or "same but for medical bills" reuse the previous question's topic and constraints.
- **Retriever**: filters by metadata, then runs a vector search over the matching point IDs only. Matching is **fuzzy** for `client_name` and `doc_type` (case/whitespace-insensitive, whole-string similarity ≥ 0.85, or every typed word closely matching a stored word), so `noman test`, `nouman test2` and `Dennis Ponce` all find `Noman Test2` / `Dennis A. Ponce Castro`. `case_id` and `filename` stay exact (filenames may omit the extension).
  - **Zero match fallback**: if nothing matches, the closest known values are looked up. One close candidate → used automatically. Several → returned as suggestions.
  - **Ambiguity check**: if the given client name fits **more than one client** (e.g. `Noman Test2` and `Noman Test3`), no documents are returned; the matching names are passed to the responder so it can ask which client the user means.
- **Context**: passes retrieved passages and metadata directly to the answer model.
- **Response** (`gpt-5.4`): answers in the user's language and tone, cites source files, identifies which passages support the answer, and when candidates are listed asks a short "Do you mean X or Y?" instead of guessing.
- **Session memory**: the graph is compiled with a LangGraph `MemorySaver` checkpointer keyed by `thread_id` = the chat `session_id`. The last 10 messages (5 user + 5 assistant turns) are kept per session and older ones are dropped. Memory is in-process: it is cleared on restart and not shared between workers.

Metadata matching currently scans metadata pages for constrained searches. This is suitable for the current small collection; a large deployment should use indexed normalized payload fields (Qdrant text index + `MatchText`) with a backfill.

### Tuning knobs (`backend/graph.py`)

| Constant | Default | Meaning |
|---|---|---|
| `FUZZY_THRESHOLD` | 0.85 | Whole-string similarity needed for a client/doc_type match |
| `TOKEN_THRESHOLD` | 0.8 | Per-word similarity when matching word by word |
| `SUGGESTION_CUTOFF` | 0.6 | Looser cutoff used only for "did you mean" suggestions |
| `KNOWN_VALUES_TTL` | 120 s | How long the list of known clients / doc types is cached |
| `MAX_HISTORY_MESSAGES` | 10 | Messages kept per session |
| `MAX_CLIENT_CHOICES` | 5 | Max clients offered when a name is ambiguous |

Models are set in `backend/document_ingestion.py` (`llm` for answers, `planner_llm` for planning).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook/document` | Receives document metadata from Zapier and runs the full ingestion pipeline |
| `GET` | `/webhook/documents` | Lists documents still pending in the log file (not yet processed) |
| `POST` | `/chat` | Runs the agentic RAG pipeline for a user query; returns `answer`, `sources` and `session_id` |
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
Interactive docs: http://localhost:8000/docs

### 4. Expose it publicly (for Zapier to reach it)
```bash
ngrok http 8000
```
Copy the `https://xxxx.ngrok-free.app` URL and use `<that-url>/webhook/document` as the POST URL in Zapier's "Webhooks by Zapier" step.

### 5. Run the tests
```bash
python -m pytest tests -q
```
The tests fake Qdrant and OpenAI, so no keys or network are needed.

> **Windows note:** if the server fails with `DLL load failed while importing _tiktoken: An Application Control policy has blocked this file`, Windows **Smart App Control** is blocking tiktoken's unsigned native DLL. Turn it off under *Windows Security → App & browser control → Smart App Control*, or run the project in WSL/Docker/Render instead.

## Example: Calling `/chat`

**First request** (no `session_id` → a new session is created)
```json
POST /chat
{
  "query": "noman test ki files btao"
}
```

**Response** — the name matched two clients, so the bot asks instead of guessing
```json
{
  "answer": "I found more than one client with that name. Do you mean Noman Test2 or Noman Test3?",
  "sources": [],
  "session_id": "3f9c1b2e8a4d4e0f9c7b6a5d4e3f2a1b"
}
```

**Follow-up** (send the `session_id` back so the bot remembers the previous question)
```json
POST /chat
{
  "query": "Noman Test2 wala",
  "session_id": "3f9c1b2e8a4d4e0f9c7b6a5d4e3f2a1b"
}
```

**Response**
```json
{
  "answer": "According to the Medical Bills document for Noman Test2 (Case ID: 972), the total amount billed is $3,955.00...",
  "sources": [
    {
      "filename": "casefile_Medical_Bill.pdf",
      "client_name": "Noman Test2",
      "doc_type": "Medical Bills",
      "case_id": "972"
    }
  ],
  "session_id": "3f9c1b2e8a4d4e0f9c7b6a5d4e3f2a1b"
}
```

If `session_id` is omitted on every request, each question is handled independently with no memory.

## Notes

- `case_id` is used as the Qdrant **tenant field** for data isolation, but is **not required** from the chatbot user — the self-query retriever primarily filters on `client_name` and `doc_type`, since end users typically know the client's name rather than the internal case ID. If a user does mention a case ID, it's picked up as an additional filter automatically.
- The `embedding_cache/` folder should **not** be deleted casually — it saves OpenAI API costs on repeated runs.
- `downloads/` and `received_documents.jsonl` are self-cleaning: once a document is successfully processed, its local file and log entry are removed automatically.
- Session memory lives in the server process. For multi-worker or multi-instance deployments, swap `MemorySaver` for a persistent LangGraph checkpointer (e.g. Postgres/Redis).
