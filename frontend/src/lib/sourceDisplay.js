function titleCase(value) {
  const text = String(value || '').trim()
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1).toLowerCase()}` : ''
}

export function formatSourceDisplay(value) {
  return String(value || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      const mediaMatch = trimmed.match(/^(audio|photo|image|video|media)\s+source:\s*(.*)$/i)
      if (mediaMatch) {
        return `${titleCase(mediaMatch[1])}: ${mediaMatch[2].trim()}`
      }
      return trimmed.replace(/^(?:text|term)?\s*source:\s*/i, '')
    })
    .filter(Boolean)
    .join('\n')
}
