import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, List, Optional, Tuple

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

logger = logging.getLogger(__name__)

# Configurar PyTorch para mejor manejo de memoria
if "PYTORCH_ALLOC_CONF" not in os.environ:
    os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
    logger.info("Configurado PYTORCH_ALLOC_CONF=expandable_segments:True")

# Optimizaciones CUDA para GPUs NVIDIA
if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True


class OptimizedRexReranker:
    """
    RexReranker-large optimizado para producción.
    
    Usa AutoModelForSequenceClassification (versión encoder) con:
    - torch.compile (backend inductor, max-autotune)
    - FP16 en GPU
    - Batching eficiente
    """

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-large",
        max_length: Optional[int] = None,
    ) -> None:
        self.model_name = model_name
        self.max_length = max_length or 512

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda" else torch.float32

        # Batch size dinámico según memoria GPU
        if self.device == "cuda":
            gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            if gpu_memory_gb >= 24:
                self.default_batch_size = 128
            elif gpu_memory_gb >= 12:
                self.default_batch_size = 96
            elif gpu_memory_gb >= 8:
                self.default_batch_size = 64
            else:
                self.default_batch_size = 48
            logger.info(f"GPU detectada: {gpu_memory_gb:.1f}GB, batch_size={self.default_batch_size}")
        else:
            self.default_batch_size = 16

        self.tokenizer: Optional[AutoTokenizer] = None
        self.model: Optional[AutoModelForSequenceClassification] = None
        self._ready: bool = False

    def initialize(self) -> None:
        """Carga modelo y tokenizer, aplica optimizaciones."""
        try:
            logger.info(f"Inicializando OptimizedRexReranker con modelo '{self.model_name}'")
            
            # Cargar tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                use_fast=True,
                trust_remote_code=True,
            )
            
            # Cargar modelo SequenceClassification
            logger.info("Cargando modelo con AutoModelForSequenceClassification...")
            base_model = AutoModelForSequenceClassification.from_pretrained(
                self.model_name,
                torch_dtype=self.torch_dtype,
                device_map=None,
                trust_remote_code=True,
            )
            
            # Ajustar max_length según configuración del modelo
            if hasattr(base_model.config, 'max_position_embeddings'):
                model_max_length = base_model.config.max_position_embeddings
                if self.max_length is None or self.max_length > model_max_length:
                    self.max_length = min(model_max_length, 512)
                    logger.info(f"max_length ajustado a {self.max_length}")

            model = base_model.to(self.device)

            # Aplicar torch.compile con backend inductor
            if hasattr(torch, "compile"):
                try:
                    logger.info("Aplicando torch.compile(backend='inductor', mode='default')...")
                    model = torch.compile(
                        model,
                        backend="inductor",  # Backend inductor genera kernels optimizados para GPU
                        mode="default"  # Evita CUDA graphs que causan problemas con asyncio.to_thread()
                    )
                except Exception as compile_err:
                    logger.warning(f"No se pudo compilar con torch.compile: {compile_err}")

            self.model = model.eval()
            self._warmup()
            self._ready = True
            logger.info("OptimizedRexReranker inicializado y listo")
        except Exception as e:
            logger.error(f"Error al inicializar OptimizedRexReranker: {e}", exc_info=True)
            self._ready = False
            raise

    def _warmup(self) -> None:
        """Warmup para compilación y kernels CUDA."""
        try:
            if self.tokenizer is None or self.model is None:
                return
            dummy_query = "warmup query"
            dummy_doc = "warmup document"
            pairs = [(dummy_query, dummy_doc)] * min(8, self.default_batch_size)
            inputs = self._process_inputs(pairs)
            for _ in range(3):
                with torch.no_grad():
                    _ = self._compute_logits(inputs)
            if self.device == "cuda":
                torch.cuda.empty_cache()
        except Exception as e:
            logger.warning(f"Error durante warmup (no crítico): {e}")

    def is_ready(self) -> bool:
        return self._ready and self.model is not None and self.tokenizer is not None

    def _format_pair(self, query: str, document: str) -> Tuple[str, str]:
        """Formatea query y documento según formato de RexReranker-base."""
        formatted_query = f"Query: {query}"
        return formatted_query, document
    
    def _process_inputs(self, pairs: List[Tuple[str, str]]) -> dict:
        """Procesa pares query-documento para SequenceClassification."""
        if self.tokenizer is None:
            raise RuntimeError("Tokenizer no inicializado")
        
        # Formatear pares
        formatted_pairs = [self._format_pair(query, doc) for query, doc in pairs]
        
        # Tokenizar pares (query, document)
        inputs = self.tokenizer(
            formatted_pairs,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        # Mover a dispositivo (clonar para evitar problemas con CUDA graphs)
        device_inputs = {}
        for key in inputs:
            device_inputs[key] = inputs[key].clone().to(self.device)
        
        return device_inputs
    
    @torch.no_grad()
    def _compute_logits(self, inputs: dict) -> List[float]:
        """Calcula scores usando SequenceClassification."""
        if self.model is None:
            raise RuntimeError("Modelo no inicializado")
        
        try:
            outputs = self.model(**inputs)
            # Para SequenceClassification, el score es directamente el logit
            scores = outputs.logits.squeeze(-1).cpu().tolist()
            return scores
        except RuntimeError as e:
            if self._is_cuda_oom_error(e):
                logger.warning("CUDA out of memory detectado, limpiando caché...")
                self._clear_cuda_cache()
                raise RuntimeError("CUDA out of memory. Intenta con menos documentos.") from e
            raise
    
    def _is_cuda_oom_error(self, error: Exception) -> bool:
        """Detecta si el error es CUDA out of memory."""
        return "CUDA out of memory" in str(error) or "out of memory" in str(error).lower()
    
    def _clear_cuda_cache(self) -> None:
        """Limpia la caché de CUDA."""
        if self.device == "cuda":
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            logger.info("Memoria CUDA limpiada")
    
    def _score_pairs(self, query: str, documents: List[str]) -> List[float]:
        """Calcula scores para una lista de documentos."""
        if not self.is_ready():
            raise RuntimeError("El reranker no está inicializado")
        assert self.model is not None
        assert self.tokenizer is not None

        # Crear pares (query, documento)
        pairs = [(query, doc) for doc in documents]
        
        # Procesar inputs
        inputs = self._process_inputs(pairs)
        
        # Calcular scores
        scores = self._compute_logits(inputs)
        
        return scores

    def rerank_batch(
        self,
        query: str,
        documents: List[str],
        return_sorted: bool = True,
        top_k: Optional[int] = None,
    ) -> List[Tuple[str, float, int]]:
        """
        Rerankea un batch de documentos para un único query.
        
        Devuelve lista de tuplas (documento, score, índice_original).
        """
        if not documents:
            raise ValueError("La lista de documentos no puede estar vacía")

        scores = self._score_pairs(query, documents)

        results: List[Tuple[str, float, int]] = [
            (doc, float(score), idx)
            for idx, (doc, score) in enumerate(zip(documents, scores))
        ]

        if return_sorted:
            results.sort(key=lambda x: x[1], reverse=True)

        if top_k is not None and top_k > 0:
            results = results[:top_k]

        return results

    def rerank_large_batch(
        self,
        query: str,
        documents: List[str],
        batch_size: Optional[int] = None,
        top_k: Optional[int] = None,
    ) -> List[Tuple[str, float, int]]:
        """
        Maneja listas grandes dividiéndolas en sub-batches.
        
        Si hay error de memoria, reduce el batch_size automáticamente.
        """
        if not documents:
            raise ValueError("La lista de documentos no puede estar vacía")

        if batch_size is None:
            batch_size = self.default_batch_size

        all_results: List[Tuple[str, float, int]] = []
        original_batch_size = batch_size
        retry_count = 0
        max_retries = 3

        while retry_count <= max_retries:
            try:
                all_results = []
                for start in range(0, len(documents), batch_size):
                    end = min(start + batch_size, len(documents))
                    sub_docs = documents[start:end]
                    
                    try:
                        sub_results = self.rerank_batch(
                            query, sub_docs, return_sorted=False
                        )
                    except RuntimeError as e:
                        if self._is_cuda_oom_error(e):
                            # Reducir batch_size y reintentar
                            if batch_size > 1:
                                old_batch_size = batch_size
                                batch_size = max(1, batch_size // 2)
                                logger.warning(
                                    f"CUDA OOM. Reduciendo batch_size de {old_batch_size} a {batch_size}"
                                )
                                self._clear_cuda_cache()
                                sub_results = self.rerank_batch(
                                    query, sub_docs, return_sorted=False
                                )
                            else:
                                self._clear_cuda_cache()
                                raise RuntimeError(
                                    "CUDA out of memory incluso con batch_size=1. "
                                    "Intenta con menos documentos."
                                ) from e
                        else:
                            raise
                    
                    # Ajustar índices al índice global original
                    for local_doc, score, local_idx in sub_results:
                        global_idx = start + local_idx
                        all_results.append((local_doc, score, global_idx))
                    
                    # Limpiar caché periódicamente
                    if self.device == "cuda" and (start + batch_size) % (batch_size * 2) == 0:
                        self._clear_cuda_cache()

                # Si llegamos aquí, todo funcionó
                break
                
            except RuntimeError as e:
                if self._is_cuda_oom_error(e) and retry_count < max_retries:
                    retry_count += 1
                    old_batch_size = batch_size
                    batch_size = max(1, batch_size // 2)
                    logger.warning(
                        f"CUDA OOM. Reintento {retry_count}/{max_retries} "
                        f"con batch_size reducido de {old_batch_size} a {batch_size}"
                    )
                    self._clear_cuda_cache()
                    all_results = []
                else:
                    self._clear_cuda_cache()
                    raise

        # Orden global
        all_results.sort(key=lambda x: x[1], reverse=True)

        if top_k is not None and top_k > 0:
            all_results = all_results[:top_k]

        return all_results


@dataclass
class _BatchRequest:
    query: str
    documents: List[str]
    top_k: Optional[int]
    future: "asyncio.Future[Tuple[List[Tuple[str, float, int]], float]]"
    start_time: float


class DynamicBatcher:
    """
    Batcher para agrupar requests y procesarlos en paralelo.
    
    Limita la concurrencia para evitar saturar la GPU.
    """

    def __init__(
        self,
        reranker: OptimizedRexReranker,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 50,  # tiempo máximo de espera para acumular requests
        max_concurrent_requests: int = 4,  # número máximo de requests que se pueden procesar en paralelo
    ) -> None:
        self.reranker = reranker
        self.max_batch_size = max_batch_size or reranker.default_batch_size
        self.max_wait_ms = max_wait_ms
        self.max_concurrent_requests = max_concurrent_requests

        self._queue: Deque[_BatchRequest] = deque()
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._semaphore = asyncio.Semaphore(max_concurrent_requests)

    def start(self) -> None:
        if self._running:
            return
        loop = asyncio.get_event_loop()
        self._running = True
        self._task = loop.create_task(self._process_queue())
        logger.info(
            f"DynamicBatcher iniciado (max_batch_size={self.max_batch_size}, "
            f"max_wait_ms={self.max_wait_ms}, max_concurrent={self.max_concurrent_requests})"
        )

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def add_request(
        self,
        query: str,
        documents: List[str],
        top_k: Optional[int],
    ) -> Tuple[List[Tuple[str, float, int]], float]:
        """Encola una request y devuelve (resultados, latency_ms)."""
        loop = asyncio.get_event_loop()
        future: "asyncio.Future[Tuple[List[Tuple[str, float, int]], float]]" = loop.create_future()
        req = _BatchRequest(
            query=query,
            documents=list(documents),
            top_k=top_k,
            future=future,
            start_time=time.perf_counter(),
        )

        async with self._lock:
            self._queue.append(req)

        return await future

    async def _process_queue(self) -> None:
        """Bucle principal que agrupa y procesa requests."""
        try:
            while self._running:
                batch: List[_BatchRequest] = []

                async with self._lock:
                    if not self._queue:
                        pass
                    else:
                        # Tomar al menos una request
                        first_req = self._queue.popleft()
                        batch.append(first_req)

                        # Intentar acumular más hasta max_batch_size o max_wait_ms
                        start_wait = time.perf_counter()
                        while (
                            len(batch) < self.max_batch_size
                            and self._queue
                            and (time.perf_counter() - start_wait) * 1000 < self.max_wait_ms
                        ):
                            batch.append(self._queue.popleft())

                if not batch:
                    await asyncio.sleep(0.001)
                    continue

                # Procesar requests del batch en paralelo con límite de concurrencia
                async def process_single_request(req: _BatchRequest) -> None:
                    """Procesa un request individual en un thread separado."""
                    async with self._semaphore:
                        try:
                            results = await asyncio.to_thread(
                                self.reranker.rerank_large_batch,
                                req.query,
                                req.documents,
                                self.max_batch_size,
                                req.top_k,
                            )
                            latency_ms = (time.perf_counter() - req.start_time) * 1000.0
                            if not req.future.done():
                                req.future.set_result((results, latency_ms))
                        except RuntimeError as e:
                            if self.reranker._is_cuda_oom_error(e):
                                logger.error(
                                    f"CUDA out of memory procesando request. Limpiando memoria..."
                                )
                                self.reranker._clear_cuda_cache()
                                # Reintentar con batch_size reducido
                                try:
                                    reduced_batch = max(1, self.max_batch_size // 2)
                                    results = await asyncio.to_thread(
                                        self.reranker.rerank_large_batch,
                                        req.query,
                                        req.documents,
                                        reduced_batch,
                                        req.top_k,
                                    )
                                    latency_ms = (time.perf_counter() - req.start_time) * 1000.0
                                    if not req.future.done():
                                        req.future.set_result((results, latency_ms))
                                except Exception as retry_e:
                                    if not req.future.done():
                                        req.future.set_exception(retry_e)
                            else:
                                if not req.future.done():
                                    req.future.set_exception(e)
                        except Exception as e:
                            logger.error(f"Error procesando request: {e}", exc_info=True)
                            if not req.future.done():
                                req.future.set_exception(e)
                        finally:
                            # Limpieza periódica
                            if self.reranker.device == "cuda":
                                self.reranker._clear_cuda_cache()

                # Procesar todos los requests del batch en paralelo
                await asyncio.gather(*[process_single_request(req) for req in batch])

                await asyncio.sleep(0.0)
        except asyncio.CancelledError:
            logger.info("DynamicBatcher detenido")


class RerankService:
    """
    Fachada de alto nivel para el servicio de reranking.
    
    Expone una API sencilla usada por FastAPI.
    """

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-base",
        max_length: Optional[int] = None,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 50,
        max_concurrent_requests: int = 4,
    ) -> None:
        self.model_name = model_name
        self._reranker = OptimizedRexReranker(
            model_name=model_name,
            max_length=max_length,
        )
        self._batcher = DynamicBatcher(
            reranker=self._reranker,
            max_batch_size=max_batch_size,
            max_wait_ms=max_wait_ms,
            max_concurrent_requests=max_concurrent_requests,
        )

    def initialize(self) -> None:
        """Inicializa el modelo y arranca el batcher."""
        self._reranker.initialize()
        self._batcher.start()

    async def shutdown(self) -> None:
        """Detiene el batcher y libera memoria de GPU."""
        await self._batcher.stop()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def is_ready(self) -> bool:
        """Indica si el servicio está listo para procesar requests."""
        return self._reranker.is_ready()

    async def rerank_async(
        self,
        query: str,
        documents: List[str],
        top_k: Optional[int] = None,
    ) -> Tuple[List[Tuple[str, float, int]], float]:
        """
        Punto de entrada principal usado por las rutas FastAPI.
        
        Devuelve (resultados, latency_ms).
        """
        if not self.is_ready():
            raise RuntimeError("El servicio no está inicializado")

        if not documents:
            raise ValueError("La lista de documentos no puede estar vacía")

        results, latency_ms = await self._batcher.add_request(
            query=query,
            documents=documents,
            top_k=top_k,
        )
        logger.info(
            f"Reranking completado. Documentos={len(documents)}, top_k={top_k}, "
            f"latencia={latency_ms:.2f} ms"
        )
        return results, latency_ms
