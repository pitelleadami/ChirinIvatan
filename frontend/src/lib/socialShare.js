function encode(value) {
  return encodeURIComponent(String(value || ''))
}

export function socialShareUrl(platform, { text = '', url = '' }) {
  if (platform === 'facebook') {
    return `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`
  }
  if (platform === 'x') {
    return `https://twitter.com/intent/tweet?text=${encode(text)}&url=${encode(url)}`
  }
  return ''
}

export function openSocialShare(platform, { text = '', url = '' }) {
  const shareUrl = socialShareUrl(platform, { text, url })
  if (!shareUrl) return false
  window.open(shareUrl, '_blank', 'noopener,noreferrer,width=700,height=620')
  return true
}

export async function shareWithNative({ title = '', text = '', url = '' }) {
  if (!navigator.share) return false
  try {
    await navigator.share({ title, text, url })
    return true
  } catch {
    return false
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
