/* =========================================================
   Módulo Charts: gráficas en <canvas> sin librerías externas
   (líneas con tooltip, dona y Pareto)
   ========================================================= */
const Charts = (() => {
  'use strict';

  const FUENTE = '12px "Segoe UI", system-ui, sans-serif';
  const COLOR_EJE = '#64748b';
  const COLOR_REJILLA = '#e8edf3';

  /** Ajusta el canvas a su contenedor y a la densidad de píxeles de la pantalla. */
  function preparar(canvas, alto) {
    const dpr = window.devicePixelRatio || 1;
    const ancho = canvas.parentElement.clientWidth || 600;
    canvas.style.height = `${alto}px`;
    canvas.width = Math.round(ancho * dpr);
    canvas.height = Math.round(alto * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    return { ctx, w: ancho, h: alto };
  }

  function maxRedondo(v) {
    if (v <= 0) return 1;
    const e = 10 ** Math.floor(Math.log10(v));
    const f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }

  function fmtEje(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return `${Math.round(v)}`;
  }

  /**
   * Gráfica de líneas.
   * cfg = { etiquetas:[string], series:[{nombre,datos,color,ancho,punteada,relleno}],
   *         banda:{sup,inf,color}, lineasH:[{valor,etiqueta,color}], marcaX:{indice,etiqueta},
   *         zona:{desde,color}, alto }
   */
  function lineas(canvas, cfg) {
    canvas._cfg = cfg;
    dibujarLineas(canvas, null);
    if (!canvas._eventos) {
      canvas._eventos = true;
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        dibujarLineas(canvas, e.clientX - r.left);
      });
      canvas.addEventListener('mouseleave', () => dibujarLineas(canvas, null));
    }
  }

  function dibujarLineas(canvas, hoverX) {
    const cfg = canvas._cfg;
    const { ctx, w, h } = preparar(canvas, cfg.alto || 280);
    const pad = { l: 54, r: 18, t: 18, b: 30 };
    const n = cfg.etiquetas.length;

    let maxV = 0, minV = 0;
    const revisar = (v) => { if (v !== null && Number.isFinite(v)) { maxV = Math.max(maxV, v); minV = Math.min(minV, v); } };
    cfg.series.forEach((s) => s.datos.forEach(revisar));
    if (cfg.banda) cfg.banda.sup.forEach(revisar);
    (cfg.lineasH || []).forEach((l) => revisar(l.valor));
    // Escala con un paso "redondo" para que el cero siempre quede en una línea de la rejilla
    const paso0 = maxRedondo(((maxV * 1.08) - (minV < 0 ? minV * 1.1 : 0)) / 5);
    const yMax = Math.max(paso0, Math.ceil((maxV * 1.08) / paso0) * paso0);
    const yMin = minV < 0 ? -Math.ceil((-minV * 1.1) / paso0) * paso0 : 0;
    const marcas = Math.round((yMax - yMin) / paso0);

    const X = (i) => pad.l + (n <= 1 ? 0 : (i * (w - pad.l - pad.r)) / (n - 1));
    const Y = (v) => pad.t + ((yMax - v) * (h - pad.t - pad.b)) / (yMax - yMin);

    ctx.font = FUENTE;
    ctx.lineWidth = 1;

    // Zona sombreada (por ejemplo, el periodo pronosticado)
    if (cfg.zona) {
      ctx.fillStyle = cfg.zona.color;
      ctx.fillRect(X(cfg.zona.desde), pad.t, X(n - 1) - X(cfg.zona.desde), h - pad.t - pad.b);
    }

    // Rejilla y eje Y
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= marcas; i++) {
      const v = yMin + ((yMax - yMin) * i) / marcas;
      const y = Y(v);
      ctx.strokeStyle = v === 0 && yMin < 0 ? '#94a3b8' : COLOR_REJILLA;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = COLOR_EJE;
      ctx.fillText(fmtEje(v), pad.l - 8, y);
    }

    // Eje X
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const paso = Math.max(1, Math.ceil(n / Math.max(4, Math.floor((w - pad.l) / 80))));
    for (let i = 0; i < n; i += paso) ctx.fillText(cfg.etiquetas[i], X(i), h - pad.b + 8);

    // Banda de confianza
    if (cfg.banda) {
      const { sup, inf, color } = cfg.banda;
      ctx.fillStyle = color;
      ctx.beginPath();
      let primero = true;
      for (let i = 0; i < n; i++) if (sup[i] !== null) { primero ? ctx.moveTo(X(i), Y(sup[i])) : ctx.lineTo(X(i), Y(sup[i])); primero = false; }
      for (let i = n - 1; i >= 0; i--) if (inf[i] !== null) ctx.lineTo(X(i), Y(inf[i]));
      ctx.closePath(); ctx.fill();
    }

    // Líneas horizontales de referencia (ROP, SS…)
    (cfg.lineasH || []).forEach((l) => {
      const y = Y(l.valor);
      ctx.strokeStyle = l.color; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = l.color; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(l.etiqueta, w - pad.r - 4, y - 3);
      ctx.font = FUENTE;
    });

    // Series
    cfg.series.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.ancho || 2;
      ctx.setLineDash(s.punteada ? [6, 4] : []);
      ctx.beginPath();
      let activo = false;
      s.datos.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { activo = false; return; }
        activo ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v));
        activo = true;
      });
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.relleno) {
        const idx = s.datos.map((v, i) => (v === null ? null : i)).filter((i) => i !== null);
        if (idx.length) {
          ctx.fillStyle = s.relleno;
          ctx.beginPath();
          ctx.moveTo(X(idx[0]), Y(Math.max(0, yMin)));
          idx.forEach((i) => ctx.lineTo(X(i), Y(s.datos[i])));
          ctx.lineTo(X(idx[idx.length - 1]), Y(Math.max(0, yMin)));
          ctx.closePath(); ctx.fill();
        }
      }
    });

    // Marca vertical (hoy)
    if (cfg.marcaX) {
      const x = X(cfg.marcaX.indice);
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(cfg.marcaX.etiqueta, x + 5, pad.t + 2);
      ctx.font = FUENTE;
    }

    // Tooltip
    if (hoverX !== null && hoverX >= pad.l && hoverX <= w - pad.r && n > 1) {
      const i = Math.round(((hoverX - pad.l) / (w - pad.l - pad.r)) * (n - 1));
      const x = X(i);
      ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      const filas = cfg.series.filter((s) => s.datos[i] !== null && Number.isFinite(s.datos[i]))
        .map((s) => ({ color: s.color, texto: `${s.nombre}: ${Utils.num(s.datos[i])}` }));
      if (filas.length) {
        filas.forEach((f, k) => {
          const s = cfg.series.filter((q) => q.datos[i] !== null && Number.isFinite(q.datos[i]))[k];
          ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x, Y(s.datos[i]), 3.5, 0, Math.PI * 2); ctx.fill();
        });
        ctx.font = FUENTE;
        const titulo = cfg.etiquetasLargas ? cfg.etiquetasLargas[i] : cfg.etiquetas[i];
        const anchoT = Math.max(ctx.measureText(titulo).width, ...filas.map((f) => ctx.measureText(f.texto).width)) + 30;
        const altoT = 22 + filas.length * 18;
        let tx = x + 12; if (tx + anchoT > w - 4) tx = x - anchoT - 12;
        const ty = pad.t + 8;
        ctx.fillStyle = 'rgba(15,23,42,.92)';
        redondeado(ctx, tx, ty, anchoT, altoT, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(titulo, tx + 10, ty + 6);
        ctx.font = FUENTE;
        filas.forEach((f, k) => {
          ctx.fillStyle = f.color; ctx.fillRect(tx + 10, ty + 27 + k * 18, 8, 8);
          ctx.fillStyle = '#e2e8f0'; ctx.fillText(f.texto, tx + 24, ty + 24 + k * 18);
        });
      }
    }

    // Leyenda
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = FUENTE;
    let lx = pad.l + 4;
    cfg.series.filter((s) => s.nombre).forEach((s) => {
      ctx.fillStyle = s.color; ctx.fillRect(lx, 6, 14, 3);
      ctx.fillStyle = COLOR_EJE; ctx.fillText(s.nombre, lx + 19, 8);
      lx += ctx.measureText(s.nombre).width + 40;
    });
  }

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** Gráfica de dona. segmentos = [{etiqueta, valor, color}] */
  function dona(canvas, segmentos, textoCentro, subCentro) {
    const { ctx, w, h } = preparar(canvas, 220);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6, grosor = 30;
    const total = segmentos.reduce((s, x) => s + x.valor, 0) || 1;
    let ang = -Math.PI / 2;
    segmentos.forEach((s) => {
      const a = (s.valor / total) * Math.PI * 2;
      if (a <= 0) return;
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang, ang + a);
      ctx.arc(cx, cy, r - grosor, ang + a, ang, true);
      ctx.closePath();
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ang += a;
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a'; ctx.font = '700 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(textoCentro, cx, cy - 8);
    ctx.fillStyle = COLOR_EJE; ctx.font = FUENTE;
    ctx.fillText(subCentro, cx, cy + 18);
  }

  /** Gráfica de Pareto: barras de valor y línea de porcentaje acumulado. */
  function pareto(canvas, items) {
    const { ctx, w, h } = preparar(canvas, 300);
    const pad = { l: 58, r: 44, t: 18, b: 64 };
    const n = items.length;
    const maxV = maxRedondo(Math.max(...items.map((i) => i.valor)) * 1.05);
    const anchoBarra = (w - pad.l - pad.r) / n;
    const Y = (v) => pad.t + (1 - v / maxV) * (h - pad.t - pad.b);
    const Yp = (p) => pad.t + (1 - p) * (h - pad.t - pad.b);
    const colores = { A: '#0e7c86', B: '#7aa6c2', C: '#c9d4e0' };

    ctx.font = FUENTE; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4, y = Y(v);
      ctx.strokeStyle = COLOR_REJILLA; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = COLOR_EJE; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`$${fmtEje(v)}`, pad.l - 8, y);
      ctx.textAlign = 'left'; ctx.fillText(`${i * 25}%`, w - pad.r + 8, Yp(i / 4));
    }
    // Umbral 80 %
    ctx.strokeStyle = '#d32f2f'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.l, Yp(0.8)); ctx.lineTo(w - pad.r, Yp(0.8)); ctx.stroke(); ctx.setLineDash([]);

    items.forEach((it, i) => {
      const x = pad.l + i * anchoBarra;
      ctx.fillStyle = colores[it.clase];
      ctx.fillRect(x + anchoBarra * 0.15, Y(it.valor), anchoBarra * 0.7, Y(0) - Y(it.valor));
      ctx.save();
      ctx.translate(x + anchoBarra / 2, h - pad.b + 8);
      ctx.rotate(-Math.PI / 3.2);
      ctx.fillStyle = COLOR_EJE; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(it.etiqueta, 0, 0);
      ctx.restore();
    });
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.beginPath();
    items.forEach((it, i) => {
      const x = pad.l + i * anchoBarra + anchoBarra / 2;
      i ? ctx.lineTo(x, Yp(it.acum)) : ctx.moveTo(x, Yp(it.acum));
    });
    ctx.stroke();
    items.forEach((it, i) => {
      ctx.fillStyle = '#0f172a'; ctx.beginPath();
      ctx.arc(pad.l + i * anchoBarra + anchoBarra / 2, Yp(it.acum), 2.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  return { lineas, dona, pareto };
})();
