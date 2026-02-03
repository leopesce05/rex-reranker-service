import logging

import torch
from fastapi import APIRouter, HTTPException

from models import DocumentScore, HealthResponse, RerankRequest, RerankResponse
from rerank_service_generative import RerankService

logger = logging.getLogger(__name__)


router = APIRouter()

# Variable global para almacenar el servicio (será inyectada desde main)
_rerank_service: RerankService | None = None


def set_rerank_service(service: RerankService) -> None:
    """Establece la instancia del servicio de reranking."""
    global _rerank_service
    _rerank_service = service


def get_rerank_service() -> RerankService:
    """Obtiene la instancia del servicio de reranking."""
    if _rerank_service is None:
        raise RuntimeError("Servicio de reranking no inicializado")
    return _rerank_service


@router.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest) -> RerankResponse:
    """
    Rerankea documentos basado en una query usando el modelo RexReranker optimizado.
    """
    rerank_service = get_rerank_service()

    if not rerank_service.is_ready():
        raise HTTPException(
            status_code=503,
            detail="Modelo no inicializado. Por favor, espere a que el modelo termine de cargar.",
        )

    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="La lista de documentos no puede estar vacía",
        )

    try:
        # Ejecutar reranking (async, con dynamic batching)
        results, latency_ms = await rerank_service.rerank_async(
            query=request.query,
            documents=request.documents,
            top_k=request.top_k,
        )

        # Convertir resultados al formato de respuesta
        document_scores = [
            DocumentScore(document=doc, score=score, index=idx)
            for doc, score, idx in results
        ]

        return RerankResponse(
            query=request.query,
            results=document_scores,
            latency_ms=latency_ms,
        )

    except ValueError as e:
        logger.error(f"Error de validación: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error durante el reranking: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno durante el reranking: {str(e)}",
        )


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Endpoint de health check para verificar el estado del servicio."""
    rerank_service = get_rerank_service()

    return HealthResponse(
        status="healthy" if rerank_service.is_ready() else "initializing",
        model_loaded=rerank_service.is_ready(),
        gpu_available=torch.cuda.is_available(),
        gpu_count=torch.cuda.device_count() if torch.cuda.is_available() else 0,
        model_name=rerank_service.model_name,
    )


@router.get("/")
async def root():
    """Endpoint raíz con información de la API."""
    try:
        model_name = get_rerank_service().model_name
    except RuntimeError:
        model_name = "thebajajra/RexReranker-large"
    return {
        "name": "Optimized RexReranker API",
        "version": "1.0.0",
        "model": model_name,
        "endpoints": {
            "rerank": "/rerank",
            "health": "/health",
            "docs": "/docs",
        },
    }


