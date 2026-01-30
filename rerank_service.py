import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, List, Optional, Tuple

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = logging.getLogger(__name__)

# Configurar PyTorch para mejor manejo de memoria (evitar fragmentación)
# expandable_segments permite que PyTorch libere memoria más eficientemente
if "PYTORCH_ALLOC_CONF" not in os.environ:
    os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
    logger.info("Configurado PYTORCH_ALLOC_CONF=expandable_segments:True para mejor manejo de memoria")

# Optimizaciones CUDA para GPUs NVIDIA en producción
if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True

# Formato oficial RexReranker-0.6B: CausalLM con formato de instrucción
DEFAULT_INSTRUCTION = 'Given a web search query, retrieve relevant passages that answer the query'
PREFIX = "<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be \"yes\" or \"no\".<|im_end|>\n<|im_start|>user\n"
SUFFIX = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"


class OptimizedRexReranker:
    """
    RexReranker-0.6B optimizado para producción con GPUs NVIDIA.

    - AutoModelForCausalLM con formato oficial de instrucciones
    - FP16 en GPU, torch.compile, batching eficiente
    - Usa tokens "yes"/"no" para calcular scores de relevancia
    """

    def __init__(
        self,
        model_name: str = "thebajajra/RexReranker-0.6B",
        max_length: Optional[int] = None,
        instruction: Optional[str] = None,
    ) -> None:
        self.model_name = model_name
        self.max_length = max_length or 8192  # Default del modelo
        self.instruction = instruction or DEFAULT_INSTRUCTION

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda" else torch.float32
        
        # Tokens especiales para el cálculo de scores
        self.token_true_id: Optional[int] = None
        self.token_false_id: Optional[int] = None
        self.prefix_tokens: Optional[List[int]] = None
        self.suffix_tokens: Optional[List[int]] = None

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
        self.model: Optional[AutoModelForCausalLM] = None
        self._ready: bool = False

    def initialize(self) -> None:
        """Carga modelo y tokenizer, aplica optimizaciones y warmup."""
        try:
            # Validar versión de transformers
            import transformers
            logger.info(f"Versión de transformers: {transformers.__version__}")
            
            logger.info(
                f"Inicializando OptimizedRexReranker con modelo '{self.model_name}' en dispositivo '{self.device}'"
            )
            # Tokenizer con padding_side='left' para CausalLM
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                use_fast=True,
                trust_remote_code=True,
                padding_side='left'
            )
            
            # Configurar padding token
            if self.tokenizer.pad_token is None:
                if self.tokenizer.eos_token is not None:
                    self.tokenizer.pad_token = self.tokenizer.eos_token
                elif self.tokenizer.unk_token is not None:
                    self.tokenizer.pad_token = self.tokenizer.unk_token
                else:
                    self.tokenizer.add_special_tokens({"pad_token": "[PAD]"})
            
            if self.tokenizer.pad_token_id is None:
                self.tokenizer.pad_token_id = (
                    self.tokenizer.eos_token_id or self.tokenizer.unk_token_id
                )

            # Intentar cargar modelo CausalLM (igual que el script original del usuario)
            try:
                logger.info("Intentando cargar modelo con AutoModelForCausalLM...")
                base_model = AutoModelForCausalLM.from_pretrained(
                    self.model_name,
                    torch_dtype=self.torch_dtype,
                    device_map=None,
                    trust_remote_code=True,
                )
                logger.info("Modelo cargado exitosamente con AutoModelForCausalLM")
            except Exception as e:
                logger.warning(f"Error al cargar con AutoModelForCausalLM: {e}")
                logger.info("Intentando fallback con AutoModel...")
                # Fallback a AutoModel si AutoModelForCausalLM falla
                from transformers import AutoModel
                base_model = AutoModel.from_pretrained(
                    self.model_name,
                    torch_dtype=self.torch_dtype,
                    device_map=None,
                    trust_remote_code=True,
                )
                logger.info("Modelo cargado exitosamente con AutoModel (fallback)")
            
            # Si agregamos pad_token nuevo, redimensionar embeddings
            if self.tokenizer.pad_token == "[PAD]":
                base_model.resize_token_embeddings(len(self.tokenizer))

            model = base_model.to(self.device)

            # Configurar tokens especiales para scores
            self.token_false_id = self.tokenizer.convert_tokens_to_ids("no")
            self.token_true_id = self.tokenizer.convert_tokens_to_ids("yes")
            
            if self.token_false_id is None or self.token_true_id is None:
                raise ValueError("No se pudieron encontrar los tokens 'yes' y 'no' en el tokenizer")
            
            # Pre-calcular tokens del prefix y suffix
            self.prefix_tokens = self.tokenizer.encode(PREFIX, add_special_tokens=False)
            self.suffix_tokens = self.tokenizer.encode(SUFFIX, add_special_tokens=False)
            
            logger.info(f"Tokens configurados - true_id: {self.token_true_id}, false_id: {self.token_false_id}")
            logger.info(f"max_length: {self.max_length}")

            if hasattr(torch, "compile"):
                try:
                    # Usar 'default' para evitar CUDA graphs que causan problemas con threading
                    # 'max-autotune' y 'reduce-overhead' usan CUDA graphs que no funcionan bien
                    # cuando se ejecuta desde diferentes threads
                    logger.info("Aplicando torch.compile(mode='default')...")
                    model = torch.compile(model, mode="default")  # type: ignore[attr-defined]
                except Exception as compile_err:
                    logger.warning(f"No se pudo compilar con torch.compile: {compile_err}")

            self.model = model.eval()
            self._warmup()
            self._ready = True
            logger.info("OptimizedRexReranker inicializado y listo para uso")
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
            dummy_docs = ["warmup document"] * min(8, self.default_batch_size)
            pairs = [
                self._format_instruction(self.instruction, dummy_query, doc)
                for doc in dummy_docs
            ]
            inputs = self._process_inputs(pairs)
            for _ in range(3):
                with torch.inference_mode():
                    _ = self._compute_logits(inputs)
            if self.device == "cuda":
                torch.cuda.empty_cache()
        except Exception as e:
            logger.warning(f"Error durante warmup (no crítico): {e}", exc_info=True)

    def is_ready(self) -> bool:
        return self._ready and self.model is not None and self.tokenizer is not None

    def _format_instruction(self, instruction: str, query: str, doc: str) -> str:
        """Formatea el input según el formato oficial de RexReranker-0.6B."""
        return f"<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {doc}"
    
    def _process_inputs(self, pairs: List[str]) -> dict:
        """Procesa los pares query-documento según el formato oficial."""
        if self.tokenizer is None or self.prefix_tokens is None or self.suffix_tokens is None:
            raise RuntimeError("Tokenizer no inicializado")
        
        # Tokenizar sin padding primero
        inputs = self.tokenizer(
            pairs,
            padding=False,
            truncation='longest_first',
            return_attention_mask=False,
            max_length=self.max_length - len(self.prefix_tokens) - len(self.suffix_tokens),
            add_special_tokens=False
        )
        
        # Agregar prefix y suffix tokens ANTES de convertir a tensors
        # Crear nueva lista para evitar modificaciones in-place
        processed_input_ids = []
        for ele in inputs['input_ids']:
            processed_input_ids.append(self.prefix_tokens + ele + self.suffix_tokens)
        
        inputs['input_ids'] = processed_input_ids
        
        # Padding final
        inputs = self.tokenizer.pad(
            inputs,
            padding=True,
            return_tensors="pt",
            max_length=self.max_length
        )
        
        # Mover a dispositivo (clonar antes de mover para evitar problemas con CUDA graphs)
        device_inputs = {}
        for key in inputs:
            # Clonar el tensor antes de moverlo para evitar operaciones in-place
            device_inputs[key] = inputs[key].clone().to(self.device)
        
        return device_inputs
    
    def _is_cuda_oom_error(self, error: Exception) -> bool:
        """Detecta si el error es CUDA out of memory."""
        error_str = str(error)
        return "CUDA out of memory" in error_str or "out of memory" in error_str.lower()
    
    def _clear_cuda_cache(self) -> None:
        """Limpia la caché de CUDA y sincroniza."""
        if self.device == "cuda":
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            logger.info("Memoria CUDA limpiada")
    
    @torch.inference_mode()
    def _compute_logits(self, inputs: dict) -> List[float]:
        """Calcula scores usando los tokens 'yes' y 'no' según el formato oficial."""
        if self.model is None or self.token_true_id is None or self.token_false_id is None:
            raise RuntimeError("Modelo no inicializado")
        
        try:
            outputs = self.model(**inputs)
            # Tomar el logit del último token
            batch_scores = outputs.logits[:, -1, :]
            
            # Extraer logits de "yes" y "no"
            true_vector = batch_scores[:, self.token_true_id]
            false_vector = batch_scores[:, self.token_false_id]
            
            # Stack y aplicar log_softmax
            batch_scores = torch.stack([false_vector, true_vector], dim=1)
            batch_scores = torch.nn.functional.log_softmax(batch_scores, dim=1)
            
            # Exp para obtener probabilidades (score de relevancia)
            scores = batch_scores[:, 1].exp().cpu().tolist()
            
            return scores
        except RuntimeError as e:
            if self._is_cuda_oom_error(e):
                logger.warning("CUDA out of memory detectado en _compute_logits, limpiando caché...")
                self._clear_cuda_cache()
                raise RuntimeError("CUDA out of memory. Intenta con menos documentos o un batch_size menor.") from e
            raise
    
    def _score_pairs(self, query: str, documents: List[str]) -> List[float]:
        """Devuelve un score por documento usando el formato oficial de RexReranker-0.6B."""
        if not self.is_ready():
            raise RuntimeError("El reranker no está inicializado")
        assert self.model is not None
        assert self.tokenizer is not None

        # Formatear pares según el formato oficial
        pairs = [
            self._format_instruction(self.instruction, query, doc)
            for doc in documents
        ]
        
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

        El top_k se aplica sobre el conjunto completo de resultados.
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
                                    f"CUDA OOM detectado. Reduciendo batch_size de {old_batch_size} a {batch_size}"
                                )
                                self._clear_cuda_cache()
                                # Reintentar este sub-batch con batch_size reducido
                                sub_results = self.rerank_batch(
                                    query, sub_docs, return_sorted=False
                                )
                            else:
                                self._clear_cuda_cache()
                                raise RuntimeError(
                                    "CUDA out of memory incluso con batch_size=1. "
                                    "Intenta con menos documentos o reinicia el servicio."
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
                        f"CUDA OOM en rerank_large_batch. Reintento {retry_count}/{max_retries} "
                        f"con batch_size reducido de {old_batch_size} a {batch_size}"
                    )
                    self._clear_cuda_cache()
                    all_results = []  # Resetear resultados
                else:
                    self._clear_cuda_cache()
                    raise

        # Orden global
        all_results.sort(key=lambda x: x[1], reverse=True)

        if top_k is not None and top_k > 0:
            all_results = all_results[:top_k]

        # Restaurar batch_size original para el próximo request
        if batch_size != original_batch_size:
            logger.info(f"Batch_size temporalmente reducido a {batch_size}, restaurando a {original_batch_size}")

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
        max_wait_ms: int = 50,  # Aumentado de 5ms a 50ms para mejor batching
        max_concurrent_requests: int = 4,  # Límite de requests simultáneos en GPU
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

                # Procesar requests del batch en paralelo con límite de concurrencia
                # Con modo 'default' de torch.compile (sin CUDA graphs) podemos usar threads
                # pero limitamos la concurrencia para no saturar la GPU
                async def process_single_request(req: _BatchRequest) -> None:
                    """Procesa un request individual en un thread separado."""
                    async with self._semaphore:  # Limitar concurrencia
                        try:
                            # Ejecutar en thread separado - ahora es seguro sin CUDA graphs
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
                            # Detectar y manejar errores de memoria CUDA
                            if self.reranker._is_cuda_oom_error(e):
                                logger.error(
                                    f"CUDA out of memory procesando request {req.query[:50]}... "
                                    f"({len(req.documents)} documentos). Limpiando memoria..."
                                )
                                self.reranker._clear_cuda_cache()
                                # Reintentar una vez con batch_size reducido
                                try:
                                    reduced_batch = max(1, self.max_batch_size // 2)
                                    logger.info(f"Reintentando con batch_size reducido a {reduced_batch}")
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
                                    logger.error(
                                        f"Error en reintento después de CUDA OOM: {retry_e}",
                                        exc_info=True,
                                    )
                                    if not req.future.done():
                                        req.future.set_exception(retry_e)
                            else:
                                logger.error(
                                    f"Error procesando request en DynamicBatcher: {e}",
                                    exc_info=True,
                                )
                                if not req.future.done():
                                    req.future.set_exception(e)
                        except Exception as e:
                            logger.error(
                                f"Error procesando request en DynamicBatcher: {e}",
                                exc_info=True,
                            )
                            if not req.future.done():
                                req.future.set_exception(e)
                        finally:
                            # Limpiar memoria después de cada request para evitar acumulación
                            if self.reranker.device == "cuda":
                                # Pequeña limpieza periódica
                                self.reranker._clear_cuda_cache()

                # Procesar todos los requests del batch en paralelo (con límite de concurrencia)
                await asyncio.gather(*[process_single_request(req) for req in batch])

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
        max_length: Optional[int] = None,
        max_batch_size: Optional[int] = None,
        max_wait_ms: int = 50,  # Aumentado de 5ms a 50ms para mejor batching
        max_concurrent_requests: int = 4,  # Límite de requests simultáneos en GPU
        instruction: Optional[str] = None,
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

