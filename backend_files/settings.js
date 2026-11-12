'use strict';
// Workspace settings and the third-party secrets stored in them (SEC-010): GET/PUT /api/settings and the secret
// lookup the proxies use. Moved out of server.js unchanged (decision D-07).
module.exports = function registerSettingsRoutes(app, {
  requireAdmin, sendError, withTransaction, readWorkspaceSettings,
}) {
  // Settings (Singleton)
  // --- Workspace settings & third-party secrets (SEC-010) ---
  // Paid API keys are write-only for clients: GET returns a mask when a key is set, PUT keeps the
  // stored key when it receives the mask, and the /api/proxy/* routes inject keys server-side.
  // (The Brandfetch key is a public client identifier used in image URLs and stays readable.)
  const SECRET_SETTING_KEYS = ['aviationStackApiKey', 'aeroDataBoxApiKey', 'openAipApiKey'];
  const SECRET_MASK = '••••••••';
  const SECRET_ENV_FALLBACKS = {
      aviationStackApiKey: 'INTEGRATIONS_AVIATION_STACK_KEY',
      aeroDataBoxApiKey: 'INTEGRATIONS_AERO_DATA_BOX_KEY',
      openAipApiKey: 'INTEGRATIONS_OPEN_AIP_KEY',
  };
  // Keys of integrations that were removed. Workspaces and backups made before may still carry them: they are
  // ignored, never sent to a client, and dropped the next time the settings are saved.
  const OBSOLETE_SETTING_KEYS = ['googleGeminiApiKey', 'cartoApiKey'];
  const dropObsoleteSettings = (obj) => {
      if (obj && typeof obj === 'object') for (const k of OBSOLETE_SETTING_KEYS) delete obj[k];
      return obj;
  };

  const maskSettings = (settings) => {
      const masked = dropObsoleteSettings({ ...settings });
      const configuredKeys = {};
      const keySources = {};
      for (const key of SECRET_SETTING_KEYS) {
          const hasKey = Boolean(settings[key] || process.env[SECRET_ENV_FALLBACKS[key]]);
          configuredKeys[key] = hasKey;
          // Where the key comes from: saved in the workspace, or provided by the host's environment.
          keySources[key] = settings[key] ? 'workspace' : hasKey ? 'env' : 'none';
          masked[key] = hasKey ? SECRET_MASK : '';
      }
      masked.configuredKeys = configuredKeys;
      masked.keySources = keySources;
      return masked;
  };

  let secretsCache = { value: null, expiresAt: 0 };
  const invalidateSecretsCache = () => { secretsCache = { value: null, expiresAt: 0 }; };
  async function workspaceSecret(key) {
      if (!secretsCache.value || secretsCache.expiresAt < Date.now()) {
          secretsCache = { value: await readWorkspaceSettings(), expiresAt: Date.now() + 30000 };
      }
      return String(secretsCache.value[key] || process.env[SECRET_ENV_FALLBACKS[key]] || '').trim();
  }

  app.get('/api/settings', async (req, res) => {
      try {
          res.json(maskSettings(await readWorkspaceSettings()));
      } catch (err) {
          sendError(res, err, 500, 'Failed to retrieve workspace settings');
      }
  });

  app.put('/api/settings', requireAdmin, async (req, res) => {
      try {
          const incoming = dropObsoleteSettings({ ...(req.body || {}) });
          delete incoming.configuredKeys;
          delete incoming.keySources;
          const saved = await withTransaction(async (client) => {
              const current = await readWorkspaceSettings(client);
              for (const key of SECRET_SETTING_KEYS) {
                  // The mask (or an absent field) means "unchanged"; an empty string clears the key.
                  if (incoming[key] === undefined || incoming[key] === SECRET_MASK) {
                      if (current[key]) incoming[key] = current[key]; else delete incoming[key];
                  }
              }
              await client.query(
                  `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                  [JSON.stringify(incoming)]
              );
              return incoming;
          });
          invalidateSecretsCache();
          res.json(maskSettings(saved));
      } catch (err) {
          sendError(res, err, 500, 'Failed to update workspace settings');
      }
  });

  // Partial update: only the fields sent are changed, so two admins (or the sidebar theme toggle and the
  // Settings page) editing different fields can't silently undo each other (REL-005).
  app.patch('/api/settings', requireAdmin, async (req, res) => {
      try {
          const changes = dropObsoleteSettings({ ...(req.body || {}) });
          delete changes.configuredKeys;
          delete changes.keySources;
          for (const key of SECRET_SETTING_KEYS) if (changes[key] === SECRET_MASK) delete changes[key];
          const saved = await withTransaction(async (client) => {
              const merged = dropObsoleteSettings({ ...(await readWorkspaceSettings(client)), ...changes });
              await client.query(
                  `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                  [JSON.stringify(merged)]
              );
              return merged;
          });
          invalidateSecretsCache();
          res.json(maskSettings(saved));
      } catch (err) {
          sendError(res, err, 500, 'Failed to update workspace settings');
      }
  });

  return { SECRET_MASK, dropObsoleteSettings, invalidateSecretsCache, workspaceSecret };
};
