export const FOLKLORE_TAXONOMY = [
  {
    value: 'oral_narratives',
    label: 'Oral Narratives',
    description: 'Stories passed down through generations.',
    subcategories: [
      { value: 'myths', label: 'Myths' },
      { value: 'legends', label: 'Legends' },
      { value: 'folktales', label: 'Folktales' },
      { value: 'oral_histories', label: 'Oral Histories' },
    ],
  },
  {
    value: 'wisdom_expressions',
    label: 'Wisdom and Expressions',
    description: 'Traditional sayings and language forms.',
    subcategories: [
      { value: 'proverbs', label: 'Proverbs' },
      { value: 'idioms', label: 'Idioms' },
      { value: 'riddles', label: 'Riddles' },
    ],
  },
  {
    value: 'songs_poetry',
    label: 'Songs and Poetry',
    description: 'Traditional and creative oral literature.',
    subcategories: [
      { value: 'laji', label: 'Laji' },
      { value: 'songs', label: 'Songs' },
      { value: 'childrens_rhymes', label: "Children's Rhymes" },
      { value: 'poems', label: 'Poems' },
    ],
  },
  {
    value: 'beliefs_ritual_life',
    label: 'Beliefs and Ritual Life',
    description: 'Spiritual, religious, and ceremonial traditions.',
    subcategories: [
      { value: 'beliefs', label: 'Beliefs' },
      { value: 'rituals', label: 'Rituals' },
      { value: 'prayers', label: 'Prayers' },
    ],
  },
  {
    value: 'traditional_knowledge',
    label: 'Traditional Knowledge',
    description: 'Practical cultural knowledge and skills.',
    subcategories: [
      { value: 'fishing_knowledge', label: 'Fishing Knowledge' },
      { value: 'agriculture', label: 'Agriculture' },
      { value: 'boatbuilding', label: 'Boatbuilding' },
      { value: 'architecture', label: 'Architecture' },
      { value: 'folk_medicine', label: 'Folk Medicine' },
      { value: 'weather_knowledge', label: 'Weather Knowledge' },
      { value: 'crafts', label: 'Crafts' },
    ],
  },
]

const LEGACY_CATEGORY_LABELS = {
  myth: 'Myths',
  legend: 'Legends',
  proverb: 'Proverbs',
  idiom: 'Idioms',
  laji: 'Laji',
  poem: 'Poems',
}

export function folkloreCategoryLabel(value) {
  return (
    FOLKLORE_TAXONOMY.find((category) => category.value === value)?.label ||
    LEGACY_CATEGORY_LABELS[value] ||
    value ||
    ''
  )
}

export function folkloreSubcategoryOptions(categoryValue) {
  return FOLKLORE_TAXONOMY.find((category) => category.value === categoryValue)?.subcategories || []
}

export function folkloreSubcategoryLabel(value) {
  for (const category of FOLKLORE_TAXONOMY) {
    const subcategory = category.subcategories.find((item) => item.value === value)
    if (subcategory) return subcategory.label
  }
  return value || ''
}

export function folkloreTaxonomyLabel(categoryValue, subcategoryValue) {
  const category = folkloreCategoryLabel(categoryValue)
  const subcategory = folkloreSubcategoryLabel(subcategoryValue)
  return [category, subcategory].filter(Boolean).join(' / ')
}

export function municipalitySourceLabel(value) {
  return value === 'Not Applicable' ? 'No specific municipality associated' : value || ''
}
