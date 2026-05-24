import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { prepareImageUpload } from '../lib/imageUpload'
import { ROUTES, navigate } from '../lib/router'

const MUNICIPALITIES = ['Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat', 'Not Applicable']

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  municipality: '',
  affiliation: '',
  occupation: '',
  bio: '',
}

export default function ProfileEditPage({ currentUser, onAuthChange }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [photoWarning, setPhotoWarning] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadProfile() {
      setLoading(true)
      setError('')
      try {
        const payload = await apiRequest('/api/profile/my')
        if (ignore) return
        setForm({
          first_name: payload.first_name || '',
          last_name: payload.last_name || '',
          email: payload.email || '',
          municipality: payload.municipality || '',
          affiliation: payload.affiliation || '',
          occupation: payload.occupation || '',
          bio: payload.bio || '',
        })
        setPhotoPreview(payload.profile_photo || '')
      } catch (err) {
        if (!ignore) setError(err.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadProfile()
    return () => {
      ignore = true
    }
  }, [])

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null
    setPhotoWarning('')
    setError('')

    try {
      const prepared = await prepareImageUpload(file, {
        minWidth: 300,
        minHeight: 300,
        maxWidth: 900,
        maxHeight: 900,
      })
      setPhotoFile(prepared.file)
      setPhotoPreview(prepared.previewUrl || '')
      setPhotoWarning(prepared.warning)
    } catch (err) {
      setPhotoFile(null)
      setPhotoPreview('')
      setError(err.message)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setStatus('')

    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => body.append(key, value))
    if (photoFile) body.append('profile_photo', photoFile)

    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/profile/my', {
        method: 'POST',
        body,
      })
      setStatus('Profile updated.')
      setPhotoFile(null)
      setPhotoPreview(payload.profile_photo || photoPreview)
      onAuthChange({
        ...(currentUser || {}),
        is_authenticated: true,
        first_name: payload.first_name,
        last_name: payload.last_name,
        municipality: payload.municipality,
        profile_photo: payload.profile_photo,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!currentUser?.is_authenticated && !loading) {
    return (
      <section className="profile-edit-page">
        <div className="profile-edit-panel">
          <h1>Complete your profile</h1>
          <p className="muted">Log in first so we know which profile to update.</p>
          <button onClick={() => navigate(ROUTES.login)}>Log In</button>
        </div>
      </section>
    )
  }

  return (
    <section className="profile-edit-page">
      <form className="profile-edit-panel" onSubmit={handleSubmit}>
        <div className="section-heading">
          <div>
            <h1>Complete your profile</h1>
            <p className="muted">Add your profile photo, bionote, municipality, and public profile details.</p>
          </div>
          <button type="button" className="ghost" onClick={() => navigate(ROUTES.profileView)}>
            View Public Profile
          </button>
        </div>

        {error && <p className="alert error">{error}</p>}
        {status && <p className="alert ok">{status}</p>}
        {loading && <p className="muted">Loading profile...</p>}

        {!loading && (
          <>
            <div className="profile-edit-layout">
              <aside className="profile-photo-editor">
                {photoPreview ? (
                  <img className="profile-photo-preview" src={photoPreview} alt="" />
                ) : (
                  <div className="profile-photo-preview profile-photo-placeholder" aria-hidden="true">
                    {currentUser?.username?.slice(0, 2).toUpperCase() || 'CI'}
                  </div>
                )}
                <label className="photo-upload-button" htmlFor="profile-photo">
                  Choose Profile Photo
                </label>
                <input id="profile-photo" type="file" accept="image/*" onChange={handlePhotoChange} />
                <p className="hint">JPG, PNG, or WebP works best.</p>
                {photoWarning && <p className="inline-ok">{photoWarning}</p>}
              </aside>

              <div className="profile-fields">
                <div className="field-grid">
                  <label className="field" htmlFor="profile-first-name">
                    <span>First name</span>
                    <input
                      id="profile-first-name"
                      value={form.first_name}
                      onChange={(event) => setField('first_name', event.target.value)}
                    />
                  </label>

                  <label className="field" htmlFor="profile-last-name">
                    <span>Last name</span>
                    <input
                      id="profile-last-name"
                      value={form.last_name}
                      onChange={(event) => setField('last_name', event.target.value)}
                    />
                  </label>
                </div>

                <label className="field" htmlFor="profile-email">
                  <span>Email</span>
                  <input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setField('email', event.target.value)}
                  />
                </label>

                <div className="field-grid">
                  <label className="field" htmlFor="profile-municipality">
                    <span>Municipality</span>
                    <select
                      id="profile-municipality"
                      value={form.municipality}
                      onChange={(event) => setField('municipality', event.target.value)}
                    >
                      <option value="">Select municipality</option>
                      {MUNICIPALITIES.map((municipality) => (
                        <option key={municipality} value={municipality}>
                          {municipality}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field" htmlFor="profile-occupation">
                    <span>Occupation</span>
                    <input
                      id="profile-occupation"
                      value={form.occupation}
                      onChange={(event) => setField('occupation', event.target.value)}
                    />
                  </label>
                </div>

                <label className="field" htmlFor="profile-affiliation">
                  <span>Affiliation</span>
                  <input
                    id="profile-affiliation"
                    value={form.affiliation}
                    onChange={(event) => setField('affiliation', event.target.value)}
                  />
                </label>

                <label className="field" htmlFor="profile-bio">
                  <span>Bionote</span>
                  <textarea
                    id="profile-bio"
                    rows={6}
                    value={form.bio}
                    onChange={(event) => setField('bio', event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button type="button" className="ghost" onClick={() => navigate(ROUTES.home)}>
                Back to Home
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  )
}
