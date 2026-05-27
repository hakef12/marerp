import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import * as XLSXStyle from 'xlsx-js-style';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          SISTEMA DE DISEÑO EJECUTIVO  —  MAR · Nivel CEO               ║
// ║   Paleta corporativa · Tipografía jerárquica · Informes de dirección    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

type RGB = [number, number, number];

/** Paleta corporativa MAR */
const C: Record<string, RGB> = {
  navy:       [10,  26,  47],
  navyMid:    [14,  38,  66],
  blue:       [30,  100, 167],
  bluePale:   [232, 243, 255],
  cyan:       [0,   196, 218],
  cyanPale:   [224, 251, 255],
  white:      [255, 255, 255],
  offWhite:   [247, 250, 254],
  grayBg:     [238, 243, 250],
  grayMid:    [200, 213, 228],
  grayText:   [95,  112, 132],
  darkText:   [18,  32,  52],
  green:      [21,  128, 61],
  greenBg:    [228, 244, 234],
  amber:      [176, 106, 0],
  amberBg:    [255, 247, 210],
  red:        [190, 28,  28],
  redBg:      [253, 232, 232],
  silver:     [158, 174, 192],
  teal:       [0,   130, 140],
  tealBg:     [220, 248, 252],
};

// ── Utilidades de formato ────────────────────────────────────────────────────
const fmt$   = (n: number) => `$${n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const dateStr = () => new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
const timeStr = () => new Date().toLocaleString('es-EC', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const fileTs  = () => new Date().toISOString().split('T')[0];

// ── Helpers de color ─────────────────────────────────────────────────────────
const sf = (doc: jsPDF, rgb: RGB) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
const sd = (doc: jsPDF, rgb: RGB) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
const st = (doc: jsPDF, rgb: RGB) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

// ── Selección de color por métrica ───────────────────────────────────────────
function marginColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 40) return 'green';
  if (pct >= 20) return 'amber';
  return 'red';
}
function foodCostColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 30) return 'green';
  if (pct <= 45) return 'amber';
  return 'red';
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                      PRIMITIVOS DE DIBUJO                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * Encabezado corporativo en cada página interior.
 * Retorna el yPos inicial después del header (≈ 24).
 */
function pageHeader(doc: jsPDF, reportTitle: string): number {
  const W = doc.internal.pageSize.width;
  sf(doc, C.navy); doc.rect(0, 0, W, 17, 'F');
  sf(doc, C.cyan); doc.rect(0, 17, W, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  st(doc, C.white);
  doc.text(reportTitle.toUpperCase(), 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  st(doc, C.silver);
  doc.text(dateStr(), W - 14, 11, { align: 'right' });

  return 25;
}

/**
 * Pie de página corporativo con número de página.
 */
function pageFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;

  sd(doc, C.grayBg);
  doc.setLineWidth(0.35);
  doc.line(14, H - 13, W - 14, H - 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  st(doc, C.grayText);
  doc.text('MAR — Sistema de Gestión Gastronómica', 14, H - 8);
  doc.text('Confidencial · Uso Interno', W / 2, H - 8, { align: 'center' });
  doc.text(`Página ${pageNum} / ${totalPages}`, W - 14, H - 8, { align: 'right' });
}

/**
 * Caja KPI con barra de acento lateral.
 */
function kpiBox(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
  color: 'blue' | 'green' | 'red' | 'amber' | 'gray' | 'teal'
) {
  const pal: Record<string, { bg: RGB; accent: RGB; val: RGB }> = {
    blue:  { bg: C.bluePale,  accent: C.blue,   val: C.blue   },
    green: { bg: C.greenBg,   accent: C.green,  val: C.green  },
    red:   { bg: C.redBg,     accent: C.red,    val: C.red    },
    amber: { bg: C.amberBg,   accent: C.amber,  val: C.amber  },
    gray:  { bg: C.grayBg,    accent: C.silver, val: C.darkText },
    teal:  { bg: C.tealBg,    accent: C.teal,   val: C.teal   },
  };
  const p = pal[color];

  // Fondo
  sf(doc, p.bg);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  // Borde sutil
  sd(doc, C.grayMid);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');

  // Barra de acento
  sf(doc, p.accent);
  doc.rect(x, y, 3, h, 'F');

  // Label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  st(doc, C.grayText);
  doc.text(label.toUpperCase(), x + 6, y + 7);

  // Value
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  st(doc, p.val);
  doc.text(value, x + 6, y + 17.5);
}

/**
 * Título de sección con barra lateral y línea decorativa.
 */
function sectionTitle(doc: jsPDF, text: string, y: number): number {
  const W = doc.internal.pageSize.width;

  sf(doc, C.blue);
  doc.rect(14, y, 3.5, 7.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  st(doc, C.blue);
  doc.text(text, 20, y + 5.5);

  sd(doc, C.grayBg);
  doc.setLineWidth(0.5);
  const textW = doc.getTextWidth(text);
  doc.line(22 + textW, y + 3.5, W - 14, y + 3.5);

  return y + 13;
}

/**
 * Par etiqueta + valor en línea horizontal.
 */
function infoField(doc: jsPDF, label: string, value: string, x: number, y: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  st(doc, C.grayText);
  doc.text(label + ':', x, y);

  doc.setFont('helvetica', 'bold');
  st(doc, C.darkText);
  doc.text(value, x + doc.getTextWidth(label + ':') + 2, y);
}

/**
 * Página de portada ejecutiva profesional.
 */
function coverPage(
  doc: jsPDF,
  title: string,
  subtitle: string,
  kpis: Array<{ label: string; value: string; color: 'blue' | 'green' | 'red' | 'amber' | 'gray' | 'teal' }>,
  contentItems: string[] = [],
  extraMeta: string = ''
) {
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const splitPoint = H * 0.52;

  // ── Fondo navy superior ──
  sf(doc, C.navy);
  doc.rect(0, 0, W, splitPoint, 'F');

  // ── Patrón geométrico decorativo (círculos concéntricos sutiles en esquina) ──
  sd(doc, C.navyMid);
  doc.setLineWidth(0.5);
  [30, 50, 70, 90, 110].forEach(r => doc.circle(W + 5, -5, r, 'S'));

  // ── Franja cyan de transición ──
  sf(doc, C.cyan);
  doc.rect(0, splitPoint, W, 2.5, 'F');

  // ── Fondo claro inferior ──
  sf(doc, C.offWhite);
  doc.rect(0, splitPoint + 2.5, W, H - splitPoint - 2.5, 'F');

  // ── Logotipo MAR ──
  const lx = 18, ly = 24, ls = 24;
  sf(doc, C.blue); doc.roundedRect(lx, ly, ls, ls, 3, 3, 'F');
  sf(doc, C.cyan); doc.rect(lx, ly + ls - 6, ls, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  st(doc, C.white);
  doc.text('MAR', lx + ls / 2, ly + 15, { align: 'center' });

  // ── Etiqueta "Informe Ejecutivo" ──
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  st(doc, C.cyan);
  doc.text('▸  INFORME EJECUTIVO DE GESTIÓN', W / 2, 38, { align: 'center' });

  // ── Separador ──
  sd(doc, [40, 80, 120] as RGB); doc.setLineWidth(0.3);
  doc.line(W / 2 - 40, 41, W / 2 + 40, 41);

  // ── Título principal ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  st(doc, C.white);
  const splitTitle = doc.splitTextToSize(title.toUpperCase(), W - 40);
  const titleBaseY = 56;
  doc.text(splitTitle, W / 2, titleBaseY, { align: 'center' });
  const afterTitle = titleBaseY + splitTitle.length * 10;

  // ── Subtítulo ──
  if (subtitle) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    st(doc, [170, 198, 228] as RGB);
    doc.text(subtitle, W / 2, afterTitle + 5, { align: 'center' });
  }

  // ── KPIs justo encima de la franja cyan ──
  if (kpis.length > 0) {
    const kpiH = 26;
    const kpiY = splitPoint - kpiH - 6;
    const totalGap = 3 * (kpis.length - 1);
    const kpiW = (W - 28 - totalGap) / kpis.length;
    kpis.forEach((kpi, i) => {
      kpiBox(doc, 14 + i * (kpiW + 3), kpiY, kpiW, kpiH, kpi.label, kpi.value, kpi.color);
    });
  }

  // ── Sección inferior: metadata ──
  const metaY = splitPoint + 18;

  // Columna izquierda
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  st(doc, C.silver);
  doc.text('PREPARADO POR', 20, metaY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  st(doc, C.darkText);
  doc.text('MAR — Sistema de Gestión Gastronómica', 20, metaY + 7);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  st(doc, C.silver);
  doc.text('FECHA Y HORA DE GENERACIÓN', 20, metaY + 19);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  st(doc, C.darkText);
  doc.text(timeStr(), 20, metaY + 27);

  if (extraMeta) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    st(doc, C.silver);
    doc.text('DETALLE ADICIONAL', 20, metaY + 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    st(doc, C.darkText);
    doc.text(extraMeta, 20, metaY + 46);
  }

  // Columna derecha: badge confidencial
  const badgeX = W - 80;
  sf(doc, C.redBg); doc.roundedRect(badgeX, metaY, 66, 12, 2, 2, 'F');
  sd(doc, C.red); doc.setLineWidth(0.3);
  doc.roundedRect(badgeX, metaY, 66, 12, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  st(doc, C.red);
  doc.text('⬤  CONFIDENCIAL · USO INTERNO', badgeX + 33, metaY + 7.5, { align: 'center' });

  // ── Índice de contenido ──
  if (contentItems.length > 0) {
    const listY = metaY + 58;
    if (listY + contentItems.length * 7 + 20 < H - 14) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      st(doc, C.grayText);
      doc.text('CONTENIDO DEL INFORME', 20, listY);

      sf(doc, C.grayBg);
      doc.roundedRect(18, listY + 4, W - 36, Math.min(contentItems.length, 7) * 7 + 8, 2, 2, 'F');

      contentItems.slice(0, 7).forEach((item, i) => {
        sf(doc, C.blue); doc.circle(25, listY + 10 + i * 7, 1.3, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        st(doc, C.darkText);
        doc.text(item, 30, listY + 12 + i * 7);
      });
      if (contentItems.length > 7) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
        st(doc, C.grayText);
        doc.text(`... y ${contentItems.length - 7} elementos adicionales`, 30, listY + 12 + 7 * 7);
      }
    }
  }

  // ── Pie de portada ──
  sd(doc, C.grayMid); doc.setLineWidth(0.3);
  doc.line(14, H - 12, W - 14, H - 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  st(doc, C.silver);
  doc.text('MAR — Sistema de Gestión Gastronómica', 14, H - 7);
  doc.text(dateStr(), W - 14, H - 7, { align: 'right' });
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                   FICHAS TÉCNICAS DE RECETAS — PDF                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
export const exportRecetasToPDF = (recetas: any[], catalogoProductos: any[] = []) => {
  const doc = new jsPDF();
  const totalPages = recetas.length + 1; // portada + una por receta

  // ── Cálculos agregados para la portada ──────────────────────────────────
  const totalRecetas = recetas.length;
  const foodCostProm = recetas.length
    ? recetas.reduce((s, r) => s + (r.food_cost || 0), 0) / recetas.length
    : 0;
  const margenProm = recetas.length
    ? recetas.reduce((s, r) => s + (r.margen_ganancia || 0), 0) / recetas.length
    : 0;
  const costoTotalPortfolio = recetas.reduce((s, r) => s + (r.costo_total || 0), 0);

  // ── Portada ejecutiva ───────────────────────────────────────────────────
  coverPage(
    doc,
    'Fichas Técnicas de Recetas',
    `Portfolio gastronómico · ${totalRecetas} receta${totalRecetas !== 1 ? 's' : ''} registrada${totalRecetas !== 1 ? 's' : ''}`,
    [
      { label: 'Total Recetas',       value: String(totalRecetas),             color: 'blue'  },
      { label: 'Food Cost Promedio',  value: fmtPct(foodCostProm),             color: foodCostColor(foodCostProm) },
      { label: 'Margen Promedio',     value: fmtPct(margenProm),               color: marginColor(margenProm) },
      { label: 'Inversión en Recetas',value: fmt$(costoTotalPortfolio),        color: 'teal'  },
    ],
    recetas.map((r, i) => `${String(i + 1).padStart(2, '0')}. ${r.nombre || 'Sin nombre'} — ${r.categoria || 'Sin categoría'}`)
  );
  pageFooter(doc, 1, totalPages);

  // ── Una página por receta ────────────────────────────────────────────────
  recetas.forEach((receta, index) => {
    doc.addPage();
    let yPos = pageHeader(doc, 'Fichas Técnicas de Recetas');

    // ── Nombre y código de receta ──────────────────────────────────────────
    const W = doc.internal.pageSize.width;

    sf(doc, C.navy); doc.rect(14, yPos, W - 28, 14, 'F');
    sf(doc, C.cyan); doc.rect(14, yPos, 4, 14, 'F');

    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    st(doc, C.white);
    const recNombre = receta.nombre || 'Sin nombre';
    doc.text(recNombre, 22, yPos + 9.5);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    st(doc, C.silver);
    doc.text(`REC-${String(index + 1).padStart(4, '0')}`, W - 18, yPos + 9.5, { align: 'right' });

    yPos += 18;

    // ── KPIs de la receta ──────────────────────────────────────────────────
    const costo    = receta.costo_por_porcion || receta.costo_total || 0;
    const precio   = receta.precio_sugerido   || receta.precio_venta || 0;
    const margen   = receta.margen_ganancia   || (precio > 0 ? ((precio - costo) / precio * 100) : 0);
    const foodCost = receta.food_cost         || (precio > 0 ? (costo / precio * 100) : 0);
    const ganancia = precio - costo;
    const porciones = receta.porciones || 1;

    const kpiW = (W - 28 - 9) / 4;
    kpiBox(doc, 14,               yPos, kpiW, 24, 'Costo por Porción', fmt$(costo),   'blue');
    kpiBox(doc, 14 + kpiW + 3,    yPos, kpiW, 24, 'Precio de Venta',   fmt$(precio),  'teal');
    kpiBox(doc, 14 + (kpiW+3)*2,  yPos, kpiW, 24, 'Margen Bruto',      fmtPct(margen), marginColor(margen));
    kpiBox(doc, 14 + (kpiW+3)*3,  yPos, kpiW, 24, 'Food Cost %',       fmtPct(foodCost), foodCostColor(foodCost));
    yPos += 29;

    // ── Información general ─────────────────────────────────────────────────
    yPos = sectionTitle(doc, 'Información General', yPos);

    sf(doc, C.grayBg); doc.roundedRect(14, yPos - 2, W - 28, 22, 2, 2, 'F');

    infoField(doc, 'Categoría',         receta.categoria        || 'N/A',         14,         yPos + 5);
    infoField(doc, 'Dificultad',        receta.dificultad       || 'Media',        14,         yPos + 13);
    infoField(doc, 'Tiempo preparación',`${receta.tiempo_preparacion || 0} min`,   W/2 - 10,   yPos + 5);
    infoField(doc, 'Porciones por lote',`${porciones} unidades`,                   W/2 - 10,   yPos + 13);
    infoField(doc, 'Costo total lote',  fmt$(receta.costo_total || 0),             W - 80,     yPos + 5);
    infoField(doc, 'Ganancia/porción',  fmt$(ganancia),                            W - 80,     yPos + 13);
    yPos += 28;

    // ── Descripción ─────────────────────────────────────────────────────────
    if (receta.descripcion) {
      yPos = sectionTitle(doc, 'Descripción del Producto', yPos);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      st(doc, C.darkText);
      const splitDesc = doc.splitTextToSize(receta.descripcion, W - 28);
      sf(doc, C.offWhite); doc.roundedRect(14, yPos - 3, W - 28, splitDesc.length * 5 + 8, 2, 2, 'F');
      doc.text(splitDesc, 18, yPos + 3);
      yPos += splitDesc.length * 5 + 12;
    }

    // ── Tabla de ingredientes ─────────────────────────────────────────────
    if (yPos > 200) { doc.addPage(); yPos = pageHeader(doc, 'Fichas Técnicas de Recetas'); }
    yPos = sectionTitle(doc, 'Ingredientes y Materia Prima', yPos);

    const listaIng = receta.ingredientes || receta.receta_ingredientes || [];

    const ingData = listaIng.map((ing: any, idx: number) => {
      const idBuscado = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id || '');
      const prodCat   = catalogoProductos.find((p: any) => String(p.id) === idBuscado);
      const nombre    = ing.insumo?.nombre || ing.productos?.nombre || ing.nombre_producto || prodCat?.nombre || 'Ingrediente';
      const costoU    = parseFloat(ing.costo_unitario) || parseFloat(prodCat?.costo_promedio) || parseFloat(prodCat?.precio_compra) || 0;
      const cant      = parseFloat(ing.cantidad) || 0;
      const costoT    = costoU * cant;
      return {
        num: idx + 1,
        nombre,
        cantidad: cant,
        unidad: ing.unidad_medida || 'und',
        costoU,
        costoT,
        notas: ing.notas || '—',
      };
    });

    const costoTotalIng = ingData.reduce((s: number, i: any) => s + i.costoT, 0);

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Ingrediente / Insumo', 'Cantidad', 'Unidad', 'Costo Unit.', 'Costo Total', 'Notas']],
      body: [
        ...ingData.map((i: any) => [
          i.num,
          i.nombre,
          i.cantidad.toFixed(3),
          i.unidad,
          fmt$(i.costoU),
          fmt$(i.costoT),
          i.notas,
        ]),
        // Fila de total
        ['', 'TOTAL MATERIA PRIMA', '', '', '', fmt$(costoTotalIng), ''],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 100, 167],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        cellPadding: 3,
        halign: 'center',
      },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [247, 250, 254] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 55 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 33, fontSize: 7 },
      },
      didParseCell: (data) => {
        // Estilo fila total
        if (data.row.index === ingData.length) {
          data.cell.styles.fillColor  = [232, 243, 255];
          data.cell.styles.textColor  = [30, 100, 167];
          data.cell.styles.fontStyle  = 'bold';
          data.cell.styles.fontSize   = 8.5;
        }
      },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;

    // ── Análisis de rentabilidad ──────────────────────────────────────────
    if (yPos < 220) {
      yPos = sectionTitle(doc, 'Análisis de Rentabilidad', yPos);

      const colW = (W - 28) / 3;
      const boxH = 28;

      // Ingresos potenciales
      const ingresoPot = precio * porciones;
      const utilidadPot = ganancia * porciones;
      const breakEven   = precio > 0 ? Math.ceil(costoTotalIng / precio) : 0;

      sf(doc, C.bluePale); doc.roundedRect(14,             yPos, colW - 2, boxH, 2, 2, 'F');
      sf(doc, C.greenBg);  doc.roundedRect(14 + colW + 1,  yPos, colW - 2, boxH, 2, 2, 'F');
      sf(doc, C.amberBg);  doc.roundedRect(14 + colW*2+2,  yPos, colW - 2, boxH, 2, 2, 'F');

      // Box 1: Ingreso por lote
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); st(doc, C.blue);
      doc.text('INGRESO POTENCIAL / LOTE', 18, yPos + 7);
      doc.setFontSize(13); st(doc, C.blue);
      doc.text(fmt$(ingresoPot), 18, yPos + 18);
      doc.setFontSize(7); st(doc, C.grayText); doc.setFont('helvetica', 'normal');
      doc.text(`${porciones} porciones × ${fmt$(precio)}`, 18, yPos + 24);

      // Box 2: Utilidad por lote
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); st(doc, C.green);
      doc.text('UTILIDAD BRUTA / LOTE', 16 + colW + 1, yPos + 7);
      doc.setFontSize(13); st(doc, C.green);
      doc.text(fmt$(utilidadPot), 16 + colW + 1, yPos + 18);
      doc.setFontSize(7); st(doc, C.grayText); doc.setFont('helvetica', 'normal');
      doc.text(`Margen: ${fmtPct(margen)}`, 16 + colW + 1, yPos + 24);

      // Box 3: Break-even
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); st(doc, C.amber);
      doc.text('PUNTO DE EQUILIBRIO', 16 + colW*2 + 2, yPos + 7);
      doc.setFontSize(13); st(doc, C.amber);
      doc.text(`${breakEven} und`, 16 + colW*2 + 2, yPos + 18);
      doc.setFontSize(7); st(doc, C.grayText); doc.setFont('helvetica', 'normal');
      doc.text('porciones mínimas', 16 + colW*2 + 2, yPos + 24);

      yPos += boxH + 8;
    }

    // ── Instrucciones ─────────────────────────────────────────────────────
    if (receta.instrucciones) {
      if (yPos > 230) { doc.addPage(); yPos = pageHeader(doc, 'Fichas Técnicas de Recetas'); }
      yPos = sectionTitle(doc, 'Instrucciones de Preparación', yPos);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      st(doc, C.darkText);
      const splitInstr = doc.splitTextToSize(receta.instrucciones, W - 32);
      sf(doc, C.offWhite);
      doc.roundedRect(14, yPos - 3, W - 28, splitInstr.length * 5 + 8, 2, 2, 'F');
      doc.text(splitInstr, 18, yPos + 3);
    }

    pageFooter(doc, index + 2, totalPages);
  });

  doc.save(`fichas_tecnicas_recetas_${fileTs()}.pdf`);
};


// =====================================================
// EXPORTAR RECETAS A EXCEL
// =====================================================
export const exportRecetasToExcel = (recetas: any[], catalogoProductos: any[] = []) => {
  const fichaTecnicaData = recetas.map((receta) => {
    const listaIngredientes = receta.ingredientes || receta.receta_ingredientes || [];
    const porciones = receta.porciones || 1;
    const costo = receta.costo_por_porcion || 0;
    const precio = receta.precio_sugerido || 0;
    return {
      'Código':                      `REC-${String(recetas.indexOf(receta) + 1).padStart(4, '0')}`,
      'Nombre de la Receta':         receta.nombre,
      'Descripción':                 receta.descripcion || '',
      'Categoría':                   receta.categoria || 'N/A',
      'Porciones':                   porciones,
      'Tiempo de Preparación (min)': receta.tiempo_preparacion || 0,
      'Dificultad':                  receta.dificultad || 'Media',
      'Costo Total Producción':      receta.costo_total || 0,
      'Costo por Porción':           costo,
      'Precio Venta Sugerido':       precio,
      'Ganancia por Porción':        precio - costo,
      'Ingreso Potencial / Lote':    precio * porciones,
      'Utilidad Bruta / Lote':       (precio - costo) * porciones,
      'Margen de Ganancia %':        receta.margen_ganancia || 0,
      'Food Cost %':                 receta.food_cost || 0,
      'N° Ingredientes':             listaIngredientes.length,
      'Instrucciones':               receta.instrucciones || '',
    };
  });

  const ingredientesData: any[] = [];
  recetas.forEach((receta) => {
    const listaIngredientes = receta.ingredientes || receta.receta_ingredientes || [];
    listaIngredientes.forEach((ing: any, idx: number) => {
      const idBuscado  = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id || '');
      const prodCat    = catalogoProductos.find((p: any) => String(p.id) === idBuscado);
      const nombreReal = ing.insumo?.nombre || ing.productos?.nombre || ing.nombre_producto || prodCat?.nombre || 'Ingrediente';
      const costoU     = parseFloat(ing.costo_unitario) || parseFloat(prodCat?.costo_promedio) || parseFloat(prodCat?.precio_compra) || 0;
      const cantidad   = parseFloat(ing.cantidad) || 0;
      ingredientesData.push({
        'Código Receta': `REC-${String(recetas.indexOf(receta) + 1).padStart(4, '0')}`,
        'Receta':        receta.nombre,
        'N°':            idx + 1,
        'Ingrediente':   nombreReal,
        'Cantidad':      cantidad,
        'Unidad':        ing.unidad_medida || 'und',
        'Costo Unitario':costoU,
        'Costo Total':   costoU * cantidad,
        'Notas':         ing.notas || '',
      });
    });
  });

  const costosData = recetas.map((receta) => {
    const costo    = receta.costo_por_porcion || 0;
    const precio   = receta.precio_sugerido || 0;
    const porciones = receta.porciones || 1;
    const ganancia = precio - costo;
    return {
      'Receta':                  receta.nombre,
      'Categoría':               receta.categoria || 'N/A',
      'Porciones':               porciones,
      'Costo Materia Prima Total':receta.costo_total || 0,
      'Costo por Porción':       costo,
      'Precio de Venta':         precio,
      'Ganancia por Porción':    ganancia,
      'Ingreso Potencial Lote':  precio * porciones,
      'Utilidad Bruta Lote':     ganancia * porciones,
      'Margen Bruto %':          receta.margen_ganancia || 0,
      'Food Cost %':             receta.food_cost || 0,
      'Break-even (porciones)':  precio > 0 ? Math.ceil((receta.costo_total || 0) / precio) : 0,
    };
  });

  const instruccionesData = recetas.map((receta) => ({
    'Código':       `REC-${String(recetas.indexOf(receta) + 1).padStart(4, '0')}`,
    'Receta':       receta.nombre,
    'Porciones':    receta.porciones,
    'Tiempo (min)': receta.tiempo_preparacion || 0,
    'Dificultad':   receta.dificultad || 'Media',
    'Instrucciones':receta.instrucciones || 'Sin instrucciones',
  }));

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(fichaTecnicaData);
  const ws2 = XLSX.utils.json_to_sheet(ingredientesData);
  const ws3 = XLSX.utils.json_to_sheet(costosData);
  const ws4 = XLSX.utils.json_to_sheet(instruccionesData);

  ws1['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 80 }];
  ws2['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 8 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 40 }];
  ws3['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
  ws4['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 100 }];

  XLSX.utils.book_append_sheet(wb, ws1, 'Fichas Técnicas');
  XLSX.utils.book_append_sheet(wb, ws2, 'Ingredientes Detallados');
  XLSX.utils.book_append_sheet(wb, ws3, 'Análisis de Rentabilidad');
  XLSX.utils.book_append_sheet(wb, ws4, 'Instrucciones');

  XLSX.writeFile(wb, `fichas_tecnicas_recetas_${fileTs()}.xlsx`);
};


// ── Formateador numérico local (entero con separador de miles) ────────────────
const fmtN = (n: number): string =>
  Number.isFinite(n) ? n.toLocaleString('es-EC') : '0';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║               ÓRDENES DE PRODUCCIÓN — PDF EJECUTIVO                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
export const exportOrdenesProduccionToPDF = (ordenes: any[]) => {
  const doc = new jsPDF();

  const planificadas  = ordenes.filter(o => o.estado === 'planificada').length;
  const enProceso     = ordenes.filter(o => o.estado === 'en_proceso').length;
  const completadas   = ordenes.filter(o => o.estado === 'completada').length;
  const canceladas    = ordenes.filter(o => o.estado === 'cancelada').length;
  const totalPorciones= ordenes.reduce((s, o) => s + (o.cantidad_porciones || 0), 0);
  const tasaComp      = ordenes.length > 0 ? (completadas / ordenes.length * 100) : 0;
  const totalPages    = 2;

  // ── Portada ──────────────────────────────────────────────────────────────
  coverPage(
    doc,
    'Órdenes de Producción',
    `Reporte operativo · ${ordenes.length} orden${ordenes.length !== 1 ? 'es' : ''} registrada${ordenes.length !== 1 ? 's' : ''}`,
    [
      { label: 'Total Órdenes',       value: String(ordenes.length), color: 'blue'  },
      { label: 'En Proceso',          value: String(enProceso),      color: 'amber' },
      { label: 'Completadas',         value: String(completadas),    color: 'green' },
      { label: 'Tasa de Completitud', value: fmtPct(tasaComp),       color: tasaComp >= 70 ? 'green' : 'amber' },
    ],
    ordenes.map((o, i) => {
      const recNombre = o.receta?.nombre || o.recetas?.nombre || 'N/A';
      const fecha     = o.fecha_programada ? new Date(o.fecha_programada).toLocaleDateString('es-EC') : '—';
      return `${o.numero_orden || `ORD-${String(i+1).padStart(4,'0')}`} · ${recNombre} · ${fecha}`;
    }),
    `${planificadas} planificadas · ${enProceso} en proceso · ${canceladas} canceladas`
  );
  pageFooter(doc, 1, totalPages);

  // ── Página de detalle ─────────────────────────────────────────────────────
  doc.addPage();
  const W   = doc.internal.pageSize.width;
  let yPos  = pageHeader(doc, 'Órdenes de Producción');

  // ── KPIs de resumen ───────────────────────────────────────────────────────
  const kpiW = (W - 28 - 12) / 5;
  kpiBox(doc, 14,                yPos, kpiW, 24, 'Total Órdenes',    String(ordenes.length), 'blue');
  kpiBox(doc, 14 + (kpiW+3),     yPos, kpiW, 24, 'Planificadas',     String(planificadas),   'teal');
  kpiBox(doc, 14 + (kpiW+3)*2,   yPos, kpiW, 24, 'En Proceso',       String(enProceso),      'amber');
  kpiBox(doc, 14 + (kpiW+3)*3,   yPos, kpiW, 24, 'Completadas',      String(completadas),    'green');
  kpiBox(doc, 14 + (kpiW+3)*4,   yPos, kpiW, 24, 'Total Porciones',  fmtN(totalPorciones),   'blue');
  yPos += 30;

  yPos = sectionTitle(doc, 'Detalle de Órdenes de Producción', yPos);

  const estadoLabel: Record<string, string> = {
    planificada: 'Planificada',
    en_proceso:  'En Proceso',
    completada:  'Completada',
    cancelada:   'Cancelada',
  };

  const tableData = ordenes.map((o) => [
    o.numero_orden || '—',
    o.receta?.nombre || o.recetas?.nombre || 'N/A',
    String(o.cantidad_lotes || 1),
    fmtN(o.cantidad_porciones || 0),
    o.fecha_programada ? new Date(o.fecha_programada).toLocaleDateString('es-EC') : '—',
    o.fecha_inicio     ? new Date(o.fecha_inicio).toLocaleDateString('es-EC')     : '—',
    o.fecha_fin        ? new Date(o.fecha_fin).toLocaleDateString('es-EC')        : '—',
    estadoLabel[o.estado] || o.estado || 'N/A',
    o.bodegas_origen?.nombre  || o.bodega_origen?.nombre  || '—',
    o.bodegas_destino?.nombre || o.bodega_destino?.nombre || '—',
    o.usuarios?.nombre_completo || '—',
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['N° Orden', 'Receta', 'Lotes', 'Porciones', 'F. Programada', 'F. Inicio', 'F. Fin', 'Estado', 'Origen', 'Destino', 'Responsable']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor:  [10, 26, 47],
      textColor:  [255, 255, 255],
      fontStyle:  'bold',
      fontSize:   7.5,
      cellPadding: 3,
      halign:     'center',
    },
    bodyStyles:          { fontSize: 7.5, cellPadding: 2.5 },
    alternateRowStyles:  { fillColor: [247, 250, 254] },
    columnStyles: {
      0:  { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      1:  { cellWidth: 32 },
      2:  { cellWidth: 12, halign: 'center' },
      3:  { cellWidth: 17, halign: 'right'  },
      4:  { cellWidth: 20, halign: 'center' },
      5:  { cellWidth: 18, halign: 'center' },
      6:  { cellWidth: 18, halign: 'center' },
      7:  { cellWidth: 18, halign: 'center' },
      8:  { cellWidth: 18 },
      9:  { cellWidth: 18 },
      10: { cellWidth: 23 },
    },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.section === 'body') {
        const val = String(data.cell.raw || '');
        if (val === 'Completada')   { data.cell.styles.textColor = [21, 128, 61];   data.cell.styles.fontStyle = 'bold'; }
        if (val === 'En Proceso')   { data.cell.styles.textColor = [176, 106, 0];   data.cell.styles.fontStyle = 'bold'; }
        if (val === 'Planificada')  { data.cell.styles.textColor = [30, 100, 167];  }
        if (val === 'Cancelada')    { data.cell.styles.textColor = [190, 28, 28];   }
      }
    },
    margin: { left: 14, right: 14 },
  });

  pageFooter(doc, 2, totalPages);
  doc.save(`ordenes_produccion_${fileTs()}.pdf`);
};


// =====================================================
// EXPORTAR ÓRDENES DE PRODUCCIÓN A EXCEL
// =====================================================
export const exportOrdenesProduccionToExcel = (ordenes: any[]) => {
  const data = ordenes.map((o) => ({
    'N° Orden':         o.numero_orden,
    'Receta':           o.receta?.nombre || o.recetas?.nombre || 'N/A',
    'Lotes':            o.cantidad_lotes || 1,
    'Porciones':        o.cantidad_porciones || 0,
    'Fecha Programada': o.fecha_programada ? new Date(o.fecha_programada).toLocaleDateString('es-EC') : 'N/A',
    'Fecha Inicio':     o.fecha_inicio     ? new Date(o.fecha_inicio).toLocaleString('es-EC')         : 'N/A',
    'Fecha Fin':        o.fecha_fin        ? new Date(o.fecha_fin).toLocaleString('es-EC')             : 'N/A',
    'Estado':
      o.estado === 'planificada' ? 'Planificada' :
      o.estado === 'en_proceso'  ? 'En Proceso'  :
      o.estado === 'completada'  ? 'Completada'  : 'Cancelada',
    'Bodega Origen':    o.bodegas_origen?.nombre  || 'N/A',
    'Bodega Destino':   o.bodegas_destino?.nombre || 'N/A',
    'Responsable':      o.usuarios?.nombre_completo || 'N/A',
    'Notas':            o.notas || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 20 }, { wch: 35 }, { wch: 10 }, { wch: 12 },
    { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
    { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Órdenes de Producción');
  XLSX.writeFile(wb, `ordenes_produccion_${fileTs()}.xlsx`);
};


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║               REPORTE KDS — KITCHEN DISPLAY SYSTEM                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
export const exportReporteKDSToPDF = (stats: any, comandas: any[]) => {
  const doc        = new jsPDF();
  const totalPages = 2;
  const W          = doc.internal.pageSize.width;

  const pendientes    = stats.pendientes    || 0;
  const enPrep        = stats.enPreparacion || 0;
  const listas        = stats.listas        || 0;
  const urgentes      = stats.urgentes      || 0;
  const tiempoProm    = stats.tiempoPromedio || 0;
  const eficiencia    = comandas.length > 0 ? (listas / comandas.length * 100) : 0;

  // ── Portada ──────────────────────────────────────────────────────────────
  coverPage(
    doc,
    'Reporte Kitchen Display System',
    `Análisis de desempeño de cocina · ${comandas.length} comanda${comandas.length !== 1 ? 's' : ''}`,
    [
      { label: 'Total Comandas',     value: String(comandas.length), color: 'blue'  },
      { label: 'Tiempo Promedio',    value: `${tiempoProm.toFixed(1)} min`, color: tiempoProm <= 15 ? 'green' : tiempoProm <= 25 ? 'amber' : 'red' },
      { label: 'Urgentes (>20 min)', value: String(urgentes),        color: urgentes > 0 ? 'red' : 'green' },
      { label: 'Tasa de Completitud',value: fmtPct(eficiencia),      color: eficiencia >= 80 ? 'green' : 'amber' },
    ],
    [],
    `Pendientes: ${pendientes} · En preparación: ${enPrep} · Listas: ${listas}`
  );
  pageFooter(doc, 1, totalPages);

  // ── Página de detalle ─────────────────────────────────────────────────────
  doc.addPage();
  let yPos = pageHeader(doc, 'Reporte Kitchen Display System');

  // ── Panel de KPIs operativos ────────────────────────────────────────────
  const kpiW = (W - 28 - 15) / 6;
  kpiBox(doc, 14,                yPos, kpiW, 24, 'Total Comandas',  String(comandas.length),        'blue');
  kpiBox(doc, 14+(kpiW+3),       yPos, kpiW, 24, 'Pendientes',      String(pendientes),             'amber');
  kpiBox(doc, 14+(kpiW+3)*2,     yPos, kpiW, 24, 'En Preparación',  String(enPrep),                 'teal');
  kpiBox(doc, 14+(kpiW+3)*3,     yPos, kpiW, 24, 'Listas',          String(listas),                 'green');
  kpiBox(doc, 14+(kpiW+3)*4,     yPos, kpiW, 24, 'Urgentes',        String(urgentes),               urgentes > 0 ? 'red' : 'gray');
  kpiBox(doc, 14+(kpiW+3)*5,     yPos, kpiW, 24, 'T. Promedio',     `${tiempoProm.toFixed(1)} min`, tiempoProm <= 15 ? 'green' : tiempoProm <= 25 ? 'amber' : 'red');
  yPos += 30;

  // ── Indicador de eficiencia visual ────────────────────────────────────────
  yPos = sectionTitle(doc, 'Indicador de Desempeño Operativo', yPos);

  const barW  = W - 28;
  const barH  = 10;
  sf(doc, C.grayBg); doc.roundedRect(14, yPos, barW, barH, 2, 2, 'F');

  const fillW = (barW * eficiencia) / 100;
  const fillColor: RGB = eficiencia >= 80 ? C.green : eficiencia >= 50 ? C.amber : C.red;
  sf(doc, fillColor); doc.roundedRect(14, yPos, fillW, barH, 2, 2, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  st(doc, C.white);
  if (fillW > 30) doc.text(`${fmtPct(eficiencia)} completadas`, 18, yPos + 7);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  st(doc, C.grayText);
  doc.text(`Eficiencia de cocina: ${fmtPct(eficiencia)}`, W - 14, yPos + 7, { align: 'right' });
  yPos += 17;

  // ── Tabla de comandas ─────────────────────────────────────────────────────
  yPos = sectionTitle(doc, 'Detalle de Comandas', yPos);

  const tableData = comandas.map((c) => {
    const waitMin = Math.floor((Date.now() - new Date(c.fecha_creacion).getTime()) / 60000);
    const estadoLabel =
      c.estado === 'pendiente'      ? 'Pendiente'      :
      c.estado === 'en_preparacion' ? 'En Preparación' : 'Lista';
    return [
      `Mesa ${c.numero_mesa || 'N/A'}`,
      estadoLabel,
      new Date(c.fecha_creacion).toLocaleTimeString('es-EC'),
      `${waitMin} min`,
      String((c.comanda_items || []).length),
      waitMin > 20 ? '⚠ URGENTE' : waitMin > 15 ? '⚡ Demorado' : '✓ Normal',
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Mesa / Origen', 'Estado', 'Hora Apertura', 'Tiempo Espera', 'N° Ítems', 'Alerta']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor:   [10, 26, 47],
      textColor:   [255, 255, 255],
      fontStyle:   'bold',
      fontSize:    8.5,
      cellPadding: 3,
      halign:      'center',
    },
    bodyStyles:         { fontSize: 8.5, cellPadding: 3 },
    alternateRowStyles: { fillColor: [247, 250, 254] },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' },
      1: { cellWidth: 28, halign: 'center'  },
      2: { cellWidth: 28, halign: 'center'  },
      3: { cellWidth: 24, halign: 'center'  },
      4: { cellWidth: 18, halign: 'center'  },
      5: { cellWidth: 30, halign: 'center'  },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index === 1) {
        const v = String(data.cell.raw || '');
        if (v === 'Lista')           { data.cell.styles.textColor = [21, 128, 61];  data.cell.styles.fontStyle = 'bold'; }
        if (v === 'En Preparación')  { data.cell.styles.textColor = [176, 106, 0];  data.cell.styles.fontStyle = 'bold'; }
        if (v === 'Pendiente')       { data.cell.styles.textColor = [30, 100, 167]; }
      }
      if (data.column.index === 5) {
        const v = String(data.cell.raw || '');
        if (v.includes('URGENTE'))   { data.cell.styles.textColor = [190, 28, 28];  data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [253, 232, 232]; }
        if (v.includes('Demorado'))  { data.cell.styles.textColor = [176, 106, 0];  data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [255, 247, 210]; }
        if (v.includes('Normal'))    { data.cell.styles.textColor = [21, 128, 61];  }
      }
    },
    margin: { left: 14, right: 14 },
  });

  pageFooter(doc, 2, totalPages);
  doc.save(`reporte_kds_${fileTs()}.pdf`);
};


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║              UTILIDADES GENERALES — PDF EJECUTIVO                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** PDF genérico con portada ejecutiva y tabla de datos. */
export const exportToPDF = (
  data: any[],
  columns: Array<{ header: string; key: string }>,
  title: string,
  filename: string,
  kpis?: Array<{ label: string; value: string; color: 'blue' | 'green' | 'red' | 'amber' | 'gray' | 'teal' }>
) => {
  const doc        = new jsPDF();
  const totalPages = 2;
  const W          = doc.internal.pageSize.width;

  coverPage(
    doc,
    title,
    `Reporte generado el ${dateStr()}`,
    kpis || [{ label: 'Total Registros', value: String(data.length), color: 'blue' }],
    data.slice(0, 8).map((row, i) => `${i + 1}. ${String(row[columns[0]?.key] || '')}`)
  );
  pageFooter(doc, 1, totalPages);

  doc.addPage();
  let yPos = pageHeader(doc, title);

  yPos = sectionTitle(doc, 'Datos del Reporte', yPos);

  autoTable(doc, {
    startY: yPos,
    head: [columns.map(c => c.header)],
    body: data.map(row => columns.map(col => String(row[col.key] ?? ''))),
    theme: 'grid',
    headStyles: {
      fillColor: [10, 26, 47], textColor: [255, 255, 255],
      fontStyle: 'bold', fontSize: 9, cellPadding: 3,
    },
    bodyStyles:         { fontSize: 8.5, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [247, 250, 254] },
    margin: { left: 14, right: 14 },
  });

  pageFooter(doc, 2, totalPages);
  doc.save(`${filename}_${fileTs()}.pdf`);
};

/** PDF multi-sección con portada ejecutiva. */
export const exportReportToPDF = (
  sections: Array<{ title: string; data: any[]; columns: Array<{ header: string; key: string }> }>,
  reportTitle: string,
  filename: string,
  kpis?: Array<{ label: string; value: string; color: 'blue' | 'green' | 'red' | 'amber' | 'gray' | 'teal' }>
) => {
  const doc = new jsPDF();
  const totalPages = sections.length + 1;
  const W   = doc.internal.pageSize.width;

  coverPage(
    doc,
    reportTitle,
    `Informe completo · ${sections.length} sección${sections.length !== 1 ? 'es' : ''}`,
    kpis || sections.map(s => ({
      label: s.title,
      value: String(s.data.length),
      color: 'blue' as const,
    })).slice(0, 4),
    sections.map(s => `${s.title} — ${s.data.length} registro${s.data.length !== 1 ? 's' : ''}`)
  );
  pageFooter(doc, 1, totalPages);

  sections.forEach((section, idx) => {
    doc.addPage();
    let yPos = pageHeader(doc, reportTitle);
    yPos = sectionTitle(doc, section.title, yPos);

    autoTable(doc, {
      startY: yPos,
      head: [section.columns.map(c => c.header)],
      body: section.data.map(row => section.columns.map(col => String(row[col.key] ?? ''))),
      theme: 'grid',
      headStyles: {
        fillColor: [10, 26, 47], textColor: [255, 255, 255],
        fontStyle: 'bold', fontSize: 9, cellPadding: 3,
      },
      bodyStyles:         { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [247, 250, 254] },
      margin: { left: 14, right: 14 },
    });

    pageFooter(doc, idx + 2, totalPages);
  });

  doc.save(`${filename}_${fileTs()}.pdf`);
};


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                    EXCEL — SISTEMA DE ESTILO PROFESIONAL                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ── Constantes de estilo Excel ────────────────────────────────────────────
const BRAND_DARK  = '0A1A2F';
const BRAND_MID   = '1e64a7';
const BRAND_LIGHT = '00E5FF';
const WHITE       = 'FFFFFF';
const GRAY_LIGHT  = 'F2F6FC';
const GRAY_MID    = 'D0DCF0';
const GREEN_BG    = 'E6F4EA';
const GREEN_FG    = '1A7340';
const RED_BG      = 'FDECEA';
const RED_FG      = 'B71C1C';
const TOTAL_BG    = 'E8EEF8';

const border = (color = 'B0BEC5') => ({
  top:    { style: 'thin', color: { rgb: color } },
  bottom: { style: 'thin', color: { rgb: color } },
  left:   { style: 'thin', color: { rgb: color } },
  right:  { style: 'thin', color: { rgb: color } },
});

const headerStyle = (bgRgb = BRAND_MID) => ({
  font:      { bold: true, color: { rgb: WHITE }, sz: 11 },
  fill:      { fgColor: { rgb: bgRgb } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border:    border('1A3A6B'),
});

const dataStyle = (bg = WHITE, bold = false, align: string = 'left') => ({
  font:      { bold, sz: 10, color: { rgb: '1A1A2E' } },
  fill:      { fgColor: { rgb: bg } },
  alignment: { horizontal: align, vertical: 'center' },
  border:    border(),
});

const currencyStyle = (bg = WHITE, bold = false) => ({
  font:      { bold, sz: 10, color: { rgb: bold ? BRAND_MID : '2C3E50' } },
  fill:      { fgColor: { rgb: bg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border:    border(),
  numFmt:    '"$"#,##0.00',
});

const totalRowStyle = (align: string = 'left') => ({
  font:      { bold: true, sz: 10, color: { rgb: BRAND_MID } },
  fill:      { fgColor: { rgb: TOTAL_BG } },
  alignment: { horizontal: align, vertical: 'center' },
  border:    border('8FA8D0'),
});

const totalCurrencyStyle = () => ({
  font:      { bold: true, sz: 11, color: { rgb: BRAND_MID } },
  fill:      { fgColor: { rgb: TOTAL_BG } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border:    border('8FA8D0'),
  numFmt:    '"$"#,##0.00',
});

function parseMoney(v: any): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const clean = v.replace(/[$,%]/g, '').replace(/,/g, '').trim();
    const n = parseFloat(clean);
    if (!isNaN(n)) return n;
  }
  return null;
}

function isCurrencyCol(key: string, sample: any): boolean {
  const currencyKeys = ['saldo','total','monto','valor','precio','costo','ingreso','gasto','utilidad',
                        'debito','credito','presupuesto','real','variacion','caja','bancos','cxc','cxp',
                        'debit','credit','balance','amount','budget'];
  const lk = key.toLowerCase();
  return currencyKeys.some(k => lk.includes(k)) || parseMoney(sample) !== null;
}

function isTotalRow(row: any): boolean {
  const vals = Object.values(row);
  return vals.some(v => typeof v === 'string' && /^(TOTAL|RESUMEN|SUBTOTAL|GRAND)/i.test(v as string));
}

export const exportToExcel = (
  data: any[],
  filename: string,
  sheetName: string = 'Datos',
  options: { title?: string; subtitle?: string } = {}
) => {
  if (!data || data.length === 0) return;

  const keys     = Object.keys(data[0]);
  const title    = options.title    || sheetName;
  const subtitle = options.subtitle || `Generado: ${new Date().toLocaleString('es-EC')}`;

  const HEADER_ROW = 3;
  const DATA_START = 4;

  const wsData: any[][] = [];
  wsData.push([title]);
  wsData.push([subtitle]);
  wsData.push([]);
  wsData.push(keys);
  data.forEach(row => {
    wsData.push(keys.map(k => {
      const v = row[k];
      const money = parseMoney(v);
      if (money !== null && isCurrencyCol(k, v)) return money;
      return v ?? '';
    }));
  });

  const ws = XLSXStyle.utils.aoa_to_sheet(wsData);
  const addr = (r: number, c: number) => XLSXStyle.utils.encode_cell({ r, c });

  ws[addr(0, 0)] = {
    v: title, t: 's',
    s: { font: { bold: true, sz: 14, color: { rgb: WHITE } }, fill: { fgColor: { rgb: BRAND_DARK } }, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  ws[addr(1, 0)] = {
    v: subtitle, t: 's',
    s: { font: { italic: true, sz: 9, color: { rgb: '5A6A8A' } }, fill: { fgColor: { rgb: 'E8EEF8' } }, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  keys.forEach((k, c) => { ws[addr(HEADER_ROW, c)] = { v: k, t: 's', s: headerStyle() }; });

  data.forEach((row, ri) => {
    const isTotal = isTotalRow(row);
    const bg      = isTotal ? TOTAL_BG : ri % 2 === 0 ? WHITE : GRAY_LIGHT;
    keys.forEach((k, c) => {
      const rawVal  = row[k];
      const money   = parseMoney(rawVal);
      const isMoney = money !== null && isCurrencyCol(k, rawVal);
      const cellAddr = addr(DATA_START + ri, c);
      const existing = ws[cellAddr];
      if (isTotal) {
        ws[cellAddr] = { v: isMoney ? money : (existing?.v ?? rawVal ?? ''), t: isMoney ? 'n' : 's', s: isMoney ? totalCurrencyStyle() : totalRowStyle(c === 0 ? 'left' : 'right'), ...(isMoney ? { z: '"$"#,##0.00' } : {}) };
      } else {
        ws[cellAddr] = { v: isMoney ? money : (existing?.v ?? rawVal ?? ''), t: isMoney ? 'n' : 's', s: isMoney ? currencyStyle(bg) : dataStyle(bg, false, c > 0 ? 'right' : 'left'), ...(isMoney ? { z: '"$"#,##0.00' } : {}) };
      }
    });
  });

  const mergeEnd = Math.max(keys.length - 1, 0);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: mergeEnd } }, { s: { r: 1, c: 0 }, e: { r: 1, c: mergeEnd } }];
  ws['!rows']   = [{ hpt: 28 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }, ...data.map(() => ({ hpt: 18 }))];
  ws['!cols']   = keys.map(k => ({ wch: Math.min(Math.max(k.length + 2, data.reduce((mx, r) => Math.max(mx, String(r[k] ?? '').length), 0) + 2, 10), 45) }));
  ws['!ref']    = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: DATA_START + data.length - 1, c: keys.length - 1 } });

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  XLSXStyle.writeFile(wb, `${filename}_${fileTs()}.xlsx`);
};

export const exportMultipleSheetsToExcel = (
  sheets: Array<{ name: string; data: any[]; title?: string }>,
  filename: string
) => {
  const wb = XLSXStyle.utils.book_new();

  sheets.forEach(sheet => {
    if (!sheet.data || sheet.data.length === 0) return;
    const keys      = Object.keys(sheet.data[0]);
    const title     = sheet.title || sheet.name;
    const subtitle  = `Generado: ${new Date().toLocaleString('es-EC')}`;
    const HEADER_ROW = 3;
    const DATA_START = 4;

    const wsData: any[][] = [
      [title], [subtitle], [],
      keys,
      ...sheet.data.map(row => keys.map(k => {
        const v = row[k];
        const m = parseMoney(v);
        return (m !== null && isCurrencyCol(k, v)) ? m : (v ?? '');
      })),
    ];

    const ws   = XLSXStyle.utils.aoa_to_sheet(wsData);
    const addr = (r: number, c: number) => XLSXStyle.utils.encode_cell({ r, c });
    const mergeEnd = Math.max(keys.length - 1, 0);

    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: mergeEnd } }, { s: { r: 1, c: 0 }, e: { r: 1, c: mergeEnd } }];
    ws[addr(0, 0)] = { v: title,    t: 's', s: { font: { bold: true, sz: 14, color: { rgb: WHITE } }, fill: { fgColor: { rgb: BRAND_DARK } }, alignment: { horizontal: 'left', vertical: 'center' } } };
    ws[addr(1, 0)] = { v: subtitle, t: 's', s: { font: { italic: true, sz: 9, color: { rgb: '5A6A8A' } }, fill: { fgColor: { rgb: 'E8EEF8' } }, alignment: { horizontal: 'left', vertical: 'center' } } };
    keys.forEach((k, c) => { ws[addr(HEADER_ROW, c)] = { v: k, t: 's', s: headerStyle() }; });

    sheet.data.forEach((row, ri) => {
      const isTotal = isTotalRow(row);
      const bg = isTotal ? TOTAL_BG : ri % 2 === 0 ? WHITE : GRAY_LIGHT;
      keys.forEach((k, c) => {
        const rawVal  = row[k];
        const money   = parseMoney(rawVal);
        const isMoney = money !== null && isCurrencyCol(k, rawVal);
        ws[addr(DATA_START + ri, c)] = {
          v: isMoney ? money : (rawVal ?? ''),
          t: isMoney ? 'n' : 's',
          s: isTotal ? (isMoney ? totalCurrencyStyle() : totalRowStyle(c === 0 ? 'left' : 'right')) : (isMoney ? currencyStyle(bg) : dataStyle(bg, false, c > 0 ? 'right' : 'left')),
          ...(isMoney ? { z: '"$"#,##0.00' } : {}),
        };
      });
    });

    ws['!rows'] = [{ hpt: 28 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }, ...sheet.data.map(() => ({ hpt: 18 }))];
    ws['!cols'] = keys.map(k => ({ wch: Math.min(Math.max(k.length + 2, ...sheet.data.map(r => String(r[k] ?? '').length + 2), 10), 45) }));
    ws['!ref']  = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: DATA_START + sheet.data.length - 1, c: keys.length - 1 } });

    XLSXStyle.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  });

  XLSXStyle.writeFile(wb, `${filename}_${fileTs()}.xlsx`);
};


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     UTILIDADES DE FORMATO                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
export const formatCurrency  = (amount: number): string =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

export const formatDate      = (date: string | Date): string =>
  new Date(date).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

export const formatDateTime  = (date: string | Date): string =>
  new Date(date).toLocaleString('es-EC', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                  PREPARADORES DE DATOS CONTABLES                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
export const prepareAccountingData = (entries: any[]): any[] =>
  entries.map((entry, index) => {
    const totalDebit  = entry.items?.reduce((s: number, i: any) => s + (i.debit  || 0), 0) || 0;
    const totalCredit = entry.items?.reduce((s: number, i: any) => s + (i.credit || 0), 0) || 0;
    return {
      'Número':        entry.entryNumber || `ASI-${String(index + 1).padStart(6, '0')}`,
      'Fecha':         formatDate(entry.date || new Date()),
      'Descripción':   entry.description || 'Sin descripción',
      'Total Débito':  formatCurrency(totalDebit),
      'Total Crédito': formatCurrency(totalCredit),
      'Estado':        entry.status === 'approved' ? 'Aprobado' : entry.status === 'pending' ? 'Pendiente' : entry.status === 'rejected' ? 'Rechazado' : 'Borrador',
      'Creado':        formatDateTime(entry.createdAt || entry.created_at || new Date()),
      'Notas':         entry.notes || '',
    };
  });

export const prepareAccountingDataDetailed = (entries: any[]): any[] => {
  const detailed: any[] = [];
  entries.forEach((entry, entryIndex) => {
    entry.items?.forEach((item: any, itemIndex: number) => {
      detailed.push({
        'Número Asiento':    entry.entryNumber || `ASI-${String(entryIndex + 1).padStart(6, '0')}`,
        'Fecha':             formatDate(entry.date || new Date()),
        'Descripción Asiento': entry.description || 'Sin descripción',
        'Línea':             itemIndex + 1,
        'Código Cuenta':     item.account?.code || item.accountCode || 'N/A',
        'Nombre Cuenta':     item.account?.name || item.accountName || 'N/A',
        'Tipo Cuenta':       item.account?.type || item.accountType || 'N/A',
        'Descripción Línea': item.description || '-',
        'Débito':            item.debit  ? formatCurrency(item.debit)  : '$0.00',
        'Crédito':           item.credit ? formatCurrency(item.credit) : '$0.00',
        'Estado':            entry.status === 'approved' ? 'Aprobado' : entry.status === 'pending' ? 'Pendiente' : entry.status === 'rejected' ? 'Rechazado' : 'Borrador',
      });
    });
  });
  return detailed;
};

export const prepareLedgerData = (ledgerEntries: any[]): any[] =>
  ledgerEntries.map(entry => ({
    'Fecha':         formatDate(entry.date || new Date()),
    'Código Cuenta': entry.account?.code || entry.accountCode || 'N/A',
    'Nombre Cuenta': entry.account?.name || entry.accountName || 'N/A',
    'Descripción':   entry.description || 'Sin descripción',
    'Débito':        entry.debit  ? formatCurrency(entry.debit)  : '$0.00',
    'Crédito':       entry.credit ? formatCurrency(entry.credit) : '$0.00',
    'Saldo':         formatCurrency(entry.balance || 0),
    'Tipo':          entry.entryType || 'Operación',
    'Referencia':    entry.reference || '-',
  }));

export const prepareTrialBalanceData = (accounts: any[]): any[] =>
  accounts.map(account => ({
    'Código':          account.code || 'N/A',
    'Nombre de Cuenta':account.name || 'Sin nombre',
    'Tipo':            account.type === 'asset' ? 'Activo' : account.type === 'liability' ? 'Pasivo' : account.type === 'equity' ? 'Patrimonio' : account.type === 'income' ? 'Ingreso' : 'Gasto',
    'Saldo Débito':    account.balance > 0 ? formatCurrency(account.balance)            : '$0.00',
    'Saldo Crédito':   account.balance < 0 ? formatCurrency(Math.abs(account.balance))  : '$0.00',
    'Saldo Final':     formatCurrency(account.balance || 0),
  }));

export const prepareProjectsData = (projects: any[]): any[] =>
  projects.map((p) => ({
    'Código':             p.code || p.id || 'N/A',
    'Nombre del Proyecto':p.name || p.nombre || 'Sin nombre',
    'Cliente':            p.client || p.cliente || 'N/A',
    'Estado':             p.status === 'planning' ? 'Planificación' : p.status === 'in_progress' ? 'En Progreso' : p.status === 'on_hold' ? 'En Espera' : p.status === 'completed' ? 'Completado' : p.status === 'cancelled' ? 'Cancelado' : 'N/A',
    'Prioridad':          p.priority === 'high' ? 'Alta' : p.priority === 'medium' ? 'Media' : 'Baja',
    'Fecha Inicio':       p.startDate || p.fecha_inicio ? formatDate(p.startDate || p.fecha_inicio) : 'N/A',
    'Fecha Fin':          p.endDate   || p.fecha_fin    ? formatDate(p.endDate   || p.fecha_fin)    : 'N/A',
    'Presupuesto':        p.budget       ? formatCurrency(p.budget)       : p.presupuesto ? formatCurrency(p.presupuesto) : '$0.00',
    'Costo Real':         p.actualCost   ? formatCurrency(p.actualCost)   : p.costo_real  ? formatCurrency(p.costo_real)  : '$0.00',
    'Progreso':           `${p.progress || p.progreso || 0}%`,
    'Responsable':        p.manager || p.responsable || 'N/A',
    'Equipo':             p.team?.length || p.equipo?.length || 0,
    'Descripción':        p.description || p.descripcion || '',
  }));

export const prepareTasksData = (tasks: any[]): any[] =>
  tasks.map((t) => ({
    'ID Tarea':          t.id || t.taskId || 'N/A',
    'Proyecto':          t.projectName || t.proyecto || 'N/A',
    'Nombre de Tarea':   t.name || t.nombre || 'Sin nombre',
    'Estado':            t.status === 'pending' ? 'Pendiente' : t.status === 'in_progress' ? 'En Progreso' : t.status === 'completed' ? 'Completada' : t.status === 'blocked' ? 'Bloqueada' : 'N/A',
    'Prioridad':         t.priority === 'high' ? 'Alta' : t.priority === 'medium' ? 'Media' : 'Baja',
    'Asignado a':        t.assignedTo || t.asignado || 'Sin asignar',
    'Fecha Inicio':      t.startDate || t.fecha_inicio ? formatDate(t.startDate || t.fecha_inicio) : 'N/A',
    'Fecha Fin':         t.endDate   || t.fecha_fin    ? formatDate(t.endDate   || t.fecha_fin)    : 'N/A',
    'Duración':          t.duration  ? `${t.duration}  días` : t.duracion ? `${t.duracion} días` : 'N/A',
    'Progreso':          `${t.progress || t.progreso || 0}%`,
    'Horas Estimadas':   t.estimatedHours || t.horas_estimadas || 0,
    'Horas Reales':      t.actualHours    || t.horas_reales    || 0,
    'Descripción':       t.description || t.descripcion || '',
  }));
