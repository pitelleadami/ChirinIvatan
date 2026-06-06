import { useState } from 'react'

const MILESTONES = new Set([1, 5, 10, 25, 50, 100])

function playContributionChime(isMilestone) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return

  const context = new AudioContextCtor()
  const notes = isMilestone ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99]
  const start = context.currentTime

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + index * 0.1)
    gain.gain.exponentialRampToValueAtTime(0.16, start + index * 0.1 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.1 + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start + index * 0.1)
    oscillator.stop(start + index * 0.1 + 0.24)
  })

  window.setTimeout(() => {
    context.close().catch(() => {})
  }, 900)
}

function buildCelebration(kind, count) {
  const label = kind === 'folklore' ? 'story' : 'word'
  const pluralLabel = kind === 'folklore' ? 'stories' : 'words'
  const isFirst = count === 1
  const isMilestone = MILESTONES.has(count)

  if (isFirst) {
    return {
      count,
      isMilestone: true,
      eyebrow: `First ${label} submitted`,
      title: 'You are a Cultural Bearer',
      message: `Your first ${label} has entered the Chirin Ivatan review path. Thank you for helping carry Ivatan memory forward.`,
      badge: 'Cultural Bearer',
    }
  }

  if (isMilestone) {
    return {
      count,
      isMilestone: true,
      eyebrow: `${count} ${pluralLabel} submitted`,
      title: 'Yaru Milestone Reached',
      message: `You have submitted ${count} ${pluralLabel}. Every remembered ${label} strengthens the archive.`,
      badge: 'Yaru Keeper',
    }
  }

  return {
    count,
    isMilestone: false,
    eyebrow: 'Contribution submitted',
    title: 'Thank you, Cultural Bearer',
    message: `Your ${label} has been submitted for review. The archive grows through each act of care.`,
    badge: 'For Review',
  }
}

function buildDraftSavedCelebration(kind) {
  const label = kind === 'folklore' ? 'folklore draft' : 'dictionary draft'
  return {
    isMilestone: false,
    eyebrow: 'Draft saved',
    title: 'Draft Saved',
    message: `Your ${label} has been saved. You can find it in Steward's Desk under Contributions.`,
    badge: 'Saved Draft',
  }
}

export function useContributionCelebration() {
  const [celebration, setCelebration] = useState(null)

  function celebrateContribution(kind, submittedCount = 0) {
    const nextCelebration = buildCelebration(kind, submittedCount)
    setCelebration(nextCelebration)
    playContributionChime(nextCelebration.isMilestone)
  }

  function celebrateDraftSaved(kind) {
    setCelebration(buildDraftSavedCelebration(kind))
  }

  function closeCelebration() {
    setCelebration(null)
  }

  return { celebration, celebrateContribution, celebrateDraftSaved, closeCelebration }
}
