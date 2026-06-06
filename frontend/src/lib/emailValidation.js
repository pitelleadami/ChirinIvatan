const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValidationMessage(value, { required = true } = {}) {
  const email = String(value || '').trim()
  if (!email) return required ? 'Email address is required.' : ''
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address format, such as name@example.com.'

  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return 'Enter a valid email address format, such as name@example.com.'
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return 'Enter a valid email address without misplaced dots.'
  }
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return 'Enter a valid email domain.'
  }
  if (!domain.split('.').every((part) => part.length > 0 && /^[a-z0-9-]+$/i.test(part))) {
    return 'Enter a valid email domain.'
  }
  return ''
}

export function isValidEmail(value, options) {
  return !emailValidationMessage(value, options)
}
