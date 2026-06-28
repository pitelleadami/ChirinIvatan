import { useEffect, useMemo, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

function visibilityLabel(value) {
  if (value === 'members') return 'Members only'
  if (value === 'admin') return 'Review team'
  return 'All stewards'
}

function fileTypeLabel(filename) {
  const extension = String(filename || '')
    .split('.')
    .pop()
    ?.toUpperCase()
  if (!extension || extension === filename) return 'Document'
  if (extension === 'PDF') return 'PDF'
  if (['PPT', 'PPTX', 'PPS', 'PPSX'].includes(extension)) return 'Slides'
  return extension
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ResourcesPage({ currentUser }) {
  const isSignedIn = Boolean(currentUser?.is_authenticated)
  const isAdmin = Boolean(currentUser?.is_superuser || currentUser?.groups?.includes('Admin'))
  const resourceUserKey = isSignedIn
    ? String(currentUser?.username || currentUser?.email || currentUser?.id || 'signed-in')
    : ''
  const [resourceState, setResourceState] = useState({
    userKey: '',
    rows: [],
    error: '',
  })
  const apiBase = import.meta.env.VITE_API_BASE || ''

  useEffect(() => {
    if (!isSignedIn) return undefined
    let isMounted = true
    apiRequest('/api/resources')
      .then((payload) => {
        if (!isMounted) return
        setResourceState({
          userKey: resourceUserKey,
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          error: '',
        })
      })
      .catch((err) => {
        if (!isMounted) return
        setResourceState({
          userKey: resourceUserKey,
          rows: [],
          error: err.message || 'Resources could not be loaded.',
        })
      })
    return () => {
      isMounted = false
    }
  }, [isSignedIn, resourceUserKey])

  const hasLoadedCurrentResources = isSignedIn && resourceState.userKey === resourceUserKey
  const loading = isSignedIn && !hasLoadedCurrentResources
  const error = hasLoadedCurrentResources ? resourceState.error : ''

  const groupedRows = useMemo(() => {
    const groups = new Map()
    const visibleRows = hasLoadedCurrentResources ? resourceState.rows : []
    visibleRows.forEach((row) => {
      const category = row.category || 'General'
      if (!groups.has(category)) groups.set(category, [])
      groups.get(category).push(row)
    })
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }))
  }, [hasLoadedCurrentResources, resourceState.rows])

  return (
    <section className="resources-page">
      <div className="resources-heading">
        <div>
          <h1>Learning Resources</h1>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="ghost compact-button"
            onClick={() => navigate(`${ROUTES.adminApplications}?tab=site&section=resources`)}
          >
            Manage resource files
          </button>
        )}
      </div>

      {!isSignedIn && (
        <section className="empty-state">
          <h2>Log in to view guide files</h2>
          <p>Learning resources are available inside Steward's Desk for approved accounts.</p>
        </section>
      )}

      {loading && <p className="muted">Loading resources...</p>}
      {error && <p className="alert">{error}</p>}

      {isSignedIn && !loading && !error && groupedRows.length === 0 && (
        <section className="empty-state">
          <h2>No resources published yet</h2>
          <p>Published guide files will appear here once an administrator uploads them.</p>
        </section>
      )}

      <div className="resource-group-list">
        {groupedRows.map((group) => (
          <section className="resource-group" key={group.category}>
            <h2>{group.category}</h2>
            <div className="resource-card-list">
              {group.items.map((resource) => {
                const href = `${apiBase}${resource.download_url}`
                return (
                  <article className="resource-card" key={resource.id}>
                    <div>
                      <p className="resource-card-meta">
                        {fileTypeLabel(resource.filename)} · {visibilityLabel(resource.visibility)}
                      </p>
                      <h3>{resource.title}</h3>
                      {resource.description && <p>{resource.description}</p>}
                      <p className="resource-card-date">
                        {resource.filename}
                        {formatDate(resource.updated_at)
                          ? ` · Updated ${formatDate(resource.updated_at)}`
                          : ''}
                      </p>
                    </div>
                    <a className="resource-open-link" href={href} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
