'use strict';
// Sign-in, sign-up, demo, password reset, sessions and the member roster (/api/auth/*, /api/users*).
// Moved out of server.js unchanged (decision D-07). Registration order is the order of the original file.
const crypto = require('crypto');

module.exports = function registerAuthRoutes(app, {
  pool, sendError, requireAdmin, signSession, toPublicUser, hashPassword, verifyPassword, validatePasswordPolicy,
  safeEqualHex, HASH_PREFIX, EMAIL_PATTERN, BoundedMap, HttpError, readWorkspaceSettings,
  withTransaction, validateRecord, isTripParticipant, withNextVersion, bulkUpsert,
}) {
  // Authentication
  // Per-account backoff: repeated wrong passwords for one email pause that account's sign-in, wherever the
  // requests come from, without affecting anyone else.
  const LOGIN_FAIL_LIMIT = 10;
  const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
  const loginFailures = new BoundedMap(5000);
  const loginKey = (email) => String(email).trim().toLowerCase();
  const loginLocked = (email) => {
      const entry = loginFailures.get(loginKey(email));
      return Boolean(entry && entry.resetAt > Date.now() && entry.count >= LOGIN_FAIL_LIMIT);
  };
  const noteLoginFailure = (email) => {
      const key = loginKey(email);
      const entry = loginFailures.get(key);
      loginFailures.set(key, entry && entry.resetAt > Date.now()
          ? { count: entry.count + 1, resetAt: entry.resetAt }
          : { count: 1, resetAt: Date.now() + LOGIN_FAIL_WINDOW_MS });
  };

  app.post('/api/auth/login', async (req, res) => {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
          return res.status(400).json({ error: 'Email and password are required' });
      }
      if (loginLocked(email)) {
          return res.status(429).json({ error: 'Too many failed sign-in attempts for this account. Try again in a few minutes.' });
      }
      try {
          const { rows } = await pool.query(
              `SELECT data FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`,
              [email.trim()]
          );
          if (rows.length === 0) {
              noteLoginFailure(email);
              return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          const user = rows[0].data;
          const isPasswordValid = await verifyPassword(password, user.password);
          if (!isPasswordValid) {
              noteLoginFailure(email);
              return res.status(401).json({ error: 'Invalid credentials' });
          }
          loginFailures.delete(loginKey(email));
          if (!user.password.startsWith(HASH_PREFIX)) {
              // Upgrade legacy plaintext / old-format hashes now that we know the password.
              user.password = await hashPassword(password);
              await pool.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(user)]);
          }
          
          const responseUser = toPublicUser(user);
          
          const token = signSession(user);
          
          res.json({ user: responseUser, token });
      } catch (err) {
          sendError(res, err, 500, 'Authentication failed');
      }
  });

  // Server-side defaults for new accounts; clients cannot choose id, role or other privileged fields.
  const newUserRecord = ({ id, name, email, role, password }) => {
      const year = new Date().getFullYear();
      const allowance = role === 'Admin' ? 30 : 25;
      return {
          id, name, email, role, password, version: 1,
          leaveBalance: allowance, takenLeave: 0, allowance, lieuBalance: 0,
          activeYears: [year, year + 1, year + 2], policies: [], holidayConfigIds: []
      };
  };

  // Public sign-up is closed once the first admin exists, unless an admin turns it on in Settings or the host
  // sets ALLOW_SIGNUP=true as the default for workspaces that never chose (D-01).
  const signupOpen = (settings) => (typeof settings.allowSelfRegistration === 'boolean'
      ? settings.allowSelfRegistration
      : process.env.ALLOW_SIGNUP === 'true');

  // Public: lets the sign-in screen decide between first-run setup, sign-in and sign-up.
  app.get('/api/auth/setup-status', async (req, res) => {
      try {
          const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM users`);
          const settings = await readWorkspaceSettings();
          res.json({
              needsSetup: Number(rows[0].count) === 0,
              allowSelfRegistration: signupOpen(settings)
          });
      } catch (err) {
          sendError(res, err, 500, 'Failed to read setup status');
      }
  });

  app.post('/api/auth/register', async (req, res) => {
      const { name, email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
          return res.status(400).json({ error: 'Email and password are required' });
      }
      const cleanEmail = email.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(cleanEmail)) {
          return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      const policyError = validatePasswordPolicy(password);
      if (policyError) return res.status(400).json({ error: policyError });
      const cleanName = (typeof name === 'string' ? name.trim() : '').slice(0, 200) || cleanEmail.split('@')[0];
      try {
          const passwordHash = await hashPassword(password);
          const user = await withTransaction(async (client) => {
              const { rows: countRows } = await client.query(`SELECT COUNT(*) AS count FROM users`);
              const isFirstUser = Number(countRows[0].count) === 0;
              if (!isFirstUser) {
                  const settings = await readWorkspaceSettings(client);
                  if (!signupOpen(settings)) {
                      throw new HttpError(403, 'Self-registration is disabled. Ask an administrator to add you.');
                  }
              }
              const { rows: existing } = await client.query(
                  `SELECT 1 FROM users WHERE id = $1 OR LOWER(data->>'email') = $1 LIMIT 1`,
                  [cleanEmail]
              );
              if (existing.length > 0) {
                  throw new HttpError(409, 'An account with this email already exists');
              }
              // The very first account becomes the workspace administrator; everyone else is a Partner.
              const record = newUserRecord({ id: cleanEmail, name: cleanName, email: cleanEmail, role: isFirstUser ? 'Admin' : 'Partner', password: passwordHash });
              await client.query(`INSERT INTO users (id, data) VALUES ($1, $2)`, [record.id, JSON.stringify(record)]);
              return record;
          });
          const responseUser = toPublicUser(user);

          const token = signSession(user);

          res.status(201).json({ user: responseUser, token });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Registration failed');
      }
  });

  // --- "Auto-Setup & Demo Run" ---
  // On a fresh install the demo creates the first (Admin) account; on a populated workspace it is only
  // available when public sign-up is open, and then signs in a Partner demo account that can see no
  // more than any self-registered user. Demo accounts have a random, never-shared password.
  const DEMO_EMAIL = 'demo@wandergrid.app';
  const demoSampleTrip = (ownerId) => ({
      id: `trip-demo-${crypto.randomBytes(4).toString('hex')}`,
      name: 'Grand Intercontinental Expedition',
      location: 'Paris, France',
      startDate: '2025-06-01',
      endDate: '2025-06-25',
      status: 'Past',
      privacy: 'Private',
      participants: [ownerId],
      transports: [
          { id: `tr-demo-1-${ownerId}`, itineraryId: 'itin-demo-1', type: 'One-Way', mode: 'Flight', provider: 'Air France', identifier: 'AF007', origin: 'JFK', destination: 'CDG', originLat: 40.6413, originLng: -73.7781, destLat: 49.0097, destLng: 2.5479, departureDate: '2025-06-01', departureTime: '18:30', arrivalDate: '2025-06-02', arrivalTime: '08:00', travelClass: 'Business' },
          { id: `tr-demo-2-${ownerId}`, itineraryId: 'itin-demo-2', type: 'One-Way', mode: 'Train', provider: 'Eurostar', identifier: 'ES9310', origin: 'Paris', destination: 'Amsterdam', originLat: 48.8566, originLng: 2.3522, destLat: 52.3676, destLng: 4.9041, departureDate: '2025-06-06', departureTime: '10:20', arrivalDate: '2025-06-06', arrivalTime: '13:45', travelClass: 'First' },
          { id: `tr-demo-3-${ownerId}`, itineraryId: 'itin-demo-3', type: 'One-Way', mode: 'Flight', provider: 'KLM', identifier: 'KL861', origin: 'AMS', destination: 'NRT', originLat: 52.3105, originLng: 4.7683, destLat: 35.772, destLng: 140.3929, departureDate: '2025-06-12', departureTime: '14:40', arrivalDate: '2025-06-13', arrivalTime: '08:50', travelClass: 'Economy' }
      ]
  });
  const DEMO_VISITED = [
      { id: 'country_US', type: 'country', code: 'US', name: 'United States', residenceStatus: 'lived_current' },
      { id: 'country_FR', type: 'country', code: 'FR', name: 'France', residenceStatus: 'visited' },
      { id: 'country_NL', type: 'country', code: 'NL', name: 'Netherlands', residenceStatus: 'visited' },
      { id: 'country_JP', type: 'country', code: 'JP', name: 'Japan', residenceStatus: 'visited' },
      { id: 'country_GB', type: 'country', code: 'GB', name: 'United Kingdom', residenceStatus: 'lived_past' }
  ];

  app.post('/api/auth/demo', async (req, res) => {
      try {
          const user = await withTransaction(async (client) => {
              const { rows: countRows } = await client.query(`SELECT COUNT(*) AS count FROM users`);
              const isFresh = Number(countRows[0].count) === 0;
              // Demo access is only for an empty workspace; a populated one never hands out anonymous sessions.
              if (!isFresh) throw new HttpError(403, 'Demo access is turned off for this workspace.');
              let { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [DEMO_EMAIL]);
              let demoUser = rows[0]?.data;
              if (!demoUser) {
                  demoUser = newUserRecord({
                      id: DEMO_EMAIL, name: 'Demo Traveller', email: DEMO_EMAIL,
                      role: isFresh ? 'Admin' : 'Partner',
                      password: await hashPassword(crypto.randomBytes(24).toString('hex'))
                  });
                  demoUser.isDemo = true;
                  await client.query(`INSERT INTO users (id, data) VALUES ($1, $2)`, [demoUser.id, JSON.stringify(demoUser)]);
              }
              const { rows: tripRows } = await client.query(`SELECT data FROM trips`);
              if (!tripRows.some(r => isTripParticipant(r.data, demoUser))) {
                  const trip = demoSampleTrip(demoUser.id);
                  await client.query(`INSERT INTO trips (id, data) VALUES ($1, $2)`, [trip.id, JSON.stringify(trip)]);
              }
              // Only an empty workspace gets sample atlas records; never write into a real household's atlas.
              if (isFresh) await bulkUpsert(client, 'visited', DEMO_VISITED.map(v => ({ ...v, ownerId: demoUser.id })));
              return demoUser;
          });
          res.json({ user: toPublicUser(user), token: signSession(user) });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Demo mode is unavailable');
      }
  });

  // --- Password reset (no email service): an admin issues a one-time code, the member redeems it ---
  const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;
  const RESET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const newResetCode = () => {
      const bytes = crypto.randomBytes(10);
      const chars = Array.from(bytes, b => RESET_CODE_ALPHABET[b % RESET_CODE_ALPHABET.length]).join('');
      return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  };
  const normaliseResetCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  app.post('/api/users/:id/reset-code', requireAdmin, async (req, res) => {
      try {
          const result = await withTransaction(async (client) => {
              const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.params.id]);
              if (rows.length === 0) throw new HttpError(404, 'User not found');
              const code = newResetCode();
              const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();
              const updated = { ...rows[0].data, passwordReset: { codeHash: sha256Hex(normaliseResetCode(code)), expiresAt } };
              await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [updated.id, JSON.stringify(updated)]);
              return { code, expiresAt };
          });
          res.json(result);
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to create a reset code');
      }
  });

  // Public: redeem a reset code. Every failure gives the same answer so codes and emails can't be probed.
  app.post('/api/auth/reset-password', async (req, res) => {
      const { email, code, password } = req.body || {};
      const invalid = () => res.status(400).json({ error: 'That reset code is invalid or has expired. Ask an administrator for a new one.' });
      if (typeof email !== 'string' || typeof code !== 'string') return invalid();
      const policyError = validatePasswordPolicy(password);
      if (policyError) return res.status(400).json({ error: policyError });
      try {
          const ok = await withTransaction(async (client) => {
              const { rows } = await client.query(`SELECT data FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`, [email.trim()]);
              const user = rows[0]?.data;
              const reset = user?.passwordReset;
              if (!reset || !reset.codeHash || new Date(reset.expiresAt).getTime() < Date.now()) return false;
              if (!safeEqualHex(reset.codeHash, sha256Hex(normaliseResetCode(code)))) return false;
              const { passwordReset, ...rest } = user;
              const updated = { ...rest, password: await hashPassword(password), tokenVersion: (user.tokenVersion || 0) + 1 };
              await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(updated)]);
              return true;
          });
          if (!ok) return invalid();
          res.json({ success: true });
      } catch (err) {
          sendError(res, err, 500, 'Failed to reset the password');
      }
  });

  // The signed-in user's own record (used to restore a session on page load).
  app.get('/api/auth/me', async (req, res) => {
      try {
          const { rows } = await pool.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
          if (rows.length === 0) return res.status(401).json({ error: 'Session is no longer valid' });
          res.json(toPublicUser(rows[0].data));
      } catch (err) {
          sendError(res, err, 500, 'Failed to load the current user');
      }
  });

  // Ends every session of the current user by bumping their token version.
  app.post('/api/auth/logout', async (req, res) => {
      try {
          await withTransaction(async (client) => {
              const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
              if (rows.length === 0) return;
              const user = { ...rows[0].data, tokenVersion: (rows[0].data.tokenVersion || 0) + 1 };
              await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(user)]);
          });
          res.json({ success: true });
      } catch (err) {
          sendError(res, err, 500, 'Failed to sign out');
      }
  });

  // Users
  app.get('/api/users', async (req, res) => {
      try {
          const { rows } = await pool.query(`SELECT data FROM users`);
          const users = rows.map(r => toPublicUser(r.data)); // never send password hashes
          res.json(users);
      } catch (err) {
          sendError(res, err, 500, 'Failed to fetch users');
      }
  });

  app.post('/api/users', requireAdmin, async (req, res) => {
      const user = req.body;
      const problem = validateRecord('users', user);
      if (problem) return res.status(400).json({ error: `Invalid user: ${problem}` });
      
      try {
          delete user.tokenVersion;
          user.version = 1;
          delete user.calendarToken;
          delete user.passwordReset;
          delete user.passwordResetRequired;
          if (user.password) {
              const policyError = validatePasswordPolicy(user.password);
              if (policyError) return res.status(400).json({ error: policyError });
              user.password = await hashPassword(user.password);
          } else {
              delete user.password;
          }
          await withTransaction(async (client) => {
              const { rows: existing } = await client.query(
                  `SELECT 1 FROM users WHERE id = $1 OR ($2::text IS NOT NULL AND LOWER(data->>'email') = LOWER($2)) LIMIT 1`,
                  [user.id, typeof user.email === 'string' ? user.email.trim() : null]
              );
              if (existing.length > 0) throw new HttpError(409, 'An account with this email already exists');
              await client.query(`INSERT INTO users (id, data) VALUES ($1, $2)`, [user.id, JSON.stringify(user)]);
          });
          res.status(201).json(toPublicUser(user));
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to insert user');
      }
  });

  const countAdmins = async (client) => {
      const { rows } = await client.query(`SELECT COUNT(*) AS count FROM users WHERE data->>'role' = 'Admin'`);
      return Number(rows[0].count);
  };

  // Admins may edit anyone; everyone else may edit only their own profile and never their own role.
  app.put('/api/users/:id', async (req, res) => {
      const { id } = req.params;
      const isAdmin = req.user.role === 'Admin';
      if (!isAdmin && req.user.id !== id) {
          return res.status(403).json({ error: 'You can only edit your own profile' });
      }
      const updatedUser = { ...(req.body || {}), id };
      const problem = validateRecord('users', updatedUser);
      if (problem) return res.status(400).json({ error: `Invalid user: ${problem}` });
      try {
          const saved = await withTransaction(async (client) => {
              const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [id]);
              if (rows.length === 0) throw new HttpError(404, 'User not found');
              const prevUser = rows[0].data;

              Object.assign(updatedUser, withNextVersion('users', updatedUser, prevUser));
              if (!isAdmin) updatedUser.role = prevUser.role;
              if (prevUser.role === 'Admin' && updatedUser.role !== 'Admin' && await countAdmins(client) <= 1) {
                  throw new HttpError(409, 'The workspace needs at least one administrator');
              }
              if (typeof updatedUser.email === 'string' && updatedUser.email.trim().toLowerCase() !== String(prevUser.email || '').toLowerCase()) {
                  const { rows: clash } = await client.query(
                      `SELECT 1 FROM users WHERE id <> $1 AND LOWER(data->>'email') = LOWER($2) LIMIT 1`,
                      [id, updatedUser.email.trim()]
                  );
                  if (clash.length > 0) throw new HttpError(409, 'An account with this email already exists');
              }

              // An empty password keeps the current one; anything else is a new password (never a raw hash).
              if (typeof updatedUser.password !== 'string' || updatedUser.password.trim() === '' || updatedUser.password === prevUser.password) {
                  updatedUser.password = prevUser.password;
              } else {
                  const policyError = validatePasswordPolicy(updatedUser.password);
                  if (policyError) throw new HttpError(400, policyError);
                  updatedUser.password = await hashPassword(updatedUser.password);
              }
              if (!updatedUser.password) delete updatedUser.password;
              // Clients never set the token version; a password or role change signs out other sessions.
              updatedUser.tokenVersion = prevUser.tokenVersion || 0;
              // Server-managed fields are never taken from the client.
              delete updatedUser.passwordResetRequired;
              delete updatedUser.sessionToken;
              if (prevUser.calendarToken) updatedUser.calendarToken = prevUser.calendarToken;
              else delete updatedUser.calendarToken;
              if (prevUser.calendarFeed) updatedUser.calendarFeed = prevUser.calendarFeed;
              else delete updatedUser.calendarFeed;
              // An outstanding reset code survives profile edits but not a password change.
              if (prevUser.passwordReset && updatedUser.password === prevUser.password) updatedUser.passwordReset = prevUser.passwordReset;
              else delete updatedUser.passwordReset;
              if (updatedUser.password !== prevUser.password || updatedUser.role !== prevUser.role) {
                  updatedUser.tokenVersion += 1;
              }
              await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [id, JSON.stringify(updatedUser)]);
              return updatedUser;
          });
          // Editing your own password/role revokes your other sessions; hand this one a fresh token.
          const body = toPublicUser(saved);
          if (id === req.user.id) body.sessionToken = signSession(saved);
          res.json(body);
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to update user');
      }
  });

  app.delete('/api/users/:id', requireAdmin, async (req, res) => {
      const { id } = req.params;
      if (id === req.user.id) {
          return res.status(409).json({ error: "You can't delete your own account" });
      }
      try {
          await withTransaction(async (client) => {
              const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [id]);
              if (rows.length > 0 && rows[0].data.role === 'Admin' && await countAdmins(client) <= 1) {
                  throw new HttpError(409, 'The workspace needs at least one administrator');
              }
              await client.query(`DELETE FROM users WHERE id = $1`, [id]);
          });
          res.json({ success: true });
      } catch (err) {
          if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
          sendError(res, err, 500, 'Failed to delete users');
      }
  });
};
