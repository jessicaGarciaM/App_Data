/* =========================================================
   Módulo UI: construcción de la interfaz (vistas, tablas,
   tarjetas y gráficas) a partir de los resultados del análisis
   ========================================================= */
const UI = (() => {
  'use strict';

  const U = Utils;
  const $ = (sel) => document.querySelector(sel);

  const ESTADOS = {
    critico: { texto: 'Crítico', color: '#d32f2f' },
    riesgo: { texto: 'Riesgo de corto', color: '#e08a00' },
    ok: { texto: 'Saludable', color: '#2e8b57' },
    exceso: { texto: 'Exceso', color: '#3867d6' }
  };

  const TITULOS = {
    tablero: ['Tablero de control', 'Visión general del abastecimiento y riesgo de corto de material'],
    inventario: ['Inventario y parámetros', 'Inventario de seguridad, punto de reorden y lote económico por material'],
    pronostico: ['Pronóstico y proyección', 'Demanda esperada y fecha estimada de agotamiento por material'],
    compras: ['Planeación de compras', 'Órdenes sugeridas para mantener material disponible en almacén'],
    proveedores: ['Proveedores y análisis ABC', 'Desempeño de proveedores y concentración del gasto'],
    simulador: ['Simulador de escenarios', 'Evalúa el efecto de cambios en demanda, tiempos de entrega y nivel de servicio'],
    datos: ['Datos y ajustes', 'Parámetros del modelo, importación y exportación de información']
  };

  const badge = (estado) => `<span class="badge b-${estado}">${ESTADOS[estado].texto}</span>`;
  const badgeABC = (c) => `<span class="badge b-abc abc-${c}">${c}</span>`;

  function kpi(etiqueta, valor, sub, color) {
    return `<div class="kpi" style="--accent:${color || 'var(--primary)'}">
      <div class="kpi-label">${etiqueta}</div>
      <div class="kpi-value">${valor}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>`;
  }

  function tabla(columnas, filas, opciones = {}) {
    if (!filas.length) return `<div class="empty">${opciones.vacio || 'Sin registros'}</div>`;
    const ths = columnas.map((c) => {
      const cls = [c.num ? 'num' : '', c.ordenable ? 'sortable' : ''].join(' ').trim();
      const flecha = opciones.orden && opciones.orden.col === c.clave ? `<span class="arrow">${opciones.orden.dir > 0 ? '▲' : '▼'}</span>` : '';
      return `<th class="${cls}" ${c.ordenable ? `data-sort="${c.clave}"` : ''}>${c.titulo}${flecha}</th>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${filas.join('')}</tbody></table>`;
  }

  function encabezado(vista, corte) {
    const [t, s] = TITULOS[vista];
    $('#view-title').textContent = t;
    $('#view-subtitle').textContent = s;
    $('#corte-chip').textContent = `Datos al ${U.fecha(corte)}`;
    document.title = `${t} · AbastoIQ`;
  }

  function badgeCompras(n) {
    const b = $('#badge-compras');
    b.textContent = n;
    b.classList.toggle('zero', n === 0);
  }

  function mostrarToast(texto, error = false) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.toggle('error', error);
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------------- Tablero ---------------- */
  function tablero(analisis, res, datos) {
    $('#kpis').innerHTML = [
      kpi('Materiales monitoreados', U.num(res.total), `${datos.proveedores.length} proveedores`),
      kpi('En riesgo de corto', U.num(res.enRiesgo), `${res.conteo.critico} críticos · ${res.conteo.riesgo} en riesgo`, 'var(--critico)'),
      kpi('Valor del inventario', U.dineroCorto(res.valorInventario), `Capital en exceso: ${U.dineroCorto(res.capitalExceso)}`, 'var(--exceso)'),
      kpi('Cobertura mediana', `${U.dec(res.coberturaMediana)} días`, 'Días de consumo que cubre el stock'),
      kpi('Prob. promedio de corto', U.pct(res.probCortoProm), `Objetivo de servicio ${U.pct(datos.ajustes.nivelServicio)}`, 'var(--riesgo)'),
      kpi('Compra sugerida', U.dineroCorto(res.compraSugerida), `${res.numSugeridas} órdenes recomendadas`, 'var(--ok)')
    ].join('');

    const segmentos = Object.keys(ESTADOS).map((k) => ({ etiqueta: ESTADOS[k].texto, valor: res.conteo[k], color: ESTADOS[k].color }));
    Charts.dona($('#chart-estado'), segmentos, String(res.total), 'materiales');
    $('#legend-estado').innerHTML = segmentos.map((s) =>
      `<li><i style="background:${s.color}"></i><span>${s.etiqueta}</span><b>${s.valor}</b></li>`).join('');

    const proximos = analisis.filter((a) => a.fechaAgotamiento).sort((a, b) => a.diaAgotamiento - b.diaAgotamiento).slice(0, 10);
    $('#timeline').innerHTML = proximos.length ? proximos.map((a) => `
      <div class="tl-item ${a.estado}">
        <div class="tl-date">${a.fechaAgotamiento.getDate()}<small>${a.fechaAgotamiento.toLocaleDateString('es-MX', { month: 'short' })}</small></div>
        <div><strong>${a.sku}</strong> · ${U.escapeHTML(a.material.descripcion)}
          <span class="sub muted small">${a.diaAgotamiento === 0 ? 'Hoy' : a.diaAgotamiento === 1 ? 'En 1 día' : `En ${a.diaAgotamiento} días`} · tiempo de entrega ${a.L} días</span></div>
        ${badge(a.estado)}
      </div>`).join('') : '<div class="empty">Ningún material se agota dentro del horizonte de proyección.</div>';

    const alertas = analisis.filter((a) => a.estado === 'critico' || a.estado === 'riesgo');
    $('#tabla-alertas').innerHTML = tabla([
      { titulo: 'Material' }, { titulo: 'Estado' }, { titulo: 'Existencia', num: true }, { titulo: 'Cobertura', num: true },
      { titulo: 'Prob. corto', num: true }, { titulo: 'Agotamiento' }, { titulo: 'Acción recomendada' }
    ], alertas.map((a) => `
      <tr class="clickable" data-sku="${a.sku}">
        <td><strong>${a.sku}</strong><span class="sub">${U.escapeHTML(a.material.descripcion)}</span></td>
        <td>${badge(a.estado)}</td>
        <td class="num">${U.num(a.material.stock)} ${a.material.unidad}</td>
        <td class="num">${U.dec(a.cobertura)} d</td>
        <td class="num">${U.pct(a.probCorto, 0)}</td>
        <td>${a.fechaAgotamiento ? U.fecha(a.fechaAgotamiento) : '—'}</td>
        <td>${a.sugerencia ? U.escapeHTML(a.sugerencia.accion) : '—'}</td>
      </tr>`), { vacio: 'Sin alertas: todos los materiales tienen cobertura suficiente.' });

    const ev = datos.eventos.slice(0, 30);
    $('#eventos').innerHTML = ev.length
      ? `<div class="events">${ev.map((e) => `<div class="event"><time>${U.fecha(U.parseISO(e.fecha))}</time>${e.tipo === 'corto' ? badge('critico') : e.tipo === 'retraso' ? badge('riesgo') : '<span class="badge b-neutral">Info</span>'}<span>${U.escapeHTML(e.texto)}</span></div>`).join('')}</div>`
      : '<div class="empty">Aún no hay eventos. Usa “Simular día de producción” para ver consumos, recepciones, retrasos y posibles cortos.</div>';
  }

  /* ---------------- Inventario ---------------- */
  function llenarCategorias(datos) {
    const cats = [...new Set(datos.materiales.map((m) => m.categoria))].sort();
    $('#f-categoria').innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option>${U.escapeHTML(c)}</option>`).join('');
  }

  function inventario(analisis, filtros) {
    const texto = filtros.texto.toLowerCase();
    let lista = analisis.filter((a) =>
      (!texto || a.sku.toLowerCase().includes(texto) || a.material.descripcion.toLowerCase().includes(texto)) &&
      (!filtros.categoria || a.material.categoria === filtros.categoria) &&
      (!filtros.estado || a.estado === filtros.estado));

    const claves = {
      sku: (a) => a.sku, estado: (a) => a.prioridad, stock: (a) => a.material.stock, transito: (a) => a.transito,
      dProm: (a) => a.dProm, ss: (a) => a.ss, rop: (a) => a.rop, eoq: (a) => a.eoq,
      cobertura: (a) => (Number.isFinite(a.cobertura) ? a.cobertura : 1e9), abc: (a) => a.abc, valor: (a) => a.valorInventario
    };
    if (filtros.orden.col && claves[filtros.orden.col]) {
      const f = claves[filtros.orden.col];
      lista = [...lista].sort((x, y) => (f(x) > f(y) ? 1 : f(x) < f(y) ? -1 : 0) * filtros.orden.dir);
    }
    $('#inv-contador').textContent = `${lista.length} de ${analisis.length} materiales`;

    const maxCob = 60;
    $('#tabla-inventario').innerHTML = tabla([
      { titulo: 'SKU / Material', clave: 'sku', ordenable: true }, { titulo: 'ABC', clave: 'abc', ordenable: true },
      { titulo: 'Estado', clave: 'estado', ordenable: true }, { titulo: 'Existencia', clave: 'stock', num: true, ordenable: true },
      { titulo: 'Tránsito', clave: 'transito', num: true, ordenable: true }, { titulo: 'Consumo/día', clave: 'dProm', num: true, ordenable: true },
      { titulo: 'SS', clave: 'ss', num: true, ordenable: true }, { titulo: 'ROP', clave: 'rop', num: true, ordenable: true },
      { titulo: 'EOQ', clave: 'eoq', num: true, ordenable: true }, { titulo: 'Cobertura', clave: 'cobertura', ordenable: true },
      { titulo: 'Valor', clave: 'valor', num: true, ordenable: true }
    ], lista.map((a) => {
      const cob = Number.isFinite(a.cobertura) ? a.cobertura : maxCob;
      const ancho = Math.min(100, (cob / maxCob) * 100);
      return `<tr class="clickable" data-sku="${a.sku}">
        <td><strong>${a.sku}</strong><span class="sub">${U.escapeHTML(a.material.descripcion)} · ${a.material.categoria}</span></td>
        <td>${badgeABC(a.abc)}</td>
        <td>${badge(a.estado)}</td>
        <td class="num">${U.num(a.material.stock)}<span class="sub">${a.material.unidad}</span></td>
        <td class="num">${a.transito ? U.num(a.transito) : '—'}</td>
        <td class="num">${U.num(a.dProm)}</td>
        <td class="num">${U.num(a.ss)}</td>
        <td class="num">${U.num(a.rop)}</td>
        <td class="num">${U.num(a.eoq)}</td>
        <td><div class="bar" title="${U.dec(a.cobertura)} días"><i style="width:${ancho}%;background:${ESTADOS[a.estado].color}"></i></div><span class="sub">${U.dec(a.cobertura)} días</span></td>
        <td class="num">${U.dineroCorto(a.valorInventario)}</td>
      </tr>`;
    }), { orden: filtros.orden, vacio: 'Ningún material coincide con los filtros.' });
  }

  /* ---------------- Pronóstico ---------------- */
  function llenarSelectorSKU(analisis, seleccionado) {
    const ordenados = [...analisis].sort((a, b) => a.sku.localeCompare(b.sku));
    $('#sel-sku').innerHTML = ordenados.map((a) =>
      `<option value="${a.sku}" ${a.sku === seleccionado ? 'selected' : ''}>${a.sku} · ${U.escapeHTML(a.material.descripcion)}</option>`).join('');
  }

  function pronostico(a, datos) {
    const m = a.material;
    $('#pron-estado').innerHTML = `${badge(a.estado)} ${badgeABC(a.abc)}`;
    const stat = (t, v) => `<div class="stat"><span>${t}</span><b>${v}</b></div>`;
    $('#pron-stats').innerHTML = [
      stat('Existencia', `${U.num(m.stock)} ${m.unidad}`),
      stat('En tránsito', `${U.num(a.transito)} ${m.unidad}`),
      stat('Consumo pronosticado', `${U.num(a.dProm)} /día`),
      stat('Error del pronóstico (WAPE)', U.pct(a.fc.mape)),
      stat('Tiempo de entrega', `${a.L} ± ${a.proveedor.ltDesv} días`),
      stat(`Inventario de seguridad (z = ${a.z.toFixed(2)})`, U.num(a.ss)),
      stat('Punto de reorden', U.num(a.rop)),
      stat('Lote económico (EOQ)', U.num(a.eoq)),
      stat('Probabilidad de corto', U.pct(a.probCorto)),
      stat('Agotamiento estimado', a.fechaAgotamiento ? U.fecha(a.fechaAgotamiento) : 'Fuera del horizonte')
    ].join('');

    // --- Gráfica de demanda: últimos 60 días + pronóstico 30 días
    const corte = U.parseISO(datos.corte);
    const histDias = 60, pronDias = 30;
    const hist = a.fc.historia.slice(-histDias);
    const ajus = a.fc.ajustado.slice(-histDias);
    const pron = a.fc.pronostico.slice(0, pronDias);
    const n = histDias + pronDias;
    const fechas = Array.from({ length: n }, (_, i) => U.addDays(corte, i - histDias));
    const z95 = 1.96;
    Charts.lineas($('#chart-demanda'), {
      alto: 280,
      etiquetas: fechas.map(U.fechaCorta),
      etiquetasLargas: fechas.map(U.fecha),
      zona: { desde: histDias, color: 'rgba(14,124,134,.05)' },
      banda: {
        sup: fechas.map((_, i) => (i >= histDias ? pron[i - histDias] + z95 * a.sigma : null)),
        inf: fechas.map((_, i) => (i >= histDias ? Math.max(0, pron[i - histDias] - z95 * a.sigma) : null)),
        color: 'rgba(14,124,134,.14)'
      },
      series: [
        { nombre: 'Consumo real', datos: [...hist, ...new Array(pronDias).fill(null)], color: '#334155', ancho: 1.6 },
        { nombre: 'Modelo ajustado', datos: [...ajus, ...new Array(pronDias).fill(null)], color: '#94a3b8', ancho: 1.2, punteada: true },
        { nombre: 'Pronóstico', datos: [...new Array(histDias - 1).fill(null), hist[hist.length - 1], ...pron], color: '#0e7c86', ancho: 2.4 }
      ],
      marcaX: { indice: histDias, etiqueta: 'Hoy' }
    });

    // --- Gráfica de proyección de inventario
    const H = datos.ajustes.horizonte;
    const proy = a.proyeccion.slice(0, H + 1);
    const fechasP = proy.map((_, i) => U.addDays(corte, i));
    Charts.lineas($('#chart-proyeccion'), {
      alto: 260,
      etiquetas: fechasP.map(U.fechaCorta),
      etiquetasLargas: fechasP.map(U.fecha),
      series: [{ nombre: 'Inventario proyectado', datos: proy, color: ESTADOS[a.estado].color, ancho: 2.4, relleno: 'rgba(14,124,134,.07)' }],
      lineasH: [
        { valor: a.rop, etiqueta: `ROP ${U.num(a.rop)}`, color: '#e08a00' },
        { valor: a.ss, etiqueta: `SS ${U.num(a.ss)}`, color: '#d32f2f' }
      ],
      marcaX: a.L <= H ? { indice: a.L, etiqueta: `Llegaría un pedido de hoy (${a.L} d)` } : null
    });

    // --- Interpretación automática
    let clase = '', msg;
    const llegadas = a.ordenes.map((o) => `${o.id} (${U.num(o.cantidad)} ${m.unidad}, ETA ${U.fecha(U.parseISO(o.fechaETA))})`).join(', ');
    if (a.estado === 'critico') {
      clase = 'alert';
      msg = `<b>Riesgo de paro de línea.</b> Con el consumo pronosticado, ${m.sku} se agota el <b>${U.fecha(a.fechaAgotamiento)}</b> (en ${a.diaAgotamiento} días), antes de que llegue un pedido normal (${a.L} días). ${llegadas ? `Hay órdenes en tránsito: ${llegadas}; conviene expeditarlas.` : 'No hay órdenes en tránsito.'} Se recomienda comprar <b>${U.num(a.sugerencia.cantidad)} ${m.unidad}</b> con flete exprés.`;
    } else if (a.estado === 'riesgo') {
      clase = 'warn';
      msg = `La posición de inventario (${U.num(a.posicion)}) está por debajo del punto de reorden (${U.num(a.rop)}). Coloca un pedido de <b>${U.num(a.sugerencia.cantidad)} ${m.unidad}</b> a más tardar el <b>${U.fecha(a.sugerencia.fechaLimite)}</b> para no consumir el inventario de seguridad.`;
    } else if (a.estado === 'exceso') {
      msg = `El inventario cubre ${U.dec(a.cobertura)} días de consumo, por encima del límite de ${datos.ajustes.diasExceso}. Hay ${U.dinero(a.exceso)} de capital inmovilizado; se sugiere no reabastecer y revisar el tamaño de lote.`;
    } else {
      msg = `Abastecimiento saludable: la posición (${U.num(a.posicion)}) supera el punto de reorden (${U.num(a.rop)}). ${a.diaBajoSS !== null ? `Al ritmo actual se alcanzaría el ROP en unos días; el sistema lo marcará a tiempo.` : 'No se espera consumir el inventario de seguridad en el horizonte.'}`;
    }
    const el = $('#pron-insight');
    el.className = `insight ${clase}`;
    el.innerHTML = msg;
  }

  /* ---------------- Compras ---------------- */
  function compras(analisis, datos, seleccion) {
    const sug = analisis.filter((a) => a.sugerencia);
    const compra = sug.filter((a) => !a.sugerencia.expeditar);
    const abiertas = datos.ordenes.filter((o) => o.estado === 'En tránsito');
    const totalSug = U.sum(compra.map((a) => (seleccion[a.sku]?.cantidad ?? a.sugerencia.cantidad) * a.material.costo));
    const urgentes = sug.filter((a) => a.sugerencia.urgencia === 'Urgente').length;
    $('#compras-kpis').innerHTML = [
      kpi('Acciones sugeridas', U.num(sug.length), `${compra.length} compras · ${sug.length - compra.length} por expeditar · ${urgentes} urgentes`, 'var(--critico)'),
      kpi('Monto sugerido', U.dinero(totalSug), 'Antes de impuestos', 'var(--primary)'),
      kpi('Órdenes en tránsito', U.num(abiertas.length), U.dinero(U.sum(abiertas.map((o) => o.cantidad * datos.materiales.find((m) => m.sku === o.sku).costo))), 'var(--exceso)')
    ].join('');

    const grupos = {};
    sug.forEach((a) => { (grupos[a.proveedor.id] = grupos[a.proveedor.id] || []).push(a); });
    const orden = { Urgente: 0, Alta: 1, Media: 2 };
    $('#sugerencias').innerHTML = sug.length ? Object.values(grupos).map((lista) => {
      const p = lista[0].proveedor;
      lista.sort((x, y) => orden[x.sugerencia.urgencia] - orden[y.sugerencia.urgencia]);
      const subtotal = U.sum(lista.filter((a) => !a.sugerencia.expeditar).map((a) => (seleccion[a.sku]?.cantidad ?? a.sugerencia.cantidad) * a.material.costo));
      return `<div class="supplier-group">
        <div class="supplier-head">
          <div><strong>${U.escapeHTML(p.nombre)}</strong> <span class="muted small">· ${p.pais} · entrega ${p.leadTime} días · costo de pedido ${U.dinero(p.costoPedido)}</span></div>
          <span class="small">Subtotal: <b>${U.dinero(subtotal)}</b></span>
        </div>
        <table><thead><tr><th></th><th>Material</th><th>Urgencia</th><th class="num">Posición</th><th class="num">ROP</th><th class="num">Cantidad</th><th class="num">Importe</th><th>Pedir antes de</th><th>Acción</th></tr></thead>
        <tbody>${lista.map((a) => {
          if (a.sugerencia.expeditar) {
            return `<tr>
            <td></td>
            <td><strong>${a.sku}</strong><span class="sub">${U.escapeHTML(a.material.descripcion)}</span></td>
            <td><span class="badge b-critico">Urgente</span></td>
            <td class="num">${U.num(a.posicion)}</td>
            <td class="num">${U.num(a.rop)}</td>
            <td class="num" colspan="2"><span class="sub">No requiere compra adicional</span></td>
            <td><b>Hoy</b></td>
            <td class="small">${U.escapeHTML(a.sugerencia.accion)}
              ${a.ordenes.some((o) => o.id === a.sugerencia.ordenId && !o.expeditada) ? `<br><button class="btn btn-ghost btn-sm" data-expeditar="${a.sugerencia.ordenId}">Expeditar ${a.sugerencia.ordenId}</button>` : ''}</td>
          </tr>`;
          }
          const sel = seleccion[a.sku] || { marcado: true, cantidad: a.sugerencia.cantidad };
          const cls = a.sugerencia.urgencia === 'Urgente' ? 'critico' : a.sugerencia.urgencia === 'Alta' ? 'riesgo' : 'neutral';
          return `<tr>
            <td><input type="checkbox" data-check="${a.sku}" ${sel.marcado ? 'checked' : ''} aria-label="Seleccionar ${a.sku}"></td>
            <td><strong>${a.sku}</strong><span class="sub">${U.escapeHTML(a.material.descripcion)}</span></td>
            <td><span class="badge b-${cls}">${a.sugerencia.urgencia}</span></td>
            <td class="num">${U.num(a.posicion)}</td>
            <td class="num">${U.num(a.rop)}</td>
            <td class="num"><input class="input input-qty" type="number" min="${a.material.moq}" step="${a.material.moq}" value="${sel.cantidad}" data-qty="${a.sku}" aria-label="Cantidad ${a.sku}"><span class="sub">${a.material.unidad} · MOQ ${U.num(a.material.moq)}</span></td>
            <td class="num">${U.dinero(sel.cantidad * a.material.costo)}</td>
            <td>${a.sugerencia.diasLimite === 0 ? '<b>Hoy</b>' : U.fecha(a.sugerencia.fechaLimite)}</td>
            <td class="small">${U.escapeHTML(a.sugerencia.accion)}</td>
          </tr>`;
        }).join('')}</tbody></table>
      </div>`;
    }).join('') : '<div class="empty">No hay compras pendientes: todas las posiciones de inventario están por encima del punto de reorden.</div>';

    const corte = U.parseISO(datos.corte);
    $('#oc-total').textContent = `${abiertas.length} órdenes abiertas`;
    $('#tabla-ordenes').innerHTML = tabla([
      { titulo: 'Orden' }, { titulo: 'Material' }, { titulo: 'Proveedor' }, { titulo: 'Cantidad', num: true },
      { titulo: 'Importe', num: true }, { titulo: 'Emisión' }, { titulo: 'Llegada estimada' }, { titulo: '' }
    ], abiertas.sort((a, b) => a.fechaETA.localeCompare(b.fechaETA)).map((o) => {
      const m = datos.materiales.find((x) => x.sku === o.sku);
      const p = datos.proveedores.find((x) => x.id === o.proveedorId);
      const dias = U.diffDays(corte, U.parseISO(o.fechaETA));
      const eta = dias < 0 ? `<span class="badge b-critico">Vencida ${-dias} d</span>` : dias === 0 ? '<span class="badge b-riesgo">Hoy</span>' : dias === 1 ? "en 1 día" : `en ${dias} días`;
      return `<tr>
        <td class="mono">${o.id}</td>
        <td><strong>${o.sku}</strong><span class="sub">${U.escapeHTML(m.descripcion)}</span></td>
        <td>${U.escapeHTML(p.nombre)}</td>
        <td class="num">${U.num(o.cantidad)} ${m.unidad}</td>
        <td class="num">${U.dinero(o.cantidad * m.costo)}</td>
        <td>${U.fecha(U.parseISO(o.fechaEmision))}</td>
        <td>${U.fecha(U.parseISO(o.fechaETA))}<span class="sub">${eta}</span></td>
        <td><div class="btn-row"><button class="btn btn-ghost btn-sm" data-recibir="${o.id}">Recibir</button>${o.expeditada ? '<span class="badge b-riesgo">Expeditada</span>' : `<button class="btn btn-ghost btn-sm" data-expeditar="${o.id}">Expeditar</button>`}<button class="btn-link small" data-cancelar="${o.id}">Cancelar</button></div></td>
      </tr>`;
    }), { vacio: 'No hay órdenes en tránsito.' });
  }

  /* ---------------- Proveedores y ABC ---------------- */
  function proveedores(analisis, evaluacion) {
    $('#tabla-proveedores').innerHTML = tabla([
      { titulo: 'Proveedor' }, { titulo: 'País' }, { titulo: 'Entrega', num: true }, { titulo: 'A tiempo (OTD)', num: true },
      { titulo: 'Calidad', num: true }, { titulo: 'SKU', num: true }, { titulo: 'Gasto anual', num: true },
      { titulo: 'En riesgo', num: true }, { titulo: 'Puntaje' }, { titulo: 'Clasificación' }
    ], evaluacion.map((p) => {
      const cls = p.nivel === 'Preferente' ? 'ok' : p.nivel === 'Aprobado' ? 'exceso' : 'riesgo';
      return `<tr>
        <td><strong>${U.escapeHTML(p.nombre)}</strong><span class="sub">${p.id}</span></td>
        <td>${p.pais}</td>
        <td class="num">${p.leadTime} ± ${p.ltDesv} d</td>
        <td class="num">${U.pct(p.otd, 0)}</td>
        <td class="num">${U.pct(p.calidad)}</td>
        <td class="num">${p.skus}</td>
        <td class="num">${U.dineroCorto(p.gastoAnual)}</td>
        <td class="num">${p.enRiesgo ? `<b style="color:var(--critico)">${p.enRiesgo}</b>` : '0'}</td>
        <td><div class="bar"><i style="width:${(p.puntaje * 100).toFixed(0)}%;background:var(--primary)"></i></div><span class="sub">${(p.puntaje * 100).toFixed(1)} / 100</span></td>
        <td><span class="badge b-${cls}">${p.nivel}</span></td>
      </tr>`;
    }));

    const orden = [...analisis].sort((a, b) => b.valorAnual - a.valorAnual);
    Charts.pareto($('#chart-pareto'), orden.map((a) => ({ etiqueta: a.sku, valor: a.valorAnual, acum: a.pctAcum, clase: a.abc })));

    const total = U.sum(orden.map((a) => a.valorAnual));
    const politica = { A: 'Revisión semanal, pronóstico detallado y proveedores alternos', B: 'Revisión quincenal con punto de reorden', C: 'Pedidos consolidados y lotes grandes' };
    $('#abc-resumen').innerHTML = ['A', 'B', 'C'].map((c) => {
      const items = orden.filter((a) => a.abc === c);
      const valor = U.sum(items.map((a) => a.valorAnual));
      return `<div class="stat" style="margin-bottom:10px">
        <span>${badgeABC(c)} ${items.length} materiales · ${U.pct(valor / total, 0)} del valor</span>
        <b>${U.dineroCorto(valor)} / año</b>
        <span>${politica[c]}</span>
      </div>`;
    }).join('');
  }

  /* ---------------- Simulador ---------------- */
  function simulador(base, esc, resBase, resEsc, valores) {
    $('#o-ns').textContent = `${valores.ns.toFixed(1)} %`;
    $('#o-dem').textContent = `${valores.dem > 0 ? '+' : ''}${valores.dem} %`;
    $('#o-ret').textContent = `${valores.ret} días`;

    const fila = (t, b, e, fmt, mejorSiBaja = true) => {
      const d = e - b;
      const cls = Math.abs(d) < 1e-9 ? 'delta-eq' : (d > 0) === mejorSiBaja ? 'delta-up' : 'delta-down';
      const signo = d > 0 ? '+' : '';
      return `<tr><td>${t}</td><td class="num">${fmt(b)}</td><td class="num">${fmt(e)}</td><td class="num ${cls}">${Math.abs(d) < 1e-9 ? '=' : signo + fmt(d)}</td></tr>`;
    };
    $('#sim-comparacion').innerHTML = `<div class="table-wrap"><table class="compare">
      <thead><tr><th>Indicador</th><th class="num">Actual</th><th class="num">Escenario</th><th class="num">Diferencia</th></tr></thead>
      <tbody>
        ${fila('Materiales críticos', resBase.conteo.critico, resEsc.conteo.critico, U.num)}
        ${fila('Materiales en riesgo', resBase.conteo.riesgo, resEsc.conteo.riesgo, U.num)}
        ${fila('Probabilidad promedio de corto', resBase.probCortoProm, resEsc.probCortoProm, (v) => U.pct(v))}
        ${fila('Inversión en inventario de seguridad', resBase.valorSS, resEsc.valorSS, U.dineroCorto)}
        ${fila('Compra requerida', resBase.compraSugerida, resEsc.compraSugerida, U.dineroCorto)}
        ${fila('Órdenes sugeridas', resBase.numSugeridas, resEsc.numSugeridas, U.num)}
      </tbody></table></div>
      <p class="muted small note">Rojo = empeora el abastecimiento o aumenta el costo; verde = mejora.</p>`;

    const mapaBase = Object.fromEntries(base.map((a) => [a.sku, a]));
    const cambios = esc.filter((a) => a.estado !== mapaBase[a.sku].estado);
    $('#sim-cambios').innerHTML = tabla([
      { titulo: 'Material' }, { titulo: 'Estado actual' }, { titulo: 'Estado en escenario' },
      { titulo: 'SS actual', num: true }, { titulo: 'SS escenario', num: true }, { titulo: 'Agotamiento en escenario' }
    ], cambios.map((a) => {
      const b = mapaBase[a.sku];
      return `<tr><td><strong>${a.sku}</strong><span class="sub">${U.escapeHTML(a.material.descripcion)}</span></td>
        <td>${badge(b.estado)}</td><td>${badge(a.estado)}</td>
        <td class="num">${U.num(b.ss)}</td><td class="num">${U.num(a.ss)}</td>
        <td>${a.fechaAgotamiento ? U.fecha(a.fechaAgotamiento) : '—'}</td></tr>`;
    }), { vacio: 'Con este escenario ningún material cambia de estado.' });
  }

  /* ---------------- Datos ---------------- */
  function ajustes(datos) {
    $('#a-ns').value = (datos.ajustes.nivelServicio * 100).toFixed(1);
    $('#a-cm').value = Math.round(datos.ajustes.costoMantener * 100);
    $('#a-hz').value = datos.ajustes.horizonte;
    $('#a-ex').value = datos.ajustes.diasExceso;
  }

  return {
    ESTADOS, encabezado, badgeCompras, mostrarToast, tablero, llenarCategorias, inventario,
    llenarSelectorSKU, pronostico, compras, proveedores, simulador, ajustes
  };
})();
