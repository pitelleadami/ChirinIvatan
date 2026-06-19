export function capitalizeFirst(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

export function normalizeHeadword(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return `${text.charAt(0).toUpperCase()}${text.slice(1).toLowerCase()}`
}

function isAllCapsSentence(text) {
  const letters = Array.from(text).filter((character) => /\p{L}/u.test(character))
  return letters.length > 0 && letters.every((character) => character === character.toUpperCase())
}

export function normalizeSentence(value) {
  let text = String(value || '').trim()
  if (!text) return ''
  if (isAllCapsSentence(text)) {
    text = text.toLowerCase()
  }
  text = capitalizeFirst(text)
  if (/[.!?…]["')\]]?$/.test(text)) return text
  return `${text}.`
}

export function sentenceForDisplay(value) {
  return normalizeSentence(value)
}
