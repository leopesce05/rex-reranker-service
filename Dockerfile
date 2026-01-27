# Dockerfile optimizado para producción con GPU support
FROM nvidia/cuda:12.1.0-devel-ubuntu22.04

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    git \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Crear symlink para python
RUN ln -s /usr/bin/python3.10 /usr/bin/python

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copiar requirements primero para aprovechar cache de Docker
COPY requirements.txt .

# Instalar PyTorch con soporte CUDA 12.1 y luego el resto de dependencias
RUN pip install --no-cache-dir torch==2.1.0+cu121 --index-url https://download.pytorch.org/whl/cu121 && \
    pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY main.py models.py rerank_service.py routes.py .

# Variables de entorno para optimización
ENV PYTHONUNBUFFERED=1 \
    TORCH_HOME=/app/models \
    CUDA_VISIBLE_DEVICES=0 \
    PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512 \
    TORCH_COMPILE_BACKEND=inductor

# Crear directorio para modelos (cache)
RUN mkdir -p /app/models

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Exponer puerto
EXPOSE 8000

# Comando de inicio
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

