/* =========================================================
   Módulo DataModule: catálogo ficticio, generación de datos
   históricos y persistencia en localStorage
   ========================================================= */
const DataModule = (() => {
  'use strict';

  const STORAGE_KEY = 'abastoiq-datos-v1';
  const DIAS_HISTORIA = 120;
  const SEMILLA = 20261120;

  /** Generador pseudoaleatorio con semilla (Mulberry32) para datos reproducibles. */
  function crearRNG(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Número aleatorio con distribución normal estándar (Box-Muller). */
  function normal(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const PROVEEDORES = [
    { id: 'PRV-01', nombre: 'Polímeros del Norte S.A. de C.V.', pais: 'México', leadTime: 6, ltDesv: 1.0, otd: 0.95, calidad: 0.990, costoPedido: 900 },
    { id: 'PRV-02', nombre: 'Aceros Técnicos del Bajío', pais: 'México', leadTime: 10, ltDesv: 2.0, otd: 0.88, calidad: 0.982, costoPedido: 1200 },
    { id: 'PRV-03', nombre: 'ElectroComponentes Asia Ltd.', pais: 'China', leadTime: 28, ltDesv: 5.0, otd: 0.81, calidad: 0.975, costoPedido: 3500 },
    { id: 'PRV-04', nombre: 'Fijaciones Industriales MX', pais: 'México', leadTime: 4, ltDesv: 0.8, otd: 0.97, calidad: 0.995, costoPedido: 450 },
    { id: 'PRV-05', nombre: 'Empaques Sustentables S.A.', pais: 'México', leadTime: 5, ltDesv: 1.2, otd: 0.93, calidad: 0.988, costoPedido: 600 },
    { id: 'PRV-06', nombre: 'Química Industrial Texas Inc.', pais: 'EE. UU.', leadTime: 14, ltDesv: 3.0, otd: 0.90, calidad: 0.992, costoPedido: 2200 }
  ];

  // [sku, descripción, categoría, unidad, proveedor, costo unitario, consumo diario base,
  //  coef. de variación, MOQ, días de stock iniciales, tendencia diaria]
  const MATERIALES = [
    ['MP-1001', 'Resina polipropileno PP-H', 'Materia prima', 'kg', 'PRV-01', 38.5, 420, 0.18, 1000, 9, 0.002],
    ['MP-1002', 'Resina ABS grado inyección', 'Materia prima', 'kg', 'PRV-01', 52.0, 260, 0.22, 500, 4, 0.003],
    ['MP-1003', 'Masterbatch negro', 'Materia prima', 'kg', 'PRV-01', 95.0, 35, 0.25, 100, 40, 0],
    ['MP-1004', 'Elastómero TPE 60 Shore A', 'Materia prima', 'kg', 'PRV-01', 88.0, 60, 0.27, 200, 25, 0],
    ['MP-2001', 'Lámina acero galvanizado cal. 18', 'Metales', 'pza', 'PRV-02', 310.0, 140, 0.15, 200, 12, 0.001],
    ['MP-2002', 'Barra acero 1018 Ø 1"', 'Metales', 'm', 'PRV-02', 145.0, 90, 0.20, 150, 6, 0],
    ['MP-2003', 'Perfil aluminio 6063', 'Metales', 'm', 'PRV-02', 210.0, 55, 0.30, 100, 95, -0.002],
    ['EL-3001', 'Microcontrolador ARM Cortex-M0', 'Electrónica', 'pza', 'PRV-03', 48.0, 600, 0.12, 2000, 36, 0.002],
    ['EL-3002', 'Conector automotriz 12 vías', 'Electrónica', 'pza', 'PRV-03', 12.5, 1500, 0.16, 5000, 31, 0.001],
    ['EL-3003', 'Sensor de temperatura NTC', 'Electrónica', 'pza', 'PRV-03', 6.8, 900, 0.20, 3000, 60, 0],
    ['EL-3004', 'Arnés de cables principal', 'Electrónica', 'pza', 'PRV-03', 185.0, 150, 0.14, 300, 18, 0.003],
    ['EL-3005', 'Display LCD 2.4"', 'Electrónica', 'pza', 'PRV-03', 96.0, 180, 0.18, 500, 44, 0.004],
    ['FX-4001', 'Tornillo M6x20 zincado', 'Fijaciones', 'pza', 'PRV-04', 0.65, 8000, 0.20, 20000, 5, 0],
    ['FX-4002', 'Tuerca hexagonal M6', 'Fijaciones', 'pza', 'PRV-04', 0.30, 8200, 0.21, 20000, 3, 0],
    ['FX-4003', 'Remache pop 4.8 mm', 'Fijaciones', 'pza', 'PRV-04', 0.45, 3000, 0.28, 10000, 30, 0],
    ['FX-4004', 'Arandela de presión M8', 'Fijaciones', 'pza', 'PRV-04', 0.22, 2500, 0.25, 10000, 120, -0.001],
    ['FX-4005', 'Clip de sujeción plástico', 'Fijaciones', 'pza', 'PRV-04', 0.90, 2200, 0.23, 5000, 10, 0.002],
    ['EM-5001', 'Caja corrugada 40x30x25', 'Empaque', 'pza', 'PRV-05', 14.0, 700, 0.17, 1500, 8, 0.001],
    ['EM-5002', 'Película stretch 18"', 'Empaque', 'rollo', 'PRV-05', 210.0, 22, 0.30, 50, 15, 0],
    ['EM-5003', 'Separador de cartón doble', 'Empaque', 'pza', 'PRV-05', 4.5, 1400, 0.22, 3000, 2, 0.002],
    ['QM-6001', 'Adhesivo epóxico estructural', 'Químicos', 'kg', 'PRV-06', 480.0, 18, 0.26, 40, 11, 0.002],
    ['QM-6002', 'Desmoldante base agua', 'Químicos', 'l', 'PRV-06', 120.0, 30, 0.24, 100, 48, 0],
    ['QM-6003', 'Pintura en polvo gris RAL 7035', 'Químicos', 'kg', 'PRV-06', 165.0, 75, 0.19, 200, 16, 0.001],
    ['QM-6004', 'Solvente de limpieza IPA', 'Químicos', 'l', 'PRV-06', 58.0, 40, 0.35, 100, 7, 0]
  ];

  // Órdenes ya colocadas: [sku, múltiplos de MOQ, días para llegar]
  const EN_TRANSITO = [
    ['MP-1001', 3, 3],
    ['EL-3004', 8, 12],
    ['FX-4002', 2, 2],
    ['QM-6001', 4, 9],
    ['EM-5001', 2, 4],
    ['EL-3002', 4, 16]
  ];

  // Factor por día de la semana (domingo … sábado): la planta trabaja 6 días
  const FACTOR_DIA = [0.30, 1.08, 1.12, 1.10, 1.08, 1.04, 0.72];

  /** Genera el conjunto completo de datos de demostración. */
  function generar() {
    const rand = crearRNG(SEMILLA);
    const corte = Utils.hoy();
    const inicio = Utils.addDays(corte, -DIAS_HISTORIA);
    const dowInicio = inicio.getDay();

    const materiales = MATERIALES.map(([sku, descripcion, categoria, unidad, proveedorId, costo, base, cv, moq, diasStock, tendencia]) => {
      const historial = [];
      for (let t = 0; t < DIAS_HISTORIA; t++) {
        const dow = (dowInicio + t) % 7;
        const valor = base * (1 + tendencia * t) * FACTOR_DIA[dow] * (1 + cv * normal(rand));
        historial.push(Math.max(0, Math.round(valor)));
      }
      const nivelActual = base * (1 + tendencia * DIAS_HISTORIA) * 0.92;
      const stock = Math.round(nivelActual * diasStock * (0.92 + 0.16 * rand()));
      return { sku, descripcion, categoria, unidad, proveedorId, costo, moq, cv, stock, historial };
    });

    let consecutivo = 24001;
    const ordenes = EN_TRANSITO.map(([sku, multiplo, eta]) => {
      const m = materiales.find((x) => x.sku === sku);
      const p = PROVEEDORES.find((x) => x.id === m.proveedorId);
      return {
        id: `OC-${consecutivo++}`,
        sku,
        proveedorId: p.id,
        cantidad: m.moq * multiplo,
        fechaEmision: Utils.toISO(Utils.addDays(corte, -(p.leadTime - eta))),
        fechaETA: Utils.toISO(Utils.addDays(corte, eta)),
        estado: 'En tránsito'
      };
    });

    return {
      version: 1,
      inicio: Utils.toISO(inicio),
      corte: Utils.toISO(corte),
      proveedores: PROVEEDORES.map((p) => ({ ...p })),
      materiales,
      ordenes,
      eventos: [],
      consecutivoOC: consecutivo,
      ajustes: { nivelServicio: 0.95, costoMantener: 0.25, horizonte: 60, diasExceso: 90 }
    };
  }

  /** Carga los datos guardados o genera nuevos si no existen. */
  function cargar() {
    try {
      const texto = localStorage.getItem(STORAGE_KEY);
      if (texto) {
        const datos = JSON.parse(texto);
        if (datos && datos.version === 1 && Array.isArray(datos.materiales)) return datos;
      }
    } catch (e) {
      console.warn('No se pudo leer localStorage, se usan datos nuevos.', e);
    }
    const nuevos = generar();
    guardar(nuevos);
    return nuevos;
  }

  function guardar(datos) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
      return true;
    } catch (e) {
      console.warn('No se pudo guardar en localStorage.', e);
      return false;
    }
  }

  function restablecer() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* sin almacenamiento */ }
    const nuevos = generar();
    guardar(nuevos);
    return nuevos;
  }

  /** Crea una orden de compra nueva y la agrega a los datos. */
  function crearOrden(datos, sku, cantidad) {
    const m = datos.materiales.find((x) => x.sku === sku);
    const p = datos.proveedores.find((x) => x.id === m.proveedorId);
    const corte = Utils.parseISO(datos.corte);
    const orden = {
      id: `OC-${datos.consecutivoOC++}`,
      sku,
      proveedorId: p.id,
      cantidad,
      fechaEmision: datos.corte,
      fechaETA: Utils.toISO(Utils.addDays(corte, p.leadTime)),
      estado: 'En tránsito'
    };
    datos.ordenes.push(orden);
    return orden;
  }

  /** Registra la recepción de una orden y suma la cantidad al inventario. */
  function recibirOrden(datos, id) {
    const o = datos.ordenes.find((x) => x.id === id);
    if (!o || o.estado !== 'En tránsito') return null;
    const m = datos.materiales.find((x) => x.sku === o.sku);
    m.stock += o.cantidad;
    o.estado = 'Recibida';
    o.fechaRecepcion = datos.corte;
    return o;
  }

  /** Acelera una orden en tránsito (flete exprés): reduce a la mitad los días restantes. */
  function expeditarOrden(datos, id) {
    const o = datos.ordenes.find((x) => x.id === id);
    if (!o || o.estado !== 'En tránsito' || o.expeditada) return null;
    const corte = Utils.parseISO(datos.corte);
    const restantes = Utils.diffDays(corte, Utils.parseISO(o.fechaETA));
    o.fechaETA = Utils.toISO(Utils.addDays(corte, Math.max(1, Math.ceil(restantes / 2))));
    o.expeditada = true;
    return o;
  }

  function cancelarOrden(datos, id) {
    const o = datos.ordenes.find((x) => x.id === id);
    if (!o || o.estado !== 'En tránsito') return null;
    o.estado = 'Cancelada';
    return o;
  }

  function registrarEvento(datos, tipo, texto) {
    datos.eventos.unshift({ fecha: datos.corte, tipo, texto });
    if (datos.eventos.length > 200) datos.eventos.length = 200;
  }

  return { cargar, guardar, restablecer, generar, crearOrden, recibirOrden, expeditarOrden, cancelarOrden, registrarEvento, normal };
})();
