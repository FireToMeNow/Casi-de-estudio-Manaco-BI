'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeMarket, generateFindings, getFilterOptions, isWorld, normalizePeriod, resolveSchema } = require('../assets/js/market-analysis.js');

const syntheticHeaders = ['País socio', 'Flujo comercial', 'Producto', 'Cantidad de pares', 'Valor USD', 'Periodo'];

function syntheticRows() {
  return [
    ['País A', 'Importaciones', 'Producto sintético A', 2, 100, '2023'],
    ['País B', 'Exportaciones', 'Producto sintético A', 4, 240, '2024'],
    ['Mundo', 'Importaciones', 'Producto sintético A', 10, 900, '2024'],
    ['País A', 'Importaciones', 'Producto sintético B', 1, null, '2024'],
    ['País A', 'Importaciones', 'Producto sintético B', 0, 0, '2024']
  ];
}

test('datos sintéticos: detecta roles solo en encabezados presentes y lista columnas originales', () => {
  const schema = resolveSchema(syntheticHeaders);
  assert.equal(schema.country.header, 'País socio');
  assert.equal(schema.flow.header, 'Flujo comercial');
  assert.equal(schema.product.header, 'Producto');
  assert.equal(schema.quantity.header, 'Cantidad de pares');
  assert.equal(schema.value.header, 'Valor USD');
  assert.equal(schema.period.header, 'Periodo');
  assert.equal(resolveSchema(['Columna sin clasificar']).country, undefined);
});

test('datos sintéticos: separa país reportante y socio comercial en filtros y resultados', () => {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Periodo'];
  const rows = [
    ['Bolivia', 'Argentina', 'Importaciones', 100, '2024'],
    ['Bolivia', 'Chile', 'Exportaciones', 150, '2024'],
    ['España', 'Bolivia', 'Importaciones', 900, '2024']
  ];
  const schema = resolveSchema(headers);
  assert.equal(schema.reportingCountry.header, 'País reportante');
  assert.equal(schema.country.header, 'País socio');
  const options = getFilterOptions(headers, rows);
  assert.deepEqual(options.reportingCountry, ['Bolivia', 'España']);
  assert.deepEqual(options.country, ['Argentina', 'Bolivia', 'Chile']);

  const unfiltered = analyzeMarket(headers, rows);
  assert.equal(unfiltered.totals.import, null);
  assert.equal(unfiltered.totals.export, null);
  assert.equal(unfiltered.counts.included, 0);
  assert.equal(unfiltered.diagnostics.reportingScopeAllowed, false);

  const result = analyzeMarket(headers, rows, { reportingCountry: 'Bolivia', country: 'Chile' });
  assert.equal(result.counts.afterFilters, 1);
  assert.equal(result.totals.import, null);
  assert.equal(result.totals.export, 150);
  assert.equal(result.totals.balance, null);
  assert.equal(result.diagnostics.reportingScopeAllowed, true);
  assert.deepEqual(result.periods.analyzed, ['2024']);
});

test('datos sintéticos: hallazgos informan valores calculados y respetan filtros', () => {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Periodo'];
  const rows = [
    ['Bolivia', 'Argentina', 'Importaciones', 100, '2024'],
    ['Bolivia', 'Chile', 'Exportaciones', 150, '2024'],
    ['España', 'Bolivia', 'Importaciones', 900, '2024']
  ];
  const result = analyzeMarket(headers, rows, { reportingCountry: 'Bolivia' });
  const findings = generateFindings(result);
  assert.equal(result.totals.balance, 50);
  assert.match(findings[0].observation, /exportaciones.*superan las importaciones/i);
  assert.match(findings[0].evidence, /150 − importaciones 100 = saldo 50 USD/);
  assert.ok(findings.some((finding) => finding.observation.includes('Chile')));
  assert.ok(findings.every((finding) => !finding.evidence.includes('900')));
});

test('datos sintéticos: sin registros no genera cifras ni hallazgos ficticios', () => {
  const result = analyzeMarket(syntheticHeaders, []);
  const findings = generateFindings(result);
  assert.equal(result.counts.source, 0);
  assert.deepEqual(result.periods.analyzed, []);
  assert.equal(findings.length, 1);
  assert.match(findings[0].observation, /No hay resultados comparables/);
});

test('datos sintéticos: conserva el cero y separa valores ausentes de valores válidos', () => {
  const result = analyzeMarket(syntheticHeaders, syntheticRows());
  assert.equal(result.totals.import, 100);
  assert.equal(result.totals.export, 240);
  assert.equal(result.totals.balance, null);
  assert.equal(result.periods.comparable, false);
  assert.equal(result.diagnostics.partnersComparable, false);
  assert.equal(result.totals.zeroValues, 1);
  assert.equal(result.totals.missingValues, 1);
  assert.equal(result.counts.included, 3);
  assert.equal(result.counts.excluded, 1);
  assert.equal(result.counts.pairIncluded, 0);
  assert.equal(result.counts.pairExcluded, 4);
  assert.equal(result.valuePerPair, null);
  assert.equal(result.diagnostics.pairPeriodComparable, false);
  const onePeriod = analyzeMarket(syntheticHeaders, syntheticRows(), { period: '2023' });
  assert.equal(onePeriod.valuePerPair, 50);
  assert.equal(onePeriod.counts.pairIncluded, 1);
});

test('datos sintéticos: calcula saldo cuando importaciones y exportaciones cubren los mismos periodos', () => {
  const headers = ['País', 'Flujo', 'Valor USD', 'Periodo'];
  const rows = [['País A', 'Importaciones', 10, '2023'], ['País A', 'Exportaciones', 30, '2023'], ['País B', 'Importaciones', 5, '2024'], ['País B', 'Exportaciones', 6, '2024']];
  const result = analyzeMarket(headers, rows);
  assert.equal(result.periods.comparable, true);
  assert.equal(result.totals.balance, 21);
  assert.equal(result.diagnostics.canCompareFlows, true);
  assert.equal(result.diagnostics.partnersComparable, false);
});

test('datos sintéticos: mantiene Mundo fuera del desglose y permite inspección separada', () => {
  const rows = syntheticRows();
  const detailed = analyzeMarket(syntheticHeaders, rows);
  assert.equal(detailed.counts.worldCandidates, 1);
  assert.equal(detailed.counts.worldExcluded, 1);
  assert.equal(detailed.counts.inScope, 4);
  const worldOnly = analyzeMarket(syntheticHeaders, rows, { worldMode: 'world' });
  assert.equal(worldOnly.counts.inScope, 1);
  assert.equal(worldOnly.totals.import, 900);
  assert.equal(worldOnly.totals.export, null);
  assert.equal(isWorld('Mundo total'), true);
});

test('datos sintéticos: rechaza fechas y meses inválidos al normalizar periodos', () => {
  assert.equal(normalizePeriod('2024-02'), '2024-02');
  assert.equal(normalizePeriod('2024-13'), null);
  assert.equal(normalizePeriod('2024-02-29'), '2024-02-29');
  assert.equal(normalizePeriod('2023-02-29'), null);
});

test('datos sintéticos: no representa como cero un flujo sin observaciones', () => {
  const result = analyzeMarket(['País', 'Flujo', 'Valor USD', 'Periodo'], [['País A', 'Importaciones', 0, '2024']]);
  assert.equal(result.totals.import, 0);
  assert.equal(result.totals.export, null);
  assert.equal(result.totals.balance, null);
  assert.equal(result.timeSeries[0].imports, 0);
  assert.equal(result.timeSeries[0].exports, null);
});

test('datos sintéticos: cuenta duplicados exactos sin eliminarlos ni ocultar el doble conteo', () => {
  const headers = ['País', 'Flujo', 'Valor USD'];
  const rows = [['País A', 'Importaciones', 10], ['País A', 'Importaciones', 10]];
  const result = analyzeMarket(headers, rows);
  assert.equal(result.counts.duplicates, 1);
  assert.equal(result.totals.import, 20);
  assert.equal(result.counts.included, 2);
});

test('datos sintéticos: filtra periodos, países, flujos y productos existentes', () => {
  const filters = getFilterOptions(syntheticHeaders, syntheticRows());
  assert.deepEqual(filters.period, ['2023', '2024']);
  assert.deepEqual(filters.country, ['Mundo', 'País A', 'País B']);
  assert.deepEqual(filters.product, ['Producto sintético A', 'Producto sintético B']);
  const result = analyzeMarket(syntheticHeaders, syntheticRows(), { period: '2024', country: 'País B', flow: 'Exportaciones', product: 'Producto sintético A' });
  assert.equal(result.counts.afterFilters, 1);
  assert.equal(result.totals.export, 240);
  assert.equal(result.timeSeries[0].period, '2024');
  assert.equal(result.diagnostics.partnersComparable, true);
  assert.equal(result.partners[0].country, 'País B');
});

test('datos sintéticos: normaliza y ordena múltiples periodos; excluye periodos inválidos', () => {
  const rows = [['País A', 'Importaciones', 'Producto X', 2, 10, '2023'], ['País A', 'Importaciones', 'Producto X', 2, 20, '2024'], ['País A', 'Importaciones', 'Producto X', 2, 30, 'sin periodo']];
  const result = analyzeMarket(syntheticHeaders, rows);
  assert.deepEqual(result.timeSeries.map((entry) => entry.period), ['2023', '2024']);
  assert.equal(result.diagnostics.invalidPeriods, 1);
});

test('datos sintéticos: no compara monedas distintas o incompletas', () => {
  const headers = ['País', 'Flujo', 'Valor', 'Moneda'];
  const mixed = analyzeMarket(headers, [['País A', 'Importaciones', 5, 'USD'], ['País B', 'Exportaciones', 8, 'EUR']]);
  assert.equal(mixed.units.status, 'mixed');
  assert.equal(mixed.totals.import, null);
  assert.equal(mixed.totals.export, null);
  assert.equal(mixed.totals.balance, null);
  const headerMismatch = analyzeMarket(['País', 'Flujo', 'Valor USD', 'Moneda'], [['País A', 'Importaciones', 10, 'EUR'], ['País B', 'Exportaciones', 20, 'USD']]);
  assert.equal(headerMismatch.units.status, 'mixed');
  assert.equal(headerMismatch.totals.import, null);
  assert.equal(headerMismatch.totals.balance, null);
  const ambiguousSymbol = analyzeMarket(['País', 'Flujo', 'Valor', 'Moneda'], [['País A', 'Importaciones', 10, '$'], ['País B', 'Exportaciones', 20, '$']]);
  assert.equal(ambiguousSymbol.units.status, 'unknown');
  assert.equal(ambiguousSymbol.totals.import, 10);
  assert.equal(ambiguousSymbol.totals.balance, null);
  const incomplete = analyzeMarket(headers, [['País A', 'Importaciones', 5, 'USD'], ['País B', 'Exportaciones', 8, '']]);
  assert.equal(incomplete.units.status, 'incomplete');
  assert.equal(incomplete.totals.balance, null);
});

test('datos sintéticos: totales separados son posibles con moneda desconocida, pero no saldo ni razón por par', () => {
  const result = analyzeMarket(['País', 'Flujo', 'Valor', 'Pares'], [['País A', 'Importaciones', 5, 1], ['País B', 'Exportaciones', 8, 2]]);
  assert.equal(result.totals.import, 5);
  assert.equal(result.totals.export, 8);
  assert.equal(result.totals.balance, null);
  assert.equal(result.valuePerPair, null);
  assert.equal(result.units.status, 'unknown');
});

test('datos sintéticos: no infiere valor por par de una cantidad sin unidad explícita', () => {
  const result = analyzeMarket(['País', 'Flujo', 'Valor USD', 'Cantidad'], [['País A', 'Importaciones', 12, 3]]);
  assert.equal(result.schema.pairsCompatible, false);
  assert.equal(result.valuePerPair, null);
});

test('datos sintéticos: no trata cantidades expresadas en miles como pares individuales', () => {
  const result = analyzeMarket(['País', 'Flujo', 'Valor USD', 'Cantidad de pares en miles', 'Periodo'], [['País A', 'Importaciones', 12, 3, '2024']]);
  assert.equal(result.schema.pairsCompatible, false);
  assert.equal(result.valuePerPair, null);
});

test('datos sintéticos: valor por par usa valor y pares válidos de las mismas filas', () => {
  const headers = ['País', 'Flujo', 'Valor USD', 'Cantidad de pares', 'Periodo'];
  const rows = [
    ['País A', 'Importaciones', 100, 2, '2024'],
    ['País A', 'Importaciones', 900, '', '2024'],
    ['País A', 'Exportaciones', 30, 1, '2024']
  ];
  const result = analyzeMarket(headers, rows);
  assert.equal(result.valuePerPair, 130 / 3);
  assert.equal(result.counts.pairIncluded, 2);
  assert.equal(result.counts.pairExcluded, 1);
});

test('datos sintéticos: conserva la escala declarada en la unidad de valor', () => {
  const result = analyzeMarket(['País', 'Flujo', 'Valor USD en miles', 'Periodo'], [['País A', 'Importaciones', 12, '2024']]);
  assert.equal(result.units.label, 'USD (miles)');
  assert.equal(result.totals.import, 12);
});

test('datos sintéticos: rechaza roles ambiguos y textos numéricos con separadores ambiguos', () => {
  const schema = resolveSchema(['País de origen', 'País de destino', 'Flujo', 'Valor USD']);
  assert.equal(schema.country, undefined);
  assert.ok(schema.ambiguities.some((item) => item.role === 'country'));
  const result = analyzeMarket(['País', 'Flujo', 'Valor USD'], [['País A', 'Importaciones', '1.234,56']]);
  assert.equal(result.totals.import, null);
  assert.equal(result.totals.missingValues, 1);
  const commaAmbiguous = analyzeMarket(['País', 'Flujo', 'Valor USD'], [['País A', 'Importaciones', '1,234']]);
  assert.equal(commaAmbiguous.totals.import, null);
  assert.equal(commaAmbiguous.totals.missingValues, 1);
});

test('datos sintéticos: con país ambiguo excluye Mundo y bloquea agregados mixtos', () => {
  const headers = ['País de origen', 'País de destino', 'Flujo', 'Valor USD'];
  const rows = [
    ['Bolivia', 'Chile', 'Importaciones', 100],
    ['Bolivia', 'Mundo', 'Importaciones', 900]
  ];
  const detailed = analyzeMarket(headers, rows);
  assert.equal(detailed.counts.worldCandidates, 1);
  assert.equal(detailed.counts.worldExcluded, 1);
  assert.equal(detailed.diagnostics.countryRoleAmbiguous, true);
  assert.equal(detailed.diagnostics.worldScopeAllowed, false);
  assert.equal(detailed.totals.import, null);
  assert.equal(detailed.counts.included, 0);

  const worldOnly = analyzeMarket(headers, rows, { worldMode: 'world' });
  assert.equal(worldOnly.counts.inScope, 1);
  assert.equal(worldOnly.totals.import, 900);
});
