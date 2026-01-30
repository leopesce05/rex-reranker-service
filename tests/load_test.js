const axios = require('axios');

// URL del servidor
const SERVER_URL = process.env.SERVER_URL || 'https://8d7abe464a2l51-8000.proxy.runpod.net/rerank';

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
  
  while (selected.length < count) {
    selected.push(DOCUMENTS_POOL[Math.floor(Math.random() * DOCUMENTS_POOL.length)]);
  }
  
  return selected.slice(0, count);
}

// Función para hacer un request
async function makeRequest(requestId, numDocuments = 100) {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const documents = getRandomDocuments(numDocuments);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(SERVER_URL, {
      query: query,
      documents: documents,
      top_k: 10
    }, {
      timeout: 120000
    });
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const latencyMs = response.data.latency_ms || totalTime;
    
    return {
      requestId,
      success: true,
      totalTime,
      latencyMs: latencyMs,
      statusCode: response.status,
      startTime,
      endTime
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
      statusCode: error.response?.status || 'N/A',
      startTime,
      endTime
    };
  }
}

// Función para calcular estadísticas
function calculateStats(times) {
  if (times.length === 0) return null;
  
  times.sort((a, b) => a - b);
  
  return {
    count: times.length,
    min: times[0],
    max: times[times.length - 1],
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p75: times[Math.floor(times.length * 0.75)],
    p90: times[Math.floor(times.length * 0.90)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)]
  };
}

// Función para mostrar gráfico ASCII simple
function showDistribution(times, title, maxBars = 50) {
  if (times.length === 0) return;
  
  times.sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const range = max - min || 1;
  const buckets = 20;
  const bucketSize = range / buckets;
  
  const histogram = new Array(buckets).fill(0);
  times.forEach(time => {
    const bucket = Math.min(Math.floor((time - min) / bucketSize), buckets - 1);
    histogram[bucket]++;
  });
  
  const maxCount = Math.max(...histogram);
  
  console.log(`\n${title}:`);
  console.log('─'.repeat(60));
  for (let i = 0; i < buckets; i++) {
    const bucketMin = (min + i * bucketSize).toFixed(0);
    const bucketMax = (min + (i + 1) * bucketSize).toFixed(0);
    const count = histogram[i];
    const barLength = Math.floor((count / maxCount) * maxBars);
    const bar = '█'.repeat(barLength);
    const percentage = ((count / times.length) * 100).toFixed(1);
    console.log(`${bucketMin.padStart(6)}-${bucketMax.padEnd(6)}ms: ${bar} ${count} (${percentage}%)`);
  }
}

// Función para mostrar resultados de una prueba
function displayResults(testName, results, totalTestTime) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalTimes = successful.map(r => r.totalTime).filter(t => t !== null);
  const latencies = successful.map(r => r.latencyMs).filter(l => l !== null);
  
  console.log('\n' + '='.repeat(70));
  console.log(`PRUEBA: ${testName}`);
  console.log('='.repeat(70));
  console.log(`Tiempo total del test: ${totalTestTime}ms (${(totalTestTime / 1000).toFixed(2)}s)`);
  console.log(`Throughput: ${(results.length / (totalTestTime / 1000)).toFixed(2)} req/s`);
  console.log(`\nExitosos: ${successful.length}/${results.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Fallidos: ${failed.length}/${results.length} (${((failed.length / results.length) * 100).toFixed(1)}%)`);
  
  const totalStats = calculateStats(totalTimes);
  if (totalStats) {
    console.log('\n--- Tiempo Total (incluye red) (ms) ---');
    console.log(`Promedio: ${totalStats.avg.toFixed(2)}ms`);
    console.log(`Mínimo: ${totalStats.min.toFixed(2)}ms`);
    console.log(`Máximo: ${totalStats.max.toFixed(2)}ms`);
    console.log(`P50: ${totalStats.p50.toFixed(2)}ms`);
    console.log(`P75: ${totalStats.p75.toFixed(2)}ms`);
    console.log(`P90: ${totalStats.p90.toFixed(2)}ms`);
    console.log(`P95: ${totalStats.p95.toFixed(2)}ms`);
    console.log(`P99: ${totalStats.p99.toFixed(2)}ms`);
    
    showDistribution(totalTimes, 'Distribución de Tiempos Totales');
  }
  
  const latencyStats = calculateStats(latencies);
  if (latencyStats) {
    console.log('\n--- Latencia del Modelo (solo procesamiento) (ms) ---');
    console.log(`Promedio: ${latencyStats.avg.toFixed(2)}ms`);
    console.log(`Mínimo: ${latencyStats.min.toFixed(2)}ms`);
    console.log(`Máximo: ${latencyStats.max.toFixed(2)}ms`);
    console.log(`P95: ${latencyStats.p95.toFixed(2)}ms`);
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
  
  console.log('='.repeat(70));
}

// Escenarios de prueba
const TEST_SCENARIOS = {
  // Prueba 1: Carga baja - 10 requests en paralelo
  lowLoad: async () => {
    console.log('\n🔵 PRUEBA 1: CARGA BAJA - 10 requests en paralelo');
    const NUM_REQUESTS = 10;
    const startTime = Date.now();
    const requests = Array.from({ length: NUM_REQUESTS }, (_, i) => makeRequest(i + 1));
    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    displayResults('Carga Baja (10 req paralelo)', results, totalTime);
    return results;
  },
  
  // Prueba 2: Carga media - 50 requests en paralelo
  mediumLoad: async () => {
    console.log('\n🟡 PRUEBA 2: CARGA MEDIA - 50 requests en paralelo');
    const NUM_REQUESTS = 50;
    const startTime = Date.now();
    const requests = Array.from({ length: NUM_REQUESTS }, (_, i) => makeRequest(i + 1));
    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    displayResults('Carga Media (50 req paralelo)', results, totalTime);
    return results;
  },
  
  // Prueba 3: Carga alta - 100 requests en paralelo
  highLoad: async () => {
    console.log('\n🔴 PRUEBA 3: CARGA ALTA - 100 requests en paralelo');
    const NUM_REQUESTS = 100;
    const startTime = Date.now();
    const requests = Array.from({ length: NUM_REQUESTS }, (_, i) => makeRequest(i + 1));
    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    displayResults('Carga Alta (100 req paralelo)', results, totalTime);
    return results;
  },
  
  // Prueba 4: Carga extrema - 200 requests en paralelo
  extremeLoad: async () => {
    console.log('\n⚫ PRUEBA 4: CARGA EXTREMA - 200 requests en paralelo');
    const NUM_REQUESTS = 200;
    const startTime = Date.now();
    const requests = Array.from({ length: NUM_REQUESTS }, (_, i) => makeRequest(i + 1));
    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    displayResults('Carga Extrema (200 req paralelo)', results, totalTime);
    return results;
  },
  
  // Prueba 5: Carga sostenida - 100 requests distribuidos en 30 segundos
  sustainedLoad: async () => {
    console.log('\n🟢 PRUEBA 5: CARGA SOSTENIDA - 100 requests en 30 segundos');
    const NUM_REQUESTS = 100;
    const DURATION_MS = 30000;
    const INTERVAL_MS = DURATION_MS / NUM_REQUESTS;
    
    const startTime = Date.now();
    const requests = [];
    
    for (let i = 0; i < NUM_REQUESTS; i++) {
      const delay = i * INTERVAL_MS;
      const requestPromise = new Promise(resolve => {
        setTimeout(() => {
          resolve(makeRequest(i + 1));
        }, delay);
      });
      requests.push(requestPromise);
    }
    
    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    displayResults('Carga Sostenida (100 req en 30s)', results, totalTime);
    return results;
  },
  
  // Prueba 6: Carga en ráfagas - 5 ráfagas de 20 requests cada 5 segundos
  burstLoad: async () => {
    console.log('\n⚡ PRUEBA 6: CARGA EN RÁFAGAS - 5 ráfagas de 20 requests');
    const BURST_SIZE = 20;
    const NUM_BURSTS = 5;
    const BURST_INTERVAL_MS = 5000;
    
    const allResults = [];
    const startTime = Date.now();
    
    for (let burst = 0; burst < NUM_BURSTS; burst++) {
      console.log(`\n  Ráfaga ${burst + 1}/${NUM_BURSTS}...`);
      const burstStart = Date.now();
      const requests = Array.from({ length: BURST_SIZE }, (_, i) => 
        makeRequest(burst * BURST_SIZE + i + 1)
      );
      const results = await Promise.all(requests);
      const burstTime = Date.now() - burstStart;
      allResults.push(...results);
      
      console.log(`  Ráfaga ${burst + 1} completada en ${burstTime}ms`);
      
      if (burst < NUM_BURSTS - 1) {
        await new Promise(resolve => setTimeout(resolve, BURST_INTERVAL_MS));
      }
    }
    
    const totalTime = Date.now() - startTime;
    displayResults('Carga en Ráfagas (5x20 req)', allResults, totalTime);
    return allResults;
  },
  
  // Prueba 7: Carga incremental - Aumenta gradualmente
  incrementalLoad: async () => {
    console.log('\n📈 PRUEBA 7: CARGA INCREMENTAL - Aumento gradual');
    const STAGES = [10, 25, 50, 75, 100];
    const STAGE_INTERVAL_MS = 10000;
    
    const allResults = [];
    const startTime = Date.now();
    
    for (let stage = 0; stage < STAGES.length; stage++) {
      const numRequests = STAGES[stage];
      console.log(`\n  Etapa ${stage + 1}/${STAGES.length}: ${numRequests} requests...`);
      
      const stageStart = Date.now();
      const requests = Array.from({ length: numRequests }, (_, i) => 
        makeRequest(allResults.length + i + 1)
      );
      const results = await Promise.all(requests);
      const stageTime = Date.now() - stageStart;
      allResults.push(...results);
      
      const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(1);
      const avgTime = results.filter(r => r.success)
        .reduce((sum, r) => sum + r.totalTime, 0) / results.filter(r => r.success).length || 0;
      
      console.log(`  Etapa ${stage + 1} completada: ${stageTime}ms, ${successRate}% éxito, avg ${avgTime.toFixed(0)}ms`);
      
      if (stage < STAGES.length - 1) {
        await new Promise(resolve => setTimeout(resolve, STAGE_INTERVAL_MS));
      }
    }
    
    const totalTime = Date.now() - startTime;
    displayResults('Carga Incremental (10→25→50→75→100)', allResults, totalTime);
    return allResults;
  },
  
  // Prueba 8: Diferentes tamaños de documentos
  differentDocSizes: async () => {
    console.log('\n📊 PRUEBA 8: DIFERENTES TAMAÑOS DE DOCUMENTOS');
    const DOC_SIZES = [10, 50, 100, 200];
    const REQUESTS_PER_SIZE = 10;
    
    const allResults = [];
    const startTime = Date.now();
    
    for (const docSize of DOC_SIZES) {
      console.log(`\n  Probando con ${docSize} documentos por request...`);
      const sizeStart = Date.now();
      
      const requests = Array.from({ length: REQUESTS_PER_SIZE }, (_, i) => {
        const requestId = allResults.length + i + 1;
        return makeRequest(requestId, docSize);
      });
      
      const results = await Promise.all(requests);
      const sizeTime = Date.now() - sizeStart;
      allResults.push(...results);
      
      const avgTime = results.filter(r => r.success)
        .reduce((sum, r) => sum + r.totalTime, 0) / results.filter(r => r.success).length || 0;
      
      console.log(`  ${docSize} docs: ${sizeTime}ms total, ${avgTime.toFixed(0)}ms promedio`);
    }
    
    const totalTime = Date.now() - startTime;
    displayResults('Diferentes Tamaños de Documentos', allResults, totalTime);
    return allResults;
  }
};

// Función principal
async function runAllTests() {
  console.log('='.repeat(70));
  console.log('SUITE DE PRUEBAS DE CARGA - Reranking Server');
  console.log('='.repeat(70));
  console.log(`Servidor: ${SERVER_URL}`);
  console.log(`Inicio: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  const allTestResults = {};
  const overallStart = Date.now();
  
  try {
    // Ejecutar todas las pruebas
    allTestResults.lowLoad = await TEST_SCENARIOS.lowLoad();
    await new Promise(resolve => setTimeout(resolve, 5000)); // Pausa entre pruebas
    
    allTestResults.mediumLoad = await TEST_SCENARIOS.mediumLoad();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    allTestResults.highLoad = await TEST_SCENARIOS.highLoad();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    allTestResults.extremeLoad = await TEST_SCENARIOS.extremeLoad();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    allTestResults.sustainedLoad = await TEST_SCENARIOS.sustainedLoad();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    allTestResults.burstLoad = await TEST_SCENARIOS.burstLoad();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    allTestResults.incrementalLoad = await TEST_SCENARIOS.incrementalLoad();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    allTestResults.differentDocSizes = await TEST_SCENARIOS.differentDocSizes();
    
  } catch (error) {
    console.error('\n❌ Error ejecutando pruebas:', error);
  }
  
  const overallTime = Date.now() - overallStart;
  
  // Resumen final
  console.log('\n\n' + '='.repeat(70));
  console.log('RESUMEN FINAL DE TODAS LAS PRUEBAS');
  console.log('='.repeat(70));
  console.log(`Tiempo total de todas las pruebas: ${(overallTime / 1000).toFixed(2)}s`);
  console.log(`Fin: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  // Comparación de rendimiento
  console.log('\n📊 COMPARACIÓN DE RENDIMIENTO:');
  console.log('─'.repeat(70));
  Object.entries(allTestResults).forEach(([testName, results]) => {
    const successful = results.filter(r => r.success);
    const totalTimes = successful.map(r => r.totalTime);
    if (totalTimes.length > 0) {
      const avg = totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length;
      const p95 = totalTimes.sort((a, b) => a - b)[Math.floor(totalTimes.length * 0.95)];
      console.log(`${testName.padEnd(25)}: Avg ${avg.toFixed(0)}ms | P95 ${p95.toFixed(0)}ms | ${successful.length}/${results.length} éxito`);
    }
  });
  console.log('='.repeat(70));
}

// Ejecutar todas las pruebas
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests, TEST_SCENARIOS };
