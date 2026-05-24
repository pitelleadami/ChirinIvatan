import { useEffect } from 'react'

const ROLE_MANUALS = [
  {
    id: 'visitors',
    role: 'Visitors and Learners',
    purpose:
      'Use Chirin Ivatan as a public cultural reference. Visitors can read approved dictionary entries, browse folklore, learn about the project, and discover community contributors without needing an account.',
    canDo: [
      'Search and browse approved dictionary entries.',
      'Read approved folklore entries and view available media.',
      'Visit public contributor profiles and leaderboard pages.',
      'Learn about the project, the Yaru, FAQs, and cultural preservation goals.',
    ],
    workflow: [
      'Start on the homepage to understand the project and see recent approved entries.',
      'Open Dictionary to search for Ivatan terms or browse by starting letter.',
      'Open Folklore to explore stories, songs, proverbs, poems, laji, idioms, myths, and legends.',
      'Use About this Project and FAQs for context before citing or sharing the platform.',
      'If you notice something that needs correction, log in or ask a contributor to submit a revision.',
    ],
    responsibilities: [
      'Treat entries as cultural knowledge, not just data.',
      'Avoid copying content for commercial use.',
      'Respect attribution, source notes, and sensitive cultural context.',
      'Share the site in ways that encourage learning and preservation.',
    ],
    tips: [
      'When internet is slow, search with shorter terms first.',
      'If a page looks empty, refresh once or check whether the backend server is running.',
      'Some entries may show only fields that have verified content.',
    ],
  },
  {
    id: 'contributors',
    role: 'Registered Users and Contributors',
    purpose:
      'Help preserve Ivatan language and memory by submitting words, corrections, stories, sources, and media for review.',
    canDo: [
      'Apply for contributor access through the Role Center.',
      'Complete a public profile with municipality, affiliation, bionote, and photo.',
      'Create dictionary drafts and folklore drafts.',
      'Revise existing public entries when corrections are needed.',
      'Track your submitted revisions and receive recognition for participation.',
    ],
    workflow: [
      'Log in, open My Tools, and complete your profile first.',
      'Open Roles and apply as a contributor if you do not already have access.',
      'For a new dictionary word, open Add Dictionary Entry, fill the term, meaning, part of speech, usage, examples, source, and optional media details.',
      'For a correction, open Dictionary, choose a term, then use the revision link so the form starts from that entry.',
      'For folklore, open Add Folklore, add title, category, municipality source, story content, source, and optional media.',
      'Use Preview before saving so you can see how the public entry may look.',
      'Create Draft to receive a revision ID. Update Draft if you need changes. Submit Draft when ready for review.',
    ],
    responsibilities: [
      'Give the clearest source you can: elder, family memory, book, classroom material, field note, recording, or self-knowledge.',
      'Mark self-knowledge, self-recorded audio, and contributor-owned photos accurately.',
      'Do not upload media you do not have permission to share.',
      'Avoid submitting sacred, restricted, or sensitive materials unless community permission is clear.',
      'Use review feedback as part of the Yaru process, not as personal criticism.',
    ],
    tips: [
      'A draft is not public yet. A submitted draft becomes pending for review.',
      'Reject or flag feedback usually means the entry needs clearer source notes, spelling, meaning, or cultural context.',
      'The celebration popup appears after submission as encouragement; public credit depends on approval.',
      'If image upload fails, try a clearer, larger image or reduce file size.',
    ],
  },
  {
    id: 'reviewers',
    role: 'Reviewers',
    purpose:
      'Protect quality and cultural integrity by validating submitted dictionary and folklore revisions before publication.',
    canDo: [
      'Open the Reviewer Dashboard from My Tools.',
      'Review pending dictionary and folklore submissions.',
      'Approve accurate and well-sourced submissions.',
      'Reject submissions that should not move forward.',
      'Flag published or pending content that needs deeper re-review.',
      'Participate in role onboarding decisions when screening new contributors or reviewers.',
    ],
    workflow: [
      'Open Reviewer Dashboard and refresh the review queue.',
      'Read the proposed entry together with source notes, contributor details, and previous context.',
      'Check spelling, meaning, category, municipality relevance, source clarity, media permissions, and cultural sensitivity.',
      'Approve only when the entry is accurate enough to publish or move forward.',
      'Reject when the submission is incorrect, incomplete, duplicate, inappropriate, or unsupported.',
      'Flag when the issue needs further attention but should not be handled as a simple approve or reject.',
      'Write notes for rejects and flags so the contributor or admin understands what must be fixed.',
    ],
    responsibilities: [
      'Do not review your own submissions.',
      'Use notes generously; they are part of teaching and community care.',
      'Be especially cautious with origin stories, ritual material, living persons, sacred places, and family-specific knowledge.',
      'Prefer correction and clarification when possible, but protect the archive when content is unsafe or misleading.',
      'Remember that review is not only technical validation; it is cultural stewardship.',
    ],
    tips: [
      'Reject and flag decisions require notes.',
      'Some workflows use quorum, meaning one review may not immediately publish the item.',
      'If you are uncertain, flag or consult instead of approving too quickly.',
      'Use the public viewer pages to inspect how approved entries appear to ordinary visitors.',
    ],
  },
  {
    id: 'admins',
    role: 'Administrators',
    purpose:
      'Maintain the system, manage community access, support reviewers, and protect the long-term trustworthiness of the archive.',
    canDo: [
      'Open Community Admin to review role applications.',
      'View all people registered in the system through the People tab.',
      'Approve or reject contributor and reviewer applications.',
      'Use Django Admin Console for deeper backend management when necessary.',
      'Coordinate reviewer access, admin access, and moderation policies.',
      'Support launch readiness, data quality, backups, security, and incident response.',
    ],
    workflow: [
      'Open My Tools, then Community Admin.',
      'Use Applications to filter pending, approved, rejected, or all role applications.',
      'Open People to search users by name, username, email, municipality, or affiliation.',
      'Check roles, contribution totals, review totals, profile completeness, and public profile links.',
      'Approve applications only when accountability and community trust are clear.',
      'Use Django Admin Console for advanced edits, but keep changes conservative and documented.',
      'Before public launch, verify domain, HTTPS, backups, environment variables, admin accounts, and sample placeholder removal.',
    ],
    responsibilities: [
      'Keep admin accounts limited and protected.',
      'Never use admin tools to bypass cultural review unless there is a clear safety or maintenance reason.',
      'Preserve auditability: decisions should have notes, especially rejections and sensitive actions.',
      'Remove sample content, placeholder organizations, and test users before formal public launch.',
      'Maintain a backup and recovery plan before inviting a wider community.',
    ],
    tips: [
      'The Community Admin page is for day-to-day people and application management.',
      'The Django Admin Console is powerful and should be used carefully.',
      'If an application appears wrong, inspect the user profile before deciding.',
      'For launch, create at least one backup admin account and store credentials safely.',
    ],
  },
]

const STATUS_GUIDE = [
  ['Draft', 'Saved work that the contributor can still edit. It is not public.'],
  ['Pending', 'Submitted for reviewer validation. The contributor should wait for review notes or a decision.'],
  ['Approved', 'Accepted and visible in the public archive.'],
  ['Approved Under Review', 'Still visible but being reassessed because someone flagged a concern.'],
  ['Rejected', 'Not accepted in its current form. Review notes should explain what needs correction.'],
  ['Archived', 'Kept in the system but inactive or no longer part of the public archive.'],
]

const QUALITY_CHECKLIST = [
  'Is the word, story, spelling, translation, or category accurate?',
  'Is the municipality or variant information clear when relevant?',
  'Is the source specific enough for future researchers and reviewers?',
  'Are media uploads owned, permitted, or properly attributed?',
  'Could the entry expose sensitive, sacred, private, or restricted knowledge?',
  'Would an ordinary visitor understand the entry without extra explanation?',
  'Does the entry strengthen the archive rather than duplicate or confuse it?',
]

const TROUBLESHOOTING = [
  ['I cannot log in', 'Check the username and password, then confirm the backend server is running. If the account is inactive, ask an admin.'],
  ['I cannot submit a draft', 'Make sure required fields are filled, a revision ID exists for update/submit actions, and the backend is reachable.'],
  ['My image upload fails', 'Use a clear image with enough resolution. Avoid very small, blurry, or unsupported files.'],
  ['Approve or reject returns forbidden', 'The account may not have reviewer or admin access. Log in with the correct role or ask an admin to check groups.'],
  ['The page shows no entries', 'The public list may be empty, the backend may be offline, or filters may be too narrow. Clear filters and refresh.'],
  ['I hear no celebration sound', 'Browsers sometimes block audio depending on device settings. The popup still confirms the submission.'],
]

const DICTIONARY_FIELD_GUIDES = [
  {
    id: 'guide-pronunciation',
    title: 'Pronunciation Text',
    intro:
      'Use this field to help readers sound out the word. Write the pronunciation in a simple way that a learner can follow even without formal phonetics training.',
    include: [
      'A readable spelling guide that shows how the headword is actually pronounced.',
      'Stress or syllable breaks only if they help a beginner read the word more accurately.',
      'A pronunciation that matches the variant or municipality form you are submitting.',
    ],
    avoid: [
      'Do not repeat the headword unchanged if that adds no new help.',
      'Do not guess. Leave it blank if you are unsure and add audio later.',
      'Do not mix several pronunciation systems in one line.',
    ],
    example: 'Example: `ma-yuh` or `ra-kuh` if those forms help a learner hear the word.',
  },
  {
    id: 'guide-variants',
    title: 'Variants',
    intro:
      'Use variants when the same lexical item appears in another Ivatan form, dialect, municipality usage, or pronunciation pattern without becoming a completely different dictionary entry.',
    include: [
      'The alternate headword form itself.',
      'The correct variant type such as General Ivatan, Isamurong, Ivasay, Isabtang, or Itbayaten.',
      'Its pronunciation text if it differs from the main headword.',
      'Its own audio file or source note when available.',
    ],
    avoid: [
      'Do not use variants for unrelated synonyms.',
      'Do not use variants when the form has a clearly different meaning that deserves its own entry.',
      'Do not leave a blank variant row sitting in the draft.',
    ],
    example: 'Example: a Basco-used form and a Sabtang-used form of the same word may belong here as variants.',
  },
  {
    id: 'guide-inflected-forms',
    title: 'Inflected Forms',
    intro:
      'Inflected forms are grammatical forms of the same word. They do not create a new lexical identity, but they show how the word changes in real use.',
    include: [
      'For nouns: plural, possessive, case-related, dual, or paucal forms when relevant.',
      'For verbs: tense, aspect, mood, voice, participle, focus, polarity, or person-related forms when relevant.',
      'For adjectives and adverbs: comparative or superlative forms when relevant.',
      'For pronouns: person, number, case, inclusive/exclusive, or enclitic forms when relevant.',
      'For Ivatan-focused work: reduplicated, affixed, linker, or enclitic surface forms when these are part of actual usage.',
    ],
    avoid: [
      'Do not enter a completely different word just because it feels related.',
      'Do not force every dropdown option to be filled. Only add forms you truly know.',
      'Do not use this area for long explanations; use usage notes for that.',
    ],
    example: 'Example: a verb may include present tense, past tense, and actor-focus forms if those are known and useful.',
  },
  {
    id: 'guide-usage-notes',
    title: 'Usage Notes',
    intro:
      'Usage notes explain how, when, where, or by whom the headword is used. This is where you add social or contextual meaning that does not fit the short definition.',
    include: [
      'Whether the word is formal, old-fashioned, respectful, poetic, playful, or rarely used.',
      'Whether it is tied to a municipality, generation, context, or speech situation.',
      'Cultural caution if the word should be used carefully.',
    ],
    avoid: [
      'Do not repeat the meaning word-for-word.',
      'Do not write a full story here if the note can stay short and practical.',
      'Do not use this field as a source citation list.',
    ],
    example: 'Example: “Common among older speakers in Basco” or “Usually said in family conversation, not formal speeches.”',
  },
  {
    id: 'guide-etymology',
    title: 'Etymology',
    intro:
      'Etymology explains where the word may have come from over time: an older Ivatan root, a borrowing, an affixed form, or a historically related form.',
    include: [
      'Known roots, borrowed origins, or meaningful affix patterns if you are confident about them.',
      'Short notes about relationship to another older or better-known form.',
      'A cautious wording when the origin is probable rather than certain.',
    ],
    avoid: [
      'Do not invent an origin based only on similarity.',
      'Do not state uncertain history as absolute fact.',
      'Do not use etymology when you only want to explain present-day usage.',
    ],
    example: 'Example: “Possibly from an older root related to sea travel” or “Borrowed from Spanish, local pronunciation adapted over time.”',
  },
  {
    id: 'guide-sources',
    title: 'Source Fields',
    intro:
      'Source fields tell reviewers where the word, audio, or photo came from. These notes help the archive stay trustworthy and make later verification easier.',
    include: [
      'A person, elder, teacher, family source, notebook, recording session, publication, or community material when known.',
      'Short identifying detail such as municipality, year, or context if that helps reviewers.',
      'Self-knowledge, self-recorded, or contributor-owned checkboxes when those statements are true.',
    ],
    avoid: [
      'Do not just write “internet” or “book” without any identifying detail if you can be more specific.',
      'Do not claim self-recorded or contributor-owned unless it is accurate.',
      'Do not leave source notes vague when the entry depends on a specific person or document.',
    ],
    example: 'Example: “From interview with a Mahatao elder, February 2026” or “Recorded by contributor during family conversation in Basco.”',
  },
]

function RoleSection({ manual }) {
  return (
    <section id={manual.id} className="manual-role-section">
      <div>
        <p className="profile-kicker">Role Manual</p>
        <h2>{manual.role}</h2>
        <p>{manual.purpose}</p>
      </div>

      <div className="manual-grid">
        <article>
          <h3>What This Role Can Do</h3>
          <ul>
            {manual.canDo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article>
          <h3>Recommended Workflow</h3>
          <ol>
            {manual.workflow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </article>

        <article>
          <h3>Responsibilities</h3>
          <ul>
            {manual.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article>
          <h3>Helpful Tips</h3>
          <ul>
            {manual.tips.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}

export default function UserManualPage() {
  useEffect(() => {
    function scrollToHashTarget() {
      const hash = window.location.hash.replace('#', '')
      if (!hash) return

      window.requestAnimationFrame(() => {
        const target = document.getElementById(hash)
        if (target) {
          target.scrollIntoView({ block: 'start' })
        }
      })
    }

    scrollToHashTarget()
    window.addEventListener('hashchange', scrollToHashTarget)
    return () => window.removeEventListener('hashchange', scrollToHashTarget)
  }, [])

  return (
    <section className="manual-page">
      <header className="manual-hero">
        <p className="profile-kicker">Chirin Ivatan Guide</p>
        <h1>User Manual</h1>
        <p>
          A practical guide for everyone who uses Chirin Ivatan: visitors, contributors, reviewers, and administrators.
          This manual explains what each role can do, how work moves through the archive, and how to protect cultural
          integrity while using the system.
        </p>
      </header>

      <nav className="manual-toc" aria-label="Manual sections">
        {ROLE_MANUALS.map((manual) => (
          <a key={manual.id} href={`#${manual.id}`}>
            {manual.role}
          </a>
        ))}
        <a href="#dictionary-field-guides">Dictionary Field Guides</a>
        <a href="#statuses">Statuses</a>
        <a href="#quality">Quality Checklist</a>
        <a href="#troubleshooting">Troubleshooting</a>
      </nav>

      {ROLE_MANUALS.map((manual) => (
        <RoleSection key={manual.id} manual={manual} />
      ))}

      <section id="dictionary-field-guides" className="manual-role-section">
        <div>
          <p className="profile-kicker">Contributor Help</p>
          <h2>Dictionary Field Guides</h2>
          <p>
            These guides explain the dictionary fields that often confuse first-time contributors. The same links also
            appear directly inside the draft builder so beginners can open help while filling out the form.
          </p>
        </div>
        <div className="manual-guide-grid">
          {DICTIONARY_FIELD_GUIDES.map((guide) => (
            <article key={guide.id} id={guide.id} className="manual-guide-card">
              <h3>{guide.title}</h3>
              <p>{guide.intro}</p>
              <h4>What to Include</h4>
              <ul>
                {guide.include.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h4>What to Avoid</h4>
              <ul>
                {guide.avoid.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="manual-guide-example">{guide.example}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="statuses" className="manual-role-section">
        <div>
          <p className="profile-kicker">Shared Reference</p>
          <h2>Status Guide</h2>
          <p>These labels help everyone understand where an entry or revision is in the workflow.</p>
        </div>
        <div className="manual-definition-list">
          {STATUS_GUIDE.map(([term, description]) => (
            <article key={term}>
              <h3>{term}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="quality" className="manual-role-section">
        <div>
          <p className="profile-kicker">Before Publishing</p>
          <h2>Quality and Cultural Care Checklist</h2>
          <p>Use this checklist before submitting, reviewing, approving, or sharing cultural material.</p>
        </div>
        <ul className="manual-checklist">
          {QUALITY_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section id="troubleshooting" className="manual-role-section">
        <div>
          <p className="profile-kicker">When Something Goes Wrong</p>
          <h2>Troubleshooting</h2>
          <p>Most issues are caused by account permissions, missing required fields, or a disconnected backend server.</p>
        </div>
        <div className="manual-definition-list">
          {TROUBLESHOOTING.map(([problem, answer]) => (
            <article key={problem}>
              <h3>{problem}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
