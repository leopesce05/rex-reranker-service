import asyncio
import logging
import math
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
try:
    from vllm import LLM, SamplingParams
    _VLLM_AVAILABLE = True
except ImportError:
    LLM = None  # type: ignore[assignment]
    SamplingParams = None  # type: ignore[assignment]
    _VLLM_AVAILABLE = False

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
    RexReranker-0.6B optimizado para inferencia de alta concurrencia.
    Backend primario: vLLM en GPU.
    Fallback: HF Transformers (si vLLM no está disponible).
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
        self.backend = "vllm" if self.device == "cuda" and _VLLM_AVAILABLE else "hf"

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
        self.llm: Optional[Any] = None
        self.model: Optional[AutoModelForCausalLM] = None
        self.sampling_params: Optional[Any] = None
        self.token_true_id: Optional[int] = None
        self.token_false_id: Optional[int] = None
        self.prefix_tokens: List[int] = []
        self.suffix_tokens: List[int] = []
        self.prefix_text: str = ""
        self.suffix_text: str = ""
        self._ready: bool = False

    def initialize(self) -> None:
        """Carga modelo, tokenizer y prepara tokens especiales."""
        try:
            logger.info(f"Inicializando RexReranker: {self.model_name} (backend={self.backend})")
            
            # Cargar tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                padding_side='left',
                use_fast=True,
                trust_remote_code=True,
            )
            
            # Preparar tokens especiales
            self.token_true_id = self.tokenizer.convert_tokens_to_ids("yes")
            self.token_false_id = self.tokenizer.convert_tokens_to_ids("no")
            
            self.prefix_text = '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n'
            self.suffix_text = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
            
            self.prefix_tokens = self.tokenizer.encode(self.prefix_text, add_special_tokens=False)
            self.suffix_tokens = self.tokenizer.encode(self.suffix_text, add_special_tokens=False)
            
            logger.info(f"Token IDs: yes={self.token_true_id}, no={self.token_false_id}")

            if self.backend == "vllm":
                self._initialize_vllm()
            else:
                self._initialize_hf()
            
            self._warmup()
            self._ready = True
            logger.info("RexReranker inicializado correctamente")
            
        except Exception as e:
            logger.error(f"Error al inicializar: {e}", exc_info=True)
            self._ready = False
            raise

    def _initialize_vllm(self) -> None:
        if not _VLLM_AVAILABLE or LLM is None or SamplingParams is None:
            raise RuntimeError("vLLM no está instalado")
        gpu_memory_utilization = float(os.getenv("RERANK_VLLM_GPU_MEMORY_UTILIZATION", "0.92"))
        tensor_parallel_size = int(os.getenv("RERANK_VLLM_TP_SIZE", "1"))
        max_num_seqs = int(os.getenv("RERANK_VLLM_MAX_NUM_SEQS", str(max(32, self.default_batch_size * 2))))
        enforce_eager = os.getenv("RERANK_VLLM_ENFORCE_EAGER", "false").lower() == "true"

        logger.info(
            f"Inicializando vLLM (gpu_mem={gpu_memory_utilization}, tp={tensor_parallel_size}, max_num_seqs={max_num_seqs})"
        )
        self.llm = LLM(
            model=self.model_name,
            tokenizer=self.model_name,
            trust_remote_code=True,
            dtype="half",
            max_model_len=self.max_length,
            tensor_parallel_size=tensor_parallel_size,
            gpu_memory_utilization=gpu_memory_utilization,
            max_num_seqs=max_num_seqs,
            enforce_eager=enforce_eager,
        )
        self.sampling_params = SamplingParams(
            max_tokens=1,
            temperature=0.0,
            top_p=1.0,
            logprobs=50,
            skip_special_tokens=False,
        )

    def _initialize_hf(self) -> None:
        logger.info("vLLM no disponible; usando fallback HF CausalLM")
        attn_impl = "eager"
        if self.device == "cuda":
            try:
                __import__("flash_attn")
                attn_impl = "flash_attention_2"
                logger.info("flash-attn disponible, usando flash_attention_2")
            except ImportError:
                logger.info("flash-attn no instalado, usando attn_implementation='eager'")
        base_model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            dtype=self.torch_dtype,
            trust_remote_code=True,
            attn_implementation=attn_impl,
        )
        model = base_model.to(self.device).eval()
        if hasattr(torch, "compile") and self.device == "cuda":
            try:
                logger.info("Aplicando torch.compile...")
                model = torch.compile(model, backend="inductor", mode="default")
            except Exception as e:
                logger.warning(f"No se pudo compilar: {e}")
        self.model = model

    def _warmup(self) -> None:
        """Warmup para compilación."""
        try:
            pairs = [("warmup query", "warmup document")] * 4
            for _ in range(2):
                _ = self._score_pairs("warmup query", [doc for _, doc in pairs])
            if self.device == "cuda":
                torch.cuda.empty_cache()
            logger.info("Warmup completado")
        except Exception as e:
            logger.warning(f"Error en warmup: {e}")

    def is_ready(self) -> bool:
        if self.backend == "vllm":
            return self._ready and self.llm is not None and self.tokenizer is not None
        return self._ready and self.model is not None and self.tokenizer is not None

    def _format_instruction(self, query: str, doc: str) -> str:
        """Formatea un par query-documento según el formato oficial."""
        return f"<Instruct>: {self.instruction}\n<Query>: {query}\n<Document>: {doc}"

    def _build_prompts(self, pairs: List[Tuple[str, str]]) -> List[str]:
        """Construye prompts con truncación controlada para mantener calidad."""
        if self.tokenizer is None:
            raise RuntimeError("Tokenizer no inicializado")
        
        formatted_pairs = [self._format_instruction(q, d) for q, d in pairs]
        inputs = self.tokenizer(
            formatted_pairs,
            padding=False,
            truncation='longest_first',
            return_attention_mask=False,
            max_length=self.max_length - len(self.prefix_tokens) - len(self.suffix_tokens),
            add_special_tokens=False,
        )

        prompts: List[str] = []
        for token_ids in inputs["input_ids"]:
            full_ids = self.prefix_tokens + token_ids + self.suffix_tokens
            prompts.append(
                self.tokenizer.decode(
                    full_ids,
                    skip_special_tokens=False,
                    clean_up_tokenization_spaces=False,
                )
            )
        return prompts

    def _process_inputs_hf(self, pairs: List[Tuple[str, str]]) -> Dict[str, torch.Tensor]:
        """Procesa pares para fallback HF."""
        if self.tokenizer is None:
            raise RuntimeError("Tokenizer no inicializado")

        prompts = self._build_prompts(pairs)
        inputs = self.tokenizer(
            prompts,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
            add_special_tokens=False,
        )
        return {k: v.to(self.device) for k, v in inputs.items()}

    @torch.no_grad()
    def _compute_logits(self, inputs: dict) -> List[float]:
        """Computa scores probabilísticos desde logits (fallback HF)."""
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

    def _extract_token_logprob(self, token_logprobs: Any, token_id: int) -> Optional[float]:
        if token_logprobs is None:
            return None

        if isinstance(token_logprobs, dict):
            if token_id in token_logprobs:
                value = token_logprobs[token_id]
                return float(getattr(value, "logprob", value))
            token_id_str = str(token_id)
            if token_id_str in token_logprobs:
                value = token_logprobs[token_id_str]
                return float(getattr(value, "logprob", value))
        return None

    def _score_from_yes_no_logprobs(self, yes_logprob: float, no_logprob: float) -> float:
        m = max(yes_logprob, no_logprob)
        yes_exp = math.exp(yes_logprob - m)
        no_exp = math.exp(no_logprob - m)
        return float(yes_exp / (yes_exp + no_exp))

    def _compute_scores_vllm(self, prompts: List[str]) -> List[float]:
        if self.llm is None or self.sampling_params is None:
            raise RuntimeError("vLLM no inicializado")
        if self.token_true_id is None or self.token_false_id is None:
            raise RuntimeError("Tokens yes/no no inicializados")

        outputs = self.llm.generate(prompts, self.sampling_params, use_tqdm=False)
        scores: List[float] = []

        for output in outputs:
            first_completion = output.outputs[0]
            first_logprobs = None
            if first_completion.logprobs:
                first_logprobs = first_completion.logprobs[0]

            yes_logprob = self._extract_token_logprob(first_logprobs, self.token_true_id)
            no_logprob = self._extract_token_logprob(first_logprobs, self.token_false_id)

            if yes_logprob is not None and no_logprob is not None:
                scores.append(self._score_from_yes_no_logprobs(yes_logprob, no_logprob))
                continue

            # Fallback estable cuando "yes"/"no" no aparecen en top-k logprobs.
            generated = first_completion.text.strip().lower()
            if generated.startswith("yes"):
                scores.append(0.99)
            elif generated.startswith("no"):
                scores.append(0.01)
            else:
                scores.append(0.5)

        return scores

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
        if self.backend == "vllm":
            prompts = self._build_prompts(pairs)
            scores = self._compute_scores_vllm(prompts)
        else:
            inputs = self._process_inputs_hf(pairs)
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