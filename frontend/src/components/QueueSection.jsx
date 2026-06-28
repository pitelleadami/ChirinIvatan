/*
  QueueSection.jsx

  Reusable review queue card list used by reviewer dashboard.
  Receives row data + callbacks from parent page.
*/

import { useEffect, useState } from 'react'

import { folkloreTaxonomyLabel, municipalitySourceLabel } from '../lib/folkloreTaxonomy'
import { formatSourceDisplay } from '../lib/sourceDisplay'

function actionHint(mode, row) {
  if (mode === 'awaiting') {
    return 'Your approval is recorded. This item is read-only for you while it waits for quorum.'
  }
  if (mode === 'published') {
    return 'This entry is already public. Flag only when it needs another review round.'
  }
  if (row.review_round !== undefined) {
    return 'Re-review: two approvals restore the entry; archive or return for fixing takes one reviewer decision.'
  }
  return ''
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function limitWords(value, maxWords = 100) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length <= maxWords) return String(value || '')
  return `${words.slice(0, maxWords).join(' ')}...`
}

function limitPreview(value) {
  return limitWords(value, 18)
}

function displayText(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => displayText(item))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, itemValue]) => String(displayText(itemValue)).trim())
      .map(([key, itemValue]) => `${key}: ${displayText(itemValue)}`)
      .join('; ')
  }
  return String(value)
}

function formatPreviewValue(label, value) {
  const textValue = displayText(value)
  if (['Source', 'Term Source', 'Audio Source', 'Image Source', 'Media Source'].includes(label))
    return formatSourceDisplay(textValue)
  return textValue
}

function isTruthy(value) {
  return value === true || String(value || '').toLowerCase() === 'true'
}

function contributorSourceLabel(row) {
  return (
    row.contributor_display_name ||
    (row.contributor_username ? `@${row.contributor_username}` : 'Contributor')
  )
}

function liveEntryPath(kind, row) {
  if (!row.entry_id) return ''
  return kind === 'dictionary'
    ? `/dictionary-view?entry_id=${encodeURIComponent(row.entry_id)}`
    : `/folklore-view?entry_id=${encodeURIComponent(row.entry_id)}`
}

function canOpenLiveEntry(row) {
  if (!row.entry_id) return false
  if (!row.entry_status) return true
  return ['approved', 'approved_under_review'].includes(row.entry_status)
}

function latestApprovedSnapshot(row) {
  const snapshots = row.revision_log || []
  return snapshots[snapshots.length - 1] || null
}

function normalizedDictionarySnapshotPreview(snapshot = {}) {
  return {
    meaning: snapshot.meaning || '',
    part_of_speech: snapshot.part_of_speech || '',
    phonetic: snapshot.phonetic || '',
    pronunciation: snapshot.pronunciation || snapshot.pronunciation_text || '',
    variant_type: snapshot.variant_type || '',
    example_sentence: snapshot.example_sentence || '',
    example_translation: snapshot.example_translation || '',
    usage_notes: snapshot.usage_notes || '',
    etymology: snapshot.etymology || '',
    english_synonym: snapshot.english_synonym || '',
    ivatan_synonym: snapshot.ivatan_synonym || '',
    english_antonym: snapshot.english_antonym || '',
    ivatan_antonym: snapshot.ivatan_antonym || '',
    inflected_forms: snapshot.inflected_forms || '',
    source: snapshot.source || snapshot.source_text || '',
    audio_source: snapshot.audio_source || '',
    audio_source_is_self_recorded: snapshot.audio_source_is_self_recorded || false,
    photo_source: snapshot.photo_source || '',
    photo_source_is_contributor_owned: snapshot.photo_source_is_contributor_owned || false,
    audio_license: snapshot.audio_license || '',
    photo_license: snapshot.photo_license || '',
    variants: Array.isArray(snapshot.variants) ? snapshot.variants : [],
  }
}

function normalizedFolkloreSnapshotPreview(snapshot = {}) {
  return {
    content: snapshot.content || '',
    municipality_source: snapshot.municipality_source || '',
    source: snapshot.source || '',
    media_source: snapshot.media_source || '',
    copyright_usage: snapshot.copyright_usage || '',
    media_url: snapshot.media_url || '',
  }
}

function previewRows(kind, row, { compact = false } = {}) {
  const preview = row.preview || {}
  const contributorSource = contributorSourceLabel(row)
  const dictionaryAudioSource = isTruthy(preview.audio_source_is_self_recorded)
    ? `Audio Source: ${contributorSource}`
    : preview.audio_source
  const dictionaryPhotoSource = isTruthy(preview.photo_source_is_contributor_owned)
    ? `Photo Source: ${contributorSource}`
    : preview.photo_source
  const rows =
    kind === 'dictionary'
      ? [
          ['Meaning', preview.meaning],
          ['Part of Speech', preview.part_of_speech],
          ['Phonetic', preview.phonetic],
          ['Pronunciation', preview.pronunciation],
          ['Variant', preview.variant_type],
          ['Example', preview.example_sentence],
          ['Translation', preview.example_translation],
          ['Usage Notes', preview.usage_notes],
          ['Etymology', preview.etymology],
          ['English Synonyms', preview.english_synonym],
          ['Ivatan Synonyms', preview.ivatan_synonym],
          ['English Antonyms', preview.english_antonym],
          ['Ivatan Antonyms', preview.ivatan_antonym],
          ['Inflected Forms', preview.inflected_forms],
          ['Term Source', preview.source],
          ['Audio Source', dictionaryAudioSource],
          ['Image Source', dictionaryPhotoSource],
          ['License', [preview.audio_license, preview.photo_license].filter(Boolean).join(' | ')],
        ]
      : [
          ['Category', folkloreTaxonomyLabel(row.category, row.subcategory)],
          ['Municipality', municipalitySourceLabel(preview.municipality_source)],
          ['Content', compact ? preview.content : limitWords(preview.content, 100)],
          ['Source', preview.source],
          ['Media Source', preview.media_source],
          ['License', preview.copyright_usage],
        ]
  return rows
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => {
      const displayValue = formatPreviewValue(label, value)
      return [label, compact ? limitPreview(displayValue) : displayValue]
    })
}

function variantDetailRows(variant) {
  return [
    ['Phonetic', variant.phonetic],
    ['Usage / Etymology', variant.usage_notes],
    ['Sample', variant.example_sentence],
    ['Translation', variant.example_translation],
    ['Audio Source', variant.audio_source],
    ['Historical Note', variant.historical_note],
  ]
    .map(([label, value]) => [label, formatPreviewValue(label, value)])
    .filter(([, value]) => String(value || '').trim())
}

function renderDictionaryVariants(row) {
  const variants = row.preview?.variants || []
  if (!Array.isArray(variants) || variants.length === 0) return null

  return (
    <section className="queue-revision-log">
      <h3>Additional Variants</h3>
      <div className="variant-preview-list">
        {variants.map((variant, index) => (
          <article key={`${variant.term || 'variant'}-${index}`}>
            <strong>{variant.term || `Variant ${index + 1}`}</strong>
            <p className="meta">
              {[variant.variant_type, variant.pronunciation_text, variant.phonetic]
                .filter(Boolean)
                .join(' | ') || 'Details not set'}
            </p>
            {variant.audio_pronunciation_url && (
              <audio className="folklore-audio-player" controls src={variant.audio_pronunciation_url}>
                <track kind="captions" />
              </audio>
            )}
            {variantDetailRows(variant).length > 0 && (
              <dl className="variant-detail-list">
                {variantDetailRows(variant).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function fieldValue(row, key) {
  return row.preview?.[key] || ''
}

function renderQueueDictionaryPreview(row) {
  const meaning = displayText(fieldValue(row, 'meaning')) || 'No meaning provided.'
  const partOfSpeech = displayText(fieldValue(row, 'part_of_speech'))
  const pronunciation = displayText(fieldValue(row, 'pronunciation'))
  const phonetic = displayText(fieldValue(row, 'phonetic'))
  const example = displayText(fieldValue(row, 'example_sentence'))
  const translation = displayText(fieldValue(row, 'example_translation'))
  const usageNotes = displayText(fieldValue(row, 'usage_notes'))
  const etymology = displayText(fieldValue(row, 'etymology'))
  const source = displayText(fieldValue(row, 'source'))
  const contributorSource = contributorSourceLabel(row)
  const audioSource = isTruthy(fieldValue(row, 'audio_source_is_self_recorded'))
    ? `Audio Source: ${contributorSource}`
    : displayText(fieldValue(row, 'audio_source'))
  const photoSource = isTruthy(fieldValue(row, 'photo_source_is_contributor_owned'))
    ? `Photo Source: ${contributorSource}`
    : displayText(fieldValue(row, 'photo_source'))
  const audioLicense = displayText(fieldValue(row, 'audio_license'))
  const photoLicense = displayText(fieldValue(row, 'photo_license'))
  const photoUrl = fieldValue(row, 'photo_url')
  const audioUrl = fieldValue(row, 'audio_pronunciation_url')
  const relatedRows = [
    ['English synonyms', fieldValue(row, 'english_synonym')],
    ['Ivatan synonyms', fieldValue(row, 'ivatan_synonym')],
    ['English antonyms', fieldValue(row, 'english_antonym')],
    ['Ivatan antonyms', fieldValue(row, 'ivatan_antonym')],
    ['Inflected forms', fieldValue(row, 'inflected_forms')],
  ]
    .map(([label, value]) => [label, displayText(value)])
    .filter(([, value]) => String(value || '').trim())

  return (
    <article className="dictionary-entry-detail queue-live-preview queue-dictionary-live-preview">
      <header className="dictionary-headword">
        <h2>{row.term || '(no term)'}</h2>
      </header>
      {photoUrl && <img className="dictionary-photo-preview" src={photoUrl} alt="" />}
      {audioUrl && (
        <audio className="folklore-audio-player" controls src={audioUrl}>
          <track kind="captions" />
        </audio>
      )}
      {(partOfSpeech || pronunciation || phonetic) && (
        <div className="dictionary-pronunciation-line">
          {partOfSpeech && (
            <span>
              <small>Part of speech</small>
              {partOfSpeech}
            </span>
          )}
          {pronunciation && (
            <span>
              <small>Pronunciation</small>
              {pronunciation}
            </span>
          )}
          {phonetic && (
            <span>
              <small>Phonetic</small>
              {phonetic}
            </span>
          )}
        </div>
      )}

      <section className="dictionary-definition">
        <p className="definition-number">1</p>
        <div>
          <p className="definition-label">Meaning</p>
          <p>{meaning}</p>
        </div>
      </section>

      {(example || translation) && (
        <section className="dictionary-field-block">
          <h4>Sample Sentence</h4>
          <div className="example-translation-grid">
            <div>
              <p className="meta">Ivatan</p>
              <p>{example || '-'}</p>
            </div>
            <div>
              <p className="meta">English</p>
              <p>{translation || '-'}</p>
            </div>
          </div>
        </section>
      )}

      {usageNotes && (
        <section className="dictionary-field-block">
          <h4>Usage Notes</h4>
          <p>{usageNotes}</p>
        </section>
      )}
      {etymology && (
        <section className="dictionary-field-block">
          <h4>Etymology</h4>
          <p>{etymology}</p>
        </section>
      )}
      {relatedRows.length > 0 && (
        <section className="dictionary-field-block">
          <h4>Related Words</h4>
          <div className="dictionary-chip-row">
            {relatedRows.map(([label, value]) => (
              <span key={label}>
                {label}: {value}
              </span>
            ))}
          </div>
        </section>
      )}

      {renderDictionaryVariants(row)}

      <section className="dictionary-attribution-block">
        <h4>Attribution</h4>
        <dl className="dictionary-attribution-grid">
          <div>
            <dt>Contributor</dt>
            <dd>
              <a href={`/profile-view?username=${encodeURIComponent(row.contributor_username || '')}`}>
                {row.contributor_display_name || row.contributor_username || 'unknown'}
              </a>
            </dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{row.created_at ? formatDate(row.created_at) : '-'}</dd>
          </div>
          {source && (
            <div className="dictionary-attribution-source-row">
              <dt>Term Source</dt>
              <dd>{formatSourceDisplay(source)}</dd>
            </div>
          )}
          {audioSource && (
            <div className="dictionary-attribution-source-row">
              <dt>Audio Source</dt>
              <dd>{formatSourceDisplay(audioSource)}</dd>
            </div>
          )}
          {photoSource && (
            <div className="dictionary-attribution-source-row">
              <dt>Image Source</dt>
              <dd>{formatSourceDisplay(photoSource)}</dd>
            </div>
          )}
          {(audioLicense || photoLicense) && (
            <div className="dictionary-attribution-source-row">
              <dt>License</dt>
              <dd>{[audioLicense, photoLicense].filter(Boolean).join(' | ')}</dd>
            </div>
          )}
        </dl>
      </section>
    </article>
  )
}

function renderQueueFolklorePreview(row) {
  const preview = row.preview || {}
  const title = row.title || '(no title)'
  const category = folkloreTaxonomyLabel(row.category, row.subcategory) || 'Folklore'
  const municipality = municipalitySourceLabel(preview.municipality_source) || 'Not Applicable'
  const content = preview.content || 'No content provided.'
  const hasHtmlContent = /<\/?[a-z][\s\S]*>/i.test(content)

  return (
    <article className="detail-main draft-folklore-preview queue-live-preview queue-folklore-live-preview">
      <p className="profile-kicker">
        {category} | {municipality}
      </p>
      <h2>{title}</h2>
      {preview.photo_upload_url && (
        <img className="folklore-photo-preview" src={preview.photo_upload_url} alt="" />
      )}
      {preview.audio_upload_url && (
        <audio className="folklore-audio-player" controls src={preview.audio_upload_url}>
          <track kind="captions" />
        </audio>
      )}
      {preview.media_url && (
        <a className="folklore-media-link" href={preview.media_url} target="_blank" rel="noreferrer">
          Open media link
        </a>
      )}
      {hasHtmlContent ? (
        <div className="story-text rte-output" dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <p className="story-text">{content}</p>
      )}
      <div className="folklore-metadata-layout">
        <section className="folklore-attribution-block">
          <h4>Details</h4>
          <div className="folklore-attribution-grid">
            <p>
              <span>Main Category</span>
              <strong>{folkloreTaxonomyLabel(row.category, '') || row.category || '-'}</strong>
            </p>
            <p>
              <span>Subcategory</span>
              <strong>{folkloreTaxonomyLabel('', row.subcategory) || row.subcategory || '-'}</strong>
            </p>
            <p>
              <span>Place</span>
              <strong>{municipality}</strong>
            </p>
          </div>
        </section>
        <section className="folklore-attribution-block">
          <h4>Attribution</h4>
          <div className="folklore-attribution-grid">
            <p>
              <span>Contributor</span>
              <strong>
                <a href={`/profile-view?username=${encodeURIComponent(row.contributor_username || '')}`}>
                  {row.contributor_display_name || row.contributor_username || 'unknown'}
                </a>
              </strong>
            </p>
            {preview.source && (
              <p>
                <span>Source</span>
                <strong>{formatSourceDisplay(preview.source)}</strong>
              </p>
            )}
            {preview.media_source && (
              <p>
                <span>Media</span>
                <strong>{formatSourceDisplay(preview.media_source)}</strong>
              </p>
            )}
            {preview.copyright_usage && (
              <p>
                <span>License</span>
                <strong>{preview.copyright_usage}</strong>
              </p>
            )}
          </div>
        </section>
      </div>
    </article>
  )
}

export default function QueueSection({
  title,
  rows,
  kind,
  mode,
  actionBusyId,
  getNotes,
  setNotes,
  submitDecision,
  rowErrorByRevisionId,
  rowResultByRevisionId,
  previewCloseToken = 0,
}) {
  const [rejectNotesOpenById, setRejectNotesOpenById] = useState({})
  const [flagNotesOpenById, setFlagNotesOpenById] = useState({})
  const [returnOpenById, setReturnOpenById] = useState({})
  const [returnSourceById, setReturnSourceById] = useState({})
  const [returnAssigneeById, setReturnAssigneeById] = useState({})
  const [awaitingOpenById, setAwaitingOpenById] = useState({})
  const [awaitingSectionOpen, setAwaitingSectionOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)
  const isAwaitingSection = mode === 'awaiting'

  // When the parent's result toast is dismissed, close any open preview modal too.
  useEffect(() => {
    const closePreview = window.setTimeout(() => setPreviewItem(null), 0)
    return () => window.clearTimeout(closePreview)
  }, [previewCloseToken])

  function rejectNotesOpen(revisionId) {
    return Boolean(rejectNotesOpenById[revisionId])
  }

  function flagNotesOpen(revisionId) {
    return Boolean(flagNotesOpenById[revisionId])
  }

  function handleReject({ revisionId, kind }) {
    if (!rejectNotesOpen(revisionId)) {
      setRejectNotesOpenById((current) => ({ ...current, [revisionId]: true }))
      return
    }
    submitDecision({ kind, revisionId, decision: 'reject' })
  }

  function handleFlag({ revisionId, kind }) {
    if (!flagNotesOpen(revisionId)) {
      setFlagNotesOpenById((current) => ({ ...current, [revisionId]: true }))
      return
    }
    submitDecision({ kind, revisionId, decision: 'flag' })
  }

  function handleReturn({ revisionId, kind, row }) {
    const latestSnapshot = latestApprovedSnapshot(row)
    if (!returnOpenById[revisionId]) {
      setReturnSourceById((current) => ({
        ...current,
        [revisionId]: latestSnapshot?.revision_id || '',
      }))
      setReturnAssigneeById((current) => ({
        ...current,
        [revisionId]: latestSnapshot?.contributor_username || row.contributor_username || '',
      }))
      setReturnOpenById((current) => ({ ...current, [revisionId]: true }))
      return
    }
    const sourceRevisionId = returnSourceById[revisionId] || latestSnapshot?.revision_id || ''
    const assignedToUsername =
      returnAssigneeById[revisionId] || latestSnapshot?.contributor_username || row.contributor_username || ''
    submitDecision({
      kind,
      revisionId,
      decision: 'return',
      assignedToUsername,
      sourceRevisionId,
    })
  }

  function renderFullPreview() {
    if (!previewItem) return null
    const { row, kind } = previewItem
    const titleText = kind === 'dictionary' ? row.term || '(no term)' : row.title || '(no title)'
    const revisionId = row.revision_id
    const disabled = actionBusyId === revisionId
    const canApprove = mode !== 'published' && mode !== 'awaiting'
    const canReject = mode !== 'published' && mode !== 'awaiting'
    const canReturn = mode === 'rereview'
    const defaultReturnSource = latestApprovedSnapshot(row)
    const selectedReturnSourceId = returnSourceById[revisionId] || defaultReturnSource?.revision_id || ''
    const selectedReturnAssignee =
      returnAssigneeById[revisionId] ||
      defaultReturnSource?.contributor_username ||
      row.contributor_username ||
      ''
    const canFlag = mode === 'published'
    const livePath = liveEntryPath(kind, row)
    const liveEntryAvailable = canOpenLiveEntry(row)
    return (
      <div
        className="celebration-backdrop contribution-preview-backdrop"
        role="presentation"
        onClick={() => setPreviewItem(null)}
      >
        <article
          className="contribution-preview-modal queue-full-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${kind === 'dictionary' ? 'Dictionary term' : 'Folklore entry'} preview: ${titleText}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <p className="profile-kicker">
              {kind === 'dictionary' ? 'Dictionary Term Preview' : 'Folklore Entry Preview'}
            </p>
            <span className={`badge status-${row.status}`}>{row.status}</span>
          </div>
          {kind === 'dictionary' ? renderQueueDictionaryPreview(row) : renderQueueFolklorePreview(row)}
          {row.revision_log?.length > 0 && (
            <section className="queue-revision-log">
              <h3>Approved snapshot log</h3>
              {row.revision_log.map((item) => {
                const snapshot = item.snapshot || {}
                const snapshotRow =
                  kind === 'dictionary'
                    ? {
                        ...row,
                        term: snapshot.term || row.term,
                        preview: normalizedDictionarySnapshotPreview(snapshot),
                      }
                    : {
                        ...row,
                        title: snapshot.title || row.title,
                        category: snapshot.category || row.category,
                        subcategory: snapshot.subcategory || row.subcategory,
                        preview: normalizedFolkloreSnapshotPreview(snapshot),
                      }
                return (
                  <details key={item.revision_id}>
                    <summary>
                      {item.label} · @{item.contributor_username} ·{' '}
                      {formatDate(item.approved_at || item.created_at)}
                    </summary>
                    <dl className="contribution-preview-fields">
                      {previewRows(kind, snapshotRow).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {kind === 'dictionary' && renderDictionaryVariants(snapshotRow)}
                  </details>
                )
              })}
            </section>
          )}
          <details className="technical-details">
            <summary>Technical reference</summary>
            <p className="meta">Revision: {row.revision_id}</p>
            <p className="meta">Entry: {row.entry_id || 'new submission'}</p>
          </details>

          {canReject && rejectNotesOpen(revisionId) && (
            <section className="queue-preview-decision-notes">
              <label className="notes-label" htmlFor={`preview-notes-${revisionId}`}>
                Review notes (required for reject)
              </label>
              <textarea
                id={`preview-notes-${revisionId}`}
                value={getNotes(revisionId)}
                onChange={(event) => setNotes(revisionId, event.target.value)}
                rows={3}
                placeholder={
                  mode === 'rereview'
                    ? 'Explain why this entry must be removed from public use.'
                    : 'Write notes for rejection or reviewer context.'
                }
              />
            </section>
          )}

          {canFlag && flagNotesOpen(revisionId) && (
            <section className="queue-preview-decision-notes">
              <label className="notes-label" htmlFor={`preview-flag-notes-${revisionId}`}>
                Flag notes (required)
              </label>
              <textarea
                id={`preview-flag-notes-${revisionId}`}
                value={getNotes(revisionId)}
                onChange={(event) => setNotes(revisionId, event.target.value)}
                rows={3}
                placeholder="Explain why this published entry needs re-review."
              />
            </section>
          )}

          {canReturn && returnOpenById[revisionId] && (
            <section className="queue-return-panel">
              <label className="field" htmlFor={`preview-return-source-${revisionId}`}>
                <span>Which approved version needs fixing?</span>
                <select
                  id={`preview-return-source-${revisionId}`}
                  value={selectedReturnSourceId}
                  onChange={(event) => {
                    const sourceId = event.target.value
                    const source = row.revision_log?.find((item) => item.revision_id === sourceId)
                    setReturnSourceById((current) => ({ ...current, [revisionId]: sourceId }))
                    if (source?.contributor_username) {
                      setReturnAssigneeById((current) => ({
                        ...current,
                        [revisionId]: source.contributor_username,
                      }))
                    }
                  }}
                >
                  {(row.revision_log || []).map((item) => (
                    <option key={item.revision_id} value={item.revision_id}>
                      {item.label} by @{item.contributor_username}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={`preview-return-assignee-${revisionId}`}>
                <span>Assign correction to</span>
                <select
                  id={`preview-return-assignee-${revisionId}`}
                  value={selectedReturnAssignee}
                  onChange={(event) =>
                    setReturnAssigneeById((current) => ({
                      ...current,
                      [revisionId]: event.target.value,
                    }))
                  }
                >
                  {(row.contributor_options || []).map((username) => (
                    <option key={username} value={username}>
                      @{username}
                    </option>
                  ))}
                </select>
              </label>
              <label className="notes-label" htmlFor={`preview-return-notes-${revisionId}`}>
                Fix instructions (required)
              </label>
              <textarea
                id={`preview-return-notes-${revisionId}`}
                value={getNotes(revisionId)}
                onChange={(event) => setNotes(revisionId, event.target.value)}
                rows={4}
                placeholder="Describe exactly what must be corrected and what evidence should be checked."
              />
            </section>
          )}

          {rowErrorByRevisionId[revisionId] && (
            <p className="inline-error">{rowErrorByRevisionId[revisionId]}</p>
          )}

          {rowResultByRevisionId[revisionId] && (
            <p className="inline-ok">
              Last action: {rowResultByRevisionId[revisionId].decision} | revision status:{' '}
              {rowResultByRevisionId[revisionId].revisionStatus || 'n/a'} | entry status:{' '}
              {rowResultByRevisionId[revisionId].entryStatus || 'n/a'}
            </p>
          )}

          <div className="actions">
            {canApprove && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => submitDecision({ kind, revisionId, decision: 'approve' })}
              >
                Approve
              </button>
            )}
            {canReject && (
              <button
                type="button"
                className="danger"
                disabled={disabled}
                onClick={() => handleReject({ kind, revisionId })}
              >
                {rejectNotesOpen(revisionId)
                  ? mode === 'rereview'
                    ? 'Confirm Archive'
                    : 'Submit Reject'
                  : mode === 'rereview'
                    ? 'Archive Entry'
                    : 'Reject'}
              </button>
            )}
            {canReturn && (
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => handleReturn({ kind, revisionId, row })}
              >
                {returnOpenById[revisionId] ? 'Send to Contributor' : 'Return for Fixing'}
              </button>
            )}
            {canFlag && (
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => handleFlag({ kind, revisionId })}
              >
                {flagNotesOpen(revisionId) ? 'Submit Flag' : 'Flag for re-review'}
              </button>
            )}
            {livePath && liveEntryAvailable && (
              <a className="queue-live-entry-button" href={livePath} target="_blank" rel="noreferrer">
                View live entry
              </a>
            )}
            {livePath && !liveEntryAvailable && (
              <button type="button" className="queue-live-entry-button unavailable" disabled>
                Live entry unavailable
              </button>
            )}
            <button type="button" onClick={() => setPreviewItem(null)}>
              Close
            </button>
          </div>
        </article>
      </div>
    )
  }

  return (
    <section
      className={isAwaitingSection ? 'review-queue-panel review-queue-panel-awaiting' : 'review-queue-panel'}
    >
      {renderFullPreview()}
      {isAwaitingSection ? (
        <button
          type="button"
          className="queue-section-toggle"
          aria-expanded={awaitingSectionOpen}
          onClick={() => setAwaitingSectionOpen((current) => !current)}
        >
          <h2>{title}</h2>
          <span className="queue-section-toggle-end">
            <span className="badge">{rows.length}</span>
            <span className="queue-awaiting-chevron" aria-hidden="true">
              {awaitingSectionOpen ? '−' : '+'}
            </span>
          </span>
        </button>
      ) : (
        <div className="queue-section-heading">
          <h2>{title}</h2>
          <span className="badge">{rows.length}</span>
        </div>
      )}
      {(!isAwaitingSection || awaitingSectionOpen) && rows.length === 0 && (
        <p className="muted queue-empty-message">No items in this queue.</p>
      )}
      {(!isAwaitingSection || awaitingSectionOpen) &&
        rows.map((row) => {
          const revisionId = row.revision_id
          const isAwaiting = mode === 'awaiting'
          const awaitingOpen = Boolean(awaitingOpenById[revisionId])
          const titleText = kind === 'dictionary' ? row.term || '(no term)' : row.title || '(no title)'
          return (
            <article
              className={isAwaiting ? 'queue-card queue-card-awaiting' : 'queue-card'}
              key={revisionId}
            >
              {isAwaiting ? (
                <button
                  type="button"
                  className="queue-awaiting-toggle"
                  aria-expanded={awaitingOpen}
                  onClick={() =>
                    setAwaitingOpenById((current) => ({
                      ...current,
                      [revisionId]: !current[revisionId],
                    }))
                  }
                >
                  <span>
                    <strong>{titleText}</strong>
                    <small>Your approval is recorded · {row.quorum_requirement}</small>
                  </span>
                  <span className="queue-awaiting-toggle-end">
                    <span className={`badge status-${row.status}`}>{row.status}</span>
                    <span className="queue-awaiting-chevron" aria-hidden="true">
                      {awaitingOpen ? '−' : '+'}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="queue-header">
                  <strong className="queue-title">{titleText}</strong>
                  <span className={`badge status-${row.status}`}>{row.status}</span>
                </div>
              )}

              {(!isAwaiting || awaitingOpen) && (
                <>
                  <p className="meta">
                    By @{row.contributor_username}
                    {row.created_at ? ` | submitted ${formatDate(row.created_at)}` : ''}
                    {row.approved_at ? ` | approved ${formatDate(row.approved_at)}` : ''}
                  </p>
                  {row.entry_status && <p className="meta">Entry status: {row.entry_status}</p>}
                  {row.review_round !== undefined && <p className="meta">Round: {row.review_round}</p>}
                  {actionHint(mode, row) && <p className="hint">{actionHint(mode, row)}</p>}
                  {row.flag_notes && (
                    <p className="queue-flag-reason">
                      <strong>Flag reason:</strong> {row.flag_notes}
                    </p>
                  )}
                </>
              )}
              {isAwaiting && awaitingOpen && (
                <div className="queue-quorum-status" role="status">
                  <strong>Awaiting quorum</strong>
                  <span>
                    {row.reviewer_approvals || 0} reviewer approval
                    {row.reviewer_approvals === 1 ? '' : 's'} · {row.admin_approvals || 0} admin approval
                    {row.admin_approvals === 1 ? '' : 's'}
                  </span>
                  <small>{row.quorum_requirement}</small>
                </div>
              )}

              {(!isAwaiting || awaitingOpen) && previewRows(kind, row).length > 0 && (
                <dl className="queue-preview-list">
                  {previewRows(kind, row, { compact: true }).map(([label, value]) => (
                    <div key={label} className="queue-preview-row">
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {(!isAwaiting || awaitingOpen) && liveEntryPath(kind, row) && canOpenLiveEntry(row) && (
                <p className="queue-detail-link-row">
                  <a
                    className="queue-live-entry-text-link"
                    href={liveEntryPath(kind, row)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View live entry
                  </a>
                </p>
              )}

              {(!isAwaiting || awaitingOpen) && (
                <details className="technical-details">
                  <summary>Technical reference</summary>
                  <p className="meta">Revision: {revisionId}</p>
                  <p className="meta">Entry: {row.entry_id || 'new submission'}</p>
                </details>
              )}

              {rowErrorByRevisionId[revisionId] && (
                <p className="inline-error">{rowErrorByRevisionId[revisionId]}</p>
              )}

              {rowResultByRevisionId[revisionId] && (
                <p className="inline-ok">
                  Last action: {rowResultByRevisionId[revisionId].decision} | revision status:{' '}
                  {rowResultByRevisionId[revisionId].revisionStatus || 'n/a'} | entry status:{' '}
                  {rowResultByRevisionId[revisionId].entryStatus || 'n/a'}
                </p>
              )}
              {!isAwaiting && (
                <div className="queue-card-actions">
                  <button type="button" onClick={() => setPreviewItem({ row, kind })}>
                    Review
                  </button>
                </div>
              )}
            </article>
          )
        })}
    </section>
  )
}
