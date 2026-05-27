/**
 * Utilidad de impresión para impresoras térmicas de rollo continuo.
 * Soporta 58 mm y 80 mm.
 *
 * Usa un <iframe> oculto como primera estrategia (no requiere permisos de popup).
 * Si falla, cae a window.open() como respaldo.
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
      background: #fff;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${ancho === 58 ? '10px' : '11px'};
      line-height: 1.35;
      padding: 2mm 2mm 6mm 2mm;
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
    .feed { height: 6mm; display: block; }

    /* Ocultar en pantalla; mostrar al imprimir */
    @media screen {
      body { display: none; }
    }
    @media print {
      body { display: block; }
    }
  `;
}

/**
 * Imprime HTML en una impresora térmica.
 *
 * Estrategia:
 *   1. Crea un <iframe> oculto e imprime desde él (sin popup blocker).
 *   2. Si falla, abre window.open() como fallback.
 */
export function printHtml(html: string, titulo = 'Impresión', ancho: AnchoPapel = 58): void {
  const fullHtml = buildFullHtml(html, titulo, ancho);

  // ── Estrategia 1: iframe oculto (sin popup blocker) ──────────────────────
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', titulo);
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    width: `${ancho}mm`,
    height: '1px',
    border: 'none',
    visibility: 'hidden',
  });

  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* ya removido */ }
    }, 4000);
  };

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error('No se pudo acceder al documento del iframe');

    doc.open();
    doc.write(fullHtml);
    doc.close();

    // Esperar a que el CSS calcule los estilos antes de imprimir
    setTimeout(() => {
      try {
        if (!iframe.contentWindow) throw new Error('iframe.contentWindow es null');
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        cleanup();
      } catch (printErr) {
        console.warn('[printHtml] iframe.print() falló, usando window.open():', printErr);
        cleanup();
        fallbackWindowOpen(fullHtml);
      }
    }, 700);

  } catch (setupErr) {
    console.warn('[printHtml] Setup iframe falló, usando window.open():', setupErr);
    cleanup();
    fallbackWindowOpen(fullHtml);
  }
}

/** Construye el documento HTML completo para imprimir */
function buildFullHtml(body: string, titulo: string, ancho: AnchoPapel): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(titulo)}</title>
  <style>${cssTermico(ancho)}</style>
</head>
<body>${body}</body>
</html>`;
}

/** Fallback: abre ventana emergente si el iframe falla */
function fallbackWindowOpen(fullHtml: string): void {
  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,menubar=0,scrollbars=1');
  if (!win) {
    alert('Permite las ventanas emergentes en este sitio para poder imprimir.');
    return;
  }
  win.document.open();
  win.document.write(fullHtml.replace(
    // Quitar la regla @media screen { body { display:none } } para que se vea en el popup
    '@media screen {\n      body { display: none; }\n    }',
    ''
  ));
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
    win.onafterprint = () => { try { win.close(); } catch { /**/ } };
    setTimeout(() => { try { win.close(); } catch { /**/ } }, 5000);
  }, 600);
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
