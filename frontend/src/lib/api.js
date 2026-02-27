const API_BASE = import.meta.env.VITE_API_BASE || ''

function getCookie(name) {
  // Reads Django CSRF cookie so non-GET requests are accepted by backend.
  const cookieValue = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return cookieValue ? decodeURIComponent(cookieValue.split('=')[1]) : ''
}

export async function apiRequest(path, options = {}) {
  // Single fetch wrapper used by all pages.
  // Troubleshooting:
  // - If you see 403 CSRF, confirm csrftoken cookie exists and Vite origin is trusted.
  // - If you see auth errors, confirm browser session is logged in on backend host.
  const headers = {
    ...(options.headers || {}),
  }
  if (options.method && options.method !== 'GET') {
    headers['X-CSRFToken'] = getCookie('csrftoken')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    body = { detail: `Request failed with status ${response.status}` }
  }

  if (!response.ok) {
    throw new Error(body.detail || `Request failed with status ${response.status}`)
  }
  return body
}
