'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.DataAnalysis = require('../assets/js/data-analysis.js');
globalThis.MarketAnalysis = require('../assets/js/market-analysis.js');
const { analyzeForecast, analyzeInventory, analyzeProfitability } = require('../assets/js/business-modules.js');

test('inventarios: resume entradas y salidas y alerta solo con stock/umbral comparables', () => {
  const headers = ['Producto', 'Tipo de movimiento', 'Cantidad de pares', 'Existencia actual (pares)', 'Punto de reposición (pares)'];
  const rows = [
    ['Bota', 'Entrada', 10, 3, 5],
    ['Bota', 'Salida por venta', 2, 3, 5],
    ['Sandalia', 'Ingreso', 4, 8, 2]
  ];
  const result = analyzeInventory(headers, rows);
  assert.equal(result.available, true);
  assert.equal(result.totals.incoming, 14);
  assert.equal(result.totals.outgoing, 2);
  assert.equal(result.alertsEnabled, true);
  assert.equal(result.alertCount, 1);
  assert.equal(result.products.find((product) => product.product === 'Bota').lowStock, true);
});

test('inventarios: explica requisitos faltantes y no mezcla unidades en alertas', () => {
  const unavailable = analyzeInventory(['Producto', 'Cantidad de pares'], [['Bota', 3]]);
  assert.equal(unavailable.available, false);
  assert.ok(unavailable.needs.some((need) => need.includes('tipo de movimiento')));

  const incompatible = analyzeInventory(
    ['Producto', 'Tipo de movimiento', 'Cantidad de pares', 'Existencia actual (pares)', 'Stock mínimo (unidades)'],
    [['Bota', 'Entrada', 3, 2, 5]]
  );
  assert.equal(incompatible.available, true);
  assert.equal(incompatible.alertsEnabled, false);
  assert.equal(incompatible.alertCount, 0);
  assert.ok(incompatible.notes.some((note) => note.includes('unidad')));
});

test('inventarios: no presenta sumas cero para hojas vacías o movimientos no interpretables', () => {
  const headers = ['Producto', 'Tipo de movimiento', 'Cantidad de pares'];
  const empty = analyzeInventory(headers, []);
  assert.equal(empty.available, false);
  assert.equal(empty.totals, null);
  assert.ok(empty.needs.some((need) => need.includes('movimiento')));

  const unknown = analyzeInventory(headers, [['Bota', 'Ajuste desconocido', 4]]);
  assert.equal(unknown.available, false);
  assert.equal(unknown.totals, null);
});

test('inventarios: no alerta con valores faltantes, periodos múltiples ni filas duplicadas', () => {
  const headers = ['Producto', 'Tipo de movimiento', 'Cantidad de unidades', 'Stock actual (unidades)', 'Stock mínimo (unidades)', 'Año'];
  const missing = analyzeInventory(headers, [['Bota', 'Entrada', 3, '', 5, '2025']]);
  assert.equal(missing.alertCount, 0);
  assert.equal(missing.products[0].stock, null);
  assert.ok(missing.products[0].inconsistentStock);

  const multiplePeriods = analyzeInventory(headers, [
    ['Bota', 'Entrada', 3, 2, 5, '2024'],
    ['Bota', 'Salida', 1, 2, 5, '2025']
  ]);
  assert.equal(multiplePeriods.alertsEnabled, false);

  const duplicate = analyzeInventory(headers, [
    ['Bota', 'Entrada', 3, 2, 5, '2025'],
    ['Bota', 'Entrada', 3, 2, 5, '2025']
  ]);
  assert.equal(duplicate.alertsEnabled, false);
  assert.ok(duplicate.notes.some((note) => note.includes('duplicados')));
});

test('inventarios: excluye filas Mundo y no mezcla existencias de reportantes distintos', () => {
  const headers = ['País reportante', 'País socio', 'Producto', 'Tipo de movimiento', 'Cantidad de pares', 'Existencia actual (pares)', 'Punto de reposición (pares)'];
  const result = analyzeInventory(headers, [
    ['Bolivia', 'Chile', 'Bota', 'Entrada', 2, 1, 4],
    ['España', 'Perú', 'Bota', 'Entrada', 3, 8, 4],
    ['Bolivia', 'Mundo', 'Bota', 'Entrada', 50, 0, 4]
  ]);
  assert.equal(result.worldExcluded, 1);
  assert.equal(result.products.length, 2);
  assert.equal(result.alertCount, 1);
  assert.deepEqual(result.products.map((product) => product.product), ['Bota · Bolivia · Chile', 'Bota · España · Perú']);
});

test('inventarios: excluye Mundo cuando las columnas de país son ambiguas', () => {
  const result = analyzeInventory(
    ['País de origen', 'País de destino', 'Producto', 'Tipo de movimiento', 'Cantidad de pares'],
    [
      ['Bolivia', 'Chile', 'Bota', 'Entrada', 2],
      ['Bolivia', 'Mundo', 'Bota', 'Entrada', 50]
    ]
  );
  assert.equal(result.worldExcluded, 1);
  assert.equal(result.totals.incoming, 2);
});

test('pronósticos: habilita línea base de un año solo con tres años válidos y país único', () => {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Año'];
  const rows = [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2022'],
    ['Bolivia', 'Chile', 'Exportaciones', 8, '2022'],
    ['Bolivia', 'Perú', 'Importaciones', 12, '2023'],
    ['Bolivia', 'Perú', 'Exportaciones', 9, '2023'],
    ['Bolivia', 'Brasil', 'Importaciones', 14, '2024'],
    ['Bolivia', 'Brasil', 'Exportaciones', 11, '2024']
  ];
  const result = analyzeForecast(headers, rows);
  assert.equal(result.available, true);
  assert.equal(result.country, 'Bolivia');
  assert.equal(result.horizon, '1 año');
  assert.match(result.method, /Naïve/);
  assert.deepEqual(result.forecasts.map(({ flow, year, value }) => ({ flow, year, value })), [
    { flow: 'Importaciones', year: '2025', value: 14 },
    { flow: 'Exportaciones', year: '2025', value: 11 }
  ]);
});

test('pronósticos: bloquea datos cortos, huecos, duplicados, país mixto y monedas incompatibles', () => {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Año'];
  const short = analyzeForecast(headers, [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2023'],
    ['Bolivia', 'Chile', 'Importaciones', 12, '2024']
  ]);
  assert.equal(short.available, false);
  assert.ok(short.reasons.some((reason) => reason.includes('tres años')));

  const gap = analyzeForecast(headers, [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2021'],
    ['Bolivia', 'Chile', 'Importaciones', 12, '2023'],
    ['Bolivia', 'Chile', 'Importaciones', 14, '2024']
  ]);
  assert.equal(gap.available, false);
  assert.ok(gap.reasons.some((reason) => reason.includes('huecos')));

  const mixedReporter = analyzeForecast(headers, [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2022'],
    ['Perú', 'Chile', 'Importaciones', 11, '2023'],
    ['Bolivia', 'Chile', 'Importaciones', 12, '2024']
  ]);
  assert.equal(mixedReporter.available, false);
  assert.ok(mixedReporter.reasons.some((reason) => reason.includes('un solo país')));

  const missingReporter = analyzeForecast(headers, [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2022'],
    ['', 'Chile', 'Importaciones', 11, '2023'],
    ['Bolivia', 'Chile', 'Importaciones', 12, '2024']
  ]);
  assert.equal(missingReporter.available, false);
  assert.ok(missingReporter.reasons.some((reason) => reason.includes('completo')));

  const duplicates = analyzeForecast(headers, [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2022'],
    ['Bolivia', 'Chile', 'Importaciones', 10, '2022'],
    ['Bolivia', 'Chile', 'Importaciones', 11, '2023'],
    ['Bolivia', 'Chile', 'Importaciones', 12, '2024']
  ]);
  assert.equal(duplicates.available, false);
  assert.ok(duplicates.reasons.some((reason) => reason.includes('duplicados')));

  const currencyMismatch = analyzeForecast(
    ['País reportante', 'País socio', 'Flujo', 'Valor', 'Moneda', 'Año'],
    [
      ['Bolivia', 'Chile', 'Importaciones', 10, 'USD', '2022'],
      ['Bolivia', 'Chile', 'Importaciones', 11, 'EUR', '2023'],
      ['Bolivia', 'Chile', 'Importaciones', 12, 'USD', '2024']
    ]
  );
  assert.equal(currencyMismatch.available, false);
  assert.ok(currencyMismatch.reasons.some((reason) => reason.includes('moneda')));
});

test('rentabilidad: calcula margen bruto solo con ventas, costos y moneda/escala compatibles', () => {
  const result = analyzeProfitability(
    ['Ingresos por ventas USD', 'Costo de ventas USD'],
    [[100, 60], [50, 30]]
  );
  assert.equal(result.available, true);
  assert.equal(result.revenue, 150);
  assert.equal(result.cost, 90);
  assert.equal(result.grossMargin, 60);
  assert.equal(result.marginRate, 40);
  assert.equal(result.validRecords, 2);
  assert.match(result.formula, /ingresos por ventas − costo de ventas/);
});

test('rentabilidad: rechaza valor comercial como ingreso, divisas/escala incompatibles y duplicados', () => {
  const marketValueOnly = analyzeProfitability(['Valor USD', 'Costo de ventas USD'], [[100, 50]]);
  assert.equal(marketValueOnly.available, false);
  assert.ok(marketValueOnly.reasons.some((reason) => reason.includes('ingresos')));

  const currencyMismatch = analyzeProfitability(['Ventas USD', 'Costo de ventas EUR'], [[100, 50]]);
  assert.equal(currencyMismatch.available, false);
  assert.ok(currencyMismatch.reasons.some((reason) => reason.includes('moneda')));

  const scaleMismatch = analyzeProfitability(['Ventas USD en miles', 'Costo de ventas USD'], [[100, 50]]);
  assert.equal(scaleMismatch.available, false);

  const duplicates = analyzeProfitability(
    ['Ventas USD', 'Costo de ventas USD'],
    [[100, 50], [100, 50]]
  );
  assert.equal(duplicates.available, false);
  assert.ok(duplicates.duplicateRows > 0);

  const aggregatedEntities = analyzeProfitability(
    ['País reportante', 'Ventas USD', 'Costo de ventas USD'],
    [['Bolivia', 100, 50], ['España', 200, 100]]
  );
  assert.equal(aggregatedEntities.available, false);
  assert.ok(aggregatedEntities.reasons.some((reason) => reason.includes('único país')));
});

test('rentabilidad: mantiene ceros válidos y no calcula porcentaje si los ingresos suman cero', () => {
  const result = analyzeProfitability(['Ventas USD', 'Costo de ventas USD'], [[0, 0], [0, 5]]);
  assert.equal(result.available, true);
  assert.equal(result.revenue, 0);
  assert.equal(result.cost, 5);
  assert.equal(result.grossMargin, -5);
  assert.equal(result.marginRate, null);
});

test('rentabilidad: excluye filas Mundo si las columnas de país son ambiguas', () => {
  const result = analyzeProfitability(
    ['País de origen', 'País de destino', 'Ventas USD', 'Costo de ventas USD'],
    [
      ['Bolivia', 'Chile', 100, 40],
      ['Bolivia', 'Mundo', 1000, 500]
    ]
  );
  assert.equal(result.worldExcluded, 1);
  assert.equal(result.revenue, 100);
  assert.equal(result.cost, 40);
});
