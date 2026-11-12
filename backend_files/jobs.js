'use strict';
// Background jobs and the data-management routes: /api/jobs/*, backup, restore and wipe.
// Moved out of server.js unchanged (decision D-07).
const crypto = require('crypto');

module.exports = function registerJobRoutes(app, {
  pool, sendError, requireAdmin, withTransaction, bulkUpsert, loadGlobalData, refreshAllGlobalDatasets, tripKind,
  isStoredPasswordHash, hashPassword, removeSensitiveData, SECRET_MASK, dropObsoleteSettings, invalidateSecretsCache, HttpError, BoundedMap,
}) {
  // --- Background Job Manager & Supervisor Engine ---
  // Finished jobs (and their results, e.g. a whole backup) are kept for a while for polling, then dropped.
  const JOB_RETENTION_MS = process.env.JOB_RETENTION_MS ? parseInt(process.env.JOB_RETENTION_MS, 10) : 30 * 60 * 1000;
  const activeJobs = new BoundedMap(100);
  const scheduleJobCleanup = (jobId) => {
      const timer = setTimeout(() => activeJobs.delete(jobId), JOB_RETENTION_MS);
      if (timer.unref) timer.unref();
  };

  function runBackgroundJob(jobType, taskFn) {
      const jobId = crypto.randomUUID();
      activeJobs.set(jobId, {
          id: jobId,
          type: jobType,
          status: 'Processing',
          progress: 10,
          result: null,
          error: null,
          createdAt: new Date().toISOString()
      });
      
      // Execute asynchronously (offloading from HTTP event phase)
      Promise.resolve().then(async () => {
          try {
              const updateProgress = (p) => {
                  const job = activeJobs.get(jobId);
                  if (job) {
                      job.progress = p;
                      activeJobs.set(jobId, job);
                  }
              };

              const result = await taskFn(updateProgress);
              
              const job = activeJobs.get(jobId);
              if (job) {
                  job.status = 'Completed';
                  job.progress = 100;
                  job.result = result;
                  activeJobs.set(jobId, job);
              }
              scheduleJobCleanup(jobId);
          } catch (err) {
              console.error(`Background Job [${jobId}] failed:`, err.message);
              const job = activeJobs.get(jobId);
              if (job) {
                  job.status = 'Failed';
                  job.progress = 100;
                  job.error = err.message;
                  activeJobs.set(jobId, job);
              }
              scheduleJobCleanup(jobId);
          }
      });
      
      return jobId;
  }

  // Background Task Status Endpoint
  // Background jobs (backup, dataset refresh) are administrator tools.
  app.use('/api/jobs', requireAdmin);

  app.get('/api/jobs/status/:jobId', (req, res) => {
      const { jobId } = req.params;
      const job = activeJobs.get(jobId);
      if (!job) {
          return res.status(404).json({ error: 'Background job not found' });
      }
      res.json(job);
  });

  // Added job status polling via /api/jobs/:id (specifically matching requirement text)
  app.get('/api/jobs/:id', (req, res) => {
      const { id } = req.params;
      const job = activeJobs.get(id);
      if (!job) {
          return res.status(404).json({ error: 'Background job not found' });
      }
      res.json(job);
  });

  // Immediately acknowledges the request with 'Processing' state while compiling heavy table states
  app.post('/api/jobs/backup', (req, res) => {
      const jobId = runBackgroundJob('DATABASE_BACKUP', async (progress) => {
          const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
          const backup = {};
          
          for (let i = 0; i < tables.length; i++) {
              const table = tables[i];
              const { rows } = await pool.query(`SELECT data FROM ${table}`);
              backup[table] = rows.map(r => r.data);
              progress(Math.round(20 + (i / tables.length) * 60)); // Stagger progress metric
          }
          
          const settingsRes = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
          backup.workspaceSettings = dropObsoleteSettings(settingsRes.rows.length > 0 ? { ...settingsRes.rows[0].data } : {});
          progress(90);
          
          const cleanBackup = removeSensitiveData(backup);
          progress(100);
          return cleanBackup;
      });
      
      res.status(202).json({
          success: true,
          message: 'Database backup offloaded to background worker.',
          jobId,
          status: 'Processing'
      });
  });

  // Added manual global data refresh job endpoint. This lets heavy operations return quickly with a “processing” status.
  app.post('/api/jobs/refresh', (req, res) => {
      const jobId = runBackgroundJob('GLOBAL_DATA_REFRESH', async (progress) => {
          progress(20);
          const datasets = await refreshAllGlobalDatasets();
          progress(90);
          await loadGlobalData();
          progress(100);
          return { message: 'Database global datasets successfully refreshed and memory maps synced.', datasets };
      });
      
      res.status(202).json({
          success: true,
          message: 'Global static airports and carriers data refresh job started.',
          jobId,
          status: 'Processing'
      });
  });

  app.post('/api/jobs/refresh-data', (req, res) => {
      res.redirect(307, '/api/jobs/refresh');
  });
  app.post('/api/jobs/refresh-global-data', (req, res) => {
      res.redirect(307, '/api/jobs/refresh');
  });

  // Import/Export Full State
  app.get('/api/backup', requireAdmin, async (req, res) => {
      try {
          const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
          const backup = {};
          
          for (const table of tables) {
              const { rows } = await pool.query(`SELECT data FROM ${table}`);
              backup[table] = rows.map(r => r.data);
          }
          
          const settingsRes = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
          backup.workspaceSettings = dropObsoleteSettings(settingsRes.rows.length > 0 ? { ...settingsRes.rows[0].data } : {});
          
          const cleanBackup = removeSensitiveData(backup);
          res.json(cleanBackup);
      } catch (err) {
          sendError(res, err, 500, 'Failed to generate database backup');
      }
  });

  // Restored accounts keep their current password, accept a stored hash, or hash a plaintext value.
  // A user with none gets no usable password (an admin must set one) — never a shared default.
  async function restoredPassword(incoming, existing) {
      if (typeof incoming === 'string' && incoming) {
          return isStoredPasswordHash(incoming) ? incoming : hashPassword(incoming);
      }
      return (existing && existing.password) || '';
  }

  app.post('/api/restore', requireAdmin, async (req, res) => {
      const rawBody = req.body || {};
      const data = (rawBody.data && typeof rawBody.data === 'object') ? rawBody.data : rawBody;
      
      // Strict validation-driven checks
      if (!data || typeof data !== 'object') {
          return res.status(400).json({ error: 'Validation failed: Backup payload must be a JSON object' });
      }
      
      const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
      for (const table of tables) {
          if (data[table] !== undefined) {
              if (!Array.isArray(data[table])) {
                  return res.status(400).json({ error: `Validation failed: '${table}' must be an array` });
              }
              for (const item of data[table]) {
                  if (!item || typeof item !== 'object') {
                      return res.status(400).json({ error: `Validation failed: Items in '${table}' must be objects` });
                  }
                  if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
                      return res.status(400).json({ error: `Validation failed: Items in '${table}' must have a valid non-empty string ID` });
                  }
              }
          }
      }
      
      if (data.workspaceSettings !== undefined && (typeof data.workspaceSettings !== 'object' || data.workspaceSettings === null)) {
          return res.status(400).json({ error: "Validation failed: 'workspaceSettings' must be an object" });
      }

      const restoreOptions = rawBody.restoreOptions || data.restoreOptions || {};
      const mode = restoreOptions.mode === 'merge' ? 'merge' : 'replace';
      const selected = restoreOptions.selectedCategories || {
          flights: true,
          roadTrips: true,
          visited: true,
          settings: true,
          users: true,
          calendar: true
      };

      const currentUserId = restoreOptions.currentUserId || req.user?.id;
      const currentUserEmail = (restoreOptions.currentUserEmail || req.user?.email || '').toLowerCase().trim();

      // Helper functions for trip categorization
      const isTripRoad = (t) => {
          if (t.icon === '🚗') return true;
          if (t.locations && t.locations.length > 1) return true;
          const transports = t.transports || [];
          return transports.some(tr => tr.mode && tr.mode !== 'Flight');
      };
      const isTripAir = (t) => {
          if (tripKind(t) === 'bundle' || t.icon === '✈️') return true;
          const transports = t.transports || [];
          if (transports.length === 0) return true; // General trip default
          return transports.some(tr => !tr.mode || tr.mode === 'Flight');
      };

      // Runs as a background job (202 + poll /api/jobs/status/:id): large restores outlive the
      // client's request timeout, and clients therefore never resend the same restore.
      const jobId = runBackgroundJob('restore', () => withTransaction(async (client) => {
          
          // 1. RESTORE USERS (With Active Session Safety)
          if (selected.users !== false && data.users && Array.isArray(data.users)) {
              const { rows: existingUserRows } = await client.query('SELECT id, data FROM users');
              const existingUserMap = new Map(existingUserRows.map(r => [r.id, r.data]));
              
              // Find currently active user in DB
              let activeUserRecord = null;
              for (const r of existingUserRows) {
                  if (r.id === currentUserId || (r.data?.email && r.data.email.toLowerCase().trim() === currentUserEmail)) {
                      activeUserRecord = r.data;
                      break;
                  }
              }
              if (!activeUserRecord && restoreOptions.currentUser) {
                  activeUserRecord = restoreOptions.currentUser;
              }

              if (mode === 'replace') {
                  await client.query('TRUNCATE TABLE users');
                  let sessionUserInserted = false;
                  for (const item of data.users) {
                      const existing = existingUserMap.get(item.id);
                      item.password = await restoredPassword(item.password, existing);
                      if (item.id === currentUserId || (item.email && item.email.toLowerCase().trim() === currentUserEmail)) {
                          sessionUserInserted = true;
                      }
                  }
                  await bulkUpsert(client, 'users', data.users);
                  // Guarantee active user is never deleted
                  if (!sessionUserInserted && activeUserRecord) {
                      await client.query(
                          'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                          [activeUserRecord.id, JSON.stringify(activeUserRecord)]
                      );
                  }
              } else {
                  // Merge users
                  const mergedUsers = [];
                  for (const item of data.users) {
                      const existing = existingUserMap.get(item.id);
                      const mergedUser = existing ? { ...existing, ...item } : item;
                      mergedUser.password = await restoredPassword(item.password, existing);
                      mergedUsers.push(mergedUser);
                  }
                  await bulkUpsert(client, 'users', mergedUsers);
              }
          }

          // 2. RESTORE TRIPS (Granular Flights vs Road Trips)
          if ((selected.flights !== false || selected.roadTrips !== false) && data.trips && Array.isArray(data.trips)) {
              const { rows: existingTripRows } = await client.query('SELECT id, data FROM trips');
              const existingTripsMap = new Map(existingTripRows.map(r => [r.id, r.data]));

              const incomingTrips = data.trips.filter(t => {
                  const road = isTripRoad(t);
                  const air = isTripAir(t);
                  if (selected.roadTrips && selected.flights) return true;
                  if (selected.roadTrips && road) return true;
                  if (selected.flights && air) return true;
                  return false;
              });

              if (mode === 'replace') {
                  // Keep categories not selected
                  const tripsToKeep = new Map();
                  if (!selected.roadTrips) {
                      existingTripRows.forEach(r => { if (isTripRoad(r.data)) tripsToKeep.set(r.id, r.data); });
                  }
                  if (!selected.flights) {
                      existingTripRows.forEach(r => { if (isTripAir(r.data) && !isTripRoad(r.data)) tripsToKeep.set(r.id, r.data); });
                  }
                  // Add incoming
                  incomingTrips.forEach(t => tripsToKeep.set(t.id, t));

                  await client.query('TRUNCATE TABLE trips');
                  await bulkUpsert(client, 'trips', Array.from(tripsToKeep.values()));
              } else {
                  // Merge
                  await bulkUpsert(client, 'trips', incomingTrips.map(t => {
                      const existing = existingTripsMap.get(t.id);
                      return existing ? { ...existing, ...t } : t;
                  }));
              }
          }

          // 3. RESTORE FLIGHTS (Independent Transports)
          if ((selected.flights !== false || selected.roadTrips !== false) && data.flights && Array.isArray(data.flights)) {
              const { rows: existingFlightRows } = await client.query('SELECT id, data FROM flights');
              const existingFlightsMap = new Map(existingFlightRows.map(r => [r.id, r.data]));

              const incomingFlights = data.flights.filter(f => {
                  const isAir = !f.mode || f.mode === 'Flight';
                  if (selected.flights && isAir) return true;
                  if (selected.roadTrips && !isAir) return true;
                  return false;
              });

              if (mode === 'replace') {
                  const flightsToKeep = new Map();
                  if (!selected.flights) {
                      existingFlightRows.forEach(r => { if (!r.data.mode || r.data.mode === 'Flight') flightsToKeep.set(r.id, r.data); });
                  }
                  if (!selected.roadTrips) {
                      existingFlightRows.forEach(r => { if (r.data.mode && r.data.mode !== 'Flight') flightsToKeep.set(r.id, r.data); });
                  }
                  incomingFlights.forEach(f => flightsToKeep.set(f.id, f));

                  await client.query('TRUNCATE TABLE flights');
                  await bulkUpsert(client, 'flights', Array.from(flightsToKeep.values()));
              } else {
                  await bulkUpsert(client, 'flights', incomingFlights.map(f => {
                      const existing = existingFlightsMap.get(f.id);
                      return existing ? { ...existing, ...f } : f;
                  }));
              }
          }

          // 4. RESTORE VISITED PLACES
          if (selected.visited !== false && data.visited && Array.isArray(data.visited)) {
              if (mode === 'replace') await client.query('TRUNCATE TABLE visited');
              await bulkUpsert(client, 'visited', data.visited);
          }

          // 5. RESTORE CALENDAR / EVENTS / ENTITLEMENTS / CONFIGS
          if (selected.calendar !== false) {
              const calTables = ['events', 'entitlements', 'configs'];
              for (const table of calTables) {
                  if (data[table] && Array.isArray(data[table])) {
                      if (mode === 'replace') await client.query(`TRUNCATE TABLE ${table}`);
                      await bulkUpsert(client, table, data[table]);
                  }
              }
          }
          
          // 6. RESTORE WORKSPACE SETTINGS & API KEYS
          if (selected.settings !== false && data.workspaceSettings && typeof data.workspaceSettings === 'object') {
              let currentSettings = {};
              try {
                  const settingsRes = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
                  if (settingsRes.rows.length > 0 && settingsRes.rows[0].data) {
                      currentSettings = settingsRes.rows[0].data;
                  }
              } catch (err) {}
              if (!currentSettings || typeof currentSettings !== 'object') {
                  currentSettings = {};
              }

              const mergedSettings = mode === 'merge' 
                  ? { ...currentSettings, ...data.workspaceSettings } 
                  : { ...data.workspaceSettings };
                  
              const keysToCheck = ['aviationStackApiKey', 'aeroDataBoxApiKey', 'aeroDataBoxEndpoint', 'openAipApiKey', 'brandfetchApiKey'];
              delete mergedSettings.configuredKeys;
              dropObsoleteSettings(mergedSettings);
              keysToCheck.forEach(k => {
                  if (mergedSettings[k] === SECRET_MASK) delete mergedSettings[k]; // masked values are never real keys
                  if (!mergedSettings[k] && currentSettings && currentSettings[k]) {
                      mergedSettings[k] = currentSettings[k];
                  }
              });

              await client.query(
                  `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                  [JSON.stringify(mergedSettings)]
              );
          }
          
          invalidateSecretsCache();
          return { success: true, mode, selected };
      }));
      res.status(202).json({ jobId, status: 'Processing' });
  });

  app.post('/api/wipe', requireAdmin, async (req, res) => {
      try {
          await withTransaction(async (client) => {
              const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited', 'settings'];
              for (const table of tables) {
                  await client.query(`TRUNCATE TABLE ${table} CASCADE`);
              }
          });
          res.json({ success: true });
      } catch (err) {
          sendError(res, err, 500, 'Failed to wipe database content');
      }
  });

  return { activeJobs };
};
