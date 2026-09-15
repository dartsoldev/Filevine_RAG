"""
document_ingestion.py
======================
Handles everything related to taking a document from Filevine (via the webhook)
and getting it into Qdrant: download -> load -> chunk -> embed -> upsert -> cleanup.

Also owns the shared clients (LLM, embeddings, Qdrant client) that both
main.py and graph.py depend on.
"""

import os
import json
import uuid

import requests
from dotenv import load_dotenv

from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    TextLoader,
    CSVLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_classic.embeddings import CacheBackedEmbeddings
from langchain_classic.storage import LocalFileStore

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from pathlib import Path

load_dotenv()
# --------------------------------------------------------------------------
# Setup (shared clients used by graph.py and main.py too)
# --------------------------------------------------------------------------


ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_FILE = ROOT_DIR / "received_documents.jsonl"
DOWNLOAD_DIR = ROOT_DIR / "downloads"
COLLECTION_NAME = "filevine-RAG"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

llm = ChatOpenAI(model="gpt-4o", temperature=0)

base_embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
embedding_file_store = LocalFileStore("./embedding_cache/")
embeddings = CacheBackedEmbeddings.from_bytes_store(
    base_embeddings,
    embedding_file_store,
    namespace=base_embeddings.model,
    query_embedding_cache=True,
    key_encoder="blake2b",
)

qdrant_client = QdrantClient(
    url=os.environ["QDRANT_URL"],
    api_key=os.environ["QDRANT_API_KEY"],
    timeout=120,
)


# --------------------------------------------------------------------------
# Loader selection
# --------------------------------------------------------------------------
def get_loader(file_path: str):
    """Chooses the appropriate LangChain loader based on the file extension."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return PyPDFLoader(file_path)
    elif ext in [".docx", ".doc"]:
        return Docx2txtLoader(file_path)
    elif ext == ".txt":
        return TextLoader(file_path, encoding="utf-8")
    elif ext == ".csv":
        return CSVLoader(file_path)
    else:
        raise ValueError(f"Unsupported file type: '{ext}'. A loader needs to be added for this format.")


# --------------------------------------------------------------------------
# Cleanup helpers
# --------------------------------------------------------------------------
def remove_processed_record(log_file: str, processed_record: dict):
    """Removes the specific record from received_documents.jsonl once it's been processed."""
    if not os.path.exists(log_file):
        return

    with open(log_file, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    remaining_lines = []
    for line in lines:
        record = json.loads(line)
        is_same_record = (
            record.get("filename") == processed_record.get("filename")
            and record.get("case_id") == processed_record.get("case_id")
            and record.get("received_at") == processed_record.get("received_at")
        )
        if not is_same_record:
            remaining_lines.append(line)

    with open(log_file, "w", encoding="utf-8") as f:
        for line in remaining_lines:
            f.write(line + "\n")


def cleanup_downloaded_file(file_path: str):
    """Deletes the local downloaded file once its text has been extracted & stored."""
    if os.path.exists(file_path):
        os.remove(file_path)


# --------------------------------------------------------------------------
# Main ingestion pipeline
# --------------------------------------------------------------------------
def process_document(record: dict) -> dict:
    """
    Full ingestion pipeline for a single document:
    download -> load -> add metadata -> chunk -> embed -> upsert to Qdrant -> cleanup
    """
    file_url = record["file_url"]
    filename = record["filename"]

    # 1. Download
    response = requests.get(file_url, timeout=30)
    response.raise_for_status()

    local_path = os.path.join(DOWNLOAD_DIR, filename)
    with open(local_path, "wb") as f:
        f.write(response.content)

    # 2. Load (type-aware)
    loader = get_loader(local_path)
    documents = loader.load()

    # 3. Attach Filevine metadata for filtering later
    for doc in documents:
        doc.metadata["filename"] = record["filename"]
        doc.metadata["case_id"] = record["case_id"]
        doc.metadata["client_name"] = record["client_name"]
        doc.metadata["doc_type"] = record["doc_type"]
        doc.metadata["received_at"] = record["received_at"]

    # 4. Chunk
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=120,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = text_splitter.split_documents(documents)

    # 5. Embed + upsert to Qdrant
    texts = [chunk.page_content for chunk in chunks]
    vectors = embeddings.embed_documents(texts)

    points = []
    for chunk, vector in zip(chunks, vectors):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={"page_content": chunk.page_content, **chunk.metadata},
            )
        )

    qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)

    # 6. Cleanup: remove processed record from log + delete local file
    remove_processed_record(LOG_FILE, record)
    cleanup_downloaded_file(local_path)

    return {"chunks_uploaded": len(points), "filename": filename, "case_id": record["case_id"]}