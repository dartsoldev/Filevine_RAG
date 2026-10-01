from pydantic import BaseModel, HttpUrl

class DocumentPayload(BaseModel):
    file_url: HttpUrl
    filename: str
    case_id: str
    client_name: str
    doc_type: str

class ChatRequest(BaseModel):
    query: str
    session_id: str | None = None   # send back the session_id from the previous reply to keep context


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    session_id: str
