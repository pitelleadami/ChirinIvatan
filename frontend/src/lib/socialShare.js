function encode(value) {
  return encodeURIComponent(String(value || ''))
}

export function openFacebookPost(url) {
  const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`
  window.open(shareUrl, '_blank', 'noopener,noreferrer,width=700,height=620')
}

export function absoluteUrl(value) {
  if (!value) return ''
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return ''
  }
}

export function sharePreviewUrl({ title = '', description = '', image = '', target = '' }) {
  const params = new URLSearchParams()
  if (title) params.set('title', title)
  if (description) params.set('description', description)
  if (image) params.set('image', absoluteUrl(image))
  if (target) params.set('target', absoluteUrl(target))
  return `${window.location.origin}/share/preview?${params.toString()}`
}

// Legacy helpers used by LeaderboardPage and others
export function socialShareUrl(platform, { text = '', url = '' }) {
  if (platform === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`
  if (platform === 'x') return `https://twitter.com/intent/tweet?text=${encode(text)}&url=${encode(url)}`
  return ''
}

export function openSocialShare(platform, options = {}) {
  const shareUrl = socialShareUrl(platform, options)
  if (!shareUrl) return false
  window.open(shareUrl, '_blank', 'noopener,noreferrer,width=700,height=620')
  return true
}

export async function shareWithNative({ title = '', text = '', url = '' }) {
  if (!navigator.share) return false
  try {
    await navigator.share({ title, text, url })
    return true
  } catch (err) {
    return err?.name === 'AbortError'
  }
}

export async function copyShareText({ text = '', url = '' }) {
  const payload = [text, url].filter(Boolean).join(' ')
  if (!payload) return false
  try {
    await navigator.clipboard.writeText(payload)
    return true
  } catch {
    return false
  }
}

export function imageShareFile(blob, name) {
  return new File([blob], `${name.replace(/\s+/g, '-').toLowerCase()}.png`, {
    type: 'image/png',
  })
}

export async function shareImageNative(blob, name, { title = name, text = '', url = '' } = {}) {
  if (!navigator?.share || !navigator?.canShare) return false
  const file = imageShareFile(blob, name)
  if (!navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title, text, url })
    return true
  } catch (err) {
    return err?.name === 'AbortError'
  }
}

export async function shareImageToStories(blob, name, text = '') {
  return shareImageNative(blob, name, { title: name, text })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
