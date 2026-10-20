'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const MarketAnalysis = require('../assets/js/market-analysis.js');

function createElement() {
  const children = new Map();
  return {
    value: '',
    hidden: false,
    textContent: '',
    innerHTML: '',
    listeners: {},
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, createElement());
      return children.get(selector);
    },
    insertAdjacentHTML(position, html) {
      this.innerHTML += html;
    }
  };
}

function dashboardHarness(initialDataset) {
  const elements = new Map();
  const charts = [];
  const exports = [];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    }
  };
  class Chart {
    constructor(canvas, configuration) {
      this.canvas = canvas;
      this.configuration = configuration;
      this.destroyed = false;
      charts.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const XLSX = {
    utils: {
      book_new: () => ({ sheets: [] }),
      aoa_to_sheet: (rows) => rows,
      book_append_sheet: (workbook, sheet, name) => workbook.sheets.push({ name, sheet })
    },
    writeFile: (workbook, fileName) => exports.push({ workbook, fileName })
  };
  const window = { MarketAnalysis, Chart, XLSX };
  const context = { document, window, Chart, XLSX, Intl, Number, Set, Map, JSON, String, Math };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/market-dashboard.js'), 'utf8'), context);
  let dataset = initialDataset;
  window.MarketDashboard.initialize(() => dataset);
  window.MarketDashboard.refresh();
  return {
    elements,
    charts,
    exports,
    setDataset(nextDataset) {
      dataset = nextDataset;
      window.MarketDashboard.refresh();
    }
  };
}

function dataset(fileName, sheetName, headers, rows) {
  return {
    fileName,
    sheetName,
    headers,
    rows,
    result: { rowCount: rows.length },
    firstDataRowNumber: 2
  };
}

test('dashboard actualiza tarjetas, periodo, hallazgos y tablas con filtros y al cambiar de archivo', () => {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Periodo', 'Categoría de calzado'];
  const initial = dataset('comercio-a.csv', 'Datos', headers, [
    ['Bolivia', 'Argentina', 'Importaciones', 10, '2024', 'Botas'],
    ['Bolivia', 'Chile', 'Exportaciones', 20, '2024', 'Botas'],
    ['Bolivia', 'Chile', 'Exportaciones', 5, '2024', 'Sandalias'],
    ['España', 'Bolivia', 'Importaciones', 90, '2025', 'Sandalias']
  ]);
  const dashboard = dashboardHarness(initial);

  const reporterFilter = dashboard.elements.get('market-reportingCountry-filter');
  reporterFilter.value = 'Bolivia';
  reporterFilter.listeners.change();
  assert.match(dashboard.elements.get('market-analysis-period').textContent, /2024/);
  assert.match(dashboard.elements.get('market-kpis').innerHTML, /10 USD/);
  assert.match(dashboard.elements.get('market-findings-list').innerHTML, /Chile/);
  assert.match(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /Argentina/);
  assert.doesNotMatch(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /España/);
  const filteredCharts = dashboard.charts.filter((chart) => !chart.destroyed);
  assert.ok(filteredCharts.some((chart) => chart.canvas === dashboard.elements.get('market-flow-chart') &&
    chart.configuration.data.datasets[0].data[0] === 10 &&
    chart.configuration.data.datasets[1].data[0] === 25));
  assert.ok(filteredCharts.some((chart) => chart.canvas === dashboard.elements.get('market-partner-chart') &&
    chart.configuration.data.labels.includes('Chile')));
  const categoryChart = filteredCharts.find((chart) => chart.canvas === dashboard.elements.get('market-category-chart'));
  assert.ok(categoryChart);
  assert.equal(categoryChart.configuration.type, 'doughnut');
  assert.deepEqual(Array.from(categoryChart.configuration.data.labels), ['Botas', 'Sandalias']);
  assert.deepEqual(Array.from(categoryChart.configuration.data.datasets[0].data), [30, 5]);
  const annualChart = filteredCharts.find((chart) => chart.canvas === dashboard.elements.get('market-period-chart'));
  assert.ok(annualChart);
  assert.equal(annualChart.configuration.type, 'line');
  assert.deepEqual(Array.from(annualChart.configuration.data.labels), ['2024']);
  assert.deepEqual(Array.from(annualChart.configuration.data.datasets, (series) => Array.from(series.data)), [[10], [25]]);
  dashboard.elements.get('market-export').listeners.click();
  const includedSheet = dashboard.exports[0].workbook.sheets.find(({ name }) => name === 'Registros incluidos');
  assert.equal(includedSheet.sheet.length, 4);
  assert.ok(includedSheet.sheet.every((row) => !row.includes('España')));

  const productFilter = dashboard.elements.get('market-product-filter');
  productFilter.value = 'Sandalias';
  productFilter.listeners.change();
  const categoryFilteredChart = dashboard.charts.filter((chart) => !chart.destroyed)
    .find((chart) => chart.canvas === dashboard.elements.get('market-category-chart'));
  assert.ok(categoryChart.destroyed);
  assert.deepEqual(Array.from(categoryFilteredChart.configuration.data.labels), ['Sandalias']);
  assert.deepEqual(Array.from(categoryFilteredChart.configuration.data.datasets[0].data), [5]);

  const next = dataset('comercio-a.csv', 'Datos', headers, [
    ['Bolivia', 'Perú', 'Importaciones', 15, '2026', 'Calzado deportivo'],
    ['Bolivia', 'Ecuador', 'Exportaciones', 45, '2026', 'Calzado deportivo'],
    ['España', 'Bolivia', 'Importaciones', 90, '2026', 'Sandalias']
  ]);
  dashboard.setDataset(next);
  assert.match(dashboard.elements.get('market-source').textContent, /comercio-a\.csv · hoja Datos/);
  assert.match(dashboard.elements.get('market-analysis-period').textContent, /2026/);
  assert.match(dashboard.elements.get('market-kpis').innerHTML, /No disponible/);
  assert.match(dashboard.elements.get('market-alerts').innerHTML, /Selecciona uno/);
  assert.doesNotMatch(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /Calzado deportivo/);
  assert.doesNotMatch(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /Argentina/);
  assert.match(dashboard.elements.get('market-counts').innerHTML, /Incluidos en indicadores<\/span><strong>0/);
  reporterFilter.value = 'Bolivia';
  reporterFilter.listeners.change();
  assert.match(dashboard.elements.get('market-kpis').innerHTML, /15 USD/);
  assert.match(dashboard.elements.get('market-findings-list').innerHTML, /Ecuador/);
  assert.match(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /Calzado deportivo/);
  assert.match(dashboard.elements.get('market-counts').innerHTML, /Tras filtros<\/span><strong>2/);
  const replacementCharts = dashboard.charts.filter((chart) => !chart.destroyed);
  assert.ok(replacementCharts.some((chart) => chart.canvas === dashboard.elements.get('market-period-chart') &&
    chart.configuration.data.labels.includes('2026') &&
    chart.configuration.data.datasets.some((series) => series.data.includes(45))));
  const replacementCategoryChart = replacementCharts.find((chart) => chart.canvas === dashboard.elements.get('market-category-chart'));
  assert.ok(replacementCategoryChart);
  assert.deepEqual(Array.from(replacementCategoryChart.configuration.data.labels), ['Calzado deportivo']);
  assert.deepEqual(Array.from(replacementCategoryChart.configuration.data.datasets[0].data), [60]);
});

test('dashboard separa agregados anuales de meses en la serie y destruye gráficos al limpiar los datos', () => {
  const headers = ['País reportante', 'País socio', 'Flujo', 'Valor USD', 'Periodo', 'Producto'];
  const source = dataset('comercio-mensual.csv', 'Datos', headers, [
    ['Bolivia', 'Chile', 'Importaciones', 10, '2024-01', 'Botas'],
    ['Bolivia', 'Chile', 'Importaciones', 15, '2024-02', 'Botas'],
    ['Bolivia', 'Chile', 'Exportaciones', 8, '2024-01', 'Sandalias'],
    ['Bolivia', 'Chile', 'Exportaciones', 12, '2025-01', 'Sandalias']
  ]);
  const dashboard = dashboardHarness(source);
  const reporterFilter = dashboard.elements.get('market-reportingCountry-filter');
  reporterFilter.value = 'Bolivia';
  reporterFilter.listeners.change();

  const charts = dashboard.charts.filter((chart) => !chart.destroyed);
  const annual = charts.find((chart) => chart.canvas === dashboard.elements.get('market-period-chart'));
  assert.ok(annual);
  assert.deepEqual(Array.from(annual.configuration.data.labels), ['2024', '2025']);
  assert.deepEqual(Array.from(annual.configuration.data.datasets, (series) => Array.from(series.data)), [[25, null], [8, 12]]);

  const flowFilter = dashboard.elements.get('market-flow-filter');
  flowFilter.value = 'Importaciones';
  flowFilter.listeners.change();
  const importsOnly = dashboard.charts.filter((chart) => !chart.destroyed)
    .find((chart) => chart.canvas === dashboard.elements.get('market-period-chart'));
  assert.ok(annual.destroyed);
  assert.deepEqual(Array.from(importsOnly.configuration.data.datasets, (series) => Array.from(series.data)), [[25]]);

  dashboard.setDataset(null);
  assert.ok(dashboard.charts.every((chart) => chart.destroyed));
  assert.equal(dashboard.elements.get('market-category-card').hidden, true);
});

test('dashboard no presenta filas como incluidas cuando las monedas son incompatibles', () => {
  const source = dataset('monedas.csv', 'Datos', ['País', 'Flujo', 'Valor', 'Moneda'], [
    ['Chile', 'Importaciones', 10, 'USD'],
    ['Perú', 'Exportaciones', 20, 'EUR']
  ]);
  const dashboard = dashboardHarness(source);
  assert.match(dashboard.elements.get('market-counts').innerHTML, /Incluidos en indicadores<\/span><strong>0/);
  assert.equal(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, '');
  dashboard.elements.get('market-export').listeners.click();
  const includedSheet = dashboard.exports[0].workbook.sheets.find(({ name }) => name === 'Registros incluidos');
  assert.equal(includedSheet.sheet.length, 1);
});
