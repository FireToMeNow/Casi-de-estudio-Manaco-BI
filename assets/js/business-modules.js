(function (root) {
  'use strict';

  const market = root.MarketAnalysis;
  const dataAnalysis = root.DataAnalysis;
  const inventoryAliases = {
    movement: ['tipo de movimiento', 'movimiento de inventario', 'movement type', 'inventory movement', 'movement'],
    stock: ['existencia actual', 'stock actual', 'saldo de inventario', 'existencia final', 'closing stock', 'stock on hand', 'quantity on hand', 'on hand'],
    reorder: ['punto de reposicion', 'stock minimo', 'existencia minima', 'reorder point', 'minimum stock', 'min stock'],
    location: ['almacen', 'bodega', 'sucursal', 'tienda', 'ubicacion', 'warehouse', 'store', 'location']
  };
  const profitabilityAliases = {
    revenue: ['ingresos por ventas', 'ingreso por ventas', 'ventas netas', 'sales revenue', 'net sales', 'sales income', 'ventas', 'venta', 'revenue'],
    cost: ['costo de ventas', 'costos de venta', 'cost of goods sold', 'cost of sales', 'cogs']
  };

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function findColumn(headers, aliases, excludeAliases = [], excludeIndexes = []) {
    const candidates = [];
    headers.forEach((header, index) => {
      const value = normalize(header);
      if (excludeIndexes.includes(index)) return;
      if (excludeAliases.some((alias) => value.includes(alias))) return;
      if (aliases.some((alias) => value === alias || value.includes(alias))) candidates.push({ index, header: String(header ?? '') });
    });
    return candidates.length === 1 ? { column: candidates[0], ambiguous: [] } : { column: null, ambiguous: candidates };
  }

  function nonEmptyRows(headers, rows) {
    return rows.map((row, index) => ({
      row: Array.from({ length: headers.length }, (_, column) => row[column] ?? ''),
      sourceRow: index + 2
    })).filter(({ row }) => row.some((value) => String(value ?? '').trim() !== ''));
  }

  function duplicateCount(headers, rows) {
    return dataAnalysis.analyze(headers, rows, 2).duplicateRowNumbers.length;
  }

  function sourceHasMissing(headers, rows, index) {
    return nonEmptyRows(headers, rows).some(({ row }) => !String(row[index] ?? '').trim());
  }

  function countryIndexes(headers, schema) {
    if (schema.country) return [schema.country.index];
    const candidates = schema.ambiguities.find((ambiguity) => ambiguity.role === 'country')?.headers ?? [];
    return headers.flatMap((header, index) => candidates.includes(String(header ?? '')) ? [index] : []);
  }

  function hasWorldCountryValue(row, indexes) {
    return indexes.some((index) => market.isWorld(row[index]));
  }

  function unitToken(header) {
    const text = normalize(header);
    if (/\b(pares|pairs)\b/.test(text)) return 'pares';
    if (/\b(unidades|unidad|units|unit|pieces|piece|piezas|pieza|items|item)\b/.test(text)) return 'unidades';
    if (/\b(kg|kilogramo|kilogramos|kilograms)\b/.test(text)) return 'kg';
    if (/\b(litro|litros|liters|liter)\b/.test(text)) return 'litros';
    return null;
  }

  function classifyMovement(value) {
    const text = normalize(value);
    const incoming = /\b(entrada|entradas|ingreso|ingresos|recepcion|recepciones|compra|compras|inbound|receipt|receipts)\b/.test(text);
    const outgoing = /\b(salida|salidas|egreso|egresos|despacho|despachos|venta|ventas|outbound|issue|dispatch)\b/.test(text);
    if (incoming === outgoing) return null;
    return incoming ? 'incoming' : 'outgoing';
  }

  function analyzeInventory(headers, rows) {
    const roles = market.resolveSchema(headers);
    const movement = findColumn(headers, inventoryAliases.movement);
    const stock = findColumn(headers, inventoryAliases.stock);
    const reorder = findColumn(headers, inventoryAliases.reorder);
    const location = findColumn(headers, inventoryAliases.location);
    const excludedQuantityColumns = [movement, stock, reorder].flatMap((resolved) => resolved.column ? [resolved.column.index] : []);
    const quantity = findColumn(
      headers,
      ['cantidad de pares', 'pair quantity', 'quantity of pairs', 'number of pairs', 'pares', 'pairs', 'cantidad', 'quantity', 'qty'],
      [],
      excludedQuantityColumns
    );
    const nonEmptySourceRows = nonEmptyRows(headers, rows);
    const countryColumnIndexes = countryIndexes(headers, roles);
    const worldRows = nonEmptySourceRows.filter(({ row }) => hasWorldCountryValue(row, countryColumnIndexes));
    const sourceRows = nonEmptySourceRows.filter(({ row }) => !hasWorldCountryValue(row, countryColumnIndexes));
    const needs = [];
    if (!roles.product) needs.push('una columna única de producto o categoría');
    if (!quantity.column) needs.push(quantity.ambiguous.length ? 'un único encabezado de cantidad/movimiento' : 'una columna numérica de cantidad/movimiento');
    if (!movement.column) needs.push(movement.ambiguous.length ? 'un único encabezado para tipo de movimiento' : 'una columna de tipo de movimiento (entrada/salida)');
    if (needs.length) {
      return {
        available: false,
        needs,
        message: 'No se pueden resumir movimientos de inventario con seguridad. Se necesitan ' + needs.join(', ') + '.',
        products: [],
        totals: null,
        alertsEnabled: false,
        duplicateRows: duplicateCount(headers, sourceRows.map(({ row }) => row))
      };
    }

    const records = sourceRows.map(({ row, sourceRow }) => ({
      row,
      sourceRow,
      product: String(row[roles.product.index] ?? '').trim(),
      movement: classifyMovement(row[movement.column.index]),
      quantity: market.parseNumber(row[quantity.column.index]),
      dimensions: [
        roles.reportingCountry ? String(row[roles.reportingCountry.index] ?? '').trim() : '',
        roles.country ? String(row[roles.country.index] ?? '').trim() : '',
        location.column ? String(row[location.column.index] ?? '').trim() : ''
      ].filter(Boolean),
      stock: stock.column ? market.parseNumber(row[stock.column.index]) : null,
      reorder: reorder.column ? market.parseNumber(row[reorder.column.index]) : null
    }));
    const groups = new Map();
    let invalidQuantities = 0;
    let unknownMovements = 0;
    let missingProducts = 0;
    let validMovementRecords = 0;
    for (const record of records) {
      if (!record.product) {
        missingProducts += 1;
        continue;
      }
      const dimensionLabel = record.dimensions.join(' · ');
      const groupKey = `${record.product}\u0000${dimensionLabel}`;
      const group = groups.get(groupKey) ?? {
        product: dimensionLabel ? `${record.product} · ${dimensionLabel}` : record.product,
        incoming: 0,
        outgoing: 0,
        incomingRecords: 0,
        outgoingRecords: 0,
        stocks: [],
        stockRows: 0,
        missingStock: false,
        reorderPoints: [],
        reorderRows: 0,
        missingReorder: false
      };
      if (!record.movement) unknownMovements += 1;
      else if (record.quantity === null || record.quantity < 0) invalidQuantities += 1;
      else if (record.movement === 'incoming') {
        validMovementRecords += 1;
        group.incoming += record.quantity;
        group.incomingRecords += 1;
      } else {
        validMovementRecords += 1;
        group.outgoing += record.quantity;
        group.outgoingRecords += 1;
      }
      if (stock.column) {
        group.stockRows += 1;
        if (record.stock !== null && record.stock >= 0) group.stocks.push(record.stock);
        else group.missingStock = true;
      }
      if (reorder.column) {
        group.reorderRows += 1;
        if (record.reorder !== null && record.reorder >= 0) group.reorderPoints.push(record.reorder);
        else group.missingReorder = true;
      }
      groups.set(groupKey, group);
    }

    if (validMovementRecords === 0) {
      const needs = ['al menos un movimiento con tipo y cantidad válidos'];
      return {
        available: false,
        needs,
        message: 'No hay movimientos clasificables en los registros no agregados; no se presentan sumas.',
        products: [],
        totals: null,
        alertsEnabled: false,
        duplicateRows: duplicateCount(headers, sourceRows.map(({ row }) => row)),
        worldExcluded: worldRows.length
      };
    }

    const duplicateRows = duplicateCount(headers, sourceRows.map(({ row }) => row));
    const dimensionRoleAmbiguous = roles.ambiguities.some((ambiguity) => ['reportingCountry', 'country'].includes(ambiguity.role));
    const dimensionColumns = [
      roles.reportingCountry,
      roles.country,
      location.column
    ].filter(Boolean);
    const incompleteDimensions = dimensionColumns.some((column) => sourceRows.some(({ row }) => !String(row[column.index] ?? '').trim()));
    const periodValues = roles.period
      ? [...new Set(sourceRows.map(({ row }) => market.normalizePeriod(row[roles.period.index])).filter(Boolean))]
      : [];
    const stockPeriodComparable = !roles.period || (periodValues.length === 1 && sourceRows.every(({ row }) => market.normalizePeriod(row[roles.period.index]) !== null));
    const sameAlertUnit = Boolean(
      stock.column && reorder.column &&
      unitToken(stock.column.header) &&
      unitToken(stock.column.header) === unitToken(reorder.column.header)
    );
    const alertsEnabled = sameAlertUnit && duplicateRows === 0 && stockPeriodComparable &&
      !location.ambiguous.length && !incompleteDimensions && !dimensionRoleAmbiguous;
    const products = [...groups.values()].map((group) => {
      const stockValues = [...new Set(group.stocks)];
      const reorderValues = [...new Set(group.reorderPoints)];
      const stockValue = stockValues.length === 1 && !group.missingStock ? stockValues[0] : null;
      const reorderValue = reorderValues.length === 1 && !group.missingReorder ? reorderValues[0] : null;
      const lowStock = alertsEnabled && stockValue !== null && reorderValue !== null && stockValue <= reorderValue;
      return {
        ...group,
        stock: stockValue,
        reorder: reorderValue,
        inconsistentStock: stockValues.length > 1 || group.missingStock,
        inconsistentReorder: reorderValues.length > 1 || group.missingReorder,
        lowStock
      };
    }).sort((a, b) => a.product.localeCompare(b.product, 'es'));
    const totals = products.reduce((sum, product) => ({
      incoming: sum.incoming + product.incoming,
      outgoing: sum.outgoing + product.outgoing,
      incomingRecords: sum.incomingRecords + product.incomingRecords,
      outgoingRecords: sum.outgoingRecords + product.outgoingRecords
    }), { incoming: 0, outgoing: 0, incomingRecords: 0, outgoingRecords: 0 });
    const notes = [];
    if (!stock.column) notes.push('No se detectó existencia/stock actual; no se generan alertas de nivel de stock.');
    else if (!reorder.column) notes.push('No se detectó punto de reposición o stock mínimo; se muestra la existencia consistente, sin clasificar alertas.');
    else if (!sameAlertUnit) notes.push('La unidad de stock y la del punto de reposición no están confirmadas como iguales; se bloquean alertas.');
    if (!stockPeriodComparable) notes.push('Los datos incluyen varios periodos o fechas sin normalizar; no se infiere cuál existencia es la actual.');
    if (location.ambiguous.length) notes.push('Hay más de una columna de ubicación; se bloquean alertas para evitar mezclar almacenes o sucursales.');
    if (incompleteDimensions) notes.push('Hay productos sin país o ubicación en las columnas disponibles; se bloquean alertas para evitar mezclar alcances.');
    if (dimensionRoleAmbiguous) notes.push('Hay columnas de país ambiguas; se bloquean alertas para evitar mezclar alcances.');
    if (worldRows.length) notes.push(`${worldRows.length} fila(s) agregada(s) «Mundo» excluidas del análisis.`);
    if (duplicateRows) notes.push(`${duplicateRows} fila(s) implicadas en duplicados exactos; se conservan y se bloquean alertas para evitar falsos avisos.`);
    if (products.some((product) => product.inconsistentStock || product.inconsistentReorder)) notes.push('Hay valores de existencia o reposición inconsistentes para un producto; esos valores no se usan para alertas.');
    if (invalidQuantities) notes.push(`${invalidQuantities} movimiento(s) tienen cantidad faltante, no numérica o negativa y se excluyen de las sumas.`);
    if (unknownMovements) notes.push(`${unknownMovements} fila(s) tienen un tipo de movimiento no reconocido y no se clasifican como entrada/salida.`);

    return {
      available: true,
      needs: [],
      message: `${products.length} producto(s) agrupados desde ${records.length} registro(s) no vacío(s).`,
      products,
      totals,
      alertsEnabled,
      alertCount: products.filter((product) => product.lowStock).length,
      invalidQuantities,
      unknownMovements,
      missingProducts,
      duplicateRows,
      worldExcluded: worldRows.length,
      quantityUnit: quantity.column.header,
      stockUnit: stock.column ? unitToken(stock.column.header) : null,
      notes
    };
  }

  function analyzeForecast(headers, rows) {
    const marketResult = market.analyzeMarket(headers, rows);
    const reasons = [];
    const reportingCountries = market.getFilterOptions(headers, rows).reportingCountry;
    if (!marketResult.schema.reportingCountry) reasons.push('una columna explícita de país reportante');
    else if (reportingCountries.length !== 1 || sourceHasMissing(headers, rows, marketResult.schema.reportingCountry.index)) reasons.push('un solo país reportante completo por archivo');
    if (!marketResult.schema.period) reasons.push('periodos anuales reconocibles');
    if (!marketResult.units.comparable) reasons.push('moneda confirmada y uniforme');
    if (marketResult.counts.duplicates) reasons.push('corregir o revisar los registros duplicados exactos');
    if (marketResult.diagnostics.invalidPeriods || marketResult.counts.periodExcluded) reasons.push('periodo válido en todos los registros incluidos');
    if (marketResult.counts.valueExcluded) reasons.push('flujo y valor interpretables en todas las filas del alcance');

    const years = marketResult.timeSeries.map((point) => point.period);
    if (years.length < 3) reasons.push('al menos tres años consecutivos completos');
    if (years.some((year) => !/^\d{4}$/.test(year))) reasons.push('solo periodos anuales (no meses, trimestres ni fechas mixtas)');
    if (years.length > 1 && years.some((year, index) => index > 0 && Number(year) !== Number(years[index - 1]) + 1)) {
      reasons.push('años consecutivos, sin huecos');
    }

    const historyReady = years.length >= 3 &&
      years.every((year) => /^\d{4}$/.test(year)) &&
      years.every((year, index) => index === 0 || Number(year) === Number(years[index - 1]) + 1);
    const forecasts = [];
    if (historyReady) {
      for (const flow of [
        { key: 'imports', label: 'Importaciones' },
        { key: 'exports', label: 'Exportaciones' }
      ]) {
        const complete = marketResult.timeSeries.every((point) => Number.isFinite(point[flow.key]));
        if (!complete) continue;
        const last = marketResult.timeSeries[marketResult.timeSeries.length - 1];
        forecasts.push({
          flow: flow.label,
          year: String(Number(last.period) + 1),
          value: last[flow.key],
          sourceYear: last.period,
          sourceValue: last[flow.key]
        });
      }
    }

    if (reasons.length || forecasts.length === 0) {
      if (forecasts.length === 0 && !reasons.includes('al menos tres años consecutivos completos')) reasons.push('al menos un flujo observado en cada uno de esos años');
      return {
        available: false,
        reasons: [...new Set(reasons)],
        history: marketResult.timeSeries,
        forecasts: [],
        unit: marketResult.units.label
      };
    }
    return {
      available: true,
      reasons: [],
      history: marketResult.timeSeries,
      forecasts,
      unit: marketResult.units.label,
      country: reportingCountries[0],
      method: 'Naïve (persistencia): pronóstico del siguiente año igual al último valor anual observado.',
      horizon: '1 año',
      limitations: 'Es una línea base, no modela tendencia, estacionalidad, causalidad ni cambios futuros. No sustituye un modelo validado ni el juicio comercial.'
    };
  }

  function currencyForColumn(headers, rows, columnIndex, currencyColumn, headerCode) {
    const relevantRows = rows.filter((row) => {
      const value = market.parseNumber(row[columnIndex]);
      return value !== null && value >= 0;
    });
    const scale = market.scaleFromText(headers[columnIndex]);
    if (headerCode) {
      if (currencyColumn && relevantRows.some((row) => market.currencyFromText(row[currencyColumn.index]) !== headerCode)) return null;
      return { code: headerCode, scale };
    }
    if (!currencyColumn || relevantRows.length === 0) return null;
    const currencyValues = relevantRows.map((row) => market.currencyFromText(row[currencyColumn.index]));
    const distinct = [...new Set(currencyValues)];
    return distinct.length === 1 && distinct[0] ? { code: distinct[0], scale } : null;
  }

  function analyzeProfitability(headers, rows) {
    const revenue = findColumn(headers, profitabilityAliases.revenue, ['cost', 'costo', 'cantidad', 'quantity', 'qty', 'volumen', 'unidades', 'units', 'pares', 'pairs']);
    const cost = findColumn(headers, profitabilityAliases.cost);
    const marketSchema = market.resolveSchema(headers);
    const currencyColumn = marketSchema.currency;
    const reasons = [];
    if (!revenue.column) reasons.push(revenue.ambiguous.length ? 'un único encabezado de ingresos por ventas' : 'ingresos/ventas explícitos');
    if (!cost.column) reasons.push(cost.ambiguous.length ? 'un único encabezado de costo de ventas' : 'costo de ventas explícito');
    if (reasons.length) {
      return { available: false, reasons, totals: null, unit: null, validRecords: 0, excludedRecords: 0 };
    }

    const allRows = nonEmptyRows(headers, rows);
    const countries = market.getFilterOptions(headers, rows).reportingCountry;
    if (marketSchema.ambiguities.some((ambiguity) => ambiguity.role === 'reportingCountry')) {
      return {
        available: false,
        reasons: ['un único encabezado de país reportante'],
        totals: null,
        unit: null,
        validRecords: 0,
        excludedRecords: allRows.length
      };
    }
    if (marketSchema.reportingCountry && (countries.length !== 1 || sourceHasMissing(headers, rows, marketSchema.reportingCountry.index))) {
      return {
        available: false,
        reasons: ['un único país reportante para evitar consolidar entidades distintas'],
        totals: null,
        unit: null,
        validRecords: 0,
        excludedRecords: allRows.length
      };
    }
    const countryColumnIndexes = countryIndexes(headers, marketSchema);
    const worldRows = allRows.filter(({ row }) => hasWorldCountryValue(row, countryColumnIndexes));
    const sourceRows = allRows.filter(({ row }) => !hasWorldCountryValue(row, countryColumnIndexes));
    const duplicateRows = duplicateCount(headers, sourceRows.map(({ row }) => row));
    if (marketSchema.ambiguities.some((ambiguity) => ambiguity.role === 'currency')) {
      return { available: false, reasons: ['una única columna de moneda'], totals: null, unit: null, validRecords: 0, excludedRecords: sourceRows.length };
    }
    const revenueCode = market.currencyFromText(revenue.column.header);
    const costCode = market.currencyFromText(cost.column.header);
    const revenueUnit = currencyForColumn(headers, sourceRows.map(({ row }) => row), revenue.column.index, currencyColumn, revenueCode);
    const costUnit = currencyForColumn(headers, sourceRows.map(({ row }) => row), cost.column.index, currencyColumn, costCode);
    if (!revenueUnit || !costUnit || revenueUnit.code !== costUnit.code || revenueUnit.scale !== costUnit.scale) {
      return {
        available: false,
        reasons: ['moneda confirmada y coincidente en ingresos y costos', 'escala coincidente (por ejemplo, unidades o miles)'],
        totals: null,
        unit: null,
        validRecords: 0,
        excludedRecords: sourceRows.length,
        duplicateRows
      };
    }
    if (duplicateRows) {
      return {
        available: false,
        reasons: ['revisar los registros duplicados exactos antes de sumar ingresos y costos'],
        totals: null,
        unit: revenueUnit.scale ? `${revenueUnit.code} (${revenueUnit.scale})` : revenueUnit.code,
        validRecords: 0,
        excludedRecords: sourceRows.length,
        duplicateRows
      };
    }

    let revenueTotal = 0;
    let costTotal = 0;
    let validRecords = 0;
    for (const { row } of sourceRows) {
      const rowRevenue = market.parseNumber(row[revenue.column.index]);
      const rowCost = market.parseNumber(row[cost.column.index]);
      if (rowRevenue === null || rowCost === null || rowRevenue < 0 || rowCost < 0) continue;
      revenueTotal += rowRevenue;
      costTotal += rowCost;
      validRecords += 1;
    }
    if (validRecords === 0) {
      return {
        available: false,
        reasons: ['al menos un registro con ingresos y costos no negativos interpretables'],
        totals: null,
        unit: revenueUnit.scale ? `${revenueUnit.code} (${revenueUnit.scale})` : revenueUnit.code,
        validRecords,
        excludedRecords: sourceRows.length
      };
    }
    const margin = revenueTotal - costTotal;
    return {
      available: true,
      reasons: [],
      revenue: revenueTotal,
      cost: costTotal,
      grossMargin: margin,
      marginRate: revenueTotal > 0 ? (margin / revenueTotal) * 100 : null,
      validRecords,
      excludedRecords: sourceRows.length - validRecords,
      worldExcluded: worldRows.length,
      unit: revenueUnit.scale ? `${revenueUnit.code} (${revenueUnit.scale})` : revenueUnit.code,
      formula: 'Margen bruto = ingresos por ventas − costo de ventas; margen % = margen bruto / ingresos × 100 (solo si ingresos > 0).',
      note: 'No se calcula rentabilidad neta, costos indirectos, impuestos ni retorno. El valor comercial por par no equivale a margen.'
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function renderEmptyState(title, description, needs = []) {
    return `<div class="module-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p>${needs.length ? `<ul>${needs.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value) : 'No disponible';
  }

  function renderInventory(dataset) {
    const result = analyzeInventory(dataset.headers, dataset.rows);
    if (!result.available) return renderEmptyState('Análisis de inventario no disponible', result.message, result.needs);
    const metrics = `<div class="module-metrics"><article><span>Entradas</span><strong>${formatNumber(result.totals.incoming)} ${escapeHtml(result.quantityUnit)}</strong><small>${result.totals.incomingRecords} movimientos</small></article><article><span>Salidas</span><strong>${formatNumber(result.totals.outgoing)} ${escapeHtml(result.quantityUnit)}</strong><small>${result.totals.outgoingRecords} movimientos</small></article><article><span>Productos</span><strong>${result.products.length}</strong><small>${result.message}</small></article><article><span>Alertas de stock</span><strong>${result.alertsEnabled ? result.alertCount : 'No calculadas'}</strong><small>${result.alertsEnabled ? 'Stock actual ≤ punto de reposición' : 'Requiere existencia y umbral con unidad compatible'}</small></article></div>`;
    const table = `<div class="module-table-wrap"><table><thead><tr><th>Producto</th><th>Entradas</th><th>Salidas</th><th>Existencia actual</th><th>Punto de reposición</th><th>Estado</th></tr></thead><tbody>${result.products.map((product) => {
      const status = product.inconsistentStock || product.inconsistentReorder
        ? 'Datos faltantes/inconsistentes'
        : product.lowStock
          ? 'Alerta: reponer'
          : product.stock !== null && result.alertsEnabled
            ? 'Sin alerta'
            : 'Sin datos de alerta';
      return `<tr><td>${escapeHtml(product.product)}</td><td>${formatNumber(product.incoming)}</td><td>${formatNumber(product.outgoing)}</td><td>${formatNumber(product.stock)}</td><td>${formatNumber(product.reorder)}</td><td>${status}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    const notes = result.notes.length ? `<ul class="module-notes">${result.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '';
    return `${metrics}${table}${notes}<p class="module-method">Solo se agrupan movimientos clasificados explícitamente. Los valores se agregan tal como aparecen; valida el nivel de detalle y los duplicados de la fuente antes de actuar.</p>`;
  }

  function renderForecast(dataset) {
    const result = analyzeForecast(dataset.headers, dataset.rows);
    if (!result.available) return renderEmptyState('Pronóstico no disponible para estos datos', 'No se generó una estimación: se requieren historial y calidad suficientes. Los criterios se muestran a continuación.', result.reasons);
    const rows = result.history.map((point) => `<tr><td>${escapeHtml(point.period)}</td><td>${formatNumber(point.imports)}</td><td>${formatNumber(point.exports)}</td><td>Observado</td></tr>`);
    for (const forecast of result.forecasts) rows.push(`<tr><td>${escapeHtml(forecast.year)}</td><td>${forecast.flow === 'Importaciones' ? formatNumber(forecast.value) : '—'}</td><td>${forecast.flow === 'Exportaciones' ? formatNumber(forecast.value) : '—'}</td><td>Pronóstico naïve (${escapeHtml(forecast.flow)})</td></tr>`);
    return `<div class="module-metrics"><article><span>País reportante</span><strong>${escapeHtml(result.country)}</strong><small>Único país reportante reconocido</small></article><article><span>Método</span><strong>Naïve</strong><small>Persistencia del último año</small></article><article><span>Horizonte</span><strong>${escapeHtml(result.horizon)}</strong><small>Una observación futura</small></article><article><span>Historial usado</span><strong>${result.history.length} años</strong><small>Continuos y completos</small></article></div><div class="module-table-wrap"><table><thead><tr><th>Año</th><th>Importaciones (${escapeHtml(result.unit)})</th><th>Exportaciones (${escapeHtml(result.unit)})</th><th>Tipo</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="module-method">${escapeHtml(result.method)} ${escapeHtml(result.limitations)}</p>`;
  }

  function renderProfitability(dataset) {
    const result = analyzeProfitability(dataset.headers, dataset.rows);
    if (!result.available) {
      const duplicateNote = result.duplicateRows ? ` Se detectaron ${result.duplicateRows} fila(s) implicadas en duplicados exactos.` : '';
      return renderEmptyState('Análisis de rentabilidad no disponible', `${result.reasons.join('; ')}.${duplicateNote} No se sustituuyen datos ausentes por ceros.`, result.reasons);
    }
    return `<div class="module-metrics"><article><span>Ingresos por ventas</span><strong>${formatNumber(result.revenue)} ${escapeHtml(result.unit)}</strong><small>${result.validRecords} registros completos</small></article><article><span>Costo de ventas</span><strong>${formatNumber(result.cost)} ${escapeHtml(result.unit)}</strong><small>Moneda y escala compatibles</small></article><article><span>Margen bruto</span><strong>${formatNumber(result.grossMargin)} ${escapeHtml(result.unit)}</strong><small>Ingresos − costo de ventas</small></article><article><span>Margen bruto porcentual</span><strong>${result.marginRate === null ? 'No calculado' : `${formatNumber(result.marginRate)} %`}</strong><small>${result.marginRate === null ? 'Ingresos totales iguales a cero' : 'Margen bruto / ingresos × 100'}</small></article></div><p class="module-method">${escapeHtml(result.formula)} ${escapeHtml(result.note)} ${result.excludedRecords ? `${result.excludedRecords} registro(s) incompletos o incompatibles excluidos.` : ''}</p>`;
  }

  function render(view, dataset) {
    const target = root.document.getElementById(`${view}-results`);
    if (!target) return;
    if (!dataset || !dataset.headers?.length) {
      target.innerHTML = renderEmptyState('Aún no hay datos cargados', 'Carga un archivo en Preparación de datos para evaluar si contiene las columnas necesarias. No se muestran ejemplos.');
      return;
    }
    if (view === 'inventarios') target.innerHTML = renderInventory(dataset);
    else if (view === 'pronosticos') target.innerHTML = renderForecast(dataset);
    else if (view === 'rentabilidad') target.innerHTML = renderProfitability(dataset);
  }

  const api = { analyzeForecast, analyzeInventory, analyzeProfitability, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BusinessModules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
