/*
  FolkloreViewerPage.jsx

  Public folklore browser + detail inspector.
  Supports quick loading from URL query (`?entry_id=<uuid>`).
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

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
import { formatSourceDisplay } from '../lib/sourceDisplay'

const FOLKLORE_CATEGORIES = [
  { ...FOLKLORE_TAXONOMY[0], image: oralNarrativesCardImage, mobileImage: oralNarrativesMobileCardImage },
  {
    ...FOLKLORE_TAXONOMY[1],
    image: wisdomExpressionsCardImage,
    mobileImage: wisdomExpressionsMobileCardImage,
  },
  { ...FOLKLORE_TAXONOMY[2], image: songsPoetryCardImage, mobileImage: songsPoetryMobileCardImage },
  { ...FOLKLORE_TAXONOMY[3], image: beliefsRitualLifeCardImage, mobileImage: beliefsRitualsMobileCardImage },
  {
    ...FOLKLORE_TAXONOMY[4],
    image: traditionalKnowledgeCardImage,
    mobileImage: traditionalKnowledgeMobileCardImage,
  },
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

function previewText(value, limit = 150) {
  const cleaned = String(value || '').trim()
  if (!cleaned) return ''
  if (cleaned.length <= limit) return cleaned
  const preview = cleaned.slice(0, limit).trim()
  const lastSpace = preview.lastIndexOf(' ')
  return `${preview.slice(0, lastSpace > 48 ? lastSpace : limit).trim()}...`
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
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized && normalized !== '[hidden]' && normalized !== 'hidden'
}

function canFlagLiveEntries(user) {
  const groups = user?.groups || []
  return Boolean(
    user?.is_superuser ||
    groups.some((group) => ['Contributor', 'Admin', 'Reviewer', 'Consultant'].includes(group)),
  )
}

function isAdminUser(user) {
  const groups = user?.groups || []
  return Boolean(user?.is_superuser || groups.includes('Admin'))
}

function canReviseThisEntry(user, detail) {
  if (!user?.is_authenticated) return false
  if (isAdminUser(user)) return true
  return user.username === detail?.contributor
}

export default function FolkloreViewerPage({ currentUser }) {
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState('')
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
  const [comments, setComments] = useState([])
  const [commentBody, setCommentBody] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState('')
  const detailEmbedUrl = getYouTubeEmbedUrl(detail?.media_url)

  const setFolkloreUrl = useCallback((entryId = '', { replace = false } = {}) => {
    const nextUrl = entryId
      ? `${ROUTES.folkloreView}?entry_id=${encodeURIComponent(entryId)}`
      : ROUTES.folkloreView
    if (replace) {
      window.history.replaceState({}, '', nextUrl)
      return
    }
    window.history.pushState({}, '', nextUrl)
  }, [])

  const filteredRows = useMemo(() => {
    const searchValue = titleSearchTerm.trim().toLowerCase()
    return listRows.filter((row) => {
      const matchesSearch =
        !searchValue ||
        String(row.title || '')
          .toLowerCase()
          .includes(searchValue)
      const matchesCategory = !selectedCategory || row.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [listRows, selectedCategory, titleSearchTerm])

  const selectedCategoryLabel = FOLKLORE_CATEGORIES.find(
    (category) => category.value === selectedCategory,
  )?.label
  const showCategoryChooser = !detail && !selectedCategory && !titleSearchTerm.trim()

  const loadPublicList = useCallback(async () => {
    setLoadingList(true)
    setListError('')
    try {
      // Beginner note: this endpoint only returns public-visible folklore entries.
      const payload = await apiRequest('/api/folklore/entries')
      setListRows(payload.rows || [])
      setLiveEntryTotal(payload.counts?.visible_total || 0)
      setListLoaded(true)
    } catch (requestError) {
      setListError(requestError.message)
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadDetail = useCallback(
    async (explicitId = null, { updateUrl = false } = {}) => {
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
      setComments([])
      setCommentBody('')
      setCommentError('')
      try {
        if (updateUrl) {
          setFolkloreUrl(targetId)
        }
        const payload = await apiRequest(`/api/folklore/entries/${targetId}`)
        setDetail(payload)
        const commentPayload = await apiRequest(`/api/folklore/entries/${targetId}/comments`)
        setComments(commentPayload.rows || [])
      } catch (requestError) {
        setError(requestError.message)
      }
    },
    [setFolkloreUrl],
  )

  function openDetail(entryId) {
    loadDetail(entryId, { updateUrl: true })
  }

  async function submitComment(event) {
    event.preventDefault()
    const body = commentBody.trim()
    if (!body) return
    setCommentError('')
    setCommentBusy(true)
    try {
      const newComment = await apiRequest(`/api/folklore/entries/${detail.entry_id}/comments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      setComments((prev) => [...prev, newComment])
      setCommentBody('')
    } catch (requestError) {
      setCommentError(requestError.message)
    } finally {
      setCommentBusy(false)
    }
  }

  async function startVariant() {
    setError('')
    try {
      const payload = await apiRequest(`/api/folklore/entries/${detail.entry_id}/variants/start`, {
        method: 'POST',
      })
      navigate(`${ROUTES.folkloreDraft}?revision_id=${payload.revision_id}`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteComment(commentId) {
    try {
      await apiRequest(`/api/folklore/comments/${commentId}/delete`, { method: 'DELETE' })
      setComments((prev) => prev.filter((c) => c.comment_id !== commentId))
    } catch (requestError) {
      setCommentError(requestError.message)
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
      closeDetail()
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

  function closeDetail() {
    setDetail(null)
    setError('')
    setFolkloreUrl('', { replace: true })
  }

  function handleChooseCategory() {
    closeDetail()
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
      setFolkloreUrl('', { replace: true })
      setFolkloreUrl(entryFromQuery)
      loadDetail(entryFromQuery)
    }
  }, [loadDetail, loadPublicList, setFolkloreUrl])

  useEffect(() => {
    function handleBrowserNavigation() {
      const entryFromQuery = new URLSearchParams(window.location.search).get('entry_id')
      if (entryFromQuery) {
        loadDetail(entryFromQuery)
        return
      }
      setDetail(null)
      setError('')
      setFlagPanelOpen(false)
      setFlagNotes('')
      setFlagMessage('')
    }

    window.addEventListener('popstate', handleBrowserNavigation)
    return () => window.removeEventListener('popstate', handleBrowserNavigation)
  }, [loadDetail])

  return (
    <div className="folklore-page">
      <section className="folklore-hero-panel">
        <div className="viewer-hero-heading">
          <div>
            <h2>Ivatan Folklore Collection</h2>
          </div>
          {currentUser?.is_authenticated && (
            <button
              type="button"
              className="dictionary-add-entry-button"
              onClick={() => navigate(ROUTES.folkloreDraft)}
              aria-label="Add folklore entry"
              title="Add folklore entry"
            >
              <span aria-hidden="true">+</span>
            </button>
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

      {listError && !detail && <div className="alert error">{listError}</div>}
      {error && <div className="alert error">{error}</div>}
      {archiveMessage && <div className="alert ok">{archiveMessage}</div>}

      <section
        className={
          detail ? 'folklore-content-layout folklore-content-layout-reading' : 'folklore-content-layout'
        }
      >
        {!detail && (
          <section className="folklore-browser">
            <div className="section-heading">
              <div>
                <h3>
                  {showCategoryChooser ? 'Choose a Category' : selectedCategoryLabel || 'Latest Submissions'}
                </h3>
              </div>
              {!showCategoryChooser && (
                <button className="ghost compact-button" onClick={handleChooseCategory}>
                  Choose Category
                </button>
              )}
            </div>
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
                    style={{ '--folklore-card-mobile-bg': `url(${category.mobileImage})` }}
                  >
                    <picture>
                      <source
                        media="(max-width: 900px), (orientation: portrait)"
                        srcSet={category.mobileImage}
                      />
                      <img src={category.image} alt="" />
                    </picture>
                    <span>{category.label}</span>
                    <small>{category.description}</small>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {listLoaded && listRows.length === 0 && (
                  <p className="muted">No public folklore entries found.</p>
                )}
                {listLoaded && listRows.length > 0 && filteredRows.length === 0 && (
                  <p className="muted">No folklore entries matched your selection.</p>
                )}
                <div className="folklore-card-grid">
                  {filteredRows.map((row) => (
                    <article
                      key={row.entry_id}
                      className="folklore-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail(row.entry_id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDetail(row.entry_id)
                        }
                      }}
                      aria-label={`Read folklore entry ${row.title || 'untitled folklore'}`}
                    >
                      <h3>{row.title || '(untitled folklore)'}</h3>
                      <p className="meta">
                        {folkloreTaxonomyLabel(row.category, row.subcategory) || 'Folklore'}
                      </p>
                      {row.preview && <p className="folklore-card-preview">{previewText(row.preview)}</p>}
                      <p className="meta">
                        {row.municipality_source || '-'} | {formatDate(row.created_at)}
                      </p>
                      <p className="meta">Contributor: {row.contributor_username || '-'}</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {detail && (
          <section className="folklore-detail-panel">
            <div className="section-heading folklore-detail-heading">
              <div>
                <h3>{detail.title || '(untitled folklore)'}</h3>
                {(detail.self_knowledge || detail.self_produced_media) && (
                  <p className="folklore-detail-byline">
                    by {detail.contributor_display_name || detail.contributor || 'Contributor'}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="ghost compact-button folklore-back-icon-button"
                onClick={closeDetail}
                aria-label="Back to collection"
                title="Back to collection"
              >
                <ArrowLeft aria-hidden="true" size={20} strokeWidth={2.4} />
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
                {detail.photo_upload_url && (
                  <img className="folklore-photo-preview" src={detail.photo_upload_url} alt="" />
                )}
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
                {detail.content ? (
                  <div
                    className="story-text rte-output"
                    dangerouslySetInnerHTML={{ __html: detail.content }}
                  />
                ) : (
                  <p className="story-text muted">No content provided.</p>
                )}
                <div className="folklore-metadata-layout">
                  <section className="folklore-attribution-block">
                    <h4>Details</h4>
                    <dl className="folklore-attribution-grid">
                      <div>
                        <dt>Main Category</dt>
                        <dd>
                          {FOLKLORE_TAXONOMY.find((category) => category.value === detail.category)?.label ||
                            detail.category ||
                            '-'}
                        </dd>
                      </div>
                      <div>
                        <dt>Subcategory</dt>
                        <dd>{folkloreSubcategoryLabel(detail.subcategory) || '-'}</dd>
                      </div>
                      {detail.municipality_source &&
                        detail.municipality_source.trim().toLowerCase() !== 'not applicable' && (
                          <div>
                            <dt>Place</dt>
                            <dd>{detail.municipality_source}</dd>
                          </div>
                        )}
                      <div>
                        <dt>Date Added</dt>
                        <dd>{formatDate(detail.created_at)}</dd>
                      </div>
                    </dl>
                  </section>
                  <section className="folklore-attribution-block">
                    <h4>Attribution</h4>
                    <dl className="folklore-attribution-grid">
                      <div>
                        <dt>Contributor</dt>
                        <dd>
                          {detail.contributor ? (
                            <button
                              type="button"
                              className="inline-link-button"
                              onClick={() =>
                                navigate(
                                  `${ROUTES.profileView}?username=${encodeURIComponent(detail.contributor)}`,
                                )
                              }
                            >
                              {detail.contributor_display_name || detail.contributor}
                            </button>
                          ) : (
                            detail.contributor_display_name || '-'
                          )}
                        </dd>
                      </div>
                      {Array.isArray(detail.approved_by) && detail.approved_by.length > 0 && (
                        <div>
                          <dt>Approved by</dt>
                          <dd>
                            {detail.approved_by.map((actor, index) => (
                              <span key={actor.username || index}>
                                {index > 0 && (index === detail.approved_by.length - 1 ? ' and ' : ', ')}
                                <button
                                  type="button"
                                  className="inline-link-button"
                                  onClick={() =>
                                    navigate(
                                      `${ROUTES.profileView}?username=${encodeURIComponent(actor.username)}`,
                                    )
                                  }
                                >
                                  {actor.display_name || actor.username}
                                </button>
                              </span>
                            ))}
                          </dd>
                        </div>
                      )}
                      {isVisibleSource(detail.source) && (
                        <div>
                          <dt>Source</dt>
                          <dd>{formatSourceDisplay(detail.source)}</dd>
                        </div>
                      )}
                      {isVisibleSource(detail.media_source) && (
                        <div>
                          <dt>Media</dt>
                          <dd>{formatSourceDisplay(detail.media_source)}</dd>
                        </div>
                      )}
                      {detail.self_produced_media && detail.copyright_usage && (
                        <div>
                          <dt>Copyright</dt>
                          <dd>{detail.copyright_usage}</dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  {flagMessage && <section className="alert ok">{flagMessage}</section>}

                  {(canReviseThisEntry(currentUser, detail) ||
                    currentUser?.is_authenticated ||
                    (canFlagLiveEntries(currentUser) && detail.review_action?.can_flag_for_rereview) ||
                    isAdminUser(currentUser)) && (
                    <div className="live-review-entry-actions live-review-entry-actions-spread">
                      {!flagPanelOpen && (
                        <p className="dictionary-revise-link">
                          {canReviseThisEntry(currentUser, detail) && detail.entry_id && (
                            <button
                              type="button"
                              className="inline-link-button"
                              onClick={() => navigate(`${ROUTES.folkloreDraft}?entry_id=${detail.entry_id}`)}
                            >
                              Revise this entry
                            </button>
                          )}
                          {currentUser?.is_authenticated && detail.entry_id && (
                            <>
                              {canReviseThisEntry(currentUser, detail) && ' · '}
                              <button type="button" className="inline-link-button" onClick={startVariant}>
                                Submit an alternate version
                              </button>
                            </>
                          )}
                          {canFlagLiveEntries(currentUser) && detail.review_action?.can_flag_for_rereview && (
                            <>
                              {(canReviseThisEntry(currentUser, detail) || currentUser?.is_authenticated) &&
                                ' · '}
                              <button
                                type="button"
                                className="inline-link-button"
                                onClick={() => setFlagPanelOpen(true)}
                              >
                                Flag for re-review
                              </button>
                            </>
                          )}
                          {isAdminUser(currentUser) && (
                            <>
                              {(canReviseThisEntry(currentUser, detail) ||
                                currentUser?.is_authenticated ||
                                (canFlagLiveEntries(currentUser) &&
                                  detail.review_action?.can_flag_for_rereview)) &&
                                ' · '}
                              <button
                                type="button"
                                className="inline-link-button live-review-archive-inline"
                                onClick={() => {
                                  setArchiveMessage('')
                                  setArchiveDialogOpen(true)
                                }}
                              >
                                Archive entry
                              </button>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {flagPanelOpen &&
                    canFlagLiveEntries(currentUser) &&
                    detail.review_action?.can_flag_for_rereview && (
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
                </div>

                {Array.isArray(detail.alternate_versions) && detail.alternate_versions.length > 0 && (
                  <section className="folklore-alternate-versions">
                    <h4>Alternate Versions</h4>
                    <ul className="folklore-alternate-list">
                      {detail.alternate_versions.map((v) => (
                        <li key={v.entry_id} className="folklore-alternate-item">
                          <button
                            type="button"
                            className="inline-link-button folklore-alternate-title"
                            onClick={() => openDetail(v.entry_id)}
                          >
                            {v.title || '(untitled)'}
                          </button>
                          <span className="folklore-alternate-meta">
                            {v.contributor && <>by {v.contributor} · </>}
                            {formatDate(v.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </article>

              <section className="folklore-comments-section">
                <h4>Community Voices</h4>
                {commentError && <p className="alert error">{commentError}</p>}
                {comments.length === 0 && (
                  <p className="muted folklore-comments-empty">
                    No comments yet. Be the first to start the discussion.
                  </p>
                )}
                {comments.length > 0 && (
                  <ul className="folklore-comment-list">
                    {comments.map((comment) => (
                      <li key={comment.comment_id} className="folklore-comment-item">
                        <div className="folklore-comment-avatar-wrap">
                          {comment.author_photo_url ? (
                            <img className="folklore-comment-avatar" src={comment.author_photo_url} alt="" />
                          ) : (
                            <div
                              className="folklore-comment-avatar folklore-comment-avatar-fallback"
                              aria-hidden="true"
                            >
                              {(comment.author || '?')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="folklore-comment-content">
                          <div className="folklore-comment-meta">
                            <span className="folklore-comment-author">{comment.author}</span>
                            <span className="folklore-comment-date">{formatDate(comment.created_at)}</span>
                            {(comment.is_own || isAdminUser(currentUser)) && (
                              <button
                                type="button"
                                className="folklore-comment-delete"
                                onClick={() => deleteComment(comment.comment_id)}
                                aria-label="Delete comment"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="folklore-comment-body">{comment.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {currentUser?.is_authenticated ? (
                  <form className="folklore-comment-form" onSubmit={submitComment}>
                    <div className="folklore-comment-form-avatar-row">
                      <div
                        className="folklore-comment-avatar folklore-comment-avatar-fallback folklore-comment-form-avatar"
                        aria-hidden="true"
                      >
                        {(currentUser.username || '?')[0].toUpperCase()}
                      </div>
                      <div className="folklore-comment-form-input-wrap">
                        <textarea
                          id="folklore-comment-body"
                          value={commentBody}
                          onChange={(e) => setCommentBody(e.target.value)}
                          placeholder="Share a thought, ask a question, or add context..."
                          rows={2}
                          maxLength={2000}
                          required
                        />
                        <div className="folklore-comment-form-footer">
                          <span className="muted">{commentBody.length}/2000</span>
                          <button type="submit" disabled={commentBusy || !commentBody.trim()}>
                            {commentBusy ? 'Posting...' : 'Post Comment'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                ) : (
                  <p className="muted folklore-comment-login-nudge">
                    <button
                      type="button"
                      className="inline-link-button"
                      onClick={() => navigate(ROUTES.login)}
                    >
                      Log in
                    </button>{' '}
                    to join the discussion.
                  </p>
                )}
              </section>
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
