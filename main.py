import logging
import gc

from fastapi import FastAPI
from rerank_service_generative import RerankService
from routes import router

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Crear instancia global del servicio de reranking
rerank_service = RerankService()

# Crear aplicación FastAPI
app = FastAPI(
    title="RexReranker API",
    description="API para reranking de documentos usando RexReranker optimizado (FP16 + torch.compile)",
    version="1.0.0",
)

# Inyectar el servicio en las rutas
from routes import set_rerank_service

set_rerank_service(rerank_service)

# Registrar rutas
app.include_router(router)


@app.on_event("startup")
async def startup_event():
    """Inicializa el modelo optimizado al arrancar la aplicación."""
    try:
        logger.info("Iniciando servicio de reranking optimizado...")
        rerank_service.initialize()
        logger.info("Aplicación lista para recibir requests")
    except Exception as e:
        logger.error(f"Error al inicializar la aplicación: {str(e)}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Limpia recursos al cerrar la aplicación."""
    try:
        logger.info("Cerrando aplicación...")
        await rerank_service.shutdown()
        gc.collect()
        logger.info("Aplicación cerrada correctamente")
    except Exception as e:
        logger.error(f"Error al cerrar la aplicación: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
