/*
  FolkloreDraftBuilderPage.jsx

  Contributor workflow page for:
  - create draft
  - update draft
  - submit draft
  - review your own revision list
*/

import { useEffect, useState } from 'react'

import ContributionCelebration from '../components/ContributionCelebration'
import { apiRequest } from '../lib/api'
import { useContributionCelebration } from '../lib/contributionCelebration'
import { prepareImageUpload } from '../lib/imageUpload'

const MUNICIPALITY_OPTIONS = [
  'Basco',
  'Mahatao',
  'Ivana',
  'Uyugan',
  'Sabtang',
  'Itbayat',
  'Not Applicable',
]

const FOLKLORE_CATEGORY_OPTIONS = [
  'myth',
  'legend',
  'laji',
  'poem',
  'proverb',
  'idiom',
]

const SOURCE_OWNER_LABEL = 'K. Adami'

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
    fields: [
      { key: 'informant_name', label: 'Informant Name' },
      { key: 'interview_date', label: 'Interview Date', type: 'date' },
    ],
    build: (v) => `Narrated by ${v.informant_name}${v.interview_date ? `, ${v.interview_date}` : ''}`,
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
    build: (v) => `Family story shared by the ${v.family_name} family${v.municipality ? ` from ${v.municipality}` : ''}`,
  },
  {
    value: 'academic_collection',
    label: 'Academic Collection',
    guidance:
      'Use for folklore collections documented in publications, research, or academic studies.',
    fields: [
      { key: 'author', label: 'Author' },
      { key: 'title', label: 'Publication / Title' },
      { key: 'year', label: 'Year' },
    ],
    build: (v) => `Folklore collection by ${v.author}${v.year ? ` (${v.year})` : ''}${v.title ? `, ${v.title}` : ''}`,
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
    fields: [{ key: 'notes', label: 'Explanation Notes' }],
    build: (v) => v.notes,
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
    fields: [{ key: 'notes', label: 'Explanation Notes' }],
    build: (v) => v.notes,
  },
]

const FOLKLORE_PHOTO_SOURCE_TYPES = [
  { value: 'historical_photo', label: 'Historical Photo', guidance: 'Use for older photographs with historical value.', fields: [{ key: 'approx_year', label: 'Approximate Year' }], build: (v) => `Historical photograph${v.approx_year ? `, circa ${v.approx_year}` : ''}` },
  { value: 'family_collection', label: 'Family Collection', guidance: 'Use for photographs preserved by families or households.', fields: [{ key: 'family_notes', label: 'Family Notes' }], build: (v) => `Shared from family collection${v.family_notes ? `, ${v.family_notes}` : ''}` },
  { value: 'event_documentation', label: 'Event Documentation', guidance: 'Use for photographs documenting local traditions or events.', fields: [{ key: 'event_name', label: 'Event Name' }], build: (v) => `${v.event_name} documentation` },
  { value: 'museum_archive', label: 'Museum / Archive', guidance: 'Use for archival or institutional images.', fields: [{ key: 'institution_name', label: 'Institution Name' }], build: (v) => v.institution_name },
  { value: 'book_image', label: 'Book / Publication Image', guidance: 'Use for scanned or referenced printed visuals.', fields: [{ key: 'book_title', label: 'Book Title' }, { key: 'page_number', label: 'Page Number' }], build: (v) => `${v.book_title}${v.page_number ? `, p. ${v.page_number}` : ''}` },
  { value: 'website_image', label: 'Website Image', guidance: 'Acknowledge the original location when known.', fields: [{ key: 'url', label: 'URL', type: 'url' }], build: (v) => `Referenced from ${v.url}` },
  { value: 'ai_illustration', label: 'AI-Assisted Illustration', guidance: 'Use for AI-assisted educational visualization.', fields: [{ key: 'tool_used', label: 'Tool Used' }], build: (v) => `AI-assisted illustration from ${v.tool_used}` },
  { value: 'other', label: 'Other', guidance: 'Use if no category appropriately fits the source.', fields: [{ key: 'notes', label: 'Explanation Notes' }], build: (v) => v.notes },
]

const FOLKLORE_VIDEO_SOURCE_TYPES = [
  { value: 'documentary_footage', label: 'Documentary Footage', guidance: 'Use for educational documentary recordings.', fields: [{ key: 'producer_name', label: 'Producer Name' }], build: (v) => `Community heritage documentary${v.producer_name ? ` by ${v.producer_name}` : ''}` },
  { value: 'community_recording', label: 'Community Recording', guidance: 'Use for locally recorded cultural activities or events.', fields: [{ key: 'recorder_name', label: 'Recorder Name' }, { key: 'recorded_date', label: 'Date', type: 'date' }], build: (v) => `Community-contributed recording shared by ${v.recorder_name}${v.recorded_date ? `, ${v.recorded_date}` : ''}` },
  { value: 'interview_video', label: 'Interview Video', guidance: 'Use for interviews documenting language or oral history.', fields: [{ key: 'interviewees', label: 'Interviewee Name(s), comma-separated' }], build: (v) => `Interview with ${v.interviewees}` },
  { value: 'youtube_external', label: 'YouTube / External Video', guidance: 'Use external links for educational reference.', fields: [{ key: 'title', label: 'Title' }, { key: 'url', label: 'URL', type: 'url' }, { key: 'channel_name', label: 'YouTube Channel Name' }], build: (v) => `${v.title}${v.channel_name ? `, ${v.channel_name}` : ''}${v.url ? ` (${v.url})` : ''}` },
  { value: 'archive_footage', label: 'Archive Footage', guidance: 'Use for archival or historical recordings.', fields: [{ key: 'title', label: 'Title' }, { key: 'archive_name', label: 'Archive Name' }], build: (v) => `${v.title}${v.archive_name ? `, ${v.archive_name}` : ''}` },
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

export default function FolkloreDraftBuilderPage() {
  const [revisionId, setRevisionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [myRevisions, setMyRevisions] = useState([])
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'myth',
    municipality_source: 'Not Applicable',
    source: '',
    self_knowledge: null,
    media_url: '',
    media_source: '',
    self_produced_media: null,
    copyright_usage: '',
  })
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
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoWarning, setPhotoWarning] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const youtubeEmbedUrl = getYouTubeEmbedUrl(form.media_url)
  const { celebration, celebrateContribution, closeCelebration } = useContributionCelebration()
  const hasMedia = Boolean(form.media_url.trim() || photoFile || audioFile)
  const hasAudioMedia = Boolean(audioFile)
  const hasPhotoMedia = Boolean(photoFile)
  const hasVideoMedia = Boolean(form.media_url.trim())

  const selectedTextSourceConfig = resolveSourceConfig(FOLKLORE_TEXT_SOURCE_TYPES, textSourceType)
  const selectedAudioSourceConfig = resolveSourceConfig(FOLKLORE_AUDIO_SOURCE_TYPES, audioSourceType)
  const selectedPhotoSourceConfig = resolveSourceConfig(FOLKLORE_PHOTO_SOURCE_TYPES, photoSourceType)
  const selectedVideoSourceConfig = resolveSourceConfig(FOLKLORE_VIDEO_SOURCE_TYPES, videoSourceType)
  const previewTextSource = buildFolkloreTextSourceForSubmit()
  const previewMediaSource = buildFolkloreMediaSourceForSubmit()

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
              {field.label} <RequiredMark />
            </label>
            <input
              id={`${idPrefix}-${field.key}`}
              type={field.type || 'text'}
              value={values[field.key] || ''}
              required
              onChange={(event) => updateSourceValues(setter, field.key, event.target.value)}
            />
          </div>
        ))}
      </div>
    )
  }

  function buildFolkloreTextSourceForSubmit() {
    if (form.self_knowledge) return ''
    return buildSourceLine('Source', selectedTextSourceConfig, textSourceValues)
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
    return lines.filter(Boolean).join('\n')
  }

  useEffect(() => {
    return () => {
      if (photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
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
        minHeight: 450,
        maxWidth: 1600,
        maxHeight: 900,
      })
      setPhotoFile(prepared.file)
      setPhotoPreview(prepared.previewUrl || '')
      setPhotoWarning(prepared.warning)
    } catch (err) {
      setPhotoFile(null)
      setPhotoPreview('')
      setError(err.message)
    }
  }

  function createFormData() {
    // Backend expects multipart form data for optional file uploads.
    const formData = new FormData()
    const derivedSource = buildFolkloreTextSourceForSubmit()
    const derivedMediaSource = buildFolkloreMediaSourceForSubmit()
    const derivedSelfProducedMedia =
      [audioOwnedByContributor, photoOwnedByContributor, videoOwnedByContributor].filter((value) => value !== null).every(Boolean)
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
      formData.append(key, String(value))
    })
    if (photoFile) {
      formData.append('photo_upload', photoFile)
    }
    if (audioFile) {
      formData.append('audio_upload', audioFile)
    }
    return formData
  }

  async function fetchMyRevisions() {
    const payload = await apiRequest('/api/folklore/revisions/my')
    const rows = payload.rows || []
    setMyRevisions(rows)
    return rows
  }

  function validateRequiredFields() {
    const nextErrors = {}
    if (!String(form.title || '').trim()) nextErrors.title = 'Title is required.'
    if (!String(form.content || '').trim()) nextErrors.content = 'Content is required.'
    if (!String(form.category || '').trim()) nextErrors.category = 'Category is required.'
    if (!String(form.municipality_source || '').trim()) nextErrors.municipality_source = 'Municipality source is required.'

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setError('Please complete the required fields marked with *.')
      return false
    }
    return true
  }

  function validateAttribution() {
    if (form.self_knowledge === null) {
      setError('Please answer whether this entry is based on your own knowledge.')
      return false
    }
    if (!form.self_knowledge) {
      if (!selectedTextSourceConfig) {
        setError('Please choose a source type for the folklore text source.')
        return false
      }
      if (!isConfigComplete(selectedTextSourceConfig, textSourceValues)) {
        setError('Please complete all required fields for the selected folklore text source type.')
        return false
      }
    }
    if (hasAudioMedia) {
      if (audioOwnedByContributor === null) {
        setError('Please answer whether the audio recording is personally owned or produced by you.')
        return false
      }
      if (audioOwnedByContributor === false) {
        if (!selectedAudioSourceConfig) {
          setError('Please choose an audio source type.')
          return false
        }
        if (!isConfigComplete(selectedAudioSourceConfig, audioSourceValues)) {
          setError('Please complete all required fields for the selected audio source type.')
          return false
        }
      }
    }
    if (hasPhotoMedia) {
      if (photoOwnedByContributor === null) {
        setError('Please answer whether the photo is personally owned or produced by you.')
        return false
      }
      if (photoOwnedByContributor === false) {
        if (!selectedPhotoSourceConfig) {
          setError('Please choose a photo source type.')
          return false
        }
        if (!isConfigComplete(selectedPhotoSourceConfig, photoSourceValues)) {
          setError('Please complete all required fields for the selected photo source type.')
          return false
        }
      }
    }
    if (hasVideoMedia) {
      if (videoOwnedByContributor === null) {
        setError('Please answer whether the video recording is personally owned or produced by you.')
        return false
      }
      if (videoOwnedByContributor === false) {
        if (!selectedVideoSourceConfig) {
          setError('Please choose a video source type.')
          return false
        }
        if (!isConfigComplete(selectedVideoSourceConfig, videoSourceValues)) {
          setError('Please complete all required fields for the selected video source type.')
          return false
        }
      }
    }

    if (!form.self_knowledge && !String(buildFolkloreTextSourceForSubmit() || '').trim()) {
      setError('Source is required unless the entry is based on your own knowledge.')
      return false
    }
    if (hasMedia && !String(buildFolkloreMediaSourceForSubmit() || '').trim()) {
      setError('Media source is required when media is attached and not personally owned/produced.')
      return false
    }
    return true
  }

  async function loadMyRevisions() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const rows = await fetchMyRevisions()
      setMessage(rows.length ? 'Loaded your revisions.' : 'No revisions found for this user.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function createDraft() {
    if (!validateRequiredFields()) return
    if (!validateAttribution()) return
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
      setMessage(`Draft created: ${payload.revision_id}`)
      await fetchMyRevisions()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function updateDraft() {
    const trimmedId = revisionId.trim()
    if (!trimmedId) {
      setError('Enter revision ID first.')
      return
    }

    if (!validateRequiredFields()) return
    if (!validateAttribution()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Backend accepts POST here as the browser-safe multipart fallback for draft updates.
      const payload = await apiRequest(`/api/folklore/revisions/${trimmedId}`, {
        method: 'POST',
        body: createFormData(),
      })
      setMessage(`Draft updated: ${payload.revision_id}`)
      await fetchMyRevisions()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitDraft() {
    const trimmedId = revisionId.trim()
    if (!trimmedId) {
      setError('Enter revision ID first.')
      return
    }

    if (!validateRequiredFields()) return
    if (!validateAttribution()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Submit transitions draft to PENDING for review.
      const payload = await apiRequest(`/api/folklore/revisions/${trimmedId}/submit`, {
        method: 'POST',
      })
      setMessage(`Draft submitted. Status: ${payload.status}`)
      celebrateContribution('folklore')
      await fetchMyRevisions()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Folklore Draft Builder</h2>
        <p className="muted">
          Title, content, category, and municipality source are required. Source is required unless marked as
          self-knowledge. Media source is required when media is attached unless it is marked self-produced.
        </p>
        <div className="draft-workflow-guide" aria-label="Folklore draft workflow">
          <article>
            <span>1</span>
            <p>Write the story, source, and optional media details.</p>
          </article>
          <article>
            <span>2</span>
            <p>Preview the entry, then create a draft so it receives a revision ID.</p>
          </article>
          <article>
            <span>3</span>
            <p>Update the draft as needed, then submit it for reviewer validation.</p>
          </article>
        </div>

        <div className="field-grid">
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
          <div className="field">
            <label htmlFor="folklore-category">
              Category <RequiredMark />
            </label>
            <select
              id="folklore-category"
              value={form.category}
              aria-invalid={Boolean(fieldErrors.category)}
              aria-describedby={fieldErrors.category ? 'folklore-category-error' : undefined}
              onChange={(event) => setField('category', event.target.value)}
            >
              {FOLKLORE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
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
            <label htmlFor="folklore-municipality">
              Municipality Source <RequiredMark />
            </label>
            <select
              id="folklore-municipality"
              value={form.municipality_source}
              aria-invalid={Boolean(fieldErrors.municipality_source)}
              aria-describedby={fieldErrors.municipality_source ? 'folklore-municipality-error' : undefined}
              onChange={(event) => setField('municipality_source', event.target.value)}
            >
              {MUNICIPALITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldErrors.municipality_source && (
              <p className="inline-error" id="folklore-municipality-error">
                {fieldErrors.municipality_source}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="folklore-media-url">
              YouTube or Media URL
            </label>
            <input
              id="folklore-media-url"
              value={form.media_url}
              onChange={(event) => setField('media_url', event.target.value)}
              placeholder="Paste a YouTube link instead of uploading video"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="folklore-content">
            Content <RequiredMark />
          </label>
          <textarea
            id="folklore-content"
            rows={5}
            value={form.content}
            aria-invalid={Boolean(fieldErrors.content)}
            aria-describedby={fieldErrors.content ? 'folklore-content-error' : undefined}
            onChange={(event) => setField('content', event.target.value)}
          />
          {fieldErrors.content && (
            <p className="inline-error" id="folklore-content-error">
              {fieldErrors.content}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="folklore-source">Source</label>
          <YesNoField
            legend="Is this entry based on your own knowledge?"
            name="folklore-source-self-knowledge"
            value={form.self_knowledge}
            onChange={(nextValue) => {
              setField('self_knowledge', nextValue)
              if (nextValue) setField('source', '')
            }}
          />
          {form.self_knowledge === false && (
            <>
              <label htmlFor="folklore-source-type">
                Source Type <RequiredMark />
              </label>
              <select id="folklore-source-type" required value={textSourceType} onChange={(event) => setTextSourceType(event.target.value)}>
                <option value="">Select source type</option>
                {FOLKLORE_TEXT_SOURCE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {selectedTextSourceConfig && <p className="hint">{selectedTextSourceConfig.guidance}</p>}
              {renderSourceFields(selectedTextSourceConfig, textSourceValues, setTextSourceValues, 'folklore-text-source')}
            </>
          )}
        </div>

        {!hasMedia && (
          <div className="field">
            <label>Media Sources</label>
            <p className="hint">Add a media URL, photo, or audio to configure media source attribution.</p>
          </div>
        )}

        <div className="field">
          <label htmlFor="folklore-copyright">
            Copyright/Usage
          </label>
          <input
            id="folklore-copyright"
            value={form.copyright_usage}
            onChange={(event) => setField('copyright_usage', event.target.value)}
            placeholder="Leave blank to default to CC BY-NC 4.0 on approval."
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="folklore-photo">
              Photo Upload
            </label>
            <input
              id="folklore-photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
            />
            {photoWarning && <p className="inline-ok">{photoWarning}</p>}
          </div>
          <div className="field">
            <label htmlFor="folklore-audio">
              Audio Upload
            </label>
            <input
              id="folklore-audio"
              type="file"
              accept="audio/*"
              onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="field">
            <label htmlFor="folklore-revision-id">
              Revision ID
            </label>
            <input
              id="folklore-revision-id"
              value={revisionId}
              onChange={(event) => setRevisionId(event.target.value)}
            />
          </div>
        </div>

        {hasAudioMedia && (
          <div className="field">
            <label>Folklore Audio Source</label>
            <p className="hint">Question: Is this audio recording personally owned or produced by you?</p>
            <YesNoField
              legend="Is this audio recording personally owned or produced by you?"
              name="folklore-audio-owned"
              value={audioOwnedByContributor}
              onChange={(nextValue) => {
                setAudioOwnedByContributor(nextValue)
                if (nextValue) {
                  setAudioSourceType('')
                  setAudioSourceValues({})
                }
              }}
            />
            {audioOwnedByContributor === false && (
              <>
                <label htmlFor="folklore-audio-source-type">
                  Source Type <RequiredMark />
                </label>
                <select id="folklore-audio-source-type" required value={audioSourceType} onChange={(event) => setAudioSourceType(event.target.value)}>
                  <option value="">Select source type</option>
                  {FOLKLORE_AUDIO_SOURCE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {selectedAudioSourceConfig && <p className="hint">{selectedAudioSourceConfig.guidance}</p>}
                {renderSourceFields(selectedAudioSourceConfig, audioSourceValues, setAudioSourceValues, 'folklore-audio-source')}
              </>
            )}
            {audioOwnedByContributor === true && <p className="hint">Audio Source: {SOURCE_OWNER_LABEL}</p>}
          </div>
        )}

        {hasPhotoMedia && (
          <div className="field">
            <label>Folklore Photo Source</label>
            <p className="hint">Question: Is this photo personally owned or produced by you?</p>
            <YesNoField
              legend="Is this photo personally owned or produced by you?"
              name="folklore-photo-owned"
              value={photoOwnedByContributor}
              onChange={(nextValue) => {
                setPhotoOwnedByContributor(nextValue)
                if (nextValue) {
                  setPhotoSourceType('')
                  setPhotoSourceValues({})
                }
              }}
            />
            {photoOwnedByContributor === false && (
              <>
                <label htmlFor="folklore-photo-source-type">
                  Source Type <RequiredMark />
                </label>
                <select id="folklore-photo-source-type" required value={photoSourceType} onChange={(event) => setPhotoSourceType(event.target.value)}>
                  <option value="">Select source type</option>
                  {FOLKLORE_PHOTO_SOURCE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {selectedPhotoSourceConfig && <p className="hint">{selectedPhotoSourceConfig.guidance}</p>}
                {renderSourceFields(selectedPhotoSourceConfig, photoSourceValues, setPhotoSourceValues, 'folklore-photo-source')}
              </>
            )}
            {photoOwnedByContributor === true && <p className="hint">Photo Source: {SOURCE_OWNER_LABEL}</p>}
          </div>
        )}

        {hasVideoMedia && (
          <div className="field">
            <label>Folklore Video Source</label>
            <p className="hint">Question: Is this video recording personally owned or produced by you?</p>
            <YesNoField
              legend="Is this video recording personally owned or produced by you?"
              name="folklore-video-owned"
              value={videoOwnedByContributor}
              onChange={(nextValue) => {
                setVideoOwnedByContributor(nextValue)
                if (nextValue) {
                  setVideoSourceType('')
                  setVideoSourceValues({})
                }
              }}
            />
            {videoOwnedByContributor === false && (
              <>
                <label htmlFor="folklore-video-source-type">
                  Source Type <RequiredMark />
                </label>
                <select id="folklore-video-source-type" required value={videoSourceType} onChange={(event) => setVideoSourceType(event.target.value)}>
                  <option value="">Select source type</option>
                  {FOLKLORE_VIDEO_SOURCE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {selectedVideoSourceConfig && <p className="hint">{selectedVideoSourceConfig.guidance}</p>}
                {renderSourceFields(selectedVideoSourceConfig, videoSourceValues, setVideoSourceValues, 'folklore-video-source')}
              </>
            )}
            {videoOwnedByContributor === true && <p className="hint">Video Source: {SOURCE_OWNER_LABEL}</p>}
          </div>
        )}

        <section className="draft-preview-panel">
          <div className="section-heading">
            <div>
              <p className="profile-kicker">Preview Before Review</p>
              <h3>Folklore Entry Preview</h3>
            </div>
            <span className="badge">Draft preview</span>
          </div>

          <article className="detail-main draft-folklore-preview">
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
            {photoPreview && <img className="folklore-photo-preview" src={photoPreview} alt="" />}
            <p className="profile-kicker">{form.category || 'Folklore'} | {form.municipality_source || 'Not Applicable'}</p>
            <h2>{form.title || '(untitled folklore)'}</h2>
            <p className="story-text">{form.content || 'Your folklore content will appear here.'}</p>
            <dl className="detail-list">
              {previewTextSource && (
                <div className="detail-row">
                  <dt>Source</dt>
                  <dd>{previewTextSource}</dd>
                </div>
              )}
              {previewMediaSource && (
                <div className="detail-row">
                  <dt>Media Source</dt>
                  <dd>{previewMediaSource}</dd>
                </div>
              )}
              {revisionId && (
                <div className="detail-row">
                  <dt>Revision ID</dt>
                  <dd>{revisionId}</dd>
                </div>
              )}
            </dl>
          </article>
        </section>

        <div className="actions draft-action-bar" aria-label="Folklore draft actions">
          <button disabled={busy} onClick={() => createDraft()}>
            Create Draft
          </button>
          <button disabled={busy} onClick={() => updateDraft()}>
            Update Draft
          </button>
          <button className="secondary" disabled={busy} onClick={() => submitDraft()}>
            Submit Draft
          </button>
          <button className="ghost" disabled={busy} onClick={() => loadMyRevisions()}>
            Refresh My Revisions
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <section className="panel">
        <h3>My Revisions</h3>
        {myRevisions.length === 0 && <p className="muted">No revisions loaded yet.</p>}
        {myRevisions.map((revision) => (
          <article key={revision.revision_id} className="queue-card">
            <p className="meta">Revision: {revision.revision_id}</p>
            <p className="meta">Title: {revision.title || '-'}</p>
            <p className="meta">Category: {revision.category || '-'}</p>
            <p className="meta">Municipality: {revision.municipality_source || '-'}</p>
            <p className="meta">Status: {revision.status}</p>
            <button
              className="ghost"
              onClick={() => {
                setRevisionId(revision.revision_id)
                setMessage(`Loaded revision ${revision.revision_id} into Revision ID field.`)
              }}
            >
              Use this Revision ID
            </button>
          </article>
        ))}
      </section>
      <ContributionCelebration celebration={celebration} onClose={closeCelebration} />
    </>
  )
}
