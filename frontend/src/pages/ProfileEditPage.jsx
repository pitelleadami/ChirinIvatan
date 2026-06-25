import { useEffect, useRef, useState } from 'react'

import { apiRequest } from '../lib/api'
import { emailValidationMessage } from '../lib/emailValidation'
import { prepareImageUpload } from '../lib/imageUpload'
import { ROUTES, navigate } from '../lib/router'

const MUNICIPALITIES = ['Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat']
const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV']
const EMPTY_CULTURAL_AFFILIATION = { role: '', organization: '' }
const EMPTY_OTHER_AFFILIATION = { designation: '', institution: '' }

const EMPTY_FORM = {
  username: '',
  first_name: '',
  last_name: '',
  name_extension: '',
  post_nominals: '',
  email: '',
  municipality: '',
  affiliation: '',
  occupation: '',
  cultural_affiliations: [{ ...EMPTY_CULTURAL_AFFILIATION }],
  other_affiliations: [{ ...EMPTY_OTHER_AFFILIATION }],
  bio: '',
}

function rowsForEdit(rows, emptyRow) {
  return Array.isArray(rows) && rows.length ? rows : [{ ...emptyRow }]
}

function suffixSelectValue(value) {
  const suffix = String(value || '').trim()
  if (!suffix) return ''
  return SUFFIX_OPTIONS.includes(suffix) ? suffix : 'Other'
}

function SuffixField({ id, value, onChange }) {
  const [otherSelected, setOtherSelected] = useState(false)
  const selectValue = otherSelected ? 'Other' : suffixSelectValue(value)

  function handleSelectChange(event) {
    const nextValue = event.target.value
    if (nextValue === 'Other') {
      setOtherSelected(true)
      if (SUFFIX_OPTIONS.includes(String(value || '').trim())) onChange('')
      return
    }
    setOtherSelected(false)
    onChange(nextValue)
  }

  return (
    <>
      <select id={id} value={selectValue} onChange={handleSelectChange}>
        <option value="">None</option>
        {SUFFIX_OPTIONS.filter(Boolean).map((suffix) => (
          <option key={suffix} value={suffix}>
            {suffix}
          </option>
        ))}
        <option value="Other">Other</option>
      </select>
      {selectValue === 'Other' && (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter suffix" />
      )}
    </>
  )
}

export default function ProfileEditPage({ currentUser, onAuthChange }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [photoWarning, setPhotoWarning] = useState('')
  const redirectTimerRef = useRef(null)

  const isOnboarding = currentUser?.is_authenticated && currentUser?.profile_complete === false

  async function handleSkipOnboarding() {
    try {
      await apiRequest('/api/auth/csrf')
      await apiRequest('/api/profile/onboarding/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      onAuthChange({
        ...(currentUser || {}),
        onboarding_prompt_pending: false,
        onboarding_prompt_dismissed: true,
      })
      navigate(ROUTES.adminApplications)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    let ignore = false

    async function loadProfile() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams(window.location.search)
        const verifiedStatus = params.get('email_verified')
        if (verifiedStatus === '1') {
          setStatus('Email address verified and updated.')
          window.history.replaceState({}, '', ROUTES.profileEdit)
        } else if (verifiedStatus === 'expired') {
          setError('That email verification link has expired. Please save your new email again.')
          window.history.replaceState({}, '', ROUTES.profileEdit)
        } else if (verifiedStatus === 'invalid') {
          setError('That email verification link is no longer valid.')
          window.history.replaceState({}, '', ROUTES.profileEdit)
        }
        const payload = await apiRequest('/api/profile/my')
        if (ignore) return
        setForm({
          username: payload.username || '',
          first_name: payload.first_name || '',
          last_name: payload.last_name || '',
          name_extension: payload.name_extension || '',
          post_nominals: payload.post_nominals || '',
          email: payload.email || '',
          municipality: payload.municipality || '',
          affiliation: payload.affiliation || '',
          occupation: payload.occupation || '',
          cultural_affiliations: rowsForEdit(payload.cultural_affiliations, EMPTY_CULTURAL_AFFILIATION),
          other_affiliations: rowsForEdit(payload.other_affiliations, EMPTY_OTHER_AFFILIATION),
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

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current)
    }
  }, [])

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateAffiliation(group, index, field, value) {
    setForm((current) => ({
      ...current,
      [group]: current[group].map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }))
  }

  function addAffiliation(group) {
    const emptyRow = group === 'cultural_affiliations' ? EMPTY_CULTURAL_AFFILIATION : EMPTY_OTHER_AFFILIATION
    setForm((current) => ({
      ...current,
      [group]: [...current[group], { ...emptyRow }],
    }))
  }

  function removeAffiliation(group, index) {
    const emptyRow = group === 'cultural_affiliations' ? EMPTY_CULTURAL_AFFILIATION : EMPTY_OTHER_AFFILIATION
    setForm((current) => {
      const nextRows = current[group].filter((_, rowIndex) => rowIndex !== index)
      return {
        ...current,
        [group]: nextRows.length ? nextRows : [{ ...emptyRow }],
      }
    })
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
    const emailError = emailValidationMessage(form.email, { required: false })
    if (emailError) {
      setError(emailError)
      setStatus('')
      return
    }

    setSaving(true)
    setError('')
    setStatus('')

    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        body.append(key, JSON.stringify(value))
      } else {
        body.append(key, value)
      }
    })
    if (photoFile) body.append('profile_photo', photoFile)

    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/profile/my', {
        method: 'POST',
        body,
      })
      const pendingEmail = payload.pending_email || ''
      const successMessage = pendingEmail
        ? `Profile saved. Verify ${pendingEmail} before it becomes your account email.`
        : 'Profile saved. Opening public profile...'
      setStatus(successMessage)
      setSaveNotice(
        pendingEmail
          ? 'Profile saved. Check your new email to verify the change.'
          : 'Profile saved. Opening your public profile...',
      )
      setPhotoFile(null)
      setPhotoPreview(payload.profile_photo || photoPreview)
      setForm((current) => ({
        ...current,
        username: payload.username || current.username,
        email: pendingEmail || payload.email || current.email,
      }))
      onAuthChange({
        ...(currentUser || {}),
        is_authenticated: true,
        username: payload.username,
        first_name: payload.first_name,
        last_name: payload.last_name,
        name_extension: payload.name_extension,
        post_nominals: payload.post_nominals,
        email: payload.email,
        municipality: payload.municipality,
        profile_photo: payload.profile_photo,
        profile_complete: Boolean(payload.first_name && payload.last_name && payload.municipality),
        onboarding_prompt_pending: false,
        onboarding_prompt_dismissed: true,
      })
      if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current)
      if (!pendingEmail) {
        redirectTimerRef.current = window.setTimeout(() => {
          navigate(
            `${ROUTES.profileView}?username=${encodeURIComponent(payload.username || currentUser?.username || '')}`,
          )
        }, 2000)
      }
    } catch (err) {
      setError(err.message)
      setSaveNotice('')
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
      {saveNotice && (
        <div className="profile-save-toast" role="status" aria-live="polite">
          {saveNotice}
        </div>
      )}
      <form className="profile-edit-panel" onSubmit={handleSubmit} noValidate>
        <div className="section-heading">
          <div>
            <h1>{isOnboarding ? 'Welcome to Chirin Ivatan!' : 'Edit Profile'}</h1>
            <p className="muted">
              {isOnboarding
                ? 'Set up your public profile so the community knows who you are. You can skip this and do it later.'
                : 'Update your profile photo, bionote, municipality, and public profile details.'}
            </p>
          </div>
          {isOnboarding ? (
            <button type="button" className="ghost" onClick={handleSkipOnboarding}>
              Skip for now
            </button>
          ) : (
            <button type="button" className="ghost" onClick={() => navigate(ROUTES.profileView)}>
              View Public Profile
            </button>
          )}
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

                  <label className="field" htmlFor="profile-name-extension">
                    <span>Suffix</span>
                    <SuffixField
                      id="profile-name-extension"
                      value={form.name_extension}
                      onChange={(value) => setField('name_extension', value)}
                    />
                  </label>

                  <label className="field" htmlFor="profile-post-nominals">
                    <span>Credentials</span>
                    <input
                      id="profile-post-nominals"
                      value={form.post_nominals}
                      onChange={(event) => setField('post_nominals', event.target.value)}
                      placeholder="e.g., PhD, LPT, RPm"
                    />
                  </label>
                </div>

                <div className="field-grid">
                  <label className="field" htmlFor="profile-username">
                    <span>Username</span>
                    <input
                      id="profile-username"
                      autoComplete="username"
                      value={form.username}
                      onChange={(event) => setField('username', event.target.value)}
                    />
                    <small className="muted">Used in your public profile link and login name.</small>
                  </label>

                  <label className="field" htmlFor="profile-email">
                    <span>Email</span>
                    <input
                      id="profile-email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => setField('email', event.target.value)}
                    />
                    <small className="muted">
                      New email addresses must be verified before replacing your current email.
                    </small>
                  </label>

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
                    <small className="muted municipality-helper">
                      Pick origin, residency, or Ivatan-speaking influence. Contributions are credited to this
                      municipality.
                    </small>
                  </label>
                </div>

                <div className="affiliation-editor">
                  <div className="affiliation-editor-heading">
                    <h4>Cultural / Community Affiliation</h4>
                    <button
                      type="button"
                      className="ghost compact-button"
                      onClick={() => addAffiliation('cultural_affiliations')}
                    >
                      Add another
                    </button>
                  </div>
                  {form.cultural_affiliations.map((row, index) => (
                    <div className="affiliation-row" key={`profile-cultural-${index}`}>
                      <label className="field" htmlFor={`profile-cultural-role-${index}`}>
                        {index === 0 && <span>Position / Role</span>}
                        <input
                          id={`profile-cultural-role-${index}`}
                          aria-label="Position / Role"
                          placeholder="e.g., Resident, Member etc."
                          value={row.role}
                          onChange={(event) =>
                            updateAffiliation('cultural_affiliations', index, 'role', event.target.value)
                          }
                        />
                      </label>
                      <label className="field" htmlFor={`profile-cultural-organization-${index}`}>
                        {index === 0 && <span>Agency/ Organization/ Group</span>}
                        <input
                          id={`profile-cultural-organization-${index}`}
                          aria-label="Agency/ Organization/ Group"
                          placeholder="e.g., Brgy. San Antonio, Ivatan Cultural Council, etc."
                          value={row.organization}
                          onChange={(event) =>
                            updateAffiliation(
                              'cultural_affiliations',
                              index,
                              'organization',
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      {form.cultural_affiliations.length > 1 && (
                        <button
                          type="button"
                          className="ghost compact-button"
                          onClick={() => removeAffiliation('cultural_affiliations', index)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="affiliation-editor">
                  <div className="affiliation-editor-heading">
                    <h4>Professional / Other Affiliation</h4>
                    <button
                      type="button"
                      className="ghost compact-button"
                      onClick={() => addAffiliation('other_affiliations')}
                    >
                      Add another
                    </button>
                  </div>
                  {form.other_affiliations.map((row, index) => (
                    <div className="affiliation-row" key={`profile-other-${index}`}>
                      <label className="field" htmlFor={`profile-other-designation-${index}`}>
                        {index === 0 && <span>Position / Role</span>}
                        <input
                          id={`profile-other-designation-${index}`}
                          aria-label="Position / Role"
                          placeholder="e.g., Student, Clerk, etc."
                          value={row.designation}
                          onChange={(event) =>
                            updateAffiliation('other_affiliations', index, 'designation', event.target.value)
                          }
                        />
                      </label>
                      <label className="field" htmlFor={`profile-other-institution-${index}`}>
                        {index === 0 && <span>Agency/ Organization/ Group</span>}
                        <input
                          id={`profile-other-institution-${index}`}
                          aria-label="Agency/ Organization/ Group"
                          placeholder="e.g., Batanes State College, LGU Basco, etc"
                          value={row.institution}
                          onChange={(event) =>
                            updateAffiliation('other_affiliations', index, 'institution', event.target.value)
                          }
                        />
                      </label>
                      {form.other_affiliations.length > 1 && (
                        <button
                          type="button"
                          className="ghost compact-button"
                          onClick={() => removeAffiliation('other_affiliations', index)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>

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
              {(error || status) && (
                <p className={error ? 'profile-save-feedback error' : 'profile-save-feedback ok'}>
                  {error || status}
                </p>
              )}
            </div>
          </>
        )}
      </form>
    </section>
  )
}
