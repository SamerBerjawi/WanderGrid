'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { generateSchemaSql } = require('../schemaSql');

test('schema.sql matches what initDb() creates', async () => {
  const committed = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  assert.strictEqual(committed, await generateSchemaSql(), 'schema.sql is out of date: run `npm run schema` in backend_files/');
});
