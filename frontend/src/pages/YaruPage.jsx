import SampleProfilePhoto from '../components/SampleProfilePhoto'
import { ROUTES, navigate } from '../lib/router'

const PARTNERS = [
  { initials: 'BSC', name: 'Batanes State College' },
  { initials: 'MCO', name: 'Municipal Culture Office' },
  { initials: 'IYC', name: 'Ivatan Youth Collective' },
]

const PROJECT_LEAD = {
  name: 'Kristelle Adami',
  username: 'kristelle.adami',
  affiliation: 'Cultural Digitalization Advocate',
  photoIndex: 0,
}

const ORG_SECTIONS = [
  {
    title: 'Consultants',
    people: [
      {
        name: 'Dr. Marinel Reyes',
        username: 'consultant.marinel',
        affiliation: 'Language and Culture Adviser, Mahatao',
        photoIndex: 2,
      },
      {
        name: 'Prof. Leo Mangada',
        username: 'consultant.leo',
        affiliation: 'Heritage Education Adviser, Ivana',
        photoIndex: 1,
      },
      {
        name: 'Teresita Abad',
        username: 'consultant.teresita',
        affiliation: 'Community Knowledge Consultant, Sabtang',
        photoIndex: 11,
      },
    ],
  },
  {
    title: 'Reviewers',
    people: [
      {
        name: 'Aimee Darunday',
        username: 'reviewer.aimee',
        affiliation: 'Dictionary Review Volunteer, Basco',
        photoIndex: 3,
      },
      {
        name: 'Rico Cabardo',
        username: 'reviewer.rico',
        affiliation: 'Folklore Review Volunteer, Sabtang',
        photoIndex: 4,
      },
      {
        name: 'Luz Arriola',
        username: 'reviewer.luz',
        affiliation: 'Community Review Volunteer, Uyugan',
        photoIndex: 5,
      },
      {
        name: 'Nestor Valdez',
        username: 'reviewer.nestor',
        affiliation: 'Language Review Volunteer, Itbayat',
        photoIndex: 6,
      },
    ],
  },
  {
    title: 'Contributors',
    people: [
      {
        name: 'Ana V. Adriano',
        username: 'contributor.ana',
        affiliation: 'Dictionary Contributor, Basco',
        photoIndex: 7,
      },
      {
        name: 'Mika Gato',
        username: 'contributor.mika',
        affiliation: 'Story Contributor, Ivana',
        photoIndex: 9,
      },
      {
        name: 'Ramon Hontiveros',
        username: 'contributor.ramon',
        affiliation: 'Language Contributor, Mahatao',
        photoIndex: 8,
      },
      {
        name: 'Joan Catajay',
        username: 'contributor.joan',
        affiliation: 'Folklore Contributor, Itbayat',
        photoIndex: 10,
      },
      {
        name: 'Karlo Dima',
        username: 'contributor.karlo',
        affiliation: 'Community Contributor, Uyugan',
        photoIndex: 4,
      },
      {
        name: 'Elena Fajardo',
        username: 'contributor.elena',
        affiliation: 'Pronunciation Contributor, Basco',
        photoIndex: 5,
      },
      {
        name: 'Miguel Alcantara',
        username: 'contributor.miguel',
        affiliation: 'Oral History Contributor, Mahatao',
        photoIndex: 1,
      },
      {
        name: 'Carmen Lopez',
        username: 'contributor.carmen',
        affiliation: 'Proverb Contributor, Sabtang',
        photoIndex: 2,
      },
    ],
  },
]

function PersonCard({ person }) {
  return (
    <button
      className="yaru-person-card"
      onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(person.username)}`)}
    >
      <SampleProfilePhoto className="yaru-avatar" index={person.photoIndex} />
      <p className="yaru-person-name">{person.name}</p>
      <p className="yaru-person-username">@{person.username}</p>
      <p className="yaru-person-affiliation">{person.affiliation}</p>
    </button>
  )
}

export default function YaruPage() {
  return (
    <>
      <section className="panel about-page">
        <h1>The Digital Yaru</h1>
        <p>
          Chirin Ivatan is built in the spirit of Yaru, the Ivatan embodiment of collective strength and shared
          purpose.
        </p>
        <p>
          The project is actively seeking contributors, reviewers, consultants, and partners who can lend their
          hands, voices, and knowledge. Whether you are a student, storyteller, educator, or simply someone who cares
          to help, you are invited to be part of this digital yaru.
        </p>
        <p>Meet our growing team of community partners and contributors who bring this project to life.</p>
      </section>

      <section className="panel">
        <div className="yaru-chart">
          <div className="yaru-lead-column">
            <h3>Project Lead</h3>
            <PersonCard person={PROJECT_LEAD} />
          </div>
          <div className="yaru-chart-rows">
            {ORG_SECTIONS.map((section) => (
              <section key={section.title} className="yaru-chart-row" aria-label={section.title}>
                <h3>{section.title}</h3>
                <div className="yaru-row-cards">
                  {section.people.map((person) => (
                    <PersonCard key={person.username} person={person} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Partners</h2>
        <div className="partner-grid">
          {PARTNERS.map((partner) => (
            <div key={partner.name} className="partner-logo">
              <span className="partner-logo-mark" aria-hidden="true">
                {partner.initials}
              </span>
              <span className="partner-agency-name">{partner.name}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
