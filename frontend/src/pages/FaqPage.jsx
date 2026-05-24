const FAQ_GROUPS = [
  {
    title: 'General Questions',
    items: [
      {
        q: 'What is Chirin Ivatan?',
        a: 'Chirin Ivatan is a community-based digital platform dedicated to preserving and promoting the Ivatan language and folklore through a digital dictionary, folklore archive, and interactive community contributions.',
      },
      {
        q: 'Why was Chirin Ivatan created?',
        a: 'The project was created to help preserve the Ivatan language and cultural heritage in response to modernization, language loss, and the decreasing transmission of oral traditions to younger generations.',
      },
      {
        q: 'Who can use the platform?',
        a: 'Anyone can explore the public dictionary and folklore archive. Registered users may contribute entries, while reviewers and administrators help validate and moderate submissions.',
      },
      {
        q: 'Is Chirin Ivatan free to use?',
        a: 'Yes. Chirin Ivatan is designed as a free and accessible cultural preservation platform for the community and the public.',
      },
      {
        q: 'Can non-Ivatans use the platform?',
        a: 'Yes. The platform welcomes learners, researchers, educators, and anyone interested in Ivatan language and culture.',
      },
    ],
  },
  {
    title: 'Dictionary FAQs',
    items: [
      {
        q: 'What can I find in the dictionary?',
        bullets: [
          'Ivatan terms',
          'English translations',
          'Definitions',
          'Example sentences',
          'Pronunciation guides',
          'Audio recordings',
          'Related or variant terms',
        ],
      },
      {
        q: 'Can I listen to pronunciations?',
        a: 'Yes. Many dictionary entries include audio pronunciations to help users learn proper pronunciation.',
      },
      {
        q: 'Why do some words have multiple versions or spellings?',
        a: 'Some Ivatan words may have regional or contextual variants. Chirin Ivatan groups related variants while preserving their distinct usage and pronunciation.',
      },
      {
        q: 'Can I suggest corrections to existing entries?',
        a: 'Yes. Registered contributors can submit revisions or improvements for review.',
      },
    ],
  },
  {
    title: 'Folklore FAQs',
    items: [
      {
        q: 'What types of folklore are included?',
        bullets: ['Myths', 'Legends', 'Proverbs', 'Idioms', 'Laji', 'Poems', 'Traditional stories', 'Songs'],
      },
      {
        q: 'Can folklore entries include audio or video?',
        a: 'Yes. Contributors may upload audio, photos, videos, or media links when available and culturally appropriate.',
      },
      {
        q: 'How are folklore submissions reviewed?',
        a: 'Folklore entries go through a review and moderation process before being published publicly to ensure accuracy, respectfulness, and cultural integrity.',
      },
    ],
  },
  {
    title: 'Contributor FAQs',
    items: [
      {
        q: 'How do I become a contributor?',
        a: 'You can create an account and apply as a contributor, or you may receive an invitation from a reviewer or administrator.',
      },
      {
        q: 'What can contributors do?',
        bullets: ['Submit dictionary entries', 'Submit folklore entries', 'Upload media', 'Suggest revisions', 'Track submission status'],
      },
      {
        q: 'What happens after I submit content?',
        intro: 'Your submission enters a review process. It may be:',
        bullets: [
          'Approved',
          'Returned with revision suggestions',
          'Rejected if it does not meet platform guidelines',
        ],
      },
      {
        q: 'Can I approve my own submission?',
        a: 'No. Self-review is not allowed to ensure fairness and quality control.',
      },
      {
        q: 'What do the statuses mean?',
        bullets: [
          'Draft - your editable work',
          'Pending - waiting for review',
          'Approved - publicly visible',
          'Approved Under Review - publicly visible but being reassessed',
          'Rejected - requires correction',
          'Archived - inactive entry',
        ],
      },
    ],
  },
  {
    title: 'Reviewer & Moderation FAQs',
    items: [
      {
        q: 'Who are the reviewers?',
        a: 'Reviewers are trusted users, educators, elders, or cultural consultants responsible for validating submissions.',
      },
      {
        q: 'How many approvals are needed?',
        intro: 'A submission typically requires:',
        bullets: ['2 reviewer approvals, OR', '1 reviewer approval + 1 administrator approval'],
      },
      {
        q: 'Why was my contribution rejected?',
        intro: 'Rejections may happen due to:',
        bullets: ['Incomplete information', 'Incorrect translations', 'Missing sources', 'Inappropriate content', 'Duplicate entries'],
        outro: 'Review notes are usually provided to help improve the submission.',
      },
    ],
  },
  {
    title: 'Account & Privacy FAQs',
    items: [
      {
        q: 'Do I need an account to browse the site?',
        a: 'No. Public content can be viewed without registering.',
      },
      {
        q: 'Will my name appear publicly?',
        a: 'Contributor attribution may appear publicly unless certain privacy or source masking rules apply.',
      },
      {
        q: 'What happens to self-recorded or self-sourced content?',
        a: 'Some source information may be hidden publicly when marked as self-recorded, contributor-owned, or self-knowledge based.',
      },
    ],
  },
  {
    title: 'Gamification & Recognition FAQs',
    items: [
      {
        q: 'Does the platform have badges or leaderboards?',
        intro: 'Yes. Chirin Ivatan includes community recognition systems such as:',
        bullets: ['Contribution levels', 'Badges', 'Municipality leaderboards', 'Cultural stewardship recognition'],
      },
      {
        q: 'Are contributors competing against each other?',
        a: 'The gamification system is designed to encourage cultural stewardship and participation, not unhealthy competition.',
      },
      {
        q: 'How do I earn badges?',
        a: 'Badges may be earned through approved contributions, revisions, and review participation.',
      },
    ],
  },
  {
    title: 'Technical & Platform FAQs',
    items: [
      {
        q: 'Can I use Chirin Ivatan on mobile devices?',
        a: 'Yes. The platform is designed to work on both desktop and mobile devices.',
      },
      {
        q: 'Do I need fast internet to use the platform?',
        a: 'The platform is optimized to remain usable even on slower internet connections whenever possible.',
      },
      {
        q: 'Is Chirin Ivatan open-source?',
        a: 'The project plans to provide documentation and open-source accessibility to help other indigenous communities adapt similar systems.',
      },
    ],
  },
  {
    title: 'Cultural & Ethical FAQs',
    items: [
      {
        q: 'How does Chirin Ivatan protect cultural integrity?',
        a: 'All submissions go through moderation and review processes involving community reviewers and cultural stakeholders.',
      },
      {
        q: 'Can sacred or sensitive cultural materials be restricted?',
        a: 'Yes. Administrators and reviewers may limit or remove sensitive materials when necessary to respect community values and cultural protocols.',
      },
      {
        q: 'How can schools or organizations collaborate with Chirin Ivatan?',
        a: 'Schools, researchers, nonprofits, and cultural organizations may collaborate through partnerships, contributions, validation efforts, or educational use.',
      },
    ],
  },
]

function Answer({ item }) {
  return (
    <div className="faq-answer">
      {item.a && <p>{item.a}</p>}
      {item.intro && <p>{item.intro}</p>}
      {item.bullets && (
        <ul>
          {item.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {item.outro && <p>{item.outro}</p>}
    </div>
  )
}

export default function FaqPage() {
  return (
    <section className="faq-page">
      <header className="faq-hero">
        <p className="profile-kicker">Help Center</p>
        <h1>Frequently Asked Questions</h1>
        <p className="muted">Quick answers about Chirin Ivatan, contribution workflows, moderation, privacy, and cultural stewardship.</p>
      </header>

      <div className="faq-group-list">
        {FAQ_GROUPS.map((group) => (
          <section key={group.title} className="faq-group">
            <h2>{group.title}</h2>
            <div className="faq-items">
              {group.items.map((item) => (
                <details key={item.q} className="faq-item">
                  <summary>{item.q}</summary>
                  <Answer item={item} />
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
