(function (root) {
  'use strict';

  const aliases = {
    country: ['pais socio', 'socio comercial', 'partner country', 'country partner', 'pais de origen', 'pais de destino', 'pais', 'country', 'partner', 'socio'],
    flow: ['flujo comercial', 'tipo de flujo', 'trade flow', 'flow', 'flujo', 'tipo de comercio', 'operacion'],
    product: ['producto', 'product', 'commodity', 'mercancia', 'partida arancelaria', 'codigo arancelario', 'hs code', 'descripcion del producto'],
    quantity: ['cantidad de pares', 'pares', 'pair quantity', 'quantity of pairs', 'number of pairs', 'pairs', 'cantidad', 'quantity', 'qty'],
    value: ['valor comercial', 'trade value', 'valor de comercio', 'valor usd', 'trade value usd', 'fob value', 'cif value', 'valor', 'value', 'monto'],
    period: ['periodo', 'period', 'fecha', 'date', 'ano', 'year', 'mes', 'month'],
    currency: ['moneda', 'currency', 'divisa']
  };

  const worldLabels = new Set(['mundo', 'world', 'total mundo', 'total mundial', 'world total', 'total world', 'global', 'resto del mundo']);

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function resolveSchema(headers) {
    const normalizedHeaders = headers.map(normalize);
    const schema = {};
    const ambiguities = [];
    for (const [role, roleAliases] of Object.entries(aliases)) {
      const candidates = [];
      normalizedHeaders.forEach((header, index) => {
        for (const alias of roleAliases) {
          const match = header === alias || header.includes(alias);
          if (match) candidates.push({ index, header: String(headers[index] ?? ''), score: header === alias ? 1000 : alias.length });
        }
      });
      const byColumn = new Map(candidates.map((candidate) => [candidate.index, candidate]));
      const uniqueCandidates = [...byColumn.values()];
      if (uniqueCandidates.length === 1) schema[role] = uniqueCandidates[0];
      else if (uniqueCandidates.length > 1) ambiguities.push({ role, headers: uniqueCandidates.map((candidate) => candidate.header) });
    }
    const quantityHeader = schema.quantity ? normalizedHeaders[schema.quantity.index] : '';
    schema.pairsCompatible = Boolean(
      schema.quantity && /\b(pares|pairs)\b/.test(quantityHeader) &&
      !/\b(miles|mil|thousands|thousand|millones|million|millions|000|000s)\b/.test(quantityHeader)
    );
    schema.headerCurrency = schema.value ? currencyFromText(schema.value.header) : null;
    schema.headerScale = schema.value ? scaleFromText(schema.value.header) : null;
    return { ...schema, ambiguities };
  }

  function scaleFromText(value) {
    const text = normalize(value);
    if (/\b(millones|million|millions|mn)\b/.test(text)) return 'millones';
    if (/\b(miles|mil|thousands|thousand|000|000s)\b/.test(text)) return 'miles';
    return null;
  }

  function currencyFromText(value) {
    const text = normalize(value);
    const currencies = [
      { pattern: /\busd\b|us dollar|dolar estadounidense|dolares americanos/, code: 'USD' },
      { pattern: /\beur\b|euro/, code: 'EUR' },
      { pattern: /\bbob\b|boliviano/, code: 'BOB' },
      { pattern: /\bmxn\b|peso mexicano/, code: 'MXN' },
      { pattern: /\bar[gs]\b|peso argentino/, code: 'ARS' },
      { pattern: /\bpen\b|sol peruano/, code: 'PEN' },
      { pattern: /\bclp\b|peso chileno/, code: 'CLP' },
      { pattern: /\bbrl\b|real brasileno/, code: 'BRL' }
    ];
    return currencies.find((currency) => currency.pattern.test(text))?.code ?? null;
  }

  function currencyValue(value) {
    const original = String(value ?? '').trim();
    const code = currencyFromText(original);
    return code ? { key: code, label: code, verified: true } : original ? { key: `other:${normalize(original)}`, label: original, verified: false } : null;
  }

  function classifyFlow(value) {
    const flow = normalize(value);
    if (/^(import|imports|importacion|importaciones|importacion de bienes)$/.test(flow)) return 'import';
    if (/^(export|exports|exportacion|exportaciones|exportacion de bienes)$/.test(flow)) return 'export';
    return null;
  }

  function isWorld(value) {
    return worldLabels.has(normalize(value));
  }

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const text = value.trim().replace(/[\u00a0\u202f ]/g, '');
    if (!text) return null;
    if (/^-?\d+$/.test(text)) return Number(text);
    if (/^-?\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) return Number(text.replace(/,/g, ''));
    if (/^-?\d+\.\d{1,2}$/.test(text)) return Number(text);
    if (/^-?\d+,\d{1,2}$/.test(text)) return Number(text.replace(',', '.'));
    return null;
  }

  function normalizePeriod(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= 9999) return String(value);
    const text = String(value ?? '').trim();
    if (/^\d{4}$/.test(text)) return text;
    if (/^\d{4}[-/]\d{1,2}$/.test(text)) return text.replace('/', '-').replace(/-(\d)$/, '-0$1');
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) return text.replaceAll('/', '-');
    if (/^\d{4}[- ]?Q[1-4]$/i.test(text)) return text.toUpperCase().replace(' ', '-');
    return null;
  }

  function uniqueValues(rows, columnIndex, transform = (value) => String(value ?? '').trim()) {
    if (columnIndex === undefined) return [];
    return [...new Set(rows.map((row) => transform(row[columnIndex])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  }

  function getFilterOptions(headers, rows) {
    const schema = resolveSchema(headers);
    return {
      country: schema.country ? uniqueValues(rows, schema.country.index) : [],
      flow: schema.flow ? uniqueValues(rows, schema.flow.index) : [],
      product: schema.product ? uniqueValues(rows, schema.product.index) : [],
      period: schema.period ? uniqueValues(rows, schema.period.index, normalizePeriod) : []
    };
  }

  function sameFilter(value, filter) {
    return filter === undefined || filter === null || filter === '' || String(value ?? '').trim() === String(filter);
  }

  function analyzeMarket(headers, rows, filters = {}, firstDataRowNumber = 2) {
    const schema = resolveSchema(headers);
    const width = headers.length;
    const sourceRows = rows.map((row, index) => ({
      row: Array.from({ length: width }, (_, column) => row[column] ?? ''),
      sourceRow: firstDataRowNumber + index
    })).filter(({ row }) => row.some((value) => value !== null && value !== undefined && String(value).trim() !== ''));
    const filterMatches = sourceRows.filter(({ row }) => {
      if (schema.country && !sameFilter(row[schema.country.index], filters.country)) return false;
      if (schema.flow && !sameFilter(row[schema.flow.index], filters.flow)) return false;
      if (schema.product && !sameFilter(row[schema.product.index], filters.product)) return false;
      if (schema.period && filters.period && normalizePeriod(row[schema.period.index]) !== filters.period) return false;
      return true;
    });
    const worldRows = schema.country ? filterMatches.filter(({ row }) => isWorld(row[schema.country.index])) : [];
    const worldMode = filters.worldMode === 'world' ? 'world' : 'detailed';
    const scopedRows = filterMatches.filter(({ row }) => worldMode === 'world'
      ? schema.country && isWorld(row[schema.country.index])
      : !schema.country || !isWorld(row[schema.country.index]));

    const duplicateCounts = new Map();
    for (const { row } of scopedRows) {
      const key = JSON.stringify(row.map((value) => value instanceof Date ? value.toISOString() : value));
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
    }
    const duplicateRecords = [...duplicateCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);

    const flowRecords = scopedRows.map(({ row, sourceRow }) => ({
      row,
      sourceRow,
      flow: schema.flow ? classifyFlow(row[schema.flow.index]) : null,
      country: schema.country ? String(row[schema.country.index] ?? '').trim() : '',
      product: schema.product ? String(row[schema.product.index] ?? '').trim() : '',
      period: schema.period ? normalizePeriod(row[schema.period.index]) : null,
      value: schema.value ? parseNumber(row[schema.value.index]) : null,
      pairs: schema.quantity ? parseNumber(row[schema.quantity.index]) : null,
      currency: schema.currency ? currencyValue(row[schema.currency.index]) : null
    }));

    let unit = schema.headerCurrency;
    let unitStatus = unit ? 'known' : 'unknown';
    if (!schema.headerCurrency && schema.currency) {
      const currencyValues = flowRecords.map((record) => record.currency);
      const found = currencyValues.filter(Boolean);
      const keys = new Set(found.map((currency) => currency.key));
      if (found.length === flowRecords.length && keys.size === 1) {
        unit = found[0].label;
        unitStatus = found[0].verified ? 'known' : 'unknown';
      } else if (keys.size > 1) {
        unitStatus = 'mixed';
      } else if (flowRecords.length && found.length !== flowRecords.length) {
        unitStatus = 'incomplete';
      }
    } else if (schema.headerCurrency && schema.currency) {
      const rowCurrencies = flowRecords.map((record) => record.currency?.key).filter(Boolean);
      const keys = new Set(rowCurrencies);
      if (keys.size > 1 || rowCurrencies.length !== flowRecords.length || flowRecords.some((record) => !record.currency?.verified || record.currency.key !== schema.headerCurrency)) unitStatus = 'mixed';
    }

    const importRecords = flowRecords.filter((record) => record.flow === 'import');
    const exportRecords = flowRecords.filter((record) => record.flow === 'export');
    const validRecords = flowRecords.filter((record) => record.flow && record.value !== null);
    const comparableUnit = unitStatus === 'known';
    const metricsAvailable = Boolean(schema.flow && schema.value);
    const canAggregateValues = metricsAvailable && unitStatus !== 'mixed' && unitStatus !== 'incomplete';
    const canCompareFlows = canAggregateValues && !filters.flow;
    const totalByFlow = (records) => records.reduce((sum, record) => sum + (record.value ?? 0), 0);
    const importTotal = metricsAvailable && importRecords.some((record) => record.value !== null) && unitStatus !== 'mixed' && unitStatus !== 'incomplete'
      ? totalByFlow(importRecords.filter((record) => record.value !== null)) : null;
    const exportTotal = metricsAvailable && exportRecords.some((record) => record.value !== null) && unitStatus !== 'mixed' && unitStatus !== 'incomplete'
      ? totalByFlow(exportRecords.filter((record) => record.value !== null)) : null;
    const includedRecords = canAggregateValues ? validRecords.length : 0;

    const importRecordCount = importRecords.filter((record) => record.value !== null).length;
    const exportRecordCount = exportRecords.filter((record) => record.value !== null).length;
    const periodRecords = flowRecords.filter((record) => record.flow !== null);
    const validImportPeriods = importRecords.filter((record) => record.value !== null).map((record) => record.period);
    const validExportPeriods = exportRecords.filter((record) => record.value !== null).map((record) => record.period);
    const importPeriodSet = new Set(validImportPeriods);
    const exportPeriodSet = new Set(validExportPeriods);
    const partnerPeriodSet = new Set(validRecords.map((record) => record.period));
    const partnerPeriodComparable = Boolean(schema.period && validRecords.length && validRecords.every((record) => record.period !== null) && partnerPeriodSet.size === 1);
    const periodsComparable = Boolean(
      schema.period && importRecordCount && exportRecordCount &&
      periodRecords.every((record) => record.period !== null) &&
      validImportPeriods.every((period) => period !== null) &&
      validExportPeriods.every((period) => period !== null) &&
      importPeriodSet.size === exportPeriodSet.size &&
      [...importPeriodSet].every((period) => exportPeriodSet.has(period))
    );
    const canCompareTotals = canAggregateValues && comparableUnit && periodsComparable && !filters.flow;
    const canCalculateBalance = canCompareTotals && importRecordCount > 0 && exportRecordCount > 0;
    const partnersComparable = canAggregateValues && comparableUnit && partnerPeriodComparable;

    const partnerGroups = new Map();
    if (canAggregateValues && schema.country) {
      for (const record of validRecords) {
        if (!record.country) continue;
        const group = partnerGroups.get(record.country) ?? { country: record.country, imports: 0, exports: 0, importRecords: 0, exportRecords: 0, records: 0 };
        group[record.flow === 'import' ? 'imports' : 'exports'] += record.value;
        group[record.flow === 'import' ? 'importRecords' : 'exportRecords'] += 1;
        group.records += 1;
        partnerGroups.set(record.country, group);
      }
    }
    const partners = [...partnerGroups.values()]
      .map((partner) => ({
        ...partner,
        imports: partner.importRecords ? partner.imports : null,
        exports: partner.exportRecords ? partner.exports : null,
        total: partnersComparable ? partner.imports + partner.exports : null
      }))
      .sort((a, b) => partnersComparable ? b.total - a.total || a.country.localeCompare(b.country, 'es') : a.country.localeCompare(b.country, 'es'));

    const timeGroups = new Map();
    if (canAggregateValues && schema.period) {
      for (const record of validRecords) {
        if (!record.period) continue;
        const group = timeGroups.get(record.period) ?? { period: record.period, imports: 0, exports: 0, importRecords: 0, exportRecords: 0, records: 0 };
        group[record.flow === 'import' ? 'imports' : 'exports'] += record.value;
        group[record.flow === 'import' ? 'importRecords' : 'exportRecords'] += 1;
        group.records += 1;
        timeGroups.set(record.period, group);
      }
    }
    const timeSeries = [...timeGroups.values()]
      .map((period) => ({
        ...period,
        imports: period.importRecords ? period.imports : null,
        exports: period.exportRecords ? period.exports : null
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
    const timeRecordsIncluded = timeSeries.reduce((sum, period) => sum + period.records, 0);

    const pairScopeRecords = filters.flow
      ? flowRecords.filter((record) => record.flow === classifyFlow(filters.flow))
      : flowRecords.filter((record) => record.flow !== null);
    const pairCandidateRecords = pairScopeRecords.filter((record) => record.value !== null && record.pairs !== null && record.pairs > 0);
    const pairPeriods = new Set(pairScopeRecords.map((record) => record.period));
    const pairPeriodComparable = Boolean(schema.period && pairScopeRecords.length && pairScopeRecords.every((record) => record.period !== null) && pairPeriods.size === 1);
    const pairCalculationAvailable = comparableUnit && schema.pairsCompatible && pairPeriodComparable;
    const pairRatio = (records) => {
      const pairRecords = records.filter((record) => record.value !== null && record.pairs !== null && record.pairs > 0);
      return pairCalculationAvailable && pairRecords.length
      ? pairRecords.reduce((sum, record) => sum + record.value, 0) / pairRecords.reduce((sum, record) => sum + record.pairs, 0)
      : null;
    };
    const pairValue = pairRatio(pairScopeRecords);

    const recordsByPartnerAndFlow = partners.flatMap((partner) => [
      { pais: partner.country, flujo: 'Importaciones', valor: partner.imports, registros: partner.importRecords },
      { pais: partner.country, flujo: 'Exportaciones', valor: partner.exports, registros: partner.exportRecords }
    ]).filter((record) => record.registros > 0);

    const missingValues = flowRecords.filter((record) => record.flow && record.value === null).length;
    const missingPairs = flowRecords.filter((record) => record.flow && record.pairs === null).length;
    const invalidPeriods = schema.period ? validRecords.filter((record) => !record.period).length : scopedRows.length;
    const valueExcluded = scopedRows.length - validRecords.length;
    const filterExcluded = sourceRows.length - filterMatches.length;

    return {
      schema,
      filters: { ...filters, worldMode },
      units: {
        label: unit ? `${unit}${schema.headerScale ? ` (${schema.headerScale})` : ''}` : `unidad no identificada${schema.headerScale ? ` (${schema.headerScale})` : ''}`,
        status: unitStatus,
        comparable: comparableUnit
      },
      counts: {
        source: sourceRows.length,
        afterFilters: filterMatches.length,
        worldCandidates: worldRows.length,
        worldExcluded: worldMode === 'detailed' ? worldRows.length : 0,
        inScope: scopedRows.length,
        included: includedRecords,
        excluded: scopedRows.length - includedRecords,
        filterExcluded,
        valueExcluded,
        duplicates: duplicateRecords,
        partnerIncluded: partners.reduce((sum, partner) => sum + partner.records, 0),
        partnerExcluded: canAggregateValues && schema.country ? validRecords.length - partners.reduce((sum, partner) => sum + partner.records, 0) : scopedRows.length,
        periodIncluded: timeRecordsIncluded,
        periodExcluded: validRecords.length - timeRecordsIncluded,
        pairIncluded: pairCalculationAvailable ? pairCandidateRecords.length : 0,
        pairExcluded: pairScopeRecords.length - (pairCalculationAvailable ? pairCandidateRecords.length : 0)
      },
      periods: { comparable: periodsComparable },
      totals: {
        import: importTotal,
        export: exportTotal,
        balance: canCalculateBalance ? exportTotal - importTotal : null,
        importRecords: importRecordCount,
        exportRecords: exportRecordCount,
        missingValues,
        missingPairs,
        zeroValues: validRecords.filter((record) => record.value === 0).length
      },
      valuePerPair: pairValue,
      partners,
      timeSeries,
      recordsByPartnerAndFlow,
      validRecords,
      worldRows: worldRows.map(({ row, sourceRow }) => ({ row, sourceRow })),
      diagnostics: {
        hasFlow: Boolean(schema.flow),
        hasValue: Boolean(schema.value),
        hasCountry: Boolean(schema.country),
        hasProduct: Boolean(schema.product),
        hasPeriod: Boolean(schema.period),
        hasPairs: Boolean(schema.quantity),
        pairsCompatible: schema.pairsCompatible,
        valueAggregatable: canAggregateValues,
        pairPeriodComparable,
        partnerPeriodComparable,
        canCompareFlows: canCompareTotals,
        partnersComparable,
        invalidPeriods,
        excludedRows: valueExcluded,
        assumptions: [
          'Solo se usan columnas identificadas por alias explícitos; las ambigüedades requieren validación manual.',
          'Cada fila de origen se procesa una vez. Los duplicados se cuentan y no se eliminan automáticamente.',
          'Las filas «Mundo» se excluyen de la vista desglosada; pueden inspeccionarse en modo separado, nunca se suman junto a países.',
          'Importación y exportación se clasifican por el texto del flujo. Otros valores de flujo no entran en esos indicadores.',
          'Los valores de texto con formato numérico ambiguo se tratan como no interpretables; cero se conserva como valor válido.',
          periodsComparable ? 'Los flujos comparados cubren los mismos periodos normalizados.' : 'No se calcula saldo ni ranking combinado de socios: falta periodo válido o la cobertura temporal de los flujos no coincide.',
            unitStatus === 'known' ? `La unidad se considera común por ${schema.headerCurrency ? 'la moneda indicada en el encabezado' : 'la columna de moneda con un único valor'}.` : unitStatus === 'unknown' ? 'Los importes se agregan por separado porque provienen de la misma columna, pero la moneda no está confirmada; no se calcula saldo ni valor por par.' : 'Se detectaron monedas mezcladas o ausentes; no se agregan importes entre filas ni se calcula saldo.'
        ]
      }
    };
  }

  const api = { analyzeMarket, classifyFlow, getFilterOptions, isWorld, normalizePeriod, parseNumber, resolveSchema };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MarketAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);