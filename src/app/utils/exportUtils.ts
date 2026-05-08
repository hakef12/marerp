import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// =====================================================
// EXPORTAR RECETAS A PDF
// =====================================================
// ✅ AHORA RECIBE EL CATÁLOGO DE PRODUCTOS PARA TRADUCIR LOS IDs
export const exportRecetasToPDF = (recetas: any[], catalogoProductos: any[] = []) => {
  const doc = new jsPDF();
  
  // Portada
  doc.setFillColor(30, 100, 167);
  doc.rect(0, 0, 210, 50, 'F');
  
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text('FICHAS TÉCNICAS DE RECETAS', 105, 25, { align: 'center' });
  
  doc.setFontSize(12);
  doc.text(`Total de Recetas: ${recetas.length}`, 105, 35, { align: 'center' });
  doc.text(`Generado: ${new Date().toLocaleString()}`, 105, 42, { align: 'center' });
  
  // Por cada receta, crear una página completa con toda la información
  recetas.forEach((receta, index) => {
    doc.addPage();
    
    // ==========================================
    // ENCABEZADO DE LA RECETA
    // ==========================================
    doc.setFillColor(30, 100, 167);
    doc.rect(0, 0, 210, 45, 'F');
    
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(receta.nombre || 'Sin nombre', 105, 20, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`Categoría: ${receta.categoria || 'N/A'}`, 14, 32);
    doc.text(`Porciones: ${receta.porciones || 1}`, 105, 32, { align: 'center' });
    doc.text(`Dificultad: ${receta.dificultad || 'Media'}`, 196, 32, { align: 'right' });
    
    doc.text(`Tiempo: ${receta.tiempo_preparacion || 0} min`, 14, 39);
    doc.text(`Código: REC-${String(index + 1).padStart(4, '0')}`, 196, 39, { align: 'right' });
    
    let yPos = 55;
    
    // ==========================================
    // DESCRIPCIÓN
    // ==========================================
    if (receta.descripcion) {
      doc.setFontSize(12);
      doc.setTextColor(30, 100, 167);
      doc.text('DESCRIPCIÓN', 14, yPos);
      
      yPos += 7;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const splitDescripcion = doc.splitTextToSize(receta.descripcion, 180);
      doc.text(splitDescripcion, 14, yPos);
      yPos += splitDescripcion.length * 5 + 5;
    }
    
    // ==========================================
    // INFORMACIÓN DE COSTOS
    // ==========================================
    yPos += 3;
    doc.setFillColor(240, 248, 255);
    doc.rect(14, yPos - 5, 182, 28, 'F');
    doc.setDrawColor(30, 100, 167);
    doc.rect(14, yPos - 5, 182, 28);
    
    doc.setFontSize(12);
    doc.setTextColor(30, 100, 167);
    doc.text('INFORMACIÓN DE COSTOS Y RENTABILIDAD', 14, yPos);
    
    // Cálculos de seguridad
    const costoTotalReal = receta.costo_total || 0;
    const costoPorcionReal = receta.costo_por_porcion || 0;
    const precioVentaReal = receta.precio_sugerido || 0;
    const ganancia = precioVentaReal - costoPorcionReal;

    yPos += 8;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Costo Total de Producción:`, 18, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`$${costoTotalReal.toFixed(2)}`, 90, yPos);
    doc.setFont(undefined, 'normal');
    
    yPos += 6;
    doc.text(`Costo por Porción:`, 18, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`$${costoPorcionReal.toFixed(2)}`, 90, yPos);
    doc.setFont(undefined, 'normal');
    
    yPos += 6;
    doc.text(`Precio de Venta Sugerido:`, 18, yPos);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 128, 0);
    doc.text(`$${precioVentaReal.toFixed(2)}`, 90, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    
    // Columna derecha
    yPos -= 12;
    doc.text(`Margen de Ganancia:`, 110, yPos);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 128, 0);
    doc.text(`${receta.margen_ganancia?.toFixed(1) || '0.0'}%`, 170, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    
    yPos += 6;
    doc.text(`Food Cost:`, 110, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`${receta.food_cost?.toFixed(1) || '0.0'}%`, 170, yPos);
    doc.setFont(undefined, 'normal');
    
    yPos += 6;
    doc.text(`Ganancia por Porción:`, 110, yPos);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 128, 0);
    doc.text(`$${ganancia.toFixed(2)}`, 170, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    
    yPos += 12;
    
    // ==========================================
    // TABLA DE INGREDIENTES
    // ==========================================
    doc.setFontSize(12);
    doc.setTextColor(30, 100, 167);
    doc.text('INGREDIENTES Y MATERIA PRIMA', 14, yPos);
    
    yPos += 3;
    
    // ✅ CORRECCIÓN: TRADUCTOR INTELIGENTE DE INGREDIENTES PARA PDF
    const listaIngredientes = receta.ingredientes || receta.receta_ingredientes || [];
    
    const ingredientesData = listaIngredientes.map((ing: any, idx: number) => {
      // Intentar traducir el ID buscando en el catálogo de productos
      const idBuscado = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id);
      const prodCatalogo = catalogoProductos.find((p: any) => String(p.id) === idBuscado);
      
      const nombreReal = ing.insumo?.nombre || ing.productos?.nombre || ing.nombre_producto || prodCatalogo?.nombre || 'Ingrediente Desconocido';
      const costoUnitario = parseFloat(ing.costo_unitario) || parseFloat(prodCatalogo?.costo_promedio) || parseFloat(prodCatalogo?.precio_compra) || 0;
      const cantidad = parseFloat(ing.cantidad) || 0;

      return [
        idx + 1,
        nombreReal,
        `${cantidad} ${ing.unidad_medida || 'und'}`,
        `$${costoUnitario.toFixed(2)}`,
        `$${(costoUnitario * cantidad).toFixed(2)}`,
        ing.notas || '-'
      ];
    });
    
    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Ingrediente', 'Cantidad', 'Costo Unit.', 'Costo Total', 'Notas']],
      body: ingredientesData,
      theme: 'striped',
      headStyles: { 
        fillColor: [30, 100, 167],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: { 
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 37, fontSize: 7 }
      }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
    
    // ==========================================
    // INSTRUCCIONES DE PREPARACIÓN
    // ==========================================
    if (receta.instrucciones) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setTextColor(30, 100, 167);
      doc.text('INSTRUCCIONES DE PREPARACIÓN', 14, yPos);
      
      yPos += 7;
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const splitInstrucciones = doc.splitTextToSize(receta.instrucciones, 180);
      
      if (yPos + (splitInstrucciones.length * 5) > 280) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setTextColor(30, 100, 167);
        doc.text('INSTRUCCIONES DE PREPARACIÓN (continuación)', 14, yPos);
        yPos += 7;
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
      }
      
      doc.text(splitInstrucciones, 14, yPos);
    }
    
    // ==========================================
    // PIE DE PÁGINA
    // ==========================================
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Ficha Técnica - Receta: ${receta.nombre}`, 14, pageHeight - 10);
    doc.text(`Página ${index + 2} de ${recetas.length + 1}`, 196, pageHeight - 10, { align: 'right' });
    doc.text(`Generado: ${new Date().toLocaleDateString()}`, 105, pageHeight - 10, { align: 'center' });
  });
  
  doc.save(`fichas_tecnicas_recetas_${new Date().getTime()}.pdf`);
};

// =====================================================
// EXPORTAR RECETAS A EXCEL
// =====================================================
export const exportRecetasToExcel = (recetas: any[], catalogoProductos: any[] = []) => {
  // Hoja 1: Ficha Técnica Completa
  const fichaTecnicaData = recetas.map((receta) => {
    const listaIngredientes = receta.ingredientes || receta.receta_ingredientes || [];
    return {
      'Código': `REC-${String(recetas.indexOf(receta) + 1).padStart(4, '0')}`,
      'Nombre de la Receta': receta.nombre,
      'Descripción': receta.descripcion || '',
      'Categoría': receta.categoria || 'N/A',
      'Porciones': receta.porciones,
      'Tiempo de Preparación (min)': receta.tiempo_preparacion || 0,
      'Dificultad': receta.dificultad || 'Media',
      'Costo Total Producción': receta.costo_total || 0,
      'Costo por Porción': receta.costo_por_porcion || 0,
      'Precio Venta Sugerido': receta.precio_sugerido || 0,
      'Ganancia por Porción': (receta.precio_sugerido || 0) - (receta.costo_por_porcion || 0),
      'Margen de Ganancia %': receta.margen_ganancia || 0,
      'Food Cost %': receta.food_cost || 0,
      'N° Ingredientes': listaIngredientes.length,
      'Instrucciones': receta.instrucciones || ''
    };
  });
  
  // Hoja 2: Ingredientes detallados por receta
  const ingredientesData: any[] = [];
  recetas.forEach((receta) => {
    const listaIngredientes = receta.ingredientes || receta.receta_ingredientes || [];
    listaIngredientes.forEach((ing: any, idx: number) => {
      
      // ✅ TRADUCTOR ACTIVO PARA EXCEL
      const idBuscado = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id);
      const prodCatalogo = catalogoProductos.find((p: any) => String(p.id) === idBuscado);
      
      const nombreReal = ing.insumo?.nombre || ing.productos?.nombre || ing.nombre_producto || prodCatalogo?.nombre || 'Ingrediente Desconocido';
      const costoUnitario = parseFloat(ing.costo_unitario) || parseFloat(prodCatalogo?.costo_promedio) || parseFloat(prodCatalogo?.precio_compra) || 0;
      const cantidad = parseFloat(ing.cantidad) || 0;

      ingredientesData.push({
        'Código Receta': `REC-${String(recetas.indexOf(receta) + 1).padStart(4, '0')}`,
        'Receta': receta.nombre,
        'N°': idx + 1,
        'Ingrediente': nombreReal,
        'Cantidad': cantidad,
        'Unidad de Medida': ing.unidad_medida || 'und',
        'Costo Unitario': costoUnitario,
        'Costo Total': costoUnitario * cantidad,
        'Notas': ing.notas || ''
      });
    });
  });
  
  // Hoja 3: Instrucciones de preparación
  const instruccionesData = recetas.map((receta) => ({
    'Código': `REC-${String(recetas.indexOf(receta) + 1).padStart(4, '0')}`,
    'Receta': receta.nombre,
    'Porciones': receta.porciones,
    'Tiempo (min)': receta.tiempo_preparacion || 0,
    'Dificultad': receta.dificultad || 'Media',
    'Instrucciones Paso a Paso': receta.instrucciones || 'Sin instrucciones'
  }));
  
  // Hoja 4: Análisis de costos
  const costosData = recetas.map((receta) => {
    const ganancia = (receta.precio_sugerido || 0) - (receta.costo_por_porcion || 0);
    return {
      'Receta': receta.nombre,
      'Categoría': receta.categoria || 'N/A',
      'Porciones': receta.porciones,
      'Costo Materia Prima Total': receta.costo_total || 0,
      'Costo por Porción': receta.costo_por_porcion || 0,
      'Precio Venta': receta.precio_sugerido || 0,
      'Ganancia Bruta': ganancia,
      'Margen %': receta.margen_ganancia || 0,
      'Food Cost %': receta.food_cost || 0,
      'Ingresos (si vende todas)': (receta.precio_sugerido || 0) * receta.porciones,
      'Utilidad Total': ganancia * receta.porciones
    };
  });
  
  const wb = XLSX.utils.book_new();
  
  const ws1 = XLSX.utils.json_to_sheet(fichaTecnicaData);
  const ws2 = XLSX.utils.json_to_sheet(ingredientesData);
  const ws3 = XLSX.utils.json_to_sheet(instruccionesData);
  const ws4 = XLSX.utils.json_to_sheet(costosData);
  
  ws1['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 80 }];
  ws2['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 8 }, { wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }];
  ws3['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 100 }];
  ws4['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
  
  XLSX.utils.book_append_sheet(wb, ws1, 'Fichas Técnicas Completas');
  XLSX.utils.book_append_sheet(wb, ws2, 'Ingredientes Detallados');
  XLSX.utils.book_append_sheet(wb, ws3, 'Instrucciones Preparación');
  XLSX.utils.book_append_sheet(wb, ws4, 'Análisis de Costos');
  
  XLSX.writeFile(wb, `fichas_tecnicas_recetas_${new Date().getTime()}.xlsx`);
};

// =====================================================
// EXPORTAR ÓRDENES DE PRODUCCIÓN A PDF
// =====================================================
export const exportOrdenesProduccionToPDF = (ordenes: any[]) => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.setTextColor(30, 100, 167);
  doc.text('Órdenes de Producción Activas', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 28);
  
  const tableData = ordenes.map((orden) => [
    orden.numero_orden,
    orden.receta?.nombre || orden.recetas?.nombre || 'N/A',
    orden.cantidad_lotes?.toString() || '1',
    orden.cantidad_porciones?.toString() || '0',
    new Date(orden.fecha_programada).toLocaleDateString(),
    orden.estado === 'planificada' ? 'Planificada' :
    orden.estado === 'en_proceso' ? 'En Proceso' :
    orden.estado === 'completada' ? 'Completada' : 'Cancelada',
    orden.usuarios?.nombre_completo || 'N/A'
  ]);
  
  autoTable(doc, {
    startY: 35,
    head: [['N° Orden', 'Receta', 'Lotes', 'Porciones', 'Fecha', 'Estado', 'Responsable']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 100, 167], fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 45 }, 2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 25, halign: 'center' }, 6: { cellWidth: 30 }
    }
  });
  
  const yPos = (doc as any).lastAutoTable.finalY + 15;
  
  doc.setFontSize(12);
  doc.setTextColor(30, 100, 167);
  doc.text('Estadísticas', 14, yPos);
  
  const planificadas = ordenes.filter(o => o.estado === 'planificada').length;
  const enProceso = ordenes.filter(o => o.estado === 'en_proceso').length;
  const completadas = ordenes.filter(o => o.estado === 'completada').length;
  const totalPorciones = ordenes.reduce((sum, o) => sum + (o.cantidad_porciones || 0), 0);
  
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Total de órdenes: ${ordenes.length}`, 14, yPos + 10);
  doc.text(`Planificadas: ${planificadas}`, 14, yPos + 17);
  doc.text(`En proceso: ${enProceso}`, 14, yPos + 24);
  doc.text(`Completadas: ${completadas}`, 14, yPos + 31);
  doc.text(`Total de porciones a producir: ${totalPorciones}`, 14, yPos + 38);
  
  doc.save(`ordenes_produccion_${new Date().getTime()}.pdf`);
};

// =====================================================
// EXPORTAR ÓRDENES DE PRODUCCIÓN A EXCEL
// =====================================================
export const exportOrdenesProduccionToExcel = (ordenes: any[]) => {
  const data = ordenes.map((orden) => ({
    'N° Orden': orden.numero_orden,
    'Receta': orden.receta?.nombre || orden.recetas?.nombre || 'N/A',
    'Lotes': orden.cantidad_lotes || 1,
    'Porciones': orden.cantidad_porciones || 0,
    'Fecha Programada': new Date(orden.fecha_programada).toLocaleDateString(),
    'Fecha Inicio': orden.fecha_inicio ? new Date(orden.fecha_inicio).toLocaleString() : 'N/A',
    'Fecha Fin': orden.fecha_fin ? new Date(orden.fecha_fin).toLocaleString() : 'N/A',
    'Estado': orden.estado === 'planificada' ? 'Planificada' :
              orden.estado === 'en_proceso' ? 'En Proceso' :
              orden.estado === 'completada' ? 'Completada' : 'Cancelada',
    'Bodega Origen': orden.bodegas_origen?.nombre || 'N/A',
    'Bodega Destino': orden.bodegas_destino?.nombre || 'N/A',
    'Responsable': orden.usuarios?.nombre_completo || 'N/A',
    'Notas': orden.notas || ''
  }));
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  
  ws['!cols'] = [
    { wch: 20 }, { wch: 35 }, { wch: 10 }, { wch: 12 },
    { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
    { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 40 }
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Órdenes de Producción');
  XLSX.writeFile(wb, `ordenes_produccion_${new Date().getTime()}.xlsx`);
};

// =====================================================
// EXPORTAR REPORTES KDS A PDF
// =====================================================
export const exportReporteKDSToPDF = (stats: any, comandas: any[]) => {
  const doc = new jsPDF();
  
  doc.setFillColor(30, 100, 167);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('Reporte Kitchen Display System', 14, 20);
  
  doc.setFontSize(11);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 30);
  
  let yPos = 55;
  doc.setFontSize(14);
  doc.setTextColor(30, 100, 167);
  doc.text('Estadísticas Generales', 14, yPos);
  
  yPos += 10;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`Total de comandas: ${comandas.length}`, 20, yPos);
  doc.text(`Pendientes: ${stats.pendientes}`, 20, yPos + 7);
  doc.text(`En preparación: ${stats.enPreparacion}`, 20, yPos + 14);
  doc.text(`Listas: ${stats.listas}`, 20, yPos + 21);
  doc.text(`Urgentes (>20 min): ${stats.urgentes}`, 20, yPos + 28);
  doc.text(`Tiempo promedio: ${stats.tiempoPromedio?.toFixed(1) || '0.0'} minutos`, 20, yPos + 35);
  
  yPos += 50;
  const tableData = comandas.map((comanda) => {
    const waitTime = Math.floor((Date.now() - new Date(comanda.fecha_creacion).getTime()) / 60000);
    return [
      `Mesa ${comanda.numero_mesa || 'N/A'}`,
      comanda.estado === 'pendiente' ? 'Pendiente' :
      comanda.estado === 'en_preparacion' ? 'En Preparación' : 'Lista',
      new Date(comanda.fecha_creacion).toLocaleTimeString(),
      `${waitTime} min`,
      (comanda.comanda_items || []).length.toString()
    ];
  });
  
  autoTable(doc, {
    startY: yPos,
    head: [['Mesa', 'Estado', 'Hora', 'Tiempo Espera', 'Items']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 100, 167], fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 3 }
  });
  
  doc.save(`reporte_kds_${new Date().getTime()}.pdf`);
};

// =====================================================
// UTILIDADES GENERALES DE EXPORTACIÓN
// =====================================================

export const exportToExcel = (data: any[], filename: string, sheetName: string = 'Datos') => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}_${new Date().getTime()}.xlsx`);
};

export const exportMultipleSheetsToExcel = (sheets: Array<{ name: string; data: any[] }>, filename: string) => {
  const wb = XLSX.utils.book_new();
  sheets.forEach(sheet => {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    if (sheet.data.length > 0) {
      const colWidths = Object.keys(sheet.data[0]).map(key => {
        const maxLength = Math.max(key.length, ...sheet.data.map(row => String(row[key] || '').length));
        return { wch: Math.min(maxLength + 2, 50) };
      });
      ws['!cols'] = colWidths;
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  XLSX.writeFile(wb, `${filename}_${new Date().getTime()}.xlsx`);
};

export const exportToPDF = (data: any[], columns: Array<{ header: string; key: string }>, title: string, filename: string) => {
  const doc = new jsPDF();
  doc.setFillColor(30, 100, 167);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);
  const tableData = data.map(row => columns.map(col => String(row[col.key] || '')));
  const headers = columns.map(col => col.header);
  autoTable(doc, {
    startY: 40,
    head: [headers],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 100, 167], fontSize: 10, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 }
  });
  doc.save(`${filename}_${new Date().getTime()}.pdf`);
};

export const exportReportToPDF = (sections: Array<{ title: string; data: any[]; columns: Array<{ header: string; key: string }>; }>, reportTitle: string, filename: string) => {
  const doc = new jsPDF();
  doc.setFillColor(30, 100, 167);
  doc.rect(0, 0, 210, 50, 'F');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(reportTitle, 105, 25, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 105, 35, { align: 'center' });
  let yPos = 60;
  sections.forEach((section, index) => {
    if (yPos > 250 || index > 0) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setTextColor(30, 100, 167);
    doc.text(section.title, 14, yPos);
    yPos += 5;
    const tableData = section.data.map(row => section.columns.map(col => String(row[col.key] || '')));
    const headers = section.columns.map(col => col.header);
    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 100, 167], fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 }
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;
  });
  doc.save(`${filename}_${new Date().getTime()}.pdf`);
};

export const formatCurrency = (amount: number): string => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
export const formatDate = (date: string | Date): string => new Date(date).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
export const formatDateTime = (date: string | Date): string => new Date(date).toLocaleString('es-EC', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const prepareAccountingData = (entries: any[]): any[] => {
  return entries.map((entry, index) => {
    const totalDebit = entry.items?.reduce((sum: number, item: any) => sum + (item.debit || 0), 0) || 0;
    const totalCredit = entry.items?.reduce((sum: number, item: any) => sum + (item.credit || 0), 0) || 0;
    return {
      'Número': entry.entryNumber || `ASI-${String(index + 1).padStart(6, '0')}`,
      'Fecha': formatDate(entry.date || new Date()),
      'Descripción': entry.description || 'Sin descripción',
      'Total Débito': formatCurrency(totalDebit),
      'Total Crédito': formatCurrency(totalCredit),
      'Estado': entry.status === 'approved' ? 'Aprobado' : entry.status === 'pending' ? 'Pendiente' : entry.status === 'rejected' ? 'Rechazado' : 'Borrador',
      'Creado': formatDateTime(entry.createdAt || entry.created_at || new Date()),
      'Notas': entry.notes || ''
    };
  });
};

export const prepareAccountingDataDetailed = (entries: any[]): any[] => {
  const detailed: any[] = [];
  entries.forEach((entry, entryIndex) => {
    entry.items?.forEach((item: any, itemIndex: number) => {
      detailed.push({
        'Número Asiento': entry.entryNumber || `ASI-${String(entryIndex + 1).padStart(6, '0')}`,
        'Fecha': formatDate(entry.date || new Date()),
        'Descripción Asiento': entry.description || 'Sin descripción',
        'Línea': itemIndex + 1,
        'Código Cuenta': item.account?.code || item.accountCode || 'N/A',
        'Nombre Cuenta': item.account?.name || item.accountName || 'N/A',
        'Tipo Cuenta': item.account?.type || item.accountType || 'N/A',
        'Descripción Línea': item.description || '-',
        'Débito': item.debit ? formatCurrency(item.debit) : '$0.00',
        'Crédito': item.credit ? formatCurrency(item.credit) : '$0.00',
        'Estado': entry.status === 'approved' ? 'Aprobado' : entry.status === 'pending' ? 'Pendiente' : entry.status === 'rejected' ? 'Rechazado' : 'Borrador'
      });
    });
  });
  return detailed;
};

export const prepareLedgerData = (ledgerEntries: any[]): any[] => {
  return ledgerEntries.map(entry => ({
    'Fecha': formatDate(entry.date || new Date()),
    'Código Cuenta': entry.account?.code || entry.accountCode || 'N/A',
    'Nombre Cuenta': entry.account?.name || entry.accountName || 'N/A',
    'Descripción': entry.description || 'Sin descripción',
    'Débito': entry.debit ? formatCurrency(entry.debit) : '$0.00',
    'Crédito': entry.credit ? formatCurrency(entry.credit) : '$0.00',
    'Saldo': formatCurrency(entry.balance || 0),
    'Tipo': entry.entryType || 'Operación',
    'Referencia': entry.reference || '-'
  }));
};

export const prepareTrialBalanceData = (accounts: any[]): any[] => {
  return accounts.map(account => ({
    'Código': account.code || 'N/A',
    'Nombre de Cuenta': account.name || 'Sin nombre',
    'Tipo': account.type === 'asset' ? 'Activo' : account.type === 'liability' ? 'Pasivo' : account.type === 'equity' ? 'Patrimonio' : account.type === 'income' ? 'Ingreso' : 'Gasto',
    'Saldo Débito': account.balance > 0 ? formatCurrency(account.balance) : '$0.00',
    'Saldo Crédito': account.balance < 0 ? formatCurrency(Math.abs(account.balance)) : '$0.00',
    'Saldo Final': formatCurrency(account.balance || 0)
  }));
};

export const prepareProjectsData = (projects: any[]): any[] => {
  return projects.map((project) => ({
    'Código': project.code || project.id || 'N/A',
    'Nombre del Proyecto': project.name || project.nombre || 'Sin nombre',
    'Cliente': project.client || project.cliente || 'N/A',
    'Estado': project.status === 'planning' ? 'Planificación' : project.status === 'in_progress' ? 'En Progreso' : project.status === 'on_hold' ? 'En Espera' : project.status === 'completed' ? 'Completado' : project.status === 'cancelled' ? 'Cancelado' : 'N/A',
    'Prioridad': project.priority === 'high' ? 'Alta' : project.priority === 'medium' ? 'Media' : 'Baja',
    'Fecha Inicio': project.startDate || project.fecha_inicio ? formatDate(project.startDate || project.fecha_inicio) : 'N/A',
    'Fecha Fin': project.endDate || project.fecha_fin ? formatDate(project.endDate || project.fecha_fin) : 'N/A',
    'Presupuesto': project.budget ? formatCurrency(project.budget) : project.presupuesto ? formatCurrency(project.presupuesto) : '$0.00',
    'Costo Real': project.actualCost || project.costo_real ? formatCurrency(project.actualCost || project.costo_real) : '$0.00',
    'Progreso': `${project.progress || project.progreso || 0}%`,
    'Responsable': project.manager || project.responsable || 'N/A',
    'Equipo': project.team?.length || project.equipo?.length || 0,
    'Descripción': project.description || project.descripcion || ''
  }));
};

export const prepareTasksData = (tasks: any[]): any[] => {
  return tasks.map((task) => ({
    'ID Tarea': task.id || task.taskId || 'N/A',
    'Proyecto': task.projectName || task.proyecto || 'N/A',
    'Nombre de Tarea': task.name || task.nombre || 'Sin nombre',
    'Estado': task.status === 'pending' ? 'Pendiente' : task.status === 'in_progress' ? 'En Progreso' : task.status === 'completed' ? 'Completada' : task.status === 'blocked' ? 'Bloqueada' : 'N/A',
    'Prioridad': task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja',
    'Asignado a': task.assignedTo || task.asignado || 'Sin asignar',
    'Fecha Inicio': task.startDate || task.fecha_inicio ? formatDate(task.startDate || task.fecha_inicio) : 'N/A',
    'Fecha Fin': task.endDate || task.fecha_fin ? formatDate(task.endDate || task.fecha_fin) : 'N/A',
    'Duración': task.duration ? `${task.duration} días` : task.duracion ? `${task.duracion} días` : 'N/A',
    'Progreso': `${task.progress || task.progreso || 0}%`,
    'Horas Estimadas': task.estimatedHours || task.horas_estimadas || 0,
    'Horas Reales': task.actualHours || task.horas_reales || 0,
    'Descripción': task.description || task.descripcion || ''
  }));
};