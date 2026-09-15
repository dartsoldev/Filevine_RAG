"""
graph.py
========
Everything related to answering a user's question:
- Self-query retriever (parses natural language -> semantic query + metadata filters -> Qdrant search)
- LangGraph agentic RAG workflow (retrieve -> evaluate_docs -> generate/fallback, with retry logic)

Reuses the shared llm, embeddings, and qdrant_client from document_ingestion.py.
"""

from typing import Any, Optional
from pydantic import BaseModel, Field
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, START, END, MessagesState
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, Range

from backend.document_ingestion import llm, embeddings, qdrant_client, COLLECTION_NAME


# --------------------------------------------------------------------------
# Self-Query Retriever
# --------------------------------------------------------------------------
class MetadataFilter(BaseModel):
    field: str = Field(description="Metadata field name to filter on")
    value: str | int | float = Field(description="Value to filter by")
    operator: str = Field(default="eq", description="Comparison operator: eq, ne, gt, gte, lt, lte")


class SelfQuerySchema(BaseModel):
    query: str = Field(description="Semantic search query extracted from the user's question")
    filters: Optional[list[MetadataFilter]] = Field(
        default=None,
        description="Metadata filters extracted from the query. None if no filters apply.",
    )


SELF_QUERY_SYSTEM_PROMPT = """You are a query parser for a legal/medical case document database.
Parse the user's natural language query into:
1. A semantic search query (the conceptual meaning to search for)
2. Optional metadata filters on these fields only:
   - client_name (string) — the client/patient's name
   - doc_type (string, e.g. "Medical Bills", "Insurance", "Medical Records")
   - case_id (string) — ONLY include this if the user explicitly mentions a case number/ID
   - filename (string)
   - received_at (date string in ISO format, e.g. "2026-09-07")

Supported operators: eq, ne, gt, gte, lt, lte
Only add filters when the user explicitly specifies a constraint on one of these fields.
If the user gives a name (e.g. "Usama Fiaz"), always extract it as a client_name filter.
"""

self_query_prompt = ChatPromptTemplate.from_messages([
    ("system", SELF_QUERY_SYSTEM_PROMPT),
    ("human", "query: {query}"),
])

structured_llm = llm.with_structured_output(SelfQuerySchema)
query_chain = self_query_prompt | structured_llm


class FilevineSelfQueryRetriever:
    """
    1. Parses a natural-language query into a semantic query + metadata filters (LLM).
    2. Runs vector search on Qdrant with whatever filters were extracted.
    """

    def __init__(self, qdrant_client: QdrantClient, collection_name: str,
                 embeddings: Any, query_chain: Any):
        self.qdrant_client = qdrant_client
        self.collection_name = collection_name
        self.embeddings = embeddings
        self.query_chain = query_chain

    def _build_qdrant_filter(self, filters: Optional[list[MetadataFilter]]) -> Optional[Filter]:
        if not filters:
            return None

        must_conditions = []
        must_not_conditions = []

        for f in filters:
            if f.operator == "eq":
                must_conditions.append(FieldCondition(key=f.field, match=MatchValue(value=f.value)))
            elif f.operator == "ne":
                must_not_conditions.append(FieldCondition(key=f.field, match=MatchValue(value=f.value)))
            elif f.operator in ["gt", "gte", "lt", "lte"]:
                must_conditions.append(FieldCondition(key=f.field, range=Range(**{f.operator: f.value})))

        return Filter(must=must_conditions or None, must_not=must_not_conditions or None)

    def retrieve(self, query: str, k: int = 5) -> list[Document]:
        parsed: SelfQuerySchema = self.query_chain.invoke({"query": query})

        qdrant_filter = self._build_qdrant_filter(parsed.filters)
        query_vector = self.embeddings.embed_query(parsed.query)

        response = self.qdrant_client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=qdrant_filter,
            limit=k,
        )

        results = []
        for hit in response.points:
            payload = dict(hit.payload)
            page_content = payload.pop("page_content", "")
            results.append(Document(page_content=page_content, metadata=payload))

        return results


retriever = FilevineSelfQueryRetriever(
    qdrant_client=qdrant_client,
    collection_name=COLLECTION_NAME,
    embeddings=embeddings,
    query_chain=query_chain,
)


# --------------------------------------------------------------------------
# Agentic RAG Pipeline (LangGraph)
# --------------------------------------------------------------------------
class AgenticRAGState(MessagesState):
    query: str
    retrieved_docs: list[Document]
    relevant_docs: list[Document]
    is_relevant: bool
    retry_count: int
    context: str
    generation: str


class RelevanceEvaluation(BaseModel):
    is_relevant: bool = Field(description="True if the passage contains useful information to answer the query, else False")


def retrieve_node(state: AgenticRAGState) -> dict:
    retry_count = state.get("retry_count", 0)
    k = 5 + (retry_count * 3)   # 1st try: 5, 2nd: 8, 3rd: 11
    docs = retriever.retrieve(state["query"], k=k)
    return {"retrieved_docs": docs, "retry_count": retry_count}


def evaluate_docs_node(state: AgenticRAGState) -> dict:
    docs = state.get("retrieved_docs") or []
    if not docs:
        return {"is_relevant": False, "relevant_docs": [], "context": ""}

    active_query = state["query"]

    prompt_template = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a relevance evaluator for a legal/medical case document database. "
            "Given a user query and a single document passage, determine whether the passage "
            "contains useful information to answer the query. "
            "Return is_relevant=True only if the passage directly addresses the query with specific facts. "
            "Return is_relevant=False if it is off-topic, too vague, or does not help answer the query."
        ),
        ("human", "Query: {query}\n\nDocument passage:\n{doc}"),
    ])

    chain = prompt_template | llm.with_structured_output(RelevanceEvaluation)

    relevant_docs = []
    for doc in docs:
        result = chain.invoke({"query": active_query, "doc": doc.page_content})
        if result.is_relevant:
            relevant_docs.append(doc)

    is_relevant = len(relevant_docs) > 0

    context = "\n\n".join(
        f"[Source: {d.metadata.get('filename')} | Client: {d.metadata.get('client_name')} | "
        f"Doc Type: {d.metadata.get('doc_type')} | Case ID: {d.metadata.get('case_id')}]\n"
        f"{d.page_content}"
        for d in relevant_docs
    )

    return {"is_relevant": is_relevant, "relevant_docs": relevant_docs, "context": context}


def fallback_node(state: AgenticRAGState) -> dict:
    """After 3 failed tries, return a fixed safe message instead of letting the LLM hallucinate."""
    message = (
        "Sorry I couldn't find any relevant information in the documents to answer your question. "
        "Please confirm the client's name, case ID, or document type and try again."
    )
    return {"generation": message}


def generate_node(state: AgenticRAGState) -> dict:
    query = state["query"]
    context = state.get("context") or ""

    prompt_template = ChatPromptTemplate.from_messages([
        ("system", """You are a helpful legal case assistant.
Answer the user's question using ONLY the information provided in the context below.
If the context does not contain enough information to answer, say so clearly — do not make up facts.
Always mention which client/case the information is about, and cite the source file(s) you used.

Context:
{context}"""),
        ("human", "{query}"),
    ])

    response = (prompt_template | llm).invoke({"context": context, "query": query})
    return {"generation": response.content}


def route_after_evaluation(state: AgenticRAGState) -> str:
    if state.get("is_relevant"):
        return "generate"

    retry_count = state.get("retry_count", 0)
    if retry_count < 2:   # 0, 1, 2 -> total 3 attempts
        return "retry"

    return "fallback"


def increment_retry_node(state: AgenticRAGState) -> dict:
    return {"retry_count": state.get("retry_count", 0) + 1}


graph_builder = StateGraph(AgenticRAGState)

graph_builder.add_node("retrieve", retrieve_node)
graph_builder.add_node("evaluate_docs", evaluate_docs_node)
graph_builder.add_node("increment_retry", increment_retry_node)
graph_builder.add_node("generate", generate_node)
graph_builder.add_node("fallback", fallback_node)

graph_builder.add_edge(START, "retrieve")
graph_builder.add_edge("retrieve", "evaluate_docs")
graph_builder.add_conditional_edges(
    "evaluate_docs",
    route_after_evaluation,
    {"generate": "generate", "retry": "increment_retry", "fallback": "fallback"},
)
graph_builder.add_edge("increment_retry", "retrieve")
graph_builder.add_edge("generate", END)
graph_builder.add_edge("fallback", END)

rag_graph = graph_builder.compile()