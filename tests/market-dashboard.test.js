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
  const window = { MarketAnalysis, Chart };
  const context = { document, window, Chart, Intl, Number, Set, Map, JSON, String, Math };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/market-dashboard.js'), 'utf8'), context);
  let dataset = initialDataset;
  window.MarketDashboard.initialize(() => dataset);
  window.MarketDashboard.refresh();
  return {
    elements,
    charts,
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
    chart.configuration.data.datasets[1].data[0] === 20));
  assert.ok(filteredCharts.some((chart) => chart.canvas === dashboard.elements.get('market-partner-chart') &&
    chart.configuration.data.labels.includes('Chile')));

  const next = dataset('comercio-b.csv', 'Resumen', headers, [
    ['Ecuador', 'Perú', 'Exportaciones', 45, '2026', 'Calzado deportivo']
  ]);
  dashboard.setDataset(next);
  assert.match(dashboard.elements.get('market-source').textContent, /comercio-b\.csv · hoja Resumen/);
  assert.match(dashboard.elements.get('market-analysis-period').textContent, /2026/);
  assert.match(dashboard.elements.get('market-kpis').innerHTML, /45 USD/);
  assert.match(dashboard.elements.get('market-findings-list').innerHTML, /Perú/);
  assert.match(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /Calzado deportivo/);
  assert.doesNotMatch(dashboard.elements.get('market-records-table').querySelector('tbody').innerHTML, /Argentina/);
  const replacementCharts = dashboard.charts.filter((chart) => !chart.destroyed);
  assert.ok(replacementCharts.some((chart) => chart.canvas === dashboard.elements.get('market-period-chart') &&
    chart.configuration.data.labels.includes('2026') &&
    chart.configuration.data.datasets.some((series) => series.data.includes(45))));
});
