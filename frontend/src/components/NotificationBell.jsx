import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

import { fetchNotifications, markNotificationsRead } from '../lib/api'
import { navigate } from '../lib/router'

function relativeTime(value) {
  const timestamp = new Date(value).getTime()
  if (!timestamp) return 'Recently'

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export default function NotificationBell({ currentUser }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef(null)
  const isAuthenticated = Boolean(currentUser?.is_authenticated)

  useEffect(() => {
    if (!isAuthenticated) return

    let active = true
    function loadNotifications() {
      fetchNotifications()
        .then((payload) => {
          if (!active) return
          setNotifications(payload.notifications || [])
          setUnreadCount(payload.unread_count || 0)
          setError('')
        })
        .catch(() => {
          if (active) setError('Notifications could not load.')
        })
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') loadNotifications()
    }

    loadNotifications()
    const refreshTimer = window.setInterval(refreshWhenVisible, 60000)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  if (!isAuthenticated) return null

  function togglePanel() {
    setOpen((current) => !current)
  }

  async function markOneRead(item) {
    const wasUnread = !item.is_read
    setError('')

    if (wasUnread) {
      setUnreadCount((count) => Math.max(0, count - 1))
      setNotifications((rows) => rows.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)))
    }

    try {
      if (wasUnread) await markNotificationsRead([item.id])
    } catch {
      if (wasUnread) {
        setUnreadCount((count) => count + 1)
        setNotifications((rows) => rows.map((row) => (row.id === item.id ? { ...row, is_read: false } : row)))
      }
      setError('This notification could not be marked as read.')
    } finally {
      if (item.target_url) {
        setOpen(false)
        navigate(item.target_url)
      }
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || isMarkingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    setIsMarkingAll(true)
    setUnreadCount(0)
    setNotifications((rows) => rows.map((item) => ({ ...item, is_read: true })))
    setError('')

    try {
      await markNotificationsRead()
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      setError('Notifications could not be marked as read.')
    } finally {
      setIsMarkingAll(false)
    }
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={togglePanel}
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="notification-dropdown" aria-label="Recent notifications">
          <header className="notification-dropdown-header">
            <strong>Notifications</strong>
            <button
              type="button"
              className="notification-mark-all"
              disabled={unreadCount === 0 || isMarkingAll}
              onClick={markAllRead}
            >
              {isMarkingAll ? 'Marking...' : unreadCount > 0 ? 'Mark all as read' : 'All read'}
            </button>
          </header>
          {error && <p className="notification-message notification-error">{error}</p>}
          {!error && notifications.length === 0 && (
            <p className="notification-message">
              No notifications yet. New approvals, comments, role decisions, and milestones will appear here.
            </p>
          )}
          {notifications.length > 0 && (
            <div className="notification-list">
              {notifications.map((item) => {
                const content = (
                  <>
                    {!item.is_read && <span className="notification-unread-dot" aria-hidden="true" />}
                    <p>{item.message}</p>
                    <time dateTime={item.created_at}>{relativeTime(item.created_at)}</time>
                  </>
                )

                if (item.target_url || !item.is_read) {
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={
                        item.is_read
                          ? 'notification-item notification-item-link'
                          : 'notification-item notification-item-link unread'
                      }
                      aria-label={`${item.is_read ? '' : 'Unread: '}${item.message}${item.target_url ? '. Open related page' : '. Mark as read'}`}
                      onClick={() => markOneRead(item)}
                    >
                      {content}
                    </button>
                  )
                }

                return (
                  <article key={item.id} className="notification-item">
                    {content}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
