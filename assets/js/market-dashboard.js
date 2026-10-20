(function () {
  'use strict';

  const analysis = window.MarketAnalysis;
  const state = { getDataset: null, charts: {}, result: null, initialized: false };
  let datasetKey = null;
  const filterRoles = ['period', 'reportingCountry', 'country', 'flow', 'product'];
  const roleLabels = {
    reportingCountry: 'País reportante',
    country: 'País socio',
    flow: 'Flujo comercial',
    product: 'Categoría de calzado / producto',
    quantity: 'Cantidad de pares',
    value: 'Valor comercial',
    period: 'Periodo',
    currency: 'Moneda'
  };
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
    return new Intl.NumberFormat('es-BO', { maximumFractionDigits: digits }).format(value);
  }

  function formatValue(value, unit) {
    return value === null || value === undefined ? 'No disponible' : `${formatNumber(value)} ${unit}`;
  }

  function getDataset() {
    return state.getDataset ? state.getDataset() : null;
  }

  function setFilterOptions(role, values) {
    const wrap = $(`market-${role}-filter-wrap`);
    const select = $(`market-${role}-filter`);
    const previous = select.value;
    wrap.hidden = values.length === 0;
    select.innerHTML = `<option value="">Todos</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    select.value = values.includes(previous) ? previous : '';
  }

  function syncFilterOptions(dataset) {
    const options = analysis.getFilterOptions(dataset.headers, dataset.rows);
    for (const role of filterRoles) setFilterOptions(role, options[role]);
  }

  function getFilters() {
    return {
      period: $('market-period-filter').value,
      reportingCountry: $('market-reportingCountry-filter').value,
      country: $('market-country-filter').value,
      flow: $('market-flow-filter').value,
      product: $('market-product-filter').value,
      worldMode: $('market-world-filter').value
    };
  }

  function getRoleRecord(schema, role) {
    return schema[role] ?? null;
  }

  function renderSchema(result) {
    const tbody = $('market-schema-table').querySelector('tbody');
    const rows = Object.keys(roleLabels).map((role) => {
      const resolved = getRoleRecord(result.schema, role);
      let column = resolved ? resolved.header : 'No detectada';
      let note = resolved ? 'Detectada por encabezado; valida que el significado corresponda.' : 'No se encontró una columna única con encabezado reconocido.';
      if (role === 'quantity' && resolved && !result.schema.pairsCompatible) note = 'Detectada, pero el encabezado no confirma unidades en pares.';
      if (role === 'quantity' && resolved && result.schema.pairsCompatible && !result.diagnostics.pairPeriodComparable) note = 'El cálculo por par requiere filtrar un único periodo o tener un solo periodo válido en los datos.';
      if (role === 'value' && resolved && result.units.status !== 'known') note = `Importes identificados; unidad ${result.units.status === 'mixed' || result.units.status === 'incomplete' ? 'mezclada o incompleta' : 'no confirmada'}.`;
      if (role === 'period' && resolved) note = 'Se incluyen solo fechas, años y periodos estándar que pudieron normalizarse.';
      const ambiguity = result.schema.ambiguities.find((item) => item.role === role);
      if (ambiguity) {
        column = `Ambigua: ${ambiguity.headers.join(', ')}`;
        note = 'Hay varios encabezados candidatos; no se seleccionó ninguno automáticamente.';
      }
      return `<tr><td>${roleLabels[role]}</td><td>${escapeHtml(column)}</td><td>${escapeHtml(note)}</td></tr>`;
    });
    tbody.innerHTML = rows.join('');
  }

  function renderAlerts(result) {
    const messages = [];
    if (result.counts.source === 0) messages.push('La hoja activa no contiene registros para analizar. Los encabezados detectados no generan indicadores.');
    else if (result.counts.inScope === 0) messages.push('No hay registros en el alcance actual. Revisa los filtros y el modo de agregados «Mundo».');
    if (!result.diagnostics.hasFlow) messages.push('Falta una columna de flujo comercial reconocible. No se pueden separar importaciones y exportaciones.');
    if (!result.diagnostics.hasValue) messages.push('Falta una columna de valor comercial reconocible. No se calculan importes.');
    else if (result.totals.importRecords === 0 && result.totals.exportRecords === 0) messages.push('No hay registros con flujo y valor numérico reconocidos en el alcance actual.');
    else if (result.totals.importRecords === 0 || result.totals.exportRecords === 0) messages.push(`No se detectaron registros válidos de ${result.totals.importRecords === 0 ? 'importación' : 'exportación'} en el alcance actual; no se calcula el saldo comercial.`);
    if (result.schema.ambiguities.length) messages.push(`Hay roles ambiguos (${result.schema.ambiguities.map((item) => roleLabels[item.role] || item.role).join(', ')}); revisa los encabezados. No se eligió una columna arbitrariamente.`);
    if (result.diagnostics.reportingRoleAmbiguous) messages.push('No se calculan indicadores porque hay varias columnas candidatas para el país reportante.');
    if (!result.diagnostics.reportingScopeAllowed) messages.push('Se detectaron varios países reportantes. Selecciona uno para evitar sumar flujos de países distintos.');
    if (result.diagnostics.countryRoleAmbiguous && result.filters.worldMode !== 'world') messages.push('Hay columnas ambiguas de país socio; se bloquean los totales hasta revisar los encabezados. Las filas «Mundo» siguen excluidas.');
    if (result.units.status === 'unknown' && result.diagnostics.hasValue) messages.push('La moneda o unidad no está identificada. Se muestran sumas separadas por flujo, pero no saldo, valor por par ni gráficos comparativos.');
    if (result.units.status === 'mixed' || result.units.status === 'incomplete') messages.push('Se detectaron monedas distintas o datos de moneda ausentes. No se agregan importes entre monedas ni se calcula saldo.');
    if (!result.periods.comparable && result.totals.importRecords && result.totals.exportRecords) messages.push('Los periodos de importación y exportación no tienen la misma cobertura reconocida. Se muestran por separado, sin saldo ni ranking combinado de socios.');
    if (!result.schema.period && result.totals.importRecords && result.totals.exportRecords) messages.push('Sin un periodo reconocido no se puede validar que importaciones y exportaciones cubran el mismo intervalo; se bloquean comparaciones y saldo.');
    if (result.counts.worldCandidates) messages.push(`Se detectaron ${result.counts.worldCandidates} fila(s) «Mundo» en el filtro actual. No se mezclan con el desglose por país; puedes inspeccionarlas en el selector de alcance.`);
    if (result.counts.duplicates) messages.push(`${result.counts.duplicates} registro(s) repetido(s) exactos están incluidos tal como aparecen. Revisa si pueden producir dobles conteos; no se eliminaron automáticamente.`);
    if (!result.schema.reportingCountry) messages.push('No se detectó una columna explícita de país reportante; no se atribuyen los flujos a un país inferido.');
    if (!result.schema.country) messages.push('Sin una columna de país socio no se calculan principales socios.');
    if (!result.schema.product) messages.push('No se detectó una columna de producto; el filtro de producto no está disponible.');
    if (!result.schema.product) messages.push('No se puede mostrar la distribución del valor comercial por categoría sin una columna de producto reconocida.');
    if (!result.schema.period) messages.push('No se detectó una columna de periodo; no se calcula evolución temporal.');
    else if (result.diagnostics.invalidPeriods) messages.push(`${result.diagnostics.invalidPeriods} registro(s) válido(s) tienen un periodo no reconocido y no aparecen en la evolución temporal.`);
    if (!result.schema.quantity) messages.push('No se detectó una columna de cantidad; no se calcula valor por par.');
    else if (!result.schema.pairsCompatible) messages.push('La columna de cantidad no confirma pares en el encabezado; no se calcula valor por par.');
    else if (!result.diagnostics.pairPeriodComparable) messages.push('El valor por par no mezcla periodos: filtra un único periodo o usa datos con un solo periodo válido.');
    else if (result.totals.missingPairs) messages.push(`${result.totals.missingPairs} registro(s) no tienen cantidad interpretable. No se confunden con cantidad cero.`);
    if (result.counts.valueExcluded) messages.push(`${result.counts.valueExcluded} registro(s) en alcance no entran en totales por flujo: flujo no reconocido o valor ausente/no numérico.`);
    $('market-alerts').innerHTML = messages.length
      ? `<ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`
      : '<p>Columnas y unidades reconocidas para los indicadores disponibles. Valida las reglas del archivo fuente antes de interpretar resultados.</p>';
  }

  function renderCounts(result) {
    const items = [
      ['Registros fuente', result.counts.source],
      ['Tras filtros', result.counts.afterFilters],
      ['En alcance', result.counts.inScope],
      ['Incluidos en indicadores', result.counts.included],
      ['Excluidos del alcance', result.counts.excluded],
      ['Fuera por filtros', result.counts.filterExcluded]
    ];
    $('market-counts').innerHTML = items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderAnalysisPeriod(result) {
    const periods = result.periods.analyzed;
    const label = result.filters.period
      ? result.filters.period
      : periods.length === 1
        ? periods[0]
        : periods.length > 1
          ? `${periods[0]} – ${periods[periods.length - 1]}`
          : 'Sin periodo reconocible';
    $('market-analysis-period').textContent = `Periodo analizado: ${label} · ${result.counts.included} registros incluidos de ${result.counts.source} registros no vacíos de origen.`;
  }

  function renderKpis(result) {
    const unit = result.units.label;
    const selectedFlow = analysis.classifyFlow(result.filters.flow);
    const importValue = selectedFlow === 'export' || result.totals.importRecords === 0 ? null : result.totals.import;
    const exportValue = selectedFlow === 'import' || result.totals.exportRecords === 0 ? null : result.totals.export;
    const cards = [
      { label: 'Importaciones', value: formatValue(importValue, unit), note: `${result.totals.importRecords} registros con valor interpretable` },
      { label: 'Exportaciones', value: formatValue(exportValue, unit), note: `${result.totals.exportRecords} registros con valor interpretable` },
      { label: 'Saldo comercial', value: result.totals.balance === null ? 'No calculado' : formatValue(result.totals.balance, unit), note: result.totals.balance === null ? 'Requiere unidad común y cobertura temporal coincidente' : 'Exportaciones − importaciones' },
      { label: 'Valor por par', value: result.valuePerPair === null ? 'No calculado' : formatValue(result.valuePerPair, `${unit}/par`), note: `${result.counts.pairIncluded} incluidos · ${result.counts.pairExcluded} excluidos; un periodo y pares positivos` }
    ];
    if (result.diagnostics.hasCountry) {
      const highest = result.diagnostics.partnersComparable ? result.partners.find((partner) => Number.isFinite(partner.total)) : null;
      cards.push({
        label: 'Principal socio comercial',
        value: highest ? highest.country : 'No calculado',
        note: highest ? `${formatValue(highest.total, unit)} · ranking comparable en el periodo filtrado` : 'Requiere socio, unidad y periodo comparables'
      });
    }
    $('market-kpis').innerHTML = cards.map((card) => `<article class="market-kpi"><span>${card.label}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.note)}</small></article>`).join('');
  }

  function renderFindings(result) {
    $('market-findings-list').innerHTML = analysis.generateFindings(result).map((finding) => `<article class="market-finding"><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.observation)}</p><small>Dato que lo sustenta: ${escapeHtml(finding.evidence)}</small></article>`).join('');
  }

  function destroyChart(key) {
    if (state.charts[key]) {
      state.charts[key].destroy();
      delete state.charts[key];
    }
  }

  function chartOptions(horizontal = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { family: 'DM Sans', size: 10 } } },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed[horizontal ? 'x' : 'y'])}` } }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: '#edf0ea' }, ticks: { font: { family: 'DM Mono', size: 9 } } },
        y: { beginAtZero: !horizontal, grid: { color: horizontal ? '#edf0ea' : 'transparent' }, ticks: { font: { family: 'DM Mono', size: 9 } } }
      }
    };
  }

  function annualSeries(timeSeries) {
    const years = new Map();
    for (const period of timeSeries) {
      const year = period.period.slice(0, 4);
      const group = years.get(year) ?? { period: year, imports: null, exports: null };
      if (period.imports !== null) group.imports = (group.imports ?? 0) + period.imports;
      if (period.exports !== null) group.exports = (group.exports ?? 0) + period.exports;
      years.set(year, group);
    }
    return [...years.values()].sort((a, b) => a.period.localeCompare(b.period));
  }

  function renderCharts(result) {
    const supported = result.units.comparable && result.diagnostics.valueAggregatable;
    const chartAvailable = Boolean(window.Chart);
    const selectedFlow = analysis.classifyFlow(result.filters.flow);
    const categories = new Map();
    if (result.schema.product && Number.isInteger(result.schema.product.index)) {
      for (const record of result.recordsIncluded) {
        const category = String(record.row[result.schema.product.index] ?? '').trim();
        if (!category || record.value === null || record.value < 0) continue;
        categories.set(category, (categories.get(category) ?? 0) + record.value);
      }
    }
    $('market-flow-card').hidden = !(supported && result.diagnostics.canCompareFlows && !selectedFlow && result.diagnostics.hasFlow && result.diagnostics.hasValue);
    $('market-partner-card').hidden = !(supported && result.diagnostics.partnersComparable && result.diagnostics.hasCountry && result.partners.length);
    $('market-period-card').hidden = !(supported && result.diagnostics.hasPeriod && result.timeSeries.length);
    $('market-category-card').hidden = !(supported && result.diagnostics.hasProduct && categories.size);
    for (const key of ['flow', 'partner', 'period', 'category']) destroyChart(key);
    if (!supported || !chartAvailable) {
      if (!chartAvailable) $('market-alerts').insertAdjacentHTML('beforeend', '<p>No se cargó Chart.js; los gráficos no están disponibles. Comprueba la conexión e inténtalo de nuevo; los datos de la hoja no se han modificado.</p>');
      return;
    }
    if (!result.totals.importRecords && !result.totals.exportRecords) return;
    const colors = { imports: '#2869bb', exports: '#38a58e' };
    if (!$('market-flow-card').hidden) {
      state.charts.flow = new Chart($('market-flow-chart'), {
        type: 'bar',
        data: { labels: ['Valor comercial'], datasets: [
          { label: 'Importaciones', data: [result.totals.import], backgroundColor: colors.imports, borderRadius: 2 },
          { label: 'Exportaciones', data: [result.totals.export], backgroundColor: colors.exports, borderRadius: 2 }
        ] },
        options: { ...chartOptions(), plugins: { ...chartOptions().plugins, legend: { position: 'bottom' } } }
      });
      $('market-flow-chart-note').textContent = `Unidad: ${result.units.label}. Importaciones: ${result.totals.importRecords} registros; exportaciones: ${result.totals.exportRecords}.`;
    }
    if (!$('market-partner-card').hidden) {
      const partners = result.partners.slice(0, 10);
      const flowDatasets = [
        { key: 'imports', label: 'Importaciones', color: colors.imports },
        { key: 'exports', label: 'Exportaciones', color: colors.exports }
      ].filter((flow) => !selectedFlow || (selectedFlow === 'import' ? flow.key === 'imports' : flow.key === 'exports'));
      state.charts.partner = new Chart($('market-partner-chart'), {
        type: 'bar',
        data: { labels: partners.map((partner) => partner.country), datasets: flowDatasets.map((flow) => ({ label: flow.label, data: partners.map((partner) => partner[flow.key]), backgroundColor: flow.color, borderRadius: 2 })) },
        options: chartOptions(true)
      });
      $('market-partner-chart-note').textContent = `Primeros ${partners.length} socios; ${result.counts.partnerIncluded} registros incluidos y ${result.counts.partnerExcluded} excluidos por país ausente.`;
    }
    if (!$('market-period-card').hidden) {
      const years = annualSeries(result.timeSeries);
      const flowDatasets = [
        { key: 'imports', label: 'Importaciones', color: colors.imports },
        { key: 'exports', label: 'Exportaciones', color: colors.exports }
      ].filter((flow) => !selectedFlow || (selectedFlow === 'import' ? flow.key === 'imports' : flow.key === 'exports'));
      state.charts.period = new Chart($('market-period-chart'), {
        type: 'line',
        data: { labels: years.map((period) => period.period), datasets: flowDatasets.map((flow) => ({ label: flow.label, data: years.map((period) => period[flow.key]), borderColor: flow.color, backgroundColor: flow.color, tension: 0.2, pointRadius: 3, pointHoverRadius: 5, spanGaps: false, borderWidth: 2 })) },
        options: chartOptions()
      });
      $('market-period-chart-note').textContent = `Agregación anual de ${result.timeSeries.length} periodos reconocidos; ${result.counts.periodIncluded} registros incluidos y ${result.counts.periodExcluded} excluidos por periodo ausente o inválido.`;
    }
    if (!$('market-category-card').hidden) {
      const palette = ['#2869bb', '#38a58e', '#e5a34e', '#8170b9', '#58a2bc', '#cc7890', '#7a9b60', '#d48d61', '#667eac', '#6ca896'];
      const categoryValues = [...categories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
      state.charts.category = new Chart($('market-category-chart'), {
        type: 'doughnut',
        data: {
          labels: categoryValues.map(([category]) => category),
          datasets: [{ label: `Valor comercial (${result.units.label})`, data: categoryValues.map(([, value]) => value), backgroundColor: categoryValues.map((_, index) => palette[index % palette.length]), borderColor: '#fff', borderWidth: 3, hoverOffset: 7 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '64%', plugins: { ...chartOptions().plugins, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatNumber(context.parsed)} ${result.units.label}` } } } }
      });
      $('market-category-chart-note').textContent = `${categoryValues.length} categorías con valores comerciales no negativos incluidos; la distribución respeta los filtros activos.`;
    }
  }

  function renderPartnerTable(result) {
    const section = $('market-partners-section');
    const tbody = $('market-partners-table').querySelector('tbody');
    const title = $('market-partners-title');
    if (!result.diagnostics.hasCountry || !result.partners.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    $('market-partners-count').textContent = `${result.counts.partnerIncluded} registros incluidos`;
    title.textContent = result.diagnostics.partnersComparable ? 'Socios por valor total' : 'Valores por país, sin sumar flujos';
    tbody.innerHTML = result.partners.slice(0, 100).map((partner) => `<tr><td>${escapeHtml(partner.country)}</td><td>${formatNumber(partner.imports)}</td><td>${formatNumber(partner.exports)}</td><td>${escapeHtml(result.units.label)}</td><td>${partner.importRecords}</td><td>${partner.exportRecords}</td></tr>`).join('');
    const selectedFlow = analysis.classifyFlow(result.filters.flow);
    const rankingBasis = selectedFlow === 'import' ? 'importaciones' : selectedFlow === 'export' ? 'exportaciones' : 'importaciones + exportaciones';
    $('market-partners-note').textContent = result.diagnostics.partnersComparable
      ? `Orden descendente por ${rankingBasis}. ${result.partners.length} socios en el resultado.`
      : `Los flujos aparecen separados y los socios no se ordenan por suma porque su moneda o periodo no es comparable. ${result.partners.length} socios en el resultado.`;
  }

  function renderPeriodTable(result) {
    const section = $('market-periods-section');
    const tbody = $('market-periods-table').querySelector('tbody');
    if (!result.schema.period || !result.timeSeries.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    tbody.innerHTML = result.timeSeries.map((period) => `<tr><td>${escapeHtml(period.period)}</td><td>${formatNumber(period.imports)}</td><td>${formatNumber(period.exports)}</td><td>${period.records}</td></tr>`).join('');
    $('market-periods-note').textContent = result.units.comparable
      ? `La evolución gráfica usa ${result.timeSeries.length} periodos reconocidos en ${result.units.label}.`
      : 'Los flujos se muestran en columnas separadas; no se comparan entre sí al no estar confirmada la unidad.';
  }

  function renderRecordsTable(dataset, result) {
    const records = result.recordsIncluded;
    $('market-table-count').textContent = `${records.length} registros · muestra máxima 100`;
    $('market-records-table').querySelector('thead').innerHTML = `<tr><th>Fila</th>${dataset.headers.map((header) => `<th>${escapeHtml(header || '(sin encabezado)')}</th>`).join('')}</tr>`;
    $('market-records-table').querySelector('tbody').innerHTML = records.slice(0, 100).map((record) => `<tr><td>${record.sourceRow}</td>${record.row.map((value) => `<td title="${escapeHtml(value instanceof Date ? value.toISOString() : value)}">${escapeHtml(value instanceof Date ? value.toISOString().slice(0, 10) : value)}</td>`).join('')}</tr>`).join('');
    $('market-table-title').textContent = 'Registros válidos usados por los indicadores';
  }

  function renderWorldRows(dataset, result) {
    const section = $('market-world-section');
    const tbody = $('market-world-table').querySelector('tbody');
    section.hidden = result.worldRows.length === 0;
    if (section.hidden) return;
    $('market-world-table').querySelector('thead').innerHTML = `<tr><th>Fila</th>${dataset.headers.map((header) => `<th>${escapeHtml(header || '(sin encabezado)')}</th>`).join('')}</tr>`;
    tbody.innerHTML = result.worldRows.map(({ row, sourceRow }) => `<tr><td>${sourceRow}</td>${row.map((value) => `<td>${escapeHtml(value instanceof Date ? value.toISOString().slice(0, 10) : value)}</td>`).join('')}</tr>`).join('');
    $('market-world-count').textContent = result.filters.worldMode === 'world'
      ? `${result.worldRows.length} fila(s) «Mundo» en alcance separado`
      : `${result.worldRows.length} fila(s) «Mundo» excluidas del desglose`;
  }

  function renderAssumptions(result) {
    const assumptions = [...result.diagnostics.assumptions];
    assumptions.push(`Registros en hoja activa: ${result.counts.source}; en alcance tras filtros: ${result.counts.inScope}; incluidos en totales de flujo: ${result.counts.included}; excluidos: ${result.counts.excluded}.`);
    assumptions.push(`Valores ausentes o no interpretables: ${result.totals.missingValues}; los ceros válidos se conservan (${result.totals.zeroValues}).`);
    assumptions.push(`Cobertura de socios: ${result.counts.partnerIncluded} registros incluidos; ${result.counts.partnerExcluded} excluidos por falta de país o imposibilidad de agregación.`);
    assumptions.push(`Cobertura temporal: ${result.counts.periodIncluded} incluidos; ${result.counts.periodExcluded} excluidos por periodo inválido o no disponible.`);
    assumptions.push(`Cobertura de valor por par: ${result.counts.pairIncluded} incluidos; ${result.counts.pairExcluded} excluidos por falta de valor/cantidad positiva/unidad compatible.`);
    if (result.schema.pairsCompatible) assumptions.push('Valor por par solo se calcula dentro de un periodo único: suma de valores con valor y pares positivos dividida por suma de esos pares; no es el promedio simple de razones por fila.');
    $('market-assumptions-list').innerHTML = assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join('');
  }

  function render(dataset) {
    if (!dataset || !dataset.result || !dataset.headers.length) {
      $('market-empty').hidden = false;
      $('market-workspace').hidden = true;
      for (const key of ['flow', 'partner', 'period', 'category']) $(`market-${key}-card`).hidden = true;
      $('market-source').textContent = 'El análisis usará la hoja activa de Preparación de datos.';
      destroyAllCharts();
      state.result = null;
      datasetKey = null;
      return;
    }
    $('market-empty').hidden = true;
    $('market-workspace').hidden = false;
    const nextDatasetKey = dataset.result;
    if (datasetKey !== null && datasetKey !== nextDatasetKey) {
      for (const role of filterRoles) $(`market-${role}-filter`).value = '';
      $('market-world-filter').value = 'detailed';
    }
    datasetKey = nextDatasetKey;
    $('market-source').textContent = `${dataset.fileName} · hoja ${dataset.sheetName} · ${dataset.result.rowCount} registros no vacíos`;
    syncFilterOptions(dataset);
    const result = analysis.analyzeMarket(dataset.headers, dataset.rows, getFilters(), dataset.firstDataRowNumber);
    state.result = result;
    $('market-world-filter-wrap').hidden = result.counts.worldCandidates === 0;
    renderSchema(result);
    renderAlerts(result);
    renderCounts(result);
    renderAnalysisPeriod(result);
    renderKpis(result);
    renderFindings(result);
    renderCharts(result);
    renderPartnerTable(result);
    renderPeriodTable(result);
    renderRecordsTable(dataset, result);
    renderWorldRows(dataset, result);
    renderAssumptions(result);
  }

  function destroyAllCharts() {
    for (const key of Object.keys(state.charts)) destroyChart(key);
  }

  function exportResults() {
    const dataset = getDataset();
    const result = state.result;
    if (!dataset || !result || !window.XLSX) return;
    const selectedFlow = analysis.classifyFlow(result.filters.flow);
    const rankingBasis = selectedFlow === 'import' ? 'importaciones' : selectedFlow === 'export' ? 'exportaciones' : 'importaciones + exportaciones';
    const workbook = XLSX.utils.book_new();
    const summary = [
      ['Indicador', 'Valor', 'Unidad o nota'],
      ['Hoja', dataset.sheetName, 'Fuente activa'],
      ['Registros fuente', result.counts.source, 'Filas no vacías'],
      ['Registros en alcance', result.counts.inScope, 'Después de filtros y alcance Mundo'],
      ['Registros incluidos', result.counts.included, 'Flujo reconocido y valor interpretable'],
      ['Registros excluidos', result.counts.excluded, 'En alcance, no incluidos en indicadores'],
      ['Importaciones', result.totals.import ?? 'No calculado', result.units.label],
      ['Exportaciones', result.totals.export ?? 'No calculado', result.units.label],
      ['Saldo comercial', result.totals.balance ?? 'No calculado', 'Solo cuando moneda comparable'],
      ['Valor por par', result.valuePerPair ?? 'No calculado', 'Razón ponderada; pares positivos'],
      ['Registros valor por par', `${result.counts.pairIncluded} incluidos / ${result.counts.pairExcluded} excluidos`, 'Cantidad positiva y moneda compatible'],
      ['Registros socios', `${result.counts.partnerIncluded} incluidos / ${result.counts.partnerExcluded} excluidos`, 'País reconocido'],
      ['Registros periodos', `${result.counts.periodIncluded} incluidos / ${result.counts.periodExcluded} excluidos`, 'Periodo normalizado'],
      ['Estado de unidad', result.units.status, 'known, unknown, mixed o incomplete'],
      ['Duplicados exactos', result.counts.duplicates, 'Se conservan; riesgo de doble conteo']
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Resumen');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['País socio', 'Importaciones', 'Exportaciones', 'Registros importación', 'Registros exportación', 'Unidad', 'Nota ranking'],
      ...result.partners.map((partner) => [partner.country, partner.imports, partner.exports, partner.importRecords, partner.exportRecords, result.units.label, result.diagnostics.partnersComparable ? `Ordenado por ${rankingBasis}` : 'No ordenado; unidad o periodo no comparable'])
    ]), 'Socios');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Periodo', 'Importaciones', 'Exportaciones', 'Registros'],
      ...result.timeSeries.map((period) => [period.period, period.imports, period.exports, period.records])
    ]), 'Periodos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Fila origen', ...dataset.headers],
      ...result.recordsIncluded.map((record) => [record.sourceRow, ...record.row])
    ]), 'Registros incluidos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Rol analítico', 'Columna detectada'],
      ...Object.keys(roleLabels).map((role) => [roleLabels[role], result.schema[role]?.header ?? 'No detectada'])
    ]), 'Columnas usadas');
    const assumptions = [
      ['Supuestos y filtros aplicados'],
      ...result.diagnostics.assumptions.map((assumption) => [assumption]),
      ['Filtros', JSON.stringify(result.filters)]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(assumptions), 'Supuestos');
    if (result.worldRows.length) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['Fila origen', ...dataset.headers],
        ...result.worldRows.map(({ row, sourceRow }) => [sourceRow, ...row])
      ]), 'Filas Mundo');
    }
    XLSX.writeFile(workbook, `${dataset.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'datos'}_mercado.xlsx`);
  }

  function bindEvents() {
    for (const role of filterRoles) $(`market-${role}-filter`).addEventListener('change', () => render(getDataset()));
    $('market-world-filter').addEventListener('change', () => render(getDataset()));
    $('market-reset-filters').addEventListener('click', () => {
      for (const role of filterRoles) $(`market-${role}-filter`).value = '';
      $('market-world-filter').value = 'detailed';
      render(getDataset());
    });
    $('market-export').addEventListener('click', exportResults);
  }

  window.MarketDashboard = {
    initialize(getCurrentDataset) {
      state.getDataset = getCurrentDataset;
      if (!state.initialized) {
        bindEvents();
        state.initialized = true;
      }
    },
    refresh() {
      render(getDataset());
    }
  };
})();
