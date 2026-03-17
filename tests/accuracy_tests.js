const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.SERVER_URL || 'https://0jck8u55r8tl2e-8000.proxy.runpod.net/rerank';
const RESULTS_DIR = path.join(__dirname, 'results');

// ─── TEST CASES ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  // ========== ROPA ==========
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
  {
    name: "Tablet for kids",
    category: "electronica",
    query: "tablet for kids educational apps",
    documents: [
      "Amazon Fire HD 8 Kids Edition - 8-inch - 32GB - Parental controls - $139",
      "iPad 10th Gen - 10.9-inch - 64GB - Wi-Fi - $449",
      "Samsung Galaxy Tab A8 - 10.5-inch - 64GB - Android - $229",
      "LeapFrog Epic Academy Edition - 7-inch - 16GB - Kids learning tablet - $89",
      "Amazon Fire 7 Kids - 7-inch - 16GB - Educational content - $99",
      "Lenovo Tab M10 FHD Plus - 10.3-inch - 64GB - Android - $199",
      "Microsoft Surface Go 3 - 10.5-inch - 64GB - Windows 11 - $399"
    ],
    expectedTop3: [
      "Amazon Fire HD 8 Kids Edition - 8-inch - 32GB - Parental controls - $139",
      "LeapFrog Epic Academy Edition - 7-inch - 16GB - Kids learning tablet - $89",
      "Amazon Fire 7 Kids - 7-inch - 16GB - Educational content - $99"
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
  {
    name: "Air purifier for allergies",
    category: "hogar",
    query: "air purifier HEPA filter for allergies",
    documents: [
      "Dyson Pure Cool TP07 - HEPA + Carbon filter - 800 sq ft - $649",
      "Levoit Core 400S - HEPA filter - 403 sq ft - Smart - $229",
      "Winix 5500-2 - HEPA + Carbon - 360 sq ft - PlasmaWave - $199",
      "Coway AP-1512HH Mighty - HEPA - 360 sq ft - $149",
      "Blueair Blue Pure 211+ - HEPA - 540 sq ft - $299",
      "Honeywell HPA300 - HEPA - 465 sq ft - $249",
      "Humidifier Levoit 6L - Ultrasonic - Essential oil diffuser - $79"
    ],
    expectedTop3: [
      "Coway AP-1512HH Mighty - HEPA - 360 sq ft - $149",
      "Winix 5500-2 - HEPA + Carbon - 360 sq ft - PlasmaWave - $199",
      "Levoit Core 400S - HEPA filter - 403 sq ft - Smart - $229"
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
  {
    name: "Yoga mat thick",
    category: "deportes",
    query: "thick non-slip yoga mat for home workouts",
    documents: [
      "Liforme Yoga Mat - 4.2mm - Non-slip - Alignment markers - $150",
      "Manduka PRO Yoga Mat - 6mm - High density - Non-slip - $120",
      "Gaiam Premium Printed Yoga Mat - 6mm - Non-slip - $39",
      "Lululemon The Reversible Mat 5mm - Non-slip - $88",
      "Cork Yoga Block Set - Eco-friendly - 2 blocks + strap - $29",
      "Nike Training Floor Mat - 6mm - $35",
      "Treadmill NordicTrack T 6.5 Si - Foldable - $699"
    ],
    expectedTop3: [
      "Manduka PRO Yoga Mat - 6mm - High density - Non-slip - $120",
      "Gaiam Premium Printed Yoga Mat - 6mm - Non-slip - $39",
      "Lululemon The Reversible Mat 5mm - Non-slip - $88"
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
  },
  {
    name: "Machine learning book",
    category: "libros",
    query: "machine learning textbook for beginners",
    documents: [
      "Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow - Aurélien Géron - $65",
      "Pattern Recognition and Machine Learning - Bishop - Advanced - $89",
      "Introduction to Machine Learning with Python - Müller & Guido - $49",
      "Deep Learning - Goodfellow, Bengio, Courville - $79",
      "The Hundred-Page Machine Learning Book - Burkov - $30",
      "Data Science for Beginners - 4 weeks guide - $19",
      "Machine Learning Engineering - Andriy Burkov - $35"
    ],
    expectedTop3: [
      "Introduction to Machine Learning with Python - Müller & Guido - $49",
      "The Hundred-Page Machine Learning Book - Burkov - $30",
      "Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow - Aurélien Géron - $65"
    ]
  },

  // ========== ALIMENTACIÓN ==========
  {
    name: "Protein powder whey",
    category: "alimentacion",
    query: "whey protein powder chocolate flavor muscle building",
    documents: [
      "Optimum Nutrition Gold Standard 100% Whey - Chocolate - 5lb - $59",
      "Dymatize ISO100 Hydrolyzed Whey - Chocolate Fudge - 5lb - $69",
      "BSN SYNTHA-6 Whey Protein - Chocolate Milkshake - 5lb - $55",
      "Garden of Life Organic Plant Protein - Chocolate - 2.4lb - $49",
      "Casein Protein MuscleTech - Vanilla - 4lb - $39",
      "Creatine Monohydrate Bulk Supplements - Unflavored - 1kg - $29",
      "MyProtein Impact Whey - Chocolate Smooth - 5.5lb - $44"
    ],
    expectedTop3: [
      "Optimum Nutrition Gold Standard 100% Whey - Chocolate - 5lb - $59",
      "Dymatize ISO100 Hydrolyzed Whey - Chocolate Fudge - 5lb - $69",
      "BSN SYNTHA-6 Whey Protein - Chocolate Milkshake - 5lb - $55"
    ]
  },
  {
    name: "Vegan snacks healthy",
    category: "alimentacion",
    query: "healthy vegan snacks high protein",
    documents: [
      "RXBar Chocolate Sea Salt - Plant-based protein bar - 12 pack - $27",
      "Kind Protein Bar - Dark Chocolate Nut - 12 pack - $24",
      "Lärabar Peanut Butter Chocolate Chip - Vegan - 16 pack - $22",
      "Oreo Cookies Original - 14.3oz - $4",
      "CLIF Bar Energy Bar - Oatmeal Raisin Walnut - Vegan - 12 pack - $20",
      "Pringles Original - 5.2oz - $3",
      "Enjoy Life Dark Chocolate Morsels - Vegan - 9oz - $8"
    ],
    expectedTop3: [
      "RXBar Chocolate Sea Salt - Plant-based protein bar - 12 pack - $27",
      "Kind Protein Bar - Dark Chocolate Nut - 12 pack - $24",
      "CLIF Bar Energy Bar - Oatmeal Raisin Walnut - Vegan - 12 pack - $20"
    ]
  },

  // ========== SALUD ==========
  {
    name: "Blood pressure monitor",
    category: "salud",
    query: "blood pressure monitor home use accurate",
    documents: [
      "Omron Platinum Blood Pressure Monitor - Upper arm - Bluetooth - $79",
      "Withings BPM Connect - Wi-Fi & Bluetooth - Upper arm - $99",
      "Omron Silver Blood Pressure Monitor - Upper arm - $49",
      "Greater Goods Blood Pressure Cuff - Upper arm - $39",
      "iHealth Track Wrist Blood Pressure Monitor - Bluetooth - $59",
      "Pulse Oximeter Zacurate Pro Series - Fingertip - $29",
      "Digital Thermometer Braun ThermoScan 7 - Ear - $49"
    ],
    expectedTop3: [
      "Omron Platinum Blood Pressure Monitor - Upper arm - Bluetooth - $79",
      "Withings BPM Connect - Wi-Fi & Bluetooth - Upper arm - $99",
      "Omron Silver Blood Pressure Monitor - Upper arm - $49"
    ]
  },
  {
    name: "Vitamin D supplement",
    category: "salud",
    query: "vitamin D3 supplement 2000 IU",
    documents: [
      "Nature Made Vitamin D3 2000 IU - 260 softgels - $12",
      "NOW Foods Vitamin D3 2000 IU - 240 softgels - $11",
      "Sports Research Vitamin D3 5000 IU with Coconut Oil - 360 softgels - $19",
      "Garden of Life Vitamin Code Raw D3 2000 IU - 60 capsules - $18",
      "Thorne Vitamin D/K2 Liquid - 1oz - $24",
      "Multivitamin Centrum Adults - 200 tablets - $16",
      "Omega-3 Fish Oil Nordic Naturals - 120 softgels - $25"
    ],
    expectedTop3: [
      "Nature Made Vitamin D3 2000 IU - 260 softgels - $12",
      "NOW Foods Vitamin D3 2000 IU - 240 softgels - $11",
      "Garden of Life Vitamin Code Raw D3 2000 IU - 60 capsules - $18"
    ]
  }
];

// ─── HTTP REQUEST ─────────────────────────────────────────────────────────────

async function rerankRequest(query, documents) {
  try {
    const response = await axios.post(SERVER_URL, {
      query,
      documents,
      top_k: documents.length
    }, { timeout: 120000 });
    return response.data.results;
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return null;
  }
}

// ─── METRICS ─────────────────────────────────────────────────────────────────

function calculateMetrics(testCase, results) {
  if (!results || results.length === 0) {
    return { top1: 0, top3: 0, top5: 0, mrr: 0, ndcg5: 0, precisionAt1: 0, precisionAt3: 0, precisionAt5: 0, ap: 0 };
  }

  const expected = testCase.expectedTop3;
  const ranked = results.map(r => r.document);
  const numRelevant = expected.length;

  // Top-K Hit (at least one expected doc in top K)
  const top1 = expected.includes(ranked[0]) ? 1 : 0;
  const top3 = expected.some(d => ranked.slice(0, 3).includes(d)) ? 1 : 0;
  const top5 = expected.some(d => ranked.slice(0, 5).includes(d)) ? 1 : 0;

  // Precision@K = |relevant ∩ retrieved@K| / K
  const precisionAt1 = expected.includes(ranked[0]) ? 1 : 0;
  const precisionAt3 = ranked.slice(0, 3).filter(d => expected.includes(d)).length / 3;
  const precisionAt5 = ranked.slice(0, 5).filter(d => expected.includes(d)).length / 5;

  // MRR — rank of first relevant doc
  let mrr = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (expected.includes(ranked[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // NDCG@5 (binary relevance)
  let dcg = 0;
  let idcg = 0;
  for (let i = 0; i < Math.min(5, ranked.length); i++) {
    if (expected.includes(ranked[i])) dcg += 1 / Math.log2(i + 2);
    if (i < numRelevant) idcg += 1 / Math.log2(i + 2);
  }
  const ndcg5 = idcg > 0 ? dcg / idcg : 0;

  // Average Precision (AP)
  let hits = 0;
  let sumPrecision = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (expected.includes(ranked[i])) {
      hits++;
      sumPrecision += hits / (i + 1);
    }
  }
  const ap = numRelevant > 0 ? sumPrecision / numRelevant : 0;

  return { top1, top3, top5, mrr, ndcg5, precisionAt1, precisionAt3, precisionAt5, ap };
}

// ─── DISPLAY ─────────────────────────────────────────────────────────────────

function bar(value, max = 1, width = 30) {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function displayTestResults(testCase, results, metrics) {
  console.log('\n' + '═'.repeat(72));
  console.log(`TEST: ${testCase.name}`);
  console.log(`Category: ${testCase.category} | Query: "${testCase.query}"`);
  console.log('─'.repeat(72));

  console.log('\n  METRICS:');
  console.log(`  P@1   ${bar(metrics.precisionAt1)} ${(metrics.precisionAt1 * 100).toFixed(0)}%`);
  console.log(`  P@3   ${bar(metrics.precisionAt3)} ${(metrics.precisionAt3 * 100).toFixed(0)}%`);
  console.log(`  P@5   ${bar(metrics.precisionAt5)} ${(metrics.precisionAt5 * 100).toFixed(0)}%`);
  console.log(`  MRR   ${bar(metrics.mrr)} ${metrics.mrr.toFixed(3)}`);
  console.log(`  NDCG5 ${bar(metrics.ndcg5)} ${metrics.ndcg5.toFixed(3)}`);
  console.log(`  AP    ${bar(metrics.ap)} ${metrics.ap.toFixed(3)}`);

  console.log('\n  TOP 5 RESULTS:');
  results.slice(0, 5).forEach((r, i) => {
    const mark = testCase.expectedTop3.includes(r.document) ? '✓' : '✗';
    const doc = r.document.length > 62 ? r.document.slice(0, 62) + '…' : r.document;
    console.log(`  ${mark} ${i + 1}. [${r.score.toFixed(4)}] ${doc}`);
  });

  console.log('\n  EXPECTED TOP 3:');
  testCase.expectedTop3.forEach((doc, i) => {
    const rank = results.findIndex(r => r.document === doc) + 1;
    const mark = rank > 0 ? '✓' : '✗';
    const label = rank > 0 ? `rank ${rank}` : 'not found';
    const d = doc.length > 58 ? doc.slice(0, 58) + '…' : doc;
    console.log(`  ${mark} ${i + 1}. ${d} (${label})`);
  });
}

function displayCategoryChart(categoryMetrics) {
  console.log('\n' + '═'.repeat(72));
  console.log('ACCURACY BY CATEGORY');
  console.log('─'.repeat(72));

  const categories = Object.keys(categoryMetrics);
  const maxLabelLen = Math.max(...categories.map(c => c.length));

  categories.forEach(cat => {
    const ms = categoryMetrics[cat];
    const n = ms.length;
    const map = ms.reduce((s, m) => s + m.ap, 0) / n;
    const ndcg = ms.reduce((s, m) => s + m.ndcg5, 0) / n;
    const mrr = ms.reduce((s, m) => s + m.mrr, 0) / n;

    console.log(`\n  ${cat.toUpperCase().padEnd(maxLabelLen + 2)}(n=${n})`);
    console.log(`    MAP   ${bar(map, 1, 36)} ${(map * 100).toFixed(1)}%`);
    console.log(`    NDCG5 ${bar(ndcg, 1, 36)} ${(ndcg * 100).toFixed(1)}%`);
    console.log(`    MRR   ${bar(mrr, 1, 36)} ${(mrr * 100).toFixed(1)}%`);
  });
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function runAccuracyTests() {
  console.log('═'.repeat(72));
  console.log('  ACCURACY EVALUATION — RexReranker');
  console.log('═'.repeat(72));
  console.log(`  Server : ${SERVER_URL}`);
  console.log(`  Tests  : ${TEST_CASES.length}`);
  console.log(`  Start  : ${new Date().toISOString()}`);
  console.log('═'.repeat(72));

  const allMetrics = [];
  const categoryMetrics = {};
  const perTestResults = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    process.stdout.write(`\n[${i + 1}/${TEST_CASES.length}] ${tc.name}… `);

    const results = await rerankRequest(tc.query, tc.documents);
    if (!results) {
      console.log('FAILED');
      continue;
    }
    console.log('done');

    const metrics = calculateMetrics(tc, results);
    allMetrics.push(metrics);

    categoryMetrics[tc.category] = categoryMetrics[tc.category] || [];
    categoryMetrics[tc.category].push(metrics);

    perTestResults.push({
      name: tc.name,
      category: tc.category,
      query: tc.query,
      metrics,
      top5: results.slice(0, 5).map(r => ({ document: r.document, score: r.score })),
      expectedTop3: tc.expectedTop3
    });

    displayTestResults(tc, results, metrics);
    await new Promise(r => setTimeout(r, 500));
  }

  // ── Global summary ──
  const n = allMetrics.length;
  const avg = key => allMetrics.reduce((s, m) => s + m[key], 0) / n;

  console.log('\n\n' + '═'.repeat(72));
  console.log('  GLOBAL SUMMARY');
  console.log('─'.repeat(72));
  console.log(`  Tests completed : ${n}/${TEST_CASES.length}`);
  console.log(`\n  Metric         Value   Bar`);
  console.log('  ' + '─'.repeat(50));

  const globalMetrics = {
    'Top-1 Hit':  avg('top1'),
    'Top-3 Hit':  avg('top3'),
    'Top-5 Hit':  avg('top5'),
    'P@1':        avg('precisionAt1'),
    'P@3':        avg('precisionAt3'),
    'P@5':        avg('precisionAt5'),
    'MRR':        avg('mrr'),
    'NDCG@5':     avg('ndcg5'),
    'MAP':        avg('ap'),
  };

  Object.entries(globalMetrics).forEach(([label, value]) => {
    console.log(`  ${label.padEnd(14)} ${(value * 100).toFixed(1).padStart(5)}%  ${bar(value, 1, 28)}`);
  });

  displayCategoryChart(categoryMetrics);

  // ── Save results ──
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const output = {
    timestamp: new Date().toISOString(),
    server: SERVER_URL,
    totalTests: TEST_CASES.length,
    completed: n,
    globalMetrics: Object.fromEntries(
      Object.entries(globalMetrics).map(([k, v]) => [k, parseFloat(v.toFixed(4))])
    ),
    categoryMetrics: Object.fromEntries(
      Object.entries(categoryMetrics).map(([cat, ms]) => {
        const cnt = ms.length;
        return [cat, {
          count: cnt,
          map:   parseFloat((ms.reduce((s, m) => s + m.ap, 0) / cnt).toFixed(4)),
          ndcg5: parseFloat((ms.reduce((s, m) => s + m.ndcg5, 0) / cnt).toFixed(4)),
          mrr:   parseFloat((ms.reduce((s, m) => s + m.mrr, 0) / cnt).toFixed(4)),
          top1:  parseFloat((ms.reduce((s, m) => s + m.top1, 0) / cnt).toFixed(4)),
          top3:  parseFloat((ms.reduce((s, m) => s + m.top3, 0) / cnt).toFixed(4)),
        }];
      })
    ),
    perTest: perTestResults
  };

  const outPath = path.join(RESULTS_DIR, 'accuracy_results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n\n  Results saved → ${outPath}`);

  console.log('\n' + '═'.repeat(72));
  console.log(`  End: ${new Date().toISOString()}`);
  console.log('═'.repeat(72));

  return output;
}

if (require.main === module) {
  runAccuracyTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runAccuracyTests, TEST_CASES };
