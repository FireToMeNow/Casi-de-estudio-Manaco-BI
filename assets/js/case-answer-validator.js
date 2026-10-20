(function (root) {
  'use strict';

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasAnyTerm(value, terms = []) {
    const text = normalize(value);
    return terms.some((term) => text.includes(normalize(term)));
  }

  function parseLocalizedNumber(raw) {
    let value = raw.replace(/[\s\u00a0\u202f]/g, '');
    if (!value) return null;
    const separators = [...value.matchAll(/[.,]/g)].map((match) => match.index);
    if (separators.length > 1) {
      const lastSeparator = separators[separators.length - 1];
      const decimalPlaces = value.length - lastSeparator - 1;
      if (decimalPlaces === 3 && separators.length === 1) return null;
      const integer = value.slice(0, lastSeparator).replace(/[.,]/g, '');
      const fraction = value.slice(lastSeparator + 1);
      value = `${integer}.${fraction}`;
    } else if (separators.length === 1) {
      const [index] = separators;
      const digitsAfter = value.length - index - 1;
      if (digitsAfter === 3 && index <= 3) return null;
      value = value.replace(',', '.');
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numericMentions(text) {
    const matches = [];
    const pattern = /-?\d[\d.,\s\u00a0\u202f]*(?:\d)?/g;
    for (const match of text.matchAll(pattern)) {
      const raw = match[0].trim();
      const around = normalize(text.slice(Math.max(0, match.index - 24), Math.min(text.length, match.index + raw.length + 30)));
      let value = parseLocalizedNumber(raw);
      if (value === null && /^\d{1,3}\.\d{3}$/.test(raw) && /\b(millon(?:es)?|mil(?:es)?)\b/.test(around)) {
        value = Number(raw.replace('.', ''));
      }
      if (value === null) continue;
      let scale = 1;
      if (/\b(millon(?:es)?|million(?:s)?|mm)\b/.test(around)) scale = 1_000_000;
      else if (/\b(billon(?:es)?|billion(?:s)?|bn)\b/.test(around)) scale = 1_000_000_000;
      else if (/\b(mil(?:es)?|thousand(?:s)?|k)\b/.test(around)) scale = 1_000;
      matches.push({ value: value * scale, raw, around });
    }
    return matches;
  }

  function metricMatches(text, metric) {
    const mentions = numericMentions(text);
    const expectedScaled = metric.value / metric.unitScale;
    return mentions.some(({ value }) => {
      const candidate = Math.abs(value - metric.value) <= metric.value * metric.tolerancePercent / 100;
      const scaled = Math.abs(value - expectedScaled) <= Math.max(Math.abs(expectedScaled) * metric.tolerancePercent / 100, 0.02);
      return candidate || scaled;
    });
  }

  function hasAllTerms(text, terms = []) {
    const normalized = normalize(text);
    return terms.every((term) => normalized.includes(normalize(term)));
  }

  function deadlineIsWithinThreeYears(value) {
    const text = normalize(value);
    const monthMatch = text.match(/(\d{1,2})\s*mes/);
    if (monthMatch) return Number(monthMatch[1]) > 0 && Number(monthMatch[1]) <= 36;
    const yearMatch = text.match(/(\d)\s*ano/);
    if (yearMatch) return Number(yearMatch[1]) > 0 && Number(yearMatch[1]) <= 3;
    return /\b(12|24|36)\s*mes|\b(1|2|3)\s*ano|202[7-9]\b/.test(text);
  }

  function containsInternalSourceRequest(text, rubric) {
    return hasAnyTerm(text, rubric.internalDataTerms);
  }

  function validate(values, reference, sourceSummary = null) {
    const rubric = reference.rubric;
    const criteria = [];
    const warnings = [];
    const add = (id, label, points, earned, detail, severity = 'medium') => {
      criteria.push({ id, label, points, earned: Math.max(0, Math.min(points, earned)), passed: earned >= points, detail, severity });
    };
    const read = (id) => String(values[id] ?? '').trim();
    const words = (ids) => ids.map(read).filter(Boolean).join(' ');
    const referenceMatched = Boolean(
      sourceSummary &&
      sourceSummary.recordCount === reference.dataset.recordCount &&
      Array.isArray(sourceSummary.reporters) &&
      sourceSummary.reporters.length === 1 &&
      normalize(sourceSummary.reporters[0]) === normalize(reference.dataset.reporter) &&
      Array.isArray(sourceSummary.periods) &&
      reference.dataset.periods.every((period) => sourceSummary.periods.includes(period))
    );

    const sourceScopeValid = ['external', 'simulated'].includes(read('s2_scope'));
    add(
      'source-scope',
      'Reconoce que el archivo de referencia es externo/simulado y no mide MANACO',
      12,
      sourceScopeValid ? 12 : 0,
      sourceScopeValid
        ? 'La procedencia fue clasificada fuera de los datos internos de MANACO.'
        : 'La base del ejercicio reporta comercio de España; selecciona “Referencia externa” o “Dato simulado” salvo que documentes y verifiques otra fuente.',
      'high'
    );

    const allS2 = words(['s2_finding_1', 's2_evidence_1', 's2_implication_1', 's2_finding_2', 's2_evidence_2', 's2_implication_2', 's2_finding_3', 's2_evidence_3', 's2_implication_3', 's2_limit_1', 's2_limit_2', 's2_question']);
    const s2Claims = [1, 2, 3].map((number) =>
      `${read(`s2_finding_${number}`)} ${read(`s2_evidence_${number}`)} ${read(`s2_implication_${number}`)}`
    );
    const unsupportedManacoClaim = sourceScopeValid && /\b(manaco)\b/.test(normalize(allS2)) &&
      /\bmanaco\b.{0,70}\b(import\w*|export\w*|vend\w*|registr\w*|report\w*|tien\w*|obten\w*)\b|\b(import\w*|export\w*|vend\w*|registr\w*|report\w*|tien\w*|obten\w*)\b.{0,70}\bmanaco\b/.test(normalize(allS2));
    if (unsupportedManacoClaim) {
      warnings.push({ severity: 'high', message: 'Revisa una posible atribución de importaciones, exportaciones o ventas de España a MANACO. La fuente cargada no respalda esa afirmación.' });
    }

    const supportedFacts = [];
    const unsupportedFacts = [];
    for (const fact of reference.facts.filter((item) => item.id !== 'external-scope')) {
      const mentionsClaim = s2Claims.filter((claim) =>
        (!fact.keywordsAny || hasAnyTerm(claim, fact.keywordsAny)) &&
        (!fact.termsAll || hasAllTerms(claim, fact.termsAll))
      );
      if (!mentionsClaim.length) continue;
      const matches = !fact.metrics || mentionsClaim.some((claim) => fact.metrics.some((metric) => metricMatches(claim, metric)));
      if (matches) supportedFacts.push(fact.label);
      else if (mentionsClaim.some((claim) => numericMentions(claim).length > 0)) unsupportedFacts.push(fact.label);
    }
    const matchedFactPoints = Math.min(20, supportedFacts.length * 5);
    if (referenceMatched && unsupportedFacts.length) {
      warnings.push({ severity: 'high', message: `Revisa cifras que no coinciden con el Excel en: ${unsupportedFacts.join(' · ')}.` });
    }
    add(
      'reference-facts',
      'Sustenta afirmaciones descriptivas con cifras de la referencia',
      20,
      referenceMatched ? matchedFactPoints : 0,
      !referenceMatched
        ? 'No se cargó la misma base del caso; no se verifican automáticamente sus cifras.'
        : `${supportedFacts.length} afirmación(es) coinciden con la referencia. ${supportedFacts.join(' · ') || 'Incluye cifras y conceptos del Excel.'}`,
      'high'
    );

    const findingsComplete = [1, 2, 3].filter((number) =>
      read(`s2_finding_${number}`) && read(`s2_evidence_${number}`) && read(`s2_implication_${number}`)
    ).length;
    add(
      'three-findings',
      'Completa los tres hallazgos con evidencia e interpretación separados',
      12,
      findingsComplete * 4,
      `${findingsComplete} de 3 hallazgos tienen observación, evidencia e interpretación.`,
      'medium'
    );

    const limitationsComplete = [1, 2].filter((number) => read(`s2_limit_${number}`)).length;
    const limitationsMentionExternal = hasAnyTerm(`${read('s2_limit_1')} ${read('s2_limit_2')}`, ['españa', 'externa', 'manaco', 'procedencia', 'aduanero', 'simulado']);
    add(
      'limitations',
      'Documenta dos limitaciones, incluyendo el alcance/procedencia',
      8,
      limitationsComplete === 2 ? (limitationsMentionExternal ? 8 : 5) : limitationsComplete * 2,
      limitationsComplete === 2 && limitationsMentionExternal
        ? 'Hay dos limitaciones y al menos una explicita el alcance de la fuente.'
        : `${limitationsComplete} de 2 limitaciones completas; menciona explícitamente procedencia, cobertura, calidad o alcance.`,
      'medium'
    );

    const strategicQuestion = read('s2_question');
    const strategicQuestionReady = strategicQuestion.length >= 25 && containsInternalSourceRequest(strategicQuestion, rubric);
    add(
      'strategic-question',
      'Formula una pregunta estratégica que identifique datos internos a solicitar',
      5,
      strategicQuestionReady ? 5 : strategicQuestion ? 2 : 0,
      strategicQuestionReady ? 'La pregunta relaciona una decisión con datos internos de MANACO.' : 'Escribe una pregunta concreta e indica los datos internos necesarios para responderla.',
      'low'
    );

    const priorityCount = Array.from({ length: 5 }, (_, index) => index + 1).filter((number) =>
      read(`s1_problem_${number}`) && read(`s1_reason_${number}`) && read(`s1_questions_${number}`) && read(`s1_data_${number}`)
    ).length;
    const internalDataCount = Array.from({ length: 5 }, (_, index) => index + 1).filter((number) =>
      containsInternalSourceRequest(`${read(`s1_data_${number}`)} ${read(`s1_questions_${number}`)}`, rubric)
    ).length;
    add(
      'problem-prioritization',
      'Prioriza problemas con justificación, pregunta y datos requeridos',
      10,
      Math.round((priorityCount / 5) * 6 + (internalDataCount / 5) * 4),
      `${priorityCount} problemas tienen los cuatro campos completos; ${internalDataCount} identifican tipos de datos internos relevantes.`,
      'medium'
    );

    const smartObjectives = [1, 2, 3].map((number) => {
      const objective = read(`s3_objective_${number}`);
      const kpi = read(`s3_kpi_${number}`);
      const deadline = read(`s3_deadline_${number}`);
      const measurable = numericMentions(`${objective} ${kpi}`).length > 0 && hasAnyTerm(kpi, rubric.measurableTerms);
      const bounded = deadlineIsWithinThreeYears(deadline);
      return { number, measurable, bounded, complete: Boolean(objective && kpi && deadline), good: Boolean(objective && kpi && deadline && measurable && bounded) };
    });
    const goodObjectives = smartObjectives.filter((item) => item.good).length;
    const completeObjectives = smartObjectives.filter((item) => item.complete).length;
    add(
      'smart-objectives',
      'Define tres objetivos medibles con KPI y plazos de hasta 36 meses',
      15,
      goodObjectives * 5 + (completeObjectives - goodObjectives) * 2,
      `${goodObjectives} de 3 pasan las comprobaciones automáticas de medida, KPI y plazo; ${completeObjectives} están completos. Revisa que sean alcanzables y tengan línea base.`,
      'high'
    );

    const ownersPresent = hasAnyTerm(read('s3_coordination'), rubric.ownerTerms);
    const risksMitigated = [1, 2].filter((number) =>
      read(`s3_risk_${number}`) && hasAnyTerm(read(`s3_mitigation_${number}`), rubric.mitigationTerms)
    ).length;
    add(
      'ownership-risk',
      'Asigna coordinación/responsables y mitiga dos riesgos',
      8,
      (ownersPresent ? 3 : 0) + risksMitigated * 2.5,
      `${ownersPresent ? 'Se identificó un área/responsable.' : 'Falta responsable/área.'} ${risksMitigated} de 2 riesgos incluyen una acción de mitigación reconocible.`,
      'medium'
    );

    const alternativesComplete = [1, 2].filter((number) =>
      ['alt', 'benefit', 'cost', 'risk', 'metric'].every((field) => read(`s4_${field}_${number}`))
    ).length;
    const alternativesCostedOrAcknowledged = [1, 2].filter((number) =>
      numericMentions(read(`s4_cost_${number}`)).length > 0 ||
      hasAnyTerm(read(`s4_cost_${number}`), ['sin datos', 'pendiente', 'por cotizar', 'no disponible', 'validar', 'solicitar', 'estimación', 'estimado'])
    ).length;
    add(
      'alternative-comparison',
      'Compara dos alternativas con beneficio, costo/recursos, riesgo e indicador',
      10,
      Math.round(alternativesComplete * 3 + alternativesCostedOrAcknowledged * 2),
      `${alternativesComplete} alternativas incluyen los cinco campos; ${alternativesCostedOrAcknowledged} presentan cifras de costo o reconocen explícitamente que deben estimarse.`,
      'high'
    );

    const selection = read('s4_selected');
    const selectionReason = read('s4_reason');
    const selectedExists = selection && read(`s4_alt_${selection}`);
    const rationaleCoversTradeoffs = hasAnyTerm(selectionReason, ['beneficio', 'impacto', 'costo', 'coste', 'riesgo']) &&
      (numericMentions(selectionReason).length > 0 || hasAnyTerm(selectionReason, ['supuesto', 'falta', 'pendiente', 'validar', 'datos']));
    add(
      'recommendation',
      'Selecciona y justifica una alternativa con trade-offs y supuestos',
      8,
      (selectedExists ? 3 : 0) + (rationaleCoversTradeoffs ? 5 : 0),
      selectedExists && rationaleCoversTradeoffs
        ? 'La alternativa elegida existe y la justificación contempla trade-offs o datos faltantes.'
        : 'Selecciona una alternativa existente y compara beneficios, costos y riesgos; distingue estimaciones de hechos.',
      'high'
    );

    const actionReady = read('s4_segment').length >= 10 && read('s4_action').length >= 15 &&
      hasAnyTerm(`${read('s4_missing_data')} ${read('s4_segment')}`, rubric.internalDataTerms);
    add(
      'commercial-action',
      'Vincula un segmento y acción comercial con evidencia/datos por validar',
      5,
      actionReady ? 5 : (read('s4_segment') && read('s4_action') ? 2 : 0),
      actionReady ? 'Se documentó un segmento, una acción y datos relacionados.' : 'Completa segmento, acción concreta y los datos necesarios para comprobarla.',
      'medium'
    );

    const trackingKpis = [1, 2, 3].filter((number) =>
      read(`s4_kpi_${number}`) &&
      numericMentions(read(`s4_kpi_${number}`)).length > 0 &&
      hasAnyTerm(read(`s4_kpi_${number}`), [...rubric.measurableTerms, ...rubric.timeTerms])
    ).length;
    add(
      'tracking-kpis',
      'Define tres indicadores de seguimiento medibles y con periodo/meta',
      7,
      trackingKpis * (7 / 3),
      `${trackingKpis} de 3 KPI incluyen un valor/meta numérica y una unidad o periodo reconocible.`,
      'medium'
    );

    if (!referenceMatched) {
      warnings.push({ severity: 'medium', message: 'La fuente no coincide exactamente con la referencia del caso (240 registros, reportante España y periodos 2020–2024); las cifras de la Estación 2 no se verifican. Los demás controles de forma/rúbrica siguen disponibles.' });
    }
    if (sourceSummary && Array.isArray(sourceSummary.reporters) && sourceSummary.reporters.length &&
      sourceSummary.reporters.some((reporter) => normalize(reporter) !== normalize('España'))) {
      warnings.push({ severity: 'high', message: 'El archivo cargado incluye otro país reportante; no uses los resultados de la referencia como si fueran cifras de esa fuente.' });
    }

    const maxScore = criteria.reduce((sum, item) => sum + item.points, 0);
    const earned = criteria.reduce((sum, item) => sum + item.earned, 0);
    const score = maxScore ? Math.round(earned / maxScore * 100) : 0;
    const blockers = criteria.filter((item) => !item.passed && item.severity === 'high').length + warnings.filter((item) => item.severity === 'high').length;
    return {
      score,
      earned: Math.round(earned * 10) / 10,
      maxScore,
      status: blockers ? 'needs-review' : score >= 80 ? 'strong' : 'in-progress',
      referenceMatched,
      criteria,
      warnings,
      disclaimer: rubric.disclaimer
    };
  }

  const api = { validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CaseAnswerValidator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
