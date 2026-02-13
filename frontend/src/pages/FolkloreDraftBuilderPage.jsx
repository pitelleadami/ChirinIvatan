import { useState } from 'react'

import { apiRequest } from '../lib/api'

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
    self_knowledge: false,
    media_url: '',
    media_source: '',
    self_produced_media: false,
    copyright_usage: '',
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [audioFile, setAudioFile] = useState(null)

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function createFormData() {
    // Backend expects multipart form data for optional file uploads.
    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => {
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

  async function loadMyRevisions() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/folklore/revisions/my')
      setMyRevisions(payload.rows || [])
      setMessage('Loaded your revisions.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function createDraft() {
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
      await loadMyRevisions()
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

    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Update only works for existing draft revisions.
      const payload = await apiRequest(`/api/folklore/revisions/${trimmedId}`, {
        method: 'PATCH',
        body: createFormData(),
      })
      setMessage(`Draft updated: ${payload.revision_id}`)
      await loadMyRevisions()
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

    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Submit transitions draft to PENDING for review.
      const payload = await apiRequest(`/api/folklore/revisions/${trimmedId}/submit`, {
        method: 'POST',
      })
      setMessage(`Draft submitted. Status: ${payload.status}`)
      await loadMyRevisions()
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
          Build contributor revisions with the same validation rules as backend. Use Create, then Update, then Submit.
        </p>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="folklore-title">Title</label>
            <input id="folklore-title" value={form.title} onChange={(event) => setField('title', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="folklore-category">Category</label>
            <select
              id="folklore-category"
              value={form.category}
              onChange={(event) => setField('category', event.target.value)}
            >
              {FOLKLORE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="folklore-municipality">Municipality Source</label>
            <select
              id="folklore-municipality"
              value={form.municipality_source}
              onChange={(event) => setField('municipality_source', event.target.value)}
            >
              {MUNICIPALITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="folklore-media-url">Media URL (YouTube allowed)</label>
            <input
              id="folklore-media-url"
              value={form.media_url}
              onChange={(event) => setField('media_url', event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="folklore-content">Content</label>
          <textarea
            id="folklore-content"
            rows={5}
            value={form.content}
            onChange={(event) => setField('content', event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="folklore-source">Source</label>
          <textarea
            id="folklore-source"
            rows={3}
            value={form.source}
            onChange={(event) => setField('source', event.target.value)}
            placeholder="Required unless self-knowledge is checked."
          />
        </div>

        <div className="field">
          <label htmlFor="folklore-media-source">Media Source</label>
          <textarea
            id="folklore-media-source"
            rows={3}
            value={form.media_source}
            onChange={(event) => setField('media_source', event.target.value)}
            placeholder="Required if media exists and self-produced media is false."
          />
        </div>

        <div className="field">
          <label htmlFor="folklore-copyright">Copyright/Usage</label>
          <input
            id="folklore-copyright"
            value={form.copyright_usage}
            onChange={(event) => setField('copyright_usage', event.target.value)}
            placeholder="Leave blank to default to CC BY-NC 4.0 on approval."
          />
        </div>

        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={form.self_knowledge}
              onChange={(event) => setField('self_knowledge', event.target.checked)}
            />
            Self knowledge (source not required)
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.self_produced_media}
              onChange={(event) => setField('self_produced_media', event.target.checked)}
            />
            Self-produced media (media source not required)
          </label>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="folklore-photo">Photo Upload</label>
            <input
              id="folklore-photo"
              type="file"
              accept="image/*"
              onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="field">
            <label htmlFor="folklore-audio">Audio Upload</label>
            <input
              id="folklore-audio"
              type="file"
              accept="audio/*"
              onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="field">
            <label htmlFor="folklore-revision-id">Revision ID (for update/submit)</label>
            <input
              id="folklore-revision-id"
              value={revisionId}
              onChange={(event) => setRevisionId(event.target.value)}
            />
          </div>
        </div>

        <div className="actions">
          <button disabled={busy} onClick={createDraft}>
            Create Draft
          </button>
          <button disabled={busy} onClick={updateDraft}>
            Update Draft
          </button>
          <button className="secondary" disabled={busy} onClick={submitDraft}>
            Submit Draft
          </button>
          <button className="ghost" disabled={busy} onClick={loadMyRevisions}>
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
    </>
  )
}
