import fs from 'node:fs';

const DEFAULT_ROUTE_AUTH = {
  'GET /health': 'none',
  'GET /routes': 'none',
  'POST /lookup-bill': 'none',
  'POST /secure/lookup-bill': 'bearer',
  'GET /admin/customers': 'bearer',
  'POST /admin/customers': 'bearer',
  'DELETE /admin/customers/:id': 'bearer',
};

function loadRouteAuth() {
  if (process.env.ROUTE_AUTH_CONFIG_JSON) {
    return JSON.parse(process.env.ROUTE_AUTH_CONFIG_JSON);
  }

  const path = process.env.ROUTE_AUTH_CONFIG_PATH || './config/routes.json';
  if (fs.existsSync(path)) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  }

  return DEFAULT_ROUTE_AUTH;
}

export const routeAuth = loadRouteAuth();

export function routeKey(method, path) {
  return `${method.toUpperCase()} ${path}`;
}

export function authMode(method, path) {
  return routeAuth[routeKey(method, path)] || 'bearer';
}
