/**
 * Runs the real server.js against an in-memory Postgres (pg-mem) on a fixed port, with logs on, so the
 * frontend can be tried in real mode (VITE_LOCAL_MODE=false) without a Postgres install:
 *
 *   cd backend_files && node test/helpers/devServer.js        # API on :3001
 *   VITE_LOCAL_MODE=false npx vite --port 3114                 # the app, proxying /api to :3001
 *
 * It is the same code path as production (routes, auth, versioned writes, batch transactions); only the
 * database engine differs. Data is lost when it stops.
 */
process.env.TEST_VERBOSE = '1';
const { startTestServer } = require('./testServer');
startTestServer({ port: Number(process.env.PORT) || 3001 }).then(srv => {
    process.stdout.write(`pg-mem API on ${srv.base}\n`);
}).catch(err => { process.stderr.write(`${err.stack || err}\n`); process.exit(1); });
