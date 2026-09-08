from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from datetime import datetime
import json
import os

app = FastAPI(title="Filevine Document Receiver")

LOG_FILE = "received_documents.jsonl"

class DocumentPayload(BaseModel):
    file_url: HttpUrl        
    filename: str            
    case_id: str             # Filevine projectId (e.g. "972")
    client_name: str        
    doc_type: str            # "Medical Bills", "Medical Records", "Correspondence", etc.


@app.get("/")
def health_check():
    return {"status": "ok", "message": "FastAPI receiver is running"}


@app.post("/webhook/document")
async def receive_document(payload: DocumentPayload):
    """
    Receives document metadata + a temporary download URL.
    Add your own processing logic below (download file, save to DB, run OCR, etc.)
    """
    try:
        record = payload.dict()
        record["file_url"] = str(record["file_url"])
        record["received_at"] = datetime.utcnow().isoformat() + "Z"

        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")

        print(f"Received document: {record['filename']} (case {record['case_id']})")

        return {
            "success": True,
            "message": "Document received successfully",
            "data": record,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@app.get("/webhook/documents")
def list_received_documents():
    """Utility endpoint to view everything received so far (for testing only)."""
    if not os.path.exists(LOG_FILE):
        return {"count": 0, "documents": []}

    documents = []
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                documents.append(json.loads(line))

    return {"count": len(documents), "documents": documents}