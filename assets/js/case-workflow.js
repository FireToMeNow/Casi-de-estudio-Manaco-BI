(function (root) {
  'use strict';

  const storageKey = 'manaco-bi-case-workflow-v1';
  const state = { values: {}, dataset: null, reference: null, validation: null, filters: { reportingCountry: '', period: '' } };
  const requiredByStation = {
    estacion1: [],
    estacion2: [],
    estacion3: [],
    estacion4: []
  };

  const station1Fields = Array.from({ length: 5 }, (_, index) => {
    const number = index + 1;
    return [
      { id: `s1_problem_${number}`, label: `Problema prioritario ${number}`, placeholder: 'Describe el problema empresarial que debe investigarse.' },
      { id: `s1_reason_${number}`, label: 'Justificación e impacto', placeholder: '¿Por qué afecta competitividad, rentabilidad o sostenibilidad?' },
      { id: `s1_questions_${number}`, label: 'Pregunta analítica', placeholder: '¿Qué pregunta concreta se puede responder?' },
      { id: `s1_data_${number}`, label: 'Datos necesarios', placeholder: 'Indica los datos internos o externos que hacen falta.' }
    ];
  }).flat();

  const station2Fields = [
    { id: 's2_scope', label: 'Clasificación de la fuente (verificar procedencia)', type: 'select', options: [
      { value: '', label: 'Pendiente de validar' },
      { value: 'external', label: 'Referencia externa, no es dato de MANACO' },
      { value: 'internal', label: 'Dato interno de MANACO, fuente verificada' },
      { value: 'simulated', label: 'Dato simulado para el ejercicio' },
      { value: 'other', label: 'Otra procedencia (documentar en limitaciones)' }
    ] },
    ...Array.from({ length: 3 }, (_, index) => {
      const number = index + 1;
      return [
        { id: `s2_finding_${number}`, label: `Hallazgo ${number}: evidencia observada`, placeholder: 'Escribe el hallazgo basado en los resultados.' },
        { id: `s2_evidence_${number}`, label: 'Cifra o evidencia', placeholder: 'Incluye indicador, periodo, categoría y/o fuente.' },
        { id: `s2_implication_${number}`, label: 'Interpretación para MANACO (hipótesis)', placeholder: 'Explica qué podría significar; separa hipótesis de evidencia.' }
      ];
    }).flat(),
    { id: 's2_limit_1', label: 'Limitación 1', placeholder: 'Cobertura, procedencia, calidad u otra limitación.' },
    { id: 's2_limit_2', label: 'Limitación 2', placeholder: 'Describe una segunda limitación.' },
    { id: 's2_question', label: 'Pregunta estratégica', placeholder: '¿Qué decisión de MANACO debería investigarse con datos internos?' }
  ];

  const station3Fields = [
    { id: 's3_problem', label: 'Problema prioritario que resolverá', placeholder: 'Vincúlalo con un problema priorizado en la Estación 1.' },
    { id: 's3_solution', label: 'Solución analítica propuesta', placeholder: 'Tablero, pronóstico de demanda, calidad, inventario, segmentación, etc.' },
    { id: 's3_data', label: 'Datos requeridos y fuentes', placeholder: 'Sistemas, campos, granularidad, frecuencia y responsables de los datos.' },
    { id: 's3_decision', label: 'Decisión que apoyará', placeholder: '¿Qué decisión concreta podrá tomar Gerencia con esta solución?' },
    { id: 's3_coordination', label: 'Coordinación y responsables', placeholder: 'Áreas participantes, responsable principal y cadencia de revisión.' },
    ...Array.from({ length: 3 }, (_, index) => {
      const number = index + 1;
      return [
        { id: `s3_objective_${number}`, label: `Objetivo SMART ${number}`, placeholder: 'Específico, medible, alcanzable, relevante y con plazo.' },
        { id: `s3_kpi_${number}`, label: 'KPI, línea base y meta', placeholder: 'Nombre y fórmula del indicador; línea base y meta cuantificada.' },
        { id: `s3_deadline_${number}`, label: 'Plazo (hasta 3 años)', placeholder: 'Ej.: 12, 24 o 36 meses.' }
      ];
    }).flat(),
    ...Array.from({ length: 2 }, (_, index) => {
      const number = index + 1;
      return [
        { id: `s3_risk_${number}`, label: `Riesgo ${number}`, placeholder: 'Riesgo de datos, operación, adopción, costo, etc.' },
        { id: `s3_mitigation_${number}`, label: 'Mitigación', placeholder: 'Acción, responsable y control para reducir el riesgo.' }
      ];
    }).flat()
  ];

  const station4Fields = [
    ...Array.from({ length: 2 }, (_, index) => {
      const number = index + 1;
      return [
        { id: `s4_alt_${number}`, label: `Alternativa ${number}`, placeholder: 'Describe la alternativa de mejora.' },
        { id: `s4_benefit_${number}`, label: 'Beneficios esperados y evidencia', placeholder: 'Cuantifica si hay datos; señala supuestos si no los hay.' },
        { id: `s4_cost_${number}`, label: 'Costos / recursos', placeholder: 'Costo estimado, inversión, horas o datos requeridos.' },
        { id: `s4_risk_${number}`, label: 'Riesgos y mitigación', placeholder: 'Riesgos principales y cómo reducirlos.' },
        { id: `s4_metric_${number}`, label: 'Indicador de seguimiento', placeholder: 'KPI, fórmula, fuente y frecuencia.' }
      ];
    }).flat(),
    { id: 's4_selected', label: 'Alternativa priorizada', type: 'select', options: [{ value: '', label: 'Selecciona una alternativa' }, { value: '1', label: 'Alternativa 1' }, { value: '2', label: 'Alternativa 2' }] },
    { id: 's4_reason', label: 'Justificación de la recomendación', placeholder: 'Compara beneficios, costos, riesgos y viabilidad.' },
    { id: 's4_segment', label: 'Segmento de clientes elegido', placeholder: 'Define el segmento y la evidencia disponible o faltante.' },
    { id: 's4_action', label: 'Acción comercial propuesta', placeholder: 'Acción concreta, canal, responsable y plazo.' },
    { id: 's4_missing_data', label: 'Datos adicionales solicitados', placeholder: 'Ventas, margen, clientes, devoluciones, inventario, producción, etc.' },
    ...Array.from({ length: 3 }, (_, index) => {
      const number = index + 1;
      return [
        { id: `s4_kpi_${number}`, label: `Indicador de seguimiento ${number}`, placeholder: 'KPI, fórmula, línea base, meta y frecuencia.' }
      ];
    }).flat()
  ];

  const allFields = [...station1Fields, ...station2Fields, ...station3Fields, ...station4Fields];
  const sourceScopeLabels = {
    external: 'Referencia externa; no representa datos de MANACO',
    internal: 'Dato interno de MANACO; fuente declarada como verificada',
    simulated: 'Dato simulado para el ejercicio',
    other: 'Otra procedencia; requiere documentación'
  };
  for (const [station, fields] of Object.entries({
    estacion1: station1Fields,
    estacion2: station2Fields,
    estacion3: station3Fields,
    estacion4: station4Fields
  })) requiredByStation[station] = fields.map((field) => field.id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function safeFileBase(value) {
    return String(value || 'caso_manaco').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'caso_manaco';
  }

  function fieldMarkup(field) {
    const value = escapeHtml(state.values[field.id] ?? '');
    if (field.type === 'select') {
      return `<label class="case-field"><span>${escapeHtml(field.label)}</span><select data-case-field="${field.id}">${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${value === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
    }
    return `<label class="case-field"><span>${escapeHtml(field.label)}</span><textarea data-case-field="${field.id}" rows="3" placeholder="${escapeHtml(field.placeholder)}">${value}</textarea></label>`;
  }

  function groupMarkup(title, fields) {
    return `<section class="case-card"><div class="case-card-heading"><h3>${escapeHtml(title)}</h3></div><div class="case-fields">${fields.map(fieldMarkup).join('')}</div></section>`;
  }

  function renderShell(container) {
    container.innerHTML = `
      <div class="page-heading">
        <div><p class="eyebrow">APRENDIZAJE BASADO EN RETOS · 120 MIN</p><h1>Ruta del caso de estudio</h1><p class="heading-subtitle">Completa las cuatro estaciones y consolida una recomendación sustentada, señalando siempre qué es evidencia, hipótesis o dato faltante.</p></div>
        <div class="case-actions"><button id="case-export-html" class="button button-primary" type="button">↓ Informe ejecutivo</button><button id="case-export-json" class="button button-secondary" type="button">↓ Copia de trabajo JSON</button><label class="button button-secondary case-import-button">↑ Importar copia<input id="case-import" type="file" accept=".json,application/json" hidden></label><label class="button button-secondary case-import-button">Cargar referencia Excel<input id="case-reference-import" type="file" accept=".json,application/json" hidden></label></div>
      </div>
      <div class="case-privacy-note" role="status">El trabajo se guarda solo en este navegador. Los resultados externos no se atribuyen a MANACO; revisa alcance y supuestos antes de recomendar.</div>
      <div id="case-save-status" class="case-save-status" aria-live="polite"></div>
      <div id="case-reference-status" class="case-reference-status" role="status" aria-live="polite"></div>
      <section id="case-source-context" class="case-source-context"></section>
      <nav class="case-station-nav" aria-label="Estaciones del caso">
        <a href="#estacion1">01 · Comprensión</a><a href="#estacion2">02 · Diagnóstico</a><a href="#estacion3">03 · Propuesta</a><a href="#estacion4">04 · Decisión</a><a href="#producto-final">Producto final</a>
      </nav>
      <section id="estacion1" class="case-station"><div class="case-station-title"><span>ESTACIÓN 1 · 20 MIN</span><h2>Comprensión y priorización del problema</h2><p>Registra hasta cinco problemas, su impacto, una pregunta analítica y qué datos se necesitan. No confundas contexto empresarial con evidencia medida.</p></div><div id="case-s1"></div></section>
      <section id="estacion2" class="case-station"><div class="case-station-title"><span>ESTACIÓN 2 · 30 MIN</span><h2>Diagnóstico con Ciencia de Datos</h2><p>Inspecciona la fuente y completa tres hallazgos basados en evidencia, dos limitaciones y una pregunta estratégica. Consulta el Dashboard para gráficos y filtros.</p><a class="case-inline-link" href="#mercado" data-go="mercado">Abrir Dashboard ejecutivo →</a></div><div id="case-s2-source"></div><div id="case-s2"></div><button id="case-validate" class="button button-primary case-validate-button" type="button">Validar respuestas y viabilidad</button><div id="case-validation-results" class="case-validation-results" aria-live="polite"></div></section>
      <section id="estacion3" class="case-station"><div class="case-station-title"><span>ESTACIÓN 3 · 30 MIN</span><h2>Diseño de la propuesta estratégica</h2><p>Define una solución viable, los datos y decisiones que apoya, tres objetivos SMART a tres años, KPI, responsables y dos riesgos con mitigación.</p></div><div id="case-s3"></div></section>
      <section id="estacion4" class="case-station"><div class="case-station-title"><span>ESTACIÓN 4 · 30 MIN</span><h2>Análisis financiero, mercado y decisión</h2><p>Compara dos alternativas, selecciona una, plantea una acción para un segmento y define tres indicadores. Si faltan costos o datos internos, documéntalo; no inventes cifras.</p></div><div id="case-s4"></div></section>
      <section id="producto-final" class="case-final"><div><p class="eyebrow">PRODUCTO FINAL · 10 MIN</p><h2>Informe integrador</h2><p>La descarga HTML reúne el alcance de los datos, las cuatro estaciones y la recomendación. Puedes abrirlo en el navegador e imprimirlo o guardarlo como PDF.</p><p class="case-completion-note">El porcentaje indica campos con texto, no evalúa la calidad, veracidad ni viabilidad de las respuestas. El equipo debe validar evidencia, supuestos, fuentes y metas.</p></div><div id="case-completion" class="case-completion"></div><button id="case-final-export" class="button button-primary" type="button">Generar informe ejecutivo descargable</button></section>
    `;
    container.querySelector('#case-s1').innerHTML = groupMarkup('Problemas prioritarios y datos necesarios', station1Fields);
    container.querySelector('#case-s2').innerHTML = groupMarkup('Tres hallazgos, dos limitaciones y pregunta estratégica', station2Fields);
    container.querySelector('#case-s3').innerHTML = groupMarkup('Solución, objetivos SMART, KPI, responsables y riesgos', station3Fields);
    container.querySelector('#case-s4').innerHTML = groupMarkup('Alternativas, recomendación y acción comercial', station4Fields);
  }

  function datasetSummary(dataset, filters = {}) {
    if (!dataset) return null;
    const result = root.MarketAnalysis.analyzeMarket(dataset.headers, dataset.rows, filters, dataset.firstDataRowNumber || 2);
    const reporter = result.schema.reportingCountry;
    const reporters = reporter
      ? [...new Set(dataset.rows.map((row) => String(row[reporter.index] ?? '').trim()).filter(Boolean))]
      : [];
    const reportingScopeSafe = result.diagnostics.reportingScopeAllowed &&
      (!reporter || (reporters.length === 1 && result.flowRecords.every((record) => String(record.row[reporter.index] ?? '').trim() !== '')));
    const grouped = new Map();
    const canAggregateValues = result.diagnostics.valueAggregatable && reportingScopeSafe &&
      result.units.status !== 'mixed' && result.units.status !== 'incomplete';
    const canAggregatePairs = reportingScopeSafe && result.diagnostics.worldScopeAllowed && result.schema.pairsCompatible;
    for (const record of result.flowRecords) {
      const category = record.product || '(sin categoría)';
      const key = `${record.flow}|${category}`;
      const group = grouped.get(key) ?? { flow: record.flow === 'import' ? 'Importaciones' : 'Exportaciones', category, value: 0, pairs: 0, pairValueTotal: 0, pairValuePairs: 0, valueRecords: 0, pairRecords: 0 };
      if (canAggregateValues && record.value !== null && record.value >= 0) {
        group.value += record.value;
        group.valueRecords += 1;
      }
      if (canAggregatePairs && record.pairs !== null && record.pairs >= 0) {
        group.pairs += record.pairs;
        group.pairRecords += 1;
      }
      if (canAggregateValues && result.schema.pairsCompatible && result.valuePerPair !== null &&
        record.value !== null && record.value >= 0 && record.pairs !== null && record.pairs > 0) {
        group.pairValueTotal += record.value;
        group.pairValuePairs += record.pairs;
      }
      grouped.set(key, group);
    }
    return {
      fileName: dataset.fileName || 'Archivo cargado',
      sheetName: dataset.sheetName || 'Hoja activa',
      recordCount: result.counts.source,
      included: result.counts.included,
      excluded: result.counts.excluded,
      duplicateCount: result.counts.duplicates,
      worldCount: result.counts.worldCandidates,
      reporters,
      reportingScopeSafe,
      currency: result.units.label,
      currencyComparable: result.units.comparable,
      valueAggregationAllowed: canAggregateValues,
      pairsAggregationAllowed: canAggregatePairs,
      periods: result.periods.analyzed,
      imports: reportingScopeSafe ? result.totals.import : null,
      exports: reportingScopeSafe ? result.totals.export : null,
      balance: reportingScopeSafe ? result.totals.balance : null,
      valuePerPair: reportingScopeSafe ? result.valuePerPair : null,
      valueColumn: result.schema.value?.header ?? null,
      pairColumn: result.schema.quantity?.header ?? null,
      categoryColumn: result.schema.product?.header ?? null,
      flowColumn: result.schema.flow?.header ?? null,
      pairsCompatible: result.schema.pairsCompatible,
      pairValueAvailable: result.valuePerPair !== null,
      filters: { ...filters },
      quality: {
        emptyRows: dataset.result?.emptyRowNumbers?.length ?? 0,
        duplicateRows: dataset.result?.duplicateRowNumbers?.length ?? result.counts.duplicates,
        columns: dataset.result?.columns?.map((column) => ({
          name: column.original,
          type: column.type,
          uniqueCount: column.uniqueCount,
          missingCount: column.missingCount
        })) ?? []
      },
      grouped: [...grouped.values()],
      caveats: result.diagnostics.assumptions
    };
  }

  function numberLabel(value, unit = '') {
    if (!Number.isFinite(value)) return 'No calculado';
    return `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value)}${unit ? ` ${unit}` : ''}`;
  }

  function renderSource(dataset) {
    const target = document.getElementById('case-source-context');
    const filterOptions = dataset ? root.MarketAnalysis.getFilterOptions(dataset.headers, dataset.rows) : {};
    for (const role of ['reportingCountry', 'period']) {
      if (!filterOptions[role]?.includes(state.filters[role])) state.filters[role] = '';
    }
    const summary = datasetSummary(dataset, state.filters);
    if (!summary) {
      if (state.reference) {
        state.validation = root.CaseAnswerValidator.validate(state.values, state.reference, null);
        renderValidation();
      }
      target.innerHTML = '<strong>No hay archivo cargado.</strong><p>Carga la base del caso en Preparación de datos. El flujo no utiliza resultados de ejemplo.</p>';
      document.getElementById('case-s2-source').innerHTML = '<div class="case-data-empty">Los indicadores y la tabla por flujo/categoría aparecerán al cargar un archivo.</div>';
      return;
    }
    const source = summary.reporters.length ? summary.reporters.join(', ') : 'No identificado en la fuente';
    const pairsUnit = summary.pairsCompatible ? 'pares' : 'unidad de cantidad no confirmada';
    target.innerHTML = `<div><strong>Fuente activa</strong><span>${escapeHtml(summary.fileName)} · ${escapeHtml(summary.sheetName)}</span></div><div><strong>País reportante</strong><span>${escapeHtml(source)}</span></div><div><strong>Registros / periodo</strong><span>${summary.recordCount} · ${escapeHtml(summary.periods.join(', ') || 'sin periodo')}</span></div><div><strong>Alcance de moneda</strong><span>${escapeHtml(summary.currency)}${summary.currencyComparable ? ' · confirmada' : ' · no confirmada'}</span></div><p class="case-scope-warning"><b>Regla de interpretación:</b> estos datos describen la fuente cargada. Si el reportante es externo (por ejemplo, España), no son ventas, clientes, costos ni demanda de MANACO. Las propuestas para MANACO quedan como hipótesis hasta validarlas con datos internos.${summary.reportingScopeSafe ? '' : ' Hay más de un país reportante, campos de reporte incompletos o roles ambiguos; se bloquean los totales agregados hasta definir un alcance único en el Dashboard.'}</p>`;
    const rows = summary.grouped.map((group) => `<tr><td>${escapeHtml(group.flow)}</td><td>${escapeHtml(group.category)}</td><td>${escapeHtml(group.valueRecords && summary.valueAggregationAllowed ? numberLabel(group.value, summary.currencyComparable ? summary.currency : '(unidad no confirmada)') : 'No agregado')}</td><td>${escapeHtml(group.pairRecords && summary.pairsAggregationAllowed ? numberLabel(group.pairs, pairsUnit) : 'No calculado')}</td><td>${escapeHtml(group.pairValuePairs && summary.pairValueAvailable ? numberLabel(group.pairValueTotal / group.pairValuePairs, `${summary.currency}/par`) : 'No calculado')}</td></tr>`).join('');
    const caveats = summary.caveats.map((note) => `<li>${escapeHtml(note)}</li>`).join('');
    const pairNote = summary.valuePerPair === null
      ? 'No se calcula valor ponderado por par: verifica moneda, unidad de pares y periodo con los requisitos del Dashboard.'
      : `Valor comercial ponderado por par en el alcance comparable: ${numberLabel(summary.valuePerPair, `${summary.currency}/par`)}. Es valor aduanero/comercial, no precio al consumidor ni margen de MANACO.`;
    const qualityRows = summary.quality.columns.map((column) => `<tr><td>${escapeHtml(column.name || '(sin encabezado)')}</td><td>${escapeHtml(column.type)}</td><td>${column.uniqueCount}</td><td>${column.missingCount}</td></tr>`).join('');
    const filterMarkup = ['reportingCountry', 'period'].filter((role) => filterOptions[role]?.length > 1).map((role) => {
      const label = role === 'period' ? 'Año / periodo' : 'País reportante';
      const optionMarkup = filterOptions[role].map((value) => `<option value="${escapeHtml(value)}" ${state.filters[role] === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
      return `<label><span>${label}</span><select id="case-${role}-filter"><option value="">Todos</option>${optionMarkup}</select></label>`;
    }).join('');
    const caseFilters = filterMarkup ? `<div class="case-filterbar">${filterMarkup}<p>Para calcular valor por par, elige un solo periodo. Si hay varios países reportantes, selecciona uno antes de comparar.</p></div>` : '';
    document.getElementById('case-s2-source').innerHTML = `${caseFilters}<div class="case-data-summary"><h3>Lectura calculada de la fuente</h3><div class="case-data-kpis"><div><span>Importaciones</span><strong>${escapeHtml(numberLabel(summary.imports, summary.currency))}</strong></div><div><span>Exportaciones</span><strong>${escapeHtml(numberLabel(summary.exports, summary.currency))}</strong></div><div><span>Valor por par</span><strong>${escapeHtml(numberLabel(summary.valuePerPair, summary.valuePerPair === null ? '' : `${summary.currency}/par`))}</strong></div><div><span>“Mundo” separado</span><strong>${summary.worldCount} filas</strong></div></div><p>${escapeHtml(pairNote)}</p><div class="case-table-wrap"><table><thead><tr><th>Flujo</th><th>Categoría</th><th>Valor</th><th>Cantidad (${escapeHtml(pairsUnit)})</th><th>Valor ponderado/par</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No hay filas comparables para presentar por flujo/categoría.</td></tr>'}</tbody></table></div><details><summary>Diccionario inferido, calidad y limitaciones</summary><div class="case-table-wrap"><table><thead><tr><th>Columna</th><th>Tipo inferido</th><th>Únicos</th><th>Faltan</th></tr></thead><tbody>${qualityRows}</tbody></table></div><ul>${caveats}</ul><p>Filas vacías: ${summary.quality.emptyRows}. Filas implicadas en duplicados exactos: ${summary.quality.duplicateRows}. Filas “Mundo” excluidas del desglose: ${summary.worldCount}. Registros excluidos de indicadores: ${summary.excluded}. Los tipos son inferencias; valida contra el diccionario de datos.</p></details></div>`;
    if (state.validation) {
      state.validation = root.CaseAnswerValidator.validate(state.values, state.reference, datasetSummary(dataset));
      renderValidation();
    }
  }

  function stationCompletion(ids) {
    const complete = ids.filter((id) => String(state.values[id] ?? '').trim()).length;
    return { complete, total: ids.length, percent: ids.length ? Math.round(complete / ids.length * 100) : 0 };
  }

  function renderCompletion() {
    const stations = [
      ['Estación 1', requiredByStation.estacion1],
      ['Estación 2', requiredByStation.estacion2],
      ['Estación 3', requiredByStation.estacion3],
      ['Estación 4', requiredByStation.estacion4]
    ];
    const details = stations.map(([name, ids]) => {
      const status = stationCompletion(ids);
      return `<div><span>${name}</span><strong>${status.complete}/${status.total}</strong><small>${status.percent}% completado</small></div>`;
    }).join('');
    document.getElementById('case-completion').innerHTML = details;
  }

  function renderValidation() {
    const target = document.getElementById('case-validation-results');
    if (!target) return;
    if (!state.reference) {
      target.innerHTML = '<p class="case-validation-empty">Referencia de evaluación no cargada. Usa “Cargar referencia Excel” y selecciona <code>assets/data/caso-manaco-referencia.json</code>.</p>';
      return;
    }
    if (!state.validation) {
      target.innerHTML = '<p class="case-validation-empty">Completa respuestas y pulsa “Validar respuestas y viabilidad”.</p>';
      return;
    }
    const validation = state.validation;
    const status = validation.status === 'strong' ? 'Revisión favorable' : validation.status === 'needs-review' ? 'Requiere revisión' : 'En progreso';
    const criteria = validation.criteria.map((criterion) => `<li class="${criterion.passed ? 'is-pass' : 'is-review'}"><span>${criterion.passed ? '✓' : '!'}</span><div><strong>${escapeHtml(criterion.label)}</strong><small>${escapeHtml(criterion.detail)}</small></div><b>${numberLabel(criterion.earned)}/${numberLabel(criterion.points)}</b></li>`).join('');
    const warnings = validation.warnings.length
      ? `<ul class="case-validation-warnings">${validation.warnings.map((warning) => `<li class="severity-${escapeHtml(warning.severity)}">${escapeHtml(warning.message)}</li>`).join('')}</ul>`
      : '<p class="case-validation-ok">No se detectaron alertas automáticas adicionales.</p>';
    const matchedFacts = validation.criteria.find((criterion) => criterion.id === 'reference-facts')?.detail ?? '';
    target.innerHTML = `<div class="case-validation-heading"><div><span class="eyebrow">REVISIÓN AUTOMÁTICA EXPLICABLE</span><h3>${escapeHtml(status)}</h3><p>${escapeHtml(matchedFacts)}</p></div><strong class="case-validation-score">${validation.score}<small>/100</small></strong></div><p class="case-validation-source">${validation.referenceMatched ? 'La fuente cargada coincide con la base de referencia del caso.' : 'La fuente cargada no coincide exactamente con la referencia; no se califican cifras del Excel.'}</p><ul class="case-validation-list">${criteria}</ul>${warnings}<p class="case-validation-disclaimer">${escapeHtml(validation.disclaimer)}</p>`;
  }

  function validateAnswers() {
    if (!state.reference) {
      state.validation = null;
      renderValidation();
      document.getElementById('case-reference-status').textContent = 'No se puede contrastar con el Excel hasta cargar el archivo de referencia.';
      return;
    }
    state.validation = root.CaseAnswerValidator.validate(state.values, state.reference, datasetSummary(state.dataset));
    renderValidation();
  }

  function save() {
    try {
      root.localStorage.setItem(storageKey, JSON.stringify({ version: 1, values: state.values }));
      document.getElementById('case-save-status').textContent = 'Borrador guardado localmente en este navegador.';
    } catch (error) {
      document.getElementById('case-save-status').textContent = `No se pudo guardar automáticamente (${error.message}). Descarga una copia JSON para no perder el trabajo.`;
    }
    renderCompletion();
    if (state.reference) validateAnswers();
  }

  function collectReport() {
    if (state.reference) validateAnswers();
    return {
      title: 'Caso de estudio MANACO · Informe integrador',
      generatedAt: new Date().toISOString(),
      source: datasetSummary(state.dataset),
      stations: {
        estacion1: Object.fromEntries(station1Fields.map((field) => [field.label, state.values[field.id] || 'Pendiente'])),
        estacion2: Object.fromEntries(station2Fields.map((field) => [field.label, state.values[field.id] || 'Pendiente'])),
        estacion3: Object.fromEntries(station3Fields.map((field) => [field.label, state.values[field.id] || 'Pendiente'])),
        estacion4: Object.fromEntries(station4Fields.map((field) => [field.label, state.values[field.id] || 'Pendiente']))
      },
      sourceClassification: sourceScopeLabels[state.values.s2_scope] || 'Pendiente de validar',
      validation: state.validation,
      completion: Object.fromEntries(Object.entries(requiredByStation).map(([station, ids]) => [station, stationCompletion(ids)])),
      interpretationRule: 'Distinguir evidencia observada, hipótesis y datos faltantes. El comercio exterior de un país reportante no representa ventas ni rentabilidad de MANACO.'
    };
  }

  function reportSection(title, entries) {
    const content = Object.entries(entries).map(([label, value]) => `<section><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value).replace(/\n/g, '<br>')}</p></section>`).join('');
    return `<article><h2>${escapeHtml(title)}</h2>${content}</article>`;
  }

  function validationReportSection(validation) {
    if (!validation) return '<article><h2>Validación automática</h2><p>No se cargó la referencia Excel; no se evaluaron las respuestas.</p></article>';
    const rows = validation.criteria.map((criterion) => `<tr><td>${escapeHtml(criterion.label)}</td><td>${escapeHtml(criterion.detail)}</td><td>${numberLabel(criterion.earned)}/${numberLabel(criterion.points)}</td></tr>`).join('');
    const warnings = validation.warnings.map((warning) => `<li>${escapeHtml(warning.message)}</li>`).join('');
    return `<article><h2>Validación automática · ${validation.score}/100 · ${validation.referenceMatched ? 'referencia coincidente' : 'referencia no coincidente'}</h2><p>${escapeHtml(validation.disclaimer)}</p><table><thead><tr><th>Criterio</th><th>Resultado</th><th>Puntos</th></tr></thead><tbody>${rows}</tbody></table>${warnings ? `<h3>Alertas a revisar</h3><ul>${warnings}</ul>` : ''}</article>`;
  }

  function svgByMetric(source, metric, title, unit, requireCurrency = false) {
    if (!source || (requireCurrency && (!source.currencyComparable || !source.valueAggregationAllowed)) || (metric === 'pairs' && !source.pairsAggregationAllowed)) {
      return `<p class="warning">Gráfico de ${escapeHtml(title.toLowerCase())} no disponible: faltan unidades/moneda compatibles.</p>`;
    }
    const categories = new Map();
    for (const group of source.grouped) {
      const values = categories.get(group.category) ?? { imports: 0, exports: 0, importRecords: 0, exportRecords: 0 };
      const flowKey = group.flow === 'Importaciones' ? 'imports' : 'exports';
      values[flowKey] += group[metric];
      values[flowKey === 'imports' ? 'importRecords' : 'exportRecords'] += group[metric === 'value' ? 'valueRecords' : 'pairRecords'];
      categories.set(group.category, values);
    }
    const rows = [...categories.entries()]
      .filter(([, values]) => values.importRecords + values.exportRecords > 0)
      .sort((a, b) => (b[1].imports + b[1].exports) - (a[1].imports + a[1].exports))
      .slice(0, 10);
    if (!rows.length) return `<p class="warning">Gráfico de ${escapeHtml(title.toLowerCase())} no disponible: no hay registros válidos.</p>`;
    const maxValue = Math.max(1, ...rows.flatMap(([, values]) => [values.imports, values.exports]));
    const width = 850;
    const rowHeight = 45;
    const top = 45;
    const svgRows = rows.map(([category, values], index) => {
      const y = top + index * rowHeight;
      const importWidth = Math.round(values.imports / maxValue * 440);
      const exportWidth = Math.round(values.exports / maxValue * 440);
      const label = category.length > 28 ? `${category.slice(0, 25)}...` : category;
      return `<g><title>${escapeHtml(category)}</title><text x="8" y="${y + 13}" font-size="11" fill="#344a64">${escapeHtml(label)}</text><rect x="225" y="${y}" width="${importWidth}" height="13" rx="3" fill="#2869bb"/><text x="${Math.min(680, 232 + importWidth)}" y="${y + 11}" font-size="9" fill="#344a64">${escapeHtml(numberLabel(values.imports))}</text><rect x="225" y="${y + 18}" width="${exportWidth}" height="13" rx="3" fill="#38a58e"/><text x="${Math.min(680, 232 + exportWidth)}" y="${y + 29}" font-size="9" fill="#344a64">${escapeHtml(numberLabel(values.exports))}</text></g>`;
    }).join('');
    const height = top + rows.length * rowHeight + 12;
    return `<figure><figcaption><b>${escapeHtml(title)}</b> <span>(${escapeHtml(unit)})</span></figcaption><svg role="img" aria-label="${escapeHtml(title)}" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="225" y="18" font-size="10" fill="#2869bb">Importaciones</text><text x="330" y="18" font-size="10" fill="#38a58e">Exportaciones</text>${svgRows}</svg></figure>`;
  }

  function qualityTable(source) {
    if (!source.quality.columns.length) return '<p>No está disponible el diagnóstico por columna en esta copia de trabajo.</p>';
    const rows = source.quality.columns.map((column) => `<tr><td>${escapeHtml(column.name || '(sin encabezado)')}</td><td>${escapeHtml(column.type)}</td><td>${column.uniqueCount}</td><td>${column.missingCount}</td></tr>`).join('');
    return `<p>Filas vacías: ${source.quality.emptyRows}. Filas implicadas en duplicados exactos: ${source.quality.duplicateRows}.</p><table><thead><tr><th>Columna</th><th>Tipo inferido</th><th>Únicos</th><th>Faltan</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function exportHtml() {
    const report = collectReport();
    const source = report.source;
    const sourceHtml = source
      ? `<article><h2>Fuente y diagnóstico de datos</h2><p><b>Archivo/hoja:</b> ${escapeHtml(source.fileName)} · ${escapeHtml(source.sheetName)}</p><p><b>Clasificación declarada:</b> ${escapeHtml(report.sourceClassification)}</p><p><b>País reportante:</b> ${escapeHtml(source.reporters.join(', ') || 'No identificado')} · <b>Periodos:</b> ${escapeHtml(source.periods.join(', ') || 'No identificados')}</p><p><b>Filtros:</b> reportante ${escapeHtml(source.filters.reportingCountry || 'todos')} · periodo ${escapeHtml(source.filters.period || 'todos')}</p><p><b>Importaciones:</b> ${escapeHtml(numberLabel(source.imports, source.currency))} · <b>Exportaciones:</b> ${escapeHtml(numberLabel(source.exports, source.currency))} · <b>Saldo:</b> ${escapeHtml(numberLabel(source.balance, source.currency))}</p><p><b>Valor ponderado por par:</b> ${escapeHtml(numberLabel(source.valuePerPair, source.valuePerPair === null ? '' : `${source.currency}/par`))}</p><div class="table-wrap"><table><thead><tr><th>Flujo</th><th>Categoría</th><th>Valor</th><th>Pares</th><th>Valor ponderado/par</th></tr></thead><tbody>${source.grouped.map((group) => `<tr><td>${escapeHtml(group.flow)}</td><td>${escapeHtml(group.category)}</td><td>${escapeHtml(group.valueRecords && source.valueAggregationAllowed ? numberLabel(group.value, source.currencyComparable ? source.currency : '(unidad no confirmada)') : 'No agregado')}</td><td>${escapeHtml(group.pairRecords && source.pairsAggregationAllowed ? numberLabel(group.pairs, 'pares') : 'No calculado')}</td><td>${escapeHtml(group.pairValuePairs && source.pairValueAvailable ? numberLabel(group.pairValueTotal / group.pairValuePairs, `${source.currency}/par`) : 'No calculado')}</td></tr>`).join('')}</tbody></table></div><h3>Calidad y tipos inferidos</h3>${qualityTable(source)}<p class="warning"><b>Alcance:</b> país(es) reportante(s): ${escapeHtml(source.reporters.join(', ') || 'no identificado')}. No atribuir estos datos a MANACO sin evidencia interna. El valor por par es valor comercial/aduanero, no precio al consumidor ni margen.</p><ul>${source.caveats.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></article>`
      : '<article><h2>Fuente y diagnóstico de datos</h2><p>No se cargó un archivo de datos. No se generan indicadores de ejemplo.</p></article>';
    const chartsHtml = source
      ? `<article><h2>Gráficos para la Estación 2</h2>${svgByMetric(source, 'value', 'Valor comercial por categoría y flujo', source.currency, true)}${svgByMetric(source, 'pairs', 'Cantidad de pares por categoría y flujo', 'pares')}</article>`
      : '';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(report.title)}</title><style>body{font:15px/1.55 Arial,sans-serif;max-width:960px;margin:36px auto;padding:0 22px;color:#20251f}h1{font-size:28px}h2{border-bottom:2px solid #26735a;padding-bottom:7px;margin-top:34px}h3{font-size:16px;margin-bottom:4px}article{margin:24px 0}figure{margin:20px 0;padding:12px;border:1px solid #ddd;overflow-x:auto}figcaption{margin-bottom:8px}.warning{background:#fcf6e9;border-left:4px solid #c39847;padding:12px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}.print{position:fixed;right:20px;top:20px;padding:10px 15px}@media print{.print{display:none}body{margin:0 auto}}</style></head><body><button class="print" onclick="window.print()">Imprimir / Guardar como PDF</button><h1>${escapeHtml(report.title)}</h1><p>Generado: ${escapeHtml(new Date(report.generatedAt).toLocaleString('es-BO'))}</p><p><b>Regla de interpretación:</b> ${escapeHtml(report.interpretationRule)}</p>${sourceHtml}${chartsHtml}${validationReportSection(report.validation)}${reportSection('Estación 1 · Comprensión del caso', report.stations.estacion1)}${reportSection('Estación 2 · Diagnóstico', report.stations.estacion2)}${reportSection('Estación 3 · Propuesta estratégica', report.stations.estacion3)}${reportSection('Estación 4 · Análisis y recomendación', report.stations.estacion4)}<article><h2>Completitud del trabajo</h2><p>El porcentaje solo cuenta campos con texto; no evalúa calidad, exactitud, viabilidad ni aprobación docente.</p><ul>${Object.entries(report.completion).map(([station, value]) => `<li>${escapeHtml(station)}: ${value.complete}/${value.total} campos completados (${value.percent}%).</li>`).join('')}</ul></article></body></html>`;
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFileBase(state.dataset?.fileName)}_informe_manaco.html`);
  }

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    download(new Blob([JSON.stringify({ version: 1, values: state.values }, null, 2)], { type: 'application/json;charset=utf-8' }), 'caso_manaco_copia_trabajo.json');
  }

  function isValidReference(reference) {
    return reference && reference.schemaVersion === 1 && reference.dataset &&
      reference.dataset.reporter && Array.isArray(reference.dataset.periods) &&
      Array.isArray(reference.facts) && reference.rubric &&
      Array.isArray(reference.rubric.internalDataTerms);
  }

  function applyReference(reference, message) {
    if (!isValidReference(reference)) throw new Error('El JSON no tiene la estructura de referencia MANACO esperada.');
    state.reference = reference;
    document.getElementById('case-reference-status').textContent = message;
    validateAnswers();
  }

  async function loadReferenceFile(file) {
    if (!file) return;
    try {
      const reference = JSON.parse(await file.text());
      applyReference(reference, `Referencia cargada desde ${file.name}.`);
    } catch (error) {
      document.getElementById('case-reference-status').textContent = `No se pudo cargar la referencia: ${error.message}`;
    }
  }

  async function loadDefaultReference() {
    const status = document.getElementById('case-reference-status');
    try {
      if (typeof root.fetch !== 'function') throw new Error('Este navegador no permite cargar archivos locales por URL.');
      const response = await root.fetch('assets/data/caso-manaco-referencia.json');
      if (!response.ok) throw new Error(`Respuesta HTTP ${response.status}.`);
      const reference = await response.json();
      applyReference(reference, `Referencia verificada cargada: ${reference.provenance.file}.`);
    } catch (error) {
      status.textContent = `No se pudo cargar automáticamente la referencia (${error.message}). Usa “Cargar referencia Excel” y selecciona assets/data/caso-manaco-referencia.json.`;
      renderValidation();
    }
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const content = JSON.parse(await file.text());
      if (content.version !== 1 || !content.values || typeof content.values !== 'object' || Array.isArray(content.values)) {
        throw new Error('El archivo no tiene el formato de copia de trabajo compatible.');
      }
      const validIds = new Set(allFields.map((field) => field.id));
      const values = {};
      for (const [key, value] of Object.entries(content.values)) {
        if (validIds.has(key) && typeof value === 'string') values[key] = value;
      }
      root.localStorage.setItem(storageKey, JSON.stringify({ version: 1, values }));
      state.values = values;
      render();
      document.getElementById('case-save-status').textContent = 'Copia importada y guardada localmente.';
    } catch (error) {
      document.getElementById('case-save-status').textContent = `No se pudo importar la copia: ${error.message}`;
    }
  }

  function load() {
    try {
      const saved = root.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.version !== 1 || !parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values)) {
        throw new Error('La copia guardada tiene una versión o estructura no compatible.');
      }
      const validIds = new Set(allFields.map((field) => field.id));
      state.values = Object.fromEntries(Object.entries(parsed.values).filter(([key, value]) => validIds.has(key) && typeof value === 'string'));
    } catch (error) {
      document.getElementById('case-save-status').textContent = `No se pudo recuperar el borrador: ${error.message}. Puedes importar una copia JSON.`;
    }
  }

  function render() {
    const container = document.getElementById('case-workflow-root');
    container.querySelectorAll('[data-case-field]').forEach((field) => {
      field.value = state.values[field.dataset.caseField] ?? '';
    });
    renderSource(state.dataset);
    renderCompletion();
  }

  function initialize(getDataset) {
    const container = document.getElementById('case-workflow-root');
    if (!container) return;
    renderShell(container);
    load();
    container.addEventListener('input', (event) => {
      if (event.target.matches('[data-case-field]')) {
        state.values[event.target.dataset.caseField] = event.target.value;
        save();
      }
    });
    container.addEventListener('change', (event) => {
      if (event.target.matches('[data-case-field]')) {
        state.values[event.target.dataset.caseField] = event.target.value;
        save();
      }
      if (event.target.id === 'case-reportingCountry-filter') {
        state.filters.reportingCountry = event.target.value;
        renderSource(state.dataset);
      }
      if (event.target.id === 'case-period-filter') {
        state.filters.period = event.target.value;
        renderSource(state.dataset);
      }
      if (event.target.id === 'case-import') {
        const file = event.target.files[0];
        event.target.value = '';
        importJson(file);
      }
      if (event.target.id === 'case-reference-import') {
        const file = event.target.files[0];
        event.target.value = '';
        loadReferenceFile(file);
      }
    });
    container.addEventListener('click', (event) => {
      if (event.target.closest('#case-export-html, #case-final-export')) exportHtml();
      if (event.target.closest('#case-export-json')) exportJson();
      if (event.target.closest('#case-validate')) validateAnswers();
    });
    state.dataset = getDataset();
    render();
    renderValidation();
    loadDefaultReference();
    root.CaseWorkflow = { refresh: () => { state.dataset = getDataset(); renderSource(state.dataset); } };
  }

  root.CaseWorkflow = { initialize };
  if (typeof module !== 'undefined' && module.exports) module.exports = { datasetSummary };
})(typeof window !== 'undefined' ? window : globalThis);
