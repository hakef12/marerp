/**
 * Utilidad de impresión para impresoras térmicas de rollo continuo.
 * Soporta 58 mm y 80 mm.
 */

export type AnchoPapel = 58 | 80;

/** CSS base para impresoras térmicas */
export function cssTermico(ancho: AnchoPapel = 58): string {
  return `
    @page {
      size: ${ancho}mm auto;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      width: ${ancho}mm;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${ancho === 58 ? '10px' : '11px'};
      line-height: 1.35;
      padding: 2mm 2mm 3mm 2mm;
      background: #fff;
      color: #000;
    }
    div, p, tr, .item {
      page-break-inside: avoid;
    }
    .sep {
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    .sep-solid {
      border-top: 1px solid #000;
      margin: 4px 0;
    }
    .c  { text-align: center; }
    .r  { text-align: right; }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .row .lbl { flex: 1; }
    .row .val { text-align: right; white-space: nowrap; margin-left: 4px; }
    .bold  { font-weight: bold; }
    .sm    { font-size: 9px; }
    .big   { font-size: ${ancho === 58 ? '13px' : '15px'}; font-weight: bold; }
    .huge  { font-size: ${ancho === 58 ? '16px' : '18px'}; font-weight: bold; text-align: center; }
    table  { width: 100%; border-collapse: collapse; }
    td, th { padding: 1px 0; vertical-align: top; }
    th     { font-weight: bold; border-bottom: 1px solid #000; }
    .qty   { width: 20px; }
    .price { text-align: right; white-space: nowrap; }
    .clave {
      word-break: break-all;
      font-size: 8px;
      text-align: center;
      letter-spacing: 0.5px;
    }
    .feed { height: 3mm; display: block; }
  `;
}

/**
 * Abre una ventana de impresión y lanza print().
 * Usa setTimeout desde la ventana padre — evita el problema de onload
 * que no dispara cuando se usa document.write().
 */
export function printHtml(html: string, titulo = 'Impresión', ancho: AnchoPapel = 58): void {
  const win = window.open('', '_blank', 'width=400,height=600,toolbar=0,menubar=0');
  if (!win) {
    alert('Por favor permite ventanas emergentes para imprimir.');
    return;
  }

  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="es"><head>
    <meta charset="utf-8"/>
    <title>${titulo}</title>
  </head><body>${html}</body></html>`);
  win.document.close();

  // Paso 1: esperar 500ms para que el layout calcule estilos y fuentes
  setTimeout(() => {
    try {
      // Paso 2: medir altura real del contenido
      const altoPx = win.document.body.scrollHeight + 6;

      // Paso 3: inyectar @page con altura exacta (sobreescribe el "auto")
      const s = win.document.createElement('style');
      s.textContent = `@page { size: ${ancho}mm ${altoPx}px !important; margin: 0 !important; }`;
      win.document.head.appendChild(s);

      // Paso 4: imprimir
      setTimeout(() => {
        win.focus();
        win.print();
        win.onafterprint = () => win.close();
        setTimeout(() => { try { win.close(); } catch { /* ya cerrada */ } }, 4000);
      }, 150);

    } catch {
      // Fallback: imprimir sin ajuste de altura (funciona igual, solo puede sobrar papel)
      win.focus();
      win.print();
      win.onafterprint = () => win.close();
      setTimeout(() => { try { win.close(); } catch { /* ya cerrada */ } }, 4000);
    }
  }, 500);
}

/** Escapa HTML básico para evitar XSS en contenido dinámico */
export function esc(s: string | number | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
