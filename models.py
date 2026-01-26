from typing import List, Optional
from pydantic import BaseModel


class RerankRequest(BaseModel):
    """Request model para el endpoint de reranking."""
    query: str
    documents: List[str]
    top_k: Optional[int] = None
    instruction: Optional[str] = None


class DocumentScore(BaseModel):
    """Modelo para representar un documento con su score de relevancia."""
    document: str
    score: float
    index: int


class RerankResponse(BaseModel):
    """Response model para el endpoint de reranking."""
    query: str
    results: List[DocumentScore]
    instruction: str


class HealthResponse(BaseModel):
    """Response model para el endpoint de health check."""
    status: str
    model_loaded: bool
    gpu_available: bool
    gpu_count: int
    model_name: str

