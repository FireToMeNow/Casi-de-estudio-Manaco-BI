'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.MarketAnalysis = require('../assets/js/market-analysis.js');
const { datasetSummary } = require('../assets/js/case-workflow.js');

test('caso: calcula valor y pares por flujo/categoría sin sumar filas Mundo', () => {
  const summary = datasetSummary({
    fileName: 'comercio.xlsx',
    sheetName: 'Datos',
    headers: ['País reportante', 'Socio comercial', 'Flujo comercial', 'Categoría de calzado', 'Cantidad de pares', 'Valor USD', 'Año'],
    rows: [
      ['España', 'Vietnam', 'Importaciones', 'Cuero', 10, 100, 2024],
      ['España', 'Chile', 'Exportaciones', 'Cuero', 5, 80, 2024],
      ['España', 'Mundo', 'Importaciones', 'Cuero', 100, 900, 2024]
    ]
  });

  assert.deepEqual(summary.reporters, ['España']);
  assert.equal(summary.worldCount, 1);
  assert.equal(summary.imports, 100);
  assert.equal(summary.exports, 80);
  assert.equal(summary.valuePerPair, 12);
  assert.equal(summary.grouped.length, 2);
  assert.deepEqual(summary.grouped.map(({ flow, value, pairs }) => [flow, value, pairs]), [
    ['Importaciones', 100, 10],
    ['Exportaciones', 80, 5]
  ]);
  assert.deepEqual(summary.grouped.map(({ pairValueTotal, pairValuePairs }) => [pairValueTotal, pairValuePairs]), [
    [100, 10],
    [80, 5]
  ]);
});

test('caso: bloquea sumas de valor si la moneda está mezclada y no inventa campos ausentes', () => {
  const summary = datasetSummary({
    fileName: 'mixto.csv',
    sheetName: 'Datos',
    headers: ['País reportante', 'Socio', 'Flujo', 'Producto', 'Cantidad de pares', 'Valor', 'Moneda', 'Año'],
    rows: [
      ['Bolivia', 'Chile', 'Importaciones', 'Bota', 4, 100, 'USD', 2024],
      ['Bolivia', 'Perú', 'Exportaciones', 'Bota', 2, 80, 'EUR', 2024]
    ]
  });

  assert.equal(summary.currencyComparable, false);
  assert.equal(summary.imports, null);
  assert.equal(summary.exports, null);
  assert.ok(summary.grouped.every((group) => group.valueRecords === 0));
  assert.equal(summary.grouped.reduce((sum, group) => sum + group.pairs, 0), 6);
  assert.equal(summary.valuePerPair, null);
});

test('caso: no crea resultados cuando no existe una fuente cargada', () => {
  assert.equal(datasetSummary(null), null);
});

test('caso: bloquea comparaciones por flujo cuando hay más de un reportante', () => {
  const summary = datasetSummary({
    fileName: 'multi.xlsx',
    sheetName: 'Datos',
    headers: ['País reportante', 'Socio', 'Flujo', 'Producto', 'Cantidad de pares', 'Valor USD', 'Año'],
    rows: [
      ['Bolivia', 'Chile', 'Importaciones', 'Bota', 4, 100, 2024],
      ['Perú', 'Ecuador', 'Exportaciones', 'Bota', 2, 80, 2024]
    ]
  });

  assert.equal(summary.reportingScopeSafe, false);
  assert.equal(summary.imports, null);
  assert.equal(summary.exports, null);
  assert.ok(summary.grouped.every((group) => group.valueRecords === 0 && group.pairRecords === 0));
});

test('caso: permite valor por par tras filtrar un periodo de una fuente multianual', () => {
  const dataset = {
    fileName: 'anual.xlsx',
    sheetName: 'Datos',
    headers: ['País reportante', 'Socio', 'Flujo', 'Producto', 'Cantidad de pares', 'Valor USD', 'Año'],
    rows: [
      ['España', 'Chile', 'Importaciones', 'Bota', 10, 100, 2023],
      ['España', 'Perú', 'Importaciones', 'Bota', 20, 600, 2024]
    ]
  };
  assert.equal(datasetSummary(dataset).valuePerPair, null);
  const selectedYear = datasetSummary(dataset, { period: '2024' });
  assert.equal(selectedYear.valuePerPair, 30);
  assert.equal(selectedYear.filters.period, '2024');
});
