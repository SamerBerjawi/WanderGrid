'use strict';
// Record store: validation, ownership (SEC-001), optimistic concurrency (REL-005), transactions and the generic
// CRUD handlers behind /api/<collection>. Moved out of server.js unchanged (decision D-07).
const TRANSPORT_MODES = ['Flight', 'Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise', 'Ferry'];

module.exports = function createRecordStore({ pool, sendError, HttpError, EMAIL_PATTERN }) {
  // --- Generic CRUD Handlers & Transactions ---

  async function withTransaction(callback) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
        
        const isRetryable = err.code === '40001' || err.code === '40P01';
        if (isRetryable && attempt < maxRetries) {
          console.warn(`Database transaction retryable error ${err.code}, retrying attempt ${attempt}...`);
          await new Promise(resolve => setTimeout(resolve, 50 * attempt));
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
  }

  // --- Request validation (SEC-012, REL-011) ---
  // Every collection write is checked for shape before it is stored, so one malformed record can't
  // break readers (calendar feed, trip page) and clients can't smuggle oversized documents.
  const RECORD_ID_PATTERN = /^[^\s/\\?#]{1,200}$/;
  const ISO_DAY_OR_EMPTY = /^(\d{4}-\d{2}-\d{2}([T ].*)?)?$/;
  const MAX_RECORD_BYTES = { users: 2 * 1024 * 1024, default: 1024 * 1024 };
  const MAX_AVATAR_CHARS = Math.ceil((1024 * 1024 * 4) / 3) + 64; // ~1 MB decoded
  const AVATAR_PATTERN = /^(data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+|https:\/\/\S+)?$/;

  const isValidDayOrEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && ISO_DAY_OR_EMPTY.test(v) && (v === '' || !isNaN(new Date(v.slice(0, 10)).getTime())));
  const isArrayOrMissing = (v) => v === undefined || v === null || Array.isArray(v);
  const isStringOrMissing = (v, max = 2000) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);

  const RECORD_RULES = {
      trips: (r) => {
          if (!isStringOrMissing(r.name, 500)) return 'name must be text (max 500 characters)';
          if (!isValidDayOrEmpty(r.startDate) || !isValidDayOrEmpty(r.endDate)) return 'startDate/endDate must be YYYY-MM-DD dates';
          for (const field of ['participants', 'transports', 'accommodations', 'activities', 'locations', 'packingList', 'expenses']) {
              if (!isArrayOrMissing(r[field])) return `${field} must be a list`;
          }
          if (Array.isArray(r.participants) && !r.participants.every(p => typeof p === 'string')) return 'participants must be user ids';
          if (r.privacy !== undefined && r.privacy !== null && !['Private', 'Public', 'Shared'].includes(r.privacy)) return 'privacy must be Private, Public or Shared';
          if (r.intent !== undefined && r.intent !== null && !['planned', 'confirmed', 'cancelled'].includes(r.intent)) return 'intent must be planned, confirmed or cancelled';
          return null;
      },
      flights: (r) => {
          if (!isValidDayOrEmpty(r.departureDate) || !isValidDayOrEmpty(r.arrivalDate)) return 'departureDate/arrivalDate must be YYYY-MM-DD dates';
          for (const field of ['origin', 'destination', 'provider', 'identifier', 'mode']) {
              if (!isStringOrMissing(r[field], 500)) return `${field} must be text`;
          }
          if (r.mode !== undefined && r.mode !== null && r.mode !== '' && !TRANSPORT_MODES.includes(r.mode)) return `mode must be one of ${TRANSPORT_MODES.join(', ')}`;
          return null;
      },
      visited: (r) => (!isStringOrMissing(r.type, 50) || !isStringOrMissing(r.code, 100) ? 'type/code must be text' : null),
      configs: (r) => (!isArrayOrMissing(r.holidays) ? 'holidays must be a list' : null),
      users: (r) => {
          if (!isStringOrMissing(r.name, 200)) return 'name must be text (max 200 characters)';
          if (r.email !== undefined && r.email !== null && (typeof r.email !== 'string' || (r.email && !EMAIL_PATTERN.test(r.email.trim())))) return 'email is not valid';
          if (r.profilePicture !== undefined && r.profilePicture !== null) {
              if (typeof r.profilePicture !== 'string' || r.profilePicture.length > MAX_AVATAR_CHARS || !AVATAR_PATTERN.test(r.profilePicture)) {
                  return 'profilePicture must be a PNG, JPEG, WebP or GIF image under 1 MB';
              }
          }
          return null;
      },
  };

  function validateRecord(table, record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return 'Record must be a JSON object';
      if (typeof record.id !== 'string' || !RECORD_ID_PATTERN.test(record.id)) return 'Record id must be 1–200 characters without spaces or slashes';
      const limit = MAX_RECORD_BYTES[table] || MAX_RECORD_BYTES.default;
      if (Buffer.byteLength(JSON.stringify(record)) > limit) return `Record is too large (max ${Math.round(limit / 1024)} KB)`;
      const rule = RECORD_RULES[table];
      return rule ? rule(record) : null;
  }

  const assertValidRecords = (table, records) => {
      for (const record of records) {
          const problem = validateRecord(table, record);
          if (problem) throw new HttpError(400, `Invalid ${table} record${record && typeof record.id === 'string' ? ` "${record.id.slice(0, 60)}"` : ''}: ${problem}`);
      }
  };

  // --- Record ownership (SEC-001) ---
  // Trips: readable by participants (or anyone when Public), writable by participants; admins see all.
  // Flights / land journeys / atlas records: a shared household log that everyone can read, but only
  // the record's owner (ownerId) or an admin may change; records without an owner are admin-managed.
  const normKey = (v) => String(v ?? '').toLowerCase().trim();
  const isAdminUser = (user) => user?.role === 'Admin';
  const isTripParticipant = (trip, user) => {
      const keys = new Set([user.id, user.email].filter(Boolean).map(normKey));
      return Array.isArray(trip?.participants) && trip.participants.some(p => keys.has(normKey(p)));
  };
  const OWNERSHIP = {
      trips: {
          canRead: (trip, user) => isAdminUser(user) || trip.privacy === 'Public' || isTripParticipant(trip, user),
          canWrite: (trip, user) => isAdminUser(user) || isTripParticipant(trip, user),
          // A new trip always includes its creator, so they can't lock themselves out of it.
          // The creator is recorded (F-18). A new trip also includes its creator, so they can't lock themselves out.
          prepareNew: (trip, user) => {
              const withCreator = { ...trip, createdBy: user.id };
              return (isAdminUser(user) || isTripParticipant(trip, user))
                  ? withCreator
                  : { ...withCreator, participants: [...(Array.isArray(trip.participants) ? trip.participants : []), user.id] };
          },
          // Any participant may edit a trip, but only its creator or an admin may change who is on it or its privacy.
          // Trips saved before createdBy existed have no creator, so every participant stays a co-owner of those.
          prepareUpdate: (incoming, existing, user) => {
              const next = existing.createdBy ? { ...incoming, createdBy: existing.createdBy } : incoming;
              if (existing.createdBy && user && !isAdminUser(user) && user.id !== existing.createdBy) {
                  const ids = (t) => (Array.isArray(t.participants) ? t.participants : []).map(normKey).sort().join('|');
                  if (ids(incoming) !== ids(existing) || (incoming.privacy || 'Private') !== (existing.privacy || 'Private')) {
                      throw new HttpError(403, 'Only the person who created this trip can change who is on it or its privacy');
                  }
              }
              return next;
          },
      },
      flights: {
          canRead: () => true,
          canWrite: (rec, user) => isAdminUser(user) || (!!rec.ownerId && rec.ownerId === user.id),
          // A leg without a mode is a flight (F-05); the mode is always stored so every reader agrees.
          prepareNew: (rec, user) => ({ ...rec, mode: rec.mode || 'Flight', ownerId: user.id }),
          prepareUpdate: (incoming, existing) => ({ ...incoming, mode: incoming.mode || 'Flight', ownerId: existing.ownerId }),
      },
  };
  // Atlas entries follow the same ownership rule as flights, without the flight-only mode default.
  OWNERSHIP.visited = {
      ...OWNERSHIP.flights,
      prepareNew: (rec, user) => ({ ...rec, ownerId: user.id }),
      prepareUpdate: (incoming, existing) => ({ ...incoming, ownerId: existing.ownerId }),
  };

  const forbidden = () => new HttpError(403, 'You do not have permission to change this record');

  // --- Optimistic concurrency (REL-005) ---
  // Every stored record carries an integer `version`. A write that names a version must match the
  // stored one (otherwise someone else changed it: 409); every successful write increments it.
  // Writes without a version (older clients, imports) are accepted and still bump it.
  const conflict = (table, id) => new HttpError(409, `This ${table === 'trips' ? 'trip' : 'record'} was changed by someone else. Reload to see the latest version, then try again.`);
  function withNextVersion(table, incoming, existing) {
      const current = Number(existing?.version) || 0;
      if (existing && incoming.version !== undefined && incoming.version !== null && Number(incoming.version) !== current) {
          throw conflict(table, incoming.id);
      }
      return { ...incoming, version: current + 1, updatedAt: new Date().toISOString() };
  }

  // Upserts records after checking the caller may change each existing one (new ones get an owner).
  async function guardedBulkUpsert(client, table, items, user) {
      if (!Array.isArray(items)) throw new HttpError(400, 'Body must be a list of records');
      assertValidRecords(table, items);
      const policy = OWNERSHIP[table];
      if (!policy) return bulkUpsert(client, table, items);
      const ids = items.filter(i => i && i.id).map(i => i.id);
      const existing = new Map();
      for (const id of ids) {
          const { rows } = await client.query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
          if (rows.length > 0) existing.set(id, rows[0].data);
          else if (table === 'trips') await client.query('DELETE FROM trip_shares WHERE trip_id = $1', [id]); // never reuse a link left by an older trip with this id
      }
      const prepared = items.filter(i => i && i.id).map(item => {
          const prev = existing.get(item.id);
          if (!prev) return withNextVersion(table, policy.prepareNew(item, user), null);
          if (!policy.canWrite(prev, user)) throw forbidden();
          return withNextVersion(table, policy.prepareUpdate(item, prev, user), prev);
      });
      await bulkUpsert(client, table, prepared);
      return prepared;
  }

  // { id: version } map so clients can continue editing without tripping their own version checks.
  const versionMap = (records) => Object.fromEntries((records || []).map(r => [r.id, r.version]));

  async function guardedDelete(client, table, id, user) {
      const policy = OWNERSHIP[table];
      if (policy) {
          const { rows } = await client.query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
          if (rows.length > 0 && !policy.canWrite(rows[0].data, user)) throw forbidden();
      }
      if (table === 'trips') await client.query('DELETE FROM trip_shares WHERE trip_id = $1', [id]);
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }

  const getResources = (table) => async (req, res) => {
    try {
      const { limit, offset, status, tripId, after, before, privacy, sort } = req.query;
      const conditions = [];
      const params = [];

      if (status) {
        params.push(status);
        conditions.push(`(data->>'status') = $${params.length}`);
      }
      if (privacy) {
        params.push(privacy);
        conditions.push(`(data->>'privacy') = $${params.length}`);
      }
      if (tripId) {
        params.push(tripId);
        conditions.push(`(data->>'tripId') = $${params.length}`);
      }
      if (after) {
        params.push(after);
        if (table === 'flights') {
          conditions.push(`(data->>'departureDate') >= $${params.length}`);
        } else {
          conditions.push(`(data->>'startDate') >= $${params.length}`);
        }
      }
      if (before) {
        params.push(before);
        if (table === 'flights') {
          conditions.push(`(data->>'departureDate') <= $${params.length}`);
        } else {
          conditions.push(`(data->>'endDate') <= $${params.length}`);
        }
      }

      // Narrow what is read to what the caller could see (audit F-17): a member's request no longer pulls every trip
      // into memory. The SQL is deliberately a superset of canRead (a case-folded text match on the participants);
      // the exact check below still decides, so this can only drop rows that canRead would drop as well.
      if (table === 'trips' && req.user && !isAdminUser(req.user)) {
        const keys = [...new Set([req.user.id, req.user.email].filter(Boolean).map(normKey))];
        // LIKE wildcards inside an id or email are rare; then the prefilter is skipped and the exact check does all the work.
        if (keys.length > 0 && keys.every(k => !/[%_\\]/.test(k))) {
          const likes = keys.map(k => { params.push(`%${k}%`); return `lower(data->>'participants') LIKE $${params.length}`; });
          conditions.push(`((data->>'privacy') = 'Public' OR ${likes.join(' OR ')})`);
        }
      }

      let query = `SELECT data FROM ${table}`;
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      if (sort === 'desc') {
        if (table === 'flights') {
          query += ` ORDER BY (data->>'departureDate') DESC`;
        } else if (table === 'trips' || table === 'events') {
          query += ` ORDER BY (data->>'startDate') DESC`;
        }
      } else if (sort === 'asc') {
        if (table === 'flights') {
          query += ` ORDER BY (data->>'departureDate') ASC`;
        } else if (table === 'trips' || table === 'events') {
          query += ` ORDER BY (data->>'startDate') ASC`;
        }
      }

      const parsedLimit = parseInt(limit, 10);
      const parsedOffset = parseInt(offset, 10);
      const hasLimit = !isNaN(parsedLimit) && parsedLimit > 0;
      const hasOffset = !isNaN(parsedOffset) && parsedOffset >= 0;
      const policy = OWNERSHIP[table];

      // With a read policy, who may see a record is decided in code, so the page is cut after
      // filtering. Cutting in SQL first returned short or shifted pages for non-admins.
      if (!policy) {
        if (hasLimit) { params.push(parsedLimit); query += ` LIMIT $${params.length}`; }
        if (hasOffset) { params.push(parsedOffset); query += ` OFFSET $${params.length}`; }
      }

      const { rows } = await pool.query(query, params);
      let records = rows.map(r => r.data);
      if (policy) {
        records = records.filter(r => policy.canRead(r, req.user));
        const start = hasOffset ? parsedOffset : 0;
        if (hasOffset || hasLimit) records = records.slice(start, hasLimit ? start + parsedLimit : undefined);
      }
      res.json(records);
    } catch (err) {
      sendError(res, err, 500, `Failed to retrieve ${table}`);
    }
  };

  /**
   * High-performance multi-row bulk upsert helper
   */
  async function bulkUpsert(client, table, items, chunkSize = 500) {
    if (!items || !Array.isArray(items) || items.length === 0) return 0;
    // Postgres rejects a multi-row upsert that touches the same id twice; the last copy wins.
    items = Array.from(new Map(items.filter(item => item && item.id).map(item => [item.id, item])).values());
    let count = 0;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).filter(item => item && item.id);
      if (chunk.length === 0) continue;
      const values = [];
      const params = [];
      chunk.forEach((item, idx) => {
        values.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`);
        params.push(item.id, JSON.stringify(item));
      });
      await client.query(`
        INSERT INTO ${table} (id, data)
        VALUES ${values.join(', ')}
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `, params);
      count += chunk.length;
    }
    return count;
  }

  const createResource = (table) => async (req, res) => {
    const resource = req.body;
    if (!resource || typeof resource !== 'object' || !resource.id) return res.status(400).json({ error: 'ID is required' });
    let created = resource;
    const problem = validateRecord(table, resource);
    if (problem) return res.status(400).json({ error: `Invalid ${table} record: ${problem}` });
    
    try {
      await withTransaction(async (client) => {
        // Creating never overwrites an existing record; updates go through PUT /:id.
        const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [resource.id]);
        if (rows.length > 0) throw new HttpError(409, `A record with id ${resource.id} already exists`);
        if (table === 'trips') await client.query('DELETE FROM trip_shares WHERE trip_id = $1', [resource.id]);
        created = withNextVersion(table, OWNERSHIP[table] ? OWNERSHIP[table].prepareNew(resource, req.user) : resource, null);
        await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [created.id, JSON.stringify(created)]);
      });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err.code === '23505') return res.status(409).json({ error: `A record with id ${resource.id} already exists` });
      sendError(res, err, 500, `Failed to create ${table}`);
    }
  };

  const updateResource = (table) => async (req, res) => {
    const { id } = req.params;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be a JSON object' });
    }
    // The URL decides which record is written; a different body id is ignored (REL-011).
    const resource = { ...req.body, id };
    
    try {
      const saved = await withTransaction(async (client) => {
        const [record] = await guardedBulkUpsertOne(client, table, resource, req.user);
        return record;
      });
      res.json(saved);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      sendError(res, err, 500, `Failed to update ${table}`);
    }
  };

  // Single-record variant of guardedBulkUpsert that returns the stored record.
  async function guardedBulkUpsertOne(client, table, record, user) {
    assertValidRecords(table, [record]);
    const policy = OWNERSHIP[table];
    let prepared = record;
    const { rows } = await client.query(`SELECT data FROM ${table} WHERE id = $1`, [record.id]);
    const existing = rows[0]?.data || null;
    if (!existing && table === 'trips') await client.query('DELETE FROM trip_shares WHERE trip_id = $1', [record.id]);
    if (policy) {
      if (!existing) prepared = policy.prepareNew(record, user);
      else if (!policy.canWrite(existing, user)) throw forbidden();
      else prepared = policy.prepareUpdate(record, existing, user);
    }
    prepared = withNextVersion(table, prepared, existing);
    await client.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [prepared.id, JSON.stringify(prepared)]
    );
    return [prepared];
  }

  const deleteResource = (table) => async (req, res) => {
    const { id } = req.params;
    try {
      await withTransaction(async (client) => {
        await guardedDelete(client, table, id, req.user);
      });
      res.json({ success: true });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      sendError(res, err, 500, `Failed to delete ${table}`);
    }
  };

  return { withTransaction, validateRecord, isTripParticipant, OWNERSHIP, withNextVersion, guardedBulkUpsert, versionMap, guardedDelete, getResources, bulkUpsert, createResource, updateResource, deleteResource };
};
