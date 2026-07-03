export const DEFAULT_SITE_CONTENT = {
  brand_name: 'Chirin Ivatan',
  brand_logo_url: '',
  landing_intro_text:
    '— from "Chirin", meaning language, and "nu Ivatan," referring to the people and culture of Batanes — is an online dictionary and folklore archive dedicated to preserving the Ivatan language, stories, and cultural heritage in the digital age.',
  landing_body_text:
    'Developed as a community-centered initiative for cultural preservation, it welcomes Ivatans and all who wish to contribute or learn about the language and heritage to take part in safeguarding the words, stories, and living traditions that continue to shape the identity of the Ivatans.',
  footer_left_text: '© 2026 Chirin Ivatan.',
  footer_center_text: 'Developed for the preservation and continuity of the Ivatan language and heritage.',
  footer_right_text: 'Contact: chirinivatan@gmail.com',
  about_heading: 'About the project',
  about_intro_paragraphs: [
    'Chirin Ivatan is a community-built digital archive and dictionary dedicated to safeguarding the Ivatan language and folklore for future generations.',
    'Inspired by the enduring strength of the Ivatan stone house, it serves as a digital Ivatan House - a home for words, stories, and shared memory. Built in the spirit of Yaru, or cooperation, the project thrives through collective effort, by and for the Ivatan people.',
  ],
  about_body_paragraphs: [
    'At its core, Chirin Ivatan unites three integral elements: a digital Ivatan-English dictionary with media attachments; a folklore archive for traditional stories, proverbs, and songs; and a community participation system that empowers native speakers, educators, and cultural advocates to contribute and review content. By transforming oral and written traditions into an accessible digital experience, the platform helps preserve linguistic and cultural heritage, inspire learning among younger generations, and support academic and community-based research.',
    'The project was initially developed as a graduate initiative by Kristelle Adami, an Ivatan from Uyugan, Batanes and a graduate student at the University of the Philippines Open University. Rooted in her advocacy for digital cultural preservation and her belief in the Ivatan spirit of Yaru, Chirin Ivatan is envisioned to grow as a collaborative community effort dedicated to safeguarding Ivatan language and folklore.',
  ],
  about_rationale_paragraphs: [
    'The Ivatan language and folklore embody the identity, values, and worldview of the Ivatan people. Yet modernization, migration, and the growing dominance of national and global languages have weakened intergenerational transmission. With the removal of mother tongue course from the national primary education curriculum and the scarcity of accessible preservation resources, the need for a sustainable digital platform has become increasingly urgent.',
    'Chirin Ivatan responds to this challenge by combining information systems strategy and technology, and community collaboration to document, organize, and share Ivatan cultural knowledge. Guided by cultural sensitivity and community stewardship, the project demonstrates how technology can serve as a vessel for preservation, continuity, and cultural pride.',
  ],
  about_future_paragraphs: [
    'Chirin Ivatan is envisioned as a living and evolving archive that continues to grow alongside its community. Future development may include expanded collections, interactive learning tools, and stronger collaboration with schools, cultural institutions, researchers, and heritage organizations.',
    'To support long-term sustainability, the project welcomes supporting organizations and collaborative support for continued innovation, maintenance, and capacity building. Chirin Ivatan also aims to become a mobile-friendly and multilingual platform that connects Ivatans across the islands and the global diaspora.',
    'Looking ahead, the project aspires to evolve into an open-source model that other ethnolinguistic communities may adapt, contributing to a broader movement for digital heritage preservation across the Philippines and beyond.',
  ],
  about_final_quote:
    '"Chirin Ivatan is more than just a project. It is a shared act of remembrance built in the spirit of Yaru, where every word remembered and every story told helps keep the Ivatan heritage alive."',
  yaru_heading: 'The Digital Yaru',
  yaru_intro_paragraphs: [
    'Chirin Ivatan is built in the spirit of Yaru, the Ivatan embodiment of collective strength and shared purpose.',
    'The project welcomes contributors, reviewers, consultants, and supporting organizations who can lend their hands, voices, and knowledge. Whether you are a student, storyteller, educator, or simply someone who cares to help, you are invited to be part of this digital yaru.',
  ],
  support_statements: [],
  partner_details: [],
  faq_sections: [],
  terms_conditions_paragraphs: [
    'These Terms & Conditions explain how Chirin Ivatan may be used as a community dictionary, folklore archive, and stewardship platform for Ivatan heritage.',
    'By creating an account or using protected features, users agree to participate respectfully, provide truthful account information, and avoid activity that harms the archive, contributors, or the communities represented here.',
    'Accounts, submissions, and access privileges may be reviewed, limited, suspended, or removed when needed to protect cultural integrity, site security, or the mission of Chirin Ivatan.',
  ],
  privacy_notice_paragraphs: [
    'Chirin Ivatan collects account and contribution details only to manage role access, review submissions, credit contributors, and protect the integrity of the archive.',
    'Submitted names, contact details, affiliation notes, and contribution history may be reviewed by authorized stewards for moderation, accountability, and support.',
  ],
  media_upload_policy_paragraphs: [
    'Upload only media you created, have permission to share, or can clearly cite from a lawful source. Photos, audio, and video should respect people, places, cultural context, and community sensitivities.',
    'Media attached to approved entries may become visible on public archive pages. Reviewers may request source details, remove unsuitable media, or return a submission for clarification.',
  ],
  contributor_agreement_paragraphs: [
    'By applying for a role or submitting content, contributors agree to share accurate, respectful information and to provide source details when material is not personally known, created, or recorded.',
    'Contributors understand that submissions may be reviewed, edited for clarity, returned for changes, or declined when they do not meet archive standards.',
  ],
  contributor_stewardship_policy_paragraphs: [
    'By applying for a role or submitting content, contributors agree to share accurate, respectful information and to provide source details when material is not personally known, created, or recorded.',
    'Contributors understand that submissions may be reviewed, edited for clarity, returned for changes, or declined when they do not meet archive standards.',
  ],
  information_security_policy_paragraphs: [
    'Chirin Ivatan protects account and archive data through role-based access, review workflows, backups, and administrative controls appropriate for a cultural heritage platform.',
    'Users should protect their passwords, avoid sharing accounts, and report suspicious messages, account activity, or media uploads to the site administrators.',
    'Security practices may be updated as the system grows, with priority given to account safety, data integrity, and responsible stewardship of contributed cultural materials.',
  ],
  maintenance_enabled: false,
  maintenance_message: 'Chirin Ivatan is temporarily paused for maintenance. Please check back soon.',
}

const PARAGRAPH_KEYS = [
  'about_intro_paragraphs',
  'about_body_paragraphs',
  'about_rationale_paragraphs',
  'about_future_paragraphs',
  'yaru_intro_paragraphs',
  'terms_conditions_paragraphs',
  'privacy_notice_paragraphs',
  'media_upload_policy_paragraphs',
  'contributor_agreement_paragraphs',
  'contributor_stewardship_policy_paragraphs',
  'information_security_policy_paragraphs',
]

export function normalizeParagraphs(value, fallback = []) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : fallback
}

export function normalizeSiteContent(payload = {}) {
  const normalized = { ...DEFAULT_SITE_CONTENT, ...(payload || {}) }
  normalized.brand_name = String(payload?.brand_name || DEFAULT_SITE_CONTENT.brand_name).trim()
  normalized.brand_logo_url = String(payload?.brand_logo_url || '').trim()
  normalized.landing_intro_text = String(
    payload?.landing_intro_text || DEFAULT_SITE_CONTENT.landing_intro_text,
  ).trim()
  normalized.landing_body_text = String(
    payload?.landing_body_text || DEFAULT_SITE_CONTENT.landing_body_text,
  ).trim()
  normalized.footer_left_text = String(
    payload?.footer_left_text || DEFAULT_SITE_CONTENT.footer_left_text,
  ).trim()
  normalized.footer_center_text = String(
    payload?.footer_center_text || DEFAULT_SITE_CONTENT.footer_center_text,
  ).trim()
  normalized.footer_right_text = String(
    payload?.footer_right_text || DEFAULT_SITE_CONTENT.footer_right_text,
  ).trim()
  PARAGRAPH_KEYS.forEach((key) => {
    normalized[key] = normalizeParagraphs(payload?.[key], DEFAULT_SITE_CONTENT[key])
  })
  if (!payload?.contributor_stewardship_policy_paragraphs) {
    normalized.contributor_stewardship_policy_paragraphs = normalized.contributor_agreement_paragraphs
  }
  if (!payload?.contributor_agreement_paragraphs) {
    normalized.contributor_agreement_paragraphs = normalized.contributor_stewardship_policy_paragraphs
  }
  normalized.support_statements = Array.isArray(payload?.support_statements) ? payload.support_statements : []
  normalized.partner_details = Array.isArray(payload?.partner_details) ? payload.partner_details : []
  normalized.faq_sections = Array.isArray(payload?.faq_sections) ? payload.faq_sections : []
  normalized.maintenance_enabled = Boolean(payload?.maintenance_enabled)
  normalized.maintenance_message = String(
    payload?.maintenance_message || DEFAULT_SITE_CONTENT.maintenance_message,
  ).trim()
  return normalized
}

export function paragraphsToText(rows) {
  return normalizeParagraphs(rows).join('\n\n')
}

export function textToParagraphs(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}
