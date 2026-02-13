const API_BASE = import.meta.env.VITE_API_BASE || ''

function getCookie(name) {
  const cookieValue = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return cookieValue ? decodeURIComponent(cookieValue.split('=')[1]) : ''
}

export async function apiRequest(path, options = {}) {
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
