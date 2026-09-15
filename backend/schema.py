from pydantic import BaseModel, HttpUrl

class DocumentPayload(BaseModel):
    file_url: HttpUrl
    filename: str
    case_id: str
    client_name: str
    doc_type: str

class ChatRequest(BaseModel):
    query: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]