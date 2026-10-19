(function (root) {
  'use strict';

  function isMissing(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  }

  function normalizeHeader(value, index) {
    const original = value === null || value === undefined ? '' : String(value).trim();
    const base = original
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `columna_${index + 1}`;
    return { original, base };
  }

  function buildColumnMapping(headers) {
    const used = new Set();
    return headers.map((value, index) => {
      const normalized = normalizeHeader(value, index);
      let proposed = normalized.base;
      let suffix = 2;
      while (used.has(proposed)) proposed = `${normalized.base}_${suffix++}`;
      used.add(proposed);
      return { index, original: normalized.original, proposed };
    });
  }

  function inferType(values) {
    const present = values.filter((value) => !isMissing(value));
    if (present.length === 0) return 'Sin datos';
    const types = new Set(present.map((value) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return 'fecha';
      if (typeof value === 'number' && Number.isFinite(value)) return 'numérico';
      if (typeof value === 'boolean') return 'booleano';
      return 'texto';
    }));
    return types.size === 1 ? [...types][0] : 'mixto';
  }

  function valueKey(value) {
    if (value instanceof Date) return `date:${value.toISOString()}`;
    if (typeof value === 'number' && Number.isNaN(value)) return 'number:NaN';
    return `${typeof value}:${JSON.stringify(value)}`;
  }

  function isEmptyRow(row) {
    return row.every(isMissing);
  }

  function analyze(headers, rows, firstDataRowNumber) {
    const width = headers.length;
    const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
    const emptyRowNumbers = [];
    const duplicateRowNumbers = [];
    const worldRowNumbers = [];
    const seenRows = new Map();
    const nonEmptyRows = [];

    normalizedRows.forEach((row, index) => {
      const rowNumber = firstDataRowNumber + index;
      if (isEmptyRow(row)) {
        emptyRowNumbers.push(rowNumber);
        return;
      }
      nonEmptyRows.push({ row, rowNumber });
      const key = JSON.stringify(row.map(valueKey));
      if (seenRows.has(key)) {
        if (!duplicateRowNumbers.includes(seenRows.get(key))) duplicateRowNumbers.push(seenRows.get(key));
        duplicateRowNumbers.push(rowNumber);
      } else {
        seenRows.set(key, rowNumber);
      }
      if (row.some((value) => typeof value === 'string' && /mundo/i.test(value.trim()))) {
        worldRowNumbers.push(rowNumber);
      }
    });

    const columns = headers.map((header, index) => {
      const values = nonEmptyRows.map(({ row }) => row[index]);
      return {
        index,
        original: header === null || header === undefined ? '' : String(header),
        type: inferType(values),
        uniqueCount: new Set(values.filter((value) => !isMissing(value)).map(valueKey)).size,
        missingCount: values.filter(isMissing).length
      };
    });

    return {
      rowCount: nonEmptyRows.length,
      sourceRowCount: rows.length,
      columnCount: width,
      emptyRowNumbers,
      duplicateRowNumbers: [...new Set(duplicateRowNumbers)].sort((a, b) => a - b),
      worldRowNumbers,
      columns,
      columnMapping: buildColumnMapping(headers),
      preparedRows: nonEmptyRows.map(({ row }) => row)
    };
  }

  const api = { analyze, buildColumnMapping, inferType, isEmptyRow, isMissing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DataAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);