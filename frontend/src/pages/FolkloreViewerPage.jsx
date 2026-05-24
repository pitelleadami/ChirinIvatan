/*
  FolkloreViewerPage.jsx

  Public folklore browser + detail inspector.
  Supports quick loading from URL query (`?entry_id=<uuid>`).
*/

import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
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

function DetailRow({ label, value, maskedLabel = '[hidden]' }) {
  const displayValue = value || maskedLabel
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{displayValue}</dd>
    </div>
  )
}

function MediaLink({ label, url }) {
  if (!url) {
    return <DetailRow label={label} value="-" maskedLabel="-" />
  }

  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>
        <a href={url} target="_blank" rel="noreferrer">
          Open media
        </a>
      </dd>
    </div>
  )
}

export default function FolkloreViewerPage({ currentUser }) {
  const [entryId, setEntryId] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const [listLoaded, setListLoaded] = useState(false)
  const [listRows, setListRows] = useState([])
  const [detail, setDetail] = useState(null)

  async function loadPublicList() {
    setLoadingList(true)
    setError('')
    try {
      // Beginner note: this endpoint only returns public-visible folklore entries.
      const payload = await apiRequest('/api/folklore/entries')
      setListRows(payload.rows || [])
      setListLoaded(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingList(false)
    }
  }

  async function loadDetail(explicitId = null) {
    const targetId = (explicitId || entryId).trim()
    if (!targetId) {
      setError('Please enter a folklore entry UUID.')
      return
    }

    // Keep input field in sync when user clicked from list/query link.
    if (targetId !== entryId) {
      setEntryId(targetId)
    }

    setLoadingDetail(true)
    setError('')
    setDetail(null)
    try {
      const payload = await apiRequest(`/api/folklore/entries/${targetId}`)
      setDetail(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    // Beginner note: allowing `?entry_id=<uuid>` means dashboard links can open
    // this page and auto-load the selected entry.
    const entryFromQuery = new URLSearchParams(window.location.search).get('entry_id')
    if (entryFromQuery) {
      loadDetail(entryFromQuery)
    } else {
      loadPublicList()
    }
    // Run once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <section className="folklore-hero-panel">
        <div className="viewer-hero-heading">
          <div>
            <p className="profile-kicker">Ivatan Folklore Archive</p>
            <h2>Folklore</h2>
            <p className="muted">Browse community-approved stories, songs, proverbs, idioms, and legends.</p>
          </div>
          {currentUser?.is_authenticated && (
            <button onClick={() => navigate(ROUTES.folkloreDraft)}>Add Folklore Entry</button>
          )}
        </div>
        <div className="folklore-lookup-row">
          <input
            id="folklore-entry-id"
            value={entryId}
            onChange={(event) => setEntryId(event.target.value)}
            placeholder="Open by entry UUID"
          />
          <button disabled={loadingDetail} onClick={() => loadDetail()}>
            {loadingDetail ? 'Loading...' : 'Open'}
          </button>
          <button className="ghost" disabled={loadingList} onClick={() => loadPublicList()}>
            {loadingList ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="folklore-browser">
        <div className="section-heading">
          <div>
            <h3>Public Collection</h3>
            <p className="muted">Only approved and approved-under-review entries appear here.</p>
          </div>
          {listLoaded && <span className="badge">{listRows.length} entries</span>}
        </div>
        {!listLoaded && loadingList && <p className="muted">Loading public folklore entries...</p>}
        {!listLoaded && !loadingList && <p className="muted">Public list not loaded yet.</p>}
        {listLoaded && listRows.length === 0 && <p className="muted">No public folklore entries found.</p>}
        <div className="folklore-card-grid">
          {listRows.map((row) => (
            <article key={row.entry_id} className="folklore-card">
              <p className="profile-kicker">{row.category || 'Folklore'}</p>
              <h3>{row.title || '(untitled folklore)'}</h3>
              <p className="meta">{row.municipality_source || '-'} | {formatDate(row.created_at)}</p>
              <p className="meta">Contributor: {row.contributor_username || '-'}</p>
              <button className="ghost" onClick={() => loadDetail(row.entry_id)}>
                Read Entry
              </button>
            </article>
          ))}
        </div>
      </section>

      {detail && (
        <section className="folklore-detail-panel">
          <div className="section-heading">
            <div>
              <p className="profile-kicker">{detail.category || 'Folklore Entry'}</p>
              <h3>{detail.title || '(untitled folklore)'}</h3>
              <p className="muted">{detail.municipality_source || '-'} | Contributed by {detail.contributor || '-'}</p>
            </div>
            <span className="badge">{detail.status}</span>
          </div>

          <div className="detail-layout">
            <article className="detail-main">
              {getYouTubeEmbedUrl(detail.media_url) && (
                <div className="youtube-embed-wrap">
                  <iframe
                    src={getYouTubeEmbedUrl(detail.media_url)}
                    title={detail.title || 'Folklore video'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              )}
              {detail.photo_upload_url && <img className="folklore-photo-preview" src={detail.photo_upload_url} alt="" />}
              <h2>{detail.title || '(untitled folklore)'}</h2>
              <p className="story-text">{detail.content || 'No content provided.'}</p>
            </article>

            <aside className="detail-side">
              <dl className="detail-list">
                <DetailRow label="Category" value={detail.category} maskedLabel="-" />
                <DetailRow label="Municipality" value={detail.municipality_source} maskedLabel="-" />
                <DetailRow label="Contributor" value={detail.contributor} maskedLabel="-" />
                <DetailRow label="Date Added" value={formatDate(detail.created_at)} maskedLabel="-" />
                <DetailRow label="Source" value={detail.source} />
                <DetailRow label="Media Source" value={detail.media_source} />
                <MediaLink label="Media URL" url={detail.media_url} />
                <MediaLink label="Photo" url={detail.photo_upload_url} />
                <MediaLink label="Audio" url={detail.audio_upload_url} />
                <DetailRow label="Copyright" value={detail.copyright_usage} maskedLabel="-" />
              </dl>
            </aside>
          </div>
        </section>
      )}
    </>
  )
}
