import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'

export default function DictionaryViewerPage() {
  const [entryId, setEntryId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function loadEntry(explicitId = null) {
    const trimmedId = (explicitId || entryId).trim()
    if (!trimmedId) {
      setError('Please enter a dictionary entry UUID.')
      return
    }
    if (trimmedId !== entryId) {
      setEntryId(trimmedId)
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const payload = await apiRequest(`/api/dictionary/entries/${trimmedId}`)
      setResult(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const entryFromQuery = new URLSearchParams(window.location.search).get('entry_id')
    if (entryFromQuery) {
      setEntryId(entryFromQuery)
      loadEntry(entryFromQuery)
    }
    // Run on first mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <section className="panel">
        <h2>Dictionary Entry Viewer</h2>
        <p className="muted">Paste an entry UUID from admin or dashboard payload and load public detail.</p>
        <div className="field">
          <label htmlFor="dictionary-entry-id">Entry UUID</label>
          <input
            id="dictionary-entry-id"
            value={entryId}
            onChange={(event) => setEntryId(event.target.value)}
            placeholder="e.g. 9b9a4ed3-4cb8-48d0-83dc-..."
          />
        </div>
        <button disabled={loading} onClick={loadEntry}>
          {loading ? 'Loading...' : 'Load Entry'}
        </button>
      </section>

      {error && <div className="alert error">{error}</div>}

      {result && (
        <>
          <section className="panel">
            <h3>Header</h3>
            <p className="meta">Term: {result.header?.term}</p>
            <p className="meta">Mother term: {result.header?.mother_term}</p>
            <p className="meta">Status: {result.header?.status}</p>
            <p className="meta">Variant type: {result.header?.variant_type || '-'}</p>
          </section>
          <section className="panel">
            <h3>Semantic Core</h3>
            <pre className="json-block">{JSON.stringify(result.semantic_core, null, 2)}</pre>
          </section>
          <section className="panel">
            <h3>Variant Section</h3>
            <pre className="json-block">{JSON.stringify(result.variant_section, null, 2)}</pre>
          </section>
          <section className="panel">
            <h3>Connected Variants</h3>
            <pre className="json-block">{JSON.stringify(result.connected_variants, null, 2)}</pre>
          </section>
          <section className="panel">
            <h3>Contributors and Attribution</h3>
            <pre className="json-block">
              {JSON.stringify({ contributors: result.contributors, attribution: result.attribution }, null, 2)}
            </pre>
          </section>
        </>
      )}
    </>
  )
}
