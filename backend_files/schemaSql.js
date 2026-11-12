'use strict';
// Builds schema.sql from the statements initDb() runs, so the file cannot drift from the code (audit F-11).
// `node schemaSql.js` rewrites schema.sql; test/schemaSql.test.js fails when the committed file is out of date.
const fs = require('fs');
const path = require('path');
const createInitDb = require('./dbSchema');

const HEADER = `-- WanderGrid database schema.
-- GENERATED from dbSchema.js by \`npm run schema\` in backend_files/. Do not edit by hand: change dbSchema.js and
-- regenerate. The server creates all of this itself at startup; this file is for reading and for manual setups.
-- Changes to the shape of stored JSON are numbered migrations in migrations/ and are not part of this file.
`;

const STOP = new Error('schema captured');

async function generateSchemaSql() {
  const statements = [];
  const client = {
    async query(sql) {
      const text = String(sql).replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').replace(/\( /g, '(\n  ').replace(/, (?=[a-z_]+ [A-Z])/g, ',\n  ').replace(/ \)$/, '\n)').trim();
      if (/schema_migrations/i.test(text)) throw STOP; // migrations start here: every CREATE has been seen
      if (/^(CREATE|DROP INDEX)/i.test(text)) statements.push(text);
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, query: client.query };
  const silent = { log: console.log, error: console.error };
  console.log = console.error = () => {};
  try {
    await createInitDb({ pool, onReady() {} })(1, 0);
  } catch (err) {
    if (err !== STOP) throw err;
  } finally {
    console.log = silent.log;
    console.error = silent.error;
  }
  const tables = statements.filter(s => /^CREATE TABLE/i.test(s));
  const drops = statements.filter(s => /^DROP INDEX/i.test(s));
  const indexes = statements.filter(s => /^CREATE (UNIQUE )?INDEX/i.test(s));
  return `${HEADER}\n${tables.map(s => `${s};`).join('\n\n')}\n\n-- Indexes\n${indexes.map(s => `${s};`).join('\n')}\n\n-- Dropped on existing databases (never used by a query)\n${drops.map(s => `${s};`).join('\n')}\n`;
}

module.exports = { generateSchemaSql };

if (require.main === module) {
  generateSchemaSql().then(sql => {
    fs.writeFileSync(path.join(__dirname, 'schema.sql'), sql);
    console.log('schema.sql written');
  });
}
