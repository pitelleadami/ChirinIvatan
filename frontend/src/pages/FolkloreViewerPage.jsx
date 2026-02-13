import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'

export default function FolkloreViewerPage() {
  const [entryId, setEntryId] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const [listRows, setListRows] = useState([])
  const [detail, setDetail] = useState(null)

  async function loadPublicList() {
    setLoadingList(true)
    setError('')
    try {
      // Beginner note: this endpoint only returns public-visible folklore entries.
      const payload = await apiRequest('/api/folklore/entries')
      setListRows(payload.rows || [])
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
      <section className="panel">
        <h2>Folklore Viewer</h2>
        <p className="muted">
          View public folklore entries and inspect source/media masking behavior from a readable page.
        </p>
        <div className="field">
          <label htmlFor="folklore-entry-id">Entry UUID</label>
          <input
            id="folklore-entry-id"
            value={entryId}
            onChange={(event) => setEntryId(event.target.value)}
            placeholder="e.g. 6f1c7e07-8a6f-4fc1-..."
          />
        </div>
        <div className="actions">
          <button disabled={loadingDetail} onClick={() => loadDetail()}>
            {loadingDetail ? 'Loading Detail...' : 'Load Detail'}
          </button>
          <button className="ghost" disabled={loadingList} onClick={loadPublicList}>
            {loadingList ? 'Refreshing List...' : 'Refresh Public List'}
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="panel">
        <h3>Public List</h3>
        {listRows.length === 0 && <p className="muted">No rows loaded yet.</p>}
        {listRows.map((row) => (
          <article key={row.entry_id} className="queue-card">
            <p className="meta">Title: {row.title}</p>
            <p className="meta">Category: {row.category}</p>
            <p className="meta">Municipality: {row.municipality_source}</p>
            <p className="meta">Status: {row.status}</p>
            <div className="actions">
              <button
                className="ghost"
                onClick={() => loadDetail(row.entry_id)}
              >
                Open Detail
              </button>
            </div>
          </article>
        ))}
      </section>

      {detail && (
        <section className="panel">
          <h3>Entry Detail</h3>
          <p className="meta">Entry ID: {detail.entry_id}</p>
          <p className="meta">Title: {detail.title}</p>
          <p className="meta">Category: {detail.category}</p>
          <p className="meta">Municipality: {detail.municipality_source}</p>
          <p className="meta">Status: {detail.status}</p>
          <p className="meta">Contributor: {detail.contributor}</p>
          <p className="meta">Source (masked if self-knowledge): {detail.source || '[hidden]'}</p>
          <p className="meta">Media Source (masked if self-produced): {detail.media_source || '[hidden]'}</p>
          <p className="meta">Media URL: {detail.media_url || '-'}</p>
          <p className="meta">Photo URL: {detail.photo_upload_url || '-'}</p>
          <p className="meta">Audio URL: {detail.audio_upload_url || '-'}</p>
          <p className="meta">Copyright: {detail.copyright_usage || '-'}</p>
        </section>
      )}
    </>
  )
}
