/*
  FolkloreDraftBuilderPage.jsx

  Contributor workflow page for:
  - create draft
  - update draft
  - submit draft
  - review your own revision list
*/

import { useEffect, useState } from 'react'

import ConfirmDialog from '../components/ConfirmDialog'
import RichTextEditor from '../components/RichTextEditor'
import ContributionCelebration from '../components/ContributionCelebration'
import { apiRequest } from '../lib/api'
import { useContributionCelebration } from '../lib/contributionCelebration'
import {
  FOLKLORE_TAXONOMY,
  folkloreSubcategoryOptions,
  folkloreTaxonomyLabel,
  municipalitySourceLabel,
} from '../lib/folkloreTaxonomy'
import { prepareImageUpload } from '../lib/imageUpload'
import { ROUTES, navigate } from '../lib/router'
import { formatSourceDisplay } from '../lib/sourceDisplay'

const MUNICIPALITY_OPTIONS = ['Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat', 'Not Applicable']

const INITIAL_FORM = {
  title: '',
  content: '',
  category: 'oral_narratives',
  subcategory: 'myths',
  municipality_source: 'Not Applicable',
  source: '',
  self_knowledge: null,
  media_url: '',
  media_source: '',
  self_produced_media: null,
  copyright_usage: '',
}

const SOURCE_OWNER_LABEL = 'K. Adami'
const SOURCE_REMARKS_KEY = 'source_remarks'

const FOLKLORE_TEXT_SOURCE_TYPES = [
  {
    value: 'community_narrative',
    label: 'Community Narrative',
    guidance:
      'Use for stories, sayings, or narratives widely recognized within a municipality or community. Community variations and retellings are welcome when shared respectfully.',
    fields: [{ key: 'municipality', label: 'Municipality' }],
    build: (v) => `Community narrative from ${v.municipality}`,
  },
  {
    value: 'oral_tradition',
    label: 'Oral Tradition / Narration',
    guidance:
      'Use for stories preserved through oral transmission. Please acknowledge narrators whenever possible.',
    fields: [{ key: 'informant_name', label: 'Informant Name' }],
    build: (v) => `Narrated by ${v.informant_name}`,
  },
  {
    value: 'family_story',
    label: 'Family Story',
    guidance: 'Use for stories preserved through family memory or household storytelling traditions.',
    fields: [
      { key: 'family_name', label: 'Family Name' },
      { key: 'family_head', label: 'Head of the Family' },
      { key: 'municipality', label: 'Municipality' },
    ],
    build: (v) =>
      `Family story shared by the ${v.family_name} family${v.municipality ? ` from ${v.municipality}` : ''}`,
  },
  {
    value: 'academic_collection',
    label: 'Academic Collection',
    guidance: 'Use for folklore collections documented in publications, research, or academic studies.',
    fields: [
      { key: 'author', label: 'Author' },
      { key: 'title', label: 'Publication / Title' },
      { key: 'year', label: 'Year' },
    ],
    build: (v) =>
      `Folklore collection by ${v.author}${v.year ? ` (${v.year})` : ''}${v.title ? `, ${v.title}` : ''}`,
  },
  {
    value: 'church_school_material',
    label: 'Church / School Material',
    guidance: 'Use for narratives preserved through educational, religious, or community teaching materials.',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'institution_name', label: 'Institution Name' },
    ],
    build: (v) => `${v.title}${v.institution_name ? `, ${v.institution_name}` : ''}`,
  },
  {
    value: 'other',
    label: 'Other',
    guidance: 'Use if no category appropriately fits the source. Additional context is appreciated.',
    fields: [],
    build: () => 'Other source',
  },
]

const FOLKLORE_AUDIO_SOURCE_TYPES = [
  {
    value: 'recorded_elder_narration',
    label: 'Recorded Elder Narration',
    guidance: 'Use for spoken storytelling recordings shared for cultural preservation.',
    fields: [{ key: 'elder_name', label: 'Elder Name' }],
    build: (v) => `Narration by ${v.elder_name}`,
  },
  {
    value: 'traditional_song_laji',
    label: 'Traditional Song / Laji',
    guidance: 'Use for traditional songs, chants, or laji recordings.',
    fields: [{ key: 'performer_name', label: 'Performer Name' }],
    build: (v) => `Laji performed by ${v.performer_name}`,
  },
  {
    value: 'ceremony_recording',
    label: 'Ceremony Recording',
    guidance: 'Use for recordings related to rituals or ceremonies.',
    fields: [{ key: 'ceremony_name', label: 'Ceremony Name' }],
    build: (v) => `${v.ceremony_name} recording`,
  },
  {
    value: 'community_performance',
    label: 'Community Performance',
    guidance: 'Use for recordings from local cultural performances or events.',
    fields: [{ key: 'event_name', label: 'Event Name' }],
    build: (v) => `${v.event_name} community performance`,
  },
  {
    value: 'other',
    label: 'Other',
    guidance: 'Use if no category appropriately fits the source.',
    fields: [],
    build: () => 'Other source',
  },
]

const FOLKLORE_PHOTO_SOURCE_TYPES = [
  {
    value: 'historical_photo',
    label: 'Historical Photo',
    guidance: 'Use for older photographs with historical value.',
    fields: [{ key: 'approx_year', label: 'Approximate Year' }],
    build: (v) => `Historical photograph${v.approx_year ? `, circa ${v.approx_year}` : ''}`,
  },
  {
    value: 'family_collection',
    label: 'Family Collection',
    guidance: 'Use for photographs preserved by families or households.',
    fields: [{ key: 'family_notes', label: 'Family Notes' }],
    build: (v) => `Shared from family collection${v.family_notes ? `, ${v.family_notes}` : ''}`,
  },
  {
    value: 'event_documentation',
    label: 'Event Documentation',
    guidance: 'Use for photographs documenting local traditions or events.',
    fields: [{ key: 'event_name', label: 'Event Name' }],
    build: (v) => `${v.event_name} documentation`,
  },
  {
    value: 'museum_archive',
    label: 'Museum / Archive',
    guidance: 'Use for archival or institutional images.',
    fields: [{ key: 'institution_name', label: 'Institution Name' }],
    build: (v) => v.institution_name,
  },
  {
    value: 'book_image',
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
    guidance: 'Acknowledge the original location when known.',
    fields: [
      { key: 'website_title', label: 'Website Name / Image Title' },
      { key: 'url', label: 'URL', type: 'url' },
    ],
    build: (v) => `${v.website_title}${v.url ? ` (${v.url})` : ''}`,
  },
  {
    value: 'ai_illustration',
    label: 'AI-Assisted Illustration',
    guidance: 'Use for AI-assisted educational visualization.',
    fields: [{ key: 'tool_used', label: 'Tool Used' }],
    build: (v) => `AI-assisted illustration from ${v.tool_used}`,
  },
  {
    value: 'other',
    label: 'Other',
    guidance: 'Use if no category appropriately fits the source.',
    fields: [],
    build: () => 'Other source',
  },
]

const FOLKLORE_VIDEO_SOURCE_TYPES = [
  {
    value: 'documentary_footage',
    label: 'Documentary Footage',
    guidance: 'Use for educational documentary recordings.',
    fields: [{ key: 'producer_name', label: 'Producer Name' }],
    build: (v) => `Community heritage documentary${v.producer_name ? ` by ${v.producer_name}` : ''}`,
  },
  {
    value: 'community_recording',
    label: 'Community Recording',
    guidance: 'Use for locally recorded cultural activities or events.',
    fields: [{ key: 'recorder_name', label: 'Recorder Name' }],
    build: (v) => `Community-contributed recording shared by ${v.recorder_name}`,
  },
  {
    value: 'interview_video',
    label: 'Interview Video',
    guidance: 'Use for interviews documenting language or oral history.',
    fields: [{ key: 'interviewees', label: 'Interviewee Name(s), comma-separated' }],
    build: (v) => `Interview with ${v.interviewees}`,
  },
  {
    value: 'youtube_external',
    label: 'YouTube / External Video',
    guidance: 'Use external links for educational reference.',
    fields: [{ key: 'channel_name', label: 'YouTube Channel Name' }],
    build: (v) => `${v.channel_name}`,
  },
  {
    value: 'archive_footage',
    label: 'Archive Footage',
    guidance: 'Use for archival or historical recordings.',
    fields: [{ key: 'archive_name', label: 'Archive Name' }],
    build: (v) => `${v.archive_name}`,
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

function getYouTubeEmbedUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v')
      return videoId ? `https://www.youtube.com/embed/${videoId}` : ''
    }
    if (url.hostname === 'youtu.be') {
      const videoId = url.pathname.replace('/', '')
      return videoId ? `https://www.youtube.com/embed/${videoId}` : ''
    }
  } catch {
    return ''
  }
  return ''
}

function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      *
    </span>
  )
}

function YesNoField({ legend, name, value, onChange, error = '', required = false }) {
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

export default function FolkloreDraftBuilderPage() {
  const [revisionId, setRevisionId] = useState('')
  const [entryId, setEntryId] = useState('')
  const [autoRevisionStarted, setAutoRevisionStarted] = useState(false)
  const [currentRevisionStatus, setCurrentRevisionStatus] = useState('')
  const [currentReviewerNotes, setCurrentReviewerNotes] = useState('')
  const [correctionAssignment, setCorrectionAssignment] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [textSourceType, setTextSourceType] = useState('')
  const [textSourceValues, setTextSourceValues] = useState({})
  const [audioOwnedByContributor, setAudioOwnedByContributor] = useState(null)
  const [audioSourceType, setAudioSourceType] = useState('')
  const [audioSourceValues, setAudioSourceValues] = useState({})
  const [photoOwnedByContributor, setPhotoOwnedByContributor] = useState(null)
  const [photoSourceType, setPhotoSourceType] = useState('')
  const [photoSourceValues, setPhotoSourceValues] = useState({})
  const [videoOwnedByContributor, setVideoOwnedByContributor] = useState(null)
  const [videoSourceType, setVideoSourceType] = useState('')
  const [videoSourceValues, setVideoSourceValues] = useState({})
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoPreviewSize, setPhotoPreviewSize] = useState({ width: 0, height: 0 })
  const [audioFile, setAudioFile] = useState(null)
  const [existingPhotoUrl, setExistingPhotoUrl] = useState('')
  const [existingAudioUrl, setExistingAudioUrl] = useState('')
  const [mediaPolicyAccepted, setMediaPolicyAccepted] = useState(false)
  const [showUsagePermission, setShowUsagePermission] = useState(false)
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false)
  const youtubeEmbedUrl = getYouTubeEmbedUrl(form.media_url)
  const { celebration, celebrateContribution, celebrateDraftSaved, closeCelebration } =
    useContributionCelebration()
  const hasMedia = Boolean(form.media_url.trim() || audioFile || existingPhotoUrl || existingAudioUrl)
  const hasAudioMedia = Boolean(audioFile || existingAudioUrl)
  const hasPhotoMedia = Boolean(existingPhotoUrl)
  const hasVideoMedia = Boolean(form.media_url.trim())
  const isRejectedSubmission = currentRevisionStatus === 'rejected'
  const useCompactPhotoPreview =
    Boolean(photoPreview) &&
    !youtubeEmbedUrl &&
    Math.max(photoPreviewSize.width, photoPreviewSize.height) > 0 &&
    Math.max(photoPreviewSize.width, photoPreviewSize.height) < 600

  const selectedTextSourceConfig = resolveSourceConfig(FOLKLORE_TEXT_SOURCE_TYPES, textSourceType)
  const selectedAudioSourceConfig = resolveSourceConfig(FOLKLORE_AUDIO_SOURCE_TYPES, audioSourceType)
  const selectedPhotoSourceConfig = resolveSourceConfig(FOLKLORE_PHOTO_SOURCE_TYPES, photoSourceType)
  const selectedVideoSourceConfig = resolveSourceConfig(FOLKLORE_VIDEO_SOURCE_TYPES, videoSourceType)
  const subcategoryOptions = folkloreSubcategoryOptions(form.category)
  const previewTextSource = buildFolkloreTextSourceForSubmit()
  const previewMediaSource = buildFolkloreMediaSourceForSubmit()

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const entryFromQuery = query.get('entry_id')
    if (entryFromQuery) {
      setEntryId(entryFromQuery)
    }
  }, [])

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const revisionFromQuery = query.get('revision_id')
    if (!revisionFromQuery) return

    let cancelled = false
    async function loadDraftFromQuery() {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const rows = await fetchMyRevisions()
        if (cancelled) return
        const revision = rows.find((row) => row.revision_id === revisionFromQuery)
        if (!revision) {
          setError('Folklore draft not found in your contributions.')
          return
        }
        if (!['draft', 'rejected'].includes(revision.status)) {
          setError('Only draft or rejected folklore revisions can be edited.')
          return
        }
        setEntryId(revision.entry_id || '')
        loadRevisionIntoForm(revision)
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    loadDraftFromQuery()
    return () => {
      cancelled = true
    }
    // Load the specific saved draft requested by Steward's Desk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!entryId || revisionId || autoRevisionStarted) return

    let cancelled = false
    setAutoRevisionStarted(true)
    async function startRevisionFromEntry() {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const payload = await apiRequest(`/api/folklore/entries/${entryId}/revisions/start`, {
          method: 'POST',
        })
        if (cancelled) return
        setRevisionId(payload.revision_id || '')
        setEntryId(payload.entry_id || entryId)
        loadRevisionIntoForm(payload)
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    startRevisionFromEntry()
    return () => {
      cancelled = true
    }
    // Start a steward edit from the live folklore entry requested by the public detail page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, revisionId, autoRevisionStarted])

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function updateSourceValues(setter, key, value, errorKey = key) {
    setter((current) => ({ ...current, [key]: value }))
    clearFieldError(errorKey)
  }

  function asNullableBoolean(value) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'boolean') return value
    return String(value).trim().toLowerCase() === 'true'
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
                {field.label} <RequiredMark />
              </label>
              <input
                id={`${idPrefix}-${field.key}`}
                type={field.type || 'text'}
                value={values[field.key] || ''}
                max={field.type === 'date' ? todayInputValue() : undefined}
                aria-invalid={Boolean(fieldErrors[errorKey])}
                aria-describedby={fieldErrors[errorKey] ? `${idPrefix}-${field.key}-error` : undefined}
                onChange={(event) => updateSourceValues(setter, field.key, event.target.value, errorKey)}
              />
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
            placeholder="Example: Shared by elders in Basco during a community gathering."
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

  function renderMediaSourceControls({
    title,
    question,
    name,
    value,
    setOwned,
    sourceType,
    setSourceType,
    sourceValues,
    setSourceValues,
    sourceTypes,
    selectedConfig,
    idPrefix,
    ownedLabel,
  }) {
    const ownedErrorKey = `${idPrefix}.owned`
    const typeErrorKey = `${idPrefix}.type`
    return (
      <div
        className={
          fieldErrors[ownedErrorKey] || fieldErrors[typeErrorKey]
            ? 'media-source-panel field-error'
            : 'media-source-panel'
        }
      >
        <p>{title}</p>
        <YesNoField
          legend={question}
          name={name}
          value={value}
          error={fieldErrors[ownedErrorKey]}
          required
          onChange={(nextValue) => {
            setOwned(nextValue)
            clearFieldError(ownedErrorKey)
            if (nextValue) {
              setSourceType('')
              setSourceValues({})
              clearFieldError(typeErrorKey)
            }
          }}
        />
        {value === false && (
          <>
            <label htmlFor={`${idPrefix}-type`}>
              Source Type <RequiredMark />
            </label>
            <select
              id={`${idPrefix}-type`}
              required
              value={sourceType}
              aria-invalid={Boolean(fieldErrors[typeErrorKey])}
              aria-describedby={fieldErrors[typeErrorKey] ? `${idPrefix}-type-error` : undefined}
              onChange={(event) => {
                setSourceType(event.target.value)
                clearFieldError(typeErrorKey)
              }}
            >
              <option value="">Select source type</option>
              {sourceTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            {fieldErrors[typeErrorKey] && (
              <p className="inline-error" id={`${idPrefix}-type-error`}>
                {fieldErrors[typeErrorKey]}
              </p>
            )}
            {selectedConfig && <p className="hint">{selectedConfig.guidance}</p>}
            {renderSourceFields(selectedConfig, sourceValues, setSourceValues, idPrefix)}
          </>
        )}
        {value === true && (
          <p className="hint">
            {ownedLabel}: {SOURCE_OWNER_LABEL}
          </p>
        )}
      </div>
    )
  }

  function buildFolkloreTextSourceForSubmit() {
    if (form.self_knowledge) return ''
    return buildSourceLine('Source', selectedTextSourceConfig, textSourceValues, form.source)
  }

  function buildFolkloreMediaSourceForSubmit() {
    const lines = []
    if (hasAudioMedia) {
      if (audioOwnedByContributor === true) {
        lines.push(`Audio Source: ${SOURCE_OWNER_LABEL}`)
      } else if (audioOwnedByContributor === false) {
        lines.push(buildSourceLine('Audio Source', selectedAudioSourceConfig, audioSourceValues))
      }
    }
    if (hasPhotoMedia) {
      if (photoOwnedByContributor === true) {
        lines.push(`Photo Source: ${SOURCE_OWNER_LABEL}`)
      } else if (photoOwnedByContributor === false) {
        lines.push(buildSourceLine('Photo Source', selectedPhotoSourceConfig, photoSourceValues))
      }
    }
    if (hasVideoMedia) {
      if (videoOwnedByContributor === true) {
        lines.push(`Video Source: ${SOURCE_OWNER_LABEL}`)
      } else if (videoOwnedByContributor === false) {
        lines.push(buildSourceLine('Video Source', selectedVideoSourceConfig, videoSourceValues))
      }
    }
    return lines.filter(Boolean).join('\n') || form.media_source
  }

  useEffect(() => {
    return () => {
      if (photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  function setField(field, value) {
    setForm((prev) => {
      if (field === 'category') {
        const nextSubcategory = folkloreSubcategoryOptions(value)[0]?.value || ''
        return { ...prev, category: value, subcategory: nextSubcategory }
      }
      return { ...prev, [field]: value }
    })
    setFieldErrors((current) => {
      if (!current[field] && !(field === 'category' && current.subcategory)) return current
      const next = { ...current }
      delete next[field]
      if (field === 'category') delete next.subcategory
      if (field === 'media_url') {
        delete next['folklore-video-source.owned']
        delete next['folklore-video-source.type']
        delete next.media_source
      }
      return next
    })
  }

  function createFormData() {
    // Backend expects multipart form data for optional file uploads.
    const formData = new FormData()
    const derivedSource = buildFolkloreTextSourceForSubmit()
    const derivedMediaSource = buildFolkloreMediaSourceForSubmit()
    const ownershipValues = [
      hasAudioMedia ? audioOwnedByContributor : null,
      hasPhotoMedia ? photoOwnedByContributor : null,
      hasVideoMedia ? videoOwnedByContributor : null,
    ].filter((value) => value !== null)
    const derivedSelfProducedMedia = ownershipValues.length
      ? ownershipValues.every(Boolean)
      : Boolean(form.self_produced_media)
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'source') {
        formData.append(key, String(derivedSource))
        return
      }
      if (key === 'media_source') {
        formData.append(key, String(derivedMediaSource))
        return
      }
      if (key === 'self_produced_media') {
        formData.append(key, String(derivedSelfProducedMedia))
        return
      }
      if (key === 'copyright_usage') {
        formData.append(key, form.self_knowledge ? String(value) : '')
        return
      }
      formData.append(key, String(value))
    })
    if (audioFile) {
      formData.append('audio_upload', audioFile)
    }
    return formData
  }

  async function fetchMyRevisions() {
    const payload = await apiRequest('/api/folklore/revisions/my')
    return payload.rows || []
  }

  function loadRevisionIntoForm(revision) {
    const data = revision.proposed_data || revision
    const nextSelfKnowledge = asNullableBoolean(data.self_knowledge)
    const nextSelfProducedMedia = asNullableBoolean(data.self_produced_media)

    setRevisionId(revision.revision_id || '')
    setCurrentRevisionStatus(revision.status || '')
    setCurrentReviewerNotes(revision.reviewer_notes || '')
    setCorrectionAssignment(revision.correction_assignment || null)
    setForm({
      title: data.title || '',
      content: data.content || '',
      category: data.category || 'oral_narratives',
      subcategory:
        data.subcategory || folkloreSubcategoryOptions(data.category || 'oral_narratives')[0]?.value || '',
      municipality_source: data.municipality_source || 'Not Applicable',
      source: data.source || '',
      self_knowledge: nextSelfKnowledge,
      media_url: data.media_url || '',
      media_source: data.media_source || '',
      self_produced_media: nextSelfProducedMedia,
      copyright_usage: data.copyright_usage || '',
    })
    setTextSourceType('')
    setTextSourceValues({})
    setVideoSourceType('')
    setVideoSourceValues({})
    setPhotoSourceType('')
    setPhotoSourceValues({})
    setAudioSourceType('')
    setAudioSourceValues({})
    setVideoOwnedByContributor(data.media_url ? nextSelfProducedMedia : null)
    setPhotoOwnedByContributor(revision.photo_upload_url ? nextSelfProducedMedia : null)
    setAudioOwnedByContributor(revision.audio_upload_url ? nextSelfProducedMedia : null)
    setExistingPhotoUrl(revision.photo_upload_url || '')
    setExistingAudioUrl(revision.audio_upload_url || '')
    setAudioFile(null)
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }
    setPhotoPreview(revision.photo_upload_url || '')
    setPhotoPreviewSize({ width: 0, height: 0 })
    setFieldErrors({})
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function validateRequiredFields() {
    const nextErrors = {}
    if (!String(form.title || '').trim()) nextErrors.title = 'Title is required.'
    if (
      !String(form.content || '')
        .replace(/<[^>]*>/g, '')
        .trim()
    )
      nextErrors.content = 'Content is required.'
    if (!String(form.category || '').trim()) nextErrors.category = 'Category is required.'
    if (!String(form.subcategory || '').trim()) nextErrors.subcategory = 'Subcategory is required.'
    if (!String(form.municipality_source || '').trim())
      nextErrors.municipality_source = 'Municipality source is required.'

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setError('Please complete the required fields marked with *.')
      return false
    }
    return true
  }

  function hasAnyDraftInput() {
    const values = [
      ...Object.entries(form)
        .filter(([key, value]) => String(value ?? '') !== String(INITIAL_FORM[key] ?? ''))
        .map(([, value]) => value),
      ...Object.values(textSourceValues),
      ...Object.values(audioSourceValues),
      ...Object.values(photoSourceValues),
      ...Object.values(videoSourceValues),
    ]
    return (
      values.some((value) => String(value || '').trim()) ||
      Boolean(audioFile || existingPhotoUrl || existingAudioUrl)
    )
  }

  function validateDraftHasInput() {
    if (!String(form.title || '').trim()) {
      setFieldErrors((current) => ({ ...current, title: 'Title is required.' }))
      setError('Title is required before saving this draft.')
      return false
    }
    if (hasAnyDraftInput()) return true
    setError('Add at least one field before saving this draft.')
    return false
  }

  function validateAttribution() {
    if (hasMedia && !mediaPolicyAccepted) {
      setError('Please confirm that you have read the Media Upload Policy before submitting.')
      return false
    }

    if (form.self_knowledge === null) {
      setFieldErrors((current) => ({
        ...current,
        self_knowledge: 'Source answer is required.',
      }))
      setError('Please answer whether this entry is based on your own knowledge.')
      return false
    }
    if (!form.self_knowledge) {
      if (!selectedTextSourceConfig && !String(form.source || '').trim()) {
        setFieldErrors((current) => ({
          ...current,
          text_source_type: 'Choose a source type.',
        }))
        setError('Please choose a source type for the folklore text source.')
        return false
      }
      if (selectedTextSourceConfig) {
        const nextSourceErrors = sourceFieldErrors(
          selectedTextSourceConfig,
          textSourceValues,
          'folklore-text-source',
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
    if (hasAudioMedia) {
      if (audioOwnedByContributor === null) {
        setFieldErrors((current) => ({
          ...current,
          'folklore-audio-source.owned': 'Audio source answer is required.',
        }))
        setError('Please answer whether the audio recording is personally owned or produced by you.')
        return false
      }
      if (audioOwnedByContributor === false) {
        if (!selectedAudioSourceConfig && !String(form.media_source || '').trim()) {
          setFieldErrors((current) => ({
            ...current,
            'folklore-audio-source.type': 'Choose an audio source type.',
          }))
          setError('Please choose an audio source type.')
          return false
        }
        if (selectedAudioSourceConfig) {
          const nextSourceErrors = sourceFieldErrors(
            selectedAudioSourceConfig,
            audioSourceValues,
            'folklore-audio-source',
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
    }
    if (hasPhotoMedia) {
      if (photoOwnedByContributor === null) {
        setFieldErrors((current) => ({
          ...current,
          'folklore-photo-source.owned': 'Photo source answer is required.',
        }))
        setError('Please answer whether the photo is personally owned or produced by you.')
        return false
      }
      if (photoOwnedByContributor === false) {
        if (!selectedPhotoSourceConfig && !String(form.media_source || '').trim()) {
          setFieldErrors((current) => ({
            ...current,
            'folklore-photo-source.type': 'Choose a photo source type.',
          }))
          setError('Please choose a photo source type.')
          return false
        }
        if (selectedPhotoSourceConfig) {
          const nextSourceErrors = sourceFieldErrors(
            selectedPhotoSourceConfig,
            photoSourceValues,
            'folklore-photo-source',
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
    }
    if (hasVideoMedia) {
      if (videoOwnedByContributor === null) {
        setFieldErrors((current) => ({
          ...current,
          'folklore-video-source.owned': 'Video source answer is required.',
        }))
        setError('Please answer whether the video recording is personally owned or produced by you.')
        return false
      }
      if (videoOwnedByContributor === false) {
        if (!selectedVideoSourceConfig && !String(form.media_source || '').trim()) {
          setFieldErrors((current) => ({
            ...current,
            'folklore-video-source.type': 'Choose a video source type.',
          }))
          setError('Please choose a video source type.')
          return false
        }
        if (selectedVideoSourceConfig) {
          const nextSourceErrors = sourceFieldErrors(
            selectedVideoSourceConfig,
            videoSourceValues,
            'folklore-video-source',
          )
          if (Object.keys(nextSourceErrors).length > 0) {
            setFieldErrors((current) => ({ ...current, ...nextSourceErrors }))
            setError(
              'Please complete the video source fields, or add remarks explaining what source details you can provide.',
            )
            return false
          }
        }
      }
    }

    if (!form.self_knowledge && !String(buildFolkloreTextSourceForSubmit() || '').trim()) {
      setFieldErrors((current) => ({
        ...current,
        text_source_type: 'Source is required.',
      }))
      setError('Source is required unless the entry is based on your own knowledge.')
      return false
    }
    if (hasMedia && !String(buildFolkloreMediaSourceForSubmit() || '').trim()) {
      setFieldErrors((current) => ({
        ...current,
        media_source: 'Media source is required.',
      }))
      setError('Media source is required when media is attached and not personally owned/produced.')
      return false
    }
    return true
  }

  function clearForm() {
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }
    setRevisionId('')
    setCurrentRevisionStatus('')
    setCurrentReviewerNotes('')
    setForm(INITIAL_FORM)
    setFieldErrors({})
    setTextSourceType('')
    setTextSourceValues({})
    setVideoSourceType('')
    setVideoSourceValues({})
    setPhotoSourceType('')
    setPhotoSourceValues({})
    setAudioSourceType('')
    setAudioSourceValues({})
    setVideoOwnedByContributor(null)
    setPhotoOwnedByContributor(null)
    setAudioOwnedByContributor(null)
    setExistingPhotoUrl('')
    setExistingAudioUrl('')
    setPhotoPreview('')
    setPhotoPreviewSize({ width: 0, height: 0 })
    setAudioFile(null)
    setMediaPolicyAccepted(false)
    setShowUsagePermission(false)
    setError('')
    setMessage('Form cleared.')
    window.history.replaceState({}, '', ROUTES.folkloreDraft)
  }

  async function deleteDraft() {
    const trimmedId = revisionId.trim()
    if (!trimmedId) {
      clearForm()
      setConfirmDeleteDraft(false)
      navigate(ROUTES.adminApplications)
      return
    }

    setBusy(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/folklore/revisions/${trimmedId}/delete`, { method: 'DELETE' })
      clearForm()
      setConfirmDeleteDraft(false)
      setMessage('Draft deleted.')
      await fetchMyRevisions()
      navigate(ROUTES.adminApplications)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function createDraft() {
    if (!validateDraftHasInput()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // New folklore revision starts as DRAFT when this call succeeds.
      const payload = await apiRequest('/api/folklore/revisions/create', {
        method: 'POST',
        body: createFormData(),
      })
      setRevisionId(payload.revision_id || '')
      setCurrentRevisionStatus(payload.status || 'draft')
      setMessage(`Draft created: ${payload.revision_id}`)
      celebrateDraftSaved('folklore')
      await fetchMyRevisions()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function updateDraft() {
    const trimmedId = revisionId.trim()
    if (!trimmedId) return

    if (!validateDraftHasInput()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Backend accepts POST here as the browser-safe multipart fallback for draft updates.
      const payload = await apiRequest(`/api/folklore/revisions/${trimmedId}`, {
        method: 'POST',
        body: createFormData(),
      })
      setCurrentRevisionStatus(payload.status || currentRevisionStatus || 'draft')
      setMessage(`Draft updated: ${payload.revision_id}`)
      celebrateDraftSaved('folklore')
      await fetchMyRevisions()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function ensureRevisionForInlineMedia() {
    const trimmedId = revisionId.trim()
    if (trimmedId) return trimmedId
    if (!String(form.title || '').trim()) {
      setFieldErrors((current) => ({
        ...current,
        title: 'Title is required before attaching an image.',
      }))
      setError('Add a title before attaching an image.')
      window.requestAnimationFrame(() => {
        document.getElementById('folklore-title')?.focus()
      })
      throw new Error('Add a title before attaching an image.')
    }
    const payload = await apiRequest('/api/folklore/revisions/create', {
      method: 'POST',
      body: createFormData(),
    })
    const nextRevisionId = payload.revision_id || ''
    if (!nextRevisionId) throw new Error('Could not create a draft for this image.')
    setRevisionId(nextRevisionId)
    setCurrentRevisionStatus(payload.status || 'draft')
    setMessage(`Draft created: ${nextRevisionId}`)
    return nextRevisionId
  }

  async function uploadInlineImage({ file, caption = '', altText = '' }) {
    setError('')
    const prepared = await prepareImageUpload(file, {
      minWidth: 120,
      minHeight: 120,
      maxWidth: 1800,
      maxHeight: 1800,
    })
    if (prepared.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(prepared.previewUrl)
    }
    const targetRevisionId = await ensureRevisionForInlineMedia()
    const formData = new FormData()
    formData.append('image', prepared.file)
    formData.append('caption', caption)
    formData.append('alt_text', altText)
    formData.append('self_produced', 'true')
    return apiRequest(`/api/folklore/revisions/${targetRevisionId}/media`, {
      method: 'POST',
      body: formData,
    })
  }

  async function saveDraft() {
    if (revisionId.trim()) {
      await updateDraft()
      return
    }
    await createDraft()
  }

  async function submitDraft() {
    if (!validateRequiredFields()) return
    if (!validateAttribution()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      let submitId = revisionId.trim()

      // Auto-save first if not yet saved
      if (!submitId) {
        const payload = await apiRequest('/api/folklore/revisions/create', {
          method: 'POST',
          body: createFormData(),
        })
        submitId = payload.revision_id || ''
        setRevisionId(submitId)
        setCurrentRevisionStatus(payload.status || 'draft')
        await fetchMyRevisions()
      } else {
        await apiRequest(`/api/folklore/revisions/${submitId}`, {
          method: 'POST',
          body: createFormData(),
        })
      }

      // Submit transitions draft to PENDING for review.
      const submitted = await apiRequest(`/api/folklore/revisions/${submitId}/submit`, {
        method: 'POST',
      })
      setCurrentRevisionStatus(submitted.status || 'pending')
      setCurrentReviewerNotes('')
      setMessage(
        'Submitted for review. This entry is now pending and cannot be edited until a decision is made. ' +
          'You can track it in My Folklore Submissions, and the notification bell will tell you when it is approved or returned.',
      )
      const rows = await fetchMyRevisions()
      const submittedCount = rows.filter((row) => row.status !== 'draft').length
      celebrateContribution('folklore', submittedCount)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  function continueAfterSubmission() {
    closeCelebration()
    navigate(`${ROUTES.adminApplications}?tab=contributions`)
  }

  return (
    <>
      <section className="panel folklore-draft-builder-panel">
        <h2>Folklore Draft Builder</h2>
        {isRejectedSubmission && (
          <section className="rejected-submission-guidance" aria-live="polite">
            <strong>Returned for changes: what to fix</strong>
            <p>
              {currentReviewerNotes ||
                'The reviewer did not include specific notes. Review your entry carefully before resubmitting.'}
            </p>
            <small>
              Edit this same private submission below, then submit it again for review. It is not a public
              revision.
            </small>
          </section>
        )}
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

        <div className="folklore-draft-layout">
          <div className="folklore-draft-form-column">
            <div className="field">
              <label htmlFor="folklore-title">
                Title <RequiredMark />
              </label>
              <input
                id="folklore-title"
                value={form.title}
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? 'folklore-title-error' : undefined}
                onChange={(event) => setField('title', event.target.value)}
              />
              {fieldErrors.title && (
                <p className="inline-error" id="folklore-title-error">
                  {fieldErrors.title}
                </p>
              )}
            </div>

            <div className="field-grid folklore-draft-taxonomy-row">
              <div className="field">
                <label htmlFor="folklore-category">
                  Main Category <RequiredMark />
                </label>
                <select
                  id="folklore-category"
                  value={form.category}
                  aria-invalid={Boolean(fieldErrors.category)}
                  aria-describedby={fieldErrors.category ? 'folklore-category-error' : undefined}
                  onChange={(event) => setField('category', event.target.value)}
                >
                  {FOLKLORE_TAXONOMY.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.category && (
                  <p className="inline-error" id="folklore-category-error">
                    {fieldErrors.category}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="folklore-subcategory">
                  Subcategory <RequiredMark />
                </label>
                <select
                  id="folklore-subcategory"
                  value={form.subcategory}
                  aria-invalid={Boolean(fieldErrors.subcategory)}
                  aria-describedby={fieldErrors.subcategory ? 'folklore-subcategory-error' : undefined}
                  onChange={(event) => setField('subcategory', event.target.value)}
                >
                  {subcategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.subcategory && (
                  <p className="inline-error" id="folklore-subcategory-error">
                    {fieldErrors.subcategory}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="folklore-municipality">
                  Municipality Source <RequiredMark />
                </label>
                <select
                  id="folklore-municipality"
                  value={form.municipality_source}
                  aria-invalid={Boolean(fieldErrors.municipality_source)}
                  aria-describedby={
                    fieldErrors.municipality_source ? 'folklore-municipality-error' : undefined
                  }
                  onChange={(event) => setField('municipality_source', event.target.value)}
                >
                  {MUNICIPALITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {municipalitySourceLabel(option)}
                    </option>
                  ))}
                </select>
                {fieldErrors.municipality_source && (
                  <p className="inline-error" id="folklore-municipality-error">
                    {fieldErrors.municipality_source}
                  </p>
                )}
              </div>
            </div>

            <div className="field">
              <label>
                Content <RequiredMark />
              </label>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setField('content', html)}
                placeholder="Write your folklore content here…"
                invalid={Boolean(fieldErrors.content)}
                onImageUpload={uploadInlineImage}
              />
              {fieldErrors.content && (
                <p className="inline-error" id="folklore-content-error">
                  {fieldErrors.content}
                </p>
              )}
            </div>

            <div className="field-grid folklore-media-row">
              <div className="field">
                <label htmlFor="folklore-media-url">YouTube or Media URL</label>
                <input
                  id="folklore-media-url"
                  value={form.media_url}
                  onChange={(event) => setField('media_url', event.target.value)}
                  placeholder="Paste a YouTube link instead of uploading video"
                />
                {hasVideoMedia && (
                  <button
                    type="button"
                    className="ghost compact-button media-remove-button"
                    onClick={() => {
                      setField('media_url', '')
                      setVideoOwnedByContributor(null)
                      setVideoSourceType('')
                      setVideoSourceValues({})
                      clearFieldError('folklore-video-source.owned')
                      clearFieldError('folklore-video-source.type')
                      clearFieldError('media_source')
                    }}
                  >
                    Remove Video Link
                  </button>
                )}
                {hasVideoMedia &&
                  renderMediaSourceControls({
                    title: 'Folklore Video Source',
                    question: 'Is this video recording personally owned or produced by you?',
                    name: 'folklore-video-owned',
                    value: videoOwnedByContributor,
                    setOwned: setVideoOwnedByContributor,
                    sourceType: videoSourceType,
                    setSourceType: setVideoSourceType,
                    sourceValues: videoSourceValues,
                    setSourceValues: setVideoSourceValues,
                    sourceTypes: FOLKLORE_VIDEO_SOURCE_TYPES,
                    selectedConfig: selectedVideoSourceConfig,
                    idPrefix: 'folklore-video-source',
                    ownedLabel: 'Video Source',
                  })}
              </div>
              <div className="field">
                <label htmlFor="folklore-audio">Audio Upload</label>
                <input
                  id="folklore-audio"
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    setExistingAudioUrl('')
                    setAudioFile(event.target.files?.[0] || null)
                    clearFieldError('folklore-audio-source.owned')
                    clearFieldError('folklore-audio-source.type')
                    clearFieldError('media_source')
                  }}
                />
                {existingAudioUrl && !audioFile && (
                  <p className="hint">Current audio upload will be kept unless replaced.</p>
                )}
                {hasAudioMedia && (
                  <button
                    type="button"
                    className="ghost compact-button media-remove-button"
                    onClick={() => {
                      setAudioFile(null)
                      setExistingAudioUrl('')
                      setAudioOwnedByContributor(null)
                      setAudioSourceType('')
                      setAudioSourceValues({})
                      clearFieldError('folklore-audio-source.owned')
                      clearFieldError('folklore-audio-source.type')
                      clearFieldError('media_source')
                    }}
                  >
                    Remove Audio
                  </button>
                )}
                {hasAudioMedia &&
                  renderMediaSourceControls({
                    title: 'Folklore Audio Source',
                    question: 'Is this audio recording personally owned or produced by you?',
                    name: 'folklore-audio-owned',
                    value: audioOwnedByContributor,
                    setOwned: setAudioOwnedByContributor,
                    sourceType: audioSourceType,
                    setSourceType: setAudioSourceType,
                    sourceValues: audioSourceValues,
                    setSourceValues: setAudioSourceValues,
                    sourceTypes: FOLKLORE_AUDIO_SOURCE_TYPES,
                    selectedConfig: selectedAudioSourceConfig,
                    idPrefix: 'folklore-audio-source',
                    ownedLabel: 'Audio Source',
                  })}
              </div>
            </div>

            <div
              className={
                fieldErrors.self_knowledge || fieldErrors.text_source_type ? 'field field-error' : 'field'
              }
            >
              <label htmlFor="folklore-source">
                Source <RequiredMark />
              </label>
              <YesNoField
                legend="Is this entry based on your own knowledge?"
                name="folklore-source-self-knowledge"
                value={form.self_knowledge}
                error={fieldErrors.self_knowledge}
                required
                onChange={(nextValue) => {
                  setField('self_knowledge', nextValue)
                  clearFieldError('self_knowledge')
                  if (nextValue) setField('source', '')
                  if (!nextValue) {
                    setField('copyright_usage', '')
                    setShowUsagePermission(false)
                    clearFieldError('text_source_type')
                  }
                }}
              />
              {form.self_knowledge === false && (
                <>
                  <label htmlFor="folklore-source-type">
                    Source Type <RequiredMark />
                  </label>
                  <select
                    id="folklore-source-type"
                    required
                    value={textSourceType}
                    aria-invalid={Boolean(fieldErrors.text_source_type)}
                    aria-describedby={fieldErrors.text_source_type ? 'folklore-source-type-error' : undefined}
                    onChange={(event) => {
                      setTextSourceType(event.target.value)
                      clearFieldError('text_source_type')
                    }}
                  >
                    <option value="">Select source type</option>
                    {FOLKLORE_TEXT_SOURCE_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.text_source_type && (
                    <p className="inline-error" id="folklore-source-type-error">
                      {fieldErrors.text_source_type}
                    </p>
                  )}
                  {selectedTextSourceConfig && <p className="hint">{selectedTextSourceConfig.guidance}</p>}
                  {renderSourceFields(
                    selectedTextSourceConfig,
                    textSourceValues,
                    setTextSourceValues,
                    'folklore-text-source',
                  )}
                </>
              )}
              {form.self_knowledge === true && (
                <div className="field folklore-source-permission-field">
                  {!showUsagePermission && (
                    <button
                      type="button"
                      className="ghost compact-button"
                      onClick={() => setShowUsagePermission(true)}
                    >
                      Add Usage Permission or Restrictions
                    </button>
                  )}
                  {showUsagePermission && (
                    <>
                      <label htmlFor="folklore-copyright">Usage Permission</label>
                      <input
                        id="folklore-copyright"
                        value={form.copyright_usage}
                        onChange={(event) => setField('copyright_usage', event.target.value)}
                        placeholder="Example: I allow non-commercial educational reuse with attribution."
                      />
                    </>
                  )}
                  <p className="hint">
                    Default after approval: CC BY-NC 4.0 for non-commercial educational reuse.
                  </p>
                </div>
              )}
            </div>
          </div>
          <aside className="folklore-draft-preview-column">
            <section className="draft-preview-panel">
              <div className="section-heading draft-preview-heading">
                <span className="badge">Draft preview</span>
              </div>

              <article
                className={
                  useCompactPhotoPreview
                    ? 'detail-main draft-folklore-preview draft-folklore-preview-compact-photo'
                    : 'detail-main draft-folklore-preview'
                }
              >
                {youtubeEmbedUrl && (
                  <div className="youtube-embed-wrap">
                    <iframe
                      src={youtubeEmbedUrl}
                      title={form.title || 'Folklore video preview'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                )}
                <div className="draft-folklore-preview-content">
                  {photoPreview && (
                    <div className="draft-folklore-preview-media">
                      <img
                        className="folklore-photo-preview"
                        src={photoPreview}
                        alt=""
                        onLoad={(event) => {
                          const image = event.currentTarget
                          setPhotoPreviewSize({ width: image.naturalWidth, height: image.naturalHeight })
                        }}
                      />
                    </div>
                  )}
                  <div className="draft-folklore-preview-copy">
                    <p className="profile-kicker">
                      {folkloreTaxonomyLabel(form.category, form.subcategory) || 'Folklore'} |{' '}
                      {municipalitySourceLabel(form.municipality_source)}
                    </p>
                    <h2>{form.title || '(untitled folklore)'}</h2>
                    {form.content ? (
                      <div
                        className="story-text rte-output"
                        dangerouslySetInnerHTML={{ __html: form.content }}
                      />
                    ) : (
                      <p className="story-text muted">Your folklore content will appear here.</p>
                    )}
                    <div className="folklore-metadata-layout">
                      <section className="folklore-attribution-block">
                        <h4>Details</h4>
                        <div className="folklore-attribution-grid">
                          <p>
                            <span>Main Category</span>
                            <strong>
                              {folkloreTaxonomyLabel(form.category, '') || form.category || '-'}
                            </strong>
                          </p>
                          <p>
                            <span>Subcategory</span>
                            <strong>
                              {folkloreTaxonomyLabel('', form.subcategory) || form.subcategory || '-'}
                            </strong>
                          </p>
                          <p>
                            <span>Place</span>
                            <strong>{municipalitySourceLabel(form.municipality_source) || '-'}</strong>
                          </p>
                        </div>
                      </section>
                      <section className="folklore-attribution-block">
                        <h4>Attribution</h4>
                        <div className="folklore-attribution-grid">
                          <p>
                            <span>Contributor</span>
                            <strong>Your submission</strong>
                          </p>
                          {previewTextSource && (
                            <p>
                              <span>Source</span>
                              <strong>{formatSourceDisplay(previewTextSource)}</strong>
                            </p>
                          )}
                          {previewMediaSource && (
                            <p>
                              <span>Media</span>
                              <strong>{formatSourceDisplay(previewMediaSource)}</strong>
                            </p>
                          )}
                          <p>
                            <span>Approved by</span>
                            <strong>Pending review</strong>
                          </p>
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </article>
            </section>

            {error && <div className="alert error">{error}</div>}
            {message && <div className="alert ok">{message}</div>}

            {hasMedia && (
              <label className="checkbox-inline media-policy-check" htmlFor="folklore-media-policy-check">
                <input
                  id="folklore-media-policy-check"
                  type="checkbox"
                  checked={mediaPolicyAccepted}
                  onChange={(event) => setMediaPolicyAccepted(event.target.checked)}
                />
                <span>
                  I have read and agree to the{' '}
                  <a href={`${ROUTES.faqs}#how-review-works`}>Media Upload Policy</a>.
                </span>
              </label>
            )}

            <div className="actions draft-action-bar" aria-label="Folklore draft actions">
              <button className="secondary" disabled={busy} onClick={() => submitDraft()}>
                Submit Draft
              </button>
              <button disabled={busy} onClick={() => saveDraft()}>
                Save Draft
              </button>
              <button className="ghost" disabled={busy} onClick={() => clearForm()}>
                Clear Form
              </button>
              <button
                className="ghost danger"
                disabled={busy}
                title={revisionId ? 'Delete this saved draft' : 'Clear this unsaved draft form'}
                onClick={() => setConfirmDeleteDraft(true)}
              >
                Delete Draft
              </button>
            </div>
          </aside>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDeleteDraft}
        title={revisionId ? 'Delete this folklore draft?' : 'Discard this unsaved folklore draft?'}
        message={
          revisionId
            ? `You are about to delete "${form.title || 'this folklore draft'}".`
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
