const API_BASE = import.meta.env.VITE_API_BASE || ''
const CSRF_REFRESH_PATH = '/api/auth/csrf'
const SUPPORT_ERRORS = {
  SESSION:
    'Session verification failed. Error code: CI-SESSION-01. Please refresh and try again. If it keeps happening, contact the administrator.',
  NETWORK:
    'Connection failed. Error code: CI-NETWORK-01. Your connection may be slow or unstable. Please wait a moment, check your internet connection, and try again.',
  SERVER: 'Something went wrong. Error code: CI-SERVER-01. Please contact the administrator.',
  RESPONSE: 'Something went wrong. Error code: CI-RESPONSE-01. Please contact the administrator.',
}

function getCookie(name) {
  // Reads Django CSRF cookie so non-GET requests are accepted by backend.
  const cookieValue = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return cookieValue ? decodeURIComponent(cookieValue.split('=')[1]) : ''
}

function isUnsafeMethod(method = 'GET') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())
}

function headersFor(options = {}) {
  const headers = {
    ...(options.headers || {}),
  }
  if (isUnsafeMethod(options.method)) {
    headers['X-CSRFToken'] = getCookie('csrftoken')
  }
  return headers
}

function isCsrfFailure(response, rawText, body = {}) {
  const detail = String(body.detail || '')
  return response.status === 403 && (rawText.includes('CSRF verification failed') || /csrf/i.test(detail))
}

async function fetchApi(path, options = {}) {
  try {
    return await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers: headersFor(options),
    })
  } catch {
    throw new Error(SUPPORT_ERRORS.NETWORK)
  }
}

async function parseApiResponse(response) {
  let body = {}
  let rawText = ''
  try {
    rawText = await response.text()
    body = rawText ? JSON.parse(rawText) : {}
  } catch {
    const csrfFailure = rawText.includes('CSRF verification failed')
    body = {
      detail: csrfFailure ? SUPPORT_ERRORS.SESSION : SUPPORT_ERRORS.RESPONSE,
    }
  }
  return { body, rawText }
}

function errorMessageFor(response, rawText, body) {
  if (isCsrfFailure(response, rawText, body)) return SUPPORT_ERRORS.SESSION
  if (response.status >= 500) return SUPPORT_ERRORS.SERVER
  return body.detail || SUPPORT_ERRORS.RESPONSE
}

function apiErrorFor(response, rawText, body) {
  const error = new Error(errorMessageFor(response, rawText, body))
  error.status = response.status
  error.body = body
  return error
}

export async function apiRequest(path, options = {}) {
  // Single fetch wrapper used by all pages.
  const response = await fetchApi(path, options)
  const { body, rawText } = await parseApiResponse(response)

  if (
    !response.ok &&
    !options.skipCsrfRetry &&
    path !== CSRF_REFRESH_PATH &&
    isUnsafeMethod(options.method) &&
    isCsrfFailure(response, rawText, body)
  ) {
    await fetchApi(CSRF_REFRESH_PATH, { method: 'GET' }).catch(() => null)
    const retryResponse = await fetchApi(path, options)
    const retryParsed = await parseApiResponse(retryResponse)

    if (!retryResponse.ok) {
      if (isCsrfFailure(retryResponse, retryParsed.rawText, retryParsed.body)) {
        throw new Error(SUPPORT_ERRORS.SESSION)
      }
      throw apiErrorFor(retryResponse, retryParsed.rawText, retryParsed.body)
    }
    return retryParsed.body
  }

  if (!response.ok) {
    throw apiErrorFor(response, rawText, body)
  }
  return body
}

export const fetchNotifications = () => apiRequest('/api/notifications')

export const markNotificationsRead = (ids = null) =>
  apiRequest('/api/notifications/mark-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : {}),
  })
