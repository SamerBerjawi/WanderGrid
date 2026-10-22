// The app preloads airline and airport data from the network when its modules load; unit tests stay offline.
globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' })) as unknown as typeof fetch;
