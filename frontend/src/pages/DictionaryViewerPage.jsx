import { useEffect, useMemo, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

const LETTER_OPTIONS = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

function hasValue(value) {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return true
}

function FieldBlock({ title, children }) {
  if (!children) return null
  return (
    <section className="dictionary-field-block">
      <h4>{title}</h4>
      <p>{children}</p>
    </section>
  )
}

function RelatedWords({ title, value }) {
  if (!hasValue(value)) return null
  const items = Array.isArray(value) ? value : String(value).split(',').map((item) => item.trim()).filter(Boolean)
  if (items.length === 0) return null
  return (
    <section className="dictionary-field-block">
      <h4>{title}</h4>
      <div className="dictionary-chip-row">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  )
}

function formatPersonList(items) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  if (!rows.length) return ''
  if (rows.length === 1) return rows[0]
  if (rows.length === 2) return `${rows[0]} & ${rows[1]}`
  return `${rows.slice(0, -1).join(', ')}, & ${rows.at(-1)}`
}

export default function DictionaryViewerPage({ currentUser }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [letter, setLetter] = useState('All')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')

  const [listRows, setListRows] = useState([])
  const [latestRows, setLatestRows] = useState([])
  const [detail, setDetail] = useState(null)

  const listTitle = useMemo(() => {
    if (searchTerm.trim()) {
      return `Search results for "${searchTerm.trim()}"`
    }
    if (letter !== 'All') {
      return `Entries starting with ${letter}`
    }
    return 'All dictionary entries'
  }, [searchTerm, letter])

  async function loadList({ q = '', startsWith = 'All' } = {}) {
    setLoadingList(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('limit', '500')
      params.set('sort', 'alpha')
      if (q.trim()) {
        params.set('q', q.trim())
      }
      if (startsWith !== 'All') {
        params.set('starts_with', startsWith)
      }
      const payload = await apiRequest(`/api/dictionary/entries?${params.toString()}`)
      setListRows(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
      setListRows([])
    } finally {
      setLoadingList(false)
    }
  }

  async function loadLatest() {
    try {
      const payload = await apiRequest('/api/dictionary/entries?limit=10&sort=recent')
      setLatestRows(payload.rows || [])
    } catch {
      setLatestRows([])
    }
  }

  async function loadEntry(entryId) {
    setLoadingDetail(true)
    setError('')
    try {
      const payload = await apiRequest(`/api/dictionary/entries/${entryId}`)
      setDetail(payload)
    } catch (requestError) {
      setError(requestError.message)
      setDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  function playAudio(url) {
    if (!url) return
    try {
      const audio = new Audio(url)
      audio.play()
    } catch {
      setError('Could not play pronunciation audio.')
    }
  }

  function clearSearch() {
    setSearchTerm('')
    setLetter('All')
    setDetail(null)
    loadList({ q: '', startsWith: 'All' })
  }

  useEffect(() => {
    loadList()
    loadLatest()
  }, [])

  return (
    <>
      <section className="dictionary-hero-panel">
        <div className="viewer-hero-heading">
          <div>
            <p className="profile-kicker">Ivatan-English Dictionary</p>
            <h2>Dictionary</h2>
            <p className="muted">Search a term, browse alphabetically, and open entries in a readable dictionary format.</p>
          </div>
          {currentUser?.is_authenticated && (
            <button onClick={() => navigate(ROUTES.dictionaryDraft)}>Add Dictionary Entry</button>
          )}
        </div>
        <div className="dictionary-search-row">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search term..."
            aria-label="Search dictionary term"
          />
          <button onClick={() => loadList({ q: searchTerm, startsWith: letter })} disabled={loadingList}>
            {loadingList ? 'Searching...' : 'Search'}
          </button>
          <button className="ghost" onClick={() => clearSearch()} disabled={loadingList}>
            Reset
          </button>
        </div>
        <div className="dictionary-alpha-row">
          <label htmlFor="alphabet-filter">Jump to letter</label>
          <select
            id="alphabet-filter"
            value={letter}
            onChange={(event) => {
              const nextLetter = event.target.value
              setLetter(nextLetter)
              setDetail(null)
              loadList({ q: searchTerm, startsWith: nextLetter })
            }}
          >
            {LETTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && <section className="alert error">{error}</section>}

      <section className="dictionary-layout dictionary-viewer-layout">
        <article className="dictionary-list-panel">
          <h3>{listTitle}</h3>
          <p className="muted">{listRows.length} entries</p>
          <div className="dictionary-scroll-list">
            {listRows.length === 0 && <p className="muted">No entries found.</p>}
            {listRows.map((row) => (
              <button key={row.entry_id} className="dictionary-term-item" onClick={() => loadEntry(row.entry_id)}>
                <span>
                  <strong>{row.term}</strong>
                  {row.part_of_speech && <small>{row.part_of_speech}</small>}
                </span>
                <span className="dictionary-term-arrow" aria-hidden="true">
                  &rarr;
                </span>
              </button>
            ))}
          </div>
        </article>

        <aside className="dictionary-side-panel">
          {!detail && (
            <>
              <h3>10 Latest Approved Dictionary Terms</h3>
              <div className="card-list">
                {latestRows.length === 0 && <p className="muted">No latest terms available yet.</p>}
                {latestRows.map((row) => (
                  <article key={row.entry_id} className="queue-card">
                    <div className="queue-header">
                      <strong>{row.term}</strong>
                      <span className="badge">{row.status}</span>
                    </div>
                    <div className="actions compact">
                      <button className="ghost" onClick={() => loadEntry(row.entry_id)}>
                        View details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {detail && (
            <>
              <div className="section-heading dictionary-entry-actions">
                <div>
                  <p className="profile-kicker">Dictionary Entry</p>
                  <h3>{detail.header?.term || 'Term Details'}</h3>
                </div>
                <button className="ghost" onClick={() => setDetail(null)}>
                  Back to latest list
                </button>
              </div>
              {loadingDetail && <p className="muted">Loading term detail...</p>}
              {!loadingDetail && (
                <article className="dictionary-entry-detail">
                  <header className="dictionary-headword">
                    <div className="dictionary-headword-row">
                      <h2>{detail.header?.term}</h2>
                      {detail.header?.audio_pronunciation_url && (
                        <button
                          type="button"
                          className="audio-icon-button audio-icon-inline"
                          aria-label="Play pronunciation audio"
                          onClick={() => playAudio(detail.header.audio_pronunciation_url)}
                        >
                          🔊
                        </button>
                      )}
                    </div>
                    <div className="dictionary-pronunciation-line">
                      {detail.semantic_core?.part_of_speech && <span>{detail.semantic_core.part_of_speech}</span>}
                      {detail.variant_section?.pronunciation_text && <span>{detail.variant_section.pronunciation_text}</span>}
                      {detail.variant_section?.variant_type && <span>{detail.variant_section.variant_type}</span>}
                    </div>
                  </header>

                  {detail.semantic_core?.photo_url && (
                    <img className="dictionary-photo-preview" src={detail.semantic_core.photo_url} alt="" />
                  )}

                  <section className="dictionary-definition">
                    <p className="definition-number">1</p>
                    <p>{detail.semantic_core?.meaning || 'No meaning provided yet.'}</p>
                  </section>

                  {(detail.variant_section?.example_sentence || detail.variant_section?.example_translation) && (
                    <section className="dictionary-field-block">
                      <h4>Sample Sentence</h4>
                      <div className="example-translation-grid">
                        <div>
                          <p className="meta">Ivatan</p>
                          <p>{detail.variant_section?.example_sentence || '-'}</p>
                        </div>
                        <div>
                          <p className="meta">English</p>
                          <p>{detail.variant_section?.example_translation || '-'}</p>
                        </div>
                      </div>
                    </section>
                  )}
                  <FieldBlock title="Usage Notes">{detail.variant_section?.usage_notes}</FieldBlock>
                  <FieldBlock title="Etymology">{detail.variant_section?.etymology}</FieldBlock>
                  <RelatedWords title="Inflected Forms" value={detail.semantic_core?.inflected_forms} />
                  <RelatedWords title="English Synonyms" value={detail.semantic_core?.english_synonym} />
                  <RelatedWords title="Ivatan Synonyms" value={detail.semantic_core?.ivatan_synonym} />
                  <RelatedWords title="English Antonyms" value={detail.semantic_core?.english_antonym} />
                  <RelatedWords title="Ivatan Antonyms" value={detail.semantic_core?.ivatan_antonym} />

                  <section className="dictionary-field-block">
                    <h4>Attribution</h4>
                    <div className="detail-list">
                      <p>
                        Contributed by {detail.attribution?.term?.initially_contributed_by || '-'}, Approved by{' '}
                        {formatPersonList(detail.attribution?.always_visible?.reviewed_and_approved_by) || '-'},
                        Revised by {formatPersonList(detail.contributors?.unique_revision_contributors) || detail.attribution?.always_visible?.last_revised_by || '-'}
                      </p>
                      <p>
                        {[
                          detail.attribution?.term?.source_text
                            ? `Term Source: ${detail.attribution.term.source_text}`
                            : '',
                          detail.attribution?.audio?.source
                            ? `Audio Source: ${detail.attribution.audio.source}`
                            : '',
                          detail.attribution?.photo?.source
                            ? `Image Source: ${detail.attribution.photo.source}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'No external source notes.'}
                      </p>
                      <p>
                        <a href="#dictionary-revision-history">See Revision History</a>
                      </p>
                    </div>
                  </section>

                  <section id="dictionary-revision-history" className="dictionary-field-block">
                    <h4>Revision History</h4>
                    <div className="detail-list">
                      {detail.revision_history?.recent_approved_revisions?.length ? (
                        <>
                          <p><strong>Approved Logs</strong></p>
                          {detail.revision_history.recent_approved_revisions.map((item) => (
                            <p key={`approved-${item.id}`}>
                              {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown date'} -{' '}
                              {item.contributor_username || 'Unknown contributor'}
                            </p>
                          ))}
                        </>
                      ) : null}
                      {detail.revision_history?.recent_rejected_revisions?.length ? (
                        <>
                          <p><strong>Rejected Logs</strong></p>
                          {detail.revision_history.recent_rejected_revisions.map((item) => (
                            <p key={`rejected-${item.id}`}>
                              {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown date'} -{' '}
                              {item.contributor_username || 'Unknown contributor'} -{' '}
                              {item.proposed_data?.term || detail.header?.term || 'Term'}: {item.proposed_data?.meaning || 'No meaning provided'}.
                              {item.reviewer_notes ? ` Reviewer notes: ${item.reviewer_notes}` : ''}
                            </p>
                          ))}
                        </>
                      ) : null}
                      {!detail.revision_history?.recent_approved_revisions?.length &&
                      !detail.revision_history?.recent_rejected_revisions?.length ? (
                        <p>No revision logs yet.</p>
                      ) : null}
                    </div>
                  </section>

                  <p className="dictionary-revise-link">
                    Think it needs a correction?{' '}
                    <button
                      className="inline-link-button"
                      onClick={() => navigate(`${ROUTES.dictionaryDraft}?entry_id=${detail.header?.entry_id}`)}
                    >
                      Revise it as a contributor!
                    </button>
                  </p>
                </article>
              )}
            </>
          )}
        </aside>
      </section>
    </>
  )
}
