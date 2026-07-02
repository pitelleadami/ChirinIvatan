import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Volume2 } from 'lucide-react'

import ArchiveEntryDialog from '../components/ArchiveEntryDialog'
import { apiRequest } from '../lib/api'
import { capitalizeFirst, normalizeHeadword, sentenceForDisplay } from '../lib/dictionaryText'
import { ROUTES, navigate } from '../lib/router'

const LETTER_OPTIONS = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]
const DICTIONARY_LIST_DESKTOP_PAGE_SIZE = 10
const DICTIONARY_LIST_MOBILE_PAGE_SIZE = 6
const DICTIONARY_LATEST_PAGE_SIZE = 10
const MOBILE_DICTIONARY_LIST_QUERY = '(max-width: 900px)'
const REVISION_SNAPSHOT_FIELDS = [
  ['term', 'Term'],
  ['meaning', 'Meaning'],
  ['part_of_speech', 'Part of speech'],
  ['variant_type', 'Variant'],
  ['pronunciation_text', 'Pronunciation'],
  ['phonetic', 'Phonetic'],
  ['example_sentence', 'Example sentence'],
  ['example_translation', 'Example translation'],
  ['usage_notes', 'Usage notes'],
  ['etymology', 'Etymology'],
  ['english_synonym', 'English synonyms'],
  ['ivatan_synonym', 'Ivatan synonyms'],
  ['english_antonym', 'English antonyms'],
  ['ivatan_antonym', 'Ivatan antonyms'],
  ['inflected_forms', 'Inflected forms'],
  ['source_text', 'Term source'],
  ['audio_source', 'Audio source'],
  ['photo_source', 'Image source'],
]

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
      : String(value)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
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

function splitRelatedWords(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label) => ({ label, term: label, entry_id: null }))
}

function RelatedWordChip({ item, onOpen }) {
  const label = item?.label || item?.term || ''
  if (!label) return null
  if (item?.entry_id) {
    return (
      <button type="button" className="dictionary-related-link" onClick={() => onOpen?.(item.entry_id)}>
        {label}
      </button>
    )
  }
  return <span>{label}</span>
}

function RelatedWordGroup({ rows, relatedTerms = {}, onOpen }) {
  const groups = rows
    .map(([field, title, value]) => {
      const resolvedItems = Array.isArray(relatedTerms[field]) ? relatedTerms[field] : null
      const items = resolvedItems || splitRelatedWords(value)
      return [title, items.filter((item) => item?.label || item?.term)]
    })
    .filter(([, items]) => items.length > 0)
  if (!groups.length) return null
  return (
    <section className="dictionary-field-block">
      <h4>Related Words</h4>
      <div className="dictionary-related-groups">
        {groups.map(([title, items]) => (
          <div key={title} className="dictionary-related-group">
            <p>{title}</p>
            <div className="dictionary-chip-row">
              {items.map((item) => (
                <RelatedWordChip key={`${title}-${item.label || item.term}`} item={item} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ConnectedVariants({ variants = [], onOpen, onPlayAudio }) {
  const rows = Array.isArray(variants) ? variants.filter((variant) => variant?.entry_id) : []
  if (!rows.length) return null

  return (
    <section className="dictionary-field-block dictionary-connected-variants">
      <h4>Related Variants</h4>
      <div className="dictionary-connected-variant-list">
        {rows.map((variant) => (
          <article
            key={variant.entry_id}
            role="button"
            tabIndex={0}
            className="dictionary-connected-variant-card"
            onClick={() => onOpen(variant.entry_id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen(variant.entry_id)
              }
            }}
          >
            <div className="dictionary-connected-variant-heading">
              <div>
                <strong>{normalizeHeadword(variant.term)}</strong>
                {variant.is_mother && <span>Mother term</span>}
              </div>
              {variant.audio_pronunciation_url && (
                <button
                  type="button"
                  className="audio-icon-button"
                  aria-label={`Play pronunciation audio for ${variant.term}`}
                  title="Play pronunciation audio"
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlayAudio(variant.audio_pronunciation_url)
                  }}
                >
                  <Volume2 aria-hidden="true" size={17} strokeWidth={2.3} />
                </button>
              )}
            </div>
            <dl className="dictionary-connected-variant-details">
              {variant.variant_type && (
                <div>
                  <dt>Variant</dt>
                  <dd>{variant.variant_type}</dd>
                </div>
              )}
              {variant.pronunciation_text && (
                <div>
                  <dt>Pronunciation</dt>
                  <dd>{variant.pronunciation_text}</dd>
                </div>
              )}
              {variant.phonetic && (
                <div>
                  <dt>IPA</dt>
                  <dd>{variant.phonetic}</dd>
                </div>
              )}
              {variant.example_sentence && (
                <div>
                  <dt>Ivatan</dt>
                  <dd>{sentenceForDisplay(variant.example_sentence)}</dd>
                </div>
              )}
              {variant.example_translation && (
                <div>
                  <dt>English</dt>
                  <dd>{sentenceForDisplay(variant.example_translation)}</dd>
                </div>
              )}
              {variant.usage_notes && (
                <div>
                  <dt>Usage</dt>
                  <dd>{variant.usage_notes}</dd>
                </div>
              )}
              {variant.etymology && (
                <div>
                  <dt>Etymology</dt>
                  <dd>{variant.etymology}</dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function compactPostNominals(name) {
  const value = String(name || '').trim()
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length <= 2) return value
  return `${parts[0]}, ${parts[parts.length - 1]}`
}

function ActorLink({ actor }) {
  if (!actor?.username) return <strong>-</strong>
  const displayName = compactPostNominals(actor.display_name || actor.username)
  return (
    <button
      type="button"
      className="inline-link-button attribution-person-link"
      onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(actor.username)}`)}
    >
      {displayName}
    </button>
  )
}

function ActorList({ actors }) {
  const rows = (Array.isArray(actors) ? actors : []).filter((actor) => actor?.username)
  if (!rows.length) return <strong>-</strong>
  return rows.map((actor, index) => (
    <span key={actor.username}>
      {index > 0 && (index === rows.length - 1 ? ' and ' : ', ')}
      <ActorLink actor={actor} />
    </span>
  ))
}

function formatLongDate(value = new Date()) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(value)
}

function formatShortDateTime(value) {
  if (!value) return 'Unknown date'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAttributionSource(label, value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/^(term|audio|photo|image)?\s*source:\s*/i, '')
  return cleaned ? `${label}: ${cleaned}` : ''
}

function formatSnapshotValue(value) {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, rowValue]) => `${key}: ${formatSnapshotValue(rowValue)}`)
      .filter(Boolean)
      .join(' | ')
  }
  return String(value).trim()
}

function revisionRows(revision) {
  const proposedData = revision?.proposed_data || {}
  return REVISION_SNAPSHOT_FIELDS.map(([field, label]) => [
    label,
    formatSnapshotValue(proposedData[field]),
  ]).filter(([, value]) => value)
}

function revisionChangeRows(revision, previousRevision) {
  const proposedData = revision?.proposed_data || {}
  const previousData = previousRevision?.proposed_data || {}

  return REVISION_SNAPSHOT_FIELDS.map(([field, label]) => {
    const oldValue = formatSnapshotValue(previousData[field])
    const newValue = formatSnapshotValue(proposedData[field])
    if (oldValue === newValue) return null
    let changeType = 'Changed'
    if (!oldValue && newValue) changeType = 'Added'
    if (oldValue && !newValue) changeType = 'Removed'
    return { label, oldValue, newValue, changeType }
  }).filter(Boolean)
}

function RevisionChangeList({ revision, previousRevision }) {
  if (!previousRevision) {
    return null
  }

  const rows = revisionChangeRows(revision, previousRevision)

  return (
    <div className="revision-history-changes">
      <h6>Changed fields</h6>
      {rows.length > 0 ? (
        <dl>
          {rows.map((row) => (
            <div
              key={row.label}
              className={`revision-change-row revision-change-${row.changeType.toLowerCase()}`}
            >
              <dt>
                <span>{row.changeType}</span>
                {row.label}
              </dt>
              <dd>
                {row.oldValue && (
                  <p>
                    <strong>Old:</strong> {row.oldValue}
                  </p>
                )}
                {row.newValue && (
                  <p>
                    <strong>New:</strong> {row.newValue}
                  </p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">No visible field changes were recorded for this revision.</p>
      )}
    </div>
  )
}

function RevisionFullSnapshot({ revision, isPrimary = false }) {
  const rows = revisionRows(revision)

  if (rows.length === 0) {
    return <p className="muted">No snapshot fields were recorded for this revision.</p>
  }

  const snapshotList = (
    <dl className="revision-history-snapshot">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )

  if (isPrimary) {
    return snapshotList
  }

  return (
    <details className="revision-full-snapshot-toggle">
      <summary>Show full snapshot</summary>
      {snapshotList}
    </details>
  )
}

function RevisionSnapshotCard({ revision, title, tone = 'approved', previousRevision = null }) {
  if (!revision) return null
  const dateValue = revision.approved_at || revision.created_at
  const isOriginalSnapshot = revision.is_base_snapshot || !previousRevision

  return (
    <details className={`revision-history-card revision-history-card-${tone}`}>
      <summary>
        <div>
          <h5>{title}</h5>
          <p>
            {formatShortDateTime(dateValue)} by {revision.contributor_username || 'Unknown contributor'}
          </p>
        </div>
        <span>{revision.status || (revision.is_base_snapshot ? 'approved' : 'revision')}</span>
      </summary>
      {revision.reviewer_notes && (
        <p className="revision-history-notes">
          <strong>Reviewer notes:</strong> {revision.reviewer_notes}
        </p>
      )}
      {isOriginalSnapshot ? (
        <RevisionFullSnapshot revision={revision} isPrimary />
      ) : (
        <>
          <RevisionChangeList revision={revision} previousRevision={previousRevision} />
          <RevisionFullSnapshot revision={revision} />
        </>
      )}
    </details>
  )
}

function RevisionHistorySection({ history }) {
  const approvedRows = history?.recent_approved_revisions || []
  const rejectedRows = history?.recent_rejected_revisions || []
  const hasHistory = Boolean(history?.base_snapshot || approvedRows.length || rejectedRows.length)
  const approvedChronology = [history?.base_snapshot, ...approvedRows.slice().reverse()].filter(Boolean)
  const previousApprovedById = new Map(
    approvedChronology.map((revision, index) => [revision.id, approvedChronology[index - 1] || null]),
  )

  return (
    <section id="dictionary-revision-history" className="dictionary-field-block revision-history-section">
      <div className="revision-history-heading">
        <div>
          <h4>Revision History</h4>
        </div>
      </div>

      {history?.base_snapshot && (
        <RevisionSnapshotCard
          revision={history.base_snapshot}
          title="Original approved version"
          tone="base"
        />
      )}

      {approvedRows.length > 0 && (
        <div className="revision-history-group">
          <h5>Approved revisions</h5>
          {approvedRows.map((item, index) => (
            <RevisionSnapshotCard
              key={`approved-${item.id}`}
              revision={item}
              title={`Approved revision ${approvedRows.length - index}`}
              tone="approved"
              previousRevision={previousApprovedById.get(item.id)}
            />
          ))}
        </div>
      )}

      {rejectedRows.length > 0 && (
        <div className="revision-history-group">
          <h5>Rejected revisions</h5>
          {rejectedRows.map((item, index) => (
            <RevisionSnapshotCard
              key={`rejected-${item.id}`}
              revision={item}
              title={`Rejected revision ${rejectedRows.length - index}`}
              tone="rejected"
              previousRevision={history?.base_snapshot}
            />
          ))}
        </div>
      )}

      {!hasHistory && <p>No revision logs yet.</p>}
    </section>
  )
}

function previewText(value, limit = 96) {
  const cleaned = String(value || '').trim()
  if (!cleaned) return ''
  if (cleaned.length <= limit) return cleaned

  const preview = cleaned.slice(0, limit).trim()
  const lastSpace = preview.lastIndexOf(' ')
  const trimmedPreview = lastSpace > 48 ? preview.slice(0, lastSpace).trim() : preview
  return `${trimmedPreview}...`
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

function canFlagLiveEntries(user) {
  const groups = user?.groups || []
  return Boolean(
    user?.is_superuser ||
    groups.some((group) => ['Contributor', 'Admin', 'Reviewer', 'Consultant'].includes(group)),
  )
}

function canReviseLiveEntries(user) {
  const groups = user?.groups || []
  return Boolean(
    user?.is_superuser || groups.some((group) => ['Admin', 'Reviewer', 'Consultant'].includes(group)),
  )
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
  const [isMobileDictionaryList, setIsMobileDictionaryList] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_DICTIONARY_LIST_QUERY).matches,
  )
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
  const wordOfDayTerm = wordOfDay ? normalizeHeadword(wordOfDay.term) : ''
  const wordOfDayTermLength = Math.max(1, wordOfDayTerm.replace(/\s+/g, '').length)
  const showingFilteredList = Boolean(searchTerm.trim() || letter !== 'All')
  const emptySearchActionLabel = currentUser?.is_authenticated ? 'add this term' : 'join the Digital Yaru'
  const emptyFilterActionLabel = currentUser?.is_authenticated ? 'add one' : 'join the Digital Yaru'
  const emptyResultActionLabel = searchTerm.trim() ? emptySearchActionLabel : emptyFilterActionLabel
  const emptySearchActionSuffix = currentUser?.is_authenticated
    ? ' and help us grow.'
    : ' to add this term and help us grow.'
  const emptyFilterActionSuffix = currentUser?.is_authenticated
    ? ' and help the dictionary grow.'
    : ' to add one and help the dictionary grow.'
  const emptyResultActionSuffix = searchTerm.trim() ? emptySearchActionSuffix : emptyFilterActionSuffix

  const dictionaryListPageSize = isMobileDictionaryList
    ? DICTIONARY_LIST_MOBILE_PAGE_SIZE
    : DICTIONARY_LIST_DESKTOP_PAGE_SIZE
  const listPageCount = Math.max(1, Math.ceil(listRows.length / dictionaryListPageSize))
  const paginatedListRows = useMemo(() => {
    const pageStart = (listPage - 1) * dictionaryListPageSize
    return listRows.slice(pageStart, pageStart + dictionaryListPageSize)
  }, [dictionaryListPageSize, listPage, listRows])
  const latestPageCount = Math.max(1, Math.ceil(latestRows.length / DICTIONARY_LATEST_PAGE_SIZE))
  const paginatedLatestRows = useMemo(() => {
    const pageStart = (latestPage - 1) * DICTIONARY_LATEST_PAGE_SIZE
    return latestRows.slice(pageStart, pageStart + DICTIONARY_LATEST_PAGE_SIZE)
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

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_DICTIONARY_LIST_QUERY)
    const syncMobileListSize = () => setIsMobileDictionaryList(mediaQuery.matches)

    syncMobileListSize()
    mediaQuery.addEventListener('change', syncMobileListSize)

    return () => {
      mediaQuery.removeEventListener('change', syncMobileListSize)
    }
  }, [])

  async function loadLatest() {
    setLatestPage(1)
    try {
      const payload = await apiRequest('/api/dictionary/entries?limit=500&sort=recent&mother_only=true')
      setLatestRows(payload.rows || [])
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

  const setDictionaryUrl = useCallback((entryId = '', { replace = false } = {}) => {
    const nextUrl = entryId
      ? `${ROUTES.dictionaryView}?entry_id=${encodeURIComponent(entryId)}`
      : ROUTES.dictionaryView
    if (replace) {
      window.history.replaceState({}, '', nextUrl)
      return
    }
    window.history.pushState({}, '', nextUrl)
  }, [])

  const loadEntry = useCallback(
    async (entryId, { updateUrl = true } = {}) => {
      setLoadingDetail(true)
      setError('')
      setShowRevisionHistory(false)
      setFlagPanelOpen(false)
      setFlagNotes('')
      setFlagMessage('')
      setArchiveMessage('')
      setArchiveDialogOpen(false)
      setArchiveNotes('')
      if (updateUrl) {
        setDictionaryUrl(entryId)
      }
      try {
        const payload = await apiRequest(`/api/dictionary/entries/${entryId}`)
        setDetail(payload)
      } catch (requestError) {
        if (/not found/i.test(requestError.message) || /CI-RESPONSE-01/.test(requestError.message)) {
          setError('')
          setDictionaryUrl('')
        } else {
          setError(requestError.message)
        }
        setDetail(null)
      } finally {
        setLoadingDetail(false)
      }
    },
    [setDictionaryUrl],
  )

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

  function returnToDictionary() {
    setDetail(null)
    setShowRevisionHistory(false)
    setFlagPanelOpen(false)
    setFlagNotes('')
    setFlagMessage('')
    setArchiveMessage('')
    setDictionaryUrl('', { replace: true })
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const entryFromQuery = params.get('entry_id')
    const searchFromQuery = params.get('q') || params.get('search')

    loadLatest()

    if (entryFromQuery) {
      setDictionaryUrl('', { replace: true })
      setDictionaryUrl(entryFromQuery)
      loadList()
      loadEntry(entryFromQuery, { updateUrl: false })
      return
    }

    if (searchFromQuery) {
      setSearchTerm(searchFromQuery)
      loadList({ q: searchFromQuery })
      return
    }

    loadList()
  }, [loadEntry, setDictionaryUrl])

  useEffect(() => {
    const handleBrowserNavigation = () => {
      const params = new URLSearchParams(window.location.search)
      const entryFromQuery = params.get('entry_id')

      if (entryFromQuery) {
        loadEntry(entryFromQuery, { updateUrl: false })
        return
      }

      setDetail(null)
      setShowRevisionHistory(false)
      setFlagPanelOpen(false)
      setFlagNotes('')
      setFlagMessage('')
    }

    window.addEventListener('popstate', handleBrowserNavigation)

    return () => {
      window.removeEventListener('popstate', handleBrowserNavigation)
    }
  }, [loadEntry])

  return (
    <div className="dictionary-page">
      <section className="dictionary-hero-panel">
        <div className="viewer-hero-heading">
          <div>
            <h2>Chirin Ivatan Dictionary</h2>
          </div>
          {currentUser?.is_authenticated && (
            <button
              type="button"
              className="dictionary-add-entry-button"
              onClick={() => navigate(ROUTES.dictionaryDraft)}
              aria-label="Add dictionary entry"
              title="Add dictionary entry"
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
        </div>
      </section>

      {!detail && wordOfDay && (
        <section className="dictionary-feature-row">
          <article className="dictionary-count-card">
            <p>{dictionaryTermTotal}</p>
            <span>Total Live Entries as of {formatLongDate()}</span>
          </article>
          <article className="word-of-day-card">
            <div className="word-of-day-copy">
              <p className="profile-kicker">Word of the Day</p>
              <h3 style={{ '--word-of-day-length': wordOfDayTermLength }}>{wordOfDayTerm}</h3>
              {wordOfDay.meaning && (
                <p className="word-of-day-meaning">{capitalizeFirst(wordOfDay.meaning)}</p>
              )}
            </div>
            <button
              type="button"
              className="word-of-day-link"
              onClick={() => loadEntry(wordOfDay.entry_id)}
              aria-label={`Open dictionary entry for ${wordOfDay.term}`}
              title="Open entry"
            >
              <ExternalLink aria-hidden="true" size={18} strokeWidth={2.4} />
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
                <label
                  className="dictionary-search-label dictionary-search-label-english"
                  htmlFor="english-translation-search"
                >
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
              {showingFilteredList && (
                <p>{`${listRows.length} result${listRows.length === 1 ? '' : 's'} found`}</p>
              )}
            </div>
            <label className="dictionary-alpha-row" htmlFor="alphabet-filter">
              <span>Filter by first letter</span>
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
          <div
            className={
              showingFilteredList
                ? 'dictionary-scroll-list dictionary-search-results-list'
                : 'dictionary-scroll-list'
            }
          >
            {loadingList && <p className="muted">Loading dictionary entries...</p>}
            {!loadingList && listRows.length === 0 && !listResultMessage && (
              <p className="muted">No entries found.</p>
            )}
            {paginatedListRows.map((row) => (
              <button
                key={row.entry_id}
                className={
                  detail?.header?.entry_id === row.entry_id
                    ? 'dictionary-term-item selected'
                    : 'dictionary-term-item'
                }
                onClick={() => loadEntry(row.entry_id)}
              >
                <span>
                  <strong>{normalizeHeadword(row.term)}</strong>
                </span>
                <span className="dictionary-term-arrow" aria-hidden="true">
                  &rarr;
                </span>
              </button>
            ))}
          </div>
          {listRows.length > dictionaryListPageSize && (
            <nav className="dictionary-list-pagination" aria-label="Dictionary list pagination">
              <button
                type="button"
                className="ghost"
                aria-label="Previous dictionary page"
                title="Previous page"
                disabled={listPage === 1}
                onClick={() => setListPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.4} />
              </button>
              <span>
                Page {listPage} of {listPageCount}
              </span>
              <button
                type="button"
                className="ghost"
                aria-label="Next dictionary page"
                title="Next page"
                disabled={listPage === listPageCount}
                onClick={() => setListPage((currentPage) => Math.min(listPageCount, currentPage + 1))}
              >
                <ChevronRight aria-hidden="true" size={20} strokeWidth={2.4} />
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
                  <article
                    key={row.entry_id}
                    role="button"
                    tabIndex={0}
                    className={`dictionary-latest-card${row.photo_url ? ' has-photo' : ''}`}
                    onClick={() => loadEntry(row.entry_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        loadEntry(row.entry_id)
                      }
                    }}
                  >
                    <div className="dictionary-latest-card-copy">
                      <div className="dictionary-latest-title-row">
                        <strong>{normalizeHeadword(row.term)}</strong>
                        {row.audio_pronunciation_url && (
                          <button
                            type="button"
                            className="audio-icon-button dictionary-latest-audio-button"
                            aria-label={`Play pronunciation audio for ${row.term}`}
                            title="Play pronunciation audio"
                            onKeyDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation()
                              playAudio(row.audio_pronunciation_url)
                            }}
                          >
                            <Volume2 aria-hidden="true" size={18} strokeWidth={2.3} />
                          </button>
                        )}
                      </div>
                      {row.meaning && <p>{previewText(capitalizeFirst(row.meaning))}</p>}
                      <small>
                        {[
                          row.part_of_speech,
                          row.created_at ? `Added ${new Date(row.created_at).toLocaleDateString()}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </div>
                    {row.photo_url && (
                      <img className="dictionary-latest-photo" src={row.photo_url} alt="" loading="lazy" />
                    )}
                  </article>
                ))}
              </div>
              {latestRows.length > DICTIONARY_LATEST_PAGE_SIZE && (
                <nav className="dictionary-list-pagination" aria-label="Latest approved terms pagination">
                  <button
                    type="button"
                    className="ghost"
                    aria-label="Previous latest approved terms page"
                    title="Previous page"
                    disabled={latestPage === 1}
                    onClick={() => setLatestPage((currentPage) => Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.4} />
                  </button>
                  <span>
                    Page {latestPage} of {latestPageCount}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    aria-label="Next latest approved terms page"
                    title="Next page"
                    disabled={latestPage === latestPageCount}
                    onClick={() => setLatestPage((currentPage) => Math.min(latestPageCount, currentPage + 1))}
                  >
                    <ChevronRight aria-hidden="true" size={20} strokeWidth={2.4} />
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
                    returnToDictionary()
                  }}
                >
                  Back to Dictionary
                </button>
              </div>
              {loadingDetail && <p className="muted">Loading term detail...</p>}
              {!loadingDetail && (
                <article className="dictionary-entry-detail">
                  <header className="dictionary-headword">
                    <div className="dictionary-headword-row">
                      <h2>{normalizeHeadword(detail.header?.term)}</h2>
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
                      <p>{capitalizeFirst(detail.semantic_core?.meaning) || 'No meaning provided yet.'}</p>
                    </div>
                  </section>

                  {(detail.variant_section?.example_sentence ||
                    detail.variant_section?.example_translation) && (
                    <section className="dictionary-field-block">
                      <h4>Sample Sentence</h4>
                      <div className="example-translation-grid">
                        <div>
                          <p className="meta">Ivatan</p>
                          <p>{sentenceForDisplay(detail.variant_section?.example_sentence) || '-'}</p>
                        </div>
                        <div>
                          <p className="meta">English</p>
                          <p>{sentenceForDisplay(detail.variant_section?.example_translation) || '-'}</p>
                        </div>
                      </div>
                    </section>
                  )}
                  <FieldBlock title="Usage Notes">{detail.variant_section?.usage_notes}</FieldBlock>
                  <FieldBlock title="Etymology">{detail.variant_section?.etymology}</FieldBlock>
                  <RelatedWords title="Inflected Forms" value={detail.semantic_core?.inflected_forms} />
                  <RelatedWordGroup
                    relatedTerms={detail.semantic_core?.related_terms}
                    onOpen={(entryId) => loadEntry(entryId)}
                    rows={[
                      ['english_synonym', 'English synonyms', detail.semantic_core?.english_synonym],
                      ['ivatan_synonym', 'Ivatan synonyms', detail.semantic_core?.ivatan_synonym],
                      ['english_antonym', 'English antonyms', detail.semantic_core?.english_antonym],
                      ['ivatan_antonym', 'Ivatan antonyms', detail.semantic_core?.ivatan_antonym],
                    ]}
                  />
                  <ConnectedVariants
                    variants={detail.connected_variants}
                    onOpen={(entryId) => loadEntry(entryId)}
                    onPlayAudio={playAudio}
                  />

                  <section className="dictionary-attribution-block">
                    <h4>Attribution</h4>
                    <dl className="dictionary-attribution-grid">
                      <div>
                        <dt>
                          {detail.contributors?.unique_revision_contributor_actors?.length > 0
                            ? 'Original Contributor'
                            : 'Contributor'}
                        </dt>
                        <dd>
                          <ActorLink actor={detail.attribution?.term?.initially_contributed_by_actor} />
                        </dd>
                      </div>
                      <div>
                        <dt>Approved by</dt>
                        <dd>
                          <ActorList
                            actors={detail.attribution?.always_visible?.reviewed_and_approved_by_actors}
                          />
                        </dd>
                      </div>
                      {detail.contributors?.unique_revision_contributor_actors?.length > 0 && (
                        <div>
                          <dt>Revised by</dt>
                          <dd>
                            <ActorList actors={detail.contributors.unique_revision_contributor_actors} />
                          </dd>
                        </div>
                      )}
                      {((detail.attribution?.audio?.is_self_recorded &&
                        detail.attribution.audio.contributed_by_actor) ||
                        (detail.attribution?.photo?.is_contributor_owned &&
                          detail.attribution.photo.contributed_by_actor)) && (
                        <div>
                          <dt>Media credit</dt>
                          <dd>
                            {[
                              detail.attribution?.audio?.is_self_recorded
                                ? ['Audio by', detail.attribution.audio.contributed_by_actor]
                                : null,
                              detail.attribution?.photo?.is_contributor_owned
                                ? ['Photo by', detail.attribution.photo.contributed_by_actor]
                                : null,
                            ]
                              .filter((item) => item?.[1])
                              .map(([label, actor], index, rows) => (
                                <span key={label}>
                                  {index > 0 && (index === rows.length - 1 ? ' and ' : ', ')}
                                  {label} <ActorLink actor={actor} />
                                </span>
                              ))}
                          </dd>
                        </div>
                      )}
                      <div className="dictionary-attribution-source-row">
                        <dt>Sources</dt>
                        <dd>
                          {[
                            detail.attribution?.term?.source_text
                              ? formatAttributionSource('Term Source', detail.attribution.term.source_text)
                              : '',
                            detail.attribution?.audio?.source
                              ? formatAttributionSource('Audio Source', detail.attribution.audio.source)
                              : '',
                            detail.attribution?.photo?.source
                              ? formatAttributionSource('Image Source', detail.attribution.photo.source)
                              : '',
                          ]
                            .filter(Boolean)
                            .join(', ') || 'No external source notes.'}
                        </dd>
                      </div>
                    </dl>
                    <p className="dictionary-attribution-history-link">
                      <button
                        type="button"
                        className="inline-link-button"
                        onClick={() => setShowRevisionHistory(true)}
                      >
                        See Revision History
                      </button>
                    </p>
                  </section>

                  {flagMessage && <section className="alert ok">{flagMessage}</section>}

                  {(isAdminUser(currentUser) ||
                    canReviseLiveEntries(currentUser) ||
                    (canFlagLiveEntries(currentUser) && detail.review_action?.can_flag_for_rereview)) && (
                    <div className="live-review-entry-actions live-review-entry-actions-spread">
                      {!flagPanelOpen &&
                        (canReviseLiveEntries(currentUser) ||
                          (canFlagLiveEntries(currentUser) &&
                            detail.review_action?.can_flag_for_rereview)) && (
                          <p className="dictionary-revise-link">
                            Think it needs a revision?{' '}
                            {canReviseLiveEntries(currentUser) && detail.header?.entry_id && (
                              <>
                                <button
                                  type="button"
                                  className="inline-link-button"
                                  onClick={() =>
                                    navigate(`${ROUTES.dictionaryDraft}?entry_id=${detail.header.entry_id}`)
                                  }
                                >
                                  Revise it
                                </button>
                                {canFlagLiveEntries(currentUser) &&
                                  detail.review_action?.can_flag_for_rereview &&
                                  ' or '}
                              </>
                            )}
                            {canFlagLiveEntries(currentUser) &&
                              detail.review_action?.can_flag_for_rereview && (
                                <button
                                  type="button"
                                  className="inline-link-button"
                                  onClick={() => setFlagPanelOpen(true)}
                                >
                                  Flag it for re-review!
                                </button>
                              )}
                          </p>
                        )}
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

                  {showRevisionHistory && <RevisionHistorySection history={detail.revision_history} />}
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
