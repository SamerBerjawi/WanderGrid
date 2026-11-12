'use strict';
// Routes for the record collections (trips, events, entitlements, configs, flights, visited) and /api/batch.
// Moved out of server.js unchanged (decision D-07). Registration order is the order of the original file.
module.exports = function registerRecordRoutes(app, { store, requireAdmin, sharedTrip, sendError, pool, HttpError }) {
  const { withTransaction, OWNERSHIP, guardedBulkUpsert, versionMap, guardedDelete, getResources, createResource, updateResource, deleteResource } = store;

  // Trips
  // Applies a multi-record change (e.g. bundling flights into a trip, moving a flight) in ONE
  // transaction, so a failure part-way can never leave flights deleted but not re-saved.
  const BATCH_KEYS = { upsertTrips: 'trips', deleteTrips: 'trips', upsertFlights: 'flights', deleteFlights: 'flights' };
  app.post('/api/batch', async (req, res) => {
      const body = req.body || {};
      for (const key of Object.keys(BATCH_KEYS)) {
          const list = body[key];
          if (list === undefined) continue;
          const isDelete = key.startsWith('delete');
          const valid = Array.isArray(list) && list.every(item => isDelete
              ? typeof item === 'string' && item
              : item && typeof item === 'object' && typeof item.id === 'string' && item.id);
          if (!valid) return res.status(400).json({ error: `${key} must be an array of ${isDelete ? 'ids' : 'records with an id'}` });
      }
      const versions = {};
      try {
          await withTransaction(async (client) => {
              if (body.upsertTrips) versions.trips = versionMap(await guardedBulkUpsert(client, 'trips', body.upsertTrips, req.user));
              if (body.upsertFlights) versions.flights = versionMap(await guardedBulkUpsert(client, 'flights', body.upsertFlights, req.user));
              for (const id of body.deleteTrips || []) await guardedDelete(client, 'trips', id, req.user);
              for (const id of body.deleteFlights || []) await guardedDelete(client, 'flights', id, req.user);
          });
          res.json({ success: true, versions });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to apply changes');
      }
  });

  const shareHandlers = sharedTrip.createHandlers({ pool, canWrite: OWNERSHIP.trips.canWrite, sendError });
  app.get('/api/public/trips/:token', shareHandlers.publicTrip);
  app.get('/api/trips/:id/share', shareHandlers.status);
  app.post('/api/trips/:id/share', shareHandlers.create);
  app.delete('/api/trips/:id/share', shareHandlers.revoke);
  app.get('/api/trips', getResources('trips'));
  app.post('/api/trips', createResource('trips'));
  app.post('/api/trips/bulk', async (req, res) => {
      const list = req.body;
      if (!Array.isArray(list)) {
          return res.status(400).json({ error: 'Body must be an array of trips' });
      }
      try {
          let count = 0;
          let versions = {};
          await withTransaction(async (client) => {
              const saved = await guardedBulkUpsert(client, 'trips', list, req.user);
              count = saved.length;
              versions = versionMap(saved);
          });
          res.status(201).json({ success: true, count, versions });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to perform bulk trip upsert');
      }
  });
  app.put('/api/trips/:id', updateResource('trips'));
  app.delete('/api/trips/:id', deleteResource('trips'));

  // Events (Custom Events)
  app.get('/api/events', getResources('events'));
  app.post('/api/events', requireAdmin, createResource('events'));
  app.put('/api/events/:id', requireAdmin, updateResource('events'));
  app.delete('/api/events/:id', requireAdmin, deleteResource('events'));

  // Entitlements
  app.get('/api/entitlements', getResources('entitlements'));
  app.post('/api/entitlements', requireAdmin, createResource('entitlements'));
  app.put('/api/entitlements/:id', requireAdmin, updateResource('entitlements'));
  app.delete('/api/entitlements/:id', requireAdmin, deleteResource('entitlements'));

  // Configs (Saved Holiday Configs)
  app.get('/api/configs', getResources('configs'));
  app.post('/api/configs', requireAdmin, createResource('configs'));
  app.put('/api/configs/:id', requireAdmin, updateResource('configs'));
  app.delete('/api/configs/:id', requireAdmin, deleteResource('configs'));

  // Flights
  app.get('/api/flights', getResources('flights'));
  app.post('/api/flights', createResource('flights'));
  app.post('/api/flights/bulk', async (req, res) => {
      const list = req.body;
      if (!Array.isArray(list)) {
          return res.status(400).json({ error: 'Body must be an array of flights' });
      }
      try {
          let count = 0;
          let versions = {};
          await withTransaction(async (client) => {
              const saved = await guardedBulkUpsert(client, 'flights', list, req.user);
              count = saved.length;
              versions = versionMap(saved);
          });
          res.status(201).json({ success: true, count, versions });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to perform bulk flight upsert');
      }
  });
  app.put('/api/flights/:id', updateResource('flights'));
  app.delete('/api/flights/:id', deleteResource('flights'));

  // Visited Countries & Cities
  app.get('/api/visited', getResources('visited'));
  app.post('/api/visited', createResource('visited'));
  app.post('/api/visited/bulk', async (req, res) => {
      const list = req.body;
      if (!Array.isArray(list)) {
          return res.status(400).json({ error: 'Body must be an array of visited items' });
      }
      try {
          let count = 0;
          let versions = {};
          await withTransaction(async (client) => {
              const saved = await guardedBulkUpsert(client, 'visited', list, req.user);
              count = saved.length;
              versions = versionMap(saved);
          });
          res.status(201).json({ success: true, count, versions });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to perform bulk visited upsert');
      }
  });
  // One atlas merge step in a single transaction: write the surviving records, then remove the ones folded
  // into them. All or nothing, so a failed step leaves both the survivors and the duplicates as they were.
  const MAX_VISITED_MERGE = 500;
  app.post('/api/visited/merge', async (req, res) => {
      const { upserts = [], deleteIds = [] } = req.body || {};
      if (!Array.isArray(upserts) || !Array.isArray(deleteIds) || deleteIds.some(id => typeof id !== 'string')) {
          return res.status(400).json({ error: 'upserts and deleteIds must be lists' });
      }
      if (upserts.length + deleteIds.length > MAX_VISITED_MERGE) {
          return res.status(413).json({ error: `At most ${MAX_VISITED_MERGE} records per merge step` });
      }
      try {
          let versions = {};
          await withTransaction(async (client) => {
              const saved = upserts.length > 0 ? await guardedBulkUpsert(client, 'visited', upserts, req.user) : [];
              versions = versionMap(saved);
              const keep = new Set(upserts.map(u => u && u.id));
              for (const id of deleteIds) {
                  if (!keep.has(id)) await guardedDelete(client, 'visited', id, req.user);
              }
          });
          res.json({ success: true, upserted: upserts.length, deleted: deleteIds.length, versions });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to merge visited records');
      }
  });
  app.put('/api/visited/:id', updateResource('visited'));
  app.delete('/api/visited/:id', deleteResource('visited'));
};
