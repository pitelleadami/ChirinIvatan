/*
  FolkloreViewerPage.jsx

  Public folklore browser + detail inspector.
  Supports quick loading from URL query (`?entry_id=<uuid>`).
*/

import { useEffect, useMemo, useState } from 'react'

import ArchiveEntryDialog from '../components/ArchiveEntryDialog'
import beliefsRitualLifeCardImage from '../assets/folklore/category-cards/beliefs-ritual-life.png'
import oralNarrativesCardImage from '../assets/folklore/category-cards/oral-narratives.png'
import songsPoetryCardImage from '../assets/folklore/category-cards/songs-poetry.png'
import traditionalKnowledgeCardImage from '../assets/folklore/category-cards/traditional-knowledge.png'
import wisdomExpressionsCardImage from '../assets/folklore/category-cards/wisdom-expressions.png'
import beliefsRitualsMobileCardImage from '../assets/folklore/mobile-category-cards/beliefs-rituals.png'
import oralNarrativesMobileCardImage from '../assets/folklore/mobile-category-cards/oral-narratives.png'
import songsPoetryMobileCardImage from '../assets/folklore/mobile-category-cards/songs-poetry.png'
import traditionalKnowledgeMobileCardImage from '../assets/folklore/mobile-category-cards/traditional-knowledge.png'
import wisdomExpressionsMobileCardImage from '../assets/folklore/mobile-category-cards/wisdom-expressions.png'
import { apiRequest } from '../lib/api'
import { FOLKLORE_TAXONOMY, folkloreSubcategoryLabel, folkloreTaxonomyLabel } from '../lib/folkloreTaxonomy'
import { ROUTES, navigate } from '../lib/router'

const FOLKLORE_CATEGORIES = [
  { ...FOLKLORE_TAXONOMY[0], image: oralNarrativesCardImage, mobileImage: oralNarrativesMobileCardImage },
  { ...FOLKLORE_TAXONOMY[1], image: wisdomExpressionsCardImage, mobileImage: wisdomExpressionsMobileCardImage },
  { ...FOLKLORE_TAXONOMY[2], image: songsPoetryCardImage, mobileImage: songsPoetryMobileCardImage },
  { ...FOLKLORE_TAXONOMY[3], image: beliefsRitualLifeCardImage, mobileImage: beliefsRitualsMobileCardImage },
  { ...FOLKLORE_TAXONOMY[4], image: traditionalKnowledgeCardImage, mobileImage: traditionalKnowledgeMobileCardImage },
]

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatLongDate(value = new Date()) {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(value)
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

function isVisibleSource(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized && normalized !== '[hidden]' && normalized !== 'hidden'
}

function canModerateLiveEntries(user) {
  const groups = user?.groups || []
  return Boolean(user?.is_superuser || groups.includes('Admin') || groups.includes('Reviewer'))
}

function isAdminUser(user) {
  const groups = user?.groups || []
  return Boolean(user?.is_superuser || groups.includes('Admin'))
}

export default function FolkloreViewerPage({ currentUser }) {
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState('')
  const [listLoaded, setListLoaded] = useState(false)
  const [listRows, setListRows] = useState([])
  const [liveEntryTotal, setLiveEntryTotal] = useState(0)
  const [titleSearchInput, setTitleSearchInput] = useState('')
  const [titleSearchTerm, setTitleSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [detail, setDetail] = useState(null)
  const [flagPanelOpen, setFlagPanelOpen] = useState(false)
  const [flagNotes, setFlagNotes] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  const [flagMessage, setFlagMessage] = useState('')
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveNotes, setArchiveNotes] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveMessage, setArchiveMessage] = useState('')
  const detailEmbedUrl = getYouTubeEmbedUrl(detail?.media_url)

  const filteredRows = useMemo(() => {
    const searchValue = titleSearchTerm.trim().toLowerCase()
    return listRows.filter((row) => {
      const matchesSearch = !searchValue || String(row.title || '').toLowerCase().includes(searchValue)
      const matchesCategory = !selectedCategory || row.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [listRows, selectedCategory, titleSearchTerm])

  const selectedCategoryLabel = FOLKLORE_CATEGORIES.find((category) => category.value === selectedCategory)?.label
  const showCategoryChooser = !detail && !selectedCategory && !titleSearchTerm.trim()
  const hasActiveFilter = Boolean(selectedCategory || titleSearchTerm.trim())

  async function loadPublicList() {
    setLoadingList(true)
    setError('')
    try {
      // Beginner note: this endpoint only returns public-visible folklore entries.
      const payload = await apiRequest('/api/folklore/entries')
      setListRows(payload.rows || [])
      setLiveEntryTotal(payload.counts?.visible_total || 0)
      setListLoaded(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingList(false)
    }
  }

  async function loadDetail(explicitId = null) {
    const targetId = (explicitId || '').trim()
    if (!targetId) {
      setError('Please enter a folklore entry UUID.')
      return
    }

    setError('')
    setDetail(null)
    setFlagPanelOpen(false)
    setFlagNotes('')
    setFlagMessage('')
    setArchiveMessage('')
    setArchiveDialogOpen(false)
    setArchiveNotes('')
    try {
      const payload = await apiRequest(`/api/folklore/entries/${targetId}`)
      setDetail(payload)
    } catch (requestError) {
      setError(requestError.message)
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
      await apiRequest('/api/reviews/folklore/submit', {
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
      await loadDetail(detail.entry_id)
      setFlagMessage('Flagged for re-review.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setFlagBusy(false)
    }
  }

  async function archiveEntry(event) {
    event.preventDefault()
    const entryId = detail?.entry_id
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
          target_type: 'folklore',
          target_id: entryId,
          action: 'archive',
          notes,
        }),
      })
      setArchiveDialogOpen(false)
      setArchiveNotes('')
      setDetail(null)
      setArchiveMessage(`${detail.title || 'Entry'} was archived and removed from public use.`)
      await loadPublicList()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setArchiveBusy(false)
    }
  }

  function handleTitleSearch(event) {
    event.preventDefault()
    setSelectedCategory('')
    setTitleSearchTerm(titleSearchInput)
  }

  function handleCategorySelect(categoryValue) {
    setSelectedCategory(categoryValue)
    setTitleSearchInput('')
    setTitleSearchTerm('')
  }

  function handleChooseCategory() {
    setDetail(null)
    setSelectedCategory('')
    setTitleSearchInput('')
    setTitleSearchTerm('')
  }

  useEffect(() => {
    // Beginner note: allowing `?entry_id=<uuid>` means dashboard links can open
    // this page and auto-load the selected entry.
    const entryFromQuery = new URLSearchParams(window.location.search).get('entry_id')
    loadPublicList()
    if (entryFromQuery) {
      loadDetail(entryFromQuery)
    }
  }, [])

  return (
    <div className="folklore-page">
      <section className="folklore-hero-panel">
        <div className="viewer-hero-heading">
          <div>
            <h2>Ivatan Folklore Collection</h2>
          </div>
          {currentUser?.is_authenticated && (
            <button onClick={() => navigate(ROUTES.folkloreDraft)}>Add Folklore Entry</button>
          )}
        </div>
        {!detail && (
          <div className="folklore-hero-tools">
            <form className="folklore-title-search" onSubmit={handleTitleSearch}>
              <label htmlFor="folklore-title-search">Search Folklore Title</label>
              <div className="folklore-title-search-row">
                <input
                  id="folklore-title-search"
                  value={titleSearchInput}
                  onChange={(event) => setTitleSearchInput(event.target.value)}
                  placeholder="Search a folklore title..."
                />
                <button type="submit">Search</button>
              </div>
            </form>
            <article className="dictionary-count-card folklore-count-card">
              <p>{liveEntryTotal}</p>
              <span>Total live entries as of {formatLongDate()}</span>
            </article>
          </div>
        )}
      </section>

      {error && <div className="alert error">{error}</div>}
      {archiveMessage && <div className="alert ok">{archiveMessage}</div>}

      <section className={detail ? 'folklore-content-layout folklore-content-layout-reading' : 'folklore-content-layout'}>
        {!detail && (
        <section className="folklore-browser">
          <div className="section-heading">
            <div>
              <h3>{showCategoryChooser ? 'Choose a Category' : selectedCategoryLabel || 'Latest Submissions'}</h3>
            </div>
            {!showCategoryChooser && (
              <button className="ghost" onClick={handleChooseCategory}>
                Choose Category
              </button>
            )}
          </div>
          {hasActiveFilter && (
            <div className="viewer-filter-summary">
              <p>
                Showing{' '}
                {selectedCategoryLabel ? selectedCategoryLabel : titleSearchTerm ? `titles matching "${titleSearchTerm}"` : 'filtered entries'}
              </p>
              <button className="ghost" type="button" onClick={handleChooseCategory}>
                Clear Filters
              </button>
            </div>
          )}
          {loadingList && <p className="muted">Loading public folklore entries...</p>}
          {!listLoaded && !loadingList && <p className="muted">Public list not loaded yet.</p>}
          {showCategoryChooser ? (
            <div className="folklore-category-grid">
              {FOLKLORE_CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  className="folklore-category-card"
                  type="button"
                  onClick={() => handleCategorySelect(category.value)}
                  aria-label={`View ${category.label}`}
                >
                  <picture>
                    <source media="(max-width: 680px)" srcSet={category.mobileImage} />
                    <img src={category.image} alt="" />
                  </picture>
                  <span>{category.label}</span>
                  <small>{category.description}</small>
                </button>
              ))}
            </div>
          ) : (
            <>
              {listLoaded && listRows.length === 0 && <p className="muted">No public folklore entries found.</p>}
              {listLoaded && listRows.length > 0 && filteredRows.length === 0 && <p className="muted">No folklore entries matched your selection.</p>}
              <div className="folklore-card-grid">
                {filteredRows.map((row) => (
                  <article key={row.entry_id} className="folklore-card">
                    <h3>{row.title || '(untitled folklore)'}</h3>
                    <p className="meta">{folkloreTaxonomyLabel(row.category, row.subcategory) || 'Folklore'}</p>
                    <p className="meta">{row.municipality_source || '-'} | {formatDate(row.created_at)}</p>
                    <p className="meta">Contributor: {row.contributor_username || '-'}</p>
                    <button className="ghost" onClick={() => loadDetail(row.entry_id)}>
                      Read Entry
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
        )}

        {detail && (
          <section className="folklore-detail-panel">
            <div className="section-heading">
              <div>
                <h3>{detail.title || '(untitled folklore)'}</h3>
              </div>
              <button className="ghost" onClick={() => setDetail(null)}>
                Back to Collection
              </button>
            </div>

            <div className="detail-layout">
              <article className="detail-main">
                {detailEmbedUrl && (
                  <div className="youtube-embed-wrap">
                    <iframe
                      src={detailEmbedUrl}
                      title={detail.title || 'Folklore video'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                )}
                {detail.photo_upload_url && <img className="folklore-photo-preview" src={detail.photo_upload_url} alt="" />}
                {detail.audio_upload_url && (
                  <audio className="folklore-audio-player" controls src={detail.audio_upload_url}>
                    <track kind="captions" />
                  </audio>
                )}
                {!detailEmbedUrl && detail.media_url && (
                  <a className="folklore-media-link" href={detail.media_url} target="_blank" rel="noreferrer">
                    Open media link
                  </a>
                )}
                <h2>{detail.title || '(untitled folklore)'}</h2>
                <p className="story-text">{detail.content || 'No content provided.'}</p>
                <div className="folklore-metadata-layout">
                  <section className="folklore-attribution-block">
                    <h4>Details</h4>
                    <div className="folklore-attribution-grid">
                      <p>
                        <span>Main Category</span>
                        <strong>{FOLKLORE_TAXONOMY.find((category) => category.value === detail.category)?.label || detail.category || '-'}</strong>
                      </p>
                      <p>
                        <span>Subcategory</span>
                        <strong>{folkloreSubcategoryLabel(detail.subcategory) || '-'}</strong>
                      </p>
                      <p>
                        <span>Place</span>
                        <strong>{detail.municipality_source || '-'}</strong>
                      </p>
                      <p>
                        <span>Date Added</span>
                        <strong>{formatDate(detail.created_at)}</strong>
                      </p>
                    </div>
                  </section>
                  <section className="folklore-attribution-block">
                    <h4>Attribution</h4>
                    <div className="folklore-attribution-grid">
                      <p>
                        <span>Contributor</span>
                        <strong>{detail.contributor || '-'}</strong>
                      </p>
                      {isVisibleSource(detail.source) && (
                        <p>
                          <span>Source</span>
                          <strong>{detail.source}</strong>
                        </p>
                      )}
                      {isVisibleSource(detail.media_source) && (
                        <p>
                          <span>Media</span>
                          <strong>{detail.media_source}</strong>
                        </p>
                      )}
                      <p>
                        <span>Copyright</span>
                        <strong>{detail.copyright_usage || '-'}</strong>
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
                          <label htmlFor="folklore-rereview-notes">Notes / justification</label>
                          <textarea
                            id="folklore-rereview-notes"
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
                </div>
              </article>
            </div>
          </section>
        )}
      </section>
      <ArchiveEntryDialog
        open={archiveDialogOpen}
        title={detail?.title || 'Folklore entry'}
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
