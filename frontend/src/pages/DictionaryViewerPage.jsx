import { useEffect, useMemo, useState } from 'react'

import ArchiveEntryDialog from '../components/ArchiveEntryDialog'
import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

const LETTER_OPTIONS = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]
const DICTIONARY_LIST_PAGE_SIZE = 10

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
  const items = Array.isArray(value)
    ? value
    : typeof value === 'object'
      ? Object.entries(value).map(([key, item]) => {
          if (Array.isArray(item)) return `${key}: ${item.filter(Boolean).join(', ')}`
          if (typeof item === 'object' && item !== null) {
            return `${key}: ${Object.values(item).filter(Boolean).join(', ')}`
          }
          return `${key}: ${item}`
        })
      : String(value).split(',').map((item) => item.trim()).filter(Boolean)
  const normalizedItems = items
    .map((item) => {
      if (typeof item === 'object' && item !== null) {
        return Object.entries(item)
          .map(([key, rowValue]) => `${key}: ${Array.isArray(rowValue) ? rowValue.join(', ') : rowValue}`)
          .join(' · ')
      }
      return String(item || '').trim()
    })
    .filter(Boolean)
  if (normalizedItems.length === 0) return null
  return (
    <section className="dictionary-field-block">
      <h4>{title}</h4>
      <div className="dictionary-chip-row">
        {normalizedItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  )
}

function boldNameList(items) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  if (!rows.length) return <strong>-</strong>
  if (rows.length === 1) return <strong>{rows[0]}</strong>
  return rows.map((name, index) => (
    <span key={`${name}-${index}`}>
      {index > 0 && (index === rows.length - 1 ? ' & ' : ', ')}
      <strong>{name}</strong>
    </span>
  ))
}

function dailyWordKey() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickDailyWord(rows) {
  const stableRows = [...rows]
    .filter((row) => row?.entry_id && row?.term)
    .sort((first, second) => {
      const firstKey = `${String(first.term).toLocaleLowerCase()}-${first.entry_id}`
      const secondKey = `${String(second.term).toLocaleLowerCase()}-${second.entry_id}`
      return firstKey.localeCompare(secondKey)
    })

  if (!stableRows.length) return null
  const dailyIndex = hashString(`chirin-word-of-the-day-${dailyWordKey()}`) % stableRows.length
  return stableRows[dailyIndex]
}

function canModerateLiveEntries(user) {
  const groups = user?.groups || []
  return Boolean(user?.is_superuser || groups.includes('Admin') || groups.includes('Reviewer'))
}

function isAdminUser(user) {
  const groups = user?.groups || []
  return Boolean(user?.is_superuser || groups.includes('Admin'))
}

export default function DictionaryViewerPage({ currentUser }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [letter, setLetter] = useState('All')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const [listResultMessage, setListResultMessage] = useState('')

  const [listRows, setListRows] = useState([])
  const [latestRows, setLatestRows] = useState([])
  const [wordOfDayRows, setWordOfDayRows] = useState([])
  const [listPage, setListPage] = useState(1)
  const [latestPage, setLatestPage] = useState(1)
  const [dictionaryTermTotal, setDictionaryTermTotal] = useState(0)
  const [englishSearchTerm, setEnglishSearchTerm] = useState('')
  const [englishLookupRows, setEnglishLookupRows] = useState([])
  const [loadingEnglishLookup, setLoadingEnglishLookup] = useState(false)
  const [englishLookupSearchedTerm, setEnglishLookupSearchedTerm] = useState('')
  const [showEnglishSearch, setShowEnglishSearch] = useState(false)
  const [detail, setDetail] = useState(null)
  const [showRevisionHistory, setShowRevisionHistory] = useState(false)
  const [flagPanelOpen, setFlagPanelOpen] = useState(false)
  const [flagNotes, setFlagNotes] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  const [flagMessage, setFlagMessage] = useState('')
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveNotes, setArchiveNotes] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveMessage, setArchiveMessage] = useState('')

  const wordOfDay = useMemo(() => {
    const sourceRows = wordOfDayRows.length ? wordOfDayRows : latestRows
    return pickDailyWord(sourceRows)
  }, [latestRows, wordOfDayRows])
  const showingFilteredList = Boolean(searchTerm.trim() || letter !== 'All')
  const emptySearchActionLabel = currentUser?.is_authenticated
    ? 'add this term'
    : 'join the Digital Yaru'
  const emptyFilterActionLabel = currentUser?.is_authenticated
    ? 'add one'
    : 'join the Digital Yaru'
  const emptyResultActionLabel = searchTerm.trim() ? emptySearchActionLabel : emptyFilterActionLabel
  const emptySearchActionSuffix = currentUser?.is_authenticated
    ? ' and help us grow.'
    : ' to add this term and help us grow.'
  const emptyFilterActionSuffix = currentUser?.is_authenticated
    ? ' and help the dictionary grow.'
    : ' to add one and help the dictionary grow.'
  const emptyResultActionSuffix = searchTerm.trim() ? emptySearchActionSuffix : emptyFilterActionSuffix

  const listPageCount = Math.max(1, Math.ceil(listRows.length / DICTIONARY_LIST_PAGE_SIZE))
  const paginatedListRows = useMemo(() => {
    const pageStart = (listPage - 1) * DICTIONARY_LIST_PAGE_SIZE
    return listRows.slice(pageStart, pageStart + DICTIONARY_LIST_PAGE_SIZE)
  }, [listPage, listRows])
  const latestPageCount = Math.max(1, Math.ceil(latestRows.length / DICTIONARY_LIST_PAGE_SIZE))
  const paginatedLatestRows = useMemo(() => {
    const pageStart = (latestPage - 1) * DICTIONARY_LIST_PAGE_SIZE
    return latestRows.slice(pageStart, pageStart + DICTIONARY_LIST_PAGE_SIZE)
  }, [latestPage, latestRows])

  async function loadList({ q = '', startsWith = 'All' } = {}) {
    setListPage(1)
    setLoadingList(true)
    setError('')
    setListResultMessage('')
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
      const rows = payload.rows || []
      setListRows(rows)
      if (rows.length === 0 && (q.trim() || startsWith !== 'All')) {
        setListResultMessage(
          q.trim()
            ? "We couldn't find that term, so double-check for typos or try a different search, or"
            : `No approved terms start with ${startsWith} yet, so`,
        )
      }
      if (!q.trim() && startsWith === 'All') {
        setWordOfDayRows(rows)
        setDictionaryTermTotal(payload.counts?.visible_total || 0)
      }
    } catch (requestError) {
      setError(requestError.message)
      setListRows([])
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    if (listPage > listPageCount) {
      setListPage(listPageCount)
    }
  }, [listPage, listPageCount])

  async function loadLatest() {
    setLatestPage(1)
    try {
      const payload = await apiRequest('/api/dictionary/entries?limit=500&sort=recent')
      setLatestRows(payload.rows || [])
      setDictionaryTermTotal(payload.counts?.visible_total || 0)
    } catch {
      setLatestRows([])
    }
  }

  useEffect(() => {
    if (latestPage > latestPageCount) {
      setLatestPage(latestPageCount)
    }
  }, [latestPage, latestPageCount])

  async function searchEnglishTerms() {
    const value = englishSearchTerm.trim()
    if (!value) {
      setEnglishLookupRows([])
      setEnglishLookupSearchedTerm('')
      return
    }

    setLoadingEnglishLookup(true)
    setError('')
    setEnglishLookupSearchedTerm(value)
    try {
      const params = new URLSearchParams()
      params.set('q', value)
      params.set('limit', '25')
      const payload = await apiRequest(`/api/dictionary/english-terms?${params.toString()}`)
      setEnglishLookupRows(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
      setEnglishLookupRows([])
    } finally {
      setLoadingEnglishLookup(false)
    }
  }

  async function loadEntry(entryId) {
    setLoadingDetail(true)
    setError('')
    setShowRevisionHistory(false)
    setFlagPanelOpen(false)
    setFlagNotes('')
    setFlagMessage('')
    setArchiveMessage('')
    setArchiveDialogOpen(false)
    setArchiveNotes('')
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

  async function submitFlagForRereview() {
    const revisionId = detail?.review_action?.latest_approved_revision_id
    const notes = flagNotes.trim()
    setFlagMessage('')
    setError('')
    if (!revisionId) {
      setError('This entry does not have an approved revision to flag.')
      return
    }
    if (!notes) {
      setError('Please add notes explaining why this entry needs re-review.')
      return
    }

    setFlagBusy(true)
    try {
      await apiRequest('/api/reviews/dictionary/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision_id: revisionId,
          decision: 'flag',
          notes,
        }),
      })
      setFlagPanelOpen(false)
      setFlagNotes('')
      await loadEntry(detail.header?.entry_id)
      setFlagMessage('Flagged for re-review.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setFlagBusy(false)
    }
  }

  async function archiveEntry(event) {
    event.preventDefault()
    const entryId = detail?.header?.entry_id
    const notes = archiveNotes.trim()
    if (!entryId || !notes) {
      setError('Admin notes are required to archive this entry.')
      return
    }

    setArchiveBusy(true)
    setError('')
    try {
      await apiRequest('/api/auth/csrf')
      await apiRequest('/api/reviews/admin/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'dictionary',
          target_id: entryId,
          action: 'archive',
          notes,
        }),
      })
      setArchiveDialogOpen(false)
      setArchiveNotes('')
      setDetail(null)
      setShowRevisionHistory(false)
      setArchiveMessage(`${detail.header?.term || 'Entry'} was archived and removed from public use.`)
      await Promise.all([loadList({ q: searchTerm, startsWith: letter }), loadLatest()])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setArchiveBusy(false)
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
    setEnglishLookupSearchedTerm('')
    setShowEnglishSearch(false)
    setDetail(null)
    setShowRevisionHistory(false)
    loadList({ q: '', startsWith: 'All' })
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const entryFromQuery = params.get('entry_id')
    const searchFromQuery = params.get('q') || params.get('search')

    loadLatest()

    if (entryFromQuery) {
      loadList()
      loadEntry(entryFromQuery)
      return
    }

    if (searchFromQuery) {
      setSearchTerm(searchFromQuery)
      loadList({ q: searchFromQuery })
      return
    }

    loadList()
  }, [])

  return (
    <div className="dictionary-page">
      <section className="dictionary-hero-panel">
        <div className="viewer-hero-heading">
          <div>
            <h2>Chirin Ivatan Dictionary</h2>
          </div>
          {currentUser?.is_authenticated && (
            <button onClick={() => navigate(ROUTES.dictionaryDraft)}>Add Dictionary Entry</button>
          )}
        </div>
      </section>

      {wordOfDay && (
        <section className="dictionary-feature-row">
          <article className="dictionary-count-card">
            <p>{dictionaryTermTotal}</p>
            <span>Total Live Entries as of June 1, 2026</span>
          </article>
          <article className="word-of-day-card">
            <div>
              <p className="profile-kicker">Word of the Day</p>
              <h3>{wordOfDay.term}</h3>
              {wordOfDay.meaning && <p>{wordOfDay.meaning}</p>}
            </div>
            <button type="button" className="word-of-day-link" onClick={() => loadEntry(wordOfDay.entry_id)}>
              Open Entry
            </button>
          </article>
        </section>
      )}

      {error && <section className="alert error">{error}</section>}
      {archiveMessage && <section className="alert ok">{archiveMessage}</section>}

      <section
        className={
          detail
            ? 'dictionary-layout dictionary-viewer-layout dictionary-viewer-layout-detail-open'
            : 'dictionary-layout dictionary-viewer-layout'
        }
      >
        <article className="dictionary-list-panel">
          <div className="dictionary-search-stack">
            <label className="dictionary-search-label" htmlFor="ivatan-term-search">
              Search Ivatan Term
            </label>
            <div className="dictionary-search-row dictionary-search-row-primary">
              <input
                id="ivatan-term-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    loadList({ q: searchTerm, startsWith: letter })
                  }
                }}
                placeholder="Search an Ivatan term..."
                aria-label="Search Ivatan term"
              />
            </div>
            <div className="dictionary-search-action-row">
              <button onClick={() => loadList({ q: searchTerm, startsWith: letter })} disabled={loadingList}>
                {loadingList ? 'Searching...' : 'Search'}
              </button>
            </div>
            {!showEnglishSearch && (
              <p className="dictionary-search-divider">
                or{' '}
                <button
                  type="button"
                  className="inline-link-button dictionary-english-toggle"
                  onClick={() => setShowEnglishSearch(true)}
                >
                  Search English Word
                </button>
              </p>
            )}
            {showEnglishSearch && (
              <>
                <p className="dictionary-search-divider">or</p>
                <label className="dictionary-search-label dictionary-search-label-english" htmlFor="english-translation-search">
                  Search English Word
                </label>
                <div className="dictionary-search-row dictionary-search-row-english">
                  <input
                    id="english-translation-search"
                    value={englishSearchTerm}
                    onChange={(event) => setEnglishSearchTerm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        searchEnglishTerms()
                      }
                    }}
                    placeholder="Search an English word..."
                    aria-label="Search English word"
                  />
                  <button onClick={() => searchEnglishTerms()} disabled={loadingEnglishLookup}>
                    {loadingEnglishLookup ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </>
            )}
            {englishLookupRows.length > 0 && (
              <div className="english-lookup-results">
                {englishLookupRows.map((row) => (
                  <article key={row.english_term} className="english-lookup-result">
                    <p>{row.english_term}</p>
                    <div className="dictionary-chip-row">
                      {row.translations.map((translation) => (
                        <button
                          key={translation.entry_id}
                          type="button"
                          className="english-translation-chip"
                          onClick={() => loadEntry(translation.entry_id)}
                        >
                          {translation.term}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!loadingEnglishLookup && englishLookupSearchedTerm && englishLookupRows.length === 0 && (
              <p className="muted">No English translations matched "{englishLookupSearchedTerm}".</p>
            )}
            {(searchTerm || englishSearchTerm || englishLookupRows.length > 0) && (
              <button
                type="button"
                className="ghost dictionary-reset-search"
                onClick={() => {
                  clearSearch()
                  setEnglishSearchTerm('')
                  setEnglishLookupRows([])
                  setEnglishLookupSearchedTerm('')
                }}
              >
                Reset Search
              </button>
            )}
          </div>
          <div className="dictionary-browse-tools">
            <div className="dictionary-browse-heading">
              <h3>{showingFilteredList ? 'Matching Terms' : 'Browse Dictionary Terms'}</h3>
              <p>{showingFilteredList ? `${listRows.length} result${listRows.length === 1 ? '' : 's'} found` : 'Filter the live dictionary by first letter.'}</p>
            </div>
            <label className="dictionary-alpha-row" htmlFor="alphabet-filter">
              <span>First letter</span>
              <select
                id="alphabet-filter"
                value={letter}
                onChange={(event) => {
                  const nextLetter = event.target.value
                  setLetter(nextLetter)
                  setDetail(null)
                  setShowRevisionHistory(false)
                  loadList({ q: searchTerm, startsWith: nextLetter })
                }}
              >
                {LETTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {listResultMessage && (
              <div className="dictionary-search-feedback dictionary-filter-feedback">
                <span>{listResultMessage} </span>
                <button
                  type="button"
                  className="inline-link-button"
                  onClick={() => {
                    if (currentUser?.is_authenticated) {
                      navigate(ROUTES.dictionaryDraft)
                    } else {
                      navigate(ROUTES.roleCenter)
                    }
                  }}
                >
                  {emptyResultActionLabel}
                </button>
                <span>{emptyResultActionSuffix}</span>
              </div>
            )}
          </div>
          <div className={showingFilteredList ? 'dictionary-scroll-list dictionary-search-results-list' : 'dictionary-scroll-list'}>
            {loadingList && <p className="muted">Loading dictionary entries...</p>}
            {!loadingList && listRows.length === 0 && !listResultMessage && <p className="muted">No entries found.</p>}
            {paginatedListRows.map((row) => (
              <button
                key={row.entry_id}
                className={detail?.header?.entry_id === row.entry_id ? 'dictionary-term-item selected' : 'dictionary-term-item'}
                onClick={() => loadEntry(row.entry_id)}
              >
                <span>
                  <strong>{row.term}</strong>
                </span>
                <span className="dictionary-term-arrow" aria-hidden="true">
                  &rarr;
                </span>
              </button>
            ))}
          </div>
          {listRows.length > DICTIONARY_LIST_PAGE_SIZE && (
            <nav className="dictionary-list-pagination" aria-label="Dictionary list pagination">
              <button
                type="button"
                className="ghost"
                disabled={listPage === 1}
                onClick={() => setListPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                Previous
              </button>
              <span>
                Page {listPage} of {listPageCount}
              </span>
              <button
                type="button"
                className="ghost"
                disabled={listPage === listPageCount}
                onClick={() => setListPage((currentPage) => Math.min(listPageCount, currentPage + 1))}
              >
                Next
              </button>
            </nav>
          )}
        </article>

        <aside className="dictionary-side-panel">
          {!detail && (
            <>
              <div className="dictionary-panel-heading">
                <h3>Latest Approved Terms</h3>
              </div>
              <div className="dictionary-latest-list">
                {latestRows.length === 0 && <p className="muted">No latest terms available yet.</p>}
                {paginatedLatestRows.map((row) => (
                  <button key={row.entry_id} type="button" className="dictionary-latest-card" onClick={() => loadEntry(row.entry_id)}>
                    <div>
                      <strong>{row.term}</strong>
                      {row.meaning && <p>{row.meaning}</p>}
                      <small>{[row.part_of_speech, row.created_at ? `Added ${new Date(row.created_at).toLocaleDateString()}` : ''].filter(Boolean).join(' · ')}</small>
                    </div>
                  </button>
                ))}
              </div>
              {latestRows.length > DICTIONARY_LIST_PAGE_SIZE && (
                <nav className="dictionary-list-pagination" aria-label="Latest approved terms pagination">
                  <button
                    type="button"
                    className="ghost"
                    disabled={latestPage === 1}
                    onClick={() => setLatestPage((currentPage) => Math.max(1, currentPage - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {latestPage} of {latestPageCount}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    disabled={latestPage === latestPageCount}
                    onClick={() => setLatestPage((currentPage) => Math.min(latestPageCount, currentPage + 1))}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}

          {detail && (
            <>
              <div className="dictionary-entry-toolbar">
                <button
                  className="ghost"
                  onClick={() => {
                    setDetail(null)
                    setShowRevisionHistory(false)
                  }}
                >
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
                      {detail.semantic_core?.part_of_speech && (
                        <span>
                          <small>Part of speech</small>
                          {detail.semantic_core.part_of_speech}
                        </span>
                      )}
                      {detail.variant_section?.pronunciation_text && (
                        <span>
                          <small>Pronunciation</small>
                          {detail.variant_section.pronunciation_text}
                        </span>
                      )}
                      {detail.variant_section?.variant_type && (
                        <span>
                          <small>Variant</small>
                          {detail.variant_section.variant_type}
                        </span>
                      )}
                    </div>
                  </header>

                  {detail.semantic_core?.photo_url && (
                    <img className="dictionary-photo-preview" src={detail.semantic_core.photo_url} alt="" />
                  )}

                  <section className="dictionary-definition">
                    <p className="definition-number">1</p>
                    <div>
                      <p className="definition-label">Meaning</p>
                      <p>{detail.semantic_core?.meaning || 'No meaning provided yet.'}</p>
                    </div>
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

                  <section className="dictionary-attribution-block">
                    <h4>Attribution</h4>
                    <div className="detail-list">
                      <p>
                        Contributed by <strong>{detail.attribution?.term?.initially_contributed_by || '-'}</strong>,
                        Approved by {boldNameList(detail.attribution?.always_visible?.reviewed_and_approved_by)}, Revised by{' '}
                        {boldNameList(
                          detail.contributors?.unique_revision_contributors?.length
                            ? detail.contributors.unique_revision_contributors
                            : [detail.attribution?.always_visible?.last_revised_by],
                        )}
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
                        <button
                          type="button"
                          className="inline-link-button"
                          onClick={() => setShowRevisionHistory(true)}
                        >
                          See Revision History
                        </button>
                      </p>
                    </div>
                  </section>

                  {flagMessage && <section className="alert ok">{flagMessage}</section>}

                  {isAdminUser(currentUser) && (
                    <button
                      type="button"
                      className="live-review-archive-trigger"
                      onClick={() => {
                        setArchiveMessage('')
                        setArchiveDialogOpen(true)
                      }}
                    >
                      Archive entry
                    </button>
                  )}

                  {canModerateLiveEntries(currentUser) && detail.review_action?.can_flag_for_rereview && (
                    <>
                      {!flagPanelOpen && (
                        <button type="button" className="live-review-flag-trigger" onClick={() => setFlagPanelOpen(true)}>
                          Flag for re-review
                        </button>
                      )}
                      {flagPanelOpen && (
                        <section className="live-review-action-panel">
                          <div className="live-review-action-heading">
                            <div>
                              <h4>Flag for re-review</h4>
                              <p>Use this only when the public entry needs another review round.</p>
                            </div>
                          </div>
                        <div className="live-review-flag-form">
                          <label htmlFor="dictionary-rereview-notes">Notes / justification</label>
                          <textarea
                            id="dictionary-rereview-notes"
                            value={flagNotes}
                            onChange={(event) => setFlagNotes(event.target.value)}
                            placeholder="Explain what needs another review."
                            rows={4}
                            required
                          />
                          <div className="live-review-action-buttons">
                            <button type="button" disabled={flagBusy} onClick={submitFlagForRereview}>
                              {flagBusy ? 'Flagging...' : 'Submit Flag'}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              disabled={flagBusy}
                              onClick={() => {
                                setFlagPanelOpen(false)
                                setFlagNotes('')
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        </section>
                      )}
                    </>
                  )}

                  {showRevisionHistory && (
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
                  )}

                  <p className="dictionary-revise-link">
                    Think it needs a correction?{' '}
                    <button
                      className="inline-link-button"
                      onClick={() => {
                        if (currentUser?.is_authenticated) {
                          navigate(`${ROUTES.dictionaryDraft}?entry_id=${detail.header?.entry_id}`)
                        } else {
                          navigate(ROUTES.roleCenter)
                        }
                      }}
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
      <ArchiveEntryDialog
        open={archiveDialogOpen}
        title={detail?.header?.term || 'Dictionary entry'}
        notes={archiveNotes}
        busy={archiveBusy}
        onNotesChange={setArchiveNotes}
        onCancel={() => {
          setArchiveDialogOpen(false)
          setArchiveNotes('')
        }}
        onConfirm={archiveEntry}
      />
    </div>
  )
}
