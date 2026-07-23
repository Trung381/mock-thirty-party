import { authMode } from './config.js';

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function apiKey(req) {
  return String(req.headers['x-api-key'] || '');
}

export function requireAuth(routePath) {
  return (req, res, next) => {
    const mode = authMode(req.method, routePath);
    if (mode === 'none') return next();

    if (mode === 'bearer') {
      const expected = process.env.AUTH_BEARER_TOKEN || '';
      if (expected && bearerToken(req) === expected) return next();
      return res.status(401).json({ success: false, error_code: 'unauthorized', error_message: 'invalid bearer token' });
    }

    if (mode === 'api_key') {
      const expected = process.env.AUTH_API_KEY || '';
      if (expected && apiKey(req) === expected) return next();
      return res.status(401).json({ success: false, error_code: 'unauthorized', error_message: 'invalid api key' });
    }

    return res.status(500).json({ success: false, error_code: 'invalid_auth_mode', error_message: `unsupported auth mode: ${mode}` });
  };
}
