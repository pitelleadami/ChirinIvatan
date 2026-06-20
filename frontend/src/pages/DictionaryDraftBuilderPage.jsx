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

import ConfirmDialog from '../components/ConfirmDialog'
import ContributionCelebration from '../components/ContributionCelebration'
import { apiRequest } from '../lib/api'
import { useContributionCelebration } from '../lib/contributionCelebration'
import {
  capitalizeFirst,
  normalizeHeadword,
  normalizeSentence,
  sentenceForDisplay,
} from '../lib/dictionaryText'
import { prepareImageUpload } from '../lib/imageUpload'
import { ROUTES, navigate } from '../lib/router'

const INITIAL_FORM = {
  term: '',
  meaning: '',
  part_of_speech: '',
  pronunciation_text: '',
  phonetic: '',
  variant_type: 'Ivatan (Common Usage)',
  variants: [],
  usage_notes: '',
  etymology: '',
  example_sentence: '',
  example_translation: '',
  source_text: '',
  term_source_is_self_knowledge: null,
  audio_source: '',
  audio_source_is_self_recorded: null,
  audio_license: 'CC BY-NC 4.0',
  photo_source: '',
  photo_source_is_contributor_owned: null,
  photo_license: 'CC BY-NC 4.0',
  english_synonym: '',
  ivatan_synonym: '',
  english_antonym: '',
  ivatan_antonym: '',
  inflected_forms: '{}',
}

const OLD_HISTORICAL_VARIANT_TYPE = 'Old / Historical Form'
const PLATFORM_DEFAULT_MEDIA_LICENSE = 'CC BY-NC 4.0'
const MEDIA_LICENSE_OPTIONS = [
  { value: 'CC BY-NC 4.0', label: 'Use platform default (CC BY-NC 4.0)' },
  { value: 'CC BY 4.0', label: 'CC BY 4.0' },
  { value: 'All rights reserved', label: 'All rights reserved' },
  { value: 'CC0 / Public domain', label: 'CC0 / Public domain' },
  { value: 'Other', label: 'Other' },
]

const VARIANT_TYPE_OPTIONS = [
  'Ivatan (Common Usage)',
  'Isamurungen',
  'Ivasayen',
  'Itbayaten',
  OLD_HISTORICAL_VARIANT_TYPE,
  'Borrowed Form',
  'Newly Coined Term / Expression',
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
const SOURCE_REMARKS_KEY = 'source_remarks'
const DICTIONARY_MUNICIPALITY_OPTIONS = ['Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat']

const DICTIONARY_TERM_SOURCE_TYPES = [
  {
    value: 'community_knowledge',
    label: 'Community Knowledge',
    guidance: 'Use for words commonly recognized within a municipality or community.',
    fields: [],
    build: () => 'Community knowledge',
  },
  {
    value: 'interview',
    label: 'Interview',
    guidance: 'Use when the term was directly shared or explained by another member of the community.',
    fields: [{ key: 'informant_name', label: 'Informant Name' }],
    build: (v) => `Interview with ${v.informant_name}`,
  },
  {
    value: 'printed_dictionary_book',
    label: 'Printed Dictionary / Book',
    guidance: 'Use published references to support preservation and accuracy.',
    fields: [
      { key: 'book_title', label: 'Book Title' },
      { key: 'author', label: 'Author' },
    ],
    build: (v) => `${v.author}${v.book_title ? `, ${v.book_title}` : ''}`,
  },
  {
    value: 'website_online',
    label: 'Website / Online Resource',
    guidance: 'Use online references carefully for preservation and cross-checking.',
    fields: [
      { key: 'website_name', label: 'Website Name' },
      { key: 'url', label: 'URL', type: 'url' },
    ],
    build: (v) => `${v.website_name}${v.url ? ` (${v.url})` : ''}`,
  },
  {
    value: 'other',
    label: 'Other',
    guidance: 'Use if no category appropriately fits the source.',
    fields: [],
    build: () => 'Other source',
  },
]

const DICTIONARY_PHOTO_SOURCE_TYPES = [
  {
    value: 'community_contributed_photo',
    label: 'Community-Contributed Photo',
    guidance: 'Use for images shared with permission by another community member.',
    fields: [{ key: 'contributor_name', label: 'Contributor Name' }],
    build: (v) => `Shared by ${v.contributor_name}`,
  },
  {
    value: 'museum_archive',
    label: 'Museum / Archive',
    guidance: 'Use for archival or institutional images.',
    fields: [{ key: 'institution_name', label: 'Institution Name' }],
    build: (v) => v.institution_name,
  },
  {
    value: 'book_publication_image',
    label: 'Book / Publication Image',
    guidance: 'Use for scanned or referenced printed visuals.',
    fields: [
      { key: 'book_title', label: 'Book Title' },
      { key: 'author_publication', label: 'Author / Publication' },
    ],
    build: (v) => `${v.book_title}${v.author_publication ? `, ${v.author_publication}` : ''}`,
  },
  {
    value: 'website_image',
    label: 'Website Image',
    guidance: 'Acknowledge the original location or uploader.',
    fields: [
      { key: 'website_title', label: 'Website Name / Image Title' },
      { key: 'url', label: 'URL', type: 'url' },
    ],
    build: (v) => `${v.website_title}${v.url ? ` (${v.url})` : ''}`,
  },
  {
    value: 'ai_assisted_illustration',
    label: 'AI-Assisted Illustration',
    guidance: 'Use for AI-assisted educational visualization.',
    fields: [{ key: 'tool_used', label: 'Tool Used' }],
    build: (v) => `AI-assisted illustration from ${v.tool_used}`,
  },
  {
    value: 'family_collection',
    label: 'Family Collection',
    guidance: 'Use for photographs preserved by families or households.',
    fields: [
      { key: 'family_name', label: 'Family Name' },
      { key: 'head_of_family', label: 'Head of Family' },
      {
        key: 'municipality',
        label: 'Municipality',
        type: 'select',
        options: DICTIONARY_MUNICIPALITY_OPTIONS,
      },
    ],
    build: (v) => `Shared from the ${v.family_name} family${v.municipality ? ` from ${v.municipality}` : ''}`,
  },
  {
    value: 'other',
    label: 'Other',
    guidance: 'Use if no category appropriately fits the source.',
    fields: [],
    build: () => 'Other source',
  },
]

const DICTIONARY_AUDIO_SOURCE_TYPES = [
  {
    value: 'recording',
    label: 'Recording',
    guidance: 'Use for recordings from other fluent speakers.',
    fields: [{ key: 'name', label: 'Name' }],
    build: (v) => `Shared pronunciation by ${v.name}`,
  },
  {
    value: 'archived_recording',
    label: 'Archived Recording',
    guidance: 'Use for historical or archived pronunciation recordings.',
    fields: [{ key: 'archive_name', label: 'Archive Name' }],
    build: (v) => `${v.archive_name} recording`,
  },
  {
    value: 'radio_broadcast',
    label: 'Radio / Broadcast',
    guidance: 'Use for pronunciation recordings from educational broadcasts.',
    fields: [{ key: 'program_name', label: 'Program Name' }],
    build: (v) => `${v.program_name}`,
  },
  {
    value: 'other',
    label: 'Other',
    guidance: 'Use if no category appropriately fits the source.',
    fields: [],
    build: () => 'Other source',
  },
]

function resolveSourceConfig(config, type) {
  return config.find((item) => item.value === type) || null
}

function isConfigComplete(config, values) {
  if (!config) return false
  if (!config.fields.length) return Boolean(String(values?.[SOURCE_REMARKS_KEY] || '').trim())
  if (String(values?.[SOURCE_REMARKS_KEY] || '').trim()) {
    return config.fields.every((field) => field.type !== 'date' || !isFutureDateValue(values?.[field.key]))
  }
  return config.fields.every((field) => String(values?.[field.key] || '').trim())
}

function todayInputValue() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

function isFutureDateValue(value) {
  const normalized = String(value || '').trim()
  return normalized && normalized > todayInputValue()
}

function sourceFieldErrors(config, values, idPrefix) {
  const nextErrors = {}
  const hasRemarks = Boolean(String(values?.[SOURCE_REMARKS_KEY] || '').trim())
  if (config && config.fields.length === 0 && !hasRemarks) {
    nextErrors[`${idPrefix}.${SOURCE_REMARKS_KEY}`] = 'Remarks are required.'
    return nextErrors
  }
  ;(config?.fields || []).forEach((field) => {
    const value = String(values?.[field.key] || '').trim()
    const errorKey = `${idPrefix}.${field.key}`
    if (!value && !hasRemarks) {
      nextErrors[errorKey] = `${field.label} is required.`
    } else if (field.type === 'date' && isFutureDateValue(value)) {
      nextErrors[errorKey] = `${field.label} must be today or a past date.`
    }
  })
  return nextErrors
}

function buildSourceLine(label, config, values, fallback = '') {
  if (!config) return fallback
  const remarks = String(values?.[SOURCE_REMARKS_KEY] || '').trim()
  if (!config.fields.length) {
    return remarks ? `${label}: ${config.label}; Remarks: ${remarks}` : fallback
  }
  const hasAllStructuredFields = config.fields.every((field) => String(values?.[field.key] || '').trim())
  const partialDetails = config.fields
    .map((field) => {
      const value = String(values?.[field.key] || '').trim()
      return value ? `${field.label}: ${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
  const text = hasAllStructuredFields ? String(config.build(values || {}) || '').trim() : ''
  if (text && remarks) return `${label}: ${text}; Remarks: ${remarks}`
  if (remarks)
    return `${label}: ${config.label}${partialDetails ? ` (${partialDetails})` : ''}; Remarks: ${remarks}`
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
    options: [
      'Singular form',
      'Plural form',
      'Definite form',
      'Indefinite form',
      'Near demonstrative',
      'Far demonstrative',
      ...COMMON_INFLECTION_OPTIONS,
    ],
  },
  {
    test: (partOfSpeech) => partOfSpeech.toLowerCase().includes('numeral'),
    options: [
      'Cardinal form',
      'Ordinal form',
      'Classifier form',
      'Case form',
      'Gender form',
      ...COMMON_INFLECTION_OPTIONS,
    ],
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
    variant_type: 'Isamurungen',
    pronunciation_text: '',
    phonetic: '',
    usage_notes: '',
    etymology: '',
    example_sentence: '',
    example_translation: '',
    historical_note: '',
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
    variant_type: isKnownType ? variantType : 'Ivatan (Common Usage)',
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
    term: normalizeHeadword(variant.term),
    variant_type: String(variant.variant_type || '').trim(),
    pronunciation_text: String(variant.pronunciation_text || '').trim(),
    phonetic: String(variant.phonetic || '').trim(),
    usage_notes: String(variant.usage_notes || '').trim(),
    etymology: String(variant.etymology || '').trim(),
    example_sentence: normalizeSentence(variant.example_sentence),
    example_translation: normalizeSentence(variant.example_translation),
    historical_note: String(variant.historical_note || '').trim(),
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
  const mainVariantType = VARIANT_TYPE_OPTIONS.includes(source.variant_type)
    ? source.variant_type
    : 'Ivatan (Common Usage)'
  const nullableBool = (value) => {
    if (value === null || value === undefined || value === '') return null
    return value === true || String(value).trim().toLowerCase() === 'true'
  }
  return {
    ...INITIAL_FORM,
    term: normalizeHeadword(source.term),
    meaning: capitalizeFirst(source.meaning),
    part_of_speech: source.part_of_speech || '',
    pronunciation_text: source.pronunciation_text || '',
    phonetic: source.phonetic || '',
    variant_type: mainVariantType,
    variants: Array.isArray(source.variants) ? source.variants.map(normalizeVariantForForm) : [],
    usage_notes: source.usage_notes || '',
    etymology: source.etymology || '',
    example_sentence: normalizeSentence(source.example_sentence),
    example_translation: normalizeSentence(source.example_translation),
    source_text: source.source_text || '',
    term_source_is_self_knowledge: nullableBool(source.term_source_is_self_knowledge),
    audio_source: source.audio_source || '',
    audio_source_is_self_recorded: nullableBool(source.audio_source_is_self_recorded),
    photo_source: source.photo_source || '',
    photo_source_is_contributor_owned: nullableBool(source.photo_source_is_contributor_owned),
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

function mergeRelatedWords(...values) {
  return values.flatMap((value) => splitList(value))
}

function variantDetailRows(variant) {
  return [
    ['Usage / Etymology', variant.usage_notes],
    ['Sample', sentenceForDisplay(variant.example_sentence)],
    ['Translation', sentenceForDisplay(variant.example_translation)],
    ['Historical Note', variant.historical_note],
  ].filter(([, value]) => String(value || '').trim())
}

function relatedWordGroups(source) {
  return [
    ['English synonyms', splitList(source.english_synonym)],
    ['Ivatan synonyms', splitList(source.ivatan_synonym)],
    ['English antonyms', splitList(source.english_antonym)],
    ['Ivatan antonyms', splitList(source.ivatan_antonym)],
  ].filter(([, rows]) => rows.length > 0)
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

function EditGlyph() {
  return (
    <svg className="edit-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 15.8V20h4.2L19.7 8.5l-4.2-4.2L4 15.8Z" />
      <path d="m14.2 5.6 4.2 4.2" />
      <path d="M13 20H4" />
    </svg>
  )
}

function EditButton({ label, onClick, text = '' }) {
  return (
    <button
      type="button"
      className={text ? 'inline-link-button edit-inline-action' : 'edit-icon-button'}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <EditGlyph />
      {text && <span>{text}</span>}
    </button>
  )
}

function GuideLink({ anchor, children = 'Learn More' }) {
  void anchor
  void children
  return null
}

function FieldHeader({ htmlFor, label, guideAnchor, guideText = 'Learn More', required = false }) {
  void guideAnchor
  void guideText
  return (
    <div className="field-heading">
      <label htmlFor={htmlFor}>
        {label} {required && <RequiredMark />}
      </label>
    </div>
  )
}

function YesNoField({ legend, name, value, onChange, required = false, error = '' }) {
  return (
    <fieldset
      className={error ? 'binary-choice binary-choice-error' : 'binary-choice'}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${name}-error` : undefined}
    >
      <legend>
        {legend} {required && <RequiredMark />}
      </legend>
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
      {error && (
        <p className="inline-error" id={`${name}-error`}>
          {error}
        </p>
      )}
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
  const [revisionSearchMessage, setRevisionSearchMessage] = useState('')
  const [revisePanelOpen, setRevisePanelOpen] = useState(false)
  const [currentRevisionStatus, setCurrentRevisionStatus] = useState('')
  const [currentRevisionCreatedAt, setCurrentRevisionCreatedAt] = useState('')
  const [currentReviewerNotes, setCurrentReviewerNotes] = useState('')
  const [correctionAssignment, setCorrectionAssignment] = useState(null)
  const [matchingHeadwordRows, setMatchingHeadwordRows] = useState([])
  const [matchingHeadwordBusy, setMatchingHeadwordBusy] = useState(false)
  const [dismissedHeadword, setDismissedHeadword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [prefilledForm, setPrefilledForm] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [hasExistingAudioMedia, setHasExistingAudioMedia] = useState(false)
  const [hasExistingPhotoMedia, setHasExistingPhotoMedia] = useState(false)
  const [audioPreview, setAudioPreview] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [snapshotAudioPreview, setSnapshotAudioPreview] = useState('')
  const [snapshotPhotoPreview, setSnapshotPhotoPreview] = useState('')
  const [mediaPolicyAccepted, setMediaPolicyAccepted] = useState(false)
  const [variantAudioFiles, setVariantAudioFiles] = useState({})
  const [variantAudioPreviews, setVariantAudioPreviews] = useState({})
  const [inflectionRows, setInflectionRows] = useState([])
  const [prefilledInflectionRows, setPrefilledInflectionRows] = useState([])
  const [showVariants, setShowVariants] = useState(false)
  const [showRelatedWords, setShowRelatedWords] = useState(false)
  const [showUsageNotes, setShowUsageNotes] = useState(false)
  const [showEtymology, setShowEtymology] = useState(false)
  const [showInflectedForms, setShowInflectedForms] = useState(false)
  const [optionalPanelOrder, setOptionalPanelOrder] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [unlockedFields, setUnlockedFields] = useState({})
  const [termSourceType, setTermSourceType] = useState('')
  const [termSourceValues, setTermSourceValues] = useState({})
  const [audioSourceType, setAudioSourceType] = useState('')
  const [audioSourceValues, setAudioSourceValues] = useState({})
  const [photoSourceType, setPhotoSourceType] = useState('')
  const [photoSourceValues, setPhotoSourceValues] = useState({})
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false)
  const { celebration, celebrateContribution, celebrateDraftSaved, closeCelebration } =
    useContributionCelebration()
  const isRevisionMode = Boolean(entryId)
  const isSavedDraft = Boolean(revisionId)
  const normalizedRevisionStatus = String(currentRevisionStatus || '').toLowerCase()
  const isEditableDraft = !isSavedDraft || ['draft', 'rejected'].includes(normalizedRevisionStatus)
  const isRejectedSubmissionMode = isSavedDraft && normalizedRevisionStatus === 'rejected'
  const isSnapshotEditMode = isRevisionMode || isRejectedSubmissionMode

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const entryFromQuery = query.get('entry_id')
    const revisionFromQuery = query.get('revision_id')
    if (entryFromQuery && !revisionFromQuery) {
      setEntryId(entryFromQuery)
    }
  }, [])

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const revisionFromQuery = query.get('revision_id')
    if (!revisionFromQuery) return

    run(async () => {
      const payload = await apiRequest('/api/dictionary/revisions/my')
      const revision = (payload.rows || []).find((row) => row.revision_id === revisionFromQuery)
      if (!revision) {
        setError('Dictionary draft not found in your contributions.')
        return
      }
      if (!['draft', 'rejected'].includes(revision.status)) {
        setError('Only draft or rejected dictionary submissions can be edited here.')
        return
      }
      setRevisionId(revision.revision_id || '')
      setCurrentRevisionStatus(revision.status || 'draft')
      setCurrentRevisionCreatedAt(revision.created_at || '')
      setEntryId(revision.entry_id || '')
      loadRevisionIntoForm(revision)
    })
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
      if (payload.revision_id) {
        window.history.replaceState(
          {},
          '',
          `${ROUTES.dictionaryDraft}?revision_id=${encodeURIComponent(payload.revision_id)}`,
        )
      }
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
        const exactMatches = (payload.rows || []).filter(
          (row) => row.term?.trim().toLowerCase() === normalizedHeadword,
        )
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

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    clearFieldError(field)
  }

  function setVariantField(index, field, value) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((variant, currentIndex) =>
        currentIndex === index ? { ...variant, [field]: value } : variant,
      ),
    }))
    clearFieldError(`variant-${index}-${field}`)
  }

  function addVariant() {
    setShowVariants(true)
    touchOptionalPanel('variants')
    setForm((prev) => ({ ...prev, variants: [...prev.variants, makeVariant()] }))
  }

  function openVariantsWithInitialRow() {
    setShowVariants(true)
    touchOptionalPanel('variants')
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
    touchOptionalPanel('inflected')
    setInflectionRows((current) => [...current, { label: options[0], customLabel: '', value: '' }])
  }

  function openInflectedFormsWithInitialRow() {
    const options = inflectionOptionsFor(form.part_of_speech)
    setShowInflectedForms(true)
    touchOptionalPanel('inflected')
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
        : buildSourceLine('Source', selectedTermSourceConfig, termSourceValues, form.source_text)
    const derivedAudioSource =
      hasAudioMedia && form.audio_source_is_self_recorded === true
        ? `Audio Source: ${SOURCE_OWNER_LABEL}`
        : hasAudioMedia
          ? buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues, form.audio_source)
          : ''
    const derivedPhotoSource =
      hasPhotoMedia && form.photo_source_is_contributor_owned === true
        ? `Photo Source: ${SOURCE_OWNER_LABEL}`
        : hasPhotoMedia
          ? buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues, form.photo_source)
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
          variant.usage_notes ||
          variant.etymology ||
          variant.example_sentence ||
          variant.example_translation ||
          variant.historical_note ||
          variantAudioFiles[variant.sourceIndex],
      )

    return {
      ...form,
      source_text: derivedTermSource,
      audio_source: derivedAudioSource,
      audio_license:
        hasAudioMedia && form.audio_source_is_self_recorded === true
          ? form.audio_license || PLATFORM_DEFAULT_MEDIA_LICENSE
          : '',
      photo_source: derivedPhotoSource,
      photo_license:
        hasPhotoMedia && form.photo_source_is_contributor_owned === true
          ? form.photo_license || PLATFORM_DEFAULT_MEDIA_LICENSE
          : '',
      variants: variants.map((variant) => ({
        term: variant.term,
        variant_type: variant.variant_type,
        pronunciation_text: variant.pronunciation_text,
        usage_notes: variant.usage_notes,
        etymology: variant.etymology,
        example_sentence: variant.example_sentence,
        example_translation: variant.example_translation,
        historical_note: variant.historical_note,
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
      setField('audio_license', PLATFORM_DEFAULT_MEDIA_LICENSE)
      setAudioSourceType('')
      setAudioSourceValues({})
    }
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }
    setError('')

    try {
      const prepared = await prepareImageUpload(file, {
        minWidth: 200,
        minHeight: 200,
        maxWidth: 1600,
        maxHeight: 1200,
      })
      setPhotoFile(prepared.file)
      setPhotoPreview(prepared.previewUrl || '')
      if (!prepared.file && !hasExistingPhotoMedia) {
        setField('photo_source', '')
        setField('photo_source_is_contributor_owned', null)
        setField('photo_license', PLATFORM_DEFAULT_MEDIA_LICENSE)
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
    setPrefilledForm(nextForm)
    setInflectionRows(nextInflectionRows)
    setPrefilledInflectionRows(nextInflectionRows)
    setShowVariants(nextForm.variants.length > 0)
    setShowRelatedWords(
      Boolean(
        nextForm.english_synonym ||
        nextForm.ivatan_synonym ||
        nextForm.english_antonym ||
        nextForm.ivatan_antonym,
      ),
    )
    setShowUsageNotes(Boolean(nextForm.usage_notes))
    setShowEtymology(Boolean(nextForm.etymology))
    setShowInflectedForms(nextInflectionRows.length > 0)
    setOptionalPanelOrder([
      ...(nextForm.variants.length > 0 ? ['variants'] : []),
      ...(nextInflectionRows.length > 0 ? ['inflected'] : []),
      ...(nextForm.english_synonym ||
      nextForm.ivatan_synonym ||
      nextForm.english_antonym ||
      nextForm.ivatan_antonym
        ? ['related']
        : []),
      ...(nextForm.usage_notes ? ['usage'] : []),
      ...(nextForm.etymology ? ['etymology'] : []),
    ])
    const nextAudioPreview = revision.audio_pronunciation_url || ''
    const nextPhotoPreview = revision.photo_url || ''
    setHasExistingAudioMedia(
      Boolean(revision.proposed_data?.audio_pronunciation || revision.audio_pronunciation),
    )
    setHasExistingPhotoMedia(Boolean(revision.proposed_data?.photo || revision.photo))
    setAudioPreview(nextAudioPreview)
    setPhotoPreview(nextPhotoPreview)
    setSnapshotAudioPreview(nextAudioPreview)
    setSnapshotPhotoPreview(nextPhotoPreview)
    setVariantAudioFiles({})
    setVariantAudioPreviews({})
    setFieldErrors({})
    setUnlockedFields({})
    setCurrentRevisionStatus(revision.status || '')
    setCurrentRevisionCreatedAt(revision.created_at || '')
    setCurrentReviewerNotes(revision.reviewer_notes || '')
    setCorrectionAssignment(revision.correction_assignment || null)
  }

  function validateRequiredFields() {
    const nextErrors = {}
    if (!String(form.term || '').trim()) {
      nextErrors.term = 'Headword is required.'
    }
    if (!String(form.meaning || '').trim()) {
      nextErrors.meaning = 'Meaning is required.'
    }
    if (String(form.example_sentence || '').trim() && !String(form.example_translation || '').trim()) {
      nextErrors.example_translation =
        'English translation is required when an Ivatan example sentence is provided.'
    }
    form.variants.forEach((variant, index) => {
      if (
        String(variant.example_sentence || '').trim() &&
        !String(variant.example_translation || '').trim()
      ) {
        nextErrors[`variant-${index}-example_translation`] =
          'English translation is required for this Ivatan example.'
      }
    })
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setError('Please complete the required fields marked with *.')
      return false
    }
    return true
  }

  function hasAnyDraftInput() {
    const structuredValues = [
      ...Object.entries(form)
        .filter(
          ([key, value]) =>
            typeof value !== 'object' && String(value ?? '') !== String(INITIAL_FORM[key] ?? ''),
        )
        .map(([, value]) => value),
      ...Object.values(termSourceValues),
      ...Object.values(audioSourceValues),
      ...Object.values(photoSourceValues),
      ...inflectionRows.flatMap((row) => [row.label, row.value]),
      ...form.variants.flatMap((variant) => Object.values(variant || {})),
    ]
    return (
      structuredValues.some((value) => String(value || '').trim()) ||
      Boolean(audioFile || photoFile || hasExistingAudioMedia || hasExistingPhotoMedia)
    )
  }

  function validateDraftHasInput() {
    if (!String(form.term || '').trim()) {
      setFieldErrors((current) => ({ ...current, term: 'Headword is required.' }))
      setError('Headword is required before saving this draft.')
      return false
    }
    if (hasAnyDraftInput()) return true
    setError('Add at least one field before saving this draft.')
    return false
  }

  function validateAttribution() {
    const hasActualMedia = Boolean(audioFile || photoFile || hasExistingAudioMedia || hasExistingPhotoMedia)
    if (hasActualMedia && !mediaPolicyAccepted) {
      setError('Please confirm that you have read the Media Upload Policy before submitting.')
      return false
    }

    if (form.term_source_is_self_knowledge === null) {
      setFieldErrors((current) => ({
        ...current,
        term_source_is_self_knowledge: 'Headword source is required.',
      }))
      setError('Please answer whether this headword is based on your own knowledge.')
      return false
    }

    if (!form.term_source_is_self_knowledge) {
      if (!selectedTermSourceConfig && !String(form.source_text || '').trim()) {
        setFieldErrors((current) => ({
          ...current,
          term_source_type: 'Choose a headword source type.',
        }))
        setError('Please choose a headword source type.')
        return false
      }
      if (selectedTermSourceConfig) {
        const nextSourceErrors = sourceFieldErrors(
          selectedTermSourceConfig,
          termSourceValues,
          'dictionary-term-source',
        )
        if (Object.keys(nextSourceErrors).length > 0) {
          setFieldErrors((current) => ({ ...current, ...nextSourceErrors }))
          setError(
            'Please complete the source fields, or add remarks explaining what source details you can provide.',
          )
          return false
        }
      }
    }

    if (
      !form.term_source_is_self_knowledge &&
      !String(
        buildSourceLine('Source', selectedTermSourceConfig, termSourceValues, form.source_text) || '',
      ).trim()
    ) {
      setFieldErrors((current) => ({
        ...current,
        term_source_type: 'Headword source is required.',
      }))
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
      if (!selectedAudioSourceConfig && !String(form.audio_source || '').trim()) {
        setError('Please choose an audio source type.')
        return false
      }
      if (selectedAudioSourceConfig) {
        const nextSourceErrors = sourceFieldErrors(
          selectedAudioSourceConfig,
          audioSourceValues,
          'dictionary-audio-source',
        )
        if (Object.keys(nextSourceErrors).length > 0) {
          setFieldErrors((current) => ({ ...current, ...nextSourceErrors }))
          setError(
            'Please complete the audio source fields, or add remarks explaining what source details you can provide.',
          )
          return false
        }
      }
    }

    if (
      hasAudioMedia &&
      !form.audio_source_is_self_recorded &&
      !String(
        buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues, form.audio_source) ||
          '',
      ).trim()
    ) {
      setError('Audio source is required unless personally owned or produced by you.')
      return false
    }

    if (hasPhotoMedia && !form.photo_source_is_contributor_owned) {
      if (!selectedPhotoSourceConfig && !String(form.photo_source || '').trim()) {
        setError('Please choose a photo source type.')
        return false
      }
      if (selectedPhotoSourceConfig) {
        const nextSourceErrors = sourceFieldErrors(
          selectedPhotoSourceConfig,
          photoSourceValues,
          'dictionary-photo-source',
        )
        if (Object.keys(nextSourceErrors).length > 0) {
          setFieldErrors((current) => ({ ...current, ...nextSourceErrors }))
          setError(
            'Please complete the photo source fields, or add remarks explaining what source details you can provide.',
          )
          return false
        }
      }
    }

    if (
      hasPhotoMedia &&
      !form.photo_source_is_contributor_owned &&
      !String(
        buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues, form.photo_source) ||
          '',
      ).trim()
    ) {
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
        const variantSourceConfig = resolveSourceConfig(
          DICTIONARY_AUDIO_SOURCE_TYPES,
          variant.audio_source_type,
        )
        if (!variantSourceConfig) {
          setError(`Please choose a source type for Variant ${index + 1} audio.`)
          return false
        }
        if (!isConfigComplete(variantSourceConfig, variant.audio_source_details || {})) {
          setError(`Please complete all required source details for Variant ${index + 1} audio.`)
          return false
        }
        const variantSourceLine = buildSourceLine(
          'Audio Source',
          variantSourceConfig,
          variant.audio_source_details || {},
        )
        if (!String(variantSourceLine || '').trim()) {
          setError(`Variant ${index + 1} audio source is required unless it is self-recorded.`)
          return false
        }
      }
    }

    return true
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

  async function persistDraft() {
    if (isSavedDraft && !isEditableDraft) {
      throw new Error(
        `This revision is ${currentRevisionStatus || 'not editable'}. Only editable drafts can be changed.`,
      )
    }

    const payload = isSavedDraft
      ? await apiRequest(`/api/dictionary/revisions/${revisionId.trim()}`, {
          method: 'POST',
          body: buildFormData(),
        })
      : await apiRequest('/api/dictionary/revisions/create', {
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
    return payload
  }

  async function saveDraft() {
    if (!validateDraftHasInput()) return
    await run(async () => {
      const payload = await persistDraft()
      setMessage(`Dictionary draft saved: ${payload.revision_id}`)
      celebrateDraftSaved('dictionary')
    })
  }

  async function deleteDraft() {
    const trimmedId = revisionId.trim()
    if (!trimmedId) {
      clearDraftContext()
      setConfirmDeleteDraft(false)
      navigate(ROUTES.adminApplications)
      return
    }

    await run(async () => {
      await apiRequest(`/api/dictionary/revisions/${trimmedId}/delete`, { method: 'DELETE' })
      clearDraftContext()
      setConfirmDeleteDraft(false)
      setMessage('Draft deleted.')
      navigate(ROUTES.adminApplications)
    })
  }

  async function searchPublishedEntries() {
    const trimmedQuery = revisionSearchTerm.trim()
    setRevisionSearchMessage('')
    if (!trimmedQuery) {
      setRevisionSearchRows([])
      setRevisionSearchMessage('Enter a headword to search published entries.')
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
        setRevisionSearchMessage(`No published entries found for "${trimmedQuery}".`)
      }
    } catch (requestError) {
      setRevisionSearchMessage(requestError.message)
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
      if (payload.revision_id) {
        window.history.replaceState(
          {},
          '',
          `${ROUTES.dictionaryDraft}?revision_id=${encodeURIComponent(payload.revision_id)}`,
        )
      }
    })
  }

  async function submitEntry() {
    const requiredOk = validateRequiredFields()
    const attributionOk = validateAttribution()
    if (!requiredOk || !attributionOk) return

    await run(async () => {
      const draftPayload = await persistDraft()
      const payload = await apiRequest(`/api/dictionary/revisions/${draftPayload.revision_id}/submit`, {
        method: 'POST',
      })
      setCurrentRevisionStatus(payload.status || 'pending')
      setCurrentRevisionCreatedAt(payload.created_at || currentRevisionCreatedAt || '')
      setCurrentReviewerNotes('')
      setMessage(
        'Submitted for review. This entry is now pending and cannot be edited until a decision is made. ' +
          'You can track it in My Dictionary Submissions, and the notification bell will tell you when it is approved or returned.',
      )
      const revisionsPayload = await apiRequest('/api/dictionary/revisions/my')
      const submittedCount = (revisionsPayload.rows || []).filter((row) => row.status !== 'draft').length
      celebrateContribution('dictionary', submittedCount)
    })
  }

  function clearDraftContext() {
    setRevisionId('')
    setCurrentRevisionStatus('')
    setCurrentRevisionCreatedAt('')
    setCurrentReviewerNotes('')
    setEntryId('')
    setAutoRevisionStarted(false)
    setForm(INITIAL_FORM)
    setPrefilledForm(null)
    setInflectionRows([])
    setPrefilledInflectionRows([])
    setAudioFile(null)
    setPhotoFile(null)
    setAudioPreview('')
    setPhotoPreview('')
    setSnapshotAudioPreview('')
    setSnapshotPhotoPreview('')
    setMediaPolicyAccepted(false)
    setVariantAudioFiles({})
    setVariantAudioPreviews({})
    setHasExistingAudioMedia(false)
    setHasExistingPhotoMedia(false)
    setMatchingHeadwordRows([])
    setDismissedHeadword('')
    setShowVariants(false)
    setShowRelatedWords(false)
    setShowUsageNotes(false)
    setShowEtymology(false)
    setShowInflectedForms(false)
    setOptionalPanelOrder([])
    setFieldErrors({})
    setUnlockedFields({})
    setError('')
    setMessage('Form cleared.')
    window.history.replaceState({}, '', ROUTES.dictionaryDraft)
  }

  function removeAudioUpload() {
    if (audioPreview.startsWith('blob:')) URL.revokeObjectURL(audioPreview)
    setAudioFile(null)
    setAudioPreview('')
    setHasExistingAudioMedia(false)
    setField('audio_source', '')
    setField('audio_source_is_self_recorded', null)
    setField('audio_license', PLATFORM_DEFAULT_MEDIA_LICENSE)
    setAudioSourceType('')
    setAudioSourceValues({})
  }

  function removePhotoUpload() {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview('')
    setHasExistingPhotoMedia(false)
    setField('photo_source', '')
    setField('photo_source_is_contributor_owned', null)
    setField('photo_license', PLATFORM_DEFAULT_MEDIA_LICENSE)
    setPhotoSourceType('')
    setPhotoSourceValues({})
  }

  function continueAfterSubmission() {
    closeCelebration()
    navigate(`${ROUTES.adminApplications}?tab=contributions`)
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
      : buildSourceLine('Source', selectedTermSourceConfig, termSourceValues, form.source_text)
  const previewAudioSource =
    hasAudioMedia && form.audio_source_is_self_recorded === true
      ? `Audio Source: ${SOURCE_OWNER_LABEL}`
      : hasAudioMedia
        ? buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues, form.audio_source)
        : ''
  const previewPhotoSource =
    hasPhotoMedia && form.photo_source_is_contributor_owned === true
      ? `Photo Source: ${SOURCE_OWNER_LABEL}`
      : hasPhotoMedia
        ? buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues, form.photo_source)
        : ''
  const snapshotForm = prefilledForm || form
  const snapshotInflectedFormsPreviewRows = (prefilledForm ? prefilledInflectionRows : inflectionRows).filter(
    (row) => row.label && row.value,
  )
  const snapshotInflectedFormsValue = rowsToObject(prefilledForm ? prefilledInflectionRows : inflectionRows)
  const snapshotRelatedWords = mergeRelatedWords(
    snapshotForm.english_synonym,
    snapshotForm.ivatan_synonym,
    snapshotForm.english_antonym,
    snapshotForm.ivatan_antonym,
  )
  const snapshotTermSource =
    snapshotForm.term_source_is_self_knowledge === true ? '' : snapshotForm.source_text
  const snapshotAudioSource =
    snapshotAudioPreview && snapshotForm.audio_source_is_self_recorded === true
      ? `Audio Source: ${SOURCE_OWNER_LABEL}`
      : snapshotAudioPreview
        ? snapshotForm.audio_source
        : ''
  const snapshotPhotoSource =
    snapshotPhotoPreview && snapshotForm.photo_source_is_contributor_owned === true
      ? `Photo Source: ${SOURCE_OWNER_LABEL}`
      : snapshotPhotoPreview
        ? snapshotForm.photo_source
        : ''
  const showMatchingHeadwordPanel =
    normalizedHeadword &&
    matchingHeadwordRows.length > 0 &&
    dismissedHeadword !== normalizedHeadword &&
    !isRevisionMode &&
    !isSavedDraft

  function snapshotValueFor(fieldName, fallbackValue) {
    if (!prefilledForm) return fallbackValue
    if (fieldName === 'inflected_forms') return rowsToObject(prefilledInflectionRows)
    if (fieldName.includes('.')) return undefined
    return prefilledForm[fieldName]
  }

  function isFieldLocked(fieldName, currentValue) {
    const snapshotValue = snapshotValueFor(fieldName, currentValue)
    return isSnapshotEditMode && hasContent(snapshotValue) && !unlockedFields[fieldName]
  }

  function showInEditableSection(fieldName, currentValue) {
    return !isFieldLocked(fieldName, currentValue)
  }

  function unlockField(fieldName) {
    setUnlockedFields((current) => ({ ...current, [fieldName]: true }))
  }

  function unlockFieldAndShow(fieldName, showSection) {
    unlockField(fieldName)
    if (showSection) showSection(true)
  }

  function renderLockedField(fieldName, label, value) {
    return (
      <div className="locked-field-display" role="group" aria-label={`${label} locked field`}>
        <div className="locked-field-header">
          <strong>{label}</strong>
          <EditButton label={`Edit ${label}`} onClick={() => unlockField(fieldName)} />
        </div>
        <p>{String(value || '').trim() || '-'}</p>
      </div>
    )
  }

  function updateSourceValues(setter, key, value, errorKey = key) {
    setter((current) => ({ ...current, [key]: value }))
    clearFieldError(errorKey)
  }

  function touchOptionalPanel(key) {
    setOptionalPanelOrder((current) => [...current.filter((item) => item !== key), key])
  }

  function removeOptionalPanel(key) {
    setOptionalPanelOrder((current) => current.filter((item) => item !== key))
  }

  function optionalPanelCssOrder(key) {
    const index = optionalPanelOrder.indexOf(key)
    return index === -1 ? 10 : 20 + index
  }

  function renderSourceFields(config, values, setter, idPrefix) {
    if (!config) return null
    return (
      <div className="field-grid">
        {config.fields.map((field) => {
          const errorKey = `${idPrefix}.${field.key}`
          return (
            <div
              key={`${idPrefix}-${field.key}`}
              className={fieldErrors[errorKey] ? 'field field-error' : 'field'}
            >
              <label htmlFor={`${idPrefix}-${field.key}`}>
                {field.label} <RequiredMark />{' '}
                {isFieldLocked(errorKey, values[field.key]) && (
                  <EditButton
                    label={`Edit ${field.label}`}
                    text="Edit"
                    onClick={() => unlockField(errorKey)}
                  />
                )}
              </label>
              {field.type === 'select' ? (
                <select
                  id={`${idPrefix}-${field.key}`}
                  value={values[field.key] || ''}
                  aria-invalid={Boolean(fieldErrors[errorKey])}
                  aria-describedby={fieldErrors[errorKey] ? `${idPrefix}-${field.key}-error` : undefined}
                  disabled={isFieldLocked(errorKey, values[field.key])}
                  onChange={(event) => updateSourceValues(setter, field.key, event.target.value, errorKey)}
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
                  max={field.type === 'date' ? todayInputValue() : undefined}
                  aria-invalid={Boolean(fieldErrors[errorKey])}
                  aria-describedby={fieldErrors[errorKey] ? `${idPrefix}-${field.key}-error` : undefined}
                  readOnly={isFieldLocked(errorKey, values[field.key])}
                  onChange={(event) => updateSourceValues(setter, field.key, event.target.value, errorKey)}
                />
              )}
              {fieldErrors[errorKey] && (
                <p className="inline-error" id={`${idPrefix}-${field.key}-error`}>
                  {fieldErrors[errorKey]}
                </p>
              )}
            </div>
          )
        })}
        <div className="field source-remarks-field">
          <label htmlFor={`${idPrefix}-${SOURCE_REMARKS_KEY}`}>
            Remarks / additional info {fieldErrors[`${idPrefix}.${SOURCE_REMARKS_KEY}`] && <RequiredMark />}
          </label>
          <textarea
            id={`${idPrefix}-${SOURCE_REMARKS_KEY}`}
            rows={3}
            value={values[SOURCE_REMARKS_KEY] || ''}
            onChange={(event) => {
              updateSourceValues(setter, SOURCE_REMARKS_KEY, event.target.value)
              config.fields.forEach((field) => clearFieldError(`${idPrefix}.${field.key}`))
              clearFieldError(`${idPrefix}.${SOURCE_REMARKS_KEY}`)
            }}
            placeholder="Example: Commonly used by elders in Basco during everyday conversation."
          />
          {fieldErrors[`${idPrefix}.${SOURCE_REMARKS_KEY}`] && (
            <p className="inline-error" id={`${idPrefix}-${SOURCE_REMARKS_KEY}-error`}>
              {fieldErrors[`${idPrefix}.${SOURCE_REMARKS_KEY}`]}
            </p>
          )}
        </div>
      </div>
    )
  }

  function renderMediaLicenseSelect({ id, value, onChange }) {
    return (
      <label className="field compact-field media-license-field" htmlFor={id}>
        <span>Usage / License</span>
        <select
          id={id}
          value={value || PLATFORM_DEFAULT_MEDIA_LICENSE}
          onChange={(event) => onChange(event.target.value)}
        >
          {MEDIA_LICENSE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
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

  const inflectedFormsValue = rowsToObject(inflectionRows)
  const showCoreEditableFields = [
    ['term', form.term],
    ['meaning', form.meaning],
    ['part_of_speech', form.part_of_speech],
    ['variant_type', form.variant_type],
    ['pronunciation_text', form.pronunciation_text],
    ['phonetic', form.phonetic],
  ].some(([field, value]) => showInEditableSection(field, value))
  const showRelatedEditableFields = [
    ['english_synonym', form.english_synonym],
    ['ivatan_synonym', form.ivatan_synonym],
    ['english_antonym', form.english_antonym],
    ['ivatan_antonym', form.ivatan_antonym],
  ].some(([field, value]) => showInEditableSection(field, value))
  const showExampleEditableFields = [
    ['example_sentence', form.example_sentence],
    ['example_translation', form.example_translation],
  ].some(([field, value]) => showInEditableSection(field, value))
  const showAudioUploadField =
    !isSnapshotEditMode || !hasExistingAudioMedia || unlockedFields.audio_pronunciation
  const showPhotoUploadField = !isSnapshotEditMode || !hasExistingPhotoMedia || unlockedFields.photo
  const showSourceField =
    !isSnapshotEditMode ||
    showInEditableSection('term_source_is_self_knowledge', form.term_source_is_self_knowledge)
  const showMediaSourceFields = showAudioUploadField || showPhotoUploadField || showSourceField
  const showPrimaryEditableFields = [
    ['term', form.term],
    ['meaning', form.meaning],
  ].some(([field, value]) => showInEditableSection(field, value))
  const showIdentityEditableFields = [
    ['part_of_speech', form.part_of_speech],
    ['variant_type', form.variant_type],
    ['pronunciation_text', form.pronunciation_text],
    ['phonetic', form.phonetic],
  ].some(([field, value]) => showInEditableSection(field, value))
  const showVariantsEditor = showVariants && showInEditableSection('variants', form.variants)
  const showInflectedFormsEditor =
    showInflectedForms && showInEditableSection('inflected_forms', inflectedFormsValue)
  const showUsageNotesEditor = showUsageNotes && showInEditableSection('usage_notes', form.usage_notes)
  const showEtymologyEditor = showEtymology && showInEditableSection('etymology', form.etymology)
  const showRelatedWordsEditor = showRelatedWords && showRelatedEditableFields
  const showAnyEditableLanguageField =
    showCoreEditableFields ||
    showRelatedWordsEditor ||
    showExampleEditableFields ||
    showMediaSourceFields ||
    showVariantsEditor ||
    showInflectedFormsEditor ||
    showUsageNotesEditor ||
    showEtymologyEditor

  return (
    <>
      <section className="panel">
        <h2>Dictionary Draft Builder</h2>
        {correctionAssignment && (
          <section className="correction-assignment-banner">
            <strong>Returned for correction</strong>
            <p>{correctionAssignment.notes}</p>
            <small>
              Requested by @{correctionAssignment.returned_by}. Update this assigned snapshot and submit it
              for review.
            </small>
          </section>
        )}
        <div className="dictionary-top-grid">
          <section className="role-work-panel draft-new-term-panel">
            <div className="section-heading">
              <div>
                <h3>Add a New Dictionary Term</h3>
                <p className="muted">
                  Start with the headword. If a matching published term already exists, you can revise it
                  instead or continue with a different meaning.
                </p>
              </div>
            </div>
          </section>

          <div className="dictionary-side-stack">
            <section
              className={`role-work-panel draft-revision-picker${!revisePanelOpen && !isRevisionMode ? ' draft-revision-picker-collapsed' : ''}`}
            >
              {!revisePanelOpen && !isRevisionMode ? (
                <p className="revise-panel-toggle">
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={() => setRevisePanelOpen(true)}
                  >
                    Or find a published entry to revise →
                  </button>
                </p>
              ) : (
                <>
                  <div className="section-heading">
                    <div>
                      <h3>
                        {isRevisionMode
                          ? 'Choose Another Published Entry'
                          : 'Find a Published Entry to Revise'}
                      </h3>
                    </div>
                    {!isRevisionMode && (
                      <button
                        type="button"
                        className="ghost compact-button"
                        onClick={() => {
                          setRevisePanelOpen(false)
                          setRevisionSearchTerm('')
                          setRevisionSearchRows([])
                          setRevisionSearchMessage('')
                        }}
                      >
                        Hide
                      </button>
                    )}
                  </div>
                  {revisionSearchMessage && (
                    <p className="muted revise-search-message">{revisionSearchMessage}</p>
                  )}
                  <div className="dictionary-search-row">
                    <input
                      value={revisionSearchTerm}
                      onChange={(event) => setRevisionSearchTerm(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') searchPublishedEntries()
                      }}
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
                        setRevisionSearchMessage('')
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
                            <button
                              className="ghost"
                              onClick={() => navigate(`${ROUTES.dictionaryView}?entry_id=${row.entry_id}`)}
                            >
                              View Published Entry
                            </button>
                            <button onClick={() => revisePublishedEntry(row.entry_id)}>
                              Revise This Entry
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {(isRevisionMode || isSavedDraft) && (
              <section className="role-status-card draft-status-card" aria-live="polite">
                <p className="profile-kicker">
                  {isRevisionMode
                    ? 'Revision Draft'
                    : isRejectedSubmissionMode
                      ? 'Rejected Submission'
                      : 'Saved Draft'}
                </p>
                <h3>{form.term || (isRevisionMode ? 'Preparing selected entry...' : 'Draft in progress')}</h3>
                <p className="muted">
                  {isRevisionMode
                    ? 'This draft is linked to a published dictionary entry. The entry ID is being handled in the background.'
                    : normalizedRevisionStatus === 'draft'
                      ? 'This draft has not been submitted and is still editable.'
                      : normalizedRevisionStatus === 'pending'
                        ? `This submission was sent on ${
                            currentRevisionCreatedAt
                              ? new Date(currentRevisionCreatedAt).toLocaleDateString()
                              : 'review queue'
                          }. Editing is locked while under review. Revisions can be made after approved/rejected.`
                        : normalizedRevisionStatus === 'approved'
                          ? 'This submission is approved. Start a new revision to make changes.'
                          : normalizedRevisionStatus === 'rejected'
                            ? 'This submission was rejected. You can revise this same submission and apply reviewer feedback.'
                            : 'This submission is currently locked.'}
                </p>
                {isSavedDraft && !isEditableDraft && normalizedRevisionStatus === 'pending' && (
                  <p className="muted">Wait for review outcome. You can edit this again if it is rejected.</p>
                )}
                {isSavedDraft && !isEditableDraft && normalizedRevisionStatus === 'approved' && (
                  <p className="muted">
                    To change an approved submission, open the published entry and start a new revision.
                  </p>
                )}
                {isRejectedSubmissionMode && (
                  <div className="rejected-submission-guidance">
                    <strong>What to fix</strong>
                    <p>
                      {currentReviewerNotes ||
                        'The reviewer did not include specific notes. Review your entry carefully before resubmitting.'}
                    </p>
                    <small>
                      Edit this same private submission below, then submit it again for review. It is not a
                      public revision.
                    </small>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {isSnapshotEditMode && (
          <section className="revision-prefill-intro" aria-live="polite">
            <p className="profile-kicker">
              {isRevisionMode ? 'Prefilled from Approved Entry' : 'Rejected Submission Copy'}
            </p>
            <article className="dictionary-entry-detail revision-prefilled-preview">
              <header className="dictionary-headword">
                <div className="dictionary-readonly-label-row">
                  <small>Headword</small>
                  {isFieldLocked('term', snapshotForm.term) && (
                    <EditButton label="Edit headword" onClick={() => unlockField('term')} />
                  )}
                </div>
                <div className="dictionary-headword-row">
                  <h2>{normalizeHeadword(snapshotForm.term) || 'Headword'}</h2>
                  {snapshotAudioPreview && (
                    <button
                      type="button"
                      className="audio-icon-button audio-icon-inline"
                      onClick={() => playAudio(snapshotAudioPreview)}
                      aria-label="Play pronunciation audio"
                    >
                      🔊
                    </button>
                  )}
                </div>
                <div className="dictionary-pronunciation-line">
                  {snapshotForm.part_of_speech && (
                    <div className="labeled-pill">
                      <small>Part of Speech</small>
                      <span>
                        {snapshotForm.part_of_speech}{' '}
                        {isFieldLocked('part_of_speech', snapshotForm.part_of_speech) && (
                          <EditButton
                            label="Edit part of speech"
                            onClick={() => unlockField('part_of_speech')}
                          />
                        )}
                      </span>
                    </div>
                  )}
                  {snapshotForm.pronunciation_text && (
                    <div className="labeled-pill">
                      <small>Pronunciation</small>
                      <span>
                        {snapshotForm.pronunciation_text}{' '}
                        {isFieldLocked('pronunciation_text', snapshotForm.pronunciation_text) && (
                          <EditButton
                            label="Edit pronunciation"
                            onClick={() => unlockField('pronunciation_text')}
                          />
                        )}
                      </span>
                    </div>
                  )}
                  {snapshotForm.phonetic && (
                    <div className="labeled-pill">
                      <small>Phonetic</small>
                      <span>
                        {snapshotForm.phonetic}{' '}
                        {isFieldLocked('phonetic', snapshotForm.phonetic) && (
                          <EditButton
                            label="Edit phonetic notation"
                            onClick={() => unlockField('phonetic')}
                          />
                        )}
                      </span>
                    </div>
                  )}
                  {snapshotForm.variant_type && (
                    <div className="labeled-pill">
                      <small>Variant</small>
                      <span>
                        {snapshotForm.variant_type}{' '}
                        {isFieldLocked('variant_type', snapshotForm.variant_type) && (
                          <EditButton label="Edit variant type" onClick={() => unlockField('variant_type')} />
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </header>

              {snapshotPhotoPreview && (
                <div className="revision-prefilled-media">
                  <img className="dictionary-photo-preview" src={snapshotPhotoPreview} alt="" />
                  {isSnapshotEditMode && !unlockedFields.photo && (
                    <EditButton
                      label="Replace photo"
                      text="Replace photo"
                      onClick={() => unlockField('photo')}
                    />
                  )}
                </div>
              )}

              {snapshotAudioPreview && isSnapshotEditMode && !unlockedFields.audio_pronunciation && (
                <p className="meta">
                  <EditButton
                    label="Replace audio pronunciation"
                    text="Replace audio pronunciation"
                    onClick={() => unlockField('audio_pronunciation')}
                  />
                </p>
              )}

              {snapshotForm.meaning && (
                <section className="dictionary-definition">
                  <p className="definition-number">1</p>
                  <p>
                    {capitalizeFirst(snapshotForm.meaning)}{' '}
                    {isFieldLocked('meaning', snapshotForm.meaning) && (
                      <EditButton label="Edit meaning" onClick={() => unlockField('meaning')} />
                    )}
                  </p>
                </section>
              )}

              {(snapshotForm.example_sentence || snapshotForm.example_translation) && (
                <section className="dictionary-field-block">
                  <h4>Sample Sentence</h4>
                  <div className="example-translation-grid">
                    <div>
                      <p className="meta">Ivatan</p>
                      <p>
                        {sentenceForDisplay(snapshotForm.example_sentence) || '-'}{' '}
                        {isFieldLocked('example_sentence', snapshotForm.example_sentence) && (
                          <EditButton
                            label="Edit Ivatan example sentence"
                            onClick={() => unlockField('example_sentence')}
                          />
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="meta">English</p>
                      <p>
                        {sentenceForDisplay(snapshotForm.example_translation) || '-'}{' '}
                        {isFieldLocked('example_translation', snapshotForm.example_translation) && (
                          <EditButton
                            label="Edit English example translation"
                            onClick={() => unlockField('example_translation')}
                          />
                        )}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {snapshotRelatedWords.length > 0 && (
                <section className="dictionary-field-block">
                  <h4>Related Words</h4>
                  <div className="dictionary-chip-row">
                    {relatedWordGroups(snapshotForm).map(([label, rows]) => (
                      <span key={`prefill-related-${label}`}>
                        {label}: {rows.join(', ')}
                      </span>
                    ))}
                  </div>
                  <p className="meta">
                    {isFieldLocked('english_synonym', snapshotForm.english_synonym) && (
                      <EditButton
                        label="Edit English synonyms"
                        text="Edit English Synonyms"
                        onClick={() => unlockField('english_synonym')}
                      />
                    )}{' '}
                    {isFieldLocked('ivatan_synonym', snapshotForm.ivatan_synonym) && (
                      <EditButton
                        label="Edit Ivatan synonyms"
                        text="Edit Ivatan Synonyms"
                        onClick={() => unlockField('ivatan_synonym')}
                      />
                    )}{' '}
                    {isFieldLocked('english_antonym', snapshotForm.english_antonym) && (
                      <EditButton
                        label="Edit English antonyms"
                        text="Edit English Antonyms"
                        onClick={() => unlockField('english_antonym')}
                      />
                    )}{' '}
                    {isFieldLocked('ivatan_antonym', snapshotForm.ivatan_antonym) && (
                      <EditButton
                        label="Edit Ivatan antonyms"
                        text="Edit Ivatan Antonyms"
                        onClick={() => unlockField('ivatan_antonym')}
                      />
                    )}
                  </p>
                </section>
              )}

              {snapshotInflectedFormsPreviewRows.length > 0 && (
                <section className="dictionary-field-block">
                  <div className="dictionary-readonly-label-row">
                    <h4>Inflected Forms</h4>
                    {isFieldLocked('inflected_forms', snapshotInflectedFormsValue) && (
                      <EditButton
                        label="Edit inflected forms"
                        onClick={() => unlockFieldAndShow('inflected_forms', setShowInflectedForms)}
                      />
                    )}
                  </div>
                  <div className="dictionary-chip-row">
                    {snapshotInflectedFormsPreviewRows.map((row) => (
                      <span key={`prefill-inflection-${row.label}-${row.value}`}>
                        {row.label}: {row.value}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {(snapshotForm.usage_notes || snapshotForm.etymology) && (
                <section className="revision-notes-grid">
                  {snapshotForm.usage_notes && (
                    <article className="dictionary-field-block">
                      <div className="dictionary-readonly-label-row">
                        <h4>Usage Notes</h4>
                        {isFieldLocked('usage_notes', snapshotForm.usage_notes) && (
                          <EditButton
                            label="Edit usage notes"
                            onClick={() => unlockFieldAndShow('usage_notes', setShowUsageNotes)}
                          />
                        )}
                      </div>
                      <p>{snapshotForm.usage_notes}</p>
                    </article>
                  )}

                  {snapshotForm.etymology && (
                    <article className="dictionary-field-block">
                      <div className="dictionary-readonly-label-row">
                        <h4>Etymology</h4>
                        {isFieldLocked('etymology', snapshotForm.etymology) && (
                          <EditButton
                            label="Edit etymology"
                            onClick={() => unlockFieldAndShow('etymology', setShowEtymology)}
                          />
                        )}
                      </div>
                      <p>{snapshotForm.etymology}</p>
                    </article>
                  )}
                </section>
              )}

              {snapshotForm.variants.length > 0 && (
                <section className="dictionary-field-block">
                  <div className="dictionary-readonly-label-row">
                    <h4>Additional Variants</h4>
                    {isFieldLocked('variants', snapshotForm.variants) && (
                      <EditButton
                        label="Edit variants"
                        onClick={() => unlockFieldAndShow('variants', setShowVariants)}
                      />
                    )}
                  </div>
                  <div className="variant-preview-list">
                    {snapshotForm.variants.map((variant, index) => (
                      <article key={`prefilled-variant-${index}`}>
                        <strong>{variant.term || `Variant ${index + 1}`}</strong>
                        <p className="meta">
                          {[variant.variant_type, variant.pronunciation_text].filter(Boolean).join(' | ') ||
                            'Details not set'}
                        </p>
                        {variantDetailRows(variant).length > 0 && (
                          <dl className="variant-detail-list">
                            {variantDetailRows(variant).map(([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {(snapshotTermSource || snapshotAudioSource || snapshotPhotoSource) && (
                <section className="dictionary-field-block">
                  <div className="dictionary-readonly-label-row">
                    <h4>Attribution</h4>
                    {isFieldLocked('term_source_is_self_knowledge', form.term_source_is_self_knowledge) && (
                      <EditButton
                        label="Edit source settings"
                        onClick={() => unlockField('term_source_is_self_knowledge')}
                      />
                    )}
                  </div>
                  <div className="detail-list">
                    {snapshotTermSource && <p>{snapshotTermSource.replace(/^Source:\s*/, '')}</p>}
                    {snapshotAudioSource && <p>{snapshotAudioSource.replace(/^Audio Source:\s*/, '')}</p>}
                    {snapshotPhotoSource && <p>{snapshotPhotoSource.replace(/^Photo Source:\s*/, '')}</p>}
                  </div>
                </section>
              )}
            </article>
          </section>
        )}

        <div className={isSnapshotEditMode ? 'revision-edit-zone' : undefined}>
          {isSnapshotEditMode && (
            <section className="revision-editable-intro" aria-live="polite">
              <p className="profile-kicker">Additional Editable Fields</p>
              <p className="muted">
                Empty fields and unlocked fields appear here. To revise approved content, click the edit
                buttons in the snapshot above.
              </p>
            </section>
          )}

          {isSnapshotEditMode && !showAnyEditableLanguageField && (
            <section className="revision-empty-edit-state">
              <p>
                No fields are open for editing yet. Choose a pencil control in the approved entry snapshot
                above.
              </p>
            </section>
          )}

          {showPrimaryEditableFields && (
            <div className="dictionary-primary-fields">
              {showInEditableSection('term', form.term) && (
                <div className="field dictionary-term-field">
                  <label htmlFor="dictionary-term">
                    Headword <RequiredMark />{' '}
                    {isFieldLocked('term', form.term) && (
                      <EditButton label="Edit headword" text="Edit" onClick={() => unlockField('term')} />
                    )}
                  </label>
                  {isFieldLocked('term', form.term) ? (
                    renderLockedField('term', 'Headword', form.term)
                  ) : (
                    <input
                      id="dictionary-term"
                      placeholder="Enter headword..."
                      value={form.term}
                      onBlur={() => setField('term', normalizeHeadword(form.term))}
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
                  {matchingHeadwordBusy && (
                    <p className="hint">Checking for existing published headwords...</p>
                  )}
                  {showMatchingHeadwordPanel && (
                    <div className="duplicate-headword-panel" aria-live="polite">
                      <p className="duplicate-headword-title">
                        A published entry with this headword already exists.
                      </p>
                      <p className="muted">
                        If you mean the same word, revise the existing entry. If your entry has a different
                        meaning, you can continue with a new entry using the same headword.
                      </p>
                      <div className="card-list">
                        {matchingHeadwordRows.map((row) => (
                          <article key={row.entry_id} className="queue-card">
                            <div className="queue-header">
                              <strong>{row.term}</strong>
                              <span className="badge">{row.status}</span>
                            </div>
                            {row.part_of_speech && (
                              <p className="meta">Part of Speech: {row.part_of_speech}</p>
                            )}
                            {row.meaning && <p className="meta">Meaning: {row.meaning}</p>}
                            <div className="actions">
                              <button
                                className="ghost"
                                onClick={() => navigate(`${ROUTES.dictionaryView}?entry_id=${row.entry_id}`)}
                              >
                                View Published Entry
                              </button>
                              <button onClick={() => revisePublishedEntry(row.entry_id)}>
                                Revise Existing Entry
                              </button>
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
              )}
              {showInEditableSection('meaning', form.meaning) && (
                <div className="field dictionary-meaning-field">
                  <label htmlFor="dictionary-meaning">
                    Meaning <RequiredMark />{' '}
                    {isFieldLocked('meaning', form.meaning) && (
                      <EditButton label="Edit meaning" text="Edit" onClick={() => unlockField('meaning')} />
                    )}
                  </label>
                  {isFieldLocked('meaning', form.meaning) ? (
                    renderLockedField('meaning', 'Meaning', form.meaning)
                  ) : (
                    <textarea
                      id="dictionary-meaning"
                      rows={1}
                      value={form.meaning}
                      onBlur={() => setField('meaning', capitalizeFirst(form.meaning))}
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
              )}
            </div>
          )}

          {showIdentityEditableFields && (
            <div className="field-grid">
              {showInEditableSection('part_of_speech', form.part_of_speech) && (
                <div className="field">
                  <label htmlFor="dictionary-pos">
                    Part of Speech{' '}
                    {isFieldLocked('part_of_speech', form.part_of_speech) && (
                      <EditButton
                        label="Edit part of speech"
                        text="Edit"
                        onClick={() => unlockField('part_of_speech')}
                      />
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
              )}
              {showInEditableSection('variant_type', form.variant_type) && (
                <div className="field">
                  <FieldHeader
                    htmlFor="dictionary-variant"
                    guideAnchor="guide-variants"
                    label="Variant Type"
                  />
                  {isFieldLocked('variant_type', form.variant_type) ? (
                    renderLockedField('variant_type', 'Variant Type', form.variant_type)
                  ) : (
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
                  )}
                </div>
              )}
              {showInEditableSection('pronunciation_text', form.pronunciation_text) && (
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
                      placeholder="Example: VAH-hai"
                    />
                  )}
                </div>
              )}
              {showInEditableSection('phonetic', form.phonetic) && (
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
                      placeholder="Example: /ˈvahaj/"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {showExampleEditableFields && (
            <div className="field-grid">
              {showInEditableSection('example_sentence', form.example_sentence) && (
                <div className="field">
                  <label htmlFor="dictionary-example">
                    Example Sentence in Ivatan{' '}
                    {isFieldLocked('example_sentence', form.example_sentence) && (
                      <EditButton
                        label="Edit Ivatan example sentence"
                        text="Edit"
                        onClick={() => unlockField('example_sentence')}
                      />
                    )}
                  </label>
                  {isFieldLocked('example_sentence', form.example_sentence) ? (
                    renderLockedField('example_sentence', 'Example Sentence in Ivatan', form.example_sentence)
                  ) : (
                    <textarea
                      id="dictionary-example"
                      rows={1}
                      value={form.example_sentence}
                      onBlur={() => setField('example_sentence', normalizeSentence(form.example_sentence))}
                      onChange={(event) => setField('example_sentence', event.target.value)}
                    />
                  )}
                </div>
              )}
              {showInEditableSection('example_translation', form.example_translation) && (
                <div className="field">
                  <label htmlFor="dictionary-translation">
                    Example Translation Sentence in English{' '}
                    {String(form.example_sentence || '').trim() && <RequiredMark />}
                    {isFieldLocked('example_translation', form.example_translation) && (
                      <EditButton
                        label="Edit English example translation"
                        text="Edit"
                        onClick={() => unlockField('example_translation')}
                      />
                    )}
                  </label>
                  {isFieldLocked('example_translation', form.example_translation) ? (
                    renderLockedField(
                      'example_translation',
                      'Example Translation Sentence in English',
                      form.example_translation,
                    )
                  ) : (
                    <textarea
                      id="dictionary-translation"
                      rows={1}
                      value={form.example_translation}
                      onBlur={() =>
                        setField('example_translation', normalizeSentence(form.example_translation))
                      }
                      aria-invalid={Boolean(fieldErrors.example_translation)}
                      aria-describedby={
                        fieldErrors.example_translation ? 'dictionary-translation-error' : undefined
                      }
                      onChange={(event) => setField('example_translation', event.target.value)}
                    />
                  )}
                  {fieldErrors.example_translation && (
                    <p className="inline-error" id="dictionary-translation-error">
                      {fieldErrors.example_translation}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {showMediaSourceFields && (
            <div className="field-grid">
              {showAudioUploadField && (
                <div className="field">
                  <label htmlFor="dictionary-audio-upload">Audio Pronunciation Upload</label>
                  <input
                    id="dictionary-audio-upload"
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioChange}
                  />
                  {hasAudioMedia && (
                    <button
                      type="button"
                      className="ghost compact-button media-remove-button"
                      onClick={removeAudioUpload}
                    >
                      Remove Audio
                    </button>
                  )}
                  {hasAudioMedia && (
                    <div className="field">
                      <FieldHeader
                        htmlFor="dictionary-audio-source"
                        guideAnchor="guide-sources"
                        label="Audio Source"
                      />
                      <YesNoField
                        legend="Is this audio recording personally owned or produced by you?"
                        name="audio-source-self-recorded"
                        value={form.audio_source_is_self_recorded}
                        onChange={(nextValue) => {
                          if (
                            isFieldLocked('audio_source_is_self_recorded', form.audio_source_is_self_recorded)
                          )
                            return
                          setField('audio_source_is_self_recorded', nextValue)
                          if (nextValue) {
                            setField('audio_source', '')
                            setField('audio_license', form.audio_license || PLATFORM_DEFAULT_MEDIA_LICENSE)
                          } else {
                            setField('audio_license', '')
                          }
                        }}
                      />
                      {form.audio_source_is_self_recorded === false && (
                        <>
                          <label htmlFor="dictionary-audio-source-type">
                            Source Type <RequiredMark />
                          </label>
                          <select
                            id="dictionary-audio-source-type"
                            required
                            value={audioSourceType}
                            onChange={(event) => setAudioSourceType(event.target.value)}
                          >
                            <option value="">Select source type</option>
                            {DICTIONARY_AUDIO_SOURCE_TYPES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          {selectedAudioSourceConfig && (
                            <p className="hint">{selectedAudioSourceConfig.guidance}</p>
                          )}
                          {renderSourceFields(
                            selectedAudioSourceConfig,
                            audioSourceValues,
                            setAudioSourceValues,
                            'dictionary-audio-source',
                          )}
                        </>
                      )}
                      {form.audio_source_is_self_recorded === true && (
                        <>
                          <p className="hint">Audio Source: {SOURCE_OWNER_LABEL}</p>
                          {renderMediaLicenseSelect({
                            id: 'dictionary-audio-license',
                            value: form.audio_license,
                            onChange: (value) => setField('audio_license', value),
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {showPhotoUploadField && (
                <div className="field">
                  <label htmlFor="dictionary-photo-upload">Photo Upload</label>
                  <input
                    id="dictionary-photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                  />
                  {hasPhotoMedia && (
                    <button
                      type="button"
                      className="ghost compact-button media-remove-button"
                      onClick={removePhotoUpload}
                    >
                      Remove Photo
                    </button>
                  )}
                  {hasPhotoMedia && (
                    <div className="field">
                      <FieldHeader
                        htmlFor="dictionary-photo-source"
                        guideAnchor="guide-sources"
                        label="Photo Source"
                      />
                      <YesNoField
                        legend="Is this photo owned or produced by you?"
                        name="photo-source-contributor-owned"
                        value={form.photo_source_is_contributor_owned}
                        onChange={(nextValue) => {
                          if (
                            isFieldLocked(
                              'photo_source_is_contributor_owned',
                              form.photo_source_is_contributor_owned,
                            )
                          )
                            return
                          setField('photo_source_is_contributor_owned', nextValue)
                          if (nextValue) {
                            setField('photo_source', '')
                            setField('photo_license', form.photo_license || PLATFORM_DEFAULT_MEDIA_LICENSE)
                          } else {
                            setField('photo_license', '')
                          }
                        }}
                      />
                      {form.photo_source_is_contributor_owned === false && (
                        <>
                          <label htmlFor="dictionary-photo-source-type">
                            Source Type <RequiredMark />
                          </label>
                          <select
                            id="dictionary-photo-source-type"
                            required
                            value={photoSourceType}
                            onChange={(event) => setPhotoSourceType(event.target.value)}
                          >
                            <option value="">Select source type</option>
                            {DICTIONARY_PHOTO_SOURCE_TYPES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          {selectedPhotoSourceConfig && (
                            <p className="hint">{selectedPhotoSourceConfig.guidance}</p>
                          )}
                          {renderSourceFields(
                            selectedPhotoSourceConfig,
                            photoSourceValues,
                            setPhotoSourceValues,
                            'dictionary-photo-source',
                          )}
                        </>
                      )}
                      {form.photo_source_is_contributor_owned === true && (
                        <>
                          <p className="hint">Photo Source: {SOURCE_OWNER_LABEL}</p>
                          {renderMediaLicenseSelect({
                            id: 'dictionary-photo-license',
                            value: form.photo_license,
                            onChange: (value) => setField('photo_license', value),
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showSourceField && (
            <div className={fieldErrors.term_source_is_self_knowledge ? 'field field-error' : 'field'}>
              <FieldHeader
                htmlFor="dictionary-source"
                guideAnchor="guide-sources"
                label="Headword Source"
                required
              />
              {isFieldLocked('term_source_is_self_knowledge', form.term_source_is_self_knowledge) && (
                <p className="hint">
                  <EditButton
                    label="Edit source settings"
                    text="Edit source settings"
                    onClick={() => unlockField('term_source_is_self_knowledge')}
                  />
                </p>
              )}
              <YesNoField
                legend="Is this entry based on your own knowledge or lived use of the language?"
                name="term-source-self-knowledge"
                value={form.term_source_is_self_knowledge}
                required
                error={fieldErrors.term_source_is_self_knowledge}
                onChange={(nextValue) => {
                  if (isFieldLocked('term_source_is_self_knowledge', form.term_source_is_self_knowledge))
                    return
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
                  <select
                    id="dictionary-term-source-type"
                    required
                    value={termSourceType}
                    aria-invalid={Boolean(fieldErrors.term_source_type)}
                    aria-describedby={
                      fieldErrors.term_source_type ? 'dictionary-term-source-type-error' : undefined
                    }
                    onChange={(event) => {
                      setTermSourceType(event.target.value)
                      clearFieldError('term_source_type')
                    }}
                  >
                    <option value="">Select source type</option>
                    {DICTIONARY_TERM_SOURCE_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.term_source_type && (
                    <p className="inline-error" id="dictionary-term-source-type-error">
                      {fieldErrors.term_source_type}
                    </p>
                  )}
                  {selectedTermSourceConfig && <p className="hint">{selectedTermSourceConfig.guidance}</p>}
                  {renderSourceFields(
                    selectedTermSourceConfig,
                    termSourceValues,
                    setTermSourceValues,
                    'dictionary-term-source',
                  )}
                </>
              )}
            </div>
          )}

          <section className="draft-subsection draft-compact-stack">
            <div className="section-heading">
              <div>
                <h3>Optional Language Details</h3>
              </div>
            </div>

            <div
              className="draft-toggle-row"
              style={{ order: 100 }}
              aria-label="Optional entry detail sections"
            >
              {showVariants && isFieldLocked('variants', form.variants) ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    touchOptionalPanel('variants')
                    unlockFieldAndShow('variants', setShowVariants)
                  }}
                >
                  Edit Variants
                </button>
              ) : showVariants ? (
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
                    removeOptionalPanel('variants')
                  }}
                >
                  Remove Variants
                </button>
              ) : (
                <button className="ghost" type="button" onClick={openVariantsWithInitialRow}>
                  Add Variants
                </button>
              )}
              {showInflectedForms && isFieldLocked('inflected_forms', inflectedFormsValue) ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    touchOptionalPanel('inflected')
                    unlockFieldAndShow('inflected_forms', setShowInflectedForms)
                  }}
                >
                  Edit Inflected Forms
                </button>
              ) : showInflectedForms ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setInflectionRows([])
                    setShowInflectedForms(false)
                    removeOptionalPanel('inflected')
                  }}
                >
                  Remove Inflected Forms
                </button>
              ) : (
                <button className="ghost" type="button" onClick={openInflectedFormsWithInitialRow}>
                  Add Inflected Forms
                </button>
              )}
              {showRelatedWords &&
              ['english_synonym', 'ivatan_synonym', 'english_antonym', 'ivatan_antonym'].some((field) =>
                isFieldLocked(field, form[field]),
              ) ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setShowRelatedWords(true)
                    touchOptionalPanel('related')
                  }}
                >
                  Edit Synonym/Antonym
                </button>
              ) : showRelatedWords ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setField('english_synonym', '')
                    setField('ivatan_synonym', '')
                    setField('english_antonym', '')
                    setField('ivatan_antonym', '')
                    setShowRelatedWords(false)
                    removeOptionalPanel('related')
                  }}
                >
                  Remove Synonym/Antonym
                </button>
              ) : (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setShowRelatedWords(true)
                    touchOptionalPanel('related')
                  }}
                >
                  Add Synonym/Antonym
                </button>
              )}
              {showUsageNotes && isFieldLocked('usage_notes', form.usage_notes) ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    touchOptionalPanel('usage')
                    unlockFieldAndShow('usage_notes', setShowUsageNotes)
                  }}
                >
                  Edit Usage Notes
                </button>
              ) : showUsageNotes ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setField('usage_notes', '')
                    setShowUsageNotes(false)
                    removeOptionalPanel('usage')
                  }}
                >
                  Remove Usage Notes
                </button>
              ) : (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setShowUsageNotes(true)
                    touchOptionalPanel('usage')
                  }}
                >
                  Add Usage Notes
                </button>
              )}
              {showEtymology && isFieldLocked('etymology', form.etymology) ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    touchOptionalPanel('etymology')
                    unlockFieldAndShow('etymology', setShowEtymology)
                  }}
                >
                  Edit Etymology
                </button>
              ) : showEtymology ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setField('etymology', '')
                    setShowEtymology(false)
                    removeOptionalPanel('etymology')
                  }}
                >
                  Remove Etymology
                </button>
              ) : (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setShowEtymology(true)
                    touchOptionalPanel('etymology')
                  }}
                >
                  Add Etymology
                </button>
              )}
            </div>

            {showUsageNotesEditor && (
              <section className="draft-mini-section" style={{ order: optionalPanelCssOrder('usage') }}>
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

            {showEtymologyEditor && (
              <section className="draft-mini-section" style={{ order: optionalPanelCssOrder('etymology') }}>
                <div className="section-heading">
                  <div>
                    <h4>Etymology</h4>
                    <p className="muted">
                      Add origin notes only when you are reasonably confident.{' '}
                      <GuideLink anchor="guide-etymology">Learn More</GuideLink>
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

            {showRelatedWordsEditor && (
              <section className="draft-mini-section" style={{ order: optionalPanelCssOrder('related') }}>
                <div className="section-heading">
                  <div>
                    <h4>Synonyms / Antonyms</h4>
                    <p className="muted">Add related words only when they are useful and accurate.</p>
                  </div>
                </div>
                <div className="field-grid dictionary-related-row">
                  {showInEditableSection('english_synonym', form.english_synonym) && (
                    <div className="field">
                      <label htmlFor="dictionary-english-synonym">
                        English Synonyms{' '}
                        {isFieldLocked('english_synonym', form.english_synonym) && (
                          <EditButton
                            label="Edit English synonyms"
                            text="Edit"
                            onClick={() => unlockField('english_synonym')}
                          />
                        )}
                      </label>
                      {isFieldLocked('english_synonym', form.english_synonym) ? (
                        renderLockedField('english_synonym', 'English Synonyms', form.english_synonym)
                      ) : (
                        <input
                          id="dictionary-english-synonym"
                          value={form.english_synonym}
                          onChange={(event) => setField('english_synonym', event.target.value)}
                          placeholder="Comma-separated synonyms"
                        />
                      )}
                    </div>
                  )}
                  {showInEditableSection('ivatan_synonym', form.ivatan_synonym) && (
                    <div className="field">
                      <label htmlFor="dictionary-ivatan-synonym">
                        Ivatan Synonyms{' '}
                        {isFieldLocked('ivatan_synonym', form.ivatan_synonym) && (
                          <EditButton
                            label="Edit Ivatan synonyms"
                            text="Edit"
                            onClick={() => unlockField('ivatan_synonym')}
                          />
                        )}
                      </label>
                      {isFieldLocked('ivatan_synonym', form.ivatan_synonym) ? (
                        renderLockedField('ivatan_synonym', 'Ivatan Synonyms', form.ivatan_synonym)
                      ) : (
                        <input
                          id="dictionary-ivatan-synonym"
                          value={form.ivatan_synonym}
                          onChange={(event) => setField('ivatan_synonym', event.target.value)}
                          placeholder="Comma-separated synonyms"
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="field-grid dictionary-related-row">
                  {showInEditableSection('english_antonym', form.english_antonym) && (
                    <div className="field">
                      <label htmlFor="dictionary-english-antonym">
                        English Antonyms{' '}
                        {isFieldLocked('english_antonym', form.english_antonym) && (
                          <EditButton
                            label="Edit English antonyms"
                            text="Edit"
                            onClick={() => unlockField('english_antonym')}
                          />
                        )}
                      </label>
                      {isFieldLocked('english_antonym', form.english_antonym) ? (
                        renderLockedField('english_antonym', 'English Antonyms', form.english_antonym)
                      ) : (
                        <input
                          id="dictionary-english-antonym"
                          value={form.english_antonym}
                          onChange={(event) => setField('english_antonym', event.target.value)}
                          placeholder="Comma-separated antonyms"
                        />
                      )}
                    </div>
                  )}
                  {showInEditableSection('ivatan_antonym', form.ivatan_antonym) && (
                    <div className="field">
                      <label htmlFor="dictionary-ivatan-antonym">
                        Ivatan Antonyms{' '}
                        {isFieldLocked('ivatan_antonym', form.ivatan_antonym) && (
                          <EditButton
                            label="Edit Ivatan antonyms"
                            text="Edit"
                            onClick={() => unlockField('ivatan_antonym')}
                          />
                        )}
                      </label>
                      {isFieldLocked('ivatan_antonym', form.ivatan_antonym) ? (
                        renderLockedField('ivatan_antonym', 'Ivatan Antonyms', form.ivatan_antonym)
                      ) : (
                        <input
                          id="dictionary-ivatan-antonym"
                          value={form.ivatan_antonym}
                          onChange={(event) => setField('ivatan_antonym', event.target.value)}
                          placeholder="Comma-separated antonyms"
                        />
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {showVariantsEditor && (
              <section className="draft-mini-section" style={{ order: optionalPanelCssOrder('variants') }}>
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
                      <div className="field-grid dictionary-variant-top-grid">
                        <div className="field">
                          <label htmlFor={`variant-term-${index}`}>Variant Headword</label>
                          <input
                            id={`variant-term-${index}`}
                            value={variant.term}
                            onBlur={() => setVariantField(index, 'term', normalizeHeadword(variant.term))}
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
                      </div>
                      <div className="field-grid dictionary-variant-pronunciation-grid">
                        <div className="field">
                          <FieldHeader
                            htmlFor={`variant-pronunciation-${index}`}
                            guideAnchor="guide-pronunciation"
                            label="Pronunciation Text"
                          />
                          <input
                            id={`variant-pronunciation-${index}`}
                            value={variant.pronunciation_text}
                            onChange={(event) =>
                              setVariantField(index, 'pronunciation_text', event.target.value)
                            }
                            placeholder="Example: VAH-hai"
                          />
                        </div>
                        <div className="field">
                          <FieldHeader
                            htmlFor={`variant-phonetic-${index}`}
                            guideAnchor="guide-pronunciation"
                            label="Phonetic Notation"
                          />
                          <input
                            id={`variant-phonetic-${index}`}
                            value={variant.phonetic}
                            onChange={(event) => setVariantField(index, 'phonetic', event.target.value)}
                            placeholder="Example: /ˈvahaj/"
                          />
                        </div>
                      </div>
                      <div className="field-grid dictionary-variant-example-grid">
                        <div className="field">
                          <label htmlFor={`variant-example-${index}`}>Sample Sentence in Ivatan</label>
                          <input
                            id={`variant-example-${index}`}
                            value={variant.example_sentence}
                            onBlur={() =>
                              setVariantField(
                                index,
                                'example_sentence',
                                normalizeSentence(variant.example_sentence),
                              )
                            }
                            onChange={(event) =>
                              setVariantField(index, 'example_sentence', event.target.value)
                            }
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`variant-translation-${index}`}>
                            Sample Sentence Translation{' '}
                            {String(variant.example_sentence || '').trim() && <RequiredMark />}
                          </label>
                          <input
                            id={`variant-translation-${index}`}
                            value={variant.example_translation}
                            onBlur={() =>
                              setVariantField(
                                index,
                                'example_translation',
                                normalizeSentence(variant.example_translation),
                              )
                            }
                            aria-invalid={Boolean(fieldErrors[`variant-${index}-example_translation`])}
                            aria-describedby={
                              fieldErrors[`variant-${index}-example_translation`]
                                ? `variant-translation-${index}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              setVariantField(index, 'example_translation', event.target.value)
                            }
                          />
                          {fieldErrors[`variant-${index}-example_translation`] && (
                            <p className="inline-error" id={`variant-translation-${index}-error`}>
                              {fieldErrors[`variant-${index}-example_translation`]}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="field-grid dictionary-variant-notes-grid">
                        <div className="field compact-field">
                          <label htmlFor={`variant-audio-${index}`}>Variant Audio File</label>
                          <input
                            id={`variant-audio-${index}`}
                            type="file"
                            accept="audio/*"
                            onChange={(event) => handleVariantAudioChange(index, event)}
                          />
                          {variantAudioPreviews[index] && (
                            <audio controls src={variantAudioPreviews[index]} />
                          )}
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
                                      {
                                        resolveSourceConfig(
                                          DICTIONARY_AUDIO_SOURCE_TYPES,
                                          variant.audio_source_type,
                                        )?.guidance
                                      }
                                    </p>
                                  )}
                                  {variant.audio_source_type && (
                                    <div className="field-grid">
                                      {(
                                        resolveSourceConfig(
                                          DICTIONARY_AUDIO_SOURCE_TYPES,
                                          variant.audio_source_type,
                                        )?.fields || []
                                      ).map((field) => (
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
                        <div className="field compact-field">
                          <label htmlFor={`variant-usage-${index}`}>Usage / Etymology Notes</label>
                          <textarea
                            id={`variant-usage-${index}`}
                            value={variant.usage_notes}
                            onChange={(event) => setVariantField(index, 'usage_notes', event.target.value)}
                            placeholder="Short note about use, meaning nuance, or origin."
                            rows={3}
                          />
                        </div>
                        {variant.variant_type === OLD_HISTORICAL_VARIANT_TYPE && (
                          <div className="field compact-field">
                            <label htmlFor={`variant-historical-note-${index}`}>
                              Historical Source / Contributor Note
                            </label>
                            <textarea
                              id={`variant-historical-note-${index}`}
                              value={variant.historical_note}
                              onChange={(event) =>
                                setVariantField(index, 'historical_note', event.target.value)
                              }
                              placeholder="Where it was recorded or remembered, approximate period if known, and whether it is still understood or no longer commonly used."
                              rows={3}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {showInflectedFormsEditor && (
              <section className="draft-mini-section" style={{ order: optionalPanelCssOrder('inflected') }}>
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
                    <div
                      key={`inflection-${index}`}
                      className={`inflection-row ${row.label === 'Other' ? 'has-custom' : ''}`}
                    >
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
          </section>
        </div>

        <section className="draft-preview-panel" style={{ order: 110 }}>
          <div className="section-heading draft-preview-heading">
            <span className="badge">Draft preview</span>
          </div>

          <article className="dictionary-entry-detail">
            <header className="dictionary-headword">
              <div className="dictionary-headword-row">
                <h2>{normalizeHeadword(form.term) || 'Headword'}</h2>
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
                      <strong>{normalizeHeadword(variant.term) || `Variant ${index + 1}`}</strong>
                      <p className="meta">
                        {[
                          variantForPayload(variant).variant_type,
                          variant.pronunciation_text,
                          variant.phonetic,
                        ]
                          .filter(Boolean)
                          .join(' | ') || 'Details not set'}
                      </p>
                      {variantDetailRows(variant).length > 0 && (
                        <dl className="variant-detail-list">
                          {variantDetailRows(variant).map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {variantAudioPreviews[index] && <audio controls src={variantAudioPreviews[index]} />}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {photoPreview && <img className="dictionary-photo-preview" src={photoPreview} alt="" />}
            <section className="dictionary-definition">
              <p className="definition-number">1</p>
              <p>{capitalizeFirst(form.meaning) || 'Meaning will appear here.'}</p>
            </section>

            {(form.example_sentence || form.example_translation) && (
              <section className="dictionary-field-block">
                <h4>Sample Sentence</h4>
                <div className="example-translation-grid">
                  <div>
                    <p className="meta">Ivatan</p>
                    <p>{sentenceForDisplay(form.example_sentence) || '-'}</p>
                  </div>
                  <div>
                    <p className="meta">English</p>
                    <p>{sentenceForDisplay(form.example_translation) || '-'}</p>
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
                  {relatedWordGroups(form).map(([label, rows]) => (
                    <span key={`related-${label}`}>
                      {label}: {rows.join(', ')}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="dictionary-attribution-block">
              <h4>Attribution</h4>
              <div className="detail-list">
                <p>
                  Contributed by <strong>Your submission</strong>
                </p>
                {previewTermSource && (
                  <p>
                    Term Source: <strong>{previewTermSource.replace(/^Source:\s*/, '')}</strong>
                  </p>
                )}
                {previewAudioSource && (
                  <p>
                    Audio Source: <strong>{previewAudioSource.replace(/^Audio Source:\s*/, '')}</strong>
                  </p>
                )}
                {previewPhotoSource && (
                  <p>
                    Image Source:{' '}
                    <strong>{previewPhotoSource.replace(/^(?:Photo|Image) Source:\s*/, '')}</strong>
                  </p>
                )}
                <p>
                  Approved by: <strong>Pending review</strong>
                </p>
              </div>
            </section>
          </article>
        </section>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert ok">{message}</div>}

        {(audioFile || photoFile || hasExistingAudioMedia || hasExistingPhotoMedia) && (
          <label className="checkbox-inline media-policy-check" htmlFor="dictionary-media-policy-check">
            <input
              id="dictionary-media-policy-check"
              type="checkbox"
              checked={mediaPolicyAccepted}
              onChange={(event) => setMediaPolicyAccepted(event.target.checked)}
            />
            <span>
              I have read and agree to the <a href={`${ROUTES.faqs}#how-review-works`}>Media Upload Policy</a>
              .
            </span>
          </label>
        )}

        <div className="actions draft-action-bar" aria-label="Dictionary draft actions">
          <button disabled={busy || !isEditableDraft} onClick={() => submitEntry()}>
            {isRevisionMode ? 'Submit Revision' : 'Submit Entry'}
          </button>
          <button className="ghost" disabled={busy || !isEditableDraft} onClick={() => saveDraft()}>
            Save as Draft
          </button>
          <button className="ghost" disabled={busy} onClick={() => clearDraftContext()}>
            Clear Form
          </button>
          <button
            className="ghost danger"
            disabled={busy || !isEditableDraft}
            title={revisionId ? 'Delete this saved draft' : 'Clear this unsaved draft form'}
            onClick={() => setConfirmDeleteDraft(true)}
          >
            Delete Draft
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDeleteDraft}
        title={revisionId ? 'Delete this dictionary draft?' : 'Discard this unsaved dictionary draft?'}
        message={
          revisionId
            ? `You are about to delete "${form.term || 'this dictionary draft'}".`
            : 'This draft has not been saved yet. Discarding it will permanently clear the current form data.'
        }
        detail={
          revisionId
            ? 'This removes the saved draft only. It will not affect any submitted or approved entry.'
            : 'No saved database record will be deleted because this form is still unsaved.'
        }
        confirmLabel={revisionId ? 'Delete Draft' : 'Discard Draft'}
        cancelLabel={revisionId ? 'Keep Draft' : 'Keep Editing'}
        busy={busy}
        onCancel={() => setConfirmDeleteDraft(false)}
        onConfirm={() => deleteDraft()}
      />
      <ContributionCelebration celebration={celebration} onClose={continueAfterSubmission} />
    </>
  )
}
