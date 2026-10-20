'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.DataAnalysis = require('../assets/js/data-analysis.js');
globalThis.MarketAnalysis = require('../assets/js/market-analysis.js');

class Element {
  constructor(id) {
    this.id = id;
    this.value = '';
    this.innerHTML = '';
    this.hidden = false;
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  trigger(name) {
    this.listeners.get(name)?.({ target: this });
  }
}

function dashboardHarness() {
  const elements = new Map();
  const instances = [];
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    }
  };
  globalThis.Chart = class {
    constructor(canvas, configuration) {
      this.canvas = canvas;
      this.configuration = configuration;
      this.destroyed = false;
      instances.push(this);
    }

    destroy() {
      this.destroyed = true;
    }
  };
  const dashboard = require('../assets/js/business-modules.js');
  return { dashboard, elements, instances };
}

const inventoryDataset = {
  headers: ['Producto', 'Tipo de movimiento', 'Cantidad de pares', 'Existencia actual (pares)', 'Punto de reposición (pares)', 'País reportante', 'Año'],
  rows: [
    ['Bota', 'Entrada', 10, 3, 5, 'Bolivia', '2024'],
    ['Bota', 'Salida por venta', 2, 3, 5, 'Bolivia', '2024'],
    ['Sandalia', 'Ingreso', 4, 8, 2, 'Bolivia', '2024'],
    ['Sandalia', 'Salida por venta', 0, 8, 2, 'Bolivia', '2024']
  ]
};

function tradeDataset(years = ['2022', '2023', '2024', '2025', '2026']) {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Año'];
  const imports = [10, 12, 15, 20, 25];
  const exports = [8, 9, 11, 12, 14];
  return {
    headers,
    rows: years.flatMap((year, index) => [
      ['Bolivia', 'Chile', 'Importaciones', imports[index], year],
      ['Bolivia', 'Perú', 'Exportaciones', exports[index], year]
    ])
  };
}

const profitabilityDataset = {
  headers: ['Producto', 'Ventas USD', 'Costo de ventas USD', 'Año'],
  rows: [
    ['Botas', 100, 60, '2024'],
    ['Sandalias', 50, 35, '2024'],
    ['Botas', 0, 0, '2025']
  ]
};

test('inventario genera gráficos de movimientos y stock y actualiza sus datos al filtrar productos', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  dashboard.render('inventarios', inventoryDataset);

  let movementChart = instances.find((chart) => chart.canvas.id === 'inventory-movements-chart');
  let stockChart = instances.find((chart) => chart.canvas.id === 'inventory-stock-chart');
  assert.ok(movementChart);
  assert.equal(movementChart.configuration.type, 'bar');
  assert.deepEqual(movementChart.configuration.data.labels, ['Bota · Bolivia', 'Sandalia · Bolivia']);
  assert.deepEqual(movementChart.configuration.data.datasets.map((series) => series.data), [[10, 4], [2, 0]]);
  assert.ok(stockChart);
  assert.deepEqual(stockChart.configuration.data.datasets.map((series) => series.data), [[3, 8], [5, 2]]);
  assert.match(elements.get('inventarios-results').innerHTML, /Alertas de stock/);

  const productFilter = elements.get('inventarios-product-filter');
  productFilter.value = 'Sandalia';
  productFilter.trigger('change');
  movementChart = instances.filter((chart) => chart.canvas.id === 'inventory-movements-chart').at(-1);
  stockChart = instances.filter((chart) => chart.canvas.id === 'inventory-stock-chart').at(-1);
  assert.ok(instances[0].destroyed);
  assert.deepEqual(movementChart.configuration.data.labels, ['Sandalia · Bolivia']);
  assert.deepEqual(movementChart.configuration.data.datasets.map((series) => series.data), [[4], [0]]);
  assert.deepEqual(stockChart.configuration.data.labels, ['Sandalia · Bolivia']);
});

test('pronóstico genera líneas históricas y proyección futura y valida su error sin ajustar a datos sintéticos de ejemplo', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  dashboard.render('pronosticos', tradeDataset());

  let forecast = instances.find((chart) => chart.canvas.id === 'forecast-chart');
  assert.ok(forecast);
  assert.equal(forecast.configuration.type, 'line');
  assert.deepEqual(forecast.configuration.data.labels, ['2022', '2023', '2024', '2025', '2026', '2027']);
  assert.ok(forecast.configuration.data.datasets.some((series) => /proyección naïve/i.test(series.label)));
  assert.match(elements.get('pronosticos-results').innerHTML, /MAE 5/);
  assert.match(elements.get('pronosticos-results').innerHTML, /2027/);
  assert.match(elements.get('pronosticos-results').innerHTML, /no representan demanda ni ventas de MANACO/);

  const flowFilter = elements.get('pronosticos-flow-filter');
  flowFilter.value = 'Importaciones';
  flowFilter.trigger('change');
  forecast = instances.filter((chart) => chart.canvas.id === 'forecast-chart').at(-1);
  assert.ok(instances[0].destroyed);
  assert.equal(forecast.configuration.data.datasets.length, 2);
  assert.ok(forecast.configuration.data.datasets.every((series) => /Importaciones/.test(series.label)));
  assert.match(elements.get('pronosticos-results').innerHTML, /MAE 5/);
});

test('rentabilidad grafica ingresos, costos, margen y mezcla por categoría; respeta periodos y conserva ceros', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  dashboard.render('rentabilidad', profitabilityDataset);

  const comparison = instances.find((chart) => chart.canvas.id === 'profitability-margins-chart');
  const categories = instances.find((chart) => chart.canvas.id === 'profitability-category-chart');
  assert.ok(comparison);
  assert.equal(comparison.configuration.type, 'bar');
  assert.deepEqual(comparison.configuration.data.labels, ['Botas', 'Sandalias']);
  assert.deepEqual(comparison.configuration.data.datasets.map((series) => series.data), [[100, 50], [60, 35], [40, 15]]);
  assert.ok(categories);
  assert.equal(categories.configuration.type, 'doughnut');
  assert.deepEqual(categories.configuration.data.datasets[0].data, [100, 50]);
  assert.match(elements.get('rentabilidad-results').innerHTML, /Margen bruto/);
  assert.match(elements.get('rentabilidad-results').innerHTML, /no equivale a margen/);

  const periodFilter = elements.get('rentabilidad-period-filter');
  periodFilter.value = '2025';
  periodFilter.trigger('change');
  const updated = instances.filter((chart) => chart.canvas.id === 'profitability-margins-chart').at(-1);
  assert.ok(instances[0].destroyed);
  assert.deepEqual(updated.configuration.data.datasets.map((series) => series.data), [[0], [0], [0]]);
  assert.match(elements.get('rentabilidad-results').innerHTML, /ingresos totales iguales a cero/i);
});

test('los módulos vacíos y los requisitos de columnas se explican sin fabricar resultados ni proyecciones', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  for (const view of ['inventarios', 'pronosticos', 'rentabilidad']) {
    dashboard.render(view, null);
    assert.match(elements.get(`${view}-results`).innerHTML, /Aún no hay datos cargados/);
  }
  dashboard.render('inventarios', { headers: ['Producto', 'Cantidad de pares'], rows: [['Bota', 3]] });
  assert.match(elements.get('inventarios-results').innerHTML, /tipo de movimiento/i);
  dashboard.render('pronosticos', tradeDataset(['2023', '2024']));
  assert.match(elements.get('pronosticos-results').innerHTML, /al menos tres años consecutivos/);
  dashboard.render('rentabilidad', { headers: ['Valor USD', 'Costo de ventas USD'], rows: [[100, 60]] });
  assert.match(elements.get('rentabilidad-results').innerHTML, /ingresos\/ventas explícitos/i);
  assert.equal(instances.length, 0);
});

test('las proyecciones de exactamente tres años no presentan métricas retrospectivas sin observaciones de validación', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  dashboard.render('pronosticos', tradeDataset(['2022', '2023', '2024']));
  assert.equal(instances.length, 1);
  assert.match(elements.get('pronosticos-results').innerHTML, /Sin observaciones de validación/);
  assert.match(elements.get('pronosticos-results').innerHTML, /al menos 4 años consecutivos/);
});

test('el pronóstico conserva ceros y no inventa un MAPE cuando los valores reales de validación son cero', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  const source = tradeDataset();
  const rows = source.rows.map((row) => ['2025', '2026'].includes(row[4]) ? [...row.slice(0, 3), 0, row[4]] : row);
  dashboard.render('pronosticos', { ...source, rows });
  const prediction = instances.find((chart) => chart.canvas.id === 'forecast-chart');
  assert.ok(prediction);
  assert.deepEqual(prediction.configuration.data.datasets.filter((series) => /proyección naïve/i.test(series.label)).map((series) => series.data.at(-1)), [0, 0]);
  assert.match(elements.get('pronosticos-results').innerHTML, /MAE 7,5/);
  assert.match(elements.get('pronosticos-results').innerHTML, /todos los valores reales son cero/);
});

test('el módulo conserva los gráficos de movimiento si faltan datos de stock y explica que no calcula alertas', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  dashboard.render('inventarios', {
    headers: ['Producto', 'Tipo de movimiento', 'Cantidad de pares'],
    rows: [['Botas', 'Entrada', 0]]
  });
  assert.ok(instances.some((chart) => chart.canvas.id === 'inventory-movements-chart'));
  assert.ok(instances.every((chart) => chart.canvas.id !== 'inventory-stock-chart'));
  assert.match(elements.get('inventarios-results').innerHTML, /No se detectó existencia\/stock actual/);
  assert.match(elements.get('inventarios-results').innerHTML, /Entradas/);
});

test('si Chart.js no carga, los análisis explican la limitación y no reportan gráficos como si se dibujaran', () => {
  const { dashboard, elements, instances } = dashboardHarness();
  globalThis.Chart = undefined;
  dashboard.render('rentabilidad', profitabilityDataset);
  assert.match(elements.get('rentabilidad-results').innerHTML, /Chart\.js no está disponible/);
  assert.match(elements.get('rentabilidad-results').innerHTML, /Ingresos por ventas/);
  assert.equal(instances.length, 0);
});
