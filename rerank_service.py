import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, List, Optional, Tuple

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

logger = logging.getLogger(__name__)

# Optimizaciones de CUDA para mejor rendimiento
if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True


class OptimizedRexReranker:
    """
    Reranker de clasificación optimizado para producción.

    - Usa AutoModelForSequenceClassification + AutoTokenizer
    - FP16 en GPU cuando está disponible
    - `torch.compile` para reducir overhead cuando está disponible (torch>=2.0)
    """

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-0.6B",
        max_length: int = 512,
    ) -> None:
        self.model_name = model_name
        self.max_length = max_length

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda" else torch.float32

        # Detectar capacidad de GPU para ajustar batch size dinámicamente
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
        """Carga modelo y tokenizer, aplica `torch.compile` y hace warmup."""
        try:
            logger.info(
                f"Inicializando OptimizedRexReranker con modelo '{self.model_name}' en dispositivo '{self.device}'"
            )
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                use_fast=True,
                trust_remote_code=True,
            )

            base_model = AutoModelForSequenceClassification.from_pretrained(
                self.model_name,
                torch_dtype=self.torch_dtype,
                device_map=None,
                trust_remote_code=True,
            )

            # Configurar padding token si no existe (necesario para batches)
            if self.tokenizer.pad_token is None:
                # Usar eos_token como pad_token si existe, sino usar unk_token
                if self.tokenizer.eos_token is not None:
                    self.tokenizer.pad_token = self.tokenizer.eos_token
                elif self.tokenizer.unk_token is not None:
                    self.tokenizer.pad_token = self.tokenizer.unk_token
                else:
                    # Si no hay ninguno, agregar un token especial y redimensionar el modelo
                    self.tokenizer.add_special_tokens({'pad_token': '[PAD]'})
                    # Redimensionar el embedding del modelo para incluir el nuevo token
                    base_model.resize_token_embeddings(len(self.tokenizer))
                
                # Asegurar que pad_token_id esté configurado
                if self.tokenizer.pad_token_id is None:
                    self.tokenizer.pad_token_id = self.tokenizer.eos_token_id if self.tokenizer.eos_token_id is not None else self.tokenizer.unk_token_id
                
                logger.info(f"Padding token configurado: '{self.tokenizer.pad_token}' (ID: {self.tokenizer.pad_token_id})")
            
            # Asegurar que el modelo también tenga el pad_token_id configurado
            if hasattr(base_model.config, 'pad_token_id') and base_model.config.pad_token_id is None:
                base_model.config.pad_token_id = self.tokenizer.pad_token_id
                logger.info(f"Modelo config.pad_token_id actualizado: {base_model.config.pad_token_id}")

            model = base_model.to(self.device)

            # Aplicar torch.compile si está disponible
            if hasattr(torch, "compile"):
                try:
                    logger.info("Aplicando torch.compile(mode='reduce-overhead')...")
                    model = torch.compile(model, mode="reduce-overhead")  # type: ignore[attr-defined]
                except Exception as compile_err:
                    logger.warning(
                        f"No se pudo compilar el modelo con torch.compile: {compile_err}"
                    )

            self.model = model.eval()

            # Warmup: una pasada rápida para que el modelo compilado quede listo
            self._warmup()

            self._ready = True
            logger.info("OptimizedRexReranker inicializado y listo para uso")
        except Exception as e:
            logger.error(f"Error al inicializar OptimizedRexReranker: {e}", exc_info=True)
            self._ready = False
            raise

    def _warmup(self) -> None:
        """Ejecuta múltiples pasadas de warmup para estabilizar compilación y CUDA kernels."""
        try:
            if self.tokenizer is None or self.model is None:
                return

            dummy_query = "warmup query"
            dummy_docs = ["warmup document"] * min(8, self.default_batch_size)
            
            for _ in range(3):
                inputs = self.tokenizer(
                    [dummy_query] * len(dummy_docs),
                    dummy_docs,
                    max_length=self.max_length,
                    padding=True,
                    truncation=True,
                    return_tensors="pt",
                ).to(self.device)

                with torch.inference_mode():
                    _ = self.model(**inputs)
            
            if self.device == "cuda":
                torch.cuda.empty_cache()
                
        except Exception as e:
            logger.warning(f"Error durante warmup (no crítico): {e}", exc_info=True)

    def is_ready(self) -> bool:
        return self._ready and self.model is not None and self.tokenizer is not None

    def _score_pairs(
        self, query: str, documents: List[str]
    ) -> List[float]:
        """Devuelve un score por cada documento dado un query."""
        if not self.is_ready():
            raise RuntimeError("El reranker no está inicializado")

        assert self.model is not None
        assert self.tokenizer is not None

        queries = [query] * len(documents)

        inputs = self.tokenizer(
            queries,
            documents,
            max_length=self.max_length,
            padding=True,
            truncation=True,
            return_tensors="pt",
        ).to(self.device)

        with torch.inference_mode():
            outputs = self.model(**inputs)
            logits = outputs.logits

        # Asumimos que mayor logit => mayor relevancia
        # Si el modelo es binario, usamos la prob de la clase positiva (índice 1)
        if logits.shape[-1] == 1:
            scores = logits.squeeze(-1).float().cpu().tolist()
        else:
            # Probabilidad de la clase con mayor logit
            probs = torch.softmax(logits, dim=-1)
            # Usar la probabilidad de la clase positiva (índice 1) si existe
            idx = 1 if probs.shape[-1] > 1 else 0
            scores = probs[:, idx].float().cpu().tolist()

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

        El top_k se aplica sobre el conjunto completo de resultados.
        """
        if not documents:
            raise ValueError("La lista de documentos no puede estar vacía")

        if batch_size is None:
            batch_size = self.default_batch_size

        all_results: List[Tuple[str, float, int]] = []

        for start in range(0, len(documents), batch_size):
            end = min(start + batch_size, len(documents))
            sub_docs = documents[start:end]
            sub_results = self.rerank_batch(
                query, sub_docs, return_sorted=False
            )
            # Ajustar índices al índice global original
            for local_doc, score, local_idx in sub_results:
                global_idx = start + local_idx
                all_results.append((local_doc, score, global_idx))
            
            if self.device == "cuda" and (start + batch_size) % (batch_size * 4) == 0:
                torch.cuda.empty_cache()

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
    Batcher sencillo basado en cola para agrupar requests.

    Nota: actualmente procesa cada request de forma secuencial dentro del batch,
    pero la capa permite evolucionar a batching real de modelo en el futuro.
    """

    def __init__(
        self,
        reranker: OptimizedRexReranker,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 5,
    ) -> None:
        self.reranker = reranker
        self.max_batch_size = max_batch_size or reranker.default_batch_size
        self.max_wait_ms = max_wait_ms

        self._queue: Deque[_BatchRequest] = deque()
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def start(self) -> None:
        if self._running:
            return
        loop = asyncio.get_event_loop()
        self._running = True
        self._task = loop.create_task(self._process_queue())
        logger.info(
            f"DynamicBatcher iniciado (max_batch_size={self.max_batch_size}, max_wait_ms={self.max_wait_ms})"
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
        """
        Encola una request y devuelve (resultados, latency_ms).
        """
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
                        # Nada que procesar, dormir un poco
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
                            and (time.perf_counter() - start_wait) * 1000
                            < self.max_wait_ms
                        ):
                            batch.append(self._queue.popleft())

                if not batch:
                    await asyncio.sleep(0.001)
                    continue

                # Procesar cada request en el batch (secuencialmente por simplicidad)
                for req in batch:
                    try:
                        results = self.reranker.rerank_large_batch(
                            req.query,
                            req.documents,
                            batch_size=self.max_batch_size,
                            top_k=req.top_k,
                        )
                        latency_ms = (time.perf_counter() - req.start_time) * 1000.0
                        if not req.future.done():
                            req.future.set_result((results, latency_ms))
                    except Exception as e:
                        logger.error(
                            f"Error procesando request en DynamicBatcher: {e}",
                            exc_info=True,
                        )
                        if not req.future.done():
                            req.future.set_exception(e)

                # Pequeña pausa para ceder control al event loop
                await asyncio.sleep(0.0)
        except asyncio.CancelledError:
            logger.info("DynamicBatcher detenido")


class RerankService:
    """
    Fachada de alto nivel para el servicio de reranking.

    Expone una API sencilla usada por FastAPI, delegando en
    `OptimizedRexReranker` + `DynamicBatcher`.
    """

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-0.6B",
        max_length: int = 512,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 5,
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

