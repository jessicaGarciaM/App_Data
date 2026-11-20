/* =========================================================
   Módulo Analytics: pronóstico de demanda, inventario de
   seguridad, punto de reorden, EOQ, riesgo de corto y ABC
   ========================================================= */
const Analytics = (() => {
  'use strict';

  const { sum, mean } = Utils;
  const VENTANA = 120;          // días de historia usados en el modelo
  const ALFA = 0.25, BETA = 0.05, PHI = 0.98;

  function desviacion(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
  }

  /** Inversa de la normal estándar (algoritmo de Acklam). */
  function normInv(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pBajo = 0.02425;
    let q, r;
    if (p < pBajo) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= 1 - pBajo) {
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  /** Función de distribución acumulada de la normal estándar. */
  function normCDF(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  /** Índices estacionales por día de la semana (promedio del día / promedio general). */
  function indicesSemanales(serie, dowInicio) {
    const total = mean(serie) || 1;
    const sumas = new Array(7).fill(0), conteos = new Array(7).fill(0);
    serie.forEach((v, i) => { const d = (dowInicio + i) % 7; sumas[d] += v; conteos[d]++; });
    return sumas.map((s, d) => Math.max(0.05, conteos[d] ? (s / conteos[d]) / total : 1));
  }

  /** Suavizamiento exponencial de Holt con tendencia amortiguada. */
  function holt(serie) {
    let nivel = serie[0];
    let tendencia = serie.length >= 14 ? (mean(serie.slice(7, 14)) - mean(serie.slice(0, 7))) / 7 : 0;
    const ajustado = [serie[0]];
    for (let i = 1; i < serie.length; i++) {
      ajustado.push(nivel + PHI * tendencia);
      const nuevoNivel = ALFA * serie[i] + (1 - ALFA) * (nivel + PHI * tendencia);
      tendencia = BETA * (nuevoNivel - nivel) + (1 - BETA) * PHI * tendencia;
      nivel = nuevoNivel;
    }
    return { nivel, tendencia, ajustado };
  }

  /**
   * Pronostica la demanda diaria de un material.
   * @returns {{historia:number[], ajustado:number[], pronostico:number[], sigma:number, mape:number, tendencia:number, indices:number[], dowPronostico:number}}
   */
  function pronosticar(material, inicioISO, horizonte, factorDemanda = 1) {
    const h = material.historial;
    const offset = Math.max(0, h.length - VENTANA);
    const serie = h.slice(offset);
    const dowInicio = (Utils.parseISO(inicioISO).getDay() + offset) % 7;
    const idx = indicesSemanales(serie, dowInicio);

    const desest = serie.map((v, i) => v / idx[(dowInicio + i) % 7]);
    const { nivel, tendencia, ajustado } = holt(desest);
    const ajustadoEst = ajustado.map((v, i) => v * idx[(dowInicio + i) % 7]);

    // Error del modelo (se omiten las 2 primeras semanas de "calentamiento")
    const residuos = [];
    for (let i = 14; i < serie.length; i++) residuos.push(serie[i] - ajustadoEst[i]);
    const sigma = desviacion(residuos);
    // MAPE ponderado (WAPE) para que los domingos de bajo volumen no distorsionen la métrica
    const mape = sum(residuos.map(Math.abs)) / (sum(serie.slice(14)) || 1);

    const dowPronostico = (dowInicio + serie.length) % 7;
    const pronostico = [];
    let acumPhi = 0;
    for (let k = 1; k <= horizonte; k++) {
      acumPhi += PHI ** k;
      const base = Math.max(0, nivel + acumPhi * tendencia);
      pronostico.push(base * idx[(dowPronostico + k - 1) % 7] * factorDemanda);
    }
    return { historia: serie, ajustado: ajustadoEst, pronostico, sigma, mape, tendencia, indices: idx, dowPronostico, nivel };
  }

  /**
   * Analiza un material: parámetros de inventario, proyección y recomendación de compra.
   * @param {object} esc Escenario opcional {nivelServicio, demanda, retraso, proveedor}
   */
  function analizarMaterial(m, datos, esc = {}) {
    const prov = datos.proveedores.find((p) => p.id === m.proveedorId);
    const aj = datos.ajustes;
    const nivelServicio = esc.nivelServicio ?? aj.nivelServicio;
    const factorDemanda = esc.demanda ?? 1;
    const aplicaRetraso = esc.retraso && (!esc.proveedor || esc.proveedor === 'todos' || esc.proveedor === prov.id);
    const retraso = aplicaRetraso ? esc.retraso : 0;

    const L = prov.leadTime + retraso;
    const H = Math.max(aj.horizonte, L + 30);
    const fc = pronosticar(m, datos.inicio, H, factorDemanda);
    const f = fc.pronostico;

    // Demanda durante el tiempo de entrega y parámetros de inventario
    const demandaLT = sum(f.slice(0, L));
    const dProm = demandaLT / L;
    const sigma = fc.sigma * factorDemanda;
    const z = normInv(nivelServicio);
    const sigmaLT = Math.sqrt(L * sigma ** 2 + dProm ** 2 * prov.ltDesv ** 2);
    const ss = z * sigmaLT;
    const rop = demandaLT + ss;

    const dAnual = mean(f.slice(0, 30)) * 365;
    const costoMantenerUnit = m.costo * aj.costoMantener;
    const eoqTeorico = Math.sqrt((2 * dAnual * prov.costoPedido) / costoMantenerUnit);
    const eoq = Math.max(m.moq, Math.ceil(eoqTeorico / m.moq) * m.moq);

    // Órdenes en tránsito
    const corte = Utils.parseISO(datos.corte);
    const ordenes = datos.ordenes.filter((o) => o.sku === m.sku && o.estado === 'En tránsito');
    const transito = sum(ordenes.map((o) => o.cantidad));
    const posicion = m.stock + transito;

    // Proyección día a día del inventario
    const llegadas = new Array(H).fill(0);
    ordenes.forEach((o) => {
      let e = Utils.diffDays(corte, Utils.parseISO(o.fechaETA)) + retraso;
      if (e < 0) e = 0;              // orden vencida: se asume que llega hoy
      if (e < H) llegadas[e] += o.cantidad;
    });
    const proyeccion = [m.stock];
    let s = m.stock, diaAgotamiento = null, diaBajoSS = null;
    for (let k = 0; k < H; k++) {
      s += llegadas[k] - f[k];
      proyeccion.push(s);
      if (diaAgotamiento === null && s <= 0) diaAgotamiento = k;
      if (diaBajoSS === null && s < ss) diaBajoSS = k;
    }

    const cobertura = dProm > 0 ? m.stock / dProm : Infinity;
    const probCorto = sigmaLT > 0 ? 1 - normCDF((posicion - demandaLT) / sigmaLT) : (posicion < demandaLT ? 1 : 0);

    // Clasificación de riesgo
    let estado;
    if (diaAgotamiento !== null && diaAgotamiento < L) estado = 'critico';
    else if (posicion <= rop) estado = 'riesgo';
    else if (cobertura > aj.diasExceso) estado = 'exceso';
    else estado = 'ok';

    // Recomendación de compra
    let sugerencia = null;
    if (estado === 'critico' && posicion > rop) {
      // Ya hay suficiente material pedido, pero llega tarde: la acción es acelerar la orden, no comprar más
      const oc = [...ordenes].sort((x, y) => x.fechaETA.localeCompare(y.fechaETA))[0];
      sugerencia = {
        cantidad: 0, costo: 0, diasLimite: 0, fechaLimite: corte, urgencia: 'Urgente', expeditar: true, ordenId: oc.id,
        accion: oc.expeditada ? `${oc.id} ya fue expeditada: considerar material sustituto o reprogramar producción` : `Expeditar ${oc.id} (ya cubre la necesidad, llega tarde)`
      };
    } else if (estado === 'critico' || estado === 'riesgo') {
      const bruto = Math.max(eoq, rop + eoq - posicion);
      const cantidad = Math.ceil(bruto / m.moq) * m.moq;
      const ref = diaBajoSS ?? diaAgotamiento ?? L;
      const diasLimite = Math.max(0, ref - L);
      let urgencia, accion;
      if (estado === 'critico') {
        urgencia = 'Urgente';
        accion = transito > 0 ? 'Expeditar OC en tránsito y colocar compra urgente' : 'Compra urgente con flete exprés';
      } else if (diasLimite <= 3) {
        urgencia = 'Alta'; accion = 'Colocar pedido esta semana';
      } else {
        urgencia = 'Media'; accion = 'Programar pedido';
      }
      sugerencia = { cantidad, costo: cantidad * m.costo, diasLimite, fechaLimite: Utils.addDays(corte, diasLimite), urgencia, accion };
    }

    const exceso = Math.max(0, m.stock - (rop + eoq)) * m.costo;
    const prioridad = { critico: 0, riesgo: 1, ok: 2, exceso: 3 }[estado];

    return {
      sku: m.sku, material: m, proveedor: prov, L, z, nivelServicio,
      dProm, sigma, sigmaLT, demandaLT, ss, rop, eoq, eoqTeorico, dAnual,
      valorAnual: dAnual * m.costo, transito, posicion, ordenes,
      proyeccion, diaAgotamiento, diaBajoSS,
      fechaAgotamiento: diaAgotamiento !== null ? Utils.addDays(corte, diaAgotamiento) : null,
      cobertura, probCorto, estado, prioridad, sugerencia,
      valorInventario: m.stock * m.costo, exceso, fc
    };
  }

  /** Clasificación ABC por valor anual de consumo (80 % / 15 % / 5 %). */
  function clasificarABC(analisis) {
    const total = sum(analisis.map((a) => a.valorAnual)) || 1;
    let acum = 0;
    [...analisis].sort((x, y) => y.valorAnual - x.valorAnual).forEach((a) => {
      acum += a.valorAnual;
      a.pctAcum = acum / total;
      a.pctValor = a.valorAnual / total;
      a.abc = a.pctAcum - a.pctValor < 0.80 ? 'A' : a.pctAcum - a.pctValor < 0.95 ? 'B' : 'C';
    });
    return analisis;
  }

  /** Analiza todo el catálogo. */
  function analizarTodo(datos, esc = {}) {
    const res = datos.materiales.map((m) => analizarMaterial(m, datos, esc));
    clasificarABC(res);
    return res.sort((a, b) => a.prioridad - b.prioridad || (a.diaAgotamiento ?? 999) - (b.diaAgotamiento ?? 999) || b.valorAnual - a.valorAnual);
  }

  /** Indicadores generales para el tablero. */
  function resumen(analisis) {
    const conteo = { critico: 0, riesgo: 0, ok: 0, exceso: 0 };
    analisis.forEach((a) => conteo[a.estado]++);
    const coberturas = analisis.map((a) => a.cobertura).filter(Number.isFinite).sort((x, y) => x - y);
    const mediana = coberturas.length ? coberturas[Math.floor(coberturas.length / 2)] : 0;
    const sugeridas = analisis.filter((a) => a.sugerencia && !a.sugerencia.expeditar);
    return {
      total: analisis.length,
      conteo,
      enRiesgo: conteo.critico + conteo.riesgo,
      valorInventario: sum(analisis.map((a) => a.valorInventario)),
      valorSS: sum(analisis.map((a) => a.ss * a.material.costo)),
      coberturaMediana: mediana,
      probCortoProm: mean(analisis.map((a) => a.probCorto)),
      compraSugerida: sum(sugeridas.map((a) => a.sugerencia.costo)),
      numSugeridas: sugeridas.length,
      capitalExceso: sum(analisis.map((a) => a.exceso)),
      mapeProm: mean(analisis.map((a) => a.fc.mape))
    };
  }

  /** Tarjeta de evaluación de proveedores. */
  function evaluarProveedores(datos, analisis) {
    const maxLT = Math.max(...datos.proveedores.map((p) => p.leadTime));
    return datos.proveedores.map((p) => {
      const propios = analisis.filter((a) => a.proveedor.id === p.id);
      const puntaje = 0.5 * p.otd + 0.3 * p.calidad + 0.2 * (1 - p.leadTime / (maxLT * 1.25));
      return {
        ...p,
        skus: propios.length,
        gastoAnual: sum(propios.map((a) => a.valorAnual)),
        enRiesgo: propios.filter((a) => a.estado === 'critico' || a.estado === 'riesgo').length,
        puntaje,
        nivel: puntaje >= 0.92 ? 'Preferente' : puntaje >= 0.84 ? 'Aprobado' : 'En observación'
      };
    }).sort((a, b) => b.puntaje - a.puntaje);
  }

  return { pronosticar, analizarMaterial, analizarTodo, resumen, evaluarProveedores, normInv, normCDF };
})();
