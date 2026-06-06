import dictionaryBadge1 from '../assets/badges/custom/dictionary_badge_1.png'
import dictionaryBadge2 from '../assets/badges/custom/dictionary_badge_2.png'
import dictionaryBadge3 from '../assets/badges/custom/dictionary_badge_3.png'
import dictionaryBadge4 from '../assets/badges/custom/dictionary_badge_4.png'
import dictionaryBadge5 from '../assets/badges/custom/dictionary_badge_5.png'
import folkloreBadge1 from '../assets/badges/custom/folklore_badge_1.png'
import folkloreBadge2 from '../assets/badges/custom/folklore_badge_2.png'
import folkloreBadge3 from '../assets/badges/custom/folklore_badge_3.png'
import folkloreBadge4 from '../assets/badges/custom/folklore_badge_4.png'
import folkloreBadge5 from '../assets/badges/custom/folklore_badge_5.png'
import qualityAccuracyChampion from '../assets/badges/custom/quality_accuracy_champion.png'
import reviewerLevel1 from '../assets/badges/custom/reviewer_level_1.png'
import reviewerLevel2 from '../assets/badges/custom/reviewer_level_2.png'
import reviewerLevel3 from '../assets/badges/custom/reviewer_level_3.png'

const BADGE_IMAGE_BY_KEY = {
  word_contributor: dictionaryBadge1,
  lexicon_builder: dictionaryBadge2,
  language_preserver: dictionaryBadge3,
  dictionary_steward: dictionaryBadge4,
  master_lexicon_keeper: dictionaryBadge5,
  story_contributor: folkloreBadge1,
  folklore_weaver: folkloreBadge2,
  tradition_keeper: folkloreBadge3,
  cultural_narrator: folkloreBadge4,
  oral_historian: folkloreBadge5,
  accuracy_champion: qualityAccuracyChampion,
  dictionary_seed: dictionaryBadge1,
  dictionary_grove: dictionaryBadge2,
  folklore_voice: folkloreBadge1,
  folklore_keeper: folkloreBadge2,
  quality_steward: qualityAccuracyChampion,
}

const REVIEWER_LEVEL_IMAGE_BY_LEVEL = {
  1: reviewerLevel1,
  2: reviewerLevel2,
  3: reviewerLevel3,
}

export function getBadgeImageByKey(key) {
  if (!key) return null
  return BADGE_IMAGE_BY_KEY[String(key).replace(/-/g, '_')] || null
}

export function getReviewerLevelImage(level) {
  const numericLevel = Number(level)
  if (!Number.isFinite(numericLevel) || numericLevel < 1) return null
  return REVIEWER_LEVEL_IMAGE_BY_LEVEL[Math.min(3, Math.floor(numericLevel))] || reviewerLevel3
}
