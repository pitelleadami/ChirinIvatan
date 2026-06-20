export function compactLeaderboardName(value, maxPostNominals = 3) {
  const rawName = String(value || '').trim()
  if (!rawName) return ''

  const parts = rawName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) return rawName

  if (parts.length <= maxPostNominals + 1) return parts.join(', ')

  const baseName = parts[0]
  const postNominals = parts.slice(1).slice(-maxPostNominals)
  return [baseName, ...postNominals].join(', ')
}
