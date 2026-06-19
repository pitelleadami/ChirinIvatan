import { useEffect, useMemo, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from '../lib/siteContent'

const ORG_GROUPS = [
  { key: 'administrators', title: 'Administrators' },
  { key: 'consultants', title: 'Consultants' },
  { key: 'reviewers', title: 'Reviewers' },
  { key: 'contributors', title: 'Contributors' },
]

function memberInitials(member) {
  return String(member.display_name || member.username || 'CI')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function partnerInitials(name) {
  const words = String(name || 'Supporting Organization')
    .split(/\s+/)
    .filter(Boolean)
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
    : (words[0] || 'Supporting Organization').slice(0, 2).toUpperCase()
}

function YaruMemberCard({ member }) {
  return (
    <button
      type="button"
      className="yaru-person-card"
      onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(member.username)}`)}
    >
      {member.profile_photo ? (
        <img
          className="yaru-avatar"
          src={member.profile_photo}
          alt=""
          width="82"
          height="82"
          decoding="async"
        />
      ) : (
        <span className="yaru-avatar-placeholder" aria-hidden="true">
          {memberInitials(member)}
        </span>
      )}
      <strong className="yaru-person-name">{member.display_name || member.username}</strong>
      {member.affiliation && <span className="yaru-person-affiliation">{member.affiliation}</span>}
    </button>
  )
}

export default function YaruPage({ currentUser = {} }) {
  const [content, setContent] = useState(DEFAULT_SITE_CONTENT)
  const [members, setMembers] = useState([])
  const [memberStatus, setMemberStatus] = useState('loading')
  const groups = currentUser.groups || []
  const isAdminUser = currentUser.is_superuser || groups.includes('Admin')
  const canShowJoinNow = !currentUser.is_authenticated || isAdminUser
  const visiblePartnerDetails = content.partner_details.filter(
    (partner) => partner?.name || partner?.logo_url || partner?.url,
  )

  useEffect(() => {
    let ignore = false
    apiRequest('/api/site-content')
      .then((payload) => {
        if (!ignore) setContent(normalizeSiteContent(payload))
      })
      .catch(() => {
        if (!ignore) setContent(DEFAULT_SITE_CONTENT)
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    apiRequest('/api/yaru/members')
      .then((payload) => {
        if (ignore) return
        setMembers(Array.isArray(payload.rows) ? payload.rows : [])
        setMemberStatus('ready')
      })
      .catch(() => {
        if (ignore) return
        setMembers([])
        setMemberStatus('error')
      })
    return () => {
      ignore = true
    }
  }, [])

  const groupedMembers = useMemo(
    () =>
      members.reduce(
        (groups, member) => {
          const key = ORG_GROUPS.some((item) => item.key === member.org_chart_group)
            ? member.org_chart_group
            : member.org_chart_group === 'project_proponent'
              ? 'project_proponent'
              : 'contributors'
          groups[key] = [...(groups[key] || []), member]
          return groups
        },
        { project_proponent: [], administrators: [], consultants: [], reviewers: [], contributors: [] },
      ),
    [members],
  )

  return (
    <>
      <section className="panel about-page yaru-intro">
        <h1>{content.yaru_heading || 'The Digital Yaru'}</h1>
        {content.yaru_intro_paragraphs.map((paragraph, index) => (
          <p key={`yaru-intro-${index}`}>{paragraph}</p>
        ))}
      </section>

      <section className="panel yaru-chart-section">
        {memberStatus === 'loading' && <p className="muted">Loading current stewards...</p>}
        {members.length > 0 && (
          <div className="yaru-chart">
            {groupedMembers.project_proponent.length > 0 && (
              <div className="yaru-lead-column">
                <h3>Project Proponent</h3>
                {groupedMembers.project_proponent.map((member) => (
                  <YaruMemberCard key={member.username} member={member} />
                ))}
              </div>
            )}
            <div className="yaru-chart-rows">
              {ORG_GROUPS.map((group) => {
                const rows = groupedMembers[group.key] || []
                if (!rows.length) return null
                return (
                  <div className="yaru-chart-row" key={group.key}>
                    <h3>{group.title}</h3>
                    <div className="yaru-row-cards">
                      {rows.map((member) => (
                        <YaruMemberCard key={member.username} member={member} />
                      ))}
                      {group.key === 'contributors' && canShowJoinNow && (
                        <button
                          type="button"
                          className="yaru-join-inline-button"
                          onClick={() => navigate(ROUTES.roleCenter)}
                        >
                          Join now
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {memberStatus !== 'loading' && members.length === 0 && (
          <div className="yaru-chart yaru-chart-empty">
            <div className="yaru-lead-column">
              <h3>Project Proponent</h3>
              <p className="yaru-empty-note">Public profile pending.</p>
            </div>
            <div className="yaru-chart-rows">
              {ORG_GROUPS.map((group) => (
                <div className="yaru-chart-row" key={group.key}>
                  <h3>{group.title}</h3>
                  <div className="yaru-row-cards yaru-empty-row">
                    <p className="yaru-empty-note">
                      Profiles will appear here once stewards choose to be listed publicly.
                    </p>
                    {group.key === 'contributors' && canShowJoinNow && (
                      <button
                        type="button"
                        className="yaru-join-inline-button"
                        onClick={() => navigate(ROUTES.roleCenter)}
                      >
                        Join now
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {visiblePartnerDetails.length > 0 && (
        <section className="yaru-partner-section">
          <h2>Supporting Organizations</h2>
          <div className="partner-grid">
            {visiblePartnerDetails.map((partner, index) => (
              <a
                key={`yaru-partner-${index}`}
                className="partner-logo"
                href={partner.url || undefined}
                target={partner.url ? '_blank' : undefined}
                rel={partner.url ? 'noreferrer' : undefined}
              >
                {partner.logo_url ? (
                  <img className="partner-logo-image" src={partner.logo_url} alt="" />
                ) : (
                  <span className="partner-logo-mark" aria-hidden="true">
                    {partnerInitials(partner.name)}
                  </span>
                )}
                <span className="partner-agency-name">{partner.name || 'Supporting Organization'}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
