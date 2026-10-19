'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, buildColumnMapping, inferType, isEmptyRow } = require('../assets/js/data-analysis.js');

test('detecta filas vacías y conserva solo registros no vacíos en la copia preparada', () => {
  const result = analyze(['Producto', 'Cantidad'], [['Bota', 4], ['', ' '], ['Sandalia', 2]], 2);
  assert.equal(result.rowCount, 2);
  assert.deepEqual(result.emptyRowNumbers, [3]);
  assert.deepEqual(result.preparedRows, [['Bota', 4], ['Sandalia', 2]]);
});

test('identifica todas las filas implicadas en duplicados exactos sin retirarlas', () => {
  const rows = [['A', 10], ['B', 20], ['A', 10], ['A', 10]];
  const result = analyze(['Código', 'Valor'], rows, 2);
  assert.deepEqual(result.duplicateRowNumbers, [2, 4, 5]);
  assert.equal(result.preparedRows.length, 4);
});

test('marca posibles agregados Mundo en valores de texto y no elimina esas filas', () => {
  const result = analyze(['Región', 'Monto'], [['Mundo', 90], ['Mundo total', 90], ['Norte', 20]], 2);
  assert.deepEqual(result.worldRowNumbers, [2, 3]);
  assert.equal(result.preparedRows.length, 3);
});

test('propone nombres legibles y únicos preservando el encabezado original', () => {
  const mapping = buildColumnMapping([' Año de venta ', 'Año de venta', '', 'Código #']);
  assert.deepEqual(mapping, [
    { index: 0, original: 'Año de venta', proposed: 'ano_de_venta' },
    { index: 1, original: 'Año de venta', proposed: 'ano_de_venta_2' },
    { index: 2, original: '', proposed: 'columna_3' },
    { index: 3, original: 'Código #', proposed: 'codigo' }
  ]);
});

test('infiere tipos, únicos y faltantes sin convertir texto en cifras', () => {
  const result = analyze(['Cantidad', 'Comentario'], [[2, 'N/A'], [3, ''], ['', null]], 2);
  assert.deepEqual(result.columns.map(({ type, uniqueCount, missingCount }) => ({ type, uniqueCount, missingCount })), [
    { type: 'numérico', uniqueCount: 2, missingCount: 0 },
    { type: 'texto', uniqueCount: 1, missingCount: 1 }
  ]);
  assert.equal(inferType(['12', '13']), 'texto');
});

test('no cuenta filas completamente vacías como duplicados', () => {
  assert.equal(isEmptyRow(['', null]), true);
  const result = analyze(['A', 'B'], [['', ''], ['', '']], 2);
  assert.equal(result.emptyRowNumbers.length, 2);
  assert.deepEqual(result.duplicateRowNumbers, []);
});