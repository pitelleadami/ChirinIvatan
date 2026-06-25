import { useEffect, useMemo, useState } from 'react'

import ConfirmDialog from '../components/ConfirmDialog'
import TurnstileWidget from '../components/TurnstileWidget'
import { apiRequest } from '../lib/api'
import { emailValidationMessage } from '../lib/emailValidation'
import { DEFAULT_FAQ_SECTIONS, ensureCoreFaqSections } from '../lib/faqContent'
import { folkloreTaxonomyLabel } from '../lib/folkloreTaxonomy'
import { prepareImageUpload } from '../lib/imageUpload'
import { ROUTES, navigate } from '../lib/router'
import {
  DEFAULT_SITE_CONTENT,
  normalizeSiteContent,
  paragraphsToText,
  textToParagraphs,
} from '../lib/siteContent'
import ReviewerDashboardPage from './ReviewerDashboardPage'
import ResourcesPage from './ResourcesPage'

const STATUSES = ['pending', 'awaiting_quorum', 'approved', 'rejected', 'all']
const STATUS_LABELS = {
  pending: 'Pending',
  awaiting_quorum: 'Awaiting Quorum',
  approved: 'Approved',
  rejected: 'Rejected',
  all: 'All',
}
const USER_GROUPS = ['all', 'Admin', 'Consultant', 'Reviewer', 'Contributor']
const INVITE_ROLES = ['contributor', 'reviewer', 'consultant', 'admin']
const INVITE_ENDORSEMENTS = {
  contributor:
    'I understand that inviting someone to Chirin Ivatan is an act of trust and accountability. I believe this person will contribute respectfully, honestly, and in good faith toward the preservation of Ivatan language and folklore.',
  reviewer:
    'I believe this individual possesses the judgment, integrity, and cultural sensitivity necessary to help review and safeguard community knowledge.',
  consultant:
    'I understand that inviting someone to Chirin Ivatan is an act of trust and accountability. I believe this person will contribute respectfully, honestly, and in good faith toward the preservation of Ivatan language and folklore.',
  admin:
    'I understand that inviting someone to Chirin Ivatan is an act of trust and accountability. I believe this person will contribute respectfully, honestly, and in good faith toward the preservation of Ivatan language and folklore.',
}
const REVOKABLE_ROLES = ['contributor', 'reviewer', 'consultant', 'admin']
const CONTRIBUTIONS_PER_PAGE = 5
const APPLICATIONS_PER_PAGE = 5
const MOBILE_PEOPLE_PER_PAGE = 5
const INVITATIONS_PER_PAGE = 8
const MOBILE_INVITATIONS_PER_PAGE = 4
const DESK_TABS = [
  'overview',
  'reviews',
  'applications',
  'people',
  'archive',
  'site',
  'resources',
  'contributions',
]
const EMPTY_ARCHIVE_INVENTORY = {
  archived: [],
  counts: { archived: 0 },
}
const EMPTY_ADMIN_OVERVIEW = {
  counts: {
    users: 0,
    contributors: 0,
    reviewers: 0,
    approved_entries: 0,
    pending_entries: 0,
  },
  queues: {
    pending_role_applications: 0,
    pending_dictionary_reviews: 0,
    pending_folklore_reviews: 0,
    entries_under_re_review: 0,
    dictionary_under_re_review: 0,
    folklore_under_re_review: 0,
    pending_account_flags: 0,
  },
  maintenance: {
    enabled: false,
    message: '',
    updated_at: null,
    updated_by: '',
  },
  latest_submissions: [],
  latest_media_uploads: [],
  recent_admin_overrides: [],
}
const EMPTY_SUPPORT_STATEMENT = { quote: '', name: '', role: '' }
const EMPTY_PARTNER_DETAIL = { name: '', url: '', logo_url: '' }
const FAQ_ROLE_OPTIONS = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'admin', label: 'Admin' },
]
const EMPTY_FAQ_ITEM = { q: '', a: '', bullets_text: '', image_url: '', image_alt: '' }
const EMPTY_FAQ_SECTION = {
  id: '',
  title: '',
  intro: '',
  roles: FAQ_ROLE_OPTIONS.map((role) => role.value),
  items: [{ ...EMPTY_FAQ_ITEM }],
}
const EMPTY_RESOURCE_FORM = {
  title: '',
  description: '',
  category: '',
  visibility: 'public',
  is_published: true,
  file: null,
}
const CONTRIBUTION_STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Submitted for review',
  approved: 'Approved',
  rejected: 'Needs changes',
}
const SITE_CONTENT_SECTIONS = [
  {
    id: 'brand',
    eyebrow: 'Site Identity',
    title: 'Brand & Landing',
    description: 'Update the logo, brand name, landing introduction, and footer text.',
  },
  {
    id: 'maintenance',
    eyebrow: 'Operations',
    title: 'Site Access Mode',
    description: 'Open the site, restore the beta lock, or pause public access.',
  },
  {
    id: 'about',
    eyebrow: 'Public Page',
    title: 'About Page',
    description: 'Edit the project introduction, rationale, future direction, and closing quote.',
  },
  {
    id: 'yaru',
    eyebrow: 'Public Page',
    title: 'Digital Yaru',
    description: 'Change the heading and introduction shown on the Digital Yaru page.',
  },
  {
    id: 'support',
    eyebrow: 'About Page',
    title: 'Support Statements',
    description: 'Manage public statements from supporters and supporting organizations.',
  },
  {
    id: 'partners',
    eyebrow: 'About Page',
    title: 'Supporting Organizations',
    description: 'Update supporting organization names, logos, and links.',
  },
  {
    id: 'faq',
    eyebrow: 'Help Center',
    title: 'FAQs and Guides',
    description: 'Edit role-specific help sections, questions, answers, and images.',
  },
  {
    id: 'resources',
    eyebrow: 'Help Center',
    title: 'Guide Files',
    description: 'Upload PDFs and presentation files shown on the public Resources page.',
  },
  {
    id: 'policies',
    eyebrow: 'Governance',
    title: 'Policies & Consent',
    description: 'Edit the privacy notice, media upload policy, and contributor agreement text.',
  },
]

function displayName(applicant) {
  const fullName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ').trim()
  const postNominals = applicant.post_nominals || applicant.profile?.post_nominals || ''
  const baseName = fullName || applicant.username
  return baseName && postNominals ? `${baseName}, ${postNominals}` : baseName || postNominals
}

function isTruthy(value) {
  return value === true || String(value || '').toLowerCase() === 'true'
}

function contributionSourceLabel(contribution) {
  return (
    contribution.contributor_display_name ||
    (contribution.contributor_username ? `@${contribution.contributor_username}` : 'Contributor')
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function sortNewestFirst(rows) {
  return [...rows].sort((a, b) => {
    const firstDate = new Date(a.updated_at || a.created_at || 0).getTime()
    const secondDate = new Date(b.updated_at || b.created_at || 0).getTime()
    return secondDate - firstDate
  })
}

function contributionPageCount(rows) {
  return Math.max(1, Math.ceil(rows.length / CONTRIBUTIONS_PER_PAGE))
}

function pagedContributions(rows, page) {
  const start = (page - 1) * CONTRIBUTIONS_PER_PAGE
  return rows.slice(start, start + CONTRIBUTIONS_PER_PAGE)
}

function applicationPageCount(rows) {
  return Math.max(1, Math.ceil(rows.length / APPLICATIONS_PER_PAGE))
}

function pagedApplications(rows, page) {
  const start = (page - 1) * APPLICATIONS_PER_PAGE
  return rows.slice(start, start + APPLICATIONS_PER_PAGE)
}

function peoplePageCount(rows) {
  return Math.max(1, Math.ceil(rows.length / MOBILE_PEOPLE_PER_PAGE))
}

function pagedPeople(rows, page) {
  const start = (page - 1) * MOBILE_PEOPLE_PER_PAGE
  return rows.slice(start, start + MOBILE_PEOPLE_PER_PAGE)
}

function invitationPageCount(rows, pageSize = INVITATIONS_PER_PAGE) {
  return Math.max(1, Math.ceil(rows.length / pageSize))
}

function pagedInvitations(rows, page, pageSize = INVITATIONS_PER_PAGE) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

function isReturnedCorrection(row) {
  return row.status === 'draft' && row.correction_assignment?.status === 'open'
}

function contributionDisplayStatus(row) {
  if (isReturnedCorrection(row)) return 'rejected'
  return row.status
}

function filterContributionsByTab(rows, tab) {
  if (tab === 'drafts') return rows.filter((row) => contributionDisplayStatus(row) === 'draft')
  if (tab === 'submitted') return rows.filter((row) => contributionDisplayStatus(row) === 'pending')
  if (tab === 'approved') return rows.filter((row) => contributionDisplayStatus(row) === 'approved')
  if (tab === 'rejected') return rows.filter((row) => contributionDisplayStatus(row) === 'rejected')
  return rows
}

function preferredContributionTab({ rejected, drafts, approved, submitted }) {
  if (rejected.length) return 'rejected'
  if (drafts.length) return 'drafts'
  if (approved.length) return 'approved'
  if (submitted.length) return 'submitted'
  return 'drafts'
}

function contributionStatusLabel(status) {
  return CONTRIBUTION_STATUS_LABELS[status] || status || 'Unknown'
}

function resourceVisibilityLabel(value) {
  if (value === 'members') return 'Members only'
  if (value === 'admin') return 'Review team'
  return 'All stewards'
}

function resourceStatusLabel(resource) {
  return resource.is_published ? 'Published' : 'Hidden'
}

function contributionStatusDetail(row) {
  if (isReturnedCorrection(row)) return `Returned for updates ${formatDate(row.updated_at || row.created_at)}`
  const status = contributionDisplayStatus(row)
  if (status === 'draft') return `Saved as draft ${formatDate(row.updated_at || row.created_at)}`
  if (status === 'pending')
    return `Submitted for reviewer validation ${formatDate(row.updated_at || row.created_at)}`
  if (status === 'approved') return `Approved ${formatDate(row.updated_at || row.created_at)}`
  if (status === 'rejected') return `Returned for updates ${formatDate(row.updated_at || row.created_at)}`
  return `Last updated ${formatDate(row.updated_at || row.created_at)}`
}

function splitList(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseStructuredValue(value) {
  if (!value) return value
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
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

function roleLabel(value) {
  if (value === 'admin') return 'Admin'
  if (value === 'consultant') return 'Consultant'
  return value === 'reviewer' ? 'Reviewer' : 'Contributor'
}

function userRoleSet(person) {
  return new Set(person?.groups || [])
}

function revokableRolesForPerson(person) {
  const groups = userRoleSet(person)
  return REVOKABLE_ROLES.filter((role) => {
    if (role === 'admin') return groups.has('Admin') || person?.is_superuser
    return groups.has(roleLabel(role))
  })
}

function preferredRoleToRevoke(person) {
  const roles = revokableRolesForPerson(person)
  return (
    ['reviewer', 'consultant', 'admin', 'contributor'].find((role) => roles.includes(role)) || 'contributor'
  )
}

function revokeRoleButtonLabel(role) {
  if (role === 'reviewer') return 'Demote to Contributor'
  return `Revoke ${roleLabel(role)} Access`
}

const EMPTY_EMAIL_INVITE = {
  email: '',
  role: 'contributor',
  notes: '',
}
const EMPTY_CONSULTANT_PROFILE = {
  first_name: '',
  last_name: '',
  email: '',
  municipality: '',
  post_nominals: '',
  occupation: '',
  cultural_affiliations: [{ role: '', organization: '' }],
  other_affiliations: [{ designation: '', institution: '' }],
  bio: '',
  notes: '',
}

function rowsForSiteEditor(rows, emptyRow) {
  return Array.isArray(rows) && rows.length ? rows : [{ ...emptyRow }]
}

function isManagedConsultant(person) {
  return Boolean(
    person?.groups?.includes('Consultant') &&
    person?.onboarding_records?.some(
      (record) => record.role === 'consultant' && record.method === 'admin_created',
    ),
  )
}

function faqSectionsForEditor(rows) {
  const sourceRows = ensureCoreFaqSections(Array.isArray(rows) && rows.length ? rows : DEFAULT_FAQ_SECTIONS)
  return sourceRows.map((section, sectionIndex) => ({
    id: section.id || `faq-section-${sectionIndex + 1}`,
    title: section.title || '',
    intro: section.intro || '',
    roles:
      Array.isArray(section.roles) && section.roles.length
        ? section.roles.filter((role) => FAQ_ROLE_OPTIONS.some((option) => option.value === role))
        : FAQ_ROLE_OPTIONS.map((role) => role.value),
    items: rowsForSiteEditor(section.items, EMPTY_FAQ_ITEM).map((item) => ({
      q: item.q || '',
      a: item.a || '',
      bullets_text: paragraphsToText(item.bullets || []),
      image_url: item.image_url || '',
      image_alt: item.image_alt || '',
    })),
  }))
}

function siteContentToForm(payload) {
  const content = normalizeSiteContent(payload)
  return {
    brand_name: content.brand_name || '',
    brand_logo_url: content.brand_logo_url || '',
    landing_intro_text: content.landing_intro_text || '',
    landing_body_text: content.landing_body_text || '',
    footer_left_text: content.footer_left_text || '',
    footer_center_text: content.footer_center_text || '',
    footer_right_text: content.footer_right_text || '',
    about_heading: content.about_heading || '',
    about_intro_text: paragraphsToText(content.about_intro_paragraphs),
    about_body_text: paragraphsToText(content.about_body_paragraphs),
    about_rationale_text: paragraphsToText(content.about_rationale_paragraphs),
    about_future_text: paragraphsToText(content.about_future_paragraphs),
    about_final_quote: content.about_final_quote || '',
    yaru_heading: content.yaru_heading || '',
    yaru_intro_text: paragraphsToText(content.yaru_intro_paragraphs),
    privacy_notice_text: paragraphsToText(content.privacy_notice_paragraphs),
    media_upload_policy_text: paragraphsToText(content.media_upload_policy_paragraphs),
    contributor_agreement_text: paragraphsToText(content.contributor_agreement_paragraphs),
    support_statements: rowsForSiteEditor(content.support_statements, EMPTY_SUPPORT_STATEMENT),
    partner_details: rowsForSiteEditor(content.partner_details, EMPTY_PARTNER_DETAIL).map((row) => ({
      name: row.name || '',
      url: row.url || '',
      logo_url: row.logo_url || '',
    })),
    faq_sections: faqSectionsForEditor(content.faq_sections),
    beta_locked: Boolean(content.beta_locked),
    maintenance_enabled: Boolean(content.maintenance_enabled),
    maintenance_message: content.maintenance_message || '',
  }
}

function siteContentFromForm(form) {
  return {
    brand_name: form.brand_name,
    brand_logo_url: form.brand_logo_url,
    landing_intro_text: form.landing_intro_text,
    landing_body_text: form.landing_body_text,
    footer_left_text: form.footer_left_text,
    footer_center_text: form.footer_center_text,
    footer_right_text: form.footer_right_text,
    about_heading: form.about_heading,
    about_intro_paragraphs: textToParagraphs(form.about_intro_text),
    about_body_paragraphs: textToParagraphs(form.about_body_text),
    about_rationale_paragraphs: textToParagraphs(form.about_rationale_text),
    about_future_paragraphs: textToParagraphs(form.about_future_text),
    about_final_quote: form.about_final_quote,
    yaru_heading: form.yaru_heading,
    yaru_intro_paragraphs: textToParagraphs(form.yaru_intro_text),
    privacy_notice_paragraphs: textToParagraphs(form.privacy_notice_text),
    media_upload_policy_paragraphs: textToParagraphs(form.media_upload_policy_text),
    contributor_agreement_paragraphs: textToParagraphs(form.contributor_agreement_text),
    maintenance_enabled: Boolean(form.maintenance_enabled),
    maintenance_message: form.maintenance_message,
    support_statements: form.support_statements
      .map((row) => ({
        quote: row.quote.trim(),
        name: row.name.trim(),
        role: row.role.trim(),
      }))
      .filter((row) => row.quote || row.name || row.role),
    partner_details: form.partner_details
      .map((row) => ({
        name: row.name.trim(),
        url: row.url.trim(),
        logo_url: row.logo_url.trim(),
      }))
      .filter((row) => row.name || row.url || row.logo_url),
    faq_sections: form.faq_sections
      .map((section, sectionIndex) => ({
        id: (section.id || `faq-section-${sectionIndex + 1}`).trim(),
        title: section.title.trim(),
        intro: section.intro.trim(),
        roles: section.roles.length ? section.roles : FAQ_ROLE_OPTIONS.map((role) => role.value),
        items: section.items
          .map((item) => ({
            q: item.q.trim(),
            a: item.a.trim(),
            bullets: textToParagraphs(item.bullets_text),
            image_url: item.image_url.trim(),
            image_alt: item.image_alt.trim(),
          }))
          .filter((item) => item.q || item.a || item.bullets.length || item.image_url),
      }))
      .filter((section) => section.title || section.intro || section.items.length),
  }
}

function approvalProgress(application) {
  const approvals = application.decisions.filter((row) => row.decision === 'approve')
  const reviewerApprovals = approvals.filter((row) => row.decider_role === 'reviewer').length
  const adminApprovals = approvals.filter((row) => row.decider_role === 'admin').length
  if (application.status === 'approved') return 'Approved and role access is active.'
  if (application.status === 'rejected') return 'Rejected. Applicant can reapply later with clearer context.'
  if (approvals.length >= 2) return 'Approval quorum met. Waiting for refresh.'
  if (reviewerApprovals === 1)
    return 'One reviewer approval recorded. Needs one more reviewer/admin approval.'
  if (adminApprovals === 1) return 'One admin approval recorded. Needs one more reviewer/admin approval.'
  return 'Needs two reviewer/admin approvals.'
}

function applicationStatusDisplay(application) {
  if (application.screening_status === 'awaiting_quorum') {
    return {
      label: 'Awaiting final approval',
      className: 'status-awaiting',
    }
  }
  return {
    label: application.status,
    className: `status-${application.status}`,
  }
}

function ApplicantAvatar({ applicant }) {
  const profilePhoto = applicant.profile_photo || applicant.profile?.profile_photo
  if (profilePhoto) {
    return <img className="admin-app-avatar" src={profilePhoto} alt="" />
  }
  return (
    <div className="admin-app-avatar admin-app-avatar-fallback" aria-hidden="true">
      {applicant.username.slice(0, 2).toUpperCase()}
    </div>
  )
}

function affiliationText(rows, firstKey, secondKey) {
  return (rows || [])
    .map((row) => [row?.[firstKey], row?.[secondKey]].filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('; ')
}

export default function AdminApplicationsPage({ currentUser, onAuthChange }) {
  const userGroups = currentUser?.groups || []
  const isAdmin = currentUser?.is_superuser || userGroups.includes('Admin')
  const isConsultant = userGroups.includes('Consultant')
  const isReviewer = userGroups.includes('Reviewer')
  const canReviewRoles = isAdmin || isReviewer || isConsultant
  const isAuthenticated = Boolean(currentUser?.is_authenticated)
  const inviteRoleOptions = useMemo(
    () => (isAdmin ? INVITE_ROLES : INVITE_ROLES.filter((role) => !['consultant', 'admin'].includes(role))),
    [isAdmin],
  )
  function tabFromQuery() {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    return DESK_TABS.includes(requestedTab) ? requestedTab : ''
  }

  function normalizeDeskTab(requestedTab) {
    if (isAdmin) return requestedTab || 'overview'
    if (canReviewRoles) {
      return ['applications', 'reviews', 'resources', 'contributions'].includes(requestedTab)
        ? requestedTab
        : 'reviews'
    }
    return requestedTab === 'resources' ? 'resources' : 'contributions'
  }

  const initialRequestedTab = tabFromQuery()
  const initialTab = normalizeDeskTab(initialRequestedTab)
  const initialWelcomePrompt = new URLSearchParams(window.location.search).get('welcome') === 'onboarding'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(initialWelcomePrompt)
  const [dismissingOnboardingPrompt, setDismissingOnboardingPrompt] = useState(false)
  const [adminOverview, setAdminOverview] = useState(EMPTY_ADMIN_OVERVIEW)
  const [reviewRefreshToken, setReviewRefreshToken] = useState(0)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [applications, setApplications] = useState([])
  const [applicationPage, setApplicationPage] = useState(1)
  const [people, setPeople] = useState([])
  const [peoplePage, setPeoplePage] = useState(1)
  const [archiveInventory, setArchiveInventory] = useState(EMPTY_ARCHIVE_INVENTORY)
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveActionTarget, setArchiveActionTarget] = useState(null)
  const [archiveActionNotes, setArchiveActionNotes] = useState('')
  const [selectedActivityUser, setSelectedActivityUser] = useState(null)
  const [activityRows, setActivityRows] = useState([])
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [showEmailLog, setShowEmailLog] = useState(false)
  const [showAccountControls, setShowAccountControls] = useState(false)
  const [invitations, setInvitations] = useState([])
  const [invitationPage, setInvitationPage] = useState(1)
  const [isMobileInviteList, setIsMobileInviteList] = useState(false)
  const [isMobilePeopleList, setIsMobilePeopleList] = useState(false)
  const [dictionaryDrafts, setDictionaryDrafts] = useState([])
  const [folkloreDrafts, setFolkloreDrafts] = useState([])
  const [dictionaryPublished, setDictionaryPublished] = useState([])
  const [folklorePublished, setFolklorePublished] = useState([])
  const [siteContentForm, setSiteContentForm] = useState(() => siteContentToForm(DEFAULT_SITE_CONTENT))
  const [activeSiteContentSection, setActiveSiteContentSection] = useState('')
  const [resourceRows, setResourceRows] = useState([])
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE_FORM)
  const [editingResourceId, setEditingResourceId] = useState('')
  const [dictionaryContributionTab, setDictionaryContributionTab] = useState('rejected')
  const [folkloreContributionTab, setFolkloreContributionTab] = useState('rejected')
  const [dictionaryContributionPage, setDictionaryContributionPage] = useState(1)
  const [folkloreContributionPage, setFolkloreContributionPage] = useState(1)
  const [viewingContribution, setViewingContribution] = useState(null)
  const [confirmingDraftDelete, setConfirmingDraftDelete] = useState(null)
  const [confirmingSiteContentSave, setConfirmingSiteContentSave] = useState(false)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleGroup, setPeopleGroup] = useState('all')
  const [notesById, setNotesById] = useState({})
  const [rejectNotesOpenById, setRejectNotesOpenById] = useState({})
  const [applicationOpenById, setApplicationOpenById] = useState({})
  const [applicationActionErrorById, setApplicationActionErrorById] = useState({})
  const [applicationDecisionToast, setApplicationDecisionToast] = useState(null)
  const [emailInvite, setEmailInvite] = useState(EMPTY_EMAIL_INVITE)
  const [emailInviteNotice, setEmailInviteNotice] = useState(null)
  const [inviteErrorTarget, setInviteErrorTarget] = useState('')
  const [emailInviteTurnstileToken, setEmailInviteTurnstileToken] = useState('')
  const [inviteEndorsementAccepted, setInviteEndorsementAccepted] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [consultantProfile, setConsultantProfile] = useState(EMPTY_CONSULTANT_PROFILE)
  const [consultantPhotoFile, setConsultantPhotoFile] = useState(null)
  const [consultantPhotoPreview, setConsultantPhotoPreview] = useState('')
  const [consultantPhotoWarning, setConsultantPhotoWarning] = useState('')
  const [editingConsultantUsername, setEditingConsultantUsername] = useState('')
  const [showConsultantProfileForm, setShowConsultantProfileForm] = useState(false)
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [loadingArchive, setLoadingArchive] = useState(false)
  const [savingArchiveAction, setSavingArchiveAction] = useState(false)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [loadingInvitations, setLoadingInvitations] = useState(false)
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [loadingSiteContent, setLoadingSiteContent] = useState(false)
  const [loadingResources, setLoadingResources] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [creatingConsultantProfile, setCreatingConsultantProfile] = useState(false)
  const [savingSiteMode, setSavingSiteMode] = useState(false)
  const [savingSiteContent, setSavingSiteContent] = useState(false)
  const [savingResource, setSavingResource] = useState(false)
  const [deletingResourceId, setDeletingResourceId] = useState('')
  const [uploadingFaqImageKey, setUploadingFaqImageKey] = useState('')
  const [uploadingPartnerLogoIndex, setUploadingPartnerLogoIndex] = useState(-1)
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false)
  const [updatingLeaderboardUsername, setUpdatingLeaderboardUsername] = useState('')
  const [updatingPublicVisibilityKey, setUpdatingPublicVisibilityKey] = useState('')
  const [deletingDraftId, setDeletingDraftId] = useState('')
  const [actingId, setActingId] = useState('')
  const [accountActionNotes, setAccountActionNotes] = useState('')
  const [roleToRevoke, setRoleToRevoke] = useState('contributor')
  const [accountActionLoading, setAccountActionLoading] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!inviteRoleOptions.includes(emailInvite.role)) {
      setEmailInvite((current) => ({ ...current, role: inviteRoleOptions[0] || 'contributor' }))
    }
  }, [emailInvite.role, inviteRoleOptions])

  useEffect(() => {
    if (!showInviteForm) {
      setEmailInviteTurnstileToken('')
    }
  }, [showInviteForm])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 720px)')
    function syncInviteListViewport() {
      setIsMobileInviteList(mediaQuery.matches)
      setIsMobilePeopleList(mediaQuery.matches)
    }
    syncInviteListViewport()
    mediaQuery.addEventListener('change', syncInviteListViewport)
    return () => mediaQuery.removeEventListener('change', syncInviteListViewport)
  }, [])

  const counts = useMemo(
    () => ({
      pending: applications.filter((row) => row.screening_status === 'pending').length,
      approved: applications.filter((row) => row.screening_status === 'approved').length,
      awaitingQuorum: applications.filter((row) => row.screening_status === 'awaiting_quorum').length,
      rejected: applications.filter((row) => row.status === 'rejected').length,
      total: applications.length,
    }),
    [applications],
  )

  const dictionaryDraftRows = useMemo(
    () => filterContributionsByTab(dictionaryDrafts, 'drafts'),
    [dictionaryDrafts],
  )
  const dictionarySubmittedRows = useMemo(
    () => filterContributionsByTab(dictionaryDrafts, 'submitted'),
    [dictionaryDrafts],
  )
  const dictionaryApprovedRows = useMemo(
    () => filterContributionsByTab(dictionaryDrafts, 'approved'),
    [dictionaryDrafts],
  )
  const dictionaryRejectedRows = useMemo(
    () => filterContributionsByTab(dictionaryDrafts, 'rejected'),
    [dictionaryDrafts],
  )
  const folkloreDraftRows = useMemo(
    () => filterContributionsByTab(folkloreDrafts, 'drafts'),
    [folkloreDrafts],
  )
  const folkloreSubmittedRows = useMemo(
    () => filterContributionsByTab(folkloreDrafts, 'submitted'),
    [folkloreDrafts],
  )
  const folkloreApprovedRows = useMemo(
    () => filterContributionsByTab(folkloreDrafts, 'approved'),
    [folkloreDrafts],
  )
  const folkloreRejectedRows = useMemo(
    () => filterContributionsByTab(folkloreDrafts, 'rejected'),
    [folkloreDrafts],
  )
  const dictionaryContributionRows = useMemo(
    () => filterContributionsByTab(dictionaryDrafts, dictionaryContributionTab),
    [dictionaryDrafts, dictionaryContributionTab],
  )
  const folkloreContributionRows = useMemo(
    () => filterContributionsByTab(folkloreDrafts, folkloreContributionTab),
    [folkloreDrafts, folkloreContributionTab],
  )
  const contributionStats = useMemo(
    () => ({
      published: dictionaryPublished.length + folklorePublished.length,
      dictionary: dictionaryPublished.length,
      folklore: folklorePublished.length,
      awaitingReview: dictionarySubmittedRows.length + folkloreSubmittedRows.length,
    }),
    [
      dictionaryPublished.length,
      folklorePublished.length,
      dictionarySubmittedRows.length,
      folkloreSubmittedRows.length,
    ],
  )

  useEffect(() => {
    const nextTab = preferredContributionTab({
      rejected: dictionaryRejectedRows,
      drafts: dictionaryDraftRows,
      approved: dictionaryApprovedRows,
      submitted: dictionarySubmittedRows,
    })
    setDictionaryContributionTab((current) => (current === nextTab ? current : nextTab))
    setDictionaryContributionPage(1)
  }, [dictionaryRejectedRows, dictionaryDraftRows, dictionaryApprovedRows, dictionarySubmittedRows])

  useEffect(() => {
    const nextTab = preferredContributionTab({
      rejected: folkloreRejectedRows,
      drafts: folkloreDraftRows,
      approved: folkloreApprovedRows,
      submitted: folkloreSubmittedRows,
    })
    setFolkloreContributionTab((current) => (current === nextTab ? current : nextTab))
    setFolkloreContributionPage(1)
  }, [folkloreRejectedRows, folkloreDraftRows, folkloreApprovedRows, folkloreSubmittedRows])

  const visibleDictionaryContributions = pagedContributions(
    dictionaryContributionRows,
    dictionaryContributionPage,
  )
  const visibleFolkloreContributions = pagedContributions(folkloreContributionRows, folkloreContributionPage)
  const visibleApplications = pagedApplications(applications, applicationPage)
  const visiblePeople = isMobilePeopleList ? pagedPeople(people, peoplePage) : people
  const invitationPageSize = isMobileInviteList ? MOBILE_INVITATIONS_PER_PAGE : INVITATIONS_PER_PAGE
  const visibleInvitations = pagedInvitations(invitations, invitationPage, invitationPageSize)
  const peopleCounts = useMemo(
    () => ({
      total: people.length,
      admins: people.filter((row) => row.groups.includes('Admin') || row.is_superuser).length,
      consultants: people.filter((row) => row.groups.includes('Consultant')).length,
      reviewers: people.filter((row) => row.groups.includes('Reviewer')).length,
      contributors: people.filter((row) => row.groups.includes('Contributor')).length,
    }),
    [people],
  )
  const flaggedPeople = useMemo(() => people.filter((row) => row.pending_account_flags?.length > 0), [people])
  const inviteEndorsementText = INVITE_ENDORSEMENTS[emailInvite.role] || ''
  const siteMode = siteContentForm.maintenance_enabled
    ? 'maintenance'
    : siteContentForm.beta_locked
      ? 'beta'
      : 'open'
  const shouldOfferProfileOnboarding = Boolean(
    currentUser?.is_authenticated &&
    !currentUser?.onboarding_prompt_dismissed &&
    (currentUser?.onboarding_prompt_pending || !currentUser?.profile_complete),
  )

  useEffect(() => {
    if (shouldOfferProfileOnboarding) {
      setShowOnboardingPrompt(true)
    }
  }, [shouldOfferProfileOnboarding])

  async function skipProfileOnboarding() {
    setDismissingOnboardingPrompt(true)
    setError('')
    try {
      await apiRequest('/api/auth/csrf')
      await apiRequest('/api/profile/onboarding/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const nextUser = {
        ...(currentUser || {}),
        onboarding_prompt_pending: false,
        onboarding_prompt_dismissed: true,
      }
      if (onAuthChange) onAuthChange(nextUser)
      setShowOnboardingPrompt(false)
      if (new URLSearchParams(window.location.search).get('welcome') === 'onboarding') {
        window.history.replaceState({}, '', ROUTES.adminApplications)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDismissingOnboardingPrompt(false)
    }
  }

  async function setSiteAccessMode(mode) {
    if (!isAdmin || savingSiteMode) return
    setSavingSiteMode(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/admin/maintenance-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      setSiteContentForm((current) => ({
        ...current,
        beta_locked: Boolean(payload.beta_locked),
        maintenance_enabled: Boolean(payload.maintenance_enabled),
      }))
      setMessage(
        mode === 'open'
          ? 'Public access is open. The beta lock is off.'
          : mode === 'beta'
            ? 'Beta lock is on.'
            : 'Maintenance mode is on.',
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingSiteMode(false)
    }
  }

  const inviteSidebar = (
    <aside className="admin-people-side-column">
      <article className={showInviteForm ? 'admin-app-card' : 'admin-app-card admin-invite-collapsed-card'}>
        <div className="section-heading">
          <div>
            <h2>Email Role Invitation</h2>
          </div>
          <button
            className={showInviteForm ? 'ghost' : ''}
            onClick={() => {
              setShowInviteForm((current) => {
                const nextValue = !current
                if (nextValue) setEmailInviteNotice(null)
                return nextValue
              })
              setInviteEndorsementAccepted(false)
              setInviteErrorTarget('')
            }}
          >
            {showInviteForm ? 'Hide Form' : 'Send Invite'}
          </button>
        </div>

        {!showInviteForm && (
          <>
            <p className="muted admin-invite-intro">
              Invite a trusted individual directly into the platform. Your endorsement is recorded and
              displayed as part of the user's public accountability record. Once accepted, the assigned role
              becomes active without the standard two-person approval process.
            </p>
            {emailInviteNotice && emailInviteNotice.type !== 'error' && (
              <div className={`admin-email-invite-notice ${emailInviteNotice.type}`}>
                <strong>{emailInviteNotice.title}</strong>
                <p>{emailInviteNotice.detail}</p>
                {emailInviteNotice.acceptUrl && (
                  <a href={emailInviteNotice.acceptUrl} target="_blank" rel="noreferrer">
                    View invite link
                  </a>
                )}
              </div>
            )}
          </>
        )}

        {showInviteForm && (
          <>
            <div className="admin-email-invite-fields">
              <label
                className={`field${inviteErrorTarget === 'email' ? ' invite-field-error' : ''}`}
                htmlFor="invite-email"
              >
                <span>Email *</span>
                <input
                  id="invite-email"
                  type="email"
                  value={emailInvite.email}
                  onChange={(event) => updateEmailInvite('email', event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label className="field" htmlFor="invite-email-role">
                <span>Role *</span>
                <select
                  id="invite-email-role"
                  value={emailInvite.role}
                  onChange={(event) => updateEmailInvite('role', event.target.value)}
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                <small className="hint">You can only invite roles permitted by your own access level.</small>
              </label>
            </div>

            <label className="field" htmlFor="invite-email-notes">
              <span>Invite Notes</span>
              <textarea
                id="invite-email-notes"
                rows={3}
                value={emailInvite.notes}
                onChange={(event) => updateEmailInvite('notes', event.target.value)}
                placeholder="Why this person is trusted for this role"
              />
            </label>

            {inviteEndorsementText && (
              <label
                className={`admin-invite-endorsement${inviteErrorTarget === 'endorsement' ? ' invite-field-error' : ''}`}
                htmlFor="invite-endorsement"
              >
                <input
                  id="invite-endorsement"
                  type="checkbox"
                  checked={inviteEndorsementAccepted}
                  onChange={(event) => {
                    setInviteEndorsementAccepted(event.target.checked)
                    setEmailInviteNotice(null)
                    setInviteErrorTarget('')
                  }}
                />
                <span>
                  <b>*</b> {inviteEndorsementText}
                </span>
              </label>
            )}

            <div
              className={`captcha-panel admin-invite-captcha${inviteErrorTarget === 'captcha' ? ' invite-field-error' : ''}`}
            >
              <div>
                <p className="profile-kicker">Verification</p>
                <p className="muted">Complete this before sending the email invitation.</p>
              </div>
              <TurnstileWidget
                action="admin-email-invite"
                onToken={(token) => {
                  setEmailInviteTurnstileToken(token)
                  setEmailInviteNotice(null)
                  setInviteErrorTarget('')
                }}
                onError={(detail) => {
                  setEmailInviteTurnstileToken('')
                  setInviteErrorTarget('captcha')
                  setEmailInviteNotice({
                    type: 'error',
                    title: 'Verification unavailable',
                    detail,
                  })
                }}
              />
            </div>

            {emailInviteNotice && emailInviteNotice.type === 'error' && (
              <div className={`admin-email-invite-notice ${emailInviteNotice.type}`}>
                <strong>{emailInviteNotice.title}</strong>
                <p>{emailInviteNotice.detail}</p>
                {emailInviteNotice.acceptUrl && (
                  <a href={emailInviteNotice.acceptUrl} target="_blank" rel="noreferrer">
                    View invite link
                  </a>
                )}
              </div>
            )}
            <div className="actions">
              <button
                disabled={
                  sendingInvite ||
                  !emailInviteTurnstileToken ||
                  Boolean(inviteEndorsementText && !inviteEndorsementAccepted)
                }
                onClick={() => sendEmailInvitation()}
              >
                {sendingInvite ? 'Sending...' : 'Send Email Invitation'}
              </button>
            </div>
          </>
        )}
      </article>

      <article className="admin-app-card">
        <div className="section-heading admin-invitations-heading">
          <div>
            <p className="profile-kicker">Invite Status</p>
            <h2>Recent Invitations</h2>
          </div>
          <button
            type="button"
            className="ghost compact-button admin-invitations-refresh"
            disabled={loadingInvitations}
            onClick={() => loadEmailInvitations()}
          >
            {loadingInvitations ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="admin-invite-list">
          {!loadingInvitations && invitations.length === 0 && (
            <p className="muted">No email invitations sent yet.</p>
          )}
          {visibleInvitations.map((invitation) => (
            <div key={invitation.invitation_id} className="admin-invite-row">
              <div>
                <strong>{invitation.email}</strong>
                <p className="meta">
                  {roleLabel(invitation.role)} · sent {formatDate(invitation.created_at)}
                </p>
                {invitation.accepted_at && (
                  <p className="meta">Accepted {formatDate(invitation.accepted_at)}</p>
                )}
                {invitation.accept_url && (
                  <a
                    className="admin-invite-link"
                    href={invitation.accept_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Invite link
                  </a>
                )}
              </div>
              <span className={`badge status-${invitation.status}`}>{invitation.status}</span>
            </div>
          ))}
          {renderInvitationPagination()}
        </div>
      </article>
    </aside>
  )

  function changeTab(nextTab) {
    setActiveTab(nextTab)
    window.history.replaceState({}, '', `${ROUTES.adminApplications}?tab=${nextTab}`)
  }

  async function loadAdminOverview() {
    if (!isAdmin) return
    setLoadingOverview(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/admin/overview')
      setAdminOverview({
        ...EMPTY_ADMIN_OVERVIEW,
        ...payload,
        counts: { ...EMPTY_ADMIN_OVERVIEW.counts, ...(payload.counts || {}) },
        queues: { ...EMPTY_ADMIN_OVERVIEW.queues, ...(payload.queues || {}) },
        maintenance: { ...EMPTY_ADMIN_OVERVIEW.maintenance, ...(payload.maintenance || {}) },
        latest_submissions: payload.latest_submissions || [],
        latest_media_uploads: payload.latest_media_uploads || [],
        recent_admin_overrides: payload.recent_admin_overrides || [],
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingOverview(false)
    }
  }

  async function loadApplications(nextFilter = statusFilter) {
    if (!canReviewRoles) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const query = nextFilter === 'all' ? '' : `?status=${encodeURIComponent(nextFilter)}`
      const payload = await apiRequest(`/api/admin/role-applications${query}`)
      setApplications(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPeople() {
    if (!isAdmin) return
    setLoadingPeople(true)
    setError('')
    setMessage('')
    try {
      const params = new URLSearchParams()
      if (peopleSearch.trim()) params.set('q', peopleSearch.trim())
      if (peopleGroup !== 'all') params.set('group', peopleGroup)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const payload = await apiRequest(`/api/admin/users${suffix}`)
      setPeople(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingPeople(false)
    }
  }

  async function loadArchiveInventory(searchValue = archiveSearch) {
    if (!isAdmin) return
    setLoadingArchive(true)
    setError('')
    try {
      const query = String(searchValue || '').trim()
      const suffix = query ? `?q=${encodeURIComponent(query)}` : ''
      const payload = await apiRequest(`/api/reviews/admin/archive${suffix}`)
      setArchiveInventory({
        ...EMPTY_ARCHIVE_INVENTORY,
        ...payload,
        counts: { ...EMPTY_ARCHIVE_INVENTORY.counts, ...(payload.counts || {}) },
        archived: payload.archived || [],
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingArchive(false)
    }
  }

  function beginArchiveAction(row, action) {
    setArchiveActionTarget({ ...row, action })
    setArchiveActionNotes('')
    setError('')
    setMessage('')
  }

  async function submitArchiveAction(event) {
    event.preventDefault()
    if (!archiveActionTarget) return
    const notes = archiveActionNotes.trim()
    if (!notes) {
      setError('Archive and restore actions require notes.')
      return
    }

    setSavingArchiveAction(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/reviews/admin/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: archiveActionTarget.target_type,
          target_id: archiveActionTarget.target_id,
          action: archiveActionTarget.action,
          notes,
        }),
      })
      const actionLabel = archiveActionTarget.action === 'archive' ? 'archived' : 'restored'
      setMessage(`${archiveActionTarget.title} was ${actionLabel}.`)
      setArchiveActionTarget(null)
      setArchiveActionNotes('')
      await loadArchiveInventory()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingArchiveAction(false)
    }
  }

  async function loadPersonActivity(person) {
    if (!person?.username) return
    setSelectedActivityUser(person)
    setShowActivityLog(true)
    setActivityRows([])
    setLoadingActivity(true)
    setError('')
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(person.username)}/activity`)
      setActivityRows(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingActivity(false)
    }
  }

  function openPersonProfile(person) {
    setSelectedActivityUser(person)
    setActivityRows([])
    setShowActivityLog(false)
    setShowEmailLog(false)
    setShowAccountControls(false)
    setAccountActionNotes('')
    setRoleToRevoke(preferredRoleToRevoke(person))
    setError('')
  }

  function closePersonProfile() {
    setSelectedActivityUser(null)
    setActivityRows([])
    setShowActivityLog(false)
    setShowEmailLog(false)
    setShowAccountControls(false)
    setAccountActionNotes('')
    setRoleToRevoke('contributor')
  }

  function applyUpdatedPerson(person) {
    if (!person?.username) return
    setPeople((current) => current.map((row) => (row.username === person.username ? person : row)))
    setSelectedActivityUser((current) => (current?.username === person.username ? person : current))
    setRoleToRevoke((currentRole) => {
      const availableRoles = revokableRolesForPerson(person)
      return availableRoles.includes(currentRole) ? currentRole : preferredRoleToRevoke(person)
    })
  }

  async function updatePersonLeaderboardVisibility(person, nextValue) {
    if (!person?.username) return
    setUpdatingLeaderboardUsername(person.username)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(
        `/api/users/${encodeURIComponent(person.username)}/leaderboard-visibility`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ include_in_leaderboard: nextValue }),
        },
      )
      const applyVisibility = (row) => ({
        ...row,
        profile: {
          ...(row.profile || {}),
          include_in_leaderboard: payload.include_in_leaderboard,
        },
      })
      setPeople((current) =>
        current.map((row) => (row.username === person.username ? applyVisibility(row) : row)),
      )
      setSelectedActivityUser((current) =>
        current?.username === person.username ? applyVisibility(current) : current,
      )
      setMessage(
        payload.include_in_leaderboard
          ? 'This person is included in leaderboard rankings.'
          : 'This person is hidden from leaderboard rankings.',
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingLeaderboardUsername('')
    }
  }

  async function updatePersonPublicVisibility(person, field, nextValue) {
    if (!person?.username || !['show_on_yaru_chart', 'show_live_contributions'].includes(field)) return
    const updateKey = `${person.username}:${field}`
    setUpdatingPublicVisibilityKey(updateKey)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(
        `/api/users/${encodeURIComponent(person.username)}/public-visibility`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: nextValue }),
        },
      )
      const applyVisibility = (row) => ({
        ...row,
        profile: {
          ...(row.profile || {}),
          show_on_yaru_chart: payload.show_on_yaru_chart,
          show_live_contributions: payload.show_live_contributions,
        },
      })
      setPeople((current) =>
        current.map((row) => (row.username === person.username ? applyVisibility(row) : row)),
      )
      setSelectedActivityUser((current) =>
        current?.username === person.username ? applyVisibility(current) : current,
      )
      if (field === 'show_on_yaru_chart') {
        setMessage(
          payload.show_on_yaru_chart
            ? 'This person is shown on the Digital Yaru org chart.'
            : 'This person is hidden from the Digital Yaru org chart.',
        )
      } else {
        setMessage(
          payload.show_live_contributions
            ? "This person's approved contributions are shown on the live platform."
            : "This person's approved contributions are hidden from the live platform.",
        )
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingPublicVisibilityKey('')
    }
  }

  async function runAccountAction(person, action, options = {}) {
    if (!person?.username) return
    const notes = accountActionNotes.trim()
    const actionsNeedingNotes = ['deactivate', 'revoke-role', 'flag-suspicious', 'clear-flag', 'confirm-flag']
    if (actionsNeedingNotes.includes(action) && !notes) {
      setError('Add account action notes before continuing.')
      return
    }

    setAccountActionLoading(action)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      let endpoint = ''
      let body = {}
      if (action === 'activate' || action === 'deactivate') {
        endpoint = `/api/admin/users/${encodeURIComponent(person.username)}/status`
        body = { is_active: action === 'activate', notes }
      } else if (action === 'password-reset') {
        endpoint = `/api/admin/users/${encodeURIComponent(person.username)}/password-reset`
        body = { notes }
      } else if (action === 'approval-reminder') {
        endpoint = `/api/admin/users/${encodeURIComponent(person.username)}/approval-reminder`
        body = { notes }
      } else if (action === 'revoke-role') {
        endpoint = `/api/admin/users/${encodeURIComponent(person.username)}/roles/revoke`
        body = { role: roleToRevoke, notes }
      } else if (action === 'flag-suspicious') {
        endpoint = `/api/admin/users/${encodeURIComponent(person.username)}/suspicious-flag`
        body = { notes }
      } else if (action === 'clear-flag' || action === 'confirm-flag') {
        endpoint = `/api/admin/account-flags/${options.flagId}/resolve`
        body = { decision: action === 'clear-flag' ? 'clear' : 'confirm', notes }
      }
      const payload = await apiRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (payload.user) applyUpdatedPerson(payload.user)
      if (showActivityLog) await loadPersonActivity(payload.user || person)
      if (action !== 'password-reset') setAccountActionNotes('')
      const successMessages = {
        activate: 'Account reactivated.',
        deactivate: 'Account deactivated.',
        'approval-reminder': payload.detail || 'Approval reminder sent.',
        'password-reset': payload.detail || 'Password reset link sent.',
        'revoke-role':
          roleToRevoke === 'reviewer'
            ? 'Reviewer access removed. Contributor access remains active.'
            : `${roleLabel(roleToRevoke)} access revoked.`,
        'flag-suspicious': 'Account flagged for review.',
        'clear-flag': 'Suspicious-account flag cleared.',
        'confirm-flag': 'Suspicious-account flag confirmed.',
      }
      setMessage(successMessages[action] || 'Account action completed.')
      if (activeTab === 'overview') loadAdminOverview()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAccountActionLoading('')
    }
  }

  function profileAffiliationLines(rows, firstKey, secondKey) {
    const items = (rows || []).filter((row) => row?.[firstKey] || row?.[secondKey])
    return items.map((item) => [item[firstKey], item[secondKey]].filter(Boolean).join(', '))
  }

  function renderProfileAffiliations(profile) {
    const rows = [
      ...profileAffiliationLines(profile?.cultural_affiliations, 'role', 'organization'),
      ...profileAffiliationLines(profile?.other_affiliations, 'designation', 'institution'),
    ]
    if (rows.length > 0) {
      return (
        <div className="admin-person-affiliation-list">
          {rows.map((row, index) => (
            <p key={`affiliation-${index}`}>{row}</p>
          ))}
        </div>
      )
    }
    if (profile?.affiliation || profile?.occupation) {
      return (
        <div className="admin-person-affiliation-group">
          <p>
            {profile?.occupation && <span>{profile.occupation}</span>}
            {profile?.affiliation && <em>{profile.affiliation}</em>}
          </p>
        </div>
      )
    }
    return '-'
  }

  function renderOnboardingRecords(person) {
    const records = person?.onboarding_records || []
    if (records.length === 0) return '-'
    return (
      <div className="admin-person-onboarding-list">
        {records.map((record, index) => (
          <p key={`${record.role}-${record.method}-${index}`}>
            <span>{record.accountability_label || `${roleLabel(record.role)} access`}</span>
            <time>{formatDate(record.created_at)}</time>
          </p>
        ))}
      </div>
    )
  }

  function handlePeopleSearchSubmit(event) {
    event.preventDefault()
    setPeoplePage(1)
    loadPeople()
  }

  async function loadEmailInvitations() {
    if (!canReviewRoles) return
    setLoadingInvitations(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/admin/role-invitations/email')
      setInvitations(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingInvitations(false)
    }
  }

  async function loadContributionDrafts() {
    if (!isAuthenticated) return
    setLoadingDrafts(true)
    setError('')
    setMessage('')
    try {
      const [dictionaryPayload, folklorePayload] = await Promise.all([
        apiRequest('/api/dictionary/revisions/my'),
        apiRequest('/api/folklore/revisions/my'),
      ])
      const dictionaryRows = dictionaryPayload.rows || []
      const folkloreRows = folklorePayload.rows || []
      setDictionaryDrafts(sortNewestFirst(dictionaryRows))
      setFolkloreDrafts(sortNewestFirst(folkloreRows))
      setDictionaryPublished(dictionaryRows.filter((row) => row.status === 'approved'))
      setFolklorePublished(folkloreRows.filter((row) => row.status === 'approved'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function loadSiteContent() {
    if (!isAdmin) return
    setLoadingSiteContent(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/site-content')
      setSiteContentForm(siteContentToForm(payload))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingSiteContent(false)
    }
  }

  async function loadResources() {
    if (!isAdmin) return
    setLoadingResources(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/admin/resources')
      setResourceRows(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingResources(false)
    }
  }

  function resetResourceForm() {
    setResourceForm(EMPTY_RESOURCE_FORM)
    setEditingResourceId('')
  }

  function updateResourceForm(field, value) {
    setResourceForm((current) => ({ ...current, [field]: value }))
  }

  function editResource(resource) {
    setEditingResourceId(resource.id)
    setResourceForm({
      title: resource.title || '',
      description: resource.description || '',
      category: resource.category === 'General' ? '' : resource.category || '',
      visibility: resource.visibility || 'public',
      is_published: Boolean(resource.is_published),
      file: null,
    })
  }

  async function saveResource() {
    if (!isAdmin) return
    setSavingResource(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const body = new FormData()
      body.append('title', resourceForm.title)
      body.append('description', resourceForm.description)
      body.append('category', resourceForm.category)
      body.append('visibility', resourceForm.visibility)
      body.append('is_published', resourceForm.is_published ? 'true' : 'false')
      if (resourceForm.file) body.append('file', resourceForm.file)
      const path = editingResourceId ? `/api/admin/resources/${editingResourceId}` : '/api/admin/resources'
      const payload = await apiRequest(path, {
        method: 'POST',
        body,
      })
      setResourceRows((current) => {
        const saved = payload.resource
        if (!editingResourceId) return [saved, ...current]
        return current.map((resource) => (resource.id === saved.id ? saved : resource))
      })
      resetResourceForm()
      setMessage('Guide file saved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingResource(false)
    }
  }

  async function deleteResource(resource) {
    if (!isAdmin || !window.confirm(`Delete "${resource.title}"?`)) return
    setDeletingResourceId(resource.id)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      await apiRequest(`/api/admin/resources/${resource.id}`, { method: 'DELETE' })
      setResourceRows((current) => current.filter((row) => row.id !== resource.id))
      if (editingResourceId === resource.id) resetResourceForm()
      setMessage('Guide file deleted.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingResourceId('')
    }
  }

  function setSiteContentField(field, value) {
    setSiteContentForm((current) => ({ ...current, [field]: value }))
  }

  function updateSiteContentRow(group, index, field, value) {
    setSiteContentForm((current) => ({
      ...current,
      [group]: current[group].map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }))
  }

  function addSiteContentRow(group) {
    const emptyRow = group === 'support_statements' ? EMPTY_SUPPORT_STATEMENT : EMPTY_PARTNER_DETAIL
    setSiteContentForm((current) => ({
      ...current,
      [group]: [...current[group], { ...emptyRow }],
    }))
  }

  function removeSiteContentRow(group, index) {
    const emptyRow = group === 'support_statements' ? EMPTY_SUPPORT_STATEMENT : EMPTY_PARTNER_DETAIL
    setSiteContentForm((current) => {
      const nextRows = current[group].filter((_, rowIndex) => rowIndex !== index)
      return {
        ...current,
        [group]: nextRows.length ? nextRows : [{ ...emptyRow }],
      }
    })
  }

  function updateFaqSection(index, field, value) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, [field]: value } : section,
      ),
    }))
  }

  function toggleFaqSectionRole(index, role) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, sectionIndex) => {
        if (sectionIndex !== index) return section
        const roleSet = new Set(section.roles)
        if (roleSet.has(role)) {
          roleSet.delete(role)
        } else {
          roleSet.add(role)
        }
        return {
          ...section,
          roles: roleSet.size ? Array.from(roleSet) : [role],
        }
      }),
    }))
  }

  function addFaqSection() {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: [
        ...current.faq_sections,
        {
          ...EMPTY_FAQ_SECTION,
          id: `custom-faq-${current.faq_sections.length + 1}`,
          items: [{ ...EMPTY_FAQ_ITEM }],
        },
      ],
    }))
  }

  function removeFaqSection(index) {
    setSiteContentForm((current) => {
      const nextSections = current.faq_sections.filter((_, sectionIndex) => sectionIndex !== index)
      return {
        ...current,
        faq_sections: nextSections.length
          ? nextSections
          : [{ ...EMPTY_FAQ_SECTION, items: [{ ...EMPTY_FAQ_ITEM }] }],
      }
    })
  }

  function updateFaqItem(sectionIndex, itemIndex, field, value) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section
        return {
          ...section,
          items: section.items.map((item, currentItemIndex) =>
            currentItemIndex === itemIndex ? { ...item, [field]: value } : item,
          ),
        }
      }),
    }))
  }

  function addFaqItem(sectionIndex) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, currentSectionIndex) =>
        currentSectionIndex === sectionIndex
          ? { ...section, items: [...section.items, { ...EMPTY_FAQ_ITEM }] }
          : section,
      ),
    }))
  }

  function removeFaqItem(sectionIndex, itemIndex) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section
        const nextItems = section.items.filter((_, currentItemIndex) => currentItemIndex !== itemIndex)
        return {
          ...section,
          items: nextItems.length ? nextItems : [{ ...EMPTY_FAQ_ITEM }],
        }
      }),
    }))
  }

  async function uploadFaqImage(sectionIndex, itemIndex, file) {
    if (!file) return
    const uploadKey = `${sectionIndex}-${itemIndex}`
    setUploadingFaqImageKey(uploadKey)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const body = new FormData()
      body.append('image', file)
      const payload = await apiRequest('/api/site-content/faq-media', {
        method: 'POST',
        body,
      })
      updateFaqItem(sectionIndex, itemIndex, 'image_url', payload.url || '')
      setMessage('FAQ image uploaded. Save Site Content to publish the FAQ edit.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploadingFaqImageKey('')
    }
  }

  async function uploadPartnerLogo(index, file) {
    if (!file) return
    setUploadingPartnerLogoIndex(index)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const body = new FormData()
      body.append('image', file)
      const payload = await apiRequest('/api/site-content/partner-media', {
        method: 'POST',
        body,
      })
      updateSiteContentRow('partner_details', index, 'logo_url', payload.url || '')
      setMessage('Supporting organization logo uploaded. Save Site Content to publish it.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploadingPartnerLogoIndex(-1)
    }
  }

  async function uploadBrandLogo(file) {
    if (!file) return
    setUploadingBrandLogo(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const body = new FormData()
      body.append('image', file)
      const payload = await apiRequest('/api/site-content/brand-media', {
        method: 'POST',
        body,
      })
      setSiteContentField('brand_logo_url', payload.url || '')
      setMessage('Brand logo uploaded. Save Site Content to publish it.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploadingBrandLogo(false)
    }
  }

  async function performSiteContentSave() {
    if (!isAdmin) return

    setSavingSiteContent(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteContentFromForm(siteContentForm)),
      })
      setSiteContentForm(siteContentToForm(payload))
      setMessage('Site content saved.')
      setConfirmingSiteContentSave(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingSiteContent(false)
    }
  }

  function saveSiteContent(event) {
    event.preventDefault()
    if (!isAdmin) return
    setError('')
    setMessage('')
    setConfirmingSiteContentSave(true)
  }

  function renderContributionPagination(rows, page, setPage, label) {
    const totalPages = contributionPageCount(rows)
    if (rows.length <= CONTRIBUTIONS_PER_PAGE) return null

    return (
      <nav className="admin-pagination" aria-label={`${label} contribution pages`}>
        <button
          className="ghost compact-button"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`${label}-page-${pageNumber}`}
            className={pageNumber === page ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === page ? 'page' : undefined}
            onClick={() => setPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          className="ghost compact-button"
          disabled={page >= totalPages}
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        >
          Next
        </button>
      </nav>
    )
  }

  function renderApplicationPagination() {
    const totalPages = applicationPageCount(applications)
    if (applications.length <= APPLICATIONS_PER_PAGE) return null

    return (
      <nav className="admin-pagination" aria-label="Application pages">
        <button
          className="ghost compact-button"
          disabled={applicationPage <= 1}
          onClick={() => setApplicationPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`application-page-${pageNumber}`}
            className={pageNumber === applicationPage ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === applicationPage ? 'page' : undefined}
            onClick={() => setApplicationPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          className="ghost compact-button"
          disabled={applicationPage >= totalPages}
          onClick={() => setApplicationPage((current) => Math.min(totalPages, current + 1))}
        >
          Next
        </button>
      </nav>
    )
  }

  function renderPeoplePagination() {
    const totalPages = peoplePageCount(people)
    if (!isMobilePeopleList || people.length <= MOBILE_PEOPLE_PER_PAGE) return null

    return (
      <nav className="admin-pagination admin-people-pagination" aria-label="People pages">
        <button
          className="ghost compact-button"
          disabled={peoplePage <= 1}
          onClick={() => setPeoplePage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`people-page-${pageNumber}`}
            className={pageNumber === peoplePage ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === peoplePage ? 'page' : undefined}
            onClick={() => setPeoplePage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          className="ghost compact-button"
          disabled={peoplePage >= totalPages}
          onClick={() => setPeoplePage((current) => Math.min(totalPages, current + 1))}
        >
          Next
        </button>
      </nav>
    )
  }

  function renderInvitationPagination() {
    const totalPages = invitationPageCount(invitations, invitationPageSize)
    if (invitations.length <= invitationPageSize) return null

    return (
      <nav className="admin-pagination" aria-label="Invitation pages">
        <button
          className="ghost compact-button"
          disabled={invitationPage <= 1}
          onClick={() => setInvitationPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`invitation-page-${pageNumber}`}
            className={pageNumber === invitationPage ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === invitationPage ? 'page' : undefined}
            onClick={() => setInvitationPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          className="ghost compact-button"
          disabled={invitationPage >= totalPages}
          onClick={() => setInvitationPage((current) => Math.min(totalPages, current + 1))}
        >
          Next
        </button>
      </nav>
    )
  }

  async function deleteContributionDraft(type, revisionId) {
    if (!revisionId) return

    setDeletingDraftId(revisionId)
    setError('')
    setMessage('')
    try {
      const path =
        type === 'folklore'
          ? `/api/folklore/revisions/${revisionId}/delete`
          : `/api/dictionary/revisions/${revisionId}/delete`
      await apiRequest(path, { method: 'DELETE' })
      setMessage('Draft deleted.')
      await loadContributionDrafts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingDraftId('')
      setConfirmingDraftDelete(null)
    }
  }

  async function decide(applicationId, decision) {
    const notes = notesById[applicationId] || ''
    if (decision === 'reject' && !notes.trim()) {
      setApplicationActionErrorById((current) => ({
        ...current,
        [applicationId]: 'Rejection requires notes so the applicant has clear feedback.',
      }))
      return
    }
    const application = applications.find((row) => row.application_id === applicationId)
    const applicantName = application?.applicant ? displayName(application.applicant) : 'Applicant'
    setActingId(applicationId)
    setError('')
    setMessage('')
    setApplicationDecisionToast(null)
    setApplicationActionErrorById((current) => ({ ...current, [applicationId]: '' }))
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/users/role-applications/${applicationId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          notes: decision === 'reject' ? notes : '',
        }),
      })
      await loadApplications()
      await loadPeople()
      if (decision === 'approve') {
        setApplicationDecisionToast({
          decision,
          title: 'Successfully approved',
          detail:
            payload.application_status === 'pending'
              ? `${applicantName}'s approval was recorded. Another required approver must still decide.`
              : `${applicantName}'s application was approved and access is now active.`,
        })
      } else {
        setApplicationDecisionToast({
          decision,
          title: 'Application was rejected',
          detail: `${applicantName}'s application was rejected.`,
        })
      }
      setRejectNotesOpenById((current) => ({ ...current, [applicationId]: false }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setActingId('')
    }
  }

  function handleRejectApplication(applicationId) {
    if (!rejectNotesOpenById[applicationId]) {
      setRejectNotesOpenById((current) => ({ ...current, [applicationId]: true }))
      setApplicationActionErrorById((current) => ({ ...current, [applicationId]: '' }))
      setError('')
      return
    }
    decide(applicationId, 'reject')
  }

  async function releaseRejectedApplicationEmail(applicationId) {
    const application = applications.find((row) => row.application_id === applicationId)
    const email = application?.applicant?.email || 'This email'
    setActingId(applicationId)
    setError('')
    setMessage('')
    setApplicationDecisionToast(null)
    setApplicationActionErrorById((current) => ({ ...current, [applicationId]: '' }))
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/admin/role-applications/${applicationId}/release-email`, {
        method: 'POST',
      })
      await loadApplications()
      await loadPeople()
      setMessage(payload.detail || `${email} is now available for another account.`)
    } catch (requestError) {
      setApplicationActionErrorById((current) => ({
        ...current,
        [applicationId]: requestError.message,
      }))
    } finally {
      setActingId('')
    }
  }

  function renderDictionaryPostedPreview(contribution) {
    const data = contribution.proposed_data || {}
    const term = contribution.term || data.term || '(no headword)'
    const meaning = contribution.meaning || data.meaning || 'No meaning provided yet.'
    const variants = Array.isArray(data.variants)
      ? data.variants.filter(
          (variant) => variant?.term || variant?.variant_type || variant?.pronunciation_text,
        )
      : []
    const inflectedForms = parseStructuredValue(data.inflected_forms)
    const inflectionRows =
      inflectedForms && typeof inflectedForms === 'object' && !Array.isArray(inflectedForms)
        ? Object.entries(inflectedForms).filter(([, value]) => value)
        : []
    const contributorSource = contributionSourceLabel(contribution)
    const audioSource = isTruthy(data.audio_source_is_self_recorded) ? contributorSource : data.audio_source
    const photoSource = isTruthy(data.photo_source_is_contributor_owned)
      ? contributorSource
      : data.photo_source
    const relatedRows = [
      ['English synonym', data.english_synonym],
      ['Ivatan synonym', data.ivatan_synonym],
      ['English antonym', data.english_antonym],
      ['Ivatan antonym', data.ivatan_antonym],
    ]
    const photoUrl = contribution.photo_url
    const audioUrl = contribution.audio_pronunciation_url

    return (
      <article className="dictionary-entry-detail contribution-posted-preview">
        <header className="dictionary-headword">
          <div className="dictionary-headword-row">
            <h2>{term}</h2>
            {audioUrl && (
              <audio className="contribution-inline-audio" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            )}
          </div>
          <div className="dictionary-pronunciation-line">
            {data.part_of_speech || contribution.part_of_speech ? (
              <span>
                <small>Part of speech</small>
                {data.part_of_speech || contribution.part_of_speech}
              </span>
            ) : null}
            {data.pronunciation_text && (
              <span>
                <small>Pronunciation</small>
                {data.pronunciation_text}
              </span>
            )}
            {data.phonetic && (
              <span>
                <small>Phonetic</small>
                {data.phonetic}
              </span>
            )}
            {data.variant_type || contribution.variant_type ? (
              <span>
                <small>Variant</small>
                {data.variant_type || contribution.variant_type}
              </span>
            ) : null}
          </div>
        </header>

        {variants.length > 0 && (
          <section className="dictionary-field-block">
            <h4>Additional Variants</h4>
            <div className="variant-preview-list">
              {variants.map((variant, index) => (
                <article key={`preview-variant-${index}`}>
                  <strong>{variant.term || `Variant ${index + 1}`}</strong>
                  <p className="meta">
                    {[variant.variant_type, variant.pronunciation_text].filter(Boolean).join(' | ') ||
                      'Details not set'}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {photoUrl && <img className="dictionary-photo-preview" src={photoUrl} alt="" />}

        <section className="dictionary-definition">
          <p className="definition-number">1</p>
          <div>
            <p className="definition-label">Meaning</p>
            <p>{meaning}</p>
          </div>
        </section>

        {(data.example_sentence || data.example_translation) && (
          <section className="dictionary-field-block">
            <h4>Sample Sentence</h4>
            <div className="example-translation-grid">
              <div>
                <p className="meta">Ivatan</p>
                <p>{data.example_sentence || '-'}</p>
              </div>
              <div>
                <p className="meta">English</p>
                <p>{data.example_translation || '-'}</p>
              </div>
            </div>
          </section>
        )}

        {data.usage_notes && (
          <section className="dictionary-field-block">
            <h4>Usage Notes</h4>
            <p>{data.usage_notes}</p>
          </section>
        )}
        {data.etymology && (
          <section className="dictionary-field-block">
            <h4>Etymology</h4>
            <p>{data.etymology}</p>
          </section>
        )}
        {inflectionRows.length > 0 && (
          <section className="dictionary-field-block">
            <h4>Inflected Forms</h4>
            <div className="dictionary-chip-row">
              {inflectionRows.map(([label, value]) => (
                <span key={`${label}-${value}`}>
                  {label}: {value}
                </span>
              ))}
            </div>
          </section>
        )}
        {relatedRows.some(([, value]) => splitList(value).length > 0) && (
          <section className="dictionary-field-block">
            <h4>Related Words</h4>
            <div className="dictionary-chip-row">
              {relatedRows.flatMap(([label, value]) =>
                splitList(value).map((item) => (
                  <span key={`${label}-${item}`}>
                    {label}: {item}
                  </span>
                )),
              )}
            </div>
          </section>
        )}

        <section className="dictionary-attribution-block">
          <h4>Attribution</h4>
          <div className="detail-list">
            <p>Contributor and reviewer names will appear here after approval.</p>
            <p>
              {[
                data.source_text ? `Term Source: ${data.source_text}` : '',
                audioSource ? `Audio Source: ${audioSource}` : '',
                photoSource ? `Image Source: ${photoSource}` : '',
              ]
                .filter(Boolean)
                .join(', ') || 'No external source notes.'}
            </p>
          </div>
        </section>
      </article>
    )
  }

  function renderFolklorePostedPreview(contribution) {
    const data = contribution.proposed_data || {}
    const title = contribution.title || data.title || '(untitled folklore)'
    const mediaUrl = contribution.media_url || data.media_url
    const embedUrl = getYouTubeEmbedUrl(mediaUrl)

    return (
      <article className="detail-main draft-folklore-preview contribution-posted-preview">
        {embedUrl && (
          <div className="youtube-embed-wrap">
            <iframe
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}
        {contribution.photo_upload_url && (
          <img className="folklore-photo-preview" src={contribution.photo_upload_url} alt="" />
        )}
        {contribution.audio_upload_url && (
          <audio className="contribution-folklore-audio" controls src={contribution.audio_upload_url}>
            <track kind="captions" />
          </audio>
        )}
        {!embedUrl && mediaUrl && (
          <a href={mediaUrl} target="_blank" rel="noreferrer">
            Open media link
          </a>
        )}
        <p className="profile-kicker">
          {folkloreTaxonomyLabel(
            contribution.category || data.category,
            contribution.subcategory || data.subcategory,
          ) || 'Folklore'}{' '}
          | {contribution.municipality_source || data.municipality_source || 'Not Applicable'}
        </p>
        <h2>{title}</h2>
        <p className="story-text">{contribution.content || data.content || 'No content provided.'}</p>
        <div className="folklore-metadata-layout">
          <section className="folklore-attribution-block">
            <h4>Details</h4>
            <div className="folklore-attribution-grid">
              <p>
                <span>Main Category</span>
                <strong>
                  {folkloreTaxonomyLabel(contribution.category || data.category, '') ||
                    contribution.category ||
                    data.category ||
                    '-'}
                </strong>
              </p>
              <p>
                <span>Subcategory</span>
                <strong>
                  {folkloreTaxonomyLabel('', contribution.subcategory || data.subcategory) ||
                    contribution.subcategory ||
                    data.subcategory ||
                    '-'}
                </strong>
              </p>
              <p>
                <span>Place</span>
                <strong>{contribution.municipality_source || data.municipality_source || '-'}</strong>
              </p>
              <p>
                <span>Date Added</span>
                <strong>Shown after approval</strong>
              </p>
            </div>
          </section>
          <section className="folklore-attribution-block">
            <h4>Attribution</h4>
            <div className="folklore-attribution-grid">
              <p>
                <span>Contributor</span>
                <strong>Shown after approval</strong>
              </p>
              {(contribution.source || data.source) && (
                <p>
                  <span>Source</span>
                  <strong>{contribution.source || data.source}</strong>
                </p>
              )}
              {(contribution.media_source || data.media_source) && (
                <p>
                  <span>Media</span>
                  <strong>{contribution.media_source || data.media_source}</strong>
                </p>
              )}
              <p>
                <span>Copyright</span>
                <strong>{contribution.copyright_usage || data.copyright_usage || '-'}</strong>
              </p>
            </div>
          </section>
        </div>
      </article>
    )
  }

  function renderContributionPreviewModal() {
    if (!viewingContribution) return null
    const { type, contribution } = viewingContribution
    const title =
      type === 'dictionary' ? contribution.term || '(no headword)' : contribution.title || '(no title)'

    return (
      <div
        className="celebration-backdrop contribution-preview-backdrop"
        role="presentation"
        onClick={() => setViewingContribution(null)}
      >
        <article
          className="contribution-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contribution-preview-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="profile-kicker">Read-only publication preview</p>
              <h2 id="contribution-preview-title">{title}</h2>
            </div>
            <span className={`badge status-${contributionDisplayStatus(contribution) || 'draft'}`}>
              {contributionStatusLabel(contributionDisplayStatus(contribution))}
            </span>
          </div>
          <p className="muted">{contributionStatusDetail(contribution)}</p>
          {type === 'dictionary'
            ? renderDictionaryPostedPreview(contribution)
            : renderFolklorePostedPreview(contribution)}
          <div className="actions">
            <button onClick={() => setViewingContribution(null)}>Close</button>
          </div>
        </article>
      </div>
    )
  }

  function updateEmailInvite(field, value) {
    setEmailInvite((current) => ({ ...current, [field]: value }))
    if (field === 'role') {
      setInviteEndorsementAccepted(false)
    }
    setEmailInviteNotice(null)
    setInviteErrorTarget('')
  }

  function updateConsultantProfile(field, value) {
    setConsultantProfile((current) => ({ ...current, [field]: value }))
  }

  function resetConsultantProfileForm() {
    setConsultantProfile(EMPTY_CONSULTANT_PROFILE)
    setConsultantPhotoFile(null)
    setConsultantPhotoPreview('')
    setConsultantPhotoWarning('')
    setEditingConsultantUsername('')
  }

  function beginManagedConsultantEdit(person) {
    const profile = person.profile || {}
    const consultantRecord = person.onboarding_records?.find(
      (record) => record.role === 'consultant' && record.method === 'admin_created',
    )
    setConsultantProfile({
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      email: person.email || '',
      municipality: profile.municipality || '',
      post_nominals: profile.post_nominals || '',
      occupation: profile.occupation || '',
      cultural_affiliations: rowsForSiteEditor(profile.cultural_affiliations, { role: '', organization: '' }),
      other_affiliations: rowsForSiteEditor(profile.other_affiliations, { designation: '', institution: '' }),
      bio: profile.bio || '',
      notes: consultantRecord?.accountability_notes || '',
    })
    setConsultantPhotoFile(null)
    setConsultantPhotoPreview(profile.profile_photo || '')
    setConsultantPhotoWarning('')
    setEditingConsultantUsername(person.username)
    setShowConsultantProfileForm(true)
    closePersonProfile()
    window.setTimeout(() => {
      document
        .getElementById('managed-consultant-profile')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function updateConsultantAffiliation(group, index, field, value) {
    setConsultantProfile((current) => ({
      ...current,
      [group]: current[group].map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }))
  }

  function addConsultantAffiliation(group) {
    const emptyRow =
      group === 'cultural_affiliations'
        ? { role: '', organization: '' }
        : { designation: '', institution: '' }
    setConsultantProfile((current) => ({
      ...current,
      [group]: [...current[group], emptyRow],
    }))
  }

  function removeConsultantAffiliation(group, index) {
    const emptyRow =
      group === 'cultural_affiliations'
        ? { role: '', organization: '' }
        : { designation: '', institution: '' }
    setConsultantProfile((current) => {
      const rows = current[group].filter((_, rowIndex) => rowIndex !== index)
      return { ...current, [group]: rows.length ? rows : [emptyRow] }
    })
  }

  async function handleConsultantPhotoChange(event) {
    const file = event.target.files?.[0] || null
    setConsultantPhotoWarning('')
    setError('')
    try {
      const prepared = await prepareImageUpload(file, {
        minWidth: 300,
        minHeight: 300,
        maxWidth: 900,
        maxHeight: 900,
      })
      setConsultantPhotoFile(prepared.file)
      setConsultantPhotoPreview(prepared.previewUrl || '')
      setConsultantPhotoWarning(prepared.warning)
    } catch (uploadError) {
      setConsultantPhotoFile(null)
      setConsultantPhotoPreview('')
      setError(uploadError.message)
    }
  }

  async function sendEmailInvitation() {
    const email = emailInvite.email.trim().toLowerCase()
    if (!email) {
      setError('')
      setInviteErrorTarget('email')
      setEmailInviteNotice({
        type: 'error',
        title: 'Email required',
        detail: 'Enter an email address before sending the invitation.',
      })
      return
    }
    const emailError = emailValidationMessage(email)
    if (emailError) {
      setError('')
      setInviteErrorTarget('email')
      setEmailInviteNotice({
        type: 'error',
        title: 'Invalid email address',
        detail: emailError,
      })
      return
    }
    if (!emailInviteTurnstileToken) {
      setError('')
      setInviteErrorTarget('captcha')
      setEmailInviteNotice({
        type: 'error',
        title: 'Verification required',
        detail: 'Complete the verification before sending the invitation.',
      })
      return
    }
    if (inviteEndorsementText && !inviteEndorsementAccepted) {
      setError('')
      setInviteErrorTarget('endorsement')
      setEmailInviteNotice({
        type: 'error',
        title: 'Endorsement required',
        detail: 'Confirm the role-specific accountability statement before sending the invitation.',
      })
      return
    }

    setSendingInvite(true)
    setError('')
    setMessage('')
    setEmailInviteNotice(null)
    setInviteErrorTarget('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/admin/role-invitations/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: emailInvite.role,
          notes: emailInvite.notes.trim() || inviteEndorsementText,
          turnstile_token: emailInviteTurnstileToken,
        }),
      })
      setMessage(
        payload.email_sent === false
          ? `Invitation created for ${payload.email}.`
          : `Invitation sent to ${payload.email}.`,
      )
      setEmailInviteNotice({
        type: payload.email_sent === false ? 'warning' : 'success',
        title: payload.email_sent === false ? 'Invitation created, email not delivered' : 'Invitation sent',
        detail:
          payload.warning ||
          `${payload.email} can now accept the ${roleLabel(payload.role)} invitation from the email link.`,
        acceptUrl: payload.accept_url,
      })
      setEmailInvite((current) => ({ ...current, email: '', notes: '' }))
      setEmailInviteTurnstileToken('')
      setInviteEndorsementAccepted(false)
      setInviteErrorTarget('')
      setShowInviteForm(false)
      await loadPeople()
      await loadEmailInvitations()
    } catch (requestError) {
      setError('')
      setEmailInviteTurnstileToken('')
      setInviteErrorTarget(
        requestError.message?.toLowerCase().includes('turnstile') ||
          requestError.message?.toLowerCase().includes('verification')
          ? 'captcha'
          : '',
      )
      setEmailInviteNotice({
        type: 'error',
        title: 'Invitation not sent',
        detail: requestError.message,
      })
    } finally {
      setSendingInvite(false)
    }
  }

  async function createManagedConsultantProfile(event) {
    event.preventDefault()
    if (!consultantProfile.first_name.trim() || !consultantProfile.last_name.trim()) {
      setError('First name and last name are required for a consultant profile.')
      return
    }
    const emailError = emailValidationMessage(consultantProfile.email, { required: false })
    if (emailError) {
      setError(emailError)
      return
    }

    setCreatingConsultantProfile(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const body = new FormData()
      Object.entries(consultantProfile).forEach(([key, value]) => {
        body.append(key, Array.isArray(value) ? JSON.stringify(value) : value)
      })
      if (consultantPhotoFile) body.append('profile_photo', consultantPhotoFile)
      const endpoint = editingConsultantUsername
        ? `/api/admin/consultant-profiles/${encodeURIComponent(editingConsultantUsername)}`
        : '/api/admin/consultant-profiles'
      const payload = await apiRequest(endpoint, {
        method: 'POST',
        body,
      })
      setMessage(
        editingConsultantUsername
          ? `Consultant profile updated for ${displayName(payload.user)}.`
          : `Consultant profile created for ${displayName(payload.user)}.`,
      )
      resetConsultantProfileForm()
      setShowConsultantProfileForm(false)
      setPeople((current) => [
        payload.user,
        ...current.filter((row) => row.username !== payload.user.username),
      ])
      setSelectedActivityUser(payload.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreatingConsultantProfile(false)
    }
  }

  function formatOverviewType(value) {
    if (value === 'dictionary') return 'Dictionary'
    if (value === 'folklore') return 'Folklore'
    return value || 'Item'
  }

  function renderOverviewMetric(label, value, detail) {
    return (
      <article className="admin-overview-metric">
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {detail && <p className="meta">{detail}</p>}
      </article>
    )
  }

  function renderOverviewQueue(label, value, detail, targetTab, tone = 'neutral') {
    return (
      <button
        type="button"
        className={`admin-overview-queue-row ${tone}`}
        onClick={() => changeTab(targetTab)}
      >
        <span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <b>{value}</b>
      </button>
    )
  }

  function renderSubmissionRow(row) {
    const isPublicTarget = Boolean(row.entry_id) && ['approved', 'approved_under_review'].includes(row.status)
    const targetRoute =
      row.type === 'dictionary'
        ? `${ROUTES.dictionaryView}?entry_id=${row.entry_id}`
        : `${ROUTES.folkloreView}?entry_id=${row.entry_id}`
    function openRow() {
      if (isPublicTarget) {
        navigate(targetRoute)
        return
      }
      setViewingContribution({ type: row.type, contribution: row })
    }

    return (
      <button
        key={`${row.type}-${row.id}`}
        type="button"
        className="admin-overview-list-row"
        onClick={openRow}
      >
        <div>
          <strong className="admin-overview-entry-link">{row.title}</strong>
          <p className="meta">
            {formatOverviewType(row.type)} · {contributionStatusLabel(contributionDisplayStatus(row))} · @
            {row.contributor || 'unknown'}
          </p>
          {row.media?.length > 0 && <p className="meta">Media: {row.media.join(', ')}</p>}
        </div>
        <time>{formatDate(row.created_at)}</time>
      </button>
    )
  }

  function renderOverviewList(title, rows, emptyText, renderRow, actionLabel, targetTab) {
    return (
      <article className="admin-overview-panel">
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
          </div>
          {targetTab && (
            <button
              type="button"
              className="ghost compact-button admin-overview-panel-action"
              onClick={() => changeTab(targetTab)}
            >
              {actionLabel}
            </button>
          )}
        </div>
        <div className="admin-overview-list">
          {rows.length === 0 ? <p className="muted">{emptyText}</p> : rows.map(renderRow)}
        </div>
      </article>
    )
  }

  function renderAdminOverview() {
    const { counts, queues } = adminOverview
    return (
      <section className="admin-overview">
        <div className="admin-overview-metrics desk-stats">
          {renderOverviewMetric('Contributors', counts.contributors)}
          {renderOverviewMetric('Reviewers', counts.reviewers)}
          {renderOverviewMetric('Approved Entries', counts.approved_entries)}
          {renderOverviewMetric('Pending Entries', counts.pending_entries)}
        </div>

        <div className="admin-overview-grid">
          <article className="admin-overview-panel admin-overview-attention">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">Needs Attention</p>
                <h2>Queue Health</h2>
              </div>
            </div>
            <div className="admin-overview-queue-list">
              {renderOverviewQueue(
                'Role Applications',
                queues.pending_role_applications,
                'People waiting for access decisions',
                'applications',
                queues.pending_role_applications ? 'warn' : 'calm',
              )}
              {renderOverviewQueue(
                'Suspicious Accounts',
                queues.pending_account_flags,
                'Flagged accounts waiting for review',
                'people',
                queues.pending_account_flags ? 'urgent' : 'calm',
              )}
              {renderOverviewQueue(
                'Dictionary Reviews',
                queues.pending_dictionary_reviews,
                'Submitted terms awaiting validation',
                'reviews',
                queues.pending_dictionary_reviews ? 'warn' : 'calm',
              )}
              {renderOverviewQueue(
                'Folklore Reviews',
                queues.pending_folklore_reviews,
                'Submitted stories awaiting validation',
                'reviews',
                queues.pending_folklore_reviews ? 'warn' : 'calm',
              )}
              {renderOverviewQueue(
                'Entries Under Re-review',
                queues.entries_under_re_review,
                `${queues.dictionary_under_re_review} dictionary, ${queues.folklore_under_re_review} folklore`,
                'reviews',
                queues.entries_under_re_review ? 'urgent' : 'calm',
              )}
            </div>
          </article>

          {renderOverviewList(
            'Latest Submissions',
            adminOverview.latest_submissions,
            'No submissions yet.',
            renderSubmissionRow,
            'Open Reviews',
            'reviews',
          )}

          {renderOverviewList(
            'Media Uploads',
            adminOverview.latest_media_uploads,
            'No recent submissions with media.',
            renderSubmissionRow,
          )}
        </div>
      </section>
    )
  }

  useEffect(() => {
    if (!isAuthenticated) return
    if (isAdmin) return
    if (canReviewRoles && !['applications', 'reviews', 'resources', 'contributions'].includes(activeTab)) {
      setActiveTab('reviews')
      return
    }
    if (!canReviewRoles && !['resources', 'contributions'].includes(activeTab)) {
      setActiveTab('contributions')
    }
  }, [activeTab, canReviewRoles, isAdmin, isAuthenticated])

  useEffect(() => {
    function syncTabFromUrl() {
      const requestedTab = tabFromQuery()
      if (requestedTab) setActiveTab(normalizeDeskTab(requestedTab))
    }

    syncTabFromUrl()
    window.addEventListener('popstate', syncTabFromUrl)
    return () => window.removeEventListener('popstate', syncTabFromUrl)
    // Register once; role changes remount the authenticated workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'overview') return
    loadAdminOverview()
    // Load the operations summary when opening Overview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin])

  useEffect(() => {
    if (!canReviewRoles) return
    if (activeTab !== 'applications') return
    loadApplications(statusFilter)
    if (activeTab === 'applications') loadEmailInvitations()
    // Reload when the current user, selected filter, or active tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReviewRoles, isAdmin, statusFilter, activeTab])

  useEffect(() => {
    if (!isAdmin) return
    if (activeTab !== 'people') return
    setPeoplePage(1)
    loadPeople()
    // Load people only when the People tab is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, peopleGroup, activeTab])

  useEffect(() => {
    if (activeTab !== 'people') {
      setSelectedActivityUser(null)
      setActivityRows([])
      setShowActivityLog(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'archive') return
    loadArchiveInventory()
    // Load archive inventory only when the admin opens this tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'archive') return
    const timeoutId = window.setTimeout(() => loadArchiveInventory(archiveSearch), 300)
    return () => window.clearTimeout(timeoutId)
    // Debounce archive search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveSearch])

  useEffect(() => {
    if (!applicationDecisionToast) return undefined
    const timeoutId = window.setTimeout(() => setApplicationDecisionToast(null), 4200)
    return () => window.clearTimeout(timeoutId)
  }, [applicationDecisionToast])

  useEffect(() => {
    if (!isAdmin) return
    if (activeTab !== 'people') return
    setPeoplePage(1)
    const timeoutId = window.setTimeout(() => {
      loadPeople()
    }, 300)
    return () => window.clearTimeout(timeoutId)
    // Debounce text search while the People tab is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleSearch])

  useEffect(() => {
    const totalPages = peoplePageCount(people)
    if (peoplePage > totalPages) {
      setPeoplePage(totalPages)
    }
  }, [people, peoplePage])

  useEffect(() => {
    if (activeTab !== 'contributions') return
    loadContributionDrafts()
    // Load current user's draft rows when opening Contributions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthenticated])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'site') return
    loadSiteContent()
    // Load public page copy only when the Site Content tab is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'site' || activeSiteContentSection !== 'resources') return
    loadResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeSiteContentSection, isAdmin])

  useEffect(() => {
    setApplicationPage(1)
  }, [statusFilter])

  useEffect(() => {
    setApplicationPage((current) => Math.min(current, applicationPageCount(applications)))
  }, [applications])

  useEffect(() => {
    setInvitationPage((current) => Math.min(current, invitationPageCount(invitations, invitationPageSize)))
  }, [invitations, invitationPageSize])

  useEffect(() => {
    setDictionaryContributionPage((current) =>
      Math.min(current, contributionPageCount(dictionaryContributionRows)),
    )
  }, [dictionaryContributionRows])

  useEffect(() => {
    setFolkloreContributionPage((current) =>
      Math.min(current, contributionPageCount(folkloreContributionRows)),
    )
  }, [folkloreContributionRows])

  const selectedRevokableRoles = revokableRolesForPerson(selectedActivityUser)
  const selectedCanRevokeRole = selectedRevokableRoles.includes(roleToRevoke)
  const selectedPendingActivationApplication =
    selectedActivityUser?.pending_activation_applications?.[0] || null
  const selectedEmailLog = selectedActivityUser?.email_log || []

  if (!isAuthenticated) {
    return (
      <section className="panel">
        <h1>Steward's Desk</h1>
        <p className="alert error">Log in to open your contribution desk.</p>
        <button onClick={() => navigate(ROUTES.login)}>Log In</button>
      </section>
    )
  }

  return (
    <section className="admin-applications-page">
      {showOnboardingPrompt && shouldOfferProfileOnboarding && (
        <div className="profile-onboarding-modal-backdrop" role="presentation">
          <article
            className="profile-onboarding-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-onboarding-title"
          >
            <p className="profile-kicker">Welcome</p>
            <h2 id="profile-onboarding-title">Set up your public profile?</h2>
            <p>
              Add your name, municipality, and short bio so contributors and reviewers know who is joining the
              archive.
            </p>
            <div className="profile-onboarding-actions">
              <button type="button" onClick={() => navigate(ROUTES.profileEdit)}>
                Complete Profile
              </button>
              <button
                type="button"
                className="ghost"
                disabled={dismissingOnboardingPrompt}
                onClick={skipProfileOnboarding}
              >
                {dismissingOnboardingPrompt ? 'Skipping...' : 'Skip for now'}
              </button>
            </div>
          </article>
        </div>
      )}
      {applicationDecisionToast && (
        <div
          className={`review-action-toast ${applicationDecisionToast.decision}`}
          role="status"
          aria-live="polite"
        >
          <div className="review-action-toast-mark" aria-hidden="true" />
          <div className="review-action-toast-copy">
            <strong>{applicationDecisionToast.title}</strong>
            <p>{applicationDecisionToast.detail}</p>
          </div>
          <button
            type="button"
            className="ghost compact-button"
            onClick={() => setApplicationDecisionToast(null)}
          >
            Close
          </button>
        </div>
      )}
      <div className="admin-applications-header">
        <div>
          <p className="profile-kicker">
            {isAdmin ? 'Admin' : isConsultant ? 'Consultant' : isReviewer ? 'Reviewer' : 'Contributor'}
          </p>
          <h1>Steward's Desk</h1>
        </div>
        <button
          disabled={
            loadingOverview ||
            loading ||
            loadingPeople ||
            loadingArchive ||
            loadingInvitations ||
            loadingDrafts ||
            loadingSiteContent
          }
          onClick={() => {
            if (activeTab === 'overview') loadAdminOverview()
            if (activeTab === 'applications') {
              loadApplications()
              loadEmailInvitations()
            }
            if (activeTab === 'people') {
              loadPeople()
            }
            if (activeTab === 'archive') loadArchiveInventory()
            if (activeTab === 'site') loadSiteContent()
            if (activeTab === 'contributions') loadContributionDrafts()
            if (activeTab === 'reviews') setReviewRefreshToken((current) => current + 1)
          }}
        >
          {loadingOverview ||
          loading ||
          loadingPeople ||
          loadingArchive ||
          loadingInvitations ||
          loadingDrafts ||
          loadingSiteContent
            ? 'Refreshing...'
            : 'Refresh'}
        </button>
      </div>

      <div className="admin-tabs" aria-label="Steward's Desk sections">
        {isAdmin && (
          <button
            className={activeTab === 'overview' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('overview')}
          >
            Overview
          </button>
        )}
        {canReviewRoles && (
          <button
            className={activeTab === 'reviews' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('reviews')}
          >
            Reviews
          </button>
        )}
        {canReviewRoles && (
          <button
            className={activeTab === 'applications' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('applications')}
          >
            Applications
          </button>
        )}
        {isAdmin && (
          <button
            className={activeTab === 'people' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('people')}
          >
            People
          </button>
        )}
        {isAdmin && (
          <button
            className={activeTab === 'archive' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('archive')}
          >
            Archive
          </button>
        )}
        {isAdmin && (
          <button
            className={activeTab === 'site' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('site')}
          >
            Site Content
          </button>
        )}
        <button
          className={activeTab === 'resources' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => changeTab('resources')}
        >
          Resources
        </button>
        <button
          className={activeTab === 'contributions' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => changeTab('contributions')}
        >
          Contributions
        </button>
      </div>

      {isAdmin && activeTab === 'overview' && (
        <>
          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}
          {renderAdminOverview()}
        </>
      )}

      {canReviewRoles && activeTab === 'applications' && (
        <>
          <div className="admin-app-summary desk-stats" aria-label="Application summary">
            <article>
              <p className="stat-label">Pending</p>
              <p className="stat-value">{counts.pending}</p>
            </article>
            <article>
              <p className="stat-label">Approved</p>
              <p className="stat-value">{counts.approved}</p>
            </article>
            <article>
              <p className="stat-label">Rejected</p>
              <p className="stat-value">{counts.rejected}</p>
            </article>
            <article>
              <p className="stat-label">Awaiting Quorum</p>
              <p className="stat-value">{counts.awaitingQuorum}</p>
            </article>
          </div>

          <div className="admin-app-toolbar">
            <label className="field" htmlFor="application-status-filter">
              <span>Status</span>
              <select
                id="application-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}

          <div className="admin-applications-layout">
            <div className="admin-app-list">
              {!loading && applications.length === 0 && (
                <p className="muted">No applications found for this filter.</p>
              )}
              {visibleApplications.map((application) => {
                const applicant = application.applicant
                const canDecide = application.status === 'pending' && !application.current_user_decision
                const statusDisplay = applicationStatusDisplay(application)
                const applicationOpen = Boolean(applicationOpenById[application.application_id])
                return (
                  <article
                    key={application.application_id}
                    className="admin-app-card admin-role-application-card"
                  >
                    <button
                      type="button"
                      className="admin-role-application-toggle"
                      aria-expanded={applicationOpen}
                      onClick={() =>
                        setApplicationOpenById((current) => ({
                          ...current,
                          [application.application_id]: !current[application.application_id],
                        }))
                      }
                    >
                      <ApplicantAvatar applicant={applicant} />
                      <span className="admin-role-application-summary">
                        <span className="admin-role-application-name">{displayName(applicant)}</span>
                        <p className="meta">
                          @{applicant.username} applying as{' '}
                          <strong>{roleLabel(application.target_role)}</strong>
                        </p>
                        <small>Submitted {formatDate(application.created_at)}</small>
                      </span>
                      <span className="admin-role-application-toggle-end">
                        <span className={`badge ${statusDisplay.className}`}>{statusDisplay.label}</span>
                        <span className="queue-awaiting-chevron" aria-hidden="true">
                          {applicationOpen ? '−' : '+'}
                        </span>
                      </span>
                    </button>

                    {applicationOpen && (
                      <>
                        <div className="admin-role-application-body">
                          <p className="meta">
                            {applicant.municipality || 'No municipality yet'}
                            {applicant.affiliation ? ` - ${applicant.affiliation}` : ''}
                            {applicant.occupation ? ` - ${applicant.occupation}` : ''}
                          </p>
                          {affiliationText(applicant.cultural_affiliations, 'role', 'organization') && (
                            <p className="meta">
                              Cultural:{' '}
                              {affiliationText(applicant.cultural_affiliations, 'role', 'organization')}
                            </p>
                          )}
                          {affiliationText(applicant.other_affiliations, 'designation', 'institution') && (
                            <p className="meta">
                              Other:{' '}
                              {affiliationText(applicant.other_affiliations, 'designation', 'institution')}
                            </p>
                          )}
                        </div>

                        <div className="admin-app-details">
                          <div>
                            <p className="stat-label">Email</p>
                            <p className="meta">{applicant.email || 'Released / none'}</p>
                          </div>
                          <div>
                            <p className="stat-label">Screening Progress</p>
                            <p className="meta">{approvalProgress(application)}</p>
                          </div>
                          <div>
                            <p className="stat-label">Current Roles</p>
                            <p className="meta">
                              {applicant.groups.length ? applicant.groups.join(', ') : 'None'}
                            </p>
                          </div>
                          <div>
                            <p className="stat-label">Decision History</p>
                            {application.decisions.length === 0 ? (
                              <p className="meta">No decisions yet.</p>
                            ) : (
                              application.decisions.map((row) => (
                                <p key={row.decision_id} className="meta">
                                  {row.decision} by {row.decided_by} ({row.decider_role}) on{' '}
                                  {formatDate(row.created_at)}
                                  {row.notes ? ` - ${row.notes}` : ''}
                                </p>
                              ))
                            )}
                          </div>
                        </div>

                        {isAdmin && application.status === 'rejected' && applicant.email && (
                          <div className="admin-app-actions">
                            {applicationActionErrorById[application.application_id] && (
                              <p className="inline-error admin-application-action-error">
                                {applicationActionErrorById[application.application_id]}
                              </p>
                            )}
                            <div className="actions">
                              <button
                                type="button"
                                className="ghost"
                                disabled={actingId === application.application_id}
                                onClick={() => releaseRejectedApplicationEmail(application.application_id)}
                              >
                                {actingId === application.application_id ? 'Releasing...' : 'Release Email'}
                              </button>
                            </div>
                            <p className="meta">
                              Frees this rejected applicant email so it can be assigned to another account.
                            </p>
                          </div>
                        )}

                        {canDecide && (
                          <div className="admin-app-actions">
                            {rejectNotesOpenById[application.application_id] && (
                              <label className="field" htmlFor={`notes-${application.application_id}`}>
                                <span>Rejection notes</span>
                                <textarea
                                  id={`notes-${application.application_id}`}
                                  rows={2}
                                  value={notesById[application.application_id] || ''}
                                  onChange={(event) => {
                                    setNotesById((current) => ({
                                      ...current,
                                      [application.application_id]: event.target.value,
                                    }))
                                    setApplicationActionErrorById((current) => ({
                                      ...current,
                                      [application.application_id]: '',
                                    }))
                                  }}
                                  placeholder="Required so the applicant has clear feedback."
                                />
                              </label>
                            )}
                            {applicationActionErrorById[application.application_id] && (
                              <p className="inline-error admin-application-action-error">
                                {applicationActionErrorById[application.application_id]}
                              </p>
                            )}
                            <div className="actions">
                              <button
                                disabled={actingId === application.application_id}
                                onClick={() => decide(application.application_id, 'approve')}
                              >
                                Approve
                              </button>
                              <button
                                className="ghost"
                                disabled={actingId === application.application_id}
                                onClick={() => handleRejectApplication(application.application_id)}
                              >
                                {rejectNotesOpenById[application.application_id] ? 'Submit Reject' : 'Reject'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                )
              })}
              {renderApplicationPagination()}
            </div>
            {inviteSidebar}
          </div>
        </>
      )}

      {isAdmin && activeTab === 'people' && (
        <>
          <div className="admin-people-tab-content">
            <div className="admin-app-summary desk-stats" aria-label="People summary">
              <article>
                <p className="stat-label">Loaded People</p>
                <p className="stat-value">{peopleCounts.total}</p>
              </article>
              <article>
                <p className="stat-label">Admins</p>
                <p className="stat-value">{peopleCounts.admins}</p>
              </article>
              <article>
                <p className="stat-label">Consultants</p>
                <p className="stat-value">{peopleCounts.consultants}</p>
              </article>
              <article>
                <p className="stat-label">Reviewers</p>
                <p className="stat-value">{peopleCounts.reviewers}</p>
              </article>
              <article>
                <p className="stat-label">Contributors</p>
                <p className="stat-value">{peopleCounts.contributors}</p>
              </article>
            </div>

            <form className="admin-people-toolbar" onSubmit={handlePeopleSearchSubmit}>
              <label className="field" htmlFor="people-search">
                <span>Search people</span>
                <input
                  id="people-search"
                  value={peopleSearch}
                  onChange={(event) => setPeopleSearch(event.target.value)}
                  placeholder="Name, username, email, municipality"
                />
              </label>
              <label className="field" htmlFor="people-group">
                <span>Role group</span>
                <select
                  id="people-group"
                  value={peopleGroup}
                  onChange={(event) => setPeopleGroup(event.target.value)}
                >
                  {USER_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={loadingPeople}>
                {loadingPeople ? 'Searching...' : 'Search'}
              </button>
            </form>

            <div className="admin-people-operations-grid">
              <section
                id="managed-consultant-profile"
                className="admin-app-card admin-consultant-profile-card"
              >
                <div className="section-heading">
                  <div>
                    <p className="profile-kicker">Consultant Profiles</p>
                    <h2>Managed Consultant Profile</h2>
                  </div>
                  <button
                    type="button"
                    className={showConsultantProfileForm ? 'ghost compact-button' : 'compact-button'}
                    onClick={() => {
                      if (showConsultantProfileForm) {
                        resetConsultantProfileForm()
                        setShowConsultantProfileForm(false)
                      } else {
                        resetConsultantProfileForm()
                        setShowConsultantProfileForm(true)
                      }
                    }}
                  >
                    {showConsultantProfileForm ? 'Cancel' : 'Create Profile'}
                  </button>
                </div>
                <p className="muted">
                  Create a public profile for a trusted knowledge holder who will not manage their own
                  account.
                </p>
                {showConsultantProfileForm && (
                  <form className="admin-consultant-profile-form" onSubmit={createManagedConsultantProfile}>
                    {editingConsultantUsername && (
                      <p className="alert ok">Editing managed profile @{editingConsultantUsername}</p>
                    )}
                    <aside className="profile-photo-editor admin-consultant-photo-editor">
                      {consultantPhotoPreview ? (
                        <img className="profile-photo-preview" src={consultantPhotoPreview} alt="" />
                      ) : (
                        <div className="profile-photo-preview profile-photo-placeholder" aria-hidden="true">
                          {`${consultantProfile.first_name.slice(0, 1)}${consultantProfile.last_name.slice(0, 1)}`.toUpperCase() ||
                            'CI'}
                        </div>
                      )}
                      <label className="photo-upload-button" htmlFor="consultant-profile-photo">
                        Choose Profile Photo
                      </label>
                      <input
                        id="consultant-profile-photo"
                        type="file"
                        accept="image/*"
                        onChange={handleConsultantPhotoChange}
                      />
                      <p className="hint">JPG, PNG, or WebP works best.</p>
                      {consultantPhotoWarning && <p className="inline-ok">{consultantPhotoWarning}</p>}
                    </aside>
                    <div className="field-grid">
                      <label className="field" htmlFor="consultant-first-name">
                        <span>First name *</span>
                        <input
                          id="consultant-first-name"
                          value={consultantProfile.first_name}
                          onChange={(event) => updateConsultantProfile('first_name', event.target.value)}
                        />
                      </label>
                      <label className="field" htmlFor="consultant-last-name">
                        <span>Last name *</span>
                        <input
                          id="consultant-last-name"
                          value={consultantProfile.last_name}
                          onChange={(event) => updateConsultantProfile('last_name', event.target.value)}
                        />
                      </label>
                      <label className="field" htmlFor="consultant-email">
                        <span>Email</span>
                        <input
                          id="consultant-email"
                          type="email"
                          value={consultantProfile.email}
                          onChange={(event) => updateConsultantProfile('email', event.target.value)}
                        />
                      </label>
                      <label className="field" htmlFor="consultant-municipality">
                        <span>Municipality</span>
                        <input
                          id="consultant-municipality"
                          value={consultantProfile.municipality}
                          onChange={(event) => updateConsultantProfile('municipality', event.target.value)}
                        />
                      </label>
                      <label className="field" htmlFor="consultant-post-nominals">
                        <span>Credentials</span>
                        <input
                          id="consultant-post-nominals"
                          value={consultantProfile.post_nominals}
                          onChange={(event) => updateConsultantProfile('post_nominals', event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="affiliation-editor">
                      <div className="affiliation-editor-heading">
                        <h4>Cultural / Community Affiliation</h4>
                        <button
                          type="button"
                          className="ghost compact-button"
                          onClick={() => addConsultantAffiliation('cultural_affiliations')}
                        >
                          Add another
                        </button>
                      </div>
                      {consultantProfile.cultural_affiliations.map((row, index) => (
                        <div className="affiliation-row" key={`consultant-cultural-${index}`}>
                          <label className="field" htmlFor={`consultant-cultural-role-${index}`}>
                            {index === 0 && <span>Position / Role</span>}
                            <input
                              id={`consultant-cultural-role-${index}`}
                              aria-label="Position / Role"
                              placeholder="e.g., Resident, Member etc."
                              value={row.role}
                              onChange={(event) =>
                                updateConsultantAffiliation(
                                  'cultural_affiliations',
                                  index,
                                  'role',
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="field" htmlFor={`consultant-cultural-organization-${index}`}>
                            {index === 0 && <span>Agency/ Organization/ Group</span>}
                            <input
                              id={`consultant-cultural-organization-${index}`}
                              aria-label="Agency/ Organization/ Group"
                              placeholder="e.g., Brgy. San Antonio, Ivatan Cultural Council, etc."
                              value={row.organization}
                              onChange={(event) =>
                                updateConsultantAffiliation(
                                  'cultural_affiliations',
                                  index,
                                  'organization',
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          {consultantProfile.cultural_affiliations.length > 1 && (
                            <button
                              type="button"
                              className="ghost compact-button"
                              onClick={() => removeConsultantAffiliation('cultural_affiliations', index)}
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
                          onClick={() => addConsultantAffiliation('other_affiliations')}
                        >
                          Add another
                        </button>
                      </div>
                      {consultantProfile.other_affiliations.map((row, index) => (
                        <div className="affiliation-row" key={`consultant-other-${index}`}>
                          <label className="field" htmlFor={`consultant-other-designation-${index}`}>
                            {index === 0 && <span>Position / Role</span>}
                            <input
                              id={`consultant-other-designation-${index}`}
                              aria-label="Position / Role"
                              placeholder="e.g., Student, Clerk, etc."
                              value={row.designation}
                              onChange={(event) =>
                                updateConsultantAffiliation(
                                  'other_affiliations',
                                  index,
                                  'designation',
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="field" htmlFor={`consultant-other-institution-${index}`}>
                            {index === 0 && <span>Agency/ Organization/ Group</span>}
                            <input
                              id={`consultant-other-institution-${index}`}
                              aria-label="Agency/ Organization/ Group"
                              placeholder="e.g., Batanes State College, LGU Basco, etc."
                              value={row.institution}
                              onChange={(event) =>
                                updateConsultantAffiliation(
                                  'other_affiliations',
                                  index,
                                  'institution',
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          {consultantProfile.other_affiliations.length > 1 && (
                            <button
                              type="button"
                              className="ghost compact-button"
                              onClick={() => removeConsultantAffiliation('other_affiliations', index)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <label className="field" htmlFor="consultant-occupation">
                      <span>Role or occupation</span>
                      <input
                        id="consultant-occupation"
                        value={consultantProfile.occupation}
                        onChange={(event) => updateConsultantProfile('occupation', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor="consultant-bio">
                      <span>Public bionote</span>
                      <textarea
                        id="consultant-bio"
                        rows={3}
                        value={consultantProfile.bio}
                        onChange={(event) => updateConsultantProfile('bio', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor="consultant-notes">
                      <span>Admin notes</span>
                      <textarea
                        id="consultant-notes"
                        rows={2}
                        value={consultantProfile.notes}
                        onChange={(event) => updateConsultantProfile('notes', event.target.value)}
                        placeholder="Consent, context, or why this person is trusted as a consultant"
                      />
                    </label>
                    <div className="actions">
                      <button type="submit" disabled={creatingConsultantProfile}>
                        {creatingConsultantProfile
                          ? editingConsultantUsername
                            ? 'Saving...'
                            : 'Creating...'
                          : editingConsultantUsername
                            ? 'Save Consultant Profile'
                            : 'Create Consultant Profile'}
                      </button>
                    </div>
                  </form>
                )}
              </section>

              <section className="admin-app-card admin-flagged-accounts-card">
                <div className="section-heading">
                  <div>
                    <p className="profile-kicker">Account Safety</p>
                    <h2>Flagged Accounts</h2>
                  </div>
                  <span className={flaggedPeople.length ? 'badge status-pending' : 'badge status-approved'}>
                    {flaggedPeople.length}
                  </span>
                </div>
                <p className="muted">
                  Review accounts reported by users or admins. Open a profile to clear or confirm a flag.
                </p>
                <div className="admin-flagged-account-list">
                  {flaggedPeople.length === 0 && (
                    <p className="muted">No pending suspicious-account flags in the current people list.</p>
                  )}
                  {flaggedPeople.map((person) => {
                    const latestFlag = person.pending_account_flags?.[0]
                    return (
                      <button
                        type="button"
                        key={person.username}
                        className="admin-flagged-account-row"
                        onClick={() => openPersonProfile(person)}
                      >
                        <span>
                          <strong>{displayName(person)}</strong>
                          <small>@{person.username}</small>
                        </span>
                        <span>
                          <small>Flagged by @{latestFlag?.admin || 'unknown'}</small>
                          <small>
                            {latestFlag?.created_at ? formatDate(latestFlag.created_at) : 'Pending review'}
                          </small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>

            {error && <p className="alert error">{error}</p>}
            {message && <p className="alert ok">{message}</p>}

            <div className="table-wrap admin-people-main">
              <table className="simple-table admin-people-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Roles</th>
                    <th>Municipality</th>
                    <th>Contributions</th>
                    <th>Reviews</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {!loadingPeople && people.length === 0 && (
                    <tr>
                      <td colSpan="6">No people found for this search.</td>
                    </tr>
                  )}
                  {visiblePeople.map((person) => (
                    <tr
                      key={person.username}
                      className={
                        selectedActivityUser?.username === person.username
                          ? 'admin-person-row active'
                          : 'admin-person-row'
                      }
                    >
                      <td>
                        <button
                          className="admin-person-cell admin-person-cell-button"
                          type="button"
                          onClick={() => openPersonProfile(person)}
                        >
                          <ApplicantAvatar applicant={person} />
                          <span>
                            <strong>{displayName(person)}</strong>
                            <span className="meta">@{person.username}</span>
                            <span className="meta">{person.email || 'No email set'}</span>
                          </span>
                        </button>
                      </td>
                      <td>
                        {person.groups.length
                          ? person.groups.join(', ')
                          : person.is_superuser
                            ? 'Superuser'
                            : 'Registered'}
                      </td>
                      <td>{person.profile?.municipality || '-'}</td>
                      <td>{person.stats?.combined_total || 0}</td>
                      <td>{person.stats?.review_completed_total || 0}</td>
                      <td>{formatDate(person.date_joined)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderPeoplePagination()}

            {selectedActivityUser && (
              <div className="admin-person-modal-backdrop" role="presentation" onClick={closePersonProfile}>
                <aside
                  className="admin-activity-panel admin-person-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="admin-person-modal-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="section-heading">
                    <div>
                      <p className="profile-kicker">Profile & Activity</p>
                      <h3 id="admin-person-modal-title">{displayName(selectedActivityUser)}</h3>
                    </div>
                    <button className="ghost compact-button" onClick={closePersonProfile}>
                      Close
                    </button>
                  </div>
                  <div className="admin-person-profile-card">
                    <div className="admin-person-profile-head">
                      <ApplicantAvatar applicant={selectedActivityUser} />
                      <div>
                        <strong>{displayName(selectedActivityUser)}</strong>
                        <p className="meta admin-person-username">@{selectedActivityUser.username}</p>
                        <p className="meta admin-person-email">
                          {selectedActivityUser.email || 'No email set'}
                        </p>
                      </div>
                    </div>
                    <dl className="admin-person-profile-grid">
                      <div>
                        <dt>Roles</dt>
                        <dd>
                          {selectedActivityUser.groups?.length
                            ? selectedActivityUser.groups.join(', ')
                            : selectedActivityUser.is_superuser
                              ? 'Superuser'
                              : 'Registered'}
                        </dd>
                      </div>
                      <div>
                        <dt>Account Status</dt>
                        <dd>
                          <span
                            className={
                              selectedActivityUser.is_active
                                ? 'badge status-approved'
                                : 'badge status-rejected'
                            }
                          >
                            {selectedActivityUser.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </dd>
                      </div>
                      {selectedPendingActivationApplication && (
                        <div>
                          <dt>Join Status</dt>
                          <dd>
                            <span className="badge status-pending">Approved, not joined</span>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Suspicious Review</dt>
                        <dd>
                          {selectedActivityUser.pending_account_flags?.length ? (
                            <span className="badge status-pending">Flagged</span>
                          ) : (
                            <span className="badge status-approved">Clear</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Municipality</dt>
                        <dd>{selectedActivityUser.profile?.municipality || '-'}</dd>
                      </div>
                      <div>
                        <dt>Contributions</dt>
                        <dd>{selectedActivityUser.stats?.combined_total || 0}</dd>
                      </div>
                      <div>
                        <dt>Reviews</dt>
                        <dd>{selectedActivityUser.stats?.review_completed_total || 0}</dd>
                      </div>
                      <div>
                        <dt>Leaderboard</dt>
                        <dd>
                          {selectedActivityUser.profile?.include_in_leaderboard === false
                            ? 'Hidden'
                            : 'Included'}
                        </dd>
                      </div>
                      <div>
                        <dt>Yaru Org Chart</dt>
                        <dd>
                          {selectedActivityUser.profile?.show_on_yaru_chart === false ? 'Hidden' : 'Shown'}
                        </dd>
                      </div>
                      <div>
                        <dt>Live Contributions</dt>
                        <dd>
                          {selectedActivityUser.profile?.show_live_contributions === false
                            ? 'Hidden'
                            : 'Shown'}
                        </dd>
                      </div>
                      <div>
                        <dt>Joined</dt>
                        <dd>{formatDate(selectedActivityUser.date_joined)}</dd>
                      </div>
                      <div className="admin-person-profile-wide">
                        <dt>Role Access</dt>
                        <dd>{renderOnboardingRecords(selectedActivityUser)}</dd>
                      </div>
                      <div className="admin-person-profile-wide">
                        <dt>Affiliations</dt>
                        <dd>{renderProfileAffiliations(selectedActivityUser.profile)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="admin-person-log-controls">
                    {isManagedConsultant(selectedActivityUser) && (
                      <button
                        className="compact-button"
                        type="button"
                        onClick={() => beginManagedConsultantEdit(selectedActivityUser)}
                      >
                        Edit Managed Profile
                      </button>
                    )}
                    {selectedPendingActivationApplication && (
                      <>
                        <button
                          className="compact-button"
                          type="button"
                          disabled={Boolean(accountActionLoading)}
                          onClick={() => runAccountAction(selectedActivityUser, 'approval-reminder')}
                        >
                          {accountActionLoading === 'approval-reminder' ? 'Sending...' : 'Resend Setup Link'}
                        </button>
                        <a
                          className="ghost compact-button admin-invite-link"
                          href={selectedPendingActivationApplication.access_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open setup link
                        </a>
                      </>
                    )}
                    <button
                      className="ghost compact-button"
                      onClick={() =>
                        navigate(
                          `${ROUTES.profileView}?username=${encodeURIComponent(selectedActivityUser.username)}`,
                        )
                      }
                    >
                      Public Profile
                    </button>
                    <button
                      className={showAccountControls ? 'compact-button' : 'ghost compact-button'}
                      type="button"
                      aria-expanded={showAccountControls}
                      onClick={() => setShowAccountControls((current) => !current)}
                    >
                      {showAccountControls ? 'Hide Account Controls' : 'Account Controls'}
                    </button>
                    <button
                      className="ghost compact-button"
                      disabled={updatingLeaderboardUsername === selectedActivityUser.username}
                      onClick={() =>
                        updatePersonLeaderboardVisibility(
                          selectedActivityUser,
                          selectedActivityUser.profile?.include_in_leaderboard === false,
                        )
                      }
                    >
                      {updatingLeaderboardUsername === selectedActivityUser.username
                        ? 'Updating...'
                        : selectedActivityUser.profile?.include_in_leaderboard === false
                          ? 'Count on Leaderboard'
                          : 'Hide from Leaderboard'}
                    </button>
                    <button
                      className="ghost compact-button"
                      disabled={
                        updatingPublicVisibilityKey === `${selectedActivityUser.username}:show_on_yaru_chart`
                      }
                      onClick={() =>
                        updatePersonPublicVisibility(
                          selectedActivityUser,
                          'show_on_yaru_chart',
                          selectedActivityUser.profile?.show_on_yaru_chart === false,
                        )
                      }
                    >
                      {updatingPublicVisibilityKey === `${selectedActivityUser.username}:show_on_yaru_chart`
                        ? 'Updating...'
                        : selectedActivityUser.profile?.show_on_yaru_chart === false
                          ? 'Show on Org Chart'
                          : 'Hide from Org Chart'}
                    </button>
                    <button
                      className="ghost compact-button"
                      disabled={
                        updatingPublicVisibilityKey ===
                        `${selectedActivityUser.username}:show_live_contributions`
                      }
                      onClick={() =>
                        updatePersonPublicVisibility(
                          selectedActivityUser,
                          'show_live_contributions',
                          selectedActivityUser.profile?.show_live_contributions === false,
                        )
                      }
                    >
                      {updatingPublicVisibilityKey ===
                      `${selectedActivityUser.username}:show_live_contributions`
                        ? 'Updating...'
                        : selectedActivityUser.profile?.show_live_contributions === false
                          ? 'Show Live Contributions'
                          : 'Hide Live Contributions'}
                    </button>
                    <button
                      className="ghost compact-button"
                      type="button"
                      aria-expanded={showEmailLog}
                      onClick={() => setShowEmailLog((current) => !current)}
                    >
                      {showEmailLog ? 'Hide email log' : 'View email log'}
                    </button>
                    <button
                      className="ghost compact-button"
                      type="button"
                      disabled={loadingActivity}
                      onClick={() => loadPersonActivity(selectedActivityUser)}
                    >
                      {showActivityLog ? 'Refresh action log' : 'View action log'}
                    </button>
                    {showActivityLog && (
                      <p className="muted">Latest 500 actions are shown. Audit records stay in the system.</p>
                    )}
                  </div>
                  {showAccountControls && (
                    <div className="admin-account-controls">
                      <div className="section-heading">
                        <div>
                          <p className="profile-kicker">Account Controls</p>
                          <h3>Access and Review</h3>
                        </div>
                      </div>
                      {selectedActivityUser.username === currentUser.username && (
                        <p className="alert warning">
                          Safety check: you cannot deactivate your own admin account or revoke your own admin
                          access.
                        </p>
                      )}
                      {selectedActivityUser.pending_account_flags?.length > 0 && (
                        <div className="admin-account-flag-list">
                          {selectedActivityUser.pending_account_flags.map((flag) => (
                            <article key={flag.action_id} className="admin-account-flag-card">
                              <div>
                                <strong>Flagged by @{flag.admin}</strong>
                                <p className="meta">{flag.notes}</p>
                                <p className="meta">Created {formatDate(flag.created_at)}</p>
                              </div>
                              <div className="actions">
                                <button
                                  type="button"
                                  className="ghost compact-button"
                                  disabled={Boolean(accountActionLoading)}
                                  onClick={() =>
                                    runAccountAction(selectedActivityUser, 'clear-flag', {
                                      flagId: flag.action_id,
                                    })
                                  }
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  className="ghost compact-button danger"
                                  disabled={Boolean(accountActionLoading)}
                                  onClick={() =>
                                    runAccountAction(selectedActivityUser, 'confirm-flag', {
                                      flagId: flag.action_id,
                                    })
                                  }
                                >
                                  Confirm
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      <label className="field" htmlFor="admin-account-action-notes">
                        <span>Account action notes</span>
                        <textarea
                          id="admin-account-action-notes"
                          rows={3}
                          value={accountActionNotes}
                          onChange={(event) => setAccountActionNotes(event.target.value)}
                          placeholder="Required for deactivation, role revocation, suspicious flags, and flag resolution."
                        />
                      </label>
                      <div className="admin-account-action-grid">
                        <button
                          type="button"
                          className={
                            selectedActivityUser.is_active ? 'ghost compact-button danger' : 'compact-button'
                          }
                          disabled={
                            Boolean(accountActionLoading) ||
                            (selectedActivityUser.username === currentUser.username &&
                              selectedActivityUser.is_active)
                          }
                          onClick={() =>
                            runAccountAction(
                              selectedActivityUser,
                              selectedActivityUser.is_active ? 'deactivate' : 'activate',
                            )
                          }
                        >
                          {accountActionLoading === 'activate' || accountActionLoading === 'deactivate'
                            ? 'Updating...'
                            : selectedActivityUser.is_active
                              ? 'Deactivate Account'
                              : 'Reactivate Account'}
                        </button>
                        <button
                          type="button"
                          className="ghost compact-button"
                          disabled={
                            Boolean(accountActionLoading) ||
                            !selectedActivityUser.email ||
                            !selectedActivityUser.is_active
                          }
                          onClick={() => runAccountAction(selectedActivityUser, 'password-reset')}
                        >
                          {accountActionLoading === 'password-reset' ? 'Sending...' : 'Send Password Reset'}
                        </button>
                        <button
                          type="button"
                          className="ghost compact-button"
                          disabled={
                            Boolean(accountActionLoading) ||
                            selectedActivityUser.pending_account_flags?.length > 0
                          }
                          onClick={() => runAccountAction(selectedActivityUser, 'flag-suspicious')}
                        >
                          {accountActionLoading === 'flag-suspicious' ? 'Flagging...' : 'Flag Suspicious'}
                        </button>
                      </div>
                      <div className="admin-role-revoke-row">
                        <label className="field" htmlFor="admin-role-revoke-select">
                          <span>Role to revoke</span>
                          <select
                            id="admin-role-revoke-select"
                            value={roleToRevoke}
                            onChange={(event) => setRoleToRevoke(event.target.value)}
                          >
                            {selectedRevokableRoles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </select>
                          {roleToRevoke === 'reviewer' && (
                            <small className="hint">
                              This removes reviewer tools and keeps contributor access.
                            </small>
                          )}
                        </label>
                        <button
                          type="button"
                          className="ghost compact-button danger"
                          disabled={
                            Boolean(accountActionLoading) ||
                            !selectedCanRevokeRole ||
                            (selectedActivityUser.username === currentUser.username &&
                              roleToRevoke === 'admin')
                          }
                          onClick={() => runAccountAction(selectedActivityUser, 'revoke-role')}
                        >
                          {accountActionLoading === 'revoke-role'
                            ? 'Updating...'
                            : revokeRoleButtonLabel(roleToRevoke)}
                        </button>
                      </div>
                    </div>
                  )}
                  {showEmailLog && (
                    <section className="admin-person-email-log">
                      <div className="section-heading">
                        <div>
                          <p className="profile-kicker">Email Log</p>
                          <h3>Messages Sent</h3>
                        </div>
                      </div>
                      {selectedEmailLog.length === 0 ? (
                        <p className="muted">
                          No setup reminder or password reset emails have been sent yet.
                        </p>
                      ) : (
                        <div className="admin-activity-list admin-email-log-list">
                          {selectedEmailLog.map((row) => (
                            <article key={row.action_id} className="admin-activity-row">
                              <div>
                                <strong>{row.label}</strong>
                                <p>
                                  {[
                                    row.recipient_email,
                                    row.sent_by ? `sent by @${row.sent_by}` : '',
                                    row.notes,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                              <time>{formatDate(row.created_at)}</time>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                  {showActivityLog && loadingActivity && <p className="muted">Loading action log...</p>}
                  {showActivityLog && !loadingActivity && activityRows.length === 0 && (
                    <p className="muted">No recorded activity for this person yet.</p>
                  )}
                  {showActivityLog && activityRows.length > 0 && (
                    <div className="admin-activity-list">
                      {activityRows.map((row) => (
                        <article key={row.id} className="admin-activity-row">
                          <div>
                            <strong>{row.label}</strong>
                            <p>{[row.target_label, row.detail].filter(Boolean).join(' · ')}</p>
                          </div>
                          <time>{formatDate(row.created_at)}</time>
                        </article>
                      ))}
                    </div>
                  )}
                </aside>
              </div>
            )}
          </div>
        </>
      )}

      {isAdmin && activeTab === 'archive' && (
        <section className="admin-archive-page">
          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}

          <div className="admin-archive-toolbar">
            <div>
              <h2>Entry Archive</h2>
            </div>
            <label className="field" htmlFor="archive-search">
              <span>Search entries</span>
              <input
                id="archive-search"
                value={archiveSearch}
                onChange={(event) => setArchiveSearch(event.target.value)}
                placeholder="Title, term, or contributor"
              />
            </label>
          </div>

          <div className="admin-archive-summary desk-stats" aria-label="Archive summary">
            <article>
              <p className="stat-label">Archived</p>
              <p className="stat-value">{archiveInventory.counts.archived}</p>
            </article>
          </div>

          {loadingArchive && <p className="muted">Loading archive records...</p>}

          <div className="admin-archive-grid admin-archive-grid-single">
            <section className="admin-app-card admin-archive-panel">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Preserved Records</p>
                  <h2>Archived</h2>
                </div>
                <span className="badge status-pending">{archiveInventory.archived.length}</span>
              </div>
              <p className="muted">
                Hidden records remain preserved and can be restored to the public archive.
              </p>
              <div className="admin-archive-list">
                {!loadingArchive && archiveInventory.archived.length === 0 && (
                  <p className="muted">No archived entries match this search.</p>
                )}
                {archiveInventory.archived.map((row) => (
                  <article className="admin-archive-row" key={`${row.target_type}-${row.target_id}`}>
                    <div>
                      <strong>{row.title}</strong>
                      <p className="meta">
                        {row.target_type === 'dictionary' ? 'Dictionary' : 'Folklore'} · @
                        {row.contributor_username || 'unknown'}
                      </p>
                      <p className="meta">Archived {formatDate(row.archived_at)}</p>
                    </div>
                    <button
                      type="button"
                      className="ghost compact-button"
                      onClick={() => beginArchiveAction(row, 'restore_approved')}
                    >
                      Restore
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>

          {archiveActionTarget && (
            <div
              className="admin-archive-action-backdrop"
              role="presentation"
              onClick={savingArchiveAction ? undefined : () => setArchiveActionTarget(null)}
            >
              <section
                className="admin-archive-action-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="archive-action-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="section-heading">
                  <div>
                    <p className="profile-kicker">Admin Lifecycle Action</p>
                    <h2 id="archive-action-title">
                      {archiveActionTarget.action === 'archive' ? 'Archive entry?' : 'Restore entry?'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="ghost compact-button"
                    disabled={savingArchiveAction}
                    onClick={() => setArchiveActionTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
                <p>
                  <strong>{archiveActionTarget.title}</strong>
                </p>
                <p className="muted">
                  {archiveActionTarget.action === 'archive'
                    ? 'This removes the entry from public use while preserving its record and contribution history.'
                    : 'This returns the preserved entry to approved public status.'}
                </p>
                <form className="admin-archive-action-form" onSubmit={submitArchiveAction}>
                  <label className="field" htmlFor="archive-action-notes">
                    <span>Admin notes *</span>
                    <textarea
                      id="archive-action-notes"
                      rows={4}
                      value={archiveActionNotes}
                      onChange={(event) => setArchiveActionNotes(event.target.value)}
                      placeholder="Explain why this entry is being archived or restored."
                    />
                  </label>
                  <button
                    type="submit"
                    className={archiveActionTarget.action === 'archive' ? 'danger' : ''}
                    disabled={savingArchiveAction}
                  >
                    {savingArchiveAction
                      ? 'Saving...'
                      : archiveActionTarget.action === 'archive'
                        ? 'Archive Entry'
                        : 'Restore Entry'}
                  </button>
                </form>
              </section>
            </div>
          )}
        </section>
      )}

      {isAdmin && activeTab === 'site' && (
        <form className="admin-site-content-layout" onSubmit={saveSiteContent}>
          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}
          {loadingSiteContent && <p className="muted">Loading site content...</p>}
          {activeSiteContentSection && activeSiteContentSection !== 'resources' && (
            <p className="alert warning">
              You are editing live public site text. Saving will publish this change for visitors immediately.
            </p>
          )}
          {activeSiteContentSection === 'resources' && (
            <p className="alert warning">
              Guide file changes update the Resources page as soon as each file is saved.
            </p>
          )}

          <section
            className={`admin-site-content-picker${activeSiteContentSection ? ' has-active-editor' : ''}`}
            aria-labelledby="site-content-picker-title"
          >
            <div className="admin-site-content-picker-heading">
              <div>
                <p className="profile-kicker">Content Manager</p>
                <h2 id="site-content-picker-title">What do you want to edit?</h2>
                <p className="muted">
                  {activeSiteContentSection
                    ? 'Switch sections here. Unsaved edits remain until you save or reset.'
                    : 'Choose a section below. Only its editing fields will open.'}
                </p>
              </div>
              {activeSiteContentSection && (
                <button
                  type="button"
                  className="ghost compact-button"
                  onClick={() => setActiveSiteContentSection('')}
                >
                  Close Editor
                </button>
              )}
            </div>
            <div className="admin-site-content-menu">
              {SITE_CONTENT_SECTIONS.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={`admin-site-content-menu-card${activeSiteContentSection === section.id ? ' active' : ''}`}
                  aria-pressed={activeSiteContentSection === section.id}
                  onClick={() => setActiveSiteContentSection(section.id)}
                >
                  <span className="profile-kicker">{section.eyebrow}</span>
                  <strong>{section.title}</strong>
                  <span>{section.description}</span>
                  <b>{activeSiteContentSection === section.id ? 'Editing now' : 'Edit section'}</b>
                </button>
              ))}
            </div>
          </section>

          {!activeSiteContentSection && !loadingSiteContent && (
            <div className="admin-site-content-empty">
              <p>Select a content section above to open its editor.</p>
            </div>
          )}

          {activeSiteContentSection === 'brand' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Site Identity</p>
                  <h2>Brand & Landing Page</h2>
                </div>
              </div>
              <div className="admin-brand-editor">
                <div className="admin-brand-logo-editor">
                  {siteContentForm.brand_logo_url ? (
                    <img src={siteContentForm.brand_logo_url} alt="" />
                  ) : (
                    <div className="admin-brand-logo-placeholder" aria-hidden="true">
                      {(siteContentForm.brand_name || 'CI').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <label className="photo-upload-button" htmlFor="site-brand-logo">
                      {siteContentForm.brand_logo_url ? 'Replace Brand Logo' : 'Upload Brand Logo'}
                    </label>
                    <input
                      id="site-brand-logo"
                      type="file"
                      accept="image/*"
                      disabled={uploadingBrandLogo}
                      onChange={(event) => uploadBrandLogo(event.target.files?.[0])}
                    />
                    <p className="hint">
                      {uploadingBrandLogo
                        ? 'Uploading logo...'
                        : 'Used in the header, landing page, and About page.'}
                    </p>
                  </div>
                </div>
                <label className="field" htmlFor="site-brand-name">
                  <span>Brand name</span>
                  <input
                    id="site-brand-name"
                    value={siteContentForm.brand_name}
                    onChange={(event) => setSiteContentField('brand_name', event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="site-landing-intro">
                  <span>First slide introduction</span>
                  <textarea
                    id="site-landing-intro"
                    rows={4}
                    value={siteContentForm.landing_intro_text}
                    onChange={(event) => setSiteContentField('landing_intro_text', event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="site-landing-body">
                  <span>First slide supporting text</span>
                  <textarea
                    id="site-landing-body"
                    rows={4}
                    value={siteContentForm.landing_body_text}
                    onChange={(event) => setSiteContentField('landing_body_text', event.target.value)}
                  />
                </label>
                <div className="admin-brand-footer-fields">
                  <label className="field" htmlFor="site-footer-left">
                    <span>Footer left</span>
                    <input
                      id="site-footer-left"
                      value={siteContentForm.footer_left_text}
                      onChange={(event) => setSiteContentField('footer_left_text', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="site-footer-center">
                    <span>Footer center</span>
                    <input
                      id="site-footer-center"
                      value={siteContentForm.footer_center_text}
                      onChange={(event) => setSiteContentField('footer_center_text', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="site-footer-right">
                    <span>Footer right</span>
                    <input
                      id="site-footer-right"
                      value={siteContentForm.footer_right_text}
                      onChange={(event) => setSiteContentField('footer_right_text', event.target.value)}
                    />
                  </label>
                </div>
              </div>
            </section>
          )}

          {activeSiteContentSection === 'maintenance' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card admin-maintenance-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Operations</p>
                  <h2>Site Access Mode</h2>
                </div>
              </div>
              <div className="admin-site-access-mode" role="group" aria-label="Site access mode">
                {[
                  ['open', 'Open', 'Anyone can visit and submit contributions.'],
                  ['beta', 'Beta Lock', 'Only people with beta access can enter.'],
                  ['maintenance', 'Maintenance', 'Pause public access while admins keep working.'],
                ].map(([mode, label, detail]) => (
                  <button
                    type="button"
                    key={`site-mode-${mode}`}
                    className={siteMode === mode ? 'active' : ''}
                    disabled={savingSiteMode}
                    onClick={() => setSiteAccessMode(mode)}
                  >
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </button>
                ))}
              </div>
              <p className="muted">
                Current mode:{' '}
                <strong>
                  {siteMode === 'open' ? 'Open' : siteMode === 'beta' ? 'Beta Lock' : 'Maintenance'}
                </strong>
                {savingSiteMode ? ' · Updating...' : ''}
              </p>
              <label className="checkbox-inline checkbox-inline-spacious" htmlFor="site-maintenance-enabled">
                <input
                  id="site-maintenance-enabled"
                  type="checkbox"
                  checked={siteContentForm.maintenance_enabled}
                  onChange={(event) => {
                    setSiteContentField('maintenance_enabled', event.target.checked)
                    if (event.target.checked) setSiteContentField('beta_locked', true)
                  }}
                />
                <span>Pause public site access</span>
              </label>
              <p className="muted">
                Visitors and non-admin accounts will see the maintenance message. Admins can still log in and
                use Steward's Desk to turn this off.
              </p>
              <label className="field" htmlFor="site-maintenance-message">
                <span>Visitor message</span>
                <textarea
                  id="site-maintenance-message"
                  rows={4}
                  value={siteContentForm.maintenance_message}
                  onChange={(event) => setSiteContentField('maintenance_message', event.target.value)}
                />
              </label>
            </section>
          )}

          {activeSiteContentSection === 'about' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Public Pages</p>
                  <h2>About Page</h2>
                </div>
              </div>
              <label className="field" htmlFor="site-about-heading">
                <span>Heading</span>
                <input
                  id="site-about-heading"
                  value={siteContentForm.about_heading}
                  onChange={(event) => setSiteContentField('about_heading', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-about-intro">
                <span>Intro paragraphs</span>
                <textarea
                  id="site-about-intro"
                  rows={5}
                  value={siteContentForm.about_intro_text}
                  onChange={(event) => setSiteContentField('about_intro_text', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-about-body">
                <span>Main description</span>
                <textarea
                  id="site-about-body"
                  rows={7}
                  value={siteContentForm.about_body_text}
                  onChange={(event) => setSiteContentField('about_body_text', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-about-rationale">
                <span>Rationale</span>
                <textarea
                  id="site-about-rationale"
                  rows={6}
                  value={siteContentForm.about_rationale_text}
                  onChange={(event) => setSiteContentField('about_rationale_text', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-about-future">
                <span>Future directions</span>
                <textarea
                  id="site-about-future"
                  rows={6}
                  value={siteContentForm.about_future_text}
                  onChange={(event) => setSiteContentField('about_future_text', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-about-quote">
                <span>Closing quote</span>
                <textarea
                  id="site-about-quote"
                  rows={3}
                  value={siteContentForm.about_final_quote}
                  onChange={(event) => setSiteContentField('about_final_quote', event.target.value)}
                />
              </label>
            </section>
          )}

          {activeSiteContentSection === 'yaru' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Public Pages</p>
                  <h2>Digital Yaru Intro</h2>
                </div>
              </div>
              <label className="field" htmlFor="site-yaru-heading">
                <span>Heading</span>
                <input
                  id="site-yaru-heading"
                  value={siteContentForm.yaru_heading}
                  onChange={(event) => setSiteContentField('yaru_heading', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-yaru-intro">
                <span>Intro paragraphs</span>
                <textarea
                  id="site-yaru-intro"
                  rows={6}
                  value={siteContentForm.yaru_intro_text}
                  onChange={(event) => setSiteContentField('yaru_intro_text', event.target.value)}
                />
              </label>
            </section>
          )}

          {activeSiteContentSection === 'support' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">About Page</p>
                  <h2>Statements of Support</h2>
                </div>
                <button
                  type="button"
                  className="ghost compact-button"
                  onClick={() => addSiteContentRow('support_statements')}
                >
                  Add Statement
                </button>
              </div>
              <div className="admin-site-repeat-list">
                {siteContentForm.support_statements.map((row, index) => (
                  <article key={`site-support-${index}`} className="admin-site-repeat-row">
                    <label className="field" htmlFor={`site-support-quote-${index}`}>
                      <span>Statement</span>
                      <textarea
                        id={`site-support-quote-${index}`}
                        rows={3}
                        value={row.quote}
                        onChange={(event) =>
                          updateSiteContentRow('support_statements', index, 'quote', event.target.value)
                        }
                      />
                    </label>
                    <div className="field-grid">
                      <label className="field" htmlFor={`site-support-name-${index}`}>
                        <span>Name</span>
                        <input
                          id={`site-support-name-${index}`}
                          value={row.name}
                          onChange={(event) =>
                            updateSiteContentRow('support_statements', index, 'name', event.target.value)
                          }
                        />
                      </label>
                      <label className="field" htmlFor={`site-support-role-${index}`}>
                        <span>Role or affiliation</span>
                        <input
                          id={`site-support-role-${index}`}
                          value={row.role}
                          onChange={(event) =>
                            updateSiteContentRow('support_statements', index, 'role', event.target.value)
                          }
                        />
                      </label>
                    </div>
                    {siteContentForm.support_statements.length > 1 && (
                      <button
                        type="button"
                        className="ghost compact-button danger"
                        onClick={() => removeSiteContentRow('support_statements', index)}
                      >
                        Remove Statement
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSiteContentSection === 'partners' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">About Page</p>
                  <h2>Supporting Organizations</h2>
                </div>
                <button
                  type="button"
                  className="ghost compact-button"
                  onClick={() => addSiteContentRow('partner_details')}
                >
                  Add Supporting Organization
                </button>
              </div>
              <div className="admin-site-repeat-list">
                {siteContentForm.partner_details.map((row, index) => (
                  <article key={`site-partner-${index}`} className="admin-site-repeat-row">
                    <div className="field-grid">
                      <label className="field" htmlFor={`site-partner-name-${index}`}>
                        <span>Supporting organization name</span>
                        <input
                          id={`site-partner-name-${index}`}
                          value={row.name}
                          onChange={(event) =>
                            updateSiteContentRow('partner_details', index, 'name', event.target.value)
                          }
                        />
                      </label>
                      <label className="field" htmlFor={`site-partner-url-${index}`}>
                        <span>Website or profile link</span>
                        <input
                          id={`site-partner-url-${index}`}
                          value={row.url}
                          onChange={(event) =>
                            updateSiteContentRow('partner_details', index, 'url', event.target.value)
                          }
                          placeholder="https://"
                        />
                      </label>
                    </div>
                    <div className="admin-partner-logo-editor">
                      {row.logo_url ? (
                        <img src={row.logo_url} alt="" />
                      ) : (
                        <div className="admin-partner-logo-placeholder" aria-hidden="true">
                          {(row.name || 'Supporting Organization').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <label className="photo-upload-button" htmlFor={`site-partner-logo-${index}`}>
                          {row.logo_url ? 'Replace Logo' : 'Upload Logo'}
                        </label>
                        <input
                          id={`site-partner-logo-${index}`}
                          type="file"
                          accept="image/*"
                          disabled={uploadingPartnerLogoIndex === index}
                          onChange={(event) => uploadPartnerLogo(index, event.target.files?.[0])}
                        />
                        <p className="hint">
                          {uploadingPartnerLogoIndex === index
                            ? 'Uploading logo...'
                            : 'PNG or WebP with a transparent background works best.'}
                        </p>
                      </div>
                    </div>
                    {siteContentForm.partner_details.length > 1 && (
                      <button
                        type="button"
                        className="ghost compact-button danger"
                        onClick={() => removeSiteContentRow('partner_details', index)}
                      >
                        Remove Supporting Organization
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSiteContentSection === 'faq' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Help Center</p>
                  <h2>FAQs and Guide Sections</h2>
                </div>
                <button type="button" className="ghost compact-button" onClick={addFaqSection}>
                  Add FAQ Section
                </button>
              </div>
              <p className="muted">
                Choose which roles can see each section. Upload screenshots, graphs, or diagrams on individual
                questions.
              </p>
              <div className="admin-site-repeat-list">
                {siteContentForm.faq_sections.map((section, sectionIndex) => (
                  <article
                    key={`faq-section-${sectionIndex}`}
                    className="admin-site-repeat-row admin-faq-section-editor"
                  >
                    <div className="field-grid">
                      <label className="field" htmlFor={`faq-section-title-${sectionIndex}`}>
                        <span>Section title</span>
                        <input
                          id={`faq-section-title-${sectionIndex}`}
                          value={section.title}
                          onChange={(event) => updateFaqSection(sectionIndex, 'title', event.target.value)}
                        />
                      </label>
                      <label className="field" htmlFor={`faq-section-id-${sectionIndex}`}>
                        <span>Anchor ID</span>
                        <input
                          id={`faq-section-id-${sectionIndex}`}
                          value={section.id}
                          onChange={(event) => updateFaqSection(sectionIndex, 'id', event.target.value)}
                          placeholder="example-faq-section"
                        />
                      </label>
                    </div>
                    <label className="field" htmlFor={`faq-section-intro-${sectionIndex}`}>
                      <span>Intro text</span>
                      <textarea
                        id={`faq-section-intro-${sectionIndex}`}
                        rows={3}
                        value={section.intro}
                        onChange={(event) => updateFaqSection(sectionIndex, 'intro', event.target.value)}
                      />
                    </label>
                    <fieldset className="admin-faq-role-selector">
                      <legend>Visible to</legend>
                      {FAQ_ROLE_OPTIONS.map((role) => (
                        <label key={role.value}>
                          <input
                            type="checkbox"
                            checked={section.roles.includes(role.value)}
                            onChange={() => toggleFaqSectionRole(sectionIndex, role.value)}
                          />
                          <span>{role.label}</span>
                        </label>
                      ))}
                    </fieldset>

                    <div className="admin-faq-item-list">
                      {section.items.map((item, itemIndex) => (
                        <article
                          key={`faq-section-${sectionIndex}-item-${itemIndex}`}
                          className="admin-faq-item-editor"
                        >
                          <div className="section-heading compact-heading">
                            <h3>Question {itemIndex + 1}</h3>
                            {section.items.length > 1 && (
                              <button
                                type="button"
                                className="ghost compact-button danger"
                                onClick={() => removeFaqItem(sectionIndex, itemIndex)}
                              >
                                Remove Question
                              </button>
                            )}
                          </div>
                          <label className="field" htmlFor={`faq-question-${sectionIndex}-${itemIndex}`}>
                            <span>Question</span>
                            <input
                              id={`faq-question-${sectionIndex}-${itemIndex}`}
                              value={item.q}
                              onChange={(event) =>
                                updateFaqItem(sectionIndex, itemIndex, 'q', event.target.value)
                              }
                            />
                          </label>
                          <label className="field" htmlFor={`faq-answer-${sectionIndex}-${itemIndex}`}>
                            <span>Answer</span>
                            <textarea
                              id={`faq-answer-${sectionIndex}-${itemIndex}`}
                              rows={4}
                              value={item.a}
                              onChange={(event) =>
                                updateFaqItem(sectionIndex, itemIndex, 'a', event.target.value)
                              }
                            />
                          </label>
                          <label className="field" htmlFor={`faq-bullets-${sectionIndex}-${itemIndex}`}>
                            <span>Bullet points</span>
                            <textarea
                              id={`faq-bullets-${sectionIndex}-${itemIndex}`}
                              rows={3}
                              value={item.bullets_text}
                              onChange={(event) =>
                                updateFaqItem(sectionIndex, itemIndex, 'bullets_text', event.target.value)
                              }
                              placeholder="One bullet per paragraph or separated by blank lines"
                            />
                          </label>
                          <div className="admin-faq-media-editor">
                            <label className="field" htmlFor={`faq-image-url-${sectionIndex}-${itemIndex}`}>
                              <span>Image URL</span>
                              <input
                                id={`faq-image-url-${sectionIndex}-${itemIndex}`}
                                value={item.image_url}
                                onChange={(event) =>
                                  updateFaqItem(sectionIndex, itemIndex, 'image_url', event.target.value)
                                }
                                placeholder="Upload or paste an image URL"
                              />
                            </label>
                            <label className="field" htmlFor={`faq-image-alt-${sectionIndex}-${itemIndex}`}>
                              <span>Image caption / alt text</span>
                              <input
                                id={`faq-image-alt-${sectionIndex}-${itemIndex}`}
                                value={item.image_alt}
                                onChange={(event) =>
                                  updateFaqItem(sectionIndex, itemIndex, 'image_alt', event.target.value)
                                }
                              />
                            </label>
                            <label
                              className="field faq-image-upload"
                              htmlFor={`faq-image-upload-${sectionIndex}-${itemIndex}`}
                            >
                              <span>Upload screenshot or graph</span>
                              <input
                                id={`faq-image-upload-${sectionIndex}-${itemIndex}`}
                                type="file"
                                accept="image/*"
                                disabled={uploadingFaqImageKey === `${sectionIndex}-${itemIndex}`}
                                onChange={(event) =>
                                  uploadFaqImage(sectionIndex, itemIndex, event.target.files?.[0])
                                }
                              />
                            </label>
                            {item.image_url && (
                              <figure className="admin-faq-image-preview">
                                <img src={item.image_url} alt={item.image_alt || ''} />
                                {item.image_alt && <figcaption>{item.image_alt}</figcaption>}
                              </figure>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="ghost compact-button"
                        onClick={() => addFaqItem(sectionIndex)}
                      >
                        Add Question
                      </button>
                      {siteContentForm.faq_sections.length > 1 && (
                        <button
                          type="button"
                          className="ghost compact-button danger"
                          onClick={() => removeFaqSection(sectionIndex)}
                        >
                          Remove Section
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSiteContentSection === 'resources' && (
            <section
              className="admin-app-card admin-site-content-card admin-site-editor-card admin-resource-manager"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target?.tagName !== 'TEXTAREA') event.preventDefault()
              }}
            >
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Help Center</p>
                  <h2>Guide Files</h2>
                  <p className="muted">Upload PDFs and presentation files for the public Resources page.</p>
                </div>
                <a className="ghost compact-button" href={ROUTES.resources} target="_blank" rel="noreferrer">
                  View Resources Page
                </a>
              </div>

              <div className="admin-resource-grid">
                <section className="admin-resource-form-panel">
                  <div className="section-heading compact-heading">
                    <h3>{editingResourceId ? 'Edit Guide File' : 'Add Guide File'}</h3>
                    {editingResourceId && (
                      <button type="button" className="ghost compact-button" onClick={resetResourceForm}>
                        New File
                      </button>
                    )}
                  </div>
                  <label className="field" htmlFor="resource-title">
                    <span>Title</span>
                    <input
                      id="resource-title"
                      value={resourceForm.title}
                      onChange={(event) => updateResourceForm('title', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="resource-description">
                    <span>Description</span>
                    <textarea
                      id="resource-description"
                      rows={4}
                      value={resourceForm.description}
                      onChange={(event) => updateResourceForm('description', event.target.value)}
                    />
                  </label>
                  <div className="field-grid">
                    <label className="field" htmlFor="resource-category">
                      <span>Category</span>
                      <input
                        id="resource-category"
                        value={resourceForm.category}
                        onChange={(event) => updateResourceForm('category', event.target.value)}
                        placeholder="Language Guides"
                      />
                    </label>
                    <label className="field" htmlFor="resource-visibility">
                      <span>Visibility</span>
                      <select
                        id="resource-visibility"
                        value={resourceForm.visibility}
                        onChange={(event) => updateResourceForm('visibility', event.target.value)}
                      >
                        <option value="public">All stewards</option>
                        <option value="members">Members only</option>
                        <option value="admin">Review team</option>
                      </select>
                    </label>
                  </div>
                  <label className="field" htmlFor="resource-file">
                    <span>{editingResourceId ? 'Replace file' : 'File'}</span>
                    <input
                      id="resource-file"
                      type="file"
                      accept=".pdf,.ppt,.pptx,.pps,.ppsx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      onChange={(event) => updateResourceForm('file', event.target.files?.[0] || null)}
                    />
                  </label>
                  <label className="checkbox-inline checkbox-inline-spacious" htmlFor="resource-published">
                    <input
                      id="resource-published"
                      type="checkbox"
                      checked={resourceForm.is_published}
                      onChange={(event) => updateResourceForm('is_published', event.target.checked)}
                    />
                    <span>Show this file on the Resources page</span>
                  </label>
                  <div className="actions">
                    <button
                      type="button"
                      disabled={
                        savingResource ||
                        !resourceForm.title.trim() ||
                        (!editingResourceId && !resourceForm.file)
                      }
                      onClick={saveResource}
                    >
                      {savingResource
                        ? 'Saving...'
                        : editingResourceId
                          ? 'Save Guide File'
                          : 'Upload Guide File'}
                    </button>
                    <button type="button" className="ghost" onClick={resetResourceForm}>
                      Clear
                    </button>
                  </div>
                </section>

                <section className="admin-resource-list-panel">
                  <div className="section-heading compact-heading">
                    <h3>Uploaded Files</h3>
                    <button
                      type="button"
                      className="ghost compact-button"
                      disabled={loadingResources}
                      onClick={loadResources}
                    >
                      {loadingResources ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  {!loadingResources && resourceRows.length === 0 && (
                    <p className="muted">No guide files uploaded yet.</p>
                  )}
                  <div className="admin-resource-list">
                    {resourceRows.map((resource) => (
                      <article className="admin-resource-row" key={resource.id}>
                        <div>
                          <strong>{resource.title}</strong>
                          {resource.description && <p>{resource.description}</p>}
                          <p className="meta">
                            {[
                              resource.category,
                              resourceVisibilityLabel(resource.visibility),
                              resourceStatusLabel(resource),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {resource.filename && <p className="meta">{resource.filename}</p>}
                        </div>
                        <div className="admin-resource-actions">
                          {resource.download_url && (
                            <a
                              className="ghost compact-button"
                              href={`${import.meta.env.VITE_API_BASE || ''}${resource.download_url}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          )}
                          <button
                            type="button"
                            className="ghost compact-button"
                            onClick={() => editResource(resource)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost compact-button danger"
                            disabled={deletingResourceId === resource.id}
                            onClick={() => deleteResource(resource)}
                          >
                            {deletingResourceId === resource.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeSiteContentSection === 'policies' && (
            <section className="admin-app-card admin-site-content-card admin-site-editor-card">
              <div className="section-heading">
                <div>
                  <p className="profile-kicker">Governance</p>
                  <h2>Policy & Consent Text</h2>
                  <p className="muted">
                    Separate paragraphs with a blank line. These appear on role application and media upload
                    screens.
                  </p>
                </div>
              </div>
              <label className="field" htmlFor="site-privacy-notice">
                <span>Editable privacy notice</span>
                <textarea
                  id="site-privacy-notice"
                  rows={6}
                  value={siteContentForm.privacy_notice_text}
                  onChange={(event) => setSiteContentField('privacy_notice_text', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-media-upload-policy">
                <span>Media upload policy</span>
                <textarea
                  id="site-media-upload-policy"
                  rows={6}
                  value={siteContentForm.media_upload_policy_text}
                  onChange={(event) => setSiteContentField('media_upload_policy_text', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="site-contributor-agreement">
                <span>Contributor agreement text</span>
                <textarea
                  id="site-contributor-agreement"
                  rows={6}
                  value={siteContentForm.contributor_agreement_text}
                  onChange={(event) => setSiteContentField('contributor_agreement_text', event.target.value)}
                />
              </label>
            </section>
          )}

          {activeSiteContentSection && activeSiteContentSection !== 'resources' && (
            <div className="admin-site-save-bar">
              <button type="submit" disabled={savingSiteContent || loadingSiteContent}>
                {savingSiteContent ? 'Saving...' : 'Save Site Content'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={loadingSiteContent}
                onClick={() => loadSiteContent()}
              >
                Reset Unsaved Edits
              </button>
            </div>
          )}
          <ConfirmDialog
            open={confirmingSiteContentSave}
            title="Publish live public text?"
            message="This saves the current Site Content form and immediately updates public pages for visitors."
            detail="Review wording, links, images, and maintenance message before confirming. This action affects the live site."
            confirmLabel="Publish Changes"
            cancelLabel="Review Again"
            busyLabel="Publishing..."
            busy={savingSiteContent}
            onCancel={() => setConfirmingSiteContentSave(false)}
            onConfirm={performSiteContentSave}
          />
        </form>
      )}

      {activeTab === 'resources' && <ResourcesPage currentUser={currentUser} />}

      {activeTab === 'contributions' && (
        <section className="admin-contributions-layout">
          <div
            className="admin-app-summary contribution-summary desk-stats"
            aria-label="My contribution summary"
          >
            <article>
              <p className="stat-label">Published Total</p>
              <p className="stat-value">{contributionStats.published}</p>
            </article>
            <article>
              <p className="stat-label">Dictionary Published</p>
              <p className="stat-value">{contributionStats.dictionary}</p>
            </article>
            <article>
              <p className="stat-label">Folklore Published</p>
              <p className="stat-value">{contributionStats.folklore}</p>
            </article>
            <article>
              <p className="stat-label">Awaiting Review</p>
              <p className="stat-value">{contributionStats.awaitingReview}</p>
            </article>
          </div>
          <div className="admin-contribution-grid">
            <div className="admin-contribution-column">
              <article className="admin-app-card admin-draft-list">
                <div className="section-heading contribution-card-heading">
                  <div className="contribution-card-titlebar">
                    <div>
                      <h3>My Dictionary Contributions</h3>
                      {loadingDrafts && <p className="muted">Loading contributions...</p>}
                    </div>
                    <button
                      className="contribution-create-button"
                      onClick={() => navigate(ROUTES.dictionaryDraft)}
                    >
                      Add Entry
                    </button>
                  </div>
                </div>
                <div
                  className="admin-subtabs contribution-status-tabs"
                  aria-label="Dictionary contribution status"
                >
                  {[
                    ['drafts', 'Drafts', dictionaryDraftRows.length],
                    ['approved', 'Approved', dictionaryApprovedRows.length],
                    ['submitted', 'Submitted for Review', dictionarySubmittedRows.length],
                    ['rejected', 'Needs Changes', dictionaryRejectedRows.length],
                  ].map(([tab, label, count]) => (
                    <button
                      key={`dictionary-contribution-tab-${tab}`}
                      className={dictionaryContributionTab === tab ? 'active' : ''}
                      onClick={() => {
                        setDictionaryContributionTab(tab)
                        setDictionaryContributionPage(1)
                      }}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
                {!loadingDrafts && dictionaryDrafts.length === 0 && (
                  <p className="muted">No dictionary contributions yet.</p>
                )}
                {!loadingDrafts && dictionaryDrafts.length > 0 && dictionaryContributionRows.length === 0 && (
                  <p className="muted">No dictionary entries in this status yet.</p>
                )}
                {visibleDictionaryContributions.map((contribution) => (
                  <article key={contribution.revision_id} className="admin-draft-card">
                    <div className="queue-header">
                      <strong>{contribution.term || '(no headword)'}</strong>
                      <span className={`badge status-${contributionDisplayStatus(contribution) || 'draft'}`}>
                        {contributionStatusLabel(contributionDisplayStatus(contribution))}
                      </span>
                    </div>
                    {contribution.meaning && <p className="meta">Meaning: {contribution.meaning}</p>}
                    {contribution.part_of_speech && (
                      <p className="meta">Part of Speech: {contribution.part_of_speech}</p>
                    )}
                    <p className="meta">{contributionStatusDetail(contribution)}</p>
                    {(contribution.status === 'draft' || contribution.status === 'rejected') && (
                      <div className="admin-draft-actions">
                        <button
                          className="ghost compact-button"
                          onClick={() =>
                            navigate(
                              `${ROUTES.dictionaryDraft}?revision_id=${encodeURIComponent(contribution.revision_id)}`,
                            )
                          }
                        >
                          {contributionDisplayStatus(contribution) === 'rejected'
                            ? 'Edit Entry'
                            : 'Edit Draft'}
                        </button>
                        {contributionDisplayStatus(contribution) === 'draft' && (
                          <button
                            className="ghost compact-button danger"
                            disabled={deletingDraftId === contribution.revision_id}
                            onClick={() =>
                              setConfirmingDraftDelete({
                                type: 'dictionary',
                                revisionId: contribution.revision_id,
                                title: contribution.term || '(no headword)',
                              })
                            }
                          >
                            {deletingDraftId === contribution.revision_id ? 'Deleting...' : 'Delete Draft'}
                          </button>
                        )}
                      </div>
                    )}
                    {!['draft', 'rejected'].includes(contribution.status) && (
                      <button
                        className="ghost compact-button"
                        onClick={() => setViewingContribution({ type: 'dictionary', contribution })}
                      >
                        View Submission
                      </button>
                    )}
                    {contribution.status === 'approved' && (
                      <button
                        className="ghost compact-button"
                        onClick={() => navigate(ROUTES.dictionaryView)}
                      >
                        View Dictionary
                      </button>
                    )}
                  </article>
                ))}
                {renderContributionPagination(
                  dictionaryContributionRows,
                  dictionaryContributionPage,
                  setDictionaryContributionPage,
                  'dictionary',
                )}
              </article>
            </div>

            <div className="admin-contribution-column">
              <article className="admin-app-card admin-draft-list">
                <div className="section-heading contribution-card-heading">
                  <div className="contribution-card-titlebar">
                    <div>
                      <h3>My Folklore Contributions</h3>
                      {loadingDrafts && <p className="muted">Loading contributions...</p>}
                    </div>
                    <button
                      className="contribution-create-button"
                      onClick={() => navigate(ROUTES.folkloreDraft)}
                    >
                      Add Entry
                    </button>
                  </div>
                </div>
                <div
                  className="admin-subtabs contribution-status-tabs"
                  aria-label="Folklore contribution status"
                >
                  {[
                    ['drafts', 'Drafts', folkloreDraftRows.length],
                    ['approved', 'Approved', folkloreApprovedRows.length],
                    ['submitted', 'Submitted for Review', folkloreSubmittedRows.length],
                    ['rejected', 'Needs Changes', folkloreRejectedRows.length],
                  ].map(([tab, label, count]) => (
                    <button
                      key={`folklore-contribution-tab-${tab}`}
                      className={folkloreContributionTab === tab ? 'active' : ''}
                      onClick={() => {
                        setFolkloreContributionTab(tab)
                        setFolkloreContributionPage(1)
                      }}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
                {!loadingDrafts && folkloreDrafts.length === 0 && (
                  <p className="muted">No folklore contributions yet.</p>
                )}
                {!loadingDrafts && folkloreDrafts.length > 0 && folkloreContributionRows.length === 0 && (
                  <p className="muted">No folklore entries in this status yet.</p>
                )}
                {visibleFolkloreContributions.map((contribution) => (
                  <article key={contribution.revision_id} className="admin-draft-card">
                    <div className="queue-header">
                      <strong>{contribution.title || '(no title)'}</strong>
                      <span className={`badge status-${contributionDisplayStatus(contribution) || 'draft'}`}>
                        {contributionStatusLabel(contributionDisplayStatus(contribution))}
                      </span>
                    </div>
                    {(contribution.category || contribution.subcategory) && (
                      <p className="meta">
                        Category: {folkloreTaxonomyLabel(contribution.category, contribution.subcategory)}
                      </p>
                    )}
                    {contribution.municipality_source && (
                      <p className="meta">Municipality: {contribution.municipality_source}</p>
                    )}
                    <p className="meta">{contributionStatusDetail(contribution)}</p>
                    {(contribution.status === 'draft' || contribution.status === 'rejected') && (
                      <div className="admin-draft-actions">
                        <button
                          className="ghost compact-button"
                          onClick={() =>
                            navigate(
                              `${ROUTES.folkloreDraft}?revision_id=${encodeURIComponent(contribution.revision_id)}`,
                            )
                          }
                        >
                          {contributionDisplayStatus(contribution) === 'rejected'
                            ? 'Edit Entry'
                            : 'Edit Draft'}
                        </button>
                        {contributionDisplayStatus(contribution) === 'draft' && (
                          <button
                            className="ghost compact-button danger"
                            disabled={deletingDraftId === contribution.revision_id}
                            onClick={() =>
                              setConfirmingDraftDelete({
                                type: 'folklore',
                                revisionId: contribution.revision_id,
                                title: contribution.title || '(no title)',
                              })
                            }
                          >
                            {deletingDraftId === contribution.revision_id ? 'Deleting...' : 'Delete Draft'}
                          </button>
                        )}
                      </div>
                    )}
                    {!['draft', 'rejected'].includes(contribution.status) && (
                      <button
                        className="ghost compact-button"
                        onClick={() => setViewingContribution({ type: 'folklore', contribution })}
                      >
                        View Submission
                      </button>
                    )}
                    {contribution.status === 'approved' && (
                      <button className="ghost compact-button" onClick={() => navigate(ROUTES.folkloreView)}>
                        View Folklore
                      </button>
                    )}
                  </article>
                ))}
                {renderContributionPagination(
                  folkloreContributionRows,
                  folkloreContributionPage,
                  setFolkloreContributionPage,
                  'folklore',
                )}
              </article>
            </div>
          </div>

          {renderContributionPreviewModal()}
          <ConfirmDialog
            open={Boolean(confirmingDraftDelete)}
            title="Delete this draft?"
            message={confirmingDraftDelete ? `You are about to delete "${confirmingDraftDelete.title}".` : ''}
            detail="This removes the saved draft from your Contributions list. Submitted entries are not affected."
            confirmLabel="Delete Draft"
            cancelLabel="Keep Draft"
            busy={Boolean(deletingDraftId)}
            onCancel={() => setConfirmingDraftDelete(null)}
            onConfirm={() =>
              deleteContributionDraft(confirmingDraftDelete.type, confirmingDraftDelete.revisionId)
            }
          />
        </section>
      )}

      {canReviewRoles && activeTab === 'reviews' && (
        <ReviewerDashboardPage currentUser={currentUser} refreshToken={reviewRefreshToken} />
      )}
    </section>
  )
}
