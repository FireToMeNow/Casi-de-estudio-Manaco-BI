'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reference = require('../assets/data/caso-manaco-referencia.json');
const { validate } = require('../assets/js/case-answer-validator.js');

const source = {
  recordCount: 240,
  reporters: ['España'],
  periods: ['2020', '2021', '2022', '2023', '2024']
};

test('validador: reconoce cifras de importación con formato español e inglés', () => {
  for (const evidence of [
    'Importaciones de España: 18.506,09 millones USD y 751,09 millones de pares.',
    'Spain imports: 18,506.09 million USD and 751.09 million pairs.',
    'Importaciones de España: 18.506 millones USD.'
  ]) {
    const result = validate({
      s2_scope: 'external',
      s2_finding_1: 'España importó más que exportó.',
      s2_evidence_1: evidence
    }, reference, source);
    assert.match(result.criteria.find((criterion) => criterion.id === 'reference-facts').detail, /Importaciones:/);
    assert.equal(result.referenceMatched, true);
  }
});

test('validador: no acepta cifra incorrecta o asignada al flujo equivocado', () => {
  const result = validate({
    s2_scope: 'external',
    s2_finding_1: 'España registró importaciones.',
    s2_evidence_1: 'Importaciones: 10.917,35 millones USD.'
  }, reference, source);
  assert.doesNotMatch(result.criteria.find((criterion) => criterion.id === 'reference-facts').detail, /Importaciones:/);
  assert.ok(result.warnings.some((warning) => warning.message.includes('no coinciden')));
});

test('validador: no interpreta como miles un decimal ambiguo sin contexto de escala', () => {
  const result = validate({
    s2_scope: 'external',
    s2_finding_1: 'España importó calzado.',
    s2_evidence_1: 'Importaciones: 18.506 USD.'
  }, reference, source);
  assert.doesNotMatch(result.criteria.find((criterion) => criterion.id === 'reference-facts').detail, /Importaciones:/);
  assert.equal(result.warnings.some((warning) => warning.message.includes('no coinciden')), false);
});

test('validador: advierte al atribuir a MANACO los flujos reportados por España', () => {
  const result = validate({
    s2_scope: 'external',
    s2_finding_1: 'MANACO importó 999 millones USD.',
    s2_evidence_1: 'España: 18.506,09 millones USD.'
  }, reference, source);
  assert.ok(result.warnings.some((warning) => warning.message.includes('atribución')));
  assert.equal(result.criteria.find((criterion) => criterion.id === 'source-scope').passed, true);
});

test('validador: no verifica datos de la referencia con un libro distinto', () => {
  const result = validate({
    s2_scope: 'external',
    s2_finding_1: 'España importó calzado.',
    s2_evidence_1: 'Importaciones 18.506,09 millones USD.'
  }, reference, { recordCount: 30, reporters: ['Bolivia'], periods: ['2024'] });
  assert.equal(result.referenceMatched, false);
  assert.equal(result.criteria.find((criterion) => criterion.id === 'reference-facts').earned, 0);
  assert.ok(result.warnings.some((warning) => warning.message.includes('no coincide exactamente')));
});

test('validador: evalúa metas medibles y dentro del horizonte de 36 meses', () => {
  const values = {
    s3_objective_1: 'Reducir devoluciones en 10% al mes 24.',
    s3_kpi_1: 'Tasa de devolución objetivo 10% con línea base actual.',
    s3_deadline_1: '24 meses',
    s3_objective_2: 'Mejorar disponibilidad.',
    s3_kpi_2: 'Disponibilidad',
    s3_deadline_2: '48 meses',
    s3_objective_3: 'Bajar defectos 5 puntos porcentuales.',
    s3_kpi_3: 'Tasa de defectos 5% anual.',
    s3_deadline_3: '36 meses'
  };
  const result = validate(values, reference, source);
  const criterion = result.criteria.find((item) => item.id === 'smart-objectives');
  assert.equal(criterion.earned, 12);
  assert.match(criterion.detail, /2 de 3 pasan/);
});
