/*
  DictionaryDraftBuilderPage.jsx

  Contributor workflow page for:
  - create new dictionary draft
  - start a revision from an approved entry
  - update draft
  - submit draft for review
  - review your own dictionary revision list
*/

import { useEffect, useState } from 'react'

import ContributionCelebration from '../components/ContributionCelebration'
import { apiRequest } from '../lib/api'
import { useContributionCelebration } from '../lib/contributionCelebration'
import { prepareImageUpload } from '../lib/imageUpload'
import { ROUTES, navigate } from '../lib/router'

const INITIAL_FORM = {
  term: '',
  meaning: '',
  part_of_speech: '',
  pronunciation_text: '',
  phonetic: '',
  variant_type: 'General Ivatan',
  variants: [],
  usage_notes: '',
  etymology: '',
  example_sentence: '',
  example_translation: '',
  source_text: '',
  term_source_is_self_knowledge: null,
  audio_source: '',
  audio_source_is_self_recorded: null,
  photo_source: '',
  photo_source_is_contributor_owned: null,
  english_synonym: '',
  ivatan_synonym: '',
  english_antonym: '',
  ivatan_antonym: '',
  inflected_forms: '{}',
}

const VARIANT_TYPE_OPTIONS = [
  'General Ivatan',
  'Isamurong',
  'Ivasay',
  'Isabtang',
  'Itbayaten',
]

const PART_OF_SPEECH_OPTIONS = [
  'Noun (N)',
  'Proper noun (PN)',
  'Pronoun (PRO)',
  'Verb (V)',
  'Transitive verb (VT)',
  'Intransitive verb (VI)',
  'Adjective (ADJ)',
  'Adverb (ADV)',
  'Preposition (PREP)',
  'Conjunction (CONJ)',
  'Interjection (INTJ)',
  'Particle (PART)',
  'Determiner (DET)',
  'Numeral (NUM)',
  'Affix',
  'Prefix',
  'Suffix',
  'Root word',
  'Idiom',
  'Expression',
  'Phrase',
  'Proverb',
]

const SOURCE_OWNER_LABEL = 'K. Adami'
const DICTIONARY_MUNICIPALITY_OPTIONS = ['Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat']

const DICTIONARY_TERM_SOURCE_TYPES = [
  { value: 'community_knowledge', label: 'Community Knowledge', guidance: 'Use for words commonly recognized within a municipality or community.', fields: [{ key: 'municipality', label: 'Municipality', type: 'select', options: DICTIONARY_MUNICIPALITY_OPTIONS }], build: (v) => `Community knowledge from ${v.municipality}` },
  { value: 'interview', label: 'Interview', guidance: 'Use when the term was directly shared or explained by another member of the community.', fields: [{ key: 'informant_name', label: 'Informant Name' }, { key: 'interview_date', label: 'Interview Date', type: 'date' }], build: (v) => `Interview with ${v.informant_name}${v.interview_date ? ` on ${v.interview_date}` : ''}` },
  { value: 'printed_dictionary_book', label: 'Printed Dictionary / Book', guidance: 'Use published references to support preservation and accuracy.', fields: [{ key: 'book_title', label: 'Book Title' }, { key: 'author', label: 'Author' }, { key: 'year', label: 'Year' }, { key: 'page_number', label: 'Page Number' }], build: (v) => `${v.author}${v.year ? ` (${v.year})` : ''}${v.book_title ? `, ${v.book_title}` : ''}${v.page_number ? `, p. ${v.page_number}` : ''}` },
  { value: 'academic_source', label: 'Academic Source', guidance: 'Use for journals, linguistic studies, or academic publications.', fields: [{ key: 'publication_title', label: 'Publication Title' }, { key: 'author', label: 'Author' }, { key: 'url', label: 'URL', type: 'url' }], build: (v) => `${v.publication_title}${v.author ? ` by ${v.author}` : ''}${v.url ? ` (${v.url})` : ''}` },
  { value: 'historical_document', label: 'Historical Document', guidance: 'Use for archival or historical references.', fields: [{ key: 'archive_name', label: 'Archive Name' }, { key: 'approximate_date', label: 'Approximate Date' }], build: (v) => `${v.archive_name}${v.approximate_date ? `, ${v.approximate_date}` : ''}` },
  { value: 'website_online', label: 'Website / Online Resource', guidance: 'Use online references carefully for preservation and cross-checking.', fields: [{ key: 'url', label: 'URL', type: 'url' }, { key: 'access_date', label: 'Access Date', type: 'date' }], build: (v) => `${v.url}${v.access_date ? ` (accessed ${v.access_date})` : ''}` },
  { value: 'other', label: 'Other', guidance: 'Use if no category appropriately fits the source.', fields: [{ key: 'notes', label: 'Explanation Notes' }], build: (v) => v.notes },
]

const DICTIONARY_PHOTO_SOURCE_TYPES = [
  { value: 'community_contributed_photo', label: 'Community-Contributed Photo', guidance: 'Use for images shared with permission by another community member.', fields: [{ key: 'contributor_name', label: 'Contributor Name' }], build: (v) => `Shared by ${v.contributor_name}` },
  { value: 'museum_archive', label: 'Museum / Archive', guidance: 'Use for archival or institutional images.', fields: [{ key: 'institution_name', label: 'Institution Name' }], build: (v) => v.institution_name },
  { value: 'book_publication_image', label: 'Book / Publication Image', guidance: 'Use for scanned or referenced printed visuals.', fields: [{ key: 'book_title', label: 'Book Title' }, { key: 'page_number', label: 'Page Number' }], build: (v) => `${v.book_title}${v.page_number ? `, p. ${v.page_number}` : ''}` },
  { value: 'website_image', label: 'Website Image', guidance: 'Acknowledge the original location or uploader.', fields: [{ key: 'url', label: 'URL', type: 'url' }], build: (v) => `Referenced from ${v.url}` },
  { value: 'ai_assisted_illustration', label: 'AI-Assisted Illustration', guidance: 'Use for AI-assisted educational visualization.', fields: [{ key: 'tool_used', label: 'Tool Used' }], build: (v) => `AI-assisted illustration from ${v.tool_used}` },
  { value: 'family_collection', label: 'Family Collection', guidance: 'Use for photographs preserved by families or households.', fields: [{ key: 'family_name', label: 'Family Name' }, { key: 'head_of_family', label: 'Head of Family' }, { key: 'municipality', label: 'Municipality', type: 'select', options: DICTIONARY_MUNICIPALITY_OPTIONS }], build: (v) => `Shared from the ${v.family_name} family${v.municipality ? ` from ${v.municipality}` : ''}` },
  { value: 'other', label: 'Other', guidance: 'Use if no category appropriately fits the source.', fields: [{ key: 'notes', label: 'Explanation Notes' }], build: (v) => v.notes },
]

const DICTIONARY_AUDIO_SOURCE_TYPES = [
  { value: 'recording', label: 'Recording', guidance: 'Use for recordings from other fluent speakers.', fields: [{ key: 'name', label: 'Name' }], build: (v) => `Shared pronunciation by ${v.name}` },
  { value: 'archived_recording', label: 'Archived Recording', guidance: 'Use for historical or archived pronunciation recordings.', fields: [{ key: 'archive_name', label: 'Archive Name' }], build: (v) => `${v.archive_name} recording` },
  { value: 'radio_broadcast', label: 'Radio / Broadcast', guidance: 'Use for pronunciation recordings from educational broadcasts.', fields: [{ key: 'program_name', label: 'Program Name' }], build: (v) => `${v.program_name}` },
  { value: 'other', label: 'Other', guidance: 'Use if no category appropriately fits the source.', fields: [{ key: 'notes', label: 'Explanation Notes' }], build: (v) => v.notes },
]

function resolveSourceConfig(config, type) {
  return config.find((item) => item.value === type) || null
}

function isConfigComplete(config, values) {
  if (!config) return false
  return config.fields.every((field) => String(values?.[field.key] || '').trim())
}

function buildSourceLine(label, config, values, fallback = '') {
  if (!config) return fallback
  const text = String(config.build(values || {}) || '').trim()
  return text ? `${label}: ${text}` : fallback
}

const COMMON_INFLECTION_OPTIONS = [
  'Root/base form',
  'Alternate spelling',
  'Dialect form',
  'Pronunciation variant',
  'Reduplicated form',
  'Affixed form',
  'Honorific form',
  'Other',
]

const DEFAULT_INFLECTION_OPTIONS = ['Root/base form', 'Derived form', ...COMMON_INFLECTION_OPTIONS.slice(1)]

const INFLECTION_OPTIONS_BY_POS = [
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('pronoun'),
    options: [
      'Base pronoun',
      'Nominative case',
      'Accusative case',
      'Genitive/Possessive case',
      'Dative case',
      'First person',
      'Second person',
      'Third person',
      'Singular',
      'Plural',
      'Dual',
      'Inclusive we',
      'Exclusive we',
      'Enclitic form',
      ...COMMON_INFLECTION_OPTIONS,
    ],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('noun'),
    options: [
      'Singular form',
      'Plural form',
      'Dual form',
      'Paucal form',
      'Possessive form',
      'Definite form',
      'Indefinite form',
      'Nominative case',
      'Accusative case',
      'Genitive case',
      'Dative case',
      'Locative case',
      'Instrumental case',
      'Vocative case',
      'Ablative case',
      'Ergative case',
      'Absolutive case',
      'Gender form',
      ...COMMON_INFLECTION_OPTIONS,
    ],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('verb'),
    options: [
      'Root/base form',
      'Infinitive',
      'Finite form',
      'Non-finite form',
      'Present tense',
      'Past tense',
      'Future tense',
      'Habitual form',
      'Remote past',
      'Near future',
      'Progressive aspect',
      'Perfect aspect',
      'Imperfective aspect',
      'Completed aspect',
      'Iterative aspect',
      'Indicative mood',
      'Imperative mood',
      'Subjunctive mood',
      'Conditional mood',
      'Optative mood',
      'Active voice',
      'Passive voice',
      'Middle voice',
      'Causative voice',
      'Actor focus',
      'Object focus',
      'Locative focus',
      'Benefactive focus',
      'First person form',
      'Second person form',
      'Third person form',
      'Singular agreement',
      'Plural agreement',
      'Affirmative form',
      'Negative form',
      'Witnessed evidential',
      'Inferred evidential',
      'Reported evidential',
      'Present participle',
      'Past participle',
      'Gerund',
      'Enclitic form',
      'Linker form',
      ...COMMON_INFLECTION_OPTIONS,
    ],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('adjective'),
    options: [
      'Positive form',
      'Comparative form',
      'Superlative form',
      'Singular agreement',
      'Plural agreement',
      'Gender agreement',
      ...COMMON_INFLECTION_OPTIONS,
    ],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('adverb'),
    options: ['Positive form', 'Comparative form', 'Superlative form', ...COMMON_INFLECTION_OPTIONS],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('determiner'),
    options: ['Singular form', 'Plural form', 'Definite form', 'Indefinite form', 'Near demonstrative', 'Far demonstrative', ...COMMON_INFLECTION_OPTIONS],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('numeral'),
    options: ['Cardinal form', 'Ordinal form', 'Classifier form', 'Case form', 'Gender form', ...COMMON_INFLECTION_OPTIONS],
  },
  {
    test: (partOfSpeech) => /affix|prefix|suffix|root/.test(partOfSpeech.toLowerCase()),
    options: [
      'Root/base form',
      'Affixed form',
      'Prefix form',
      'Suffix form',
      'Infix form',
      'Reduplicated form',
      'Linker form',
      'Enclitic form',
      ...COMMON_INFLECTION_OPTIONS.slice(1),
    ],
  },
  {
    test: (partOfSpeech) => /particle|preposition|conjunction|interjection/.test(partOfSpeech.toLowerCase()),
    options: [
      'Base form',
      'Enclitic form',
      'Linker form',
      'Evidential particle',
      'Affirmative form',
      'Negative form',
      ...COMMON_INFLECTION_OPTIONS.slice(1),
    ],
  },
]

function inflectionOptionsFor(partOfSpeech) {
  const match = INFLECTION_OPTIONS_BY_POS.find((item) => item.test(partOfSpeech || ''))
  return [...new Set(match?.options || DEFAULT_INFLECTION_OPTIONS)]
}

function inflectionOptionsForRow(partOfSpeech, currentLabel) {
  const options = inflectionOptionsFor(partOfSpeech)
  if (currentLabel && currentLabel !== 'Other' && !options.includes(currentLabel)) {
    return [currentLabel, ...options]
  }
  return options
}

function objectToRows(value, partOfSpeech = '') {
  const options = inflectionOptionsFor(partOfSpeech)
  return Object.entries(value || {}).map(([label, rowValue]) => ({
    label: options.includes(label) ? label : 'Other',
    customLabel: options.includes(label) ? '' : label,
    value: String(rowValue || ''),
  }))
}

function rowsToObject(rows) {
  return rows.reduce((result, row) => {
    const label = String(row.label === 'Other' ? row.customLabel : row.label || '').trim()
    const value = String(row.value || '').trim()
    if (label && value) result[label] = value
    return result
  }, {})
}

function makeVariant() {
  return {
    term: '',
    variant_type: 'Isamurong',
    pronunciation_text: '',
    audio_source: '',
    audio_source_is_self_recorded: null,
    audio_source_type: '',
    audio_source_details: {},
  }
}

function normalizeVariantForForm(variant) {
  const variantType = String(variant?.variant_type || '')
  const isKnownType = VARIANT_TYPE_OPTIONS.includes(variantType)
  const audioSourceIsSelfRecorded =
    variant?.audio_source_is_self_recorded === true
      ? true
      : variant?.audio_source_is_self_recorded === false
        ? false
        : null
  return {
    ...makeVariant(),
    ...variant,
    variant_type: isKnownType ? variantType : 'General Ivatan',
    audio_source_is_self_recorded: audioSourceIsSelfRecorded,
    audio_source_type: String(variant?.audio_source_type || ''),
    audio_source_details:
      variant?.audio_source_details && typeof variant.audio_source_details === 'object'
        ? variant.audio_source_details
        : {},
  }
}

function variantForPayload(variant) {
  const sourceConfig = resolveSourceConfig(DICTIONARY_AUDIO_SOURCE_TYPES, variant.audio_source_type)
  const derivedAudioSource =
    variant.audio_source_is_self_recorded === true
      ? `Audio Source: ${SOURCE_OWNER_LABEL}`
      : variant.audio_source_is_self_recorded === false
        ? buildSourceLine('Audio Source', sourceConfig, variant.audio_source_details)
        : ''
  return {
    term: String(variant.term || '').trim(),
    variant_type: String(variant.variant_type || '').trim(),
    pronunciation_text: String(variant.pronunciation_text || '').trim(),
    audio_source: String(derivedAudioSource || '').trim(),
    audio_source_is_self_recorded:
      variant.audio_source_is_self_recorded === true
        ? true
        : variant.audio_source_is_self_recorded === false
          ? false
          : null,
    audio_source_type: String(variant.audio_source_type || '').trim(),
    audio_source_details:
      variant.audio_source_details && typeof variant.audio_source_details === 'object'
        ? variant.audio_source_details
        : {},
  }
}

function revisionToForm(revision) {
  const source = revision.proposed_data || revision
  const mainVariantType = VARIANT_TYPE_OPTIONS.includes(source.variant_type) ? source.variant_type : 'General Ivatan'
  return {
    ...INITIAL_FORM,
    term: source.term || '',
    meaning: source.meaning || '',
    part_of_speech: source.part_of_speech || '',
    pronunciation_text: source.pronunciation_text || '',
    phonetic: source.phonetic || '',
    variant_type: mainVariantType,
    variants: Array.isArray(source.variants) ? source.variants.map(normalizeVariantForForm) : [],
    usage_notes: source.usage_notes || '',
    etymology: source.etymology || '',
    example_sentence: source.example_sentence || '',
    example_translation: source.example_translation || '',
    source_text: source.source_text || '',
    term_source_is_self_knowledge: Boolean(source.term_source_is_self_knowledge),
    audio_source: source.audio_source || '',
    audio_source_is_self_recorded: Boolean(source.audio_source_is_self_recorded),
    photo_source: source.photo_source || '',
    photo_source_is_contributor_owned: Boolean(source.photo_source_is_contributor_owned),
    english_synonym: source.english_synonym || '',
    ivatan_synonym: source.ivatan_synonym || '',
    english_antonym: source.english_antonym || '',
    ivatan_antonym: source.ivatan_antonym || '',
    inflected_forms: JSON.stringify(source.inflected_forms || {}, null, 2),
  }
}

function splitList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasContent(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      *
    </span>
  )
}

function GuideLink({ anchor, children = 'Learn More' }) {
  return (
    <a className="field-guide-link" href={`${ROUTES.manual}#${anchor}`}>
      {children}
    </a>
  )
}

function FieldHeader({ htmlFor, label, guideAnchor, guideText = 'Learn More' }) {
  return (
    <div className="field-heading">
      <label htmlFor={htmlFor}>{label}</label>
      {guideAnchor ? <GuideLink anchor={guideAnchor}>{guideText}</GuideLink> : null}
    </div>
  )
}

function YesNoField({ legend, name, value, onChange }) {
  return (
    <fieldset className="binary-choice">
      <legend>{legend}</legend>
      <div className="binary-choice-options">
        <label>
          <input type="radio" name={name} checked={value === true} onChange={() => onChange(true)} />
          Yes
        </label>
        <label>
          <input type="radio" name={name} checked={value === false} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </fieldset>
  )
}

export default function DictionaryDraftBuilderPage() {
  const [revisionId, setRevisionId] = useState('')
  const [entryId, setEntryId] = useState('')
  const [autoRevisionStarted, setAutoRevisionStarted] = useState(false)
  const [revisionSearchTerm, setRevisionSearchTerm] = useState('')
  const [revisionSearchRows, setRevisionSearchRows] = useState([])
  const [revisionSearchBusy, setRevisionSearchBusy] = useState(false)
  const [currentRevisionStatus, setCurrentRevisionStatus] = useState('')
  const [currentRevisionCreatedAt, setCurrentRevisionCreatedAt] = useState('')
  const [matchingHeadwordRows, setMatchingHeadwordRows] = useState([])
  const [matchingHeadwordBusy, setMatchingHeadwordBusy] = useState(false)
  const [dismissedHeadword, setDismissedHeadword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [myRevisions, setMyRevisions] = useState([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [audioFile, setAudioFile] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [hasExistingAudioMedia, setHasExistingAudioMedia] = useState(false)
  const [hasExistingPhotoMedia, setHasExistingPhotoMedia] = useState(false)
  const [audioPreview, setAudioPreview] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoWarning, setPhotoWarning] = useState('')
  const [variantAudioFiles, setVariantAudioFiles] = useState({})
  const [variantAudioPreviews, setVariantAudioPreviews] = useState({})
  const [inflectionRows, setInflectionRows] = useState([])
  const [showVariants, setShowVariants] = useState(false)
  const [showUsageNotes, setShowUsageNotes] = useState(false)
  const [showEtymology, setShowEtymology] = useState(false)
  const [showInflectedForms, setShowInflectedForms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [unlockedFields, setUnlockedFields] = useState({})
  const [termSourceType, setTermSourceType] = useState('')
  const [termSourceValues, setTermSourceValues] = useState({})
  const [audioSourceType, setAudioSourceType] = useState('')
  const [audioSourceValues, setAudioSourceValues] = useState({})
  const [photoSourceType, setPhotoSourceType] = useState('')
  const [photoSourceValues, setPhotoSourceValues] = useState({})
  const { celebration, celebrateContribution, closeCelebration } = useContributionCelebration()
  const isRevisionMode = Boolean(entryId)
  const isSavedDraft = Boolean(revisionId)
  const normalizedRevisionStatus = String(currentRevisionStatus || '').toLowerCase()
  const isEditableDraft = !isSavedDraft || ['draft', 'rejected'].includes(normalizedRevisionStatus)

  useEffect(() => {
    const entryFromQuery = new URLSearchParams(window.location.search).get('entry_id')
    if (entryFromQuery) {
      setEntryId(entryFromQuery)
    }
  }, [])

  useEffect(() => {
    if (!entryId || revisionId || autoRevisionStarted) return
    setAutoRevisionStarted(true)
    run(async () => {
      const payload = await apiRequest(`/api/dictionary/entries/${entryId}/revisions/start`, {
        method: 'POST',
      })
      setRevisionId(payload.revision_id || '')
      setCurrentRevisionStatus(payload.status || 'draft')
      setCurrentRevisionCreatedAt(payload.created_at || '')
      setEntryId(payload.entry_id || entryId)
      loadRevisionIntoForm(payload)
      setMessage('Loaded the published entry into a revision draft.')
      await fetchMyRevisions()
    })
  }, [entryId, revisionId, autoRevisionStarted])

  useEffect(() => {
    return () => {
      if (audioPreview.startsWith('blob:')) {
        URL.revokeObjectURL(audioPreview)
      }
      if (photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
      Object.values(variantAudioPreviews).forEach((previewUrl) => {
        if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
      })
    }
  }, [audioPreview, photoPreview, variantAudioPreviews])

  useEffect(() => {
    const trimmedHeadword = form.term.trim()
    const normalizedHeadword = trimmedHeadword.toLowerCase()

    if (!trimmedHeadword || isRevisionMode || isSavedDraft) {
      setMatchingHeadwordRows([])
      setMatchingHeadwordBusy(false)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setMatchingHeadwordBusy(true)
      try {
        const params = new URLSearchParams()
        params.set('limit', '6')
        params.set('sort', 'alpha')
        params.set('q', trimmedHeadword)
        const payload = await apiRequest(`/api/dictionary/entries?${params.toString()}`)
        if (cancelled) return
        const exactMatches = (payload.rows || []).filter((row) => row.term?.trim().toLowerCase() === normalizedHeadword)
        setMatchingHeadwordRows(exactMatches)
      } catch {
        if (!cancelled) {
          setMatchingHeadwordRows([])
        }
      } finally {
        if (!cancelled) {
          setMatchingHeadwordBusy(false)
        }
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [form.term, isRevisionMode, isSavedDraft])

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function setVariantField(index, field, value) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((variant, currentIndex) =>
        currentIndex === index ? { ...variant, [field]: value } : variant,
      ),
    }))
  }

  function addVariant() {
    setShowVariants(true)
    setForm((prev) => ({ ...prev, variants: [...prev.variants, makeVariant()] }))
  }

  function openVariantsWithInitialRow() {
    setShowVariants(true)
    setForm((prev) => {
      if (prev.variants.length > 0) return prev
      return { ...prev, variants: [makeVariant()] }
    })
  }

  function removeVariant(index) {
    const previewUrl = variantAudioPreviews[index]
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, currentIndex) => currentIndex !== index),
    }))
    setVariantAudioFiles((current) => {
      const next = {}
      Object.entries(current).forEach(([key, value]) => {
        const numericKey = Number(key)
        if (numericKey < index) next[numericKey] = value
        if (numericKey > index) next[numericKey - 1] = value
      })
      return next
    })
    setVariantAudioPreviews((current) => {
      const next = {}
      Object.entries(current).forEach(([key, value]) => {
        const numericKey = Number(key)
        if (numericKey < index) next[numericKey] = value
        if (numericKey > index) next[numericKey - 1] = value
      })
      return next
    })
  }

  function setInflectionRow(index, field, value) {
    setInflectionRows((current) =>
      current.map((row, currentIndex) => (currentIndex === index ? { ...row, [field]: value } : row)),
    )
  }

  function addInflectionRow() {
    const options = inflectionOptionsFor(form.part_of_speech)
    setShowInflectedForms(true)
    setInflectionRows((current) => [...current, { label: options[0], customLabel: '', value: '' }])
  }

  function openInflectedFormsWithInitialRow() {
    const options = inflectionOptionsFor(form.part_of_speech)
    setShowInflectedForms(true)
    setInflectionRows((current) =>
      current.length > 0 ? current : [{ label: options[0], customLabel: '', value: '' }],
    )
  }

  function removeInflectionRow(index) {
    setInflectionRows((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function buildPayload() {
    const inflectedForms = rowsToObject(inflectionRows)
    const derivedTermSource =
      form.term_source_is_self_knowledge === true
        ? ''
        : buildSourceLine('Source', selectedTermSourceConfig, termSourceValues)
    const derivedAudioSource =
      hasAudioMedia && form.audio_source_is_self_recorded === true
        ? `Audio Source: ${SOURCE_OWNER_LABEL}`
        : hasAudioMedia
          ? buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues)
          : ''
    const derivedPhotoSource =
      hasPhotoMedia && form.photo_source_is_contributor_owned === true
        ? `Photo Source: ${SOURCE_OWNER_LABEL}`
        : hasPhotoMedia
          ? buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues)
          : ''
    const variants = form.variants
      .map((variant, index) => ({
        ...variantForPayload(variant),
        sourceIndex: index,
      }))
      .filter(
        (variant) =>
          variant.term ||
          variant.pronunciation_text ||
          variant.audio_source ||
          variant.audio_source_is_self_recorded ||
          variantAudioFiles[variant.sourceIndex],
      )

    return {
      ...form,
      source_text: derivedTermSource,
      audio_source: derivedAudioSource,
      photo_source: derivedPhotoSource,
      variants: variants.map((variant) => ({
        term: variant.term,
        variant_type: variant.variant_type,
        pronunciation_text: variant.pronunciation_text,
        audio_source: variant.audio_source,
        audio_source_is_self_recorded: variant.audio_source_is_self_recorded,
      })),
      variantSourceIndexes: variants.map((variant) => variant.sourceIndex),
      inflected_forms: JSON.stringify(inflectedForms),
    }
  }

  function buildFormData() {
    const payload = buildPayload()
    const formData = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'variantSourceIndexes') return
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        formData.append(key, JSON.stringify(value))
      } else {
        formData.append(key, typeof value === 'boolean' ? String(value) : value)
      }
    })
    if (audioFile) {
      formData.append('audio_pronunciation', audioFile)
    }
    if (photoFile) {
      formData.append('photo', photoFile)
    }
    payload.variantSourceIndexes.forEach((sourceIndex, payloadIndex) => {
      const file = variantAudioFiles[sourceIndex]
      if (file) formData.append(`variant_audio_${payloadIndex}`, file)
    })
    return formData
  }

  function handleAudioChange(event) {
    const file = event.target.files?.[0] || null
    if (audioPreview.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreview)
    }
    setAudioFile(file)
    setAudioPreview(file ? URL.createObjectURL(file) : '')
    if (!file && !hasExistingAudioMedia) {
      setField('audio_source', '')
      setField('audio_source_is_self_recorded', null)
      setAudioSourceType('')
      setAudioSourceValues({})
    }
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }
    setPhotoWarning('')
    setError('')

    try {
      const prepared = await prepareImageUpload(file, {
        minWidth: 800,
        minHeight: 500,
        maxWidth: 1600,
        maxHeight: 1200,
      })
      setPhotoFile(prepared.file)
      setPhotoPreview(prepared.previewUrl || '')
      setPhotoWarning(prepared.warning)
      if (!prepared.file && !hasExistingPhotoMedia) {
        setField('photo_source', '')
        setField('photo_source_is_contributor_owned', null)
        setPhotoSourceType('')
        setPhotoSourceValues({})
      }
    } catch (err) {
      setPhotoFile(null)
      setPhotoPreview('')
      setError(err.message)
    }
  }

  function handleVariantAudioChange(index, event) {
    const file = event.target.files?.[0] || null
    const existingPreview = variantAudioPreviews[index]
    if (existingPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(existingPreview)
    }
    setVariantAudioFiles((current) => ({ ...current, [index]: file }))
    setVariantAudioPreviews((current) => ({
      ...current,
      [index]: file ? URL.createObjectURL(file) : '',
    }))
  }

  function loadRevisionIntoForm(revision) {
    const nextForm = revisionToForm(revision)
    const nextInflectionRows = objectToRows(
      revision.proposed_data?.inflected_forms || revision.inflected_forms || {},
      nextForm.part_of_speech,
    )
    setForm(nextForm)
    setInflectionRows(nextInflectionRows)
    setShowVariants(nextForm.variants.length > 0)
    setShowUsageNotes(Boolean(nextForm.usage_notes))
    setShowEtymology(Boolean(nextForm.etymology))
    setShowInflectedForms(nextInflectionRows.length > 0)
    setHasExistingAudioMedia(Boolean(revision.proposed_data?.audio_pronunciation || revision.audio_pronunciation))
    setHasExistingPhotoMedia(Boolean(revision.proposed_data?.photo || revision.photo))
    setAudioPreview(revision.audio_pronunciation_url || '')
    setPhotoPreview(revision.photo_url || '')
    setVariantAudioFiles({})
    setVariantAudioPreviews({})
    setFieldErrors({})
    setUnlockedFields({})
    setCurrentRevisionStatus(revision.status || '')
    setCurrentRevisionCreatedAt(revision.created_at || '')
  }

  function validateRequiredFields() {
    const nextErrors = {}
    if (!String(form.term || '').trim()) {
      nextErrors.term = 'Headword is required.'
    }
    if (!String(form.meaning || '').trim()) {
      nextErrors.meaning = 'Meaning is required.'
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setError('Please complete the required fields marked with *.')
      return false
    }
    return true
  }

  function validateAttribution() {
    if (form.term_source_is_self_knowledge === null) {
      setError('Please answer whether this headword is based on your own knowledge.')
      return false
    }

    if (!form.term_source_is_self_knowledge) {
      if (!selectedTermSourceConfig) {
        setError('Please choose a headword source type.')
        return false
      }
      if (!isConfigComplete(selectedTermSourceConfig, termSourceValues)) {
        setError('Please complete all required fields for the selected headword source type.')
        return false
      }
    }

    if (!form.term_source_is_self_knowledge && !String(buildSourceLine('Source', selectedTermSourceConfig, termSourceValues) || '').trim()) {
      setError('Headword source is required unless based on your own knowledge.')
      return false
    }

    const hasAudioMedia = Boolean(audioFile || audioPreview || hasExistingAudioMedia)
    const hasPhotoMedia = Boolean(photoFile || photoPreview || hasExistingPhotoMedia)

    if (hasAudioMedia && form.audio_source_is_self_recorded === null) {
      setError('Please answer whether the audio is self-recorded.')
      return false
    }

    if (hasPhotoMedia && form.photo_source_is_contributor_owned === null) {
      setError('Please answer whether the photo is contributor-owned.')
      return false
    }

    if (hasAudioMedia && !form.audio_source_is_self_recorded) {
      if (!selectedAudioSourceConfig) {
        setError('Please choose an audio source type.')
        return false
      }
      if (!isConfigComplete(selectedAudioSourceConfig, audioSourceValues)) {
        setError('Please complete all required fields for the selected audio source type.')
        return false
      }
    }

    if (hasAudioMedia && !form.audio_source_is_self_recorded && !String(buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues) || '').trim()) {
      setError('Audio source is required unless personally owned or produced by you.')
      return false
    }

    if (hasPhotoMedia && !form.photo_source_is_contributor_owned) {
      if (!selectedPhotoSourceConfig) {
        setError('Please choose a photo source type.')
        return false
      }
      if (!isConfigComplete(selectedPhotoSourceConfig, photoSourceValues)) {
        setError('Please complete all required fields for the selected photo source type.')
        return false
      }
    }

    if (hasPhotoMedia && !form.photo_source_is_contributor_owned && !String(buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues) || '').trim()) {
      setError('Photo source is required unless personally owned or produced by you.')
      return false
    }

    for (let index = 0; index < form.variants.length; index += 1) {
      const variant = form.variants[index]
      const hasVariantAudio = Boolean(variantAudioFiles[index])
      if (!hasVariantAudio) continue
      if (variant.audio_source_is_self_recorded === null) {
        setError(`Please answer whether Variant ${index + 1} audio is self-recorded.`)
        return false
      }
      if (variant.audio_source_is_self_recorded === false) {
        const variantSourceConfig = resolveSourceConfig(DICTIONARY_AUDIO_SOURCE_TYPES, variant.audio_source_type)
        if (!variantSourceConfig) {
          setError(`Please choose a source type for Variant ${index + 1} audio.`)
          return false
        }
        if (!isConfigComplete(variantSourceConfig, variant.audio_source_details || {})) {
          setError(`Please complete all required source details for Variant ${index + 1} audio.`)
          return false
        }
        const variantSourceLine = buildSourceLine('Audio Source', variantSourceConfig, variant.audio_source_details || {})
        if (!String(variantSourceLine || '').trim()) {
          setError(`Variant ${index + 1} audio source is required unless it is self-recorded.`)
          return false
        }
      }
    }

    return true
  }

  async function fetchMyRevisions() {
    const payload = await apiRequest('/api/dictionary/revisions/my')
    const rows = payload.rows || []
    setMyRevisions(rows)
    return rows
  }

  async function run(action) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (requestError) {
      const detail =
        requestError instanceof SyntaxError
          ? 'Inflected forms must be valid before you can save this draft.'
          : requestError.message
      setError(detail)
    } finally {
      setBusy(false)
    }
  }

  async function loadMyRevisions() {
    await run(async () => {
      const rows = await fetchMyRevisions()
      setMessage(rows.length ? 'Loaded your dictionary revisions.' : 'No dictionary revisions found for this user.')
    })
  }

  async function createDraft() {
    if (!validateRequiredFields()) return
    if (!validateAttribution()) return
    await run(async () => {
      const payload = await apiRequest('/api/dictionary/revisions/create', {
        method: 'POST',
        body: buildFormData(),
      })
      setRevisionId(payload.revision_id || '')
      setCurrentRevisionStatus(payload.status || 'draft')
      setCurrentRevisionCreatedAt(payload.created_at || '')
      setHasExistingAudioMedia(Boolean(payload.audio_pronunciation || audioFile))
      setHasExistingPhotoMedia(Boolean(payload.photo || photoFile))
      if (payload.audio_pronunciation_url) setAudioPreview(payload.audio_pronunciation_url)
      if (payload.photo_url) setPhotoPreview(payload.photo_url)
      setMessage(`Dictionary draft created: ${payload.revision_id}`)
      await fetchMyRevisions()
    })
  }

  async function searchPublishedEntries() {
    const trimmedQuery = revisionSearchTerm.trim()
    if (!trimmedQuery) {
      setRevisionSearchRows([])
      setError('Enter a headword to search published entries.')
      return
    }

    setRevisionSearchBusy(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('limit', '8')
      params.set('sort', 'alpha')
      params.set('q', trimmedQuery)
      const payload = await apiRequest(`/api/dictionary/entries?${params.toString()}`)
      setRevisionSearchRows(payload.rows || [])
      if (!(payload.rows || []).length) {
        setMessage(`No published entries found for "${trimmedQuery}".`)
      }
    } catch (requestError) {
      setError(requestError.message)
      setRevisionSearchRows([])
    } finally {
      setRevisionSearchBusy(false)
    }
  }

  async function revisePublishedEntry(nextEntryId) {
    if (!nextEntryId) return

    await run(async () => {
      const payload = await apiRequest(`/api/dictionary/entries/${nextEntryId}/revisions/start`, {
        method: 'POST',
      })
      setRevisionId(payload.revision_id || '')
      setCurrentRevisionStatus(payload.status || 'draft')
      setCurrentRevisionCreatedAt(payload.created_at || '')
      setEntryId(payload.entry_id || nextEntryId)
      setAutoRevisionStarted(true)
      loadRevisionIntoForm(payload)
      setMessage('Loaded the published entry into a revision draft.')
      await fetchMyRevisions()
    })
  }

  async function updateDraft() {
    const trimmedRevisionId = revisionId.trim()
    if (!trimmedRevisionId) {
      setError('Enter revision ID first.')
      return
    }
    if (!isEditableDraft) {
      setError(`This revision is ${currentRevisionStatus || 'not editable'}. Only DRAFT revisions are editable.`)
      return
    }
    if (!validateRequiredFields()) return
    if (!validateAttribution()) return

    await run(async () => {
      const payload = await apiRequest(`/api/dictionary/revisions/${trimmedRevisionId}`, {
        method: 'POST',
        body: buildFormData(),
      })
      setHasExistingAudioMedia(Boolean(payload.audio_pronunciation || audioFile))
      setHasExistingPhotoMedia(Boolean(payload.photo || photoFile))
      setCurrentRevisionStatus(payload.status || currentRevisionStatus || '')
      setCurrentRevisionCreatedAt(payload.created_at || currentRevisionCreatedAt || '')
      if (payload.audio_pronunciation_url) setAudioPreview(payload.audio_pronunciation_url)
      if (payload.photo_url) setPhotoPreview(payload.photo_url)
      setMessage(`Dictionary draft updated: ${payload.revision_id}`)
      await fetchMyRevisions()
    })
  }

  async function submitDraft() {
    const trimmedRevisionId = revisionId.trim()
    if (!trimmedRevisionId) {
      setError('Enter revision ID first.')
      return
    }
    if (!isEditableDraft) {
      setError(`This revision is ${currentRevisionStatus || 'not editable'}. Only DRAFT revisions can be submitted.`)
      return
    }
    if (!validateRequiredFields()) return
    if (!validateAttribution()) return

    await run(async () => {
      const payload = await apiRequest(`/api/dictionary/revisions/${trimmedRevisionId}/submit`, {
        method: 'POST',
      })
      setCurrentRevisionStatus(payload.status || 'pending')
      setCurrentRevisionCreatedAt(payload.created_at || currentRevisionCreatedAt || '')
      setMessage(`Dictionary draft submitted. Status: ${payload.status}`)
      celebrateContribution('dictionary')
      await fetchMyRevisions()
    })
  }

  function clearDraftContext() {
    setRevisionId('')
    setCurrentRevisionStatus('')
    setCurrentRevisionCreatedAt('')
    setEntryId('')
    setAutoRevisionStarted(false)
    setForm(INITIAL_FORM)
    setInflectionRows([])
    setAudioFile(null)
    setPhotoFile(null)
    setAudioPreview('')
    setPhotoPreview('')
    setPhotoWarning('')
    setVariantAudioFiles({})
    setVariantAudioPreviews({})
    setHasExistingAudioMedia(false)
    setHasExistingPhotoMedia(false)
    setMatchingHeadwordRows([])
    setDismissedHeadword('')
    setShowVariants(false)
    setShowUsageNotes(false)
    setShowEtymology(false)
    setShowInflectedForms(false)
    setFieldErrors({})
    setUnlockedFields({})
    setError('')
    setMessage('Form cleared.')
    window.history.replaceState({}, '', ROUTES.dictionaryDraft)
  }

  const normalizedHeadword = form.term.trim().toLowerCase()
  const hasAudioMedia = Boolean(audioFile || audioPreview || hasExistingAudioMedia)
  const hasPhotoMedia = Boolean(photoFile || photoPreview || hasExistingPhotoMedia)
  const selectedTermSourceConfig = resolveSourceConfig(DICTIONARY_TERM_SOURCE_TYPES, termSourceType)
  const selectedAudioSourceConfig = resolveSourceConfig(DICTIONARY_AUDIO_SOURCE_TYPES, audioSourceType)
  const selectedPhotoSourceConfig = resolveSourceConfig(DICTIONARY_PHOTO_SOURCE_TYPES, photoSourceType)
  const previewTermSource =
    form.term_source_is_self_knowledge === true
      ? ''
      : buildSourceLine('Source', selectedTermSourceConfig, termSourceValues)
  const previewAudioSource =
    hasAudioMedia && form.audio_source_is_self_recorded === true
      ? `Audio Source: ${SOURCE_OWNER_LABEL}`
      : hasAudioMedia
        ? buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues)
        : ''
  const previewPhotoSource =
    hasPhotoMedia && form.photo_source_is_contributor_owned === true
      ? `Photo Source: ${SOURCE_OWNER_LABEL}`
      : hasPhotoMedia
        ? buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues)
        : ''
  const revisionGroups = {
    draft: myRevisions.filter((item) => String(item.status || '').toLowerCase() === 'draft'),
    pending: myRevisions.filter((item) => String(item.status || '').toLowerCase() === 'pending'),
    approved: myRevisions.filter((item) => String(item.status || '').toLowerCase() === 'approved'),
    rejected: myRevisions.filter((item) => String(item.status || '').toLowerCase() === 'rejected'),
    other: myRevisions.filter((item) => !['draft', 'pending', 'approved', 'rejected'].includes(String(item.status || '').toLowerCase())),
  }

  function helperTextForStatus(status, createdAt) {
    const normalized = String(status || '').toLowerCase()
    if (normalized === 'draft') return 'This draft has not been submitted and is still editable.'
    if (normalized === 'pending') {
      const dateText = createdAt ? new Date(createdAt).toLocaleDateString() : 'an earlier date'
      return `This submission was sent on ${dateText}. Editing is locked while under review.`
    }
    if (normalized === 'approved') return 'This submission is approved. Start a new revision to make changes.'
    if (normalized === 'rejected') return 'This submission was rejected. Revise this submission and apply reviewer feedback.'
    return 'This submission has a custom status. Open it to review details.'
  }

  function openRevisionCard(revision) {
    setRevisionId(revision.revision_id)
    setCurrentRevisionStatus(revision.status || '')
    setCurrentRevisionCreatedAt(revision.created_at || '')
    setEntryId(revision.entry_id || '')
    setAutoRevisionStarted(Boolean(revision.entry_id))
    loadRevisionIntoForm(revision)
    setMessage(`Loaded revision ${revision.revision_id} into the form.`)
  }

  function renderRevisionGroup(title, rows) {
    if (!rows.length) return null
    return (
      <>
        <h4>{title}</h4>
        <div className="card-list">
          {rows.map((revision) => {
            const normalized = String(revision.status || '').toLowerCase()
            const primaryLabel =
              normalized === 'draft'
                ? 'Continue Editing'
                : normalized === 'rejected'
                  ? 'Revise This Submission'
                  : normalized === 'pending'
                    ? 'View Submitted Copy'
                    : normalized === 'approved'
                      ? 'Start New Revision'
                      : 'Open Submission'
            return (
              <article key={revision.revision_id} className="queue-card">
                <div className="queue-header">
                  <strong>{revision.term || '(no headword)'}</strong>
                  <span className="badge">{revision.status}</span>
                </div>
                <p className="meta">{helperTextForStatus(revision.status, revision.created_at)}</p>
                <p className="meta">Revision: {revision.revision_id}</p>
                <p className="meta">Entry: {revision.entry_id || 'new submission'}</p>
                <p className="meta">Meaning: {revision.meaning || '-'}</p>
                <p className="meta">Part of Speech: {revision.part_of_speech || '-'}</p>
                <div className="actions">
                  <button
                    className="ghost"
                    disabled={normalized === 'approved' && !revision.entry_id}
                    onClick={() => {
                      if (normalized === 'approved') {
                        if (revision.entry_id) {
                          revisePublishedEntry(revision.entry_id)
                        } else {
                          setError('Approved original submissions without an entry link cannot auto-start a revision yet.')
                        }
                        return
                      }
                      openRevisionCard(revision)
                    }}
                  >
                    {primaryLabel}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </>
    )
  }
  const showMatchingHeadwordPanel =
    normalizedHeadword &&
    matchingHeadwordRows.length > 0 &&
    dismissedHeadword !== normalizedHeadword &&
    !isRevisionMode &&
    !isSavedDraft

  function isFieldLocked(fieldName, currentValue) {
    return isRevisionMode && hasContent(currentValue) && !unlockedFields[fieldName]
  }

  function unlockField(fieldName) {
    setUnlockedFields((current) => ({ ...current, [fieldName]: true }))
  }

  function renderLockedField(fieldName, label, value) {
    return (
      <div className="locked-field-display" role="group" aria-label={`${label} locked field`}>
        <div className="locked-field-header">
          <strong>{label}</strong>
          <button type="button" className="field-edit-icon" onClick={() => unlockField(fieldName)} aria-label={`Edit ${label}`}>
            ✎
          </button>
        </div>
        <p>{String(value || '').trim() || '-'}</p>
      </div>
    )
  }

  function updateSourceValues(setter, key, value) {
    setter((current) => ({ ...current, [key]: value }))
  }

  function renderSourceFields(config, values, setter, idPrefix) {
    if (!config) return null
    return (
      <div className="field-grid">
        {config.fields.map((field) => (
          <div key={`${idPrefix}-${field.key}`} className="field">
            <label htmlFor={`${idPrefix}-${field.key}`}>
              {field.label} <RequiredMark />{' '}
              {isFieldLocked(`${idPrefix}.${field.key}`, values[field.key]) && (
                <button type="button" className="inline-link-button" onClick={() => unlockField(`${idPrefix}.${field.key}`)}>
                  ✏️ Edit
                </button>
              )}
            </label>
            {field.type === 'select' ? (
              <select
                id={`${idPrefix}-${field.key}`}
                value={values[field.key] || ''}
                required
                disabled={isFieldLocked(`${idPrefix}.${field.key}`, values[field.key])}
                onChange={(event) => updateSourceValues(setter, field.key, event.target.value)}
              >
                <option value="">Select {field.label.toLowerCase()}</option>
                {(field.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${idPrefix}-${field.key}`}
                type={field.type || 'text'}
                value={values[field.key] || ''}
                required
                readOnly={isFieldLocked(`${idPrefix}.${field.key}`, values[field.key])}
                onChange={(event) => updateSourceValues(setter, field.key, event.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  function playAudio(url) {
    if (!url) return
    try {
      const audio = new Audio(url)
      audio.play()
    } catch {
      setError('Could not play audio preview.')
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Dictionary Draft Builder</h2>
        <div className="dictionary-top-grid">
          <section className="role-work-panel draft-new-term-panel">
            <div className="section-heading">
              <div>
                <h3>Add a New Dictionary Term</h3>
                <p className="muted">
                  Start with the headword. If a matching published term already exists, you can revise it instead or
                  continue with a different meaning.
                </p>
              </div>
            </div>
          </section>

          <div className="dictionary-side-stack">
            <section className="role-work-panel draft-revision-picker">
              <div className="section-heading">
                <div>
                  <h3>{isRevisionMode ? 'Choose Another Published Entry' : 'Find a Published Entry to Revise'}</h3>
                </div>
              </div>
              <div className="dictionary-search-row">
                <input
                  value={revisionSearchTerm}
                  onChange={(event) => setRevisionSearchTerm(event.target.value)}
                  placeholder="Search published headword..."
                  aria-label="Search published dictionary headword to revise"
                />
                <button onClick={() => searchPublishedEntries()} disabled={revisionSearchBusy || busy}>
                  {revisionSearchBusy ? 'Searching...' : 'Search'}
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setRevisionSearchTerm('')
                    setRevisionSearchRows([])
                    setError('')
                  }}
                  disabled={revisionSearchBusy || busy}
                >
                  Clear
                </button>
              </div>
              {revisionSearchRows.length > 0 && (
                <div className="card-list">
                  {revisionSearchRows.map((row) => (
                    <article key={row.entry_id} className="queue-card">
                      <div className="queue-header">
                        <strong>{row.term}</strong>
                        <span className="badge">{row.status}</span>
                      </div>
                      {row.part_of_speech && <p className="meta">Part of Speech: {row.part_of_speech}</p>}
                      {row.meaning && <p className="meta">Meaning: {row.meaning}</p>}
                      <div className="actions">
                        <button className="ghost" onClick={() => navigate(`${ROUTES.dictionaryView}?entry_id=${row.entry_id}`)}>
                          View Published Entry
                        </button>
                        <button onClick={() => revisePublishedEntry(row.entry_id)}>Revise This Entry</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {(isRevisionMode || isSavedDraft) && (
              <section className="role-status-card draft-status-card" aria-live="polite">
                <p className="profile-kicker">{isRevisionMode ? 'Revision Draft' : 'Saved Draft'}</p>
                <h3>{form.term || (isRevisionMode ? 'Preparing selected entry...' : 'Draft in progress')}</h3>
                <p className="muted">
                  {isRevisionMode
                    ? 'This draft is linked to a published dictionary entry. The entry ID is being handled in the background.'
                    : normalizedRevisionStatus === 'draft'
                      ? 'This draft has not been submitted and is still editable.'
                      : normalizedRevisionStatus === 'pending'
                        ? `This submission was sent on ${
                            currentRevisionCreatedAt ? new Date(currentRevisionCreatedAt).toLocaleDateString() : 'review queue'
                          }. Editing is locked while under review. Revisions can be made after approved/rejected.`
                        : normalizedRevisionStatus === 'approved'
                          ? 'This submission is approved. Start a new revision to make changes.'
                          : normalizedRevisionStatus === 'rejected'
                            ? 'This submission was rejected. You can revise this same submission and apply reviewer feedback.'
                            : 'This submission is currently locked.'}
                </p>
                <div className="detail-list split-list">
                  {isRevisionMode && (
                    <div className="detail-row">
                      <dt>Published entry</dt>
                      <dd>{entryId}</dd>
                    </div>
                  )}
                  {isSavedDraft && (
                    <div className="detail-row">
                      <dt>Draft revision</dt>
                      <dd>{revisionId}</dd>
                    </div>
                  )}
                {isSavedDraft && (
                  <div className="detail-row">
                    <dt>Status</dt>
                    <dd>{normalizedRevisionStatus || '-'}</dd>
                  </div>
                )}
                </div>
                {isSavedDraft && !isEditableDraft && normalizedRevisionStatus === 'pending' && (
                  <p className="muted">Wait for review outcome. You can edit this again if it is rejected.</p>
                )}
                {isSavedDraft && !isEditableDraft && normalizedRevisionStatus === 'approved' && (
                  <p className="muted">To change an approved submission, open the published entry and start a new revision.</p>
                )}
              </section>
            )}
          </div>
        </div>

        <div className="dictionary-primary-fields">
          <div className="field dictionary-term-field">
            <label htmlFor="dictionary-term">
              Headword <RequiredMark />{' '}
              {isFieldLocked('term', form.term) && (
                <button type="button" className="inline-link-button" onClick={() => unlockField('term')}>
                  ✏️ Edit
                </button>
              )}
            </label>
            {isFieldLocked('term', form.term) ? (
              renderLockedField('term', 'Headword', form.term)
            ) : (
              <input
                id="dictionary-term"
                placeholder="Enter headword..."
                value={form.term}
                aria-invalid={Boolean(fieldErrors.term)}
                aria-describedby={fieldErrors.term ? 'dictionary-term-error' : undefined}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setField('term', nextValue)
                  if (nextValue.trim().toLowerCase() !== dismissedHeadword) {
                    setDismissedHeadword('')
                  }
                }}
              />
            )}
            {fieldErrors.term && (
              <p className="inline-error" id="dictionary-term-error">
                {fieldErrors.term}
              </p>
            )}
            {matchingHeadwordBusy && <p className="hint">Checking for existing published headwords...</p>}
            {showMatchingHeadwordPanel && (
              <div className="duplicate-headword-panel" aria-live="polite">
                <p className="duplicate-headword-title">A published entry with this headword already exists.</p>
                <p className="muted">
                  If you mean the same word, revise the existing entry. If your entry has a different meaning, you can
                  continue with a new entry using the same headword.
                </p>
                <div className="card-list">
                  {matchingHeadwordRows.map((row) => (
                    <article key={row.entry_id} className="queue-card">
                      <div className="queue-header">
                        <strong>{row.term}</strong>
                        <span className="badge">{row.status}</span>
                      </div>
                      {row.part_of_speech && <p className="meta">Part of Speech: {row.part_of_speech}</p>}
                      {row.meaning && <p className="meta">Meaning: {row.meaning}</p>}
                      <div className="actions">
                        <button className="ghost" onClick={() => navigate(`${ROUTES.dictionaryView}?entry_id=${row.entry_id}`)}>
                          View Published Entry
                        </button>
                        <button onClick={() => revisePublishedEntry(row.entry_id)}>Revise Existing Entry</button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="actions">
                  <button className="ghost" onClick={() => setDismissedHeadword(normalizedHeadword)}>
                    Continue New Entry With Different Meaning
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="field dictionary-meaning-field">
            <label htmlFor="dictionary-meaning">
              Meaning <RequiredMark />{' '}
              {isFieldLocked('meaning', form.meaning) && (
                <button type="button" className="inline-link-button" onClick={() => unlockField('meaning')}>
                  ✏️ Edit
                </button>
              )}
            </label>
            {isFieldLocked('meaning', form.meaning) ? (
              renderLockedField('meaning', 'Meaning', form.meaning)
            ) : (
              <textarea
                id="dictionary-meaning"
                rows={4}
                value={form.meaning}
                aria-invalid={Boolean(fieldErrors.meaning)}
                aria-describedby={fieldErrors.meaning ? 'dictionary-meaning-error' : undefined}
                onChange={(event) => setField('meaning', event.target.value)}
              />
            )}
            {fieldErrors.meaning && (
              <p className="inline-error" id="dictionary-meaning-error">
                {fieldErrors.meaning}
              </p>
            )}
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="dictionary-pos">
              Part of Speech{' '}
              {isFieldLocked('part_of_speech', form.part_of_speech) && (
                <button type="button" className="inline-link-button" onClick={() => unlockField('part_of_speech')}>
                  ✏️ Edit
                </button>
              )}
            </label>
            {isFieldLocked('part_of_speech', form.part_of_speech) ? (
              renderLockedField('part_of_speech', 'Part of Speech', form.part_of_speech)
            ) : (
              <select
                id="dictionary-pos"
                value={form.part_of_speech}
                onChange={(event) => setField('part_of_speech', event.target.value)}
              >
                <option value="">Select part of speech</option>
                {PART_OF_SPEECH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="field">
            <FieldHeader
              htmlFor="dictionary-variant"
              guideAnchor="guide-variants"
              label="Variant Type"
            />
            <select
              id="dictionary-variant"
              value={form.variant_type}
              onChange={(event) => setField('variant_type', event.target.value)}
            >
              {VARIANT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <FieldHeader
              htmlFor="dictionary-pronunciation"
              guideAnchor="guide-pronunciation"
              label="Pronunciation Text"
            />
            {isFieldLocked('pronunciation_text', form.pronunciation_text) ? (
              renderLockedField('pronunciation_text', 'Pronunciation Text', form.pronunciation_text)
            ) : (
              <input
                id="dictionary-pronunciation"
                value={form.pronunciation_text}
                onChange={(event) => setField('pronunciation_text', event.target.value)}
              />
            )}
          </div>
          <div className="field">
            <FieldHeader
              htmlFor="dictionary-phonetic"
              guideAnchor="guide-pronunciation"
              label="Phonetic Notation"
            />
            {isFieldLocked('phonetic', form.phonetic) ? (
              renderLockedField('phonetic', 'Phonetic Notation', form.phonetic)
            ) : (
              <input
                id="dictionary-phonetic"
                value={form.phonetic}
                onChange={(event) => setField('phonetic', event.target.value)}
                placeholder="Example: /ra.kuh/ or [ra-kuh]"
              />
            )}
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="dictionary-english-synonym">English Synonyms</label>
            <input
              id="dictionary-english-synonym"
              value={form.english_synonym}
              readOnly={isFieldLocked('english_synonym', form.english_synonym)}
              onChange={(event) => setField('english_synonym', event.target.value)}
              placeholder="Comma-separated synonyms"
            />
          </div>
          <div className="field">
            <label htmlFor="dictionary-ivatan-synonym">Ivatan Synonyms</label>
            <input
              id="dictionary-ivatan-synonym"
              value={form.ivatan_synonym}
              readOnly={isFieldLocked('ivatan_synonym', form.ivatan_synonym)}
              onChange={(event) => setField('ivatan_synonym', event.target.value)}
              placeholder="Comma-separated synonyms"
            />
          </div>
          <div className="field">
            <label htmlFor="dictionary-english-antonym">English Antonyms</label>
            <input
              id="dictionary-english-antonym"
              value={form.english_antonym}
              readOnly={isFieldLocked('english_antonym', form.english_antonym)}
              onChange={(event) => setField('english_antonym', event.target.value)}
              placeholder="Comma-separated antonyms"
            />
          </div>
          <div className="field">
            <label htmlFor="dictionary-ivatan-antonym">Ivatan Antonyms</label>
            <input
              id="dictionary-ivatan-antonym"
              value={form.ivatan_antonym}
              readOnly={isFieldLocked('ivatan_antonym', form.ivatan_antonym)}
              onChange={(event) => setField('ivatan_antonym', event.target.value)}
              placeholder="Comma-separated antonyms"
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="dictionary-example">Example Sentence in Ivatan</label>
            <textarea
              id="dictionary-example"
              rows={3}
              value={form.example_sentence}
              readOnly={isFieldLocked('example_sentence', form.example_sentence)}
              onChange={(event) => setField('example_sentence', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="dictionary-translation">Example Translation Sentence in English</label>
            <textarea
              id="dictionary-translation"
              rows={3}
              value={form.example_translation}
              readOnly={isFieldLocked('example_translation', form.example_translation)}
              onChange={(event) => setField('example_translation', event.target.value)}
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="dictionary-audio-upload">Audio Pronunciation Upload</label>
            <input id="dictionary-audio-upload" type="file" accept="audio/*" onChange={handleAudioChange} />
            {hasAudioMedia && (
              <div className="field">
                <FieldHeader htmlFor="dictionary-audio-source" guideAnchor="guide-sources" label="Audio Source" />
                <YesNoField
                  legend="Is this audio recording personally owned or produced by you?"
                  name="audio-source-self-recorded"
                  value={form.audio_source_is_self_recorded}
                  onChange={(nextValue) => {
                    if (isFieldLocked('audio_source_is_self_recorded', form.audio_source_is_self_recorded)) return
                    setField('audio_source_is_self_recorded', nextValue)
                    if (nextValue) {
                      setField('audio_source', '')
                    }
                  }}
                />
                {form.audio_source_is_self_recorded === false && (
                  <>
                    <label htmlFor="dictionary-audio-source-type">
                      Source Type <RequiredMark />
                    </label>
                    <select id="dictionary-audio-source-type" required value={audioSourceType} onChange={(event) => setAudioSourceType(event.target.value)}>
                      <option value="">Select source type</option>
                      {DICTIONARY_AUDIO_SOURCE_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {selectedAudioSourceConfig && <p className="hint">{selectedAudioSourceConfig.guidance}</p>}
                    {renderSourceFields(selectedAudioSourceConfig, audioSourceValues, setAudioSourceValues, 'dictionary-audio-source')}
                  </>
                )}
                {form.audio_source_is_self_recorded === true && <p className="hint">Audio Source: {SOURCE_OWNER_LABEL}</p>}
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="dictionary-photo-upload">Photo Upload</label>
            <input id="dictionary-photo-upload" type="file" accept="image/*" onChange={handlePhotoChange} />
            {photoWarning && <p className="inline-ok">{photoWarning}</p>}
            {hasPhotoMedia && (
              <div className="field">
                <FieldHeader htmlFor="dictionary-photo-source" guideAnchor="guide-sources" label="Photo Source" />
                <YesNoField
                  legend="Is this photo owned or produced by you?"
                  name="photo-source-contributor-owned"
                  value={form.photo_source_is_contributor_owned}
                  onChange={(nextValue) => {
                    if (isFieldLocked('photo_source_is_contributor_owned', form.photo_source_is_contributor_owned)) return
                    setField('photo_source_is_contributor_owned', nextValue)
                    if (nextValue) {
                      setField('photo_source', '')
                    }
                  }}
                />
                {form.photo_source_is_contributor_owned === false && (
                  <>
                    <label htmlFor="dictionary-photo-source-type">
                      Source Type <RequiredMark />
                    </label>
                    <select id="dictionary-photo-source-type" required value={photoSourceType} onChange={(event) => setPhotoSourceType(event.target.value)}>
                      <option value="">Select source type</option>
                      {DICTIONARY_PHOTO_SOURCE_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {selectedPhotoSourceConfig && <p className="hint">{selectedPhotoSourceConfig.guidance}</p>}
                    {renderSourceFields(selectedPhotoSourceConfig, photoSourceValues, setPhotoSourceValues, 'dictionary-photo-source')}
                  </>
                )}
                {form.photo_source_is_contributor_owned === true && <p className="hint">Photo Source: {SOURCE_OWNER_LABEL}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <FieldHeader htmlFor="dictionary-source" guideAnchor="guide-sources" label="Headword Source" />
          {isFieldLocked('term_source_is_self_knowledge', form.term_source_is_self_knowledge) && (
            <p className="hint">
              <button type="button" className="inline-link-button" onClick={() => unlockField('term_source_is_self_knowledge')}>
                ✏️ Edit source settings
              </button>
            </p>
          )}
          <YesNoField
            legend="Is this entry based on your own knowledge or lived use of the language?"
            name="term-source-self-knowledge"
            value={form.term_source_is_self_knowledge}
            onChange={(nextValue) => {
              if (isFieldLocked('term_source_is_self_knowledge', form.term_source_is_self_knowledge)) return
              setField('term_source_is_self_knowledge', nextValue)
              if (nextValue) {
                setField('source_text', '')
              }
            }}
          />
          {form.term_source_is_self_knowledge === false && (
            <>
              <label htmlFor="dictionary-term-source-type">
                Source Type <RequiredMark />
              </label>
              <select id="dictionary-term-source-type" required value={termSourceType} onChange={(event) => setTermSourceType(event.target.value)}>
                <option value="">Select source type</option>
                {DICTIONARY_TERM_SOURCE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {selectedTermSourceConfig && <p className="hint">{selectedTermSourceConfig.guidance}</p>}
              {renderSourceFields(selectedTermSourceConfig, termSourceValues, setTermSourceValues, 'dictionary-term-source')}
            </>
          )}
        </div>


        <section className="draft-subsection draft-compact-stack">
          <div className="section-heading">
            <div>
              <h3>Optional Language Details</h3>
            </div>
          </div>

          <div className="draft-toggle-row" aria-label="Optional entry detail sections">
            {showVariants ? (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  Object.values(variantAudioPreviews).forEach((previewUrl) => {
                    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
                  })
                  setForm((prev) => ({ ...prev, variants: [] }))
                  setVariantAudioFiles({})
                  setVariantAudioPreviews({})
                  setShowVariants(false)
                }}
              >
                Remove Variants
              </button>
            ) : (
              <button className="ghost" type="button" onClick={openVariantsWithInitialRow}>
                Add Variants
              </button>
            )}
            {showInflectedForms ? (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setInflectionRows([])
                  setShowInflectedForms(false)
                }}
              >
                Remove Inflected Forms
              </button>
            ) : (
              <button className="ghost" type="button" onClick={openInflectedFormsWithInitialRow}>
                Add Inflected Forms
              </button>
            )}
            {showUsageNotes ? (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setField('usage_notes', '')
                  setShowUsageNotes(false)
                }}
              >
                Remove Usage Notes
              </button>
            ) : (
              <button className="ghost" type="button" onClick={() => setShowUsageNotes(true)}>
                Add Usage Notes
              </button>
            )}
            {showEtymology ? (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setField('etymology', '')
                  setShowEtymology(false)
                }}
              >
                Remove Etymology
              </button>
            ) : (
              <button className="ghost" type="button" onClick={() => setShowEtymology(true)}>
                Add Etymology
              </button>
            )}
          </div>

          {showUsageNotes && (
            <section className="draft-mini-section">
              <div className="section-heading">
                <div>
                  <h4>Usage Notes</h4>
                  <p className="muted">
                    Explain context, tone, municipality use, or who usually says the word.{' '}
                    <GuideLink anchor="guide-usage-notes">Learn More</GuideLink>
                  </p>
                </div>
              </div>
              <div className="field compact-field">
                <textarea
                  id="dictionary-usage"
                  rows={2}
                  value={form.usage_notes}
                  onChange={(event) => setField('usage_notes', event.target.value)}
                />
              </div>
            </section>
          )}

          {showEtymology && (
            <section className="draft-mini-section">
              <div className="section-heading">
                <div>
                  <h4>Etymology</h4>
                  <p className="muted">
                    Add origin notes only when you are reasonably confident. <GuideLink anchor="guide-etymology">Learn More</GuideLink>
                  </p>
                </div>
              </div>
              <div className="field compact-field">
                <textarea
                  id="dictionary-etymology"
                  rows={2}
                  value={form.etymology}
                  onChange={(event) => setField('etymology', event.target.value)}
                />
              </div>
            </section>
          )}

          {showVariants && (
            <section className="draft-mini-section">
              <div className="section-heading">
                <div>
                  <h4>Additional Variants</h4>
                  <p className="muted">
                    <GuideLink anchor="guide-variants">Learn More</GuideLink>
                  </p>
                </div>
                <button className="ghost" type="button" onClick={addVariant}>
                  Add Variant
                </button>
              </div>

              {form.variants.length === 0 && <p className="muted">No additional variants added yet.</p>}
              <div className="variant-card-list">
                {form.variants.map((variant, index) => (
                  <article key={`variant-${index}`} className="variant-card">
                    <div className="section-heading">
                      <h4>Variant {index + 1}</h4>
                      <button className="ghost" type="button" onClick={() => removeVariant(index)}>
                        Remove
                      </button>
                    </div>
                    <div className="field-grid">
                      <div className="field">
                        <label htmlFor={`variant-term-${index}`}>Variant Headword</label>
                        <input
                          id={`variant-term-${index}`}
                          value={variant.term}
                          onChange={(event) => setVariantField(index, 'term', event.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`variant-type-${index}`}>Variant Type</label>
                        <select
                          id={`variant-type-${index}`}
                          value={variant.variant_type}
                          onChange={(event) => setVariantField(index, 'variant_type', event.target.value)}
                        >
                          {VARIANT_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <FieldHeader
                          htmlFor={`variant-pronunciation-${index}`}
                          guideAnchor="guide-pronunciation"
                          label="Pronunciation Text"
                        />
                        <input
                          id={`variant-pronunciation-${index}`}
                          value={variant.pronunciation_text}
                          onChange={(event) => setVariantField(index, 'pronunciation_text', event.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`variant-audio-${index}`}>Variant Audio File</label>
                        <input
                          id={`variant-audio-${index}`}
                          type="file"
                          accept="audio/*"
                          onChange={(event) => handleVariantAudioChange(index, event)}
                        />
                        {variantAudioPreviews[index] && <audio controls src={variantAudioPreviews[index]} />}
                      </div>
                    </div>
                    <div className="field compact-field">
                      {variantAudioFiles[index] && (
                        <>
                          <FieldHeader
                            htmlFor={`variant-audio-source-${index}`}
                            guideAnchor="guide-sources"
                            label="Variant Audio Source"
                          />
                          <YesNoField
                            legend="Is this variant audio self-recorded?"
                            name={`variant-audio-source-self-recorded-${index}`}
                            value={variant.audio_source_is_self_recorded}
                            onChange={(nextValue) => {
                              setVariantField(index, 'audio_source_is_self_recorded', nextValue)
                              if (nextValue) {
                                setVariantField(index, 'audio_source', '')
                                setVariantField(index, 'audio_source_type', '')
                                setVariantField(index, 'audio_source_details', {})
                              }
                            }}
                          />
                          {variant.audio_source_is_self_recorded === false && (
                            <>
                              <label htmlFor={`variant-audio-source-type-${index}`}>
                                Source Type <RequiredMark />
                              </label>
                              <select
                                id={`variant-audio-source-type-${index}`}
                                required
                                value={variant.audio_source_type || ''}
                                onChange={(event) => {
                                  setVariantField(index, 'audio_source_type', event.target.value)
                                  setVariantField(index, 'audio_source_details', {})
                                }}
                              >
                                <option value="">Select source type</option>
                                {DICTIONARY_AUDIO_SOURCE_TYPES.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                              {variant.audio_source_type && (
                                <p className="hint">
                                  {resolveSourceConfig(DICTIONARY_AUDIO_SOURCE_TYPES, variant.audio_source_type)?.guidance}
                                </p>
                              )}
                              {variant.audio_source_type && (
                                <div className="field-grid">
                                  {(resolveSourceConfig(DICTIONARY_AUDIO_SOURCE_TYPES, variant.audio_source_type)?.fields || []).map((field) => (
                                    <div key={`variant-audio-${index}-${field.key}`} className="field">
                                      <label htmlFor={`variant-audio-${index}-${field.key}`}>
                                        {field.label} <RequiredMark />
                                      </label>
                                      <input
                                        id={`variant-audio-${index}-${field.key}`}
                                        type={field.type || 'text'}
                                        required
                                        value={variant.audio_source_details?.[field.key] || ''}
                                        onChange={(event) =>
                                          setVariantField(index, 'audio_source_details', {
                                            ...(variant.audio_source_details || {}),
                                            [field.key]: event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                          {variant.audio_source_is_self_recorded === true && (
                            <p className="hint">Audio Source: {SOURCE_OWNER_LABEL}</p>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {showInflectedForms && (
            <section className="draft-mini-section">
              <div className="section-heading">
                <div>
                  <h4>Inflected Forms</h4>
                  <p className="muted">
                    Add only the grammatical forms you truly know.{' '}
                    <GuideLink anchor="guide-inflected-forms">Learn More</GuideLink>
                  </p>
                </div>
                <button className="ghost" type="button" onClick={addInflectionRow}>
                  Add Form
                </button>
              </div>
              {inflectionRows.length === 0 && <p className="muted">No inflected forms added yet.</p>}
              <div className="inflection-row-list">
                {inflectionRows.map((row, index) => (
                  <div key={`inflection-${index}`} className={`inflection-row ${row.label === 'Other' ? 'has-custom' : ''}`}>
                    <label className="field" htmlFor={`inflection-label-${index}`}>
                      <span>Form Type</span>
                      <select
                        id={`inflection-label-${index}`}
                        value={row.label}
                        onChange={(event) => setInflectionRow(index, 'label', event.target.value)}
                      >
                        {inflectionOptionsForRow(form.part_of_speech, row.label).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    {row.label === 'Other' && (
                      <label className="field" htmlFor={`inflection-custom-label-${index}`}>
                        <span>Custom Type</span>
                        <input
                          id={`inflection-custom-label-${index}`}
                          value={row.customLabel || ''}
                          onChange={(event) => setInflectionRow(index, 'customLabel', event.target.value)}
                          placeholder="Enter the form type"
                        />
                      </label>
                    )}
                    <label className="field" htmlFor={`inflection-value-${index}`}>
                      <span>Form</span>
                      <input
                        id={`inflection-value-${index}`}
                        value={row.value}
                        onChange={(event) => setInflectionRow(index, 'value', event.target.value)}
                      />
                    </label>
                    <button className="ghost" type="button" onClick={() => removeInflectionRow(index)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="draft-preview-panel">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">Preview Before Review</p>
                <h3>Dictionary Entry Preview</h3>
              </div>
              <span className="badge">Live preview</span>
            </div>

            <article className="dictionary-entry-detail">
              <header className="dictionary-headword">
                <div className="dictionary-headword-row">
                  <h2>{form.term || 'Headword'}</h2>
                  {audioPreview && (
                    <button
                      type="button"
                      className="audio-icon-button audio-icon-inline"
                      onClick={() => playAudio(audioPreview)}
                      aria-label="Play pronunciation audio"
                    >
                      🔊
                    </button>
                  )}
                </div>
                <div className="dictionary-pronunciation-line">
                  {form.part_of_speech && <span>{form.part_of_speech}</span>}
                  {form.pronunciation_text && <span>{form.pronunciation_text}</span>}
                  {form.phonetic && <span>{form.phonetic}</span>}
                  {form.variant_type && <span>{form.variant_type}</span>}
                </div>
              </header>

              {form.variants.length > 0 && (
                <section className="dictionary-field-block">
                  <h4>Additional Variants</h4>
                  <div className="variant-preview-list">
                    {form.variants.map((variant, index) => (
                      <article key={`variant-preview-${index}`}>
                        <strong>{variant.term || `Variant ${index + 1}`}</strong>
                        <p className="meta">
                          {[variantForPayload(variant).variant_type, variant.pronunciation_text].filter(Boolean).join(' | ') ||
                            'Details not set'}
                        </p>
                        {variantAudioPreviews[index] && <audio controls src={variantAudioPreviews[index]} />}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {photoPreview && <img className="dictionary-photo-preview" src={photoPreview} alt="" />}
              <section className="dictionary-definition">
                <p className="definition-number">1</p>
                <p>{form.meaning || 'Meaning will appear here.'}</p>
              </section>

              {(form.example_sentence || form.example_translation) && (
                <section className="dictionary-field-block">
                  <h4>Sample Sentence</h4>
                  <div className="example-translation-grid">
                    <div>
                      <p className="meta">Ivatan</p>
                      <p>{form.example_sentence || '-'}</p>
                    </div>
                    <div>
                      <p className="meta">English</p>
                      <p>{form.example_translation || '-'}</p>
                    </div>
                  </div>
                </section>
              )}
              {form.usage_notes && (
                <section className="dictionary-field-block">
                  <h4>Usage Notes</h4>
                  <p>{form.usage_notes}</p>
                </section>
              )}
              {form.etymology && (
                <section className="dictionary-field-block">
                  <h4>Etymology</h4>
                  <p>{form.etymology}</p>
                </section>
              )}
              {inflectionRows.some((row) => row.label && row.value) && (
                <section className="dictionary-field-block">
                  <h4>Inflected Forms</h4>
                  <div className="dictionary-chip-row">
                    {inflectionRows
                      .filter((row) => row.label && row.value)
                      .map((row) => (
                        <span key={`${row.label}-${row.value}`}>
                          {row.label}: {row.value}
                        </span>
                      ))}
                  </div>
                </section>
              )}
              {(form.english_synonym || form.ivatan_synonym || form.english_antonym || form.ivatan_antonym) && (
                <section className="dictionary-field-block">
                  <h4>Related Words</h4>
                  <div className="dictionary-chip-row">
                    {splitList(form.english_synonym).map((item) => (
                      <span key={`english-synonym-${item}`}>English synonym: {item}</span>
                    ))}
                    {splitList(form.ivatan_synonym).map((item) => (
                      <span key={`ivatan-synonym-${item}`}>Ivatan synonym: {item}</span>
                    ))}
                    {splitList(form.english_antonym).map((item) => (
                      <span key={`english-antonym-${item}`}>English antonym: {item}</span>
                    ))}
                    {splitList(form.ivatan_antonym).map((item) => (
                      <span key={`ivatan-antonym-${item}`}>Ivatan antonym: {item}</span>
                    ))}
                  </div>
                </section>
              )}

              <section className="dictionary-field-block">
                <h4>Attribution</h4>
                <div className="detail-list">
                  {previewTermSource && <p>{previewTermSource.replace(/^Source:\s*/, '')}</p>}
                  {previewAudioSource && <p>{previewAudioSource.replace(/^Audio Source:\s*/, '')}</p>}
                  {previewPhotoSource && <p>{previewPhotoSource.replace(/^Photo Source:\s*/, '')}</p>}
                </div>
              </section>
            </article>
          </section>
        </section>

        <div className="actions draft-action-bar" aria-label="Dictionary draft actions">
          <button disabled={busy || isSavedDraft} onClick={() => createDraft()}>
            Create New Draft
          </button>
          <button disabled={busy || !isSavedDraft || !isEditableDraft} onClick={() => updateDraft()}>
            Update Draft
          </button>
          <button className="secondary" disabled={busy || !isSavedDraft || !isEditableDraft} onClick={() => submitDraft()}>
            Submit Draft
          </button>
          <button className="ghost" disabled={busy} onClick={() => navigate(ROUTES.dictionaryView)}>
            Browse Published Entries
          </button>
          <button className="ghost" disabled={busy} onClick={() => loadMyRevisions()}>
            Refresh My Revisions
          </button>
          <button className="ghost" disabled={busy} onClick={() => clearDraftContext()}>
            Clear Form
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <section className="panel">
        <h3>My Dictionary Revisions</h3>
        {myRevisions.length === 0 && <p className="muted">No dictionary revisions loaded yet.</p>}
        {renderRevisionGroup('Editable Drafts', revisionGroups.draft)}
        {renderRevisionGroup('Pending Review', revisionGroups.pending)}
        {renderRevisionGroup('Rejected Submissions', revisionGroups.rejected)}
        {renderRevisionGroup('Approved Submissions', revisionGroups.approved)}
        {renderRevisionGroup('Other Statuses', revisionGroups.other)}
      </section>
      <ContributionCelebration celebration={celebration} onClose={closeCelebration} />
    </>
  )
}
