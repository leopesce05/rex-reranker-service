const axios = require('axios');

// URL del servidor
const SERVER_URL = process.env.SERVER_URL || 'https://nh88vk2e8jxgd4-8000.proxy.runpod.net/rerank';

// Test cases para evaluar accuracy del reranker
const TEST_CASES = [
  // ========== PRENDAS DE ROPA ==========
  {
    name: "Camiseta azul talla M - Hombre",
    category: "ropa",
    query: "camiseta azul talla M hombre",
    documents: [
      "Camiseta básica azul marino talla M - Hombre - Algodón 100% - $25",
      "Pantalón jean azul oscuro talla 32 - Hombre - Corte slim - $45",
      "Camiseta polo blanca talla L - Mujer - Manga corta - $30",
      "Camiseta básica azul cielo talla M - Hombre - Algodón 100% - $25",
      "Zapatillas deportivas negras talla 42 - Unisex - Running - $80",
      "Camiseta manga larga azul claro talla M - Hombre - Algodón orgánico - $28",
      "Short deportivo negro talla M - Hombre - Secado rápido - $20",
      "Camiseta básica roja talla S - Mujer - Algodón 100% - $25"
    ],
    expectedTop3: [
      "Camiseta básica azul marino talla M - Hombre - Algodón 100% - $25",
      "Camiseta básica azul cielo talla M - Hombre - Algodón 100% - $25",
      "Camiseta manga larga azul claro talla M - Hombre - Algodón orgánico - $28"
    ]
  },
  {
    name: "Pantalón jean mujer",
    category: "ropa",
    query: "pantalón jean mujer",
    documents: [
      "Pantalón jean azul oscuro talla 32 - Hombre - Corte slim - $45",
      "Pantalón jean azul claro talla 30 - Mujer - Corte recto - $45",
      "Pantalón jean negro talla 34 - Mujer - Corte slim - $45",
      "Pantalón chino beige talla 34 - Mujer - Corte regular - $50",
      "Pantalón cargo verde talla 36 - Hombre - Múltiples bolsillos - $55",
      "Pantalón jean rojo talla 36 - Mujer - Corte slim - $45",
      "Short deportivo azul talla L - Mujer - Secado rápido - $20"
    ],
    expectedTop3: [
      "Pantalón jean azul claro talla 30 - Mujer - Corte recto - $45",
      "Pantalón jean negro talla 34 - Mujer - Corte slim - $45",
      "Pantalón jean rojo talla 36 - Mujer - Corte slim - $45"
    ]
  },
  {
    name: "Zapatillas running",
    category: "ropa",
    query: "zapatillas running negras",
    documents: [
      "Zapatillas deportivas negras talla 42 - Unisex - Running - $80",
      "Zapatillas running azules talla 43 - Unisex - Amortiguación - $90",
      "Zapatillas casuales blancas talla 41 - Unisex - Cuero sintético - $65",
      "Zapatillas deportivas rojas talla 40 - Unisex - Running - $80",
      "Zapatillas running negras talla 44 - Unisex - Amortiguación - $90",
      "Zapatillas deportivas blancas talla 41 - Unisex - Running - $80",
      "Botas de cuero negras talla 42 - Hombre - Casual - $120"
    ],
    expectedTop3: [
      "Zapatillas deportivas negras talla 42 - Unisex - Running - $80",
      "Zapatillas running negras talla 44 - Unisex - Amortiguación - $90",
      "Zapatillas deportivas rojas talla 40 - Unisex - Running - $80"
    ]
  },
  {
    name: "Camiseta polo mujer blanca",
    category: "ropa",
    query: "camiseta polo blanca mujer",
    documents: [
      "Camiseta polo blanca talla L - Mujer - Manga corta - $30",
      "Camiseta polo blanca talla M - Hombre - Manga corta - $30",
      "Camiseta polo azul marino talla M - Hombre - Manga corta - $30",
      "Camiseta básica blanca talla M - Mujer - Algodón 100% - $25",
      "Camiseta polo verde talla S - Mujer - Manga corta - $30",
      "Camiseta manga larga blanca talla L - Mujer - Algodón 100% - $28",
      "Blusa blanca talla M - Mujer - Formal - $40"
    ],
    expectedTop3: [
      "Camiseta polo blanca talla L - Mujer - Manga corta - $30",
      "Camiseta básica blanca talla M - Mujer - Algodón 100% - $25",
      "Camiseta manga larga blanca talla L - Mujer - Algodón 100% - $28"
    ]
  },
  {
    name: "Short deportivo",
    category: "ropa",
    query: "short deportivo",
    documents: [
      "Short deportivo negro talla M - Hombre - Secado rápido - $20",
      "Short deportivo azul talla L - Mujer - Secado rápido - $20",
      "Short de baño azul talla M - Unisex - Secado rápido - $22",
      "Pantalón cargo verde talla 36 - Hombre - Múltiples bolsillos - $55",
      "Short deportivo rojo talla L - Hombre - Secado rápido - $20",
      "Bermuda beige talla 34 - Hombre - Casual - $35",
      "Falda corta negra talla M - Mujer - Casual - $25"
    ],
    expectedTop3: [
      "Short deportivo negro talla M - Hombre - Secado rápido - $20",
      "Short deportivo azul talla L - Mujer - Secado rápido - $20",
      "Short deportivo rojo talla L - Hombre - Secado rápido - $20"
    ]
  },

  // ========== ELECTRÓNICA ==========
  {
    name: "Televisor 55 pulgadas 4K",
    category: "electronica",
    query: "televisor 55 pulgadas 4K smart TV",
    documents: [
      "Televisor Samsung 55 pulgadas 4K UHD Smart TV - QLED - $899",
      "Televisor LG 50 pulgadas 4K UHD Smart TV - LED - $699",
      "Televisor Sony 55 pulgadas 4K UHD Smart TV - OLED - $1299",
      "Televisor TCL 43 pulgadas 4K UHD Smart TV - LED - $399",
      "Televisor Samsung 65 pulgadas 8K UHD Smart TV - QLED - $1599",
      "Monitor LG 27 pulgadas 4K - Gaming - $349",
      "Proyector Epson 1080p - Home Cinema - $599"
    ],
    expectedTop3: [
      "Televisor Samsung 55 pulgadas 4K UHD Smart TV - QLED - $899",
      "Televisor Sony 55 pulgadas 4K UHD Smart TV - OLED - $1299",
      "Televisor LG 50 pulgadas 4K UHD Smart TV - LED - $699"
    ]
  },
  {
    name: "Smartphone Android",
    category: "electronica",
    query: "smartphone Android 128GB",
    documents: [
      "Samsung Galaxy S23 128GB - Android 13 - 6.1 pulgadas - $799",
      "iPhone 14 128GB - iOS 16 - 6.1 pulgadas - $899",
      "Google Pixel 7 128GB - Android 13 - 6.3 pulgadas - $599",
      "Xiaomi Redmi Note 12 128GB - Android 12 - 6.67 pulgadas - $249",
      "OnePlus 11 256GB - Android 13 - 6.7 pulgadas - $699",
      "Samsung Galaxy A54 128GB - Android 13 - 6.4 pulgadas - $449",
      "Motorola Edge 40 128GB - Android 13 - 6.55 pulgadas - $549"
    ],
    expectedTop3: [
      "Samsung Galaxy S23 128GB - Android 13 - 6.1 pulgadas - $799",
      "Google Pixel 7 128GB - Android 13 - 6.3 pulgadas - $599",
      "Xiaomi Redmi Note 12 128GB - Android 12 - 6.67 pulgadas - $249"
    ]
  },
  {
    name: "Laptop gaming",
    category: "electronica",
    query: "laptop gaming RTX 3060",
    documents: [
      "Laptop ASUS ROG Strix G15 - RTX 3060 - AMD Ryzen 7 - 16GB RAM - $1299",
      "Laptop MSI Katana GF66 - RTX 3050 - Intel i7 - 16GB RAM - $999",
      "Laptop HP Pavilion Gaming - RTX 3060 - Intel i5 - 8GB RAM - $1099",
      "Laptop Lenovo Legion 5 - RTX 3070 - AMD Ryzen 7 - 16GB RAM - $1499",
      "Laptop Dell G15 - RTX 3050 - Intel i7 - 16GB RAM - $1049",
      "Laptop MacBook Pro M2 - 16GB RAM - 14 pulgadas - $1999",
      "Laptop Acer Nitro 5 - RTX 3060 - Intel i7 - 16GB RAM - $1199"
    ],
    expectedTop3: [
      "Laptop ASUS ROG Strix G15 - RTX 3060 - AMD Ryzen 7 - 16GB RAM - $1299",
      "Laptop HP Pavilion Gaming - RTX 3060 - Intel i5 - 8GB RAM - $1099",
      "Laptop Acer Nitro 5 - RTX 3060 - Intel i7 - 16GB RAM - $1199"
    ]
  },
  {
    name: "Auriculares inalámbricos",
    category: "electronica",
    query: "auriculares inalámbricos cancelación de ruido",
    documents: [
      "Sony WH-1000XM5 - Inalámbricos - Cancelación de ruido activa - $399",
      "Bose QuietComfort 45 - Inalámbricos - Cancelación de ruido - $329",
      "Apple AirPods Pro 2 - Inalámbricos - Cancelación de ruido - $249",
      "Sennheiser Momentum 4 - Inalámbricos - Cancelación de ruido - $379",
      "JBL Tune 770NC - Inalámbricos - Cancelación de ruido - $99",
      "Sony WF-1000XM4 - Earbuds - Cancelación de ruido - $279",
      "Samsung Galaxy Buds2 Pro - Earbuds - Cancelación de ruido - $199"
    ],
    expectedTop3: [
      "Sony WH-1000XM5 - Inalámbricos - Cancelación de ruido activa - $399",
      "Bose QuietComfort 45 - Inalámbricos - Cancelación de ruido - $329",
      "Sennheiser Momentum 4 - Inalámbricos - Cancelación de ruido - $379"
    ]
  },

  // ========== HOGAR ==========
  {
    name: "Aspiradora robot",
    category: "hogar",
    query: "aspiradora robot inteligente",
    documents: [
      "Roomba i7+ - Aspiradora robot - Auto-vaciado - Mapeo inteligente - $799",
      "Roborock S7 MaxV - Aspiradora robot - Fregado y aspirado - $899",
      "Dyson V15 Detect - Aspiradora inalámbrica - Láser de detección - $749",
      "Eufy RoboVac G30 - Aspiradora robot - WiFi - $299",
      "iRobot Roomba 675 - Aspiradora robot - Básica - $279",
      "Shark ION Robot - Aspiradora robot - Auto-carga - $199",
      "Xiaomi Mi Robot Vacuum - Aspiradora robot - App control - $399"
    ],
    expectedTop3: [
      "Roomba i7+ - Aspiradora robot - Auto-vaciado - Mapeo inteligente - $799",
      "Roborock S7 MaxV - Aspiradora robot - Fregado y aspirado - $899",
      "Xiaomi Mi Robot Vacuum - Aspiradora robot - App control - $399"
    ]
  },
  {
    name: "Cafetera espresso",
    category: "hogar",
    query: "cafetera espresso automática",
    documents: [
      "De'Longhi Magnifica S - Cafetera espresso automática - $599",
      "Breville Barista Express - Cafetera espresso semiautomática - $699",
      "Nespresso Vertuo - Cafetera de cápsulas - $199",
      "Keurig K-Cafe - Cafetera de cápsulas - $149",
      "Gaggia Classic Pro - Cafetera espresso manual - $449",
      "Philips 3200 - Cafetera espresso superautomática - $899",
      "Cuisinart DCC-3200 - Cafetera de goteo - $79"
    ],
    expectedTop3: [
      "De'Longhi Magnifica S - Cafetera espresso automática - $599",
      "Philips 3200 - Cafetera espresso superautomática - $899",
      "Breville Barista Express - Cafetera espresso semiautomática - $699"
    ]
  },

  // ========== DEPORTES ==========
  {
    name: "Bicicleta de montaña",
    category: "deportes",
    query: "bicicleta montaña suspensión",
    documents: [
      "Trek X-Caliber 8 - Bicicleta montaña - Suspensión delantera - 29 pulgadas - $899",
      "Specialized Rockhopper - Bicicleta montaña - Suspensión delantera - 27.5 pulgadas - $749",
      "Giant Talon 2 - Bicicleta montaña - Suspensión delantera - 29 pulgadas - $599",
      "Cannondale Trail 5 - Bicicleta montaña - Suspensión delantera - 27.5 pulgadas - $849",
      "Scott Aspect 950 - Bicicleta montaña - Suspensión delantera - 29 pulgadas - $699",
      "Bicicleta urbana Schwinn - 7 velocidades - $299",
      "Bicicleta plegable Dahon - 20 pulgadas - $449"
    ],
    expectedTop3: [
      "Trek X-Caliber 8 - Bicicleta montaña - Suspensión delantera - 29 pulgadas - $899",
      "Specialized Rockhopper - Bicicleta montaña - Suspensión delantera - 27.5 pulgadas - $749",
      "Giant Talon 2 - Bicicleta montaña - Suspensión delantera - 29 pulgadas - $599"
    ]
  },
  {
    name: "Pesas ajustables",
    category: "deportes",
    query: "pesas ajustables home gym",
    documents: [
      "Bowflex SelectTech 552 - Pesas ajustables - 5-52.5 lbs cada una - $399",
      "PowerBlock Sport 24 - Pesas ajustables - 3-24 lbs cada una - $199",
      "CAP Barbell Hex Dumbbell Set - Pesas fijas - 5-50 lbs - $299",
      "Yes4All Adjustable Dumbbells - Pesas ajustables - 5-50 lbs - $179",
      "Bowflex PR1000 - Banco de pesas - Inclinable - $299",
      "Marcy Smith Machine - Máquina de ejercicios - $599",
      "Resistance Bands Set - Bandas de resistencia - $29"
    ],
    expectedTop3: [
      "Bowflex SelectTech 552 - Pesas ajustables - 5-52.5 lbs cada una - $399",
      "PowerBlock Sport 24 - Pesas ajustables - 3-24 lbs cada una - $199",
      "Yes4All Adjustable Dumbbells - Pesas ajustables - 5-50 lbs - $179"
    ]
  },

  // ========== LIBROS ==========
  {
    name: "Libro de programación Python",
    category: "libros",
    query: "libro programación Python principiantes",
    documents: [
      "Python Crash Course - Eric Matthes - Programación Python para principiantes - $39",
      "Automate the Boring Stuff with Python - Al Sweigart - Automatización - $29",
      "Learn Python the Hard Way - Zed Shaw - Programación Python - $35",
      "JavaScript: The Definitive Guide - David Flanagan - Programación JavaScript - $59",
      "Clean Code - Robert C. Martin - Programación software - $45",
      "The Pragmatic Programmer - Andrew Hunt - Desarrollo software - $49",
      "Head First Python - Paul Barry - Programación Python visual - $42"
    ],
    expectedTop3: [
      "Python Crash Course - Eric Matthes - Programación Python para principiantes - $39",
      "Learn Python the Hard Way - Zed Shaw - Programación Python - $35",
      "Head First Python - Paul Barry - Programación Python visual - $42"
    ]
  }
];

// Función para hacer request de reranking
async function rerankRequest(query, documents) {
  try {
    const response = await axios.post(SERVER_URL, {
      query: query,
      documents: documents,
      top_k: documents.length  // Retornar todos para evaluar orden completo
    }, {
      timeout: 120000
    });
    return response.data.results;
  } catch (error) {
    console.error(`Error en rerank: ${error.message}`);
    return null;
  }
}

// Función para calcular métricas de accuracy
function calculateAccuracy(testCase, results) {
  if (!results || results.length === 0) {
    return {
      top1: 0,
      top3: 0,
      top5: 0,
      mrr: 0,  // Mean Reciprocal Rank
      ndcg: 0  // Normalized Discounted Cumulative Gain (simplificado)
    };
  }

  const expectedDocs = testCase.expectedTop3;
  const resultDocs = results.map(r => r.document);
  
  // Top-1 Accuracy
  const top1 = resultDocs[0] === expectedDocs[0] ? 1 : 0;
  
  // Top-3 Accuracy
  const top3 = expectedDocs.some(doc => resultDocs.slice(0, 3).includes(doc)) ? 1 : 0;
  
  // Top-5 Accuracy
  const top5 = expectedDocs.some(doc => resultDocs.slice(0, 5).includes(doc)) ? 1 : 0;
  
  // Mean Reciprocal Rank (MRR)
  let mrr = 0;
  for (const expectedDoc of expectedDocs) {
    const rank = resultDocs.indexOf(expectedDoc) + 1;
    if (rank > 0) {
      mrr += 1 / rank;
      break;  // Solo el primer match cuenta para MRR
    }
  }
  
  // NDCG simplificado (asumiendo relevancia binaria)
  let dcg = 0;
  let idcg = 0;
  for (let i = 0; i < Math.min(5, resultDocs.length); i++) {
    const doc = resultDocs[i];
    const isRelevant = expectedDocs.includes(doc) ? 1 : 0;
    dcg += isRelevant / Math.log2(i + 2);
    
    // IDCG: asumiendo que los primeros 3 son relevantes
    if (i < 3) {
      idcg += 1 / Math.log2(i + 2);
    }
  }
  const ndcg = idcg > 0 ? dcg / idcg : 0;
  
  return { top1, top3, top5, mrr, ndcg };
}

// Función para mostrar resultados de un test
function displayTestResults(testCase, results, metrics) {
  console.log('\n' + '='.repeat(70));
  console.log(`TEST: ${testCase.name}`);
  console.log(`Categoría: ${testCase.category}`);
  console.log(`Query: "${testCase.query}"`);
  console.log('='.repeat(70));
  
  console.log('\n📊 MÉTRICAS:');
  console.log(`  Top-1 Accuracy: ${(metrics.top1 * 100).toFixed(1)}%`);
  console.log(`  Top-3 Accuracy: ${(metrics.top3 * 100).toFixed(1)}%`);
  console.log(`  Top-5 Accuracy: ${(metrics.top5 * 100).toFixed(1)}%`);
  console.log(`  MRR: ${metrics.mrr.toFixed(3)}`);
  console.log(`  NDCG@5: ${metrics.ndcg.toFixed(3)}`);
  
  console.log('\n🎯 TOP 5 RESULTADOS:');
  results.slice(0, 5).forEach((result, idx) => {
    const isExpected = testCase.expectedTop3.includes(result.document);
    const marker = isExpected ? '✅' : '❌';
    console.log(`  ${marker} ${idx + 1}. [Score: ${result.score.toFixed(4)}] ${result.document.substring(0, 60)}...`);
  });
  
  console.log('\n📋 ESPERADO (Top 3):');
  testCase.expectedTop3.forEach((doc, idx) => {
    const rank = results.findIndex(r => r.document === doc) + 1;
    const found = rank > 0;
    const marker = found ? '✅' : '❌';
    console.log(`  ${marker} ${idx + 1}. ${doc.substring(0, 60)}... ${found ? `(Rank: ${rank})` : '(No encontrado)'}`);
  });
}

// Función principal para ejecutar todas las pruebas
async function runAccuracyTests() {
  console.log('='.repeat(70));
  console.log('EVALUACIÓN DE ACCURACY - Reranking Service');
  console.log('='.repeat(70));
  console.log(`Servidor: ${SERVER_URL}`);
  console.log(`Total de tests: ${TEST_CASES.length}`);
  console.log(`Inicio: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  const allMetrics = [];
  const categoryMetrics = {};
  
  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log(`\n\n[${i + 1}/${TEST_CASES.length}] Ejecutando test: ${testCase.name}...`);
    
    const results = await rerankRequest(testCase.query, testCase.documents);
    
    if (!results) {
      console.log(`❌ Error ejecutando test ${testCase.name}`);
      continue;
    }
    
    const metrics = calculateAccuracy(testCase, results);
    allMetrics.push(metrics);
    
    // Agrupar por categoría
    if (!categoryMetrics[testCase.category]) {
      categoryMetrics[testCase.category] = [];
    }
    categoryMetrics[testCase.category].push(metrics);
    
    displayTestResults(testCase, results, metrics);
    
    // Pequeña pausa entre tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Resumen final
  console.log('\n\n' + '='.repeat(70));
  console.log('RESUMEN FINAL - ACCURACY');
  console.log('='.repeat(70));
  
  const avgTop1 = allMetrics.reduce((sum, m) => sum + m.top1, 0) / allMetrics.length;
  const avgTop3 = allMetrics.reduce((sum, m) => sum + m.top3, 0) / allMetrics.length;
  const avgTop5 = allMetrics.reduce((sum, m) => sum + m.top5, 0) / allMetrics.length;
  const avgMRR = allMetrics.reduce((sum, m) => sum + m.mrr, 0) / allMetrics.length;
  const avgNDCG = allMetrics.reduce((sum, m) => sum + m.ndcg, 0) / allMetrics.length;
  
  console.log('\n📊 MÉTRICAS GLOBALES:');
  console.log(`  Top-1 Accuracy: ${(avgTop1 * 100).toFixed(1)}%`);
  console.log(`  Top-3 Accuracy: ${(avgTop3 * 100).toFixed(1)}%`);
  console.log(`  Top-5 Accuracy: ${(avgTop5 * 100).toFixed(1)}%`);
  console.log(`  MRR promedio: ${avgMRR.toFixed(3)}`);
  console.log(`  NDCG@5 promedio: ${avgNDCG.toFixed(3)}`);
  
  console.log('\n📊 MÉTRICAS POR CATEGORÍA:');
  Object.entries(categoryMetrics).forEach(([category, metrics]) => {
    const count = metrics.length;
    const catTop1 = metrics.reduce((sum, m) => sum + m.top1, 0) / count;
    const catTop3 = metrics.reduce((sum, m) => sum + m.top3, 0) / count;
    const catMRR = metrics.reduce((sum, m) => sum + m.mrr, 0) / count;
    console.log(`\n  ${category.toUpperCase()} (${count} tests):`);
    console.log(`    Top-1: ${(catTop1 * 100).toFixed(1)}%`);
    console.log(`    Top-3: ${(catTop3 * 100).toFixed(1)}%`);
    console.log(`    MRR: ${catMRR.toFixed(3)}`);
  });
  
  console.log('\n' + '='.repeat(70));
  console.log(`Fin: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
}

// Ejecutar pruebas
if (require.main === module) {
  runAccuracyTests().catch(error => {
    console.error('Error ejecutando pruebas de accuracy:', error);
    process.exit(1);
  });
}

module.exports = { runAccuracyTests, TEST_CASES };

