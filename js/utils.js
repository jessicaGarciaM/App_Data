/* =========================================================
   Módulo Utils: funciones de apoyo (formatos, fechas, CSV)
   ========================================================= */
const Utils = (() => {
  'use strict';

  const fmtEntero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtDecimal = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  /** Convierte "AAAA-MM-DD" a Date local (sin problemas de zona horaria). */
  function parseISO(texto) {
    const [a, m, d] = texto.split('-').map(Number);
    return new Date(a, m - 1, d);
  }

  /** Convierte Date a "AAAA-MM-DD". */
  function toISO(fecha) {
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  function addDays(fecha, dias) {
    const r = new Date(fecha);
    r.setDate(r.getDate() + dias);
    return r;
  }

  /** Días enteros entre dos fechas (b - a). */
  function diffDays(a, b) {
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 86400000);
  }

  function hoy() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const fecha = (d) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  const fechaCorta = (d) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  const num = (v) => (Number.isFinite(v) ? fmtEntero.format(v) : '—');
  const dec = (v) => (Number.isFinite(v) ? fmtDecimal.format(v) : '—');
  const dinero = (v) => (Number.isFinite(v) ? fmtMoneda.format(v) : '—');
  const pct = (v, dig = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(dig)} %` : '—');

  /** Dinero abreviado: $1.2 M, $350 k */
  function dineroCorto(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return `$${(v / 1e6).toFixed(2)} M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(0)} k`;
    return fmtMoneda.format(v);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function debounce(fn, ms = 200) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Convierte un arreglo de arreglos a texto CSV. */
  function toCSV(filas) {
    return filas.map((f) => f.map((c) => {
      const s = c === null || c === undefined ? '' : String(c);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
  }

  /** Lee un CSV simple (separado por comas o punto y coma). */
  function parseCSV(texto) {
    const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lineas.length) return [];
    const sep = lineas[0].includes(';') && !lineas[0].includes(',') ? ';' : ',';
    return lineas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  }

  function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
    const blob = new Blob(['﻿' + contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sum = (arr) => arr.reduce((s, x) => s + x, 0);
  const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);

  return {
    parseISO, toISO, addDays, diffDays, hoy,
    fecha, fechaCorta, num, dec, dinero, dineroCorto, pct,
    escapeHTML, debounce, toCSV, parseCSV, descargar, sum, mean
  };
})();
