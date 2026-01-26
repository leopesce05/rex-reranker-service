import logging
import math
from typing import List, Dict, Optional, Tuple

import torch
from transformers import AutoTokenizer
from vllm import LLM, SamplingParams
from vllm.distributed.parallel_state import destroy_model_parallel
from vllm.inputs.data import TokensPrompt

logger = logging.getLogger(__name__)


class RerankService:
    """Servicio para manejar el reranking de documentos usando vLLM."""
    
    def __init__(
        self,
        model_name: str = 'thebajajra/RexReranker-0.6B',
        max_length: int = 8192,
        gpu_memory_utilization: float = 0.8,
        default_instruction: str = 'Given a web search query, retrieve relevant passages that answer the query'
    ):
        self.model_name = model_name
        self.max_length = max_length
        self.gpu_memory_utilization = gpu_memory_utilization
        self.default_instruction = default_instruction
        
        self.model: Optional[LLM] = None
        self.tokenizer: Optional[AutoTokenizer] = None
        self.sampling_params: Optional[SamplingParams] = None
        self.true_token: Optional[int] = None
        self.false_token: Optional[int] = None
        self.suffix_tokens: List[int] = []
    
    def initialize(self):
        """Inicializa el modelo vLLM y el tokenizer."""
        try:
            logger.info("Inicializando tokenizer...")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.tokenizer.padding_side = "left"
            self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Configurar tokens y parámetros
            suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
            self.suffix_tokens = self.tokenizer.encode(suffix, add_special_tokens=False)
            self.true_token = self.tokenizer("yes", add_special_tokens=False).input_ids[0]
            self.false_token = self.tokenizer("no", add_special_tokens=False).input_ids[0]
            
            self.sampling_params = SamplingParams(
                temperature=0,
                max_tokens=1,
                logprobs=20,
                allowed_token_ids=[self.true_token, self.false_token],
            )
            
            logger.info("Inicializando modelo vLLM...")
            number_of_gpu = torch.cuda.device_count()
            logger.info(f"GPUs detectadas: {number_of_gpu}")
            
            self.model = LLM(
                model=self.model_name,
                tensor_parallel_size=number_of_gpu,
                max_model_len=10000,
                enable_prefix_caching=True,
                gpu_memory_utilization=self.gpu_memory_utilization
            )
            
            logger.info("Modelo vLLM inicializado exitosamente")
            
        except Exception as e:
            logger.error(f"Error al inicializar el modelo: {str(e)}")
            raise
    
    def cleanup(self):
        """Limpia los recursos del modelo."""
        try:
            if self.model is not None:
                logger.info("Limpiando recursos del modelo...")
                destroy_model_parallel()
                del self.model
                self.model = None
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                logger.info("Recursos limpiados exitosamente")
        except Exception as e:
            logger.error(f"Error al limpiar recursos: {str(e)}")
    
    def is_ready(self) -> bool:
        """Verifica si el servicio está listo para procesar requests."""
        return self.model is not None and self.tokenizer is not None
    
    def format_instruction(self, instruction: str, query: str, doc: str) -> List[Dict[str, str]]:
        """Formatea la instrucción en el formato de chat esperado por el modelo."""
        text = [
            {
                "role": "system",
                "content": "Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be \"yes\" or \"no\"."
            },
            {
                "role": "user",
                "content": f"<Instruct>: {instruction}\n\n<Query>: {query}\n\n<Document>: {doc}"
            }
        ]
        return text
    
    def process_inputs(
        self,
        pairs: List[Tuple[str, str]],
        instruction: str
    ) -> List[TokensPrompt]:
        """Procesa los pares query-documento y los convierte en TokensPrompt."""
        messages = [self.format_instruction(instruction, query, doc) for query, doc in pairs]
        messages = self.tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=False, enable_thinking=False
        )
        max_token_length = self.max_length - len(self.suffix_tokens)
        messages = [ele[:max_token_length] + self.suffix_tokens for ele in messages]
        messages = [TokensPrompt(prompt_token_ids=ele) for ele in messages]
        return messages
    
    def compute_logits(self, messages: List[TokensPrompt]) -> List[float]:
        """Calcula los scores de relevancia usando los logits de los tokens yes/no."""
        if not self.is_ready():
            raise RuntimeError("El servicio no está inicializado")
        
        outputs = self.model.generate(messages, self.sampling_params, use_tqdm=False)
        scores = []
        
        for i in range(len(outputs)):
            final_logits = outputs[i].outputs[0].logprobs[-1]
            
            if self.true_token not in final_logits:
                true_logit = -10
            else:
                true_logit = final_logits[self.true_token].logprob
            
            if self.false_token not in final_logits:
                false_logit = -10
            else:
                false_logit = final_logits[self.false_token].logprob
            
            true_score = math.exp(true_logit)
            false_score = math.exp(false_logit)
            score = true_score / (true_score + false_score)
            scores.append(score)
        
        return scores
    
    def rerank(
        self,
        query: str,
        documents: List[str],
        instruction: Optional[str] = None,
        top_k: Optional[int] = None
    ) -> Tuple[List[Tuple[str, float, int]], str]:
        """
        Rerankea documentos basado en una query.
        
        Args:
            query: La query de búsqueda
            documents: Lista de documentos a rerankear
            instruction: Instrucción personalizada (opcional)
            top_k: Número de resultados a retornar (opcional)
        
        Returns:
            Tupla con (resultados, instruction_usada)
            resultados: Lista de tuplas (documento, score, índice_original)
        """
        if not self.is_ready():
            raise RuntimeError("El servicio no está inicializado")
        
        if not documents:
            raise ValueError("La lista de documentos no puede estar vacía")
        
        # Usar instruction personalizada o la por defecto
        instruction_used = instruction if instruction else self.default_instruction
        
        # Crear pares query-documento
        pairs = [(query, doc) for doc in documents]
        
        # Procesar inputs
        inputs = self.process_inputs(pairs, instruction_used)
        
        # Calcular scores
        logger.info(f"Procesando {len(pairs)} pares query-documento")
        scores = self.compute_logits(inputs)
        
        # Crear resultados con scores e índices
        results = [
            (doc, score, idx)
            for idx, (doc, score) in enumerate(zip(documents, scores))
        ]
        
        # Ordenar por score descendente
        results.sort(key=lambda x: x[1], reverse=True)
        
        # Aplicar top_k si se especifica
        if top_k is not None and top_k > 0:
            results = results[:top_k]
        
        logger.info(f"Reranking completado. Top score: {results[0][1] if results else 0:.4f}")
        
        return results, instruction_used

