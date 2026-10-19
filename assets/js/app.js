(function () {
  'use strict';

  const analysis = window.DataAnalysis;
  const state = { workbook: null, fileName: '', sheetName: '', headers: [], rows: [], result: null, sourceRowStart: 2 };
  const elements = {};
  const pendingTitles = {
    inventarios: 'Inventarios',
    pronosticos: 'Pronósticos',
    rentabilidad: 'Rentabilidad'
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    ['file-input', 'browse-button', 'drop-zone', 'error-banner', 'dataset-panel', 'file-name', 'file-meta', 'sheet-control', 'sheet-select', 'replace-button', 'stats-strip', 'preview-table', 'preview-count', 'preview-range', 'column-mapping', 'findings-content', 'diagnostic-state', 'diagnostics-empty', 'diagnostics-content', 'diagnostic-metrics', 'column-diagnostics', 'export-button', 'report-button', 'quality-summary', 'breadcrumb-current', 'pending-title', 'footer-stage', 'stage-tag'].forEach((id) => { elements[id] = byId(id); });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function displayValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toLocaleDateString('es-BO');
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }

  function showError(message) {
    elements['error-banner'].textContent = message;
    elements['error-banner'].hidden = false;
  }

  function clearError() {
    elements['error-banner'].textContent = '';
    elements['error-banner'].hidden = true;
  }

  function setView(view) {
    const page = pendingTitles[view] ? 'pendiente' : view;
    document.querySelectorAll('[data-page]').forEach((section) => {
      const active = section.dataset.page === page;
      section.hidden = !active;
      section.classList.toggle('is-visible', active);
    });
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const labels = { inicio: 'Inicio', preparacion: 'Preparación de datos', calidad: 'Calidad de datos', mercado: 'Inteligencia de mercado', ...pendingTitles };
    elements['breadcrumb-current'].textContent = labels[view] || 'Preparación de datos';
    elements['stage-tag'].textContent = view === 'mercado' ? 'ETAPA 02' : 'ETAPA 01';
    elements['footer-stage'].textContent = view === 'mercado' ? 'ETAPA 02 · ANÁLISIS SOBRE DATOS CARGADOS' : 'ETAPA 01 · SIN DATOS COMERCIALES PRECARGADOS';
    if (pendingTitles[view]) elements['pending-title'].textContent = pendingTitles[view];
    if (view === 'calidad') renderQualitySummary();
    if (view === 'mercado') window.MarketDashboard.refresh();
  }

  function renderStats(result) {
    const metrics = [
      ['Registros', result.rowCount],
      ['Columnas', result.columnCount],
      ['Filas vacías', result.emptyRowNumbers.length],
      ['Duplicados exactos', result.duplicateRowNumbers.length]
    ];
    elements['stats-strip'].innerHTML = metrics.map(([label, value]) => `<div class="stat-item"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderPreview() {
    const table = elements['preview-table'];
    const visibleRows = state.rows.slice(0, 25);
    table.querySelector('thead').innerHTML = `<tr><th class="row-index">FILA</th>${state.headers.map((header) => `<th>${escapeHtml(header || '(sin encabezado)')}</th>`).join('')}</tr>`;
    table.querySelector('tbody').innerHTML = visibleRows.map((row, index) => `<tr><td class="row-index">${state.sourceRowStart + index}</td>${state.headers.map((_, columnIndex) => `<td title="${escapeHtml(displayValue(row[columnIndex]))}">${escapeHtml(displayValue(row[columnIndex]))}</td>`).join('')}</tr>`).join('');
    elements['preview-count'].textContent = `Primeras ${visibleRows.length} de ${state.rows.length} filas`;
    elements['preview-range'].textContent = state.rows.length > visibleRows.length ? `Mostrando ${visibleRows.length} filas` : `${state.rows.length} filas de origen`;
  }

  function renderMapping(result) {
    elements['column-mapping'].innerHTML = result.columnMapping.map((column) => `<div class="mapping-row"><span class="mapping-original" title="${escapeHtml(column.original)}">${escapeHtml(column.original || '(sin encabezado)')}</span><span class="mapping-arrow" aria-hidden="true">→</span><code>${escapeHtml(column.proposed)}</code></div>`).join('');
  }

  function renderFindings(result) {
    const groups = [
      { title: 'Filas completamente vacías', numbers: result.emptyRowNumbers, detail: 'Se retirarán únicamente de la copia preparada.' },
      { title: 'Duplicados exactos', numbers: result.duplicateRowNumbers, detail: 'No se eliminan. Se muestran filas originales y repetidas.' },
      { title: 'Posibles agregados «Mundo»', numbers: result.worldRowNumbers, detail: 'Coincidencia de texto para revisión; no se elimina.' }
    ];
    elements['findings-content'].innerHTML = groups.map((group) => `<details class="finding-group" ${group.numbers.length ? '' : 'data-empty="true"'}><summary><span>${group.title}</span><strong>${group.numbers.length}</strong></summary><p>${group.detail}</p>${group.numbers.length ? `<div class="row-number-list">${group.numbers.map((number) => `<button type="button" data-row="${number}" title="Ir a la fila ${number}">${number}</button>`).join('')}</div>` : '<p class="finding-none">No se detectaron filas.</p>'}</details>`).join('');
    elements['findings-content'].querySelectorAll('[data-row]').forEach((button) => button.addEventListener('click', () => focusRow(Number(button.dataset.row))));
  }

  function renderDiagnostics(result) {
    elements['diagnostics-empty'].hidden = true;
    elements['diagnostics-content'].hidden = false;
    elements['diagnostic-state'].classList.add('has-data');
    elements['diagnostic-state'].setAttribute('aria-label', 'Diagnóstico disponible');
    const metrics = [
      ['Registros', result.rowCount],
      ['Columnas', result.columnCount],
      ['Celdas faltantes', result.columns.reduce((sum, column) => sum + column.missingCount, 0)],
      ['Duplicados exactos', result.duplicateRowNumbers.length],
      ['Posibles «Mundo»', result.worldRowNumbers.length]
    ];
    elements['diagnostic-metrics'].innerHTML = metrics.map(([label, value]) => `<div class="diagnostic-metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    elements['column-diagnostics'].querySelector('tbody').innerHTML = result.columns.map((column) => `<tr><td title="${escapeHtml(column.original)}">${escapeHtml(column.original || '(sin encabezado)')}</td><td><span class="type-label">${escapeHtml(column.type)}</span></td><td>${column.uniqueCount}</td><td>${column.missingCount}</td></tr>`).join('');
  }

  function renderQualitySummary() {
    if (!state.result) {
      elements['quality-summary'].innerHTML = '<div class="quality-empty">Carga un archivo en Preparación de datos para consultar el diagnóstico calculado. No hay datos de ejemplo.</div>';
      return;
    }
    const result = state.result;
    elements['quality-summary'].innerHTML = `<div class="quality-summary-grid"><div><span>Registros no vacíos</span><strong>${result.rowCount}</strong></div><div><span>Columnas</span><strong>${result.columnCount}</strong></div><div><span>Filas vacías</span><strong>${result.emptyRowNumbers.length}</strong></div><div><span>Filas implicadas en duplicados</span><strong>${result.duplicateRowNumbers.length}</strong></div><div><span>Posibles agregados «Mundo»</span><strong>${result.worldRowNumbers.length}</strong></div></div><p>Conteos automáticos para la hoja <strong>${escapeHtml(state.sheetName)}</strong>. Las interpretaciones comerciales requieren validación.</p>`;
  }

  function focusRow(rowNumber) {
    const rowIndex = rowNumber - state.sourceRowStart;
    if (rowIndex < 0 || rowIndex >= state.rows.length) {
      showError(`La fila ${rowNumber} no está dentro de la vista previa disponible.`);
      return;
    }
    if (rowIndex >= 25) {
      showError(`La fila ${rowNumber} está identificada, pero la vista previa muestra solo las primeras 25 filas.`);
      return;
    }
    clearError();
    const row = elements['preview-table'].querySelector(`tbody tr:nth-child(${rowIndex + 1})`);
    row.classList.add('row-highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    window.setTimeout(() => row.classList.remove('row-highlight'), 1800);
  }

  function resetDataset() {
    state.workbook = null;
    state.fileName = '';
    state.sheetName = '';
    state.headers = [];
    state.rows = [];
    state.result = null;
    elements['drop-zone'].classList.remove('has-file');
    elements['dataset-panel'].hidden = true;
    elements['diagnostics-empty'].hidden = false;
    elements['diagnostics-content'].hidden = true;
    elements['diagnostic-state'].classList.remove('has-data');
    elements['diagnostic-state'].setAttribute('aria-label', 'Sin archivo cargado');
  }

  function renderSheet(sheetName) {
    const worksheet = state.workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true, blankrows: true });
    const headerIndex = matrix.findIndex((row) => row.some((value) => !analysis.isMissing(value)));
    if (headerIndex === -1) throw new Error(`La hoja «${sheetName}» no contiene encabezados ni datos.`);
    const headers = matrix[headerIndex].map((value) => value === null || value === undefined ? '' : String(value));
    if (headers.length === 0 || headers.every((header) => analysis.isMissing(header))) throw new Error(`No se encontraron encabezados en la hoja «${sheetName}».`);
    const width = headers.length;
    const rows = matrix.slice(headerIndex + 1).map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
    state.sheetName = sheetName;
    state.headers = headers;
    state.rows = rows;
    state.sourceRowStart = headerIndex + 2;
    state.result = analysis.analyze(headers, rows, state.sourceRowStart);
    elements['dataset-panel'].hidden = false;
    elements['file-name'].textContent = state.fileName;
    elements['file-meta'].textContent = `${state.workbook.SheetNames.length > 1 ? `${sheetName} · ` : ''}${state.result.rowCount} registros no vacíos · ${headers.length} columnas`;
    renderStats(state.result);
    renderPreview();
    renderMapping(state.result);
    renderFindings(state.result);
    renderDiagnostics(state.result);
    renderQualitySummary();
  }

  async function loadFile(file) {
    if (!file) return;
    clearError();
    resetDataset();
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(extension)) {
      showError('Formato no compatible. Selecciona un archivo .xlsx, .xls o .csv.');
      return;
    }
    if (!window.XLSX) {
      showError('No se pudo cargar la biblioteca de lectura. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) throw new Error('El archivo no contiene hojas legibles.');
      state.workbook = workbook;
      state.fileName = file.name;
      elements['file-meta'].textContent = 'Leyendo archivo local…';
      const select = elements['sheet-select'];
      select.innerHTML = workbook.SheetNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      elements['sheet-control'].hidden = workbook.SheetNames.length < 2;
      renderSheet(workbook.SheetNames[0]);
      elements['drop-zone'].classList.add('has-file');
    } catch (error) {
      resetDataset();
      showError(error && error.message ? `No se pudo leer el archivo: ${error.message}` : 'No se pudo leer el archivo. Verifica que no esté dañado o vacío.');
    }
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportPrepared() {
    if (!state.result) return;
    const workbook = XLSX.utils.book_new();
    const rows = [state.result.columnMapping.map((column) => column.proposed), ...state.result.preparedRows];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Preparada');
    const mappingRows = [
      ['Columna', 'Encabezado original', 'Nombre propuesto'],
      ...state.result.columnMapping.map((column) => [column.index + 1, column.original, column.proposed])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(mappingRows), 'Correspondencia');
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeFileBase(state.fileName)}_preparada.xlsx`);
  }

  function exportReport() {
    if (!state.result) return;
    const report = {
      generatedAt: new Date().toISOString(),
      sourceFile: state.fileName,
      sheet: state.sheetName,
      note: 'Resultados calculados automáticamente; no son conclusiones comerciales. Solo se eliminan filas completamente vacías al preparar la copia.',
      summary: {
        records: state.result.rowCount,
        columns: state.result.columnCount,
        emptyRows: state.result.emptyRowNumbers,
        exactDuplicateRows: state.result.duplicateRowNumbers,
        possibleWorldRows: state.result.worldRowNumbers
      },
      columns: state.result.columns.map((column) => ({ ...column, proposedName: state.result.columnMapping[column.index].proposed })),
      columnMapping: state.result.columnMapping,
      preparedRecords: state.result.preparedRows.length
    };
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }), `${safeFileBase(state.fileName)}_diagnostico.json`);
  }

  function safeFileBase(fileName) {
    return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'datos';
  }

  function bindEvents() {
    elements['browse-button'].addEventListener('click', () => elements['file-input'].click());
    elements['replace-button'].addEventListener('click', () => elements['file-input'].click());
    elements['file-input'].addEventListener('change', (event) => loadFile(event.target.files[0]));
    elements['sheet-select'].addEventListener('change', (event) => {
      try { renderSheet(event.target.value); clearError(); }
      catch (error) { showError(`No se pudo inspeccionar la hoja: ${error.message}`); }
    });
    elements['export-button'].addEventListener('click', exportPrepared);
    elements['report-button'].addEventListener('click', exportReport);
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
    elements['drop-zone'].addEventListener('dragover', (event) => { event.preventDefault(); elements['drop-zone'].classList.add('is-dragging'); });
    elements['drop-zone'].addEventListener('dragleave', () => elements['drop-zone'].classList.remove('is-dragging'));
    elements['drop-zone'].addEventListener('drop', (event) => {
      event.preventDefault();
      elements['drop-zone'].classList.remove('is-dragging');
      loadFile(event.dataTransfer.files[0]);
    });
  }

  function init() {
    cacheElements();
    window.MarketDashboard.initialize(() => state.result ? {
      headers: state.headers,
      rows: state.rows,
      result: state.result,
      firstDataRowNumber: state.sourceRowStart,
      fileName: state.fileName,
      sheetName: state.sheetName
    } : null);
    bindEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();