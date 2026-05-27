export type LogoType = 'icon' | 'logo' | 'symbol';
export type LogoFallback = 'brandfetch' | 'transparent' | 'lettermark' | '404';

export const normalizeMerchantKey = (merchant?: string | null) => merchant?.trim().toLowerCase() || null;

export const buildMerchantIdentifier = (
  merchant?: string,
  overrides?: Record<string, string>,
): string | null => {
  const normalizedKey = normalizeMerchantKey(merchant);
  
  // 1. Check for manual override first (User defined mapping in Settings > Carriers / Merchants)
  const override = normalizedKey ? overrides?.[normalizedKey] : undefined;

  if (override !== undefined) {
    const trimmed = override.trim().toLowerCase();
    // If the user explicitly clears it or sets a name without a dot (e.g. "Lufthansa" without a dot), 
    // we return null to force the Lettermark/Icon fallback.
    if (trimmed.includes('.') && trimmed.length > 3) {
        // Strip protocols and www if present in override
        return trimmed.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    }
    return null;
  }

  const base = normalizedKey;
  if (!base) return null;

  // 2. Support searching for domains within the name
  // Split by common separators to find something that looks like a domain
  const chunks = base.split(/[\s*|/]/);
  for (const chunk of chunks) {
      // Basic sanitization for the chunk
      const sanitized = chunk.replace(/[^a-z0-9.-]/g, '');
      if (sanitized.length < 4) continue;

      const parts = sanitized.split('.');
      if (parts.length > 1) {
          const lastPart = parts[parts.length - 1];
          // Check if it looks like a valid TLD (2-12 characters)
          if (/^[a-z]{2,12}$/.test(lastPart)) {
              return sanitized;
          }
      }
  }

  // 3. Fallback: Entire sanitized name if it looks like it could be a domain 
  const sanitizedAll = base.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].replace(/[^a-z0-9.-]/g, '');
  const partsAll = sanitizedAll.split('.');
  if (partsAll.length > 1 && /^[a-z]{2,12}$/.test(partsAll[partsAll.length - 1])) {
      return sanitizedAll;
  }

  // 4. Default Airline Code / Local Mapping Domain
  const cleaned = base.replace(/[^a-z0-9]/g, '');
  const mappings: Record<string, string> = {
    'deltaairlines': 'delta.com', 'delta': 'delta.com', 'americanairlines': 'aa.com', 'american': 'aa.com',
    'unitedairlines': 'united.com', 'united': 'united.com', 'southwestairlines': 'southwest.com', 'southwest': 'southwest.com',
    'britishairways': 'britishairways.com', 'emirates': 'emirates.com', 'qatarairways': 'qatarairways.com', 'qatar': 'qatarairways.com',
    'lufthansa': 'lufthansa.com', 'airfrance': 'airfrance.com', 'klm': 'klm.com', 'singaporeairlines': 'singaporeair.com',
    'cathaypacific': 'cathaypacific.com', 'ana': 'ana.co.jp', 'japanairlines': 'jal.com', 'jal': 'jal.com',
    'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com'
  };
  
  if (mappings[cleaned]) {
    return mappings[cleaned];
  }

  return null;
};

export const getMerchantLogoUrl = (
  merchant: string | undefined,
  clientId: string | undefined,
  overrides?: Record<string, string>,
  options?: { width?: number; height?: number; type?: LogoType; fallback?: LogoFallback },
): string | null => {
  if (!clientId || !merchant) return null;
  const identifier = buildMerchantIdentifier(merchant, overrides);

  // If we couldn't resolve a domain as an identifier, try to guess it as the name itself with .com fallback
  // or return null for standard web-scraping fallbacks
  const lookupIdentifier = identifier || `${merchant.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

  const width = options?.width ?? 80;
  const height = options?.height ?? 80;
  const type = options?.type ?? 'icon';
  const fallback = options?.fallback ?? 'lettermark';

  const today = new Date().toISOString().split('T')[0];
  const params = new URLSearchParams({
    c: clientId,
    type,
    fallback,
    h: String(height),
    w: String(width),
    v: today,
  });

  return `https://cdn.brandfetch.io/${encodeURIComponent(lookupIdentifier)}?${params.toString()}`;
};
