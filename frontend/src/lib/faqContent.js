export const ALL_FAQ_ROLES = ['visitor', 'contributor', 'reviewer', 'admin']

export const DEFAULT_FAQ_SECTIONS = [
  {
    id: 'visitors',
    title: 'For Visitors',
    roles: ALL_FAQ_ROLES,
    items: [
      {
        q: 'What is Chirin Ivatan?',
        a: 'Chirin Ivatan is a community-built digital dictionary and folklore archive focused on preserving Ivatan language, oral traditions, and cultural knowledge.',
      },
      {
        q: 'Can I use the site without an account?',
        a: 'Yes. Public visitors can browse the dictionary, folklore archive, Hall of Stewards, About page, and FAQs without signing in.',
      },
      {
        q: 'What should visitors do responsibly?',
        bullets: [
          'Treat entries as cultural knowledge, not just data.',
          'Respect attribution, source notes, and sensitive cultural context.',
          'Avoid copying content for commercial use.',
          'Share the site in ways that encourage learning and preservation.',
        ],
      },
      {
        q: 'Can I request corrections for an entry?',
        a: 'Yes. You can apply as a contributor and submit a revision, or ask an existing contributor to help route the correction through review.',
      },
    ],
  },
  {
    id: 'public-dictionary',
    title: 'Dictionary',
    roles: ALL_FAQ_ROLES,
    items: [
      {
        q: 'What can I see in a dictionary entry?',
        bullets: [
          'Headword and meaning',
          'Part of speech and variant details when available',
          'Example sentence in Ivatan and its English translation',
          'Pronunciation details and audio when uploaded',
          'Usage notes, etymology, inflected forms, source notes, and revision history when provided',
        ],
      },
      {
        q: 'Why do some entries look more complete than others?',
        a: 'Entries grow over time. Some may only have core fields first, while others include richer media, usage notes, and revisions as the community improves them.',
      },
      {
        q: 'Why are there variants or multiple word forms?',
        a: 'A word may have different municipality forms, spelling variants, or pronunciation differences. These are preserved to reflect real community usage.',
      },
    ],
  },
  {
    id: 'public-folklore',
    title: 'Folklore',
    roles: ALL_FAQ_ROLES,
    items: [
      {
        q: 'What types of folklore are included?',
        bullets: ['Traditional stories', 'Myths and legends', 'Proverbs and sayings', 'Songs and laji', 'Other oral tradition records'],
      },
      {
        q: 'Can folklore entries include media?',
        a: 'Yes. Folklore entries may include audio, photos, videos, and source context when available and culturally appropriate.',
      },
      {
        q: 'How does the platform protect sensitive cultural material?',
        a: 'Reviewers and admins can flag, limit, or reject submissions that are incomplete, inaccurate, culturally sensitive, or inappropriate for public release.',
      },
    ],
  },
  {
    id: 'joining',
    title: 'Joining and Accounts',
    roles: ALL_FAQ_ROLES,
    items: [
      {
        q: 'How do I apply as a contributor?',
        bullets: [
          'Open the Digital Yaru or Join page.',
          'Choose Contributor.',
          'Fill in your basic details, municipality, and affiliations.',
          'Submit your application.',
          'Track your application using the same email address.',
        ],
      },
      {
        q: 'Do I need to log in before applying?',
        a: 'No. You can submit an application first. After approval, your access level is activated for contribution workflows.',
      },
      {
        q: 'Can I still contribute if I am not part of an organization?',
        a: 'Yes. Community knowledge and lived language use are valid contribution pathways. Organization details help accountability, but they are not the only basis for participation.',
      },
      {
        q: 'How do I check the status of my role application?',
        a: 'Go to the Role Center and use your application email in the status lookup field. The system will show pending, partial approval, final approval, or rejection.',
      },
    ],
  },
  {
    id: 'contributors',
    title: 'Contributor Guide',
    roles: ['contributor', 'reviewer', 'admin'],
    intro:
      'Contributors help preserve Ivatan language and memory by submitting words, corrections, stories, sources, and media for review.',
    items: [
      {
        q: 'What can contributors do?',
        bullets: [
          'Complete a public profile with municipality, affiliation, bionote, and photo.',
          'Create dictionary and folklore drafts.',
          'Revise existing public entries when corrections are needed.',
          'Upload media where appropriate and permitted.',
          'Track submitted revisions and receive recognition for approved participation.',
        ],
      },
      {
        q: 'What is the recommended contributor workflow?',
        bullets: [
          'Complete your profile first.',
          'For a new dictionary word, fill the headword, meaning, examples, source, and optional media details.',
          'For a correction, open the published entry and start a revision from there.',
          'For folklore, add title, category, place, story content, source, and optional media.',
          'Use preview before saving, then save draft and submit when ready for review.',
        ],
      },
      {
        q: 'What makes a strong contribution?',
        bullets: [
          'Clear and accurate meaning or story content.',
          'Useful example sentence and translation.',
          'Specific source context when not self-knowledge.',
          'Respectful, culturally appropriate wording.',
          'Proper media attribution for audio, photo, or video uploads.',
        ],
      },
      {
        q: 'What should I avoid submitting?',
        bullets: [
          'Media you do not have permission to share.',
          'Sacred, restricted, or sensitive materials unless community permission is clear.',
          'Entries with vague source notes when the content depends on a specific person or document.',
          'Duplicate entries that do not add a real correction or variant.',
        ],
      },
    ],
  },
  {
    id: 'statuses',
    title: 'Statuses and Review Flow',
    roles: ['contributor', 'reviewer', 'admin'],
    items: [
      {
        q: 'What do content statuses mean?',
        bullets: [
          'Draft - saved work that the contributor can still edit. It is not public.',
          'Pending - submitted for reviewer validation.',
          'Approved - accepted and visible in the public archive.',
          'Approved Under Review - still visible but being reassessed because someone flagged a concern.',
          'Rejected - not accepted in its current form. Review notes should explain what needs correction.',
          'Archived - kept in the system but inactive or no longer part of the public archive.',
        ],
      },
      {
        q: 'What happens after I submit a dictionary or folklore draft?',
        a: 'Your draft enters moderation. Reviewers may approve, reject with notes, or flag it for further attention depending on quality, source reliability, and cultural sensitivity.',
      },
      {
        q: 'Why might a submission be rejected?',
        bullets: ['Incomplete information', 'Incorrect translation or category', 'Missing or vague sources', 'Inappropriate content', 'Duplicate entry'],
        outro: 'Review notes are provided so you can revise and resubmit when appropriate.',
      },
    ],
  },
  {
    id: 'quality',
    title: 'Quality and Cultural Care Checklist',
    roles: ['contributor', 'reviewer', 'admin'],
    items: [
      {
        q: 'What should I check before submitting or reviewing?',
        bullets: [
          'Is the word, story, spelling, translation, or category accurate?',
          'Is the municipality or variant information clear when relevant?',
          'Is the source specific enough for future researchers and reviewers?',
          'Are media uploads owned, permitted, or properly attributed?',
          'Could the entry expose sensitive, sacred, private, or restricted knowledge?',
          'Would an ordinary visitor understand the entry without extra explanation?',
          'Does the entry strengthen the archive rather than duplicate or confuse it?',
        ],
      },
    ],
  },
  {
    id: 'reviewers',
    title: 'Reviewer Guide',
    roles: ['reviewer', 'admin'],
    intro:
      'Reviewers protect quality and cultural integrity by validating submitted dictionary and folklore revisions before publication.',
    items: [
      {
        q: 'What can reviewers do?',
        bullets: [
          'Open the Reviewer Dashboard.',
          'Review pending dictionary and folklore submissions.',
          'Approve accurate and well-sourced submissions.',
          'Reject submissions that should not move forward.',
          'Flag published content that needs re-review.',
          'Participate in role onboarding decisions when permitted.',
        ],
      },
      {
        q: 'What should reviewers check?',
        bullets: [
          'Spelling, meaning, category, and municipality relevance.',
          'Source clarity and media permission.',
          'Duplicate or conflicting entries.',
          'Cultural sensitivity, especially for ritual material, origin stories, sacred places, family-specific knowledge, and living persons.',
        ],
      },
      {
        q: 'Can reviewers approve their own submissions?',
        a: 'No. Reviewers and admins should not approve or reject their own submissions. Their own entries should be handled by other qualified reviewers or admins.',
      },
      {
        q: 'When should I reject instead of approve?',
        a: 'Reject when the submission is incorrect, incomplete, unsupported, duplicate, inappropriate, or unsafe for public display. Add notes so the contributor understands what needs to be fixed.',
      },
      {
        q: 'When should I flag a live entry for re-review?',
        a: 'Flag a public entry only when it needs another review round. The system requires notes or justification so the concern is clear.',
      },
    ],
  },
  {
    id: 'admins',
    title: 'Administrator Guide',
    roles: ['admin'],
    intro:
      'Administrators maintain the system, manage community access, support reviewers, and protect the long-term trustworthiness of the archive.',
    items: [
      {
        q: 'What can admins do?',
        bullets: [
          'Review role applications and invitations.',
          'Inspect people, profiles, roles, public profiles, and activity logs.',
          'Approve or reject contributor and reviewer applications.',
          'Manage public site content such as About, Digital Yaru, support statements, partner details, and FAQs.',
          'Use the Django Admin Console for deeper backend management when necessary.',
        ],
      },
      {
        q: 'What is the recommended admin workflow?',
        bullets: [
          "Use Steward's Desk for day-to-day reviews, applications, people, and content settings.",
          'Check profile completeness, accountability details, and application history before deciding.',
          'Approve applications only when community trust and accountability are clear.',
          'Use Django Admin Console carefully and document sensitive changes.',
          'Before public launch, verify domain, HTTPS, backups, environment variables, admin accounts, and placeholder removal.',
        ],
      },
      {
        q: 'How should admin audit logs be used?',
        a: 'Use activity logs to understand major actions such as invitations, role decisions, revisions, reviews, and session activity. Logs are for accountability and should stay readable rather than becoming a public profile feature.',
      },
      {
        q: 'What should admins be careful about?',
        bullets: [
          'Keep admin accounts limited and protected.',
          'Do not bypass cultural review unless there is a clear safety or maintenance reason.',
          'Preserve auditability through notes, especially for rejections and sensitive actions.',
          'Remove sample content, placeholder organizations, and test users before formal launch.',
          'Maintain a backup and recovery plan before inviting a wider community.',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    roles: ALL_FAQ_ROLES,
    items: [
      {
        q: 'I cannot log in.',
        a: 'Check the username and password, then confirm the backend server is running. If the account is inactive, ask an admin.',
      },
      {
        q: 'I cannot submit a draft.',
        a: 'Make sure required fields are filled, a revision ID exists for update or submit actions, and the backend is reachable.',
      },
      {
        q: 'My image upload fails.',
        a: 'Use a clear image that is at least 200 x 200 pixels. Avoid very small, blurry, or unsupported files.',
      },
      {
        q: 'Approve or reject returns forbidden.',
        a: 'The account may not have reviewer or admin access, or the entry may already have been reviewed by that user in the same round.',
      },
      {
        q: 'The page shows no entries.',
        a: 'The public list may be empty, the backend may be offline, or filters may be too narrow. Clear filters and refresh.',
      },
    ],
  },
]

export const DICTIONARY_FIELD_GUIDES = [
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
    example: 'Example: ma-yuh or ra-kuh if those forms help a learner hear the word.',
  },
  {
    id: 'guide-variants',
    title: 'Variants',
    intro:
      'Use variants when the same lexical item appears in another Ivatan form, dialect, municipality usage, or pronunciation pattern without becoming a completely different dictionary entry.',
    include: [
      'The alternate headword form itself.',
      'The correct variant type such as Ivatan (Common Usage), Isamurungen, Ivasayen, or Itbayaten.',
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
    id: 'guide-mother-variants',
    title: 'Mother Terms and Variant Groups',
    intro:
      'A variant group keeps several forms of the same dictionary word connected. One entry acts as the mother term, while the other entries are variants of the same lexical item.',
    include: [
      'The mother term owns the shared meaning, part of speech, synonyms, antonyms, inflected forms, source text, and main photo.',
      'Each variant owns its own headword spelling, pronunciation, phonetic spelling, audio, variant type, examples, usage notes, and etymology.',
      'A new approved word becomes the mother term when it has no group yet.',
      'If a submission includes additional variants, those variants become separate connected entries that share the mother term meaning.',
      'If an approved entry is marked Ivatan (Common Usage), it becomes the mother/common form for that variant group.',
      'When a user opens a variant publicly, the page shows the clicked variant pronunciation and audio, but the meaning comes from the mother term.',
      'Revising a variant can still update the shared meaning because semantic corrections apply to the whole variant group.',
      'If a mother term is archived or removed, the system chooses the earliest approved active variant as the fallback mother.',
    ],
    avoid: [
      'Do not create a variant for a word with a different meaning. Make a separate dictionary entry instead.',
      'Do not use variants as a place for ordinary synonyms.',
      'Do not duplicate a variant with the same headword and variant type inside the same group.',
      'Do not assume each variant has its own meaning; variants share the mother term semantic core.',
    ],
    example:
      'Example: if one shared concept has an Ivatan (Common Usage) form plus Isamurungen and Ivasayen forms, keep them in one variant group so readers can move between the connected terms.',
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
    example: 'Example: Common among older speakers in Basco, or usually said in family conversation, not formal speeches.',
  },
  {
    id: 'guide-etymology',
    title: 'Etymology',
    intro:
      'Etymology explains where the word may have come from over time: an older Ivatan root, a borrowing, an affixed form, or a historically related form.',
    include: [
      'Known roots, borrowed origins, or meaningful affix patterns if you are confident about them.',
      'Short notes about relationship to another older or better-known form.',
      'Cautious wording when the origin is probable rather than certain.',
    ],
    avoid: [
      'Do not invent an origin based only on similarity.',
      'Do not state uncertain history as absolute fact.',
      'Do not use etymology when you only want to explain present-day usage.',
    ],
    example: 'Example: Possibly from an older root related to sea travel, or borrowed from Spanish and adapted locally.',
  },
  {
    id: 'guide-sources',
    title: 'Source Fields',
    intro:
      'Source fields tell reviewers where the word, audio, photo, or folklore material came from. These notes help the archive stay trustworthy and make later verification easier.',
    include: [
      'A person, elder, teacher, family source, notebook, recording session, publication, or community material when known.',
      'Short identifying detail such as municipality, year, or context if that helps reviewers.',
      'Self-knowledge, self-recorded, or contributor-owned checkboxes only when those statements are true.',
    ],
    avoid: [
      'Do not just write internet or book without identifying detail if you can be more specific.',
      'Do not claim self-recorded or contributor-owned unless it is accurate.',
      'Do not leave source notes vague when the entry depends on a specific person or document.',
    ],
    example: 'Example: From interview with a Mahatao elder, February 2026, or recorded by contributor during family conversation in Basco.',
  },
]
