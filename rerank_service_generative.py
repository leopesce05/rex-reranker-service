import asyncio
import logging
import math
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, List, Optional, Tuple

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = logging.getLogger(__name__)

# Configurar PyTorch
if "PYTORCH_ALLOC_CONF" not in os.environ:
    os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"

if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False

    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True

    torch.backends.cuda.enable_flash_sdp(True)
    torch.backends.cuda.enable_mem_efficient_sdp(True)
    torch.backends.cuda.enable_math_sdp(True)


class OptimizedRexReranker:
    """
    RexReranker-0.6B optimizado con HF Transformers.
    
    Usa formato oficial: system prompt + user prompt con <Instruct>, <Query>, <Document>
    Genera 1 token: "yes" o "no", convierte a score probabilístico.
    """

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-0.6B",
        max_length: int = 8192,
        instruction: Optional[str] = None,
    ) -> None:
        self.model_name = model_name
        self.max_length = max_length
        self.instruction = instruction or "Given a web search query, retrieve relevant passages that answer the query"

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda" else torch.float32

        # Batch size dinámico según GPU
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
            logger.info(f"GPU: {gpu_memory_gb:.1f}GB, batch_size={self.default_batch_size}")
        else:
            self.default_batch_size = 16

        self.tokenizer: Optional[AutoTokenizer] = None
        self.model: Optional[AutoModelForCausalLM] = None
        self.token_true_id: Optional[int] = None
        self.token_false_id: Optional[int] = None
        self.prefix_tokens: List[int] = []
        self.suffix_tokens: List[int] = []
        self._ready: bool = False

    def initialize(self) -> None:
        """Carga modelo, tokenizer y prepara tokens especiales."""
        try:
            logger.info(f"Inicializando RexReranker: {self.model_name}")
            
            # Cargar tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                padding_side='left',
                use_fast=True,
                trust_remote_code=True,
            )
            
            # Cargar modelo
            logger.info("Cargando modelo CausalLM...")
            base_model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                dtype=self.torch_dtype,
                trust_remote_code=True,
                attn_implementation="flash_attention_2" if self.device == "cuda" else "eager",
            )
            
            model = base_model.to(self.device).eval()

            # Aplicar torch.compile
            if hasattr(torch, "compile") and self.device == "cuda":
                try:
                    logger.info("Aplicando torch.compile...")
                    model = torch.compile(model, backend="inductor", mode="default")
                except Exception as e:
                    logger.warning(f"No se pudo compilar: {e}")

            self.model = model

            # Preparar tokens especiales
            self.token_true_id = self.tokenizer.convert_tokens_to_ids("yes")
            self.token_false_id = self.tokenizer.convert_tokens_to_ids("no")
            
            prefix = '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n'
            suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
            
            self.prefix_tokens = self.tokenizer.encode(prefix, add_special_tokens=False)
            self.suffix_tokens = self.tokenizer.encode(suffix, add_special_tokens=False)
            
            logger.info(f"Token IDs: yes={self.token_true_id}, no={self.token_false_id}")
            
            self._warmup()
            self._ready = True
            logger.info("RexReranker inicializado correctamente")
            
        except Exception as e:
            logger.error(f"Error al inicializar: {e}", exc_info=True)
            self._ready = False
            raise

    def _warmup(self) -> None:
        """Warmup para compilación."""
        try:
            pairs = [("warmup query", "warmup document")] * 4
            inputs = self._process_inputs(pairs)
            for _ in range(3):
                with torch.no_grad():
                    _ = self._compute_logits(inputs)
            if self.device == "cuda":
                torch.cuda.empty_cache()
            logger.info("Warmup completado")
        except Exception as e:
            logger.warning(f"Error en warmup: {e}")

    def is_ready(self) -> bool:
        return self._ready and self.model is not None

    def _format_instruction(self, query: str, doc: str) -> str:
        """Formatea un par query-documento según el formato oficial."""
        return f"<Instruct>: {self.instruction}\n<Query>: {query}\n<Document>: {doc}"

    def _process_inputs(self, pairs: List[Tuple[str, str]]) -> dict:
        """Procesa pares (query, documento) al formato del modelo."""
        if self.tokenizer is None:
            raise RuntimeError("Tokenizer no inicializado")
        
        # Formatear pares
        formatted_pairs = [self._format_instruction(q, d) for q, d in pairs]
        
        # Tokenizar sin añadir prefix/suffix aún
        inputs = self.tokenizer(
            formatted_pairs,
            padding=False,
            truncation='longest_first',
            return_attention_mask=False,
            max_length=self.max_length - len(self.prefix_tokens) - len(self.suffix_tokens),
        )
        
        # Añadir prefix y suffix a cada secuencia
        for i in range(len(inputs['input_ids'])):
            inputs['input_ids'][i] = self.prefix_tokens + inputs['input_ids'][i] + self.suffix_tokens
        
        # Padding final
        inputs = self.tokenizer.pad(
            inputs,
            padding=True,
            return_tensors="pt",
            max_length=self.max_length,
        )
        
        # Mover a device
        return {k: v.to(self.device) for k, v in inputs.items()}

    @torch.no_grad()
    def _compute_logits(self, inputs: dict) -> List[float]:
        """Computa scores probabilísticos desde logits."""
        if self.model is None:
            raise RuntimeError("Modelo no inicializado")
        
        try:
            # Forward pass (solo último token)
            outputs = self.model(**inputs)
            batch_logits = outputs.logits[:, -1, :]  # [batch_size, vocab_size]
            
            # Extraer logits de "yes" y "no"
            true_vector = batch_logits[:, self.token_true_id]
            false_vector = batch_logits[:, self.token_false_id]
            
            # Stack y log_softmax
            batch_scores = torch.stack([false_vector, true_vector], dim=1)
            batch_scores = torch.nn.functional.log_softmax(batch_scores, dim=1)
            
            # Convertir a probabilidades
            scores = batch_scores[:, 1].exp().cpu().float().tolist()
            
            return scores
            
        except RuntimeError as e:
            if self._is_cuda_oom_error(e):
                logger.warning("CUDA OOM detectado")
                self._clear_cuda_cache()
                raise RuntimeError("CUDA out of memory") from e
            raise

    def _is_cuda_oom_error(self, error: Exception) -> bool:
        return "CUDA out of memory" in str(error) or "out of memory" in str(error).lower()

    def _clear_cuda_cache(self) -> None:
        if self.device == "cuda":
            torch.cuda.empty_cache()
            torch.cuda.synchronize()

    def _score_pairs(self, query: str, documents: List[str]) -> List[float]:
        """Calcula scores para una lista de documentos."""
        if not self.is_ready():
            raise RuntimeError("Reranker no inicializado")
        
        pairs = [(query, doc) for doc in documents]
        inputs = self._process_inputs(pairs)
        scores = self._compute_logits(inputs)
        
        return scores

    def rerank_batch(
        self,
        query: str,
        documents: List[str],
        return_sorted: bool = True,
        top_k: Optional[int] = None,
    ) -> List[Tuple[str, float, int]]:
        """Rerankea un batch de documentos."""
        if not documents:
            raise ValueError("Lista de documentos vacía")

        scores = self._score_pairs(query, documents)
        
        results = [
            (doc, float(score), idx)
            for idx, (doc, score) in enumerate(zip(documents, scores))
        ]

        if return_sorted:
            results.sort(key=lambda x: x[1], reverse=True)

        if top_k:
            results = results[:top_k]

        return results

    def rerank_large_batch(
        self,
        query: str,
        documents: List[str],
        batch_size: Optional[int] = None,
        top_k: Optional[int] = None,
    ) -> List[Tuple[str, float, int]]:
        """Maneja listas grandes con sub-batching y manejo de OOM."""
        if not documents:
            raise ValueError("Lista de documentos vacía")

        if batch_size is None:
            batch_size = self.default_batch_size

        all_results = []
        retry_count = 0
        max_retries = 3

        while retry_count <= max_retries:
            try:
                all_results = []
                for start in range(0, len(documents), batch_size):
                    end = min(start + batch_size, len(documents))
                    sub_docs = documents[start:end]
                    
                    try:
                        sub_results = self.rerank_batch(query, sub_docs, return_sorted=False)
                    except RuntimeError as e:
                        if self._is_cuda_oom_error(e):
                            if batch_size > 1:
                                batch_size = max(1, batch_size // 2)
                                logger.warning(f"Reduciendo batch_size a {batch_size}")
                                self._clear_cuda_cache()
                                sub_results = self.rerank_batch(query, sub_docs, return_sorted=False)
                            else:
                                raise
                        else:
                            raise
                    
                    # Ajustar índices globales
                    for doc, score, local_idx in sub_results:
                        all_results.append((doc, score, start + local_idx))
                    
                    # Limpieza periódica
                    if self.device == "cuda" and (start + batch_size) % (batch_size * 2) == 0:
                        self._clear_cuda_cache()

                break
                
            except RuntimeError as e:
                if self._is_cuda_oom_error(e) and retry_count < max_retries:
                    retry_count += 1
                    batch_size = max(1, batch_size // 2)
                    logger.warning(f"Reintento {retry_count} con batch_size={batch_size}")
                    self._clear_cuda_cache()
                    all_results = []
                else:
                    raise

        # Ordenar globalmente
        all_results.sort(key=lambda x: x[1], reverse=True)

        if top_k:
            all_results = all_results[:top_k]

        return all_results


# Reutiliza DynamicBatcher y RerankService sin cambios
@dataclass
class _BatchRequest:
    query: str
    documents: List[str]
    top_k: Optional[int]
    future: "asyncio.Future[Tuple[List[Tuple[str, float, int]], float]]"
    start_time: float


class DynamicBatcher:
    """Batcher para agrupar requests."""
    
    def __init__(
        self,
        reranker: OptimizedRexReranker,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 50,
        max_concurrent_requests: int = 4,
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
        self._running = True
        self._task = asyncio.create_task(self._process_queue())
        logger.info(f"DynamicBatcher iniciado (batch={self.max_batch_size}, wait={self.max_wait_ms}ms)")

    async def stop(self) -> None:
        self._running = False
        if self._task:
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
        loop = asyncio.get_event_loop()
        future = loop.create_future()
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
        try:
            while self._running:
                batch = []

                async with self._lock:
                    if self._queue:
                        first_req = self._queue.popleft()
                        batch.append(first_req)

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

                async def process_request(req: _BatchRequest):
                    async with self._semaphore:
                        try:
                            results = await asyncio.to_thread(
                                self.reranker.rerank_large_batch,
                                req.query,
                                req.documents,
                                self.max_batch_size,
                                req.top_k,
                            )
                            latency = (time.perf_counter() - req.start_time) * 1000.0
                            if not req.future.done():
                                req.future.set_result((results, latency))
                        except Exception as e:
                            logger.error(f"Error: {e}", exc_info=True)
                            if not req.future.done():
                                req.future.set_exception(e)
                        finally:
                            if self.reranker.device == "cuda":
                                self.reranker._clear_cuda_cache()

                await asyncio.gather(*[process_request(req) for req in batch])
                await asyncio.sleep(0.0)
                
        except asyncio.CancelledError:
            logger.info("DynamicBatcher detenido")


class RerankService:
    """Servicio de reranking de alto nivel."""

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-0.6B",
        max_length: int = 8192,
        instruction: Optional[str] = None,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 50,
        max_concurrent_requests: int = 4,
    ) -> None:
        self.model_name = model_name
        self._reranker = OptimizedRexReranker(
            model_name=model_name,
            max_length=max_length,
            instruction=instruction,
        )
        self._batcher = DynamicBatcher(
            reranker=self._reranker,
            max_batch_size=max_batch_size,
            max_wait_ms=max_wait_ms,
            max_concurrent_requests=max_concurrent_requests,
        )

    def initialize(self) -> None:
        self._reranker.initialize()
        self._batcher.start()

    async def shutdown(self) -> None:
        await self._batcher.stop()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def is_ready(self) -> bool:
        return self._reranker.is_ready()

    async def rerank_async(
        self,
        query: str,
        documents: List[str],
        top_k: Optional[int] = None,
    ) -> Tuple[List[Tuple[str, float, int]], float]:
        if not self.is_ready():
            raise RuntimeError("Servicio no inicializado")
        if not documents:
            raise ValueError("Lista vacía")

        results, latency = await self._batcher.add_request(query, documents, top_k)
        logger.info(f"Completado: {len(documents)} docs, latencia={latency:.2f}ms")
        return results, latency