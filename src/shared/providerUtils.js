/**
 * Shared utility functions used by both the main process and renderer.
 * Keep this file free of Node.js/Electron-only imports so it works in both contexts.
 */

/**
 * Infer the AI provider type from a connection string, API key, or endpoint URL.
 * Returns one of: 'openrouter' | 'openai' | 'google' | 'ollama'
 */
export function inferProviderFromConnection(connection) {
  const value = String(connection || '').trim()
  const lower = value.toLowerCase()
  if (!value) return 'openrouter'

  if (/^https?:\/\//.test(lower)) {
    if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('/models')) {
      return 'ollama'
    }
    if (lower.includes('openrouter.ai') || lower.includes('/openrouter')) {
      return 'openrouter'
    }
    if (lower.includes('api.openai.com')) {
      return 'openai'
    }
    if (lower.includes('googleapis.com') || lower.includes('generativelanguage')) {
      return 'google'
    }
    return 'ollama'
  }

  if (/^sk-or-v1-|^or-/.test(value) || lower.includes('openrouter')) return 'openrouter'
  if (/^sk-|^pk-|^openai|^azure/.test(value)) return 'openai'
  if (/^AIza[A-Za-z0-9_-]{35}$/.test(value)) return 'google'
  return 'openai'
}

/**
 * Normalize a raw endpoint string into an origin URL.
 * Strips trailing slashes and known API path suffixes.
 * If the input is just a port like ":11434", assumes localhost.
 */
export function normalizeEndpointOrigin(value, fallbackProtocol = 'http:') {
  const raw = String(value || '')
    .trim()
    .replace(/\/+$/, '')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).origin
    } catch {
      return raw.replace(/\/(api\/(chat|tags)|v1\/models|models).*$/i, '')
    }
  }

  // If user provided only a port like ":11434", assume localhost
  if (/^:\d+$/.test(raw)) {
    return `${fallbackProtocol}//localhost${raw}`
  }

  const stripped = raw.replace(/\/(api\/(chat|tags)|v1\/models|models).*$/i, '')
  return `${fallbackProtocol}//${stripped}`
}

/**
 * Resolve the effective provider from a connection value and an explicit provider override.
 * When provider is 'auto', infers from the connection string.
 */
export function getEffectiveProvider(connection, provider) {
  return provider === 'auto' ? inferProviderFromConnection(connection) : provider
}

/**
 * Check whether a string looks like a URL.
 */
export function isUrl(value) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * Normalize a URL by trimming trailing slashes.
 */
export function normalizeUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

/**
 * Check whether a URL string contains a given path segment (case-insensitive).
 */
export function urlHasPath(value, path) {
  return normalizeUrl(value).toLowerCase().includes(path)
}
