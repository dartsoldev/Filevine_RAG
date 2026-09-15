import os
import json
import requests
from datetime import datetime
from fastapi import FastAPI, HTTPException
from backend.schema import DocumentPayload, ChatRequest, ChatResponse
from backend.document_ingestion import process_document, LOG_FILE, qdrant_client, COLLECTION_NAME
from backend.graph import rag_graph

app = FastAPI(title="Filevine RAG API")


# ==========================================================================
# 1. INGESTION / WEBHOOK ENDPOINTS
# ==========================================================================

@app.post("/webhook/document")
async def receive_document(payload: DocumentPayload):
    """
    Receives document metadata from Zapier (Filevine document -> locator -> this webhook),
    logs it, then runs the full ingestion pipeline: download -> load -> chunk -> embed ->
    upsert to Qdrant -> cleanup (removes the log entry & the downloaded file).
    """
    try:
        record = payload.dict()
        record["file_url"] = str(record["file_url"])
        record["received_at"] = datetime.utcnow().isoformat() + "Z"

        # Log the incoming record first (so nothing is lost if processing fails)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")

        result = process_document(record)

        return {
            "success": True,
            "message": "Document processed and stored in Qdrant successfully",
            "data": result,
        }

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to download file: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@app.get("/webhook/documents")
def list_pending_documents():
    """Debug endpoint: shows documents still waiting in the log file (not yet processed)."""
    if not os.path.exists(LOG_FILE):
        return {"count": 0, "documents": []}

    documents = []
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                documents.append(json.loads(line))

    return {"count": len(documents), "documents": documents}


# ==========================================================================
# 2. CHAT / RETRIEVAL ENDPOINT
# ==========================================================================

@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """
    Runs the full agentic RAG pipeline (retrieve -> evaluate_docs -> generate/fallback)
    for a user's natural language question and returns the answer + source documents used.
    """
    try:
        result = rag_graph.invoke({
            "query": request.query,
            "messages": [],
            "retry_count": 0,
        })

        used_docs = result.get("relevant_docs") or []
        sources = [
            {
                "filename": doc.metadata.get("filename"),
                "client_name": doc.metadata.get("client_name"),
                "doc_type": doc.metadata.get("doc_type"),
                "case_id": doc.metadata.get("case_id"),
            }
            for doc in used_docs
        ]

        return ChatResponse(answer=result.get("generation", ""), sources=sources)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating response: {str(e)}")


# ==========================================================================
# 5. HEALTH / UTILITY ENDPOINTS
# ==========================================================================
@app.get("/")
def health_check():
    return {"status": "ok", "message": "Filevine RAG API is running"}


@app.get("/health")
def health_check_alias():
    return {"status": "ok", "message": "Filevine RAG API is running"}


@app.get("/qdrant/status")
def qdrant_status():
    """Checks Qdrant connectivity and returns basic collection stats."""
    try:
        info = qdrant_client.get_collection(COLLECTION_NAME)
        return {
            "status": "connected",
            "collection": COLLECTION_NAME,
            "points_count": info.points_count,
            "vectors_count": info.vectors_count,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Qdrant connection failed: {str(e)}")