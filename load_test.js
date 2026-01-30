const axios = require('axios');

// URL del servidor
const SERVER_URL = 'https://56cuk3f8unen66-8000.proxy.runpod.net/rerank';

// Lista grande de documentos de ecommerce (100+ documentos)
const DOCUMENTS_POOL = [
  "Camiseta básica azul marino talla M - Algodón 100% - Precio $25",
  "Pantalón jean azul oscuro talla 32 - Corte slim - Precio $45",
  "Camiseta polo blanca talla L - Manga corta - Precio $30",
  "Zapatillas deportivas negras talla 42 - Running - Precio $80",
  "Camiseta manga larga azul claro talla M - Algodón orgánico - Precio $28",
  "Short deportivo negro talla M - Secado rápido - Precio $20",
  "Camiseta básica roja talla S - Algodón 100% - Precio $25",
  "Pantalón chino beige talla 34 - Corte regular - Precio $50",
  "Camiseta polo azul marino talla M - Manga corta - Precio $30",
  "Zapatillas casuales blancas talla 41 - Cuero sintético - Precio $65",
  "Camiseta básica negra talla L - Algodón 100% - Precio $25",
  "Pantalón cargo verde talla 36 - Múltiples bolsillos - Precio $55",
  "Camiseta manga larga gris talla M - Algodón 100% - Precio $28",
  "Zapatillas running azules talla 43 - Amortiguación - Precio $90",
  "Camiseta polo verde talla S - Manga corta - Precio $30",
  "Pantalón jean azul claro talla 30 - Corte recto - Precio $45",
  "Camiseta básica blanca talla M - Algodón 100% - Precio $25",
  "Short de baño azul talla M - Secado rápido - Precio $22",
  "Camiseta manga larga negra talla L - Algodón 100% - Precio $28",
  "Zapatillas deportivas rojas talla 40 - Running - Precio $80",
  "Camiseta polo azul cielo talla M - Manga corta - Precio $30",
  "Pantalón chino azul marino talla 32 - Corte slim - Precio $50",
  "Camiseta básica azul marino talla S - Algodón 100% - Precio $25",
  "Zapatillas casuales negras talla 42 - Cuero sintético - Precio $65",
  "Camiseta manga larga azul oscuro talla M - Algodón orgánico - Precio $28",
  "Pantalón jean negro talla 34 - Corte slim - Precio $45",
  "Camiseta polo blanca talla M - Manga corta - Precio $30",
  "Short deportivo azul talla L - Secado rápido - Precio $20",
  "Camiseta básica gris talla M - Algodón 100% - Precio $25",
  "Zapatillas running negras talla 44 - Amortiguación - Precio $90",
  "Camiseta polo azul marino talla L - Manga corta - Precio $30",
  "Pantalón cargo negro talla 38 - Múltiples bolsillos - Precio $55",
  "Camiseta manga larga azul claro talla S - Algodón 100% - Precio $28",
  "Zapatillas deportivas blancas talla 41 - Running - Precio $80",
  "Camiseta básica azul cielo talla M - Algodón 100% - Precio $25",
  "Pantalón jean azul oscuro talla 36 - Corte recto - Precio $45",
  "Camiseta polo verde talla M - Manga corta - Precio $30",
  "Short de baño azul marino talla L - Secado rápido - Precio $22",
  "Camiseta manga larga azul marino talla M - Algodón orgánico - Precio $28",
  "Zapatillas casuales azules talla 43 - Cuero sintético - Precio $65",
  "Camiseta básica azul claro talla M - Algodón 100% - Precio $25",
  "Pantalón chino azul talla 30 - Corte regular - Precio $50",
  "Camiseta polo azul oscuro talla S - Manga corta - Precio $30",
  "Zapatillas running azules talla 42 - Amortiguación - Precio $90",
  "Camiseta básica azul marino talla L - Algodón 100% - Precio $25",
  "Pantalón jean azul claro talla 32 - Corte slim - Precio $45",
  "Camiseta manga larga azul cielo talla M - Algodón 100% - Precio $28",
  "Short deportivo azul oscuro talla M - Secado rápido - Precio $20",
  "Zapatillas deportivas azules talla 40 - Running - Precio $80",
  "Camiseta polo azul marino talla M - Manga corta - Precio $30",
  "Pantalón cargo verde oscuro talla 40 - Múltiples bolsillos - Precio $55",
  "Camiseta básica verde talla M - Algodón 100% - Precio $25",
  "Zapatillas casuales verdes talla 39 - Cuero sintético - Precio $65",
  "Camiseta manga larga verde claro talla L - Algodón orgánico - Precio $28",
  "Pantalón jean verde talla 38 - Corte recto - Precio $45",
  "Camiseta polo verde oscuro talla S - Manga corta - Precio $30",
  "Short de baño verde talla M - Secado rápido - Precio $22",
  "Zapatillas running verdes talla 41 - Amortiguación - Precio $90",
  "Camiseta básica roja talla M - Algodón 100% - Precio $25",
  "Pantalón chino rojo talla 34 - Corte regular - Precio $50",
  "Camiseta polo roja talla L - Manga corta - Precio $30",
  "Zapatillas deportivas rojas talla 42 - Running - Precio $80",
  "Camiseta manga larga roja oscura talla M - Algodón 100% - Precio $28",
  "Pantalón jean rojo talla 36 - Corte slim - Precio $45",
  "Short deportivo rojo talla L - Secado rápido - Precio $20",
  "Zapatillas casuales rojas talla 40 - Cuero sintético - Precio $65",
  "Camiseta básica amarilla talla M - Algodón 100% - Precio $25",
  "Pantalón cargo amarillo talla 32 - Múltiples bolsillos - Precio $55",
  "Camiseta polo amarilla talla S - Manga corta - Precio $30",
  "Zapatillas running amarillas talla 43 - Amortiguación - Precio $90",
  "Camiseta manga larga amarilla talla M - Algodón orgánico - Precio $28",
  "Pantalón jean amarillo talla 30 - Corte recto - Precio $45",
  "Short de baño amarillo talla M - Secado rápido - Precio $22",
  "Zapatillas deportivas amarillas talla 41 - Running - Precio $80",
  "Camiseta básica naranja talla M - Algodón 100% - Precio $25",
  "Pantalón chino naranja talla 34 - Corte regular - Precio $50",
  "Camiseta polo naranja talla L - Manga corta - Precio $30",
  "Zapatillas casuales naranjas talla 42 - Cuero sintético - Precio $65",
  "Camiseta manga larga naranja talla M - Algodón 100% - Precio $28",
  "Pantalón jean naranja talla 36 - Corte slim - Precio $45",
  "Short deportivo naranja talla L - Secado rápido - Precio $20",
  "Zapatillas running naranjas talla 40 - Amortiguación - Precio $90",
  "Camiseta básica morada talla M - Algodón 100% - Precio $25",
  "Pantalón cargo morado talla 32 - Múltiples bolsillos - Precio $55",
  "Camiseta polo morada talla S - Manga corta - Precio $30",
  "Zapatillas deportivas moradas talla 43 - Running - Precio $80",
  "Camiseta manga larga morada talla M - Algodón orgánico - Precio $28",
  "Pantalón jean morado talla 30 - Corte recto - Precio $45",
  "Short de baño morado talla M - Secado rápido - Precio $22",
  "Zapatillas casuales moradas talla 41 - Cuero sintético - Precio $65",
  "Camiseta básica rosa talla M - Algodón 100% - Precio $25",
  "Pantalón chino rosa talla 34 - Corte regular - Precio $50",
  "Camiseta polo rosa talla L - Manga corta - Precio $30",
  "Zapatillas running rosas talla 42 - Amortiguación - Precio $90",
  "Camiseta manga larga rosa talla M - Algodón 100% - Precio $28",
  "Pantalón jean rosa talla 36 - Corte slim - Precio $45",
  "Short deportivo rosa talla L - Secado rápido - Precio $20",
  "Zapatillas deportivas rosas talla 40 - Running - Precio $80",
  "Camiseta básica turquesa talla M - Algodón 100% - Precio $25",
  "Pantalón cargo turquesa talla 32 - Múltiples bolsillos - Precio $55",
  "Camiseta polo turquesa talla S - Manga corta - Precio $30",
  "Zapatillas casuales turquesas talla 43 - Cuero sintético - Precio $65",
  "Camiseta manga larga turquesa talla M - Algodón orgánico - Precio $28",
  "Pantalón jean turquesa talla 30 - Corte recto - Precio $45",
  "Short de baño turquesa talla M - Secado rápido - Precio $22",
  "Zapatillas running turquesas talla 41 - Amortiguación - Precio $90"
];

// Queries variados
const QUERIES = [
  "camiseta azul talla M",
  "pantalón jean azul",
  "zapatillas running",
  "short deportivo",
  "camiseta polo",
  "pantalón chino",
  "zapatillas casuales",
  "camiseta manga larga",
  "pantalón cargo",
  "zapatillas negras"
];

// Función para obtener documentos aleatorios
function getRandomDocuments(count) {
  const selected = [];
  const pool = [...DOCUMENTS_POOL];
  
  for (let i = 0; i < count && pool.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(randomIndex, 1)[0]);
  }
  
  // Si necesitamos más documentos, repetimos algunos
  while (selected.length < count) {
    selected.push(DOCUMENTS_POOL[Math.floor(Math.random() * DOCUMENTS_POOL.length)]);
  }
  
  return selected.slice(0, count);
}

// Función para hacer un request
async function makeRequest(requestId) {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const documents = getRandomDocuments(100); // 100 documentos por request
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(SERVER_URL, {
      query: query,
      documents: documents,
      top_k: 10
    }, {
      timeout: 120000 // 2 minutos timeout
    });
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const latencyMs = response.data.latency_ms || totalTime;
    
    return {
      requestId,
      success: true,
      totalTime,
      latencyMs: latencyMs,
      statusCode: response.status
    };
  } catch (error) {
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    return {
      requestId,
      success: false,
      totalTime,
      latencyMs: null,
      error: error.message,
      statusCode: error.response?.status || 'N/A'
    };
  }
}

// Función principal de carga
async function runLoadTest() {
  const NUM_REQUESTS = 100;
  const TARGET_TIME_MS = 1000; // 1 segundo
  
  console.log('='.repeat(60));
  console.log('LOAD TEST - Reranking Server');
  console.log('='.repeat(60));
  console.log(`Servidor: ${SERVER_URL}`);
  console.log(`Requests: ${NUM_REQUESTS}`);
  console.log(`Tiempo objetivo: ${TARGET_TIME_MS}ms (${NUM_REQUESTS / (TARGET_TIME_MS / 1000)} req/s)`);
  console.log('='.repeat(60));
  console.log('\nIniciando test...\n');
  
  const startTime = Date.now();
  const requests = [];
  
  // Crear todos los requests casi simultáneamente
  for (let i = 0; i < NUM_REQUESTS; i++) {
    requests.push(makeRequest(i + 1));
  }
  
  // Esperar a que todos terminen
  const results = await Promise.all(requests);
  const endTime = Date.now();
  const totalTestTime = endTime - startTime;
  
  // Calcular estadísticas
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const latencies = successful.map(r => r.latencyMs).filter(l => l !== null);
  
  // Ordenar latencias para percentiles
  latencies.sort((a, b) => a - b);
  
  const avgLatency = latencies.length > 0 
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
    : 0;
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
  
  // Mostrar resultados
  console.log('='.repeat(60));
  console.log('RESULTADOS');
  console.log('='.repeat(60));
  console.log(`Tiempo total del test: ${totalTestTime}ms (${(totalTestTime / 1000).toFixed(2)}s)`);
  console.log(`Throughput real: ${(NUM_REQUESTS / (totalTestTime / 1000)).toFixed(2)} req/s`);
  console.log(`\nRequests exitosos: ${successful.length}/${NUM_REQUESTS} (${((successful.length / NUM_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`Requests fallidos: ${failed.length}/${NUM_REQUESTS} (${((failed.length / NUM_REQUESTS) * 100).toFixed(1)}%)`);
  
  if (latencies.length > 0) {
    console.log('\n--- Estadísticas de Latencia (ms) ---');
    console.log(`Promedio: ${avgLatency.toFixed(2)}ms`);
    console.log(`Mínimo: ${minLatency.toFixed(2)}ms`);
    console.log(`Máximo: ${maxLatency.toFixed(2)}ms`);
    console.log(`P50 (mediana): ${p50.toFixed(2)}ms`);
    console.log(`P95: ${p95.toFixed(2)}ms`);
    console.log(`P99: ${p99.toFixed(2)}ms`);
  }
  
  if (failed.length > 0) {
    console.log('\n--- Errores ---');
    const errorCounts = {};
    failed.forEach(f => {
      const key = f.error || `Status ${f.statusCode}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });
    Object.entries(errorCounts).forEach(([error, count]) => {
      console.log(`  ${error}: ${count}`);
    });
  }
  
  console.log('='.repeat(60));
  
  // Mostrar algunos ejemplos de latencias
  if (latencies.length > 0) {
    console.log('\nPrimeras 10 latencias (ms):');
    latencies.slice(0, 10).forEach((lat, idx) => {
      console.log(`  Request ${idx + 1}: ${lat.toFixed(2)}ms`);
    });
  }
}

// Ejecutar el test
runLoadTest().catch(error => {
  console.error('Error ejecutando load test:', error);
  process.exit(1);
});

