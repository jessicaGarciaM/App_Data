/* =========================================================
   Módulo App: controlador principal. Maneja el estado, la
   navegación entre vistas y los eventos del usuario.
   ========================================================= */
const App = (() => {
  'use strict';

  const U = Utils;
  const $ = (sel) => document.querySelector(sel);

  // ----- Estado de la aplicación -----
  const estado = {
    datos: null,
    analisis: [],
    resumen: null,
    vista: 'tablero',
    skuSeleccionado: null,
    seleccionCompras: {},
    filtros: { texto: '', categoria: '', estado: '', orden: { col: null, dir: 1 } },
    escenario: { ns: 95, dem: 0, ret: 0, prov: 'todos' }
  };

  /** Recalcula todos los indicadores a partir de los datos. */
  function recalcular() {
    estado.analisis = Analytics.analizarTodo(estado.datos);
    estado.resumen = Analytics.resumen(estado.analisis);
    if (!estado.skuSeleccionado) estado.skuSeleccionado = estado.analisis[0].sku;
    UI.badgeCompras(estado.analisis.filter((a) => a.sugerencia).length);
  }

  function guardarYRecalcular() {
    DataModule.guardar(estado.datos);
    recalcular();
    render();
  }

  /** Dibuja únicamente la vista activa (flujo de control por vista). */
  function render() {
    const { datos, analisis, resumen, vista } = estado;
    UI.encabezado(vista, U.parseISO(datos.corte));
    switch (vista) {
      case 'tablero':
        UI.tablero(analisis, resumen, datos);
        break;
      case 'inventario':
        UI.inventario(analisis, estado.filtros);
        break;
      case 'pronostico': {
        UI.llenarSelectorSKU(analisis, estado.skuSeleccionado);
        const a = analisis.find((x) => x.sku === estado.skuSeleccionado);
        UI.pronostico(a, datos);
        break;
      }
      case 'compras':
        UI.compras(analisis, datos, estado.seleccionCompras);
        break;
      case 'proveedores':
        UI.proveedores(analisis, Analytics.evaluarProveedores(datos, analisis));
        break;
      case 'simulador':
        renderSimulador();
        break;
      case 'datos':
        UI.ajustes(datos);
        break;
      default:
        console.warn('Vista desconocida:', vista);
    }
  }

  function renderSimulador() {
    const e = estado.escenario;
    const esc = { nivelServicio: e.ns / 100, demanda: 1 + e.dem / 100, retraso: e.ret, proveedor: e.prov };
    const resultado = Analytics.analizarTodo(estado.datos, esc);
    UI.simulador(estado.analisis, resultado, estado.resumen, Analytics.resumen(resultado), e);
  }

  function irA(vista) {
    estado.vista = vista;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === vista));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${vista}`));
    window.scrollTo({ top: 0 });
    render();
  }

  function verMaterial(sku) {
    estado.skuSeleccionado = sku;
    irA('pronostico');
  }

  /* ---------- Compras ---------- */
  function seleccionDe(sku) {
    const a = estado.analisis.find((x) => x.sku === sku);
    if (!estado.seleccionCompras[sku]) estado.seleccionCompras[sku] = { marcado: true, cantidad: a.sugerencia.cantidad };
    return estado.seleccionCompras[sku];
  }

  function generarOrdenes() {
    const sugeridas = estado.analisis.filter((a) => a.sugerencia && !a.sugerencia.expeditar);
    const elegidas = sugeridas.filter((a) => (estado.seleccionCompras[a.sku]?.marcado ?? true));
    if (!elegidas.length) {
      UI.mostrarToast('Selecciona al menos un material para generar órdenes.', true);
      return;
    }
    let total = 0;
    const creadas = elegidas.map((a) => {
      const cant = estado.seleccionCompras[a.sku]?.cantidad ?? a.sugerencia.cantidad;
      total += cant * a.material.costo;
      const o = DataModule.crearOrden(estado.datos, a.sku, cant);
      DataModule.registrarEvento(estado.datos, 'info', `Se emitió ${o.id} por ${U.num(cant)} ${a.material.unidad} de ${a.sku} a ${a.proveedor.nombre}`);
      return o;
    });
    estado.seleccionCompras = {};
    guardarYRecalcular();
    UI.mostrarToast(`Se generaron ${creadas.length} órdenes de compra por ${U.dinero(total)}.`);
  }

  function exportarSugerencias() {
    const filas = [['Proveedor', 'SKU', 'Descripción', 'Urgencia', 'Cantidad', 'Unidad', 'Costo unitario', 'Importe', 'Pedir antes de', 'Acción']];
    estado.analisis.filter((a) => a.sugerencia && !a.sugerencia.expeditar).forEach((a) => {
      const cant = estado.seleccionCompras[a.sku]?.cantidad ?? a.sugerencia.cantidad;
      filas.push([a.proveedor.nombre, a.sku, a.material.descripcion, a.sugerencia.urgencia, cant, a.material.unidad,
        a.material.costo, (cant * a.material.costo).toFixed(2), U.toISO(a.sugerencia.fechaLimite), a.sugerencia.accion]);
    });
    U.descargar(`compras_sugeridas_${estado.datos.corte}.csv`, U.toCSV(filas));
  }

  /* ---------- Simulación de un día de producción ---------- */
  function simularDia() {
    const d = estado.datos;
    const corte = U.parseISO(d.corte);
    let recibidas = 0, retrasos = 0, cortos = 0;

    // 1) Recepción de órdenes que llegan hoy (con probabilidad de retraso según el OTD del proveedor)
    d.ordenes.filter((o) => o.estado === 'En tránsito').forEach((o) => {
      if (U.diffDays(corte, U.parseISO(o.fechaETA)) > 0) return;
      const p = d.proveedores.find((x) => x.id === o.proveedorId);
      if (!o.retrasada && Math.random() > p.otd) {
        const dias = 1 + Math.floor(Math.random() * 3);
        o.fechaETA = U.toISO(U.addDays(corte, dias));
        o.retrasada = true;
        retrasos++;
        DataModule.registrarEvento(d, 'retraso', `${o.id} (${o.sku}) de ${p.nombre} se retrasa ${dias} día(s).`);
      } else {
        const m = d.materiales.find((x) => x.sku === o.sku);
        DataModule.recibirOrden(d, o.id);
        recibidas++;
        DataModule.registrarEvento(d, 'recepcion', `Se recibió ${o.id}: ${U.num(o.cantidad)} ${m.unidad} de ${o.sku}.`);
      }
    });

    // 2) Consumo de producción: demanda pronosticada + variación aleatoria
    d.materiales.forEach((m) => {
      const fc = Analytics.pronosticar(m, d.inicio, 1);
      const demanda = Math.max(0, Math.round(fc.pronostico[0] + fc.sigma * DataModule.normal(Math.random)));
      if (demanda > m.stock) {
        cortos++;
        DataModule.registrarEvento(d, 'corto', `Corto de ${m.sku}: faltaron ${U.num(demanda - m.stock)} ${m.unidad}. Riesgo de paro de línea.`);
      }
      m.stock -= Math.min(m.stock, demanda);
      m.historial.push(demanda);
    });

    // 3) Avanzar la fecha de corte
    d.corte = U.toISO(U.addDays(corte, 1));
    estado.seleccionCompras = {};
    guardarYRecalcular();
    UI.mostrarToast(`Día ${U.fecha(corte)} simulado · ${recibidas} recepciones · ${retrasos} retrasos · ${cortos} cortos`, cortos > 0);
  }

  /* ---------- Importar / exportar ---------- */
  function exportarInventario() {
    const filas = [['SKU', 'Descripción', 'Categoría', 'ABC', 'Estado', 'Existencia', 'En tránsito', 'Consumo diario', 'Inventario seguridad', 'Punto reorden', 'EOQ', 'Cobertura días', 'Prob. corto', 'Fecha agotamiento', 'Proveedor']];
    estado.analisis.forEach((a) => filas.push([
      a.sku, a.material.descripcion, a.material.categoria, a.abc, UI.ESTADOS[a.estado].texto, a.material.stock, a.transito,
      a.dProm.toFixed(1), Math.round(a.ss), Math.round(a.rop), a.eoq,
      Number.isFinite(a.cobertura) ? a.cobertura.toFixed(1) : '', (a.probCorto * 100).toFixed(1) + '%',
      a.fechaAgotamiento ? U.toISO(a.fechaAgotamiento) : '', a.proveedor.nombre
    ]));
    U.descargar(`analisis_inventario_${estado.datos.corte}.csv`, U.toCSV(filas));
  }

  function descargarPlantilla() {
    const filas = [['sku', 'stock'], ...estado.datos.materiales.map((m) => [m.sku, m.stock])];
    U.descargar('plantilla_existencias.csv', U.toCSV(filas));
  }

  function importarCSV(archivo) {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const filas = U.parseCSV(String(lector.result));
        if (!filas.length) throw new Error('El archivo está vacío.');
        const enc = filas[0].map((c) => c.toLowerCase());
        const iSku = enc.indexOf('sku'), iStock = enc.indexOf('stock');
        if (iSku < 0 || iStock < 0) throw new Error('El CSV debe tener las columnas "sku" y "stock".');
        let actualizados = 0;
        const errores = [];
        filas.slice(1).forEach((f, n) => {
          const m = estado.datos.materiales.find((x) => x.sku === f[iSku]);
          const valor = Number(String(f[iStock]).replace(/[^\d.-]/g, ''));
          if (!m) errores.push(`fila ${n + 2}: SKU ${f[iSku]} no existe`);
          else if (!Number.isFinite(valor) || valor < 0) errores.push(`fila ${n + 2}: existencia inválida`);
          else { m.stock = Math.round(valor); actualizados++; }
        });
        DataModule.registrarEvento(estado.datos, 'info', `Importación CSV: ${actualizados} existencias actualizadas.`);
        guardarYRecalcular();
        UI.mostrarToast(`${actualizados} existencias actualizadas${errores.length ? ` · ${errores.length} filas con error` : ''}.`, errores.length > 0);
        if (errores.length) console.warn('Errores de importación:', errores);
      } catch (err) {
        UI.mostrarToast(err.message, true);
      }
    };
    lector.readAsText(archivo, 'utf-8');
  }

  function guardarAjustes(ev) {
    ev.preventDefault();
    const ns = Number($('#a-ns').value) / 100;
    const cm = Number($('#a-cm').value) / 100;
    const hz = Math.round(Number($('#a-hz').value));
    const ex = Math.round(Number($('#a-ex').value));
    if (!(ns >= 0.5 && ns < 1) || !(cm > 0 && cm <= 0.8) || !(hz >= 30 && hz <= 120) || !(ex >= 20)) {
      UI.mostrarToast('Revisa los parámetros: hay valores fuera de rango.', true);
      return;
    }
    Object.assign(estado.datos.ajustes, { nivelServicio: ns, costoMantener: cm, horizonte: hz, diasExceso: ex });
    estado.escenario.ns = ns * 100;
    guardarYRecalcular();
    UI.mostrarToast('Parámetros guardados y análisis recalculado.');
  }

  /* ---------- Registro de eventos ---------- */
  function enlazarEventos() {
    // Navegación
    document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => irA(b.dataset.view)));
    document.addEventListener('click', (e) => {
      const ir = e.target.closest('[data-goto]');
      if (ir) { irA(ir.dataset.goto); return; }
      const fila = e.target.closest('tr[data-sku]');
      if (fila) { verMaterial(fila.dataset.sku); return; }
      const orden = e.target.closest('th[data-sort]');
      if (orden) {
        const f = estado.filtros.orden;
        f.dir = f.col === orden.dataset.sort ? -f.dir : 1;
        f.col = orden.dataset.sort;
        render();
        return;
      }
      const rec = e.target.closest('[data-recibir]');
      if (rec) {
        const o = DataModule.recibirOrden(estado.datos, rec.dataset.recibir);
        if (o) {
          DataModule.registrarEvento(estado.datos, 'recepcion', `Recepción manual de ${o.id} (${o.sku}).`);
          guardarYRecalcular();
          UI.mostrarToast(`Orden ${o.id} recibida en almacén.`);
        }
        return;
      }
      const exp = e.target.closest('[data-expeditar]');
      if (exp) {
        const o = DataModule.expeditarOrden(estado.datos, exp.dataset.expeditar);
        if (o) {
          DataModule.registrarEvento(estado.datos, 'info', `Se expeditó ${o.id} (${o.sku}); nueva llegada ${U.fecha(U.parseISO(o.fechaETA))}.`);
          guardarYRecalcular();
          UI.mostrarToast(`Orden ${o.id} expeditada: llega el ${U.fecha(U.parseISO(o.fechaETA))}.`);
        }
        return;
      }
      const can = e.target.closest('[data-cancelar]');
      if (can) {
        const o = DataModule.cancelarOrden(estado.datos, can.dataset.cancelar);
        if (o) {
          DataModule.registrarEvento(estado.datos, 'info', `Se canceló ${o.id} (${o.sku}).`);
          guardarYRecalcular();
          UI.mostrarToast(`Orden ${o.id} cancelada.`);
        }
      }
    });

    // Filtros de inventario
    $('#f-texto').addEventListener('input', U.debounce((e) => { estado.filtros.texto = e.target.value.trim(); render(); }, 150));
    $('#f-categoria').addEventListener('change', (e) => { estado.filtros.categoria = e.target.value; render(); });
    $('#f-estado').addEventListener('change', (e) => { estado.filtros.estado = e.target.value; render(); });

    // Pronóstico
    $('#sel-sku').addEventListener('change', (e) => { estado.skuSeleccionado = e.target.value; render(); });

    // Compras
    $('#sugerencias').addEventListener('change', (e) => {
      const chk = e.target.closest('[data-check]');
      const qty = e.target.closest('[data-qty]');
      if (chk) seleccionDe(chk.dataset.check).marcado = chk.checked;
      if (qty) {
        const a = estado.analisis.find((x) => x.sku === qty.dataset.qty);
        let v = Math.round(Number(qty.value));
        if (!Number.isFinite(v) || v <= 0) v = a.sugerencia.cantidad;
        v = Math.ceil(v / a.material.moq) * a.material.moq;   // respeta el mínimo de compra
        seleccionDe(a.sku).cantidad = v;
        render();
      }
    });
    $('#btn-generar-oc').addEventListener('click', generarOrdenes);
    $('#btn-export-sug').addEventListener('click', exportarSugerencias);

    // Simulador
    const sliders = { '#s-ns': 'ns', '#s-dem': 'dem', '#s-ret': 'ret' };
    Object.entries(sliders).forEach(([sel, clave]) => {
      $(sel).addEventListener('input', (e) => { estado.escenario[clave] = Number(e.target.value); renderSimulador(); });
    });
    $('#s-prov').addEventListener('change', (e) => { estado.escenario.prov = e.target.value; renderSimulador(); });
    $('#btn-reset-esc').addEventListener('click', () => {
      estado.escenario = { ns: estado.datos.ajustes.nivelServicio * 100, dem: 0, ret: 0, prov: 'todos' };
      sincronizarSliders();
      renderSimulador();
    });

    // Datos
    $('#form-ajustes').addEventListener('submit', guardarAjustes);
    $('#btn-export-inv').addEventListener('click', exportarInventario);
    $('#btn-plantilla').addEventListener('click', descargarPlantilla);
    $('#file-csv').addEventListener('change', (e) => { if (e.target.files[0]) importarCSV(e.target.files[0]); e.target.value = ''; });
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('¿Restablecer los datos de demostración? Se perderán las órdenes y cambios realizados.')) return;
      estado.datos = DataModule.restablecer();
      estado.seleccionCompras = {};
      estado.skuSeleccionado = null;
      guardarYRecalcular();
      UI.mostrarToast('Datos de demostración restablecidos.');
    });

    // Simulación de día
    $('#btn-avanzar').addEventListener('click', simularDia);

    // Redibujar gráficas al cambiar el tamaño de la ventana
    window.addEventListener('resize', U.debounce(render, 200));
  }

  function sincronizarSliders() {
    const e = estado.escenario;
    $('#s-ns').value = e.ns; $('#s-dem').value = e.dem; $('#s-ret').value = e.ret; $('#s-prov').value = e.prov;
  }

  /** Punto de entrada. */
  function iniciar() {
    estado.datos = DataModule.cargar();
    estado.escenario.ns = estado.datos.ajustes.nivelServicio * 100;
    $('#s-prov').innerHTML = '<option value="todos">Todos los proveedores</option>' +
      estado.datos.proveedores.map((p) => `<option value="${p.id}">${U.escapeHTML(p.nombre)}</option>`).join('');
    sincronizarSliders();
    UI.llenarCategorias(estado.datos);
    enlazarEventos();
    recalcular();
    render();
  }

  return { iniciar };
})();

document.addEventListener('DOMContentLoaded', App.iniciar);
