# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a high-performance document reranking API service using the RexReranker model. The service is built with FastAPI and optimized for GPU inference with dynamic batching capabilities.

**Core Components:**
- `main.py`: FastAPI application entry point with startup/shutdown events
- `rerank_service_generative.py`: Core reranking logic with OptimizedRexReranker and DynamicBatcher
- `routes.py`: API endpoints (/rerank, /health, /)
- `models.py`: Pydantic request/response models

## Architecture

### Dual Backend System
The service supports two inference backends:
1. **vLLM (Primary)**: Used when GPU is available and vLLM is installed. Provides optimized inference with tensor parallelism support.
2. **HF Transformers (Fallback)**: Uses AutoModelForCausalLM with optional flash_attention_2 and torch.compile optimization.

### Reranking Pipeline
```
Request → DynamicBatcher (queues & groups requests)
    ↓
OptimizedRexReranker._score_pairs()
    ↓
Backend (vLLM or HF) → computes "yes"/"no" token logprobs
    ↓
Returns: (document, relevance_score, original_index)
```

The reranker judges document relevance by computing probability of the "yes" token versus "no" token for each query-document pair.

### Dynamic Batching
- `DynamicBatcher` groups incoming requests to maximize GPU utilization
- Configurable `max_batch_size` and `max_wait_ms` parameters
- Automatic sub-batching for OOM recovery
- Concurrent request limiting via semaphore

## Common Commands

### Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run the service locally
python main.py

# Run with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Testing
```bash
# Install test dependencies
cd tests
npm install

# Run load tests
SERVER_URL=http://localhost:8000/rerank npm test

# Run accuracy tests
SERVER_URL=http://localhost:8000/rerank node accuracy_tests.js
```

### Docker
```bash
# Build image (CUDA 12.1)
docker build -t rex-reranker .

# Run container
docker run --gpus all -p 8000:8000 rex-reranker
```

## Configuration

### Environment Variables
- `RERANK_VLLM_GPU_MEMORY_UTILIZATION`: GPU memory fraction (default: 0.92)
- `RERANK_VLLM_TP_SIZE`: Tensor parallel size for vLLM (default: 1)
- `RERANK_VLLM_MAX_NUM_SEQS`: Maximum sequences for vLLM (default: 2 * batch_size)
- `RERANK_VLLM_ENFORCE_EAGER`: Force eager mode in vLLM (default: false)

### PyTorch Optimization
The service enables these optimizations by default on CUDA:
- `cudnn.benchmark = True`
- `allow_tf32 = True` for both matmul and cudnn
- Flash Attention, memory-efficient, and math SDP enabled

### Batch Size Selection
Automatically determined based on GPU memory:
- ≥24GB: batch_size = 128
- ≥12GB: batch_size = 96
- ≥8GB: batch_size = 64
- <8GB: batch_size = 48
- CPU: batch_size = 16

## API Endpoints

### POST /rerank
Reranks documents based on a query.

Request:
```json
{
  "query": "search query",
  "documents": ["doc1", "doc2", ...],
  "top_k": 10
}
```

Response:
```json
{
  "query": "search query",
  "results": [
    {"document": "...", "score": 0.95, "index": 0},
    ...
  ],
  "latency_ms": 123.45
}
```

### GET /health
Health check endpoint returning model status and GPU availability.

### GET /
Root endpoint with API information and available endpoints.

## Testing

### Load Tests (tests/load_test.js)
Tests concurrent request handling with configurable:
- Number of concurrent requests
- Documents per request
- Delay between requests

### Accuracy Tests (tests/accuracy_tests.js)
Evaluates reranking quality with predefined test cases across categories (clothing, electronics, etc.) and measures:
- Top-1, Top-3, Top-5 accuracy
- Overall accuracy across all test cases

## Model Information

- Default model: `thebajajra/RexReranker-0.6B`
- Alternative models supported: `thebajajra/RexReranker-large`
- Context length: 8192 tokens (configurable)
- Instruction: "Given a web search query, retrieve relevant passages that answer the query"

The model uses a specific prompt format with system message and yes/no judgment task.

## GPU Memory Management

The service implements automatic OOM recovery:
1. Detects CUDA out of memory errors
2. Reduces batch_size by half automatically
3. Retries up to 3 times
4. Periodic cache clearing during large batch processing

## Important Notes

- Always check GPU availability and batch size in logs after startup
- Model loading takes time - use /health endpoint to check readiness
- The service uses FP16 on GPU, FP32 on CPU
- Models are cached locally in `/app/models` (in Docker) or `TORCH_HOME`
- Use torch.compile (inductor backend) for HF fallback on CUDA
