import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

const skills = [
  {
    name: 'Vocabulary',
    description: 'Learning and practicing new words and phrases',
    sortOrder: 1,
  },
  {
    name: 'Grammar',
    description: 'Understanding and applying English grammar rules',
    sortOrder: 2,
  },
  { name: 'Listening', description: 'Developing comprehension of spoken English', sortOrder: 3 },
  {
    name: 'Reading',
    description: 'Improving comprehension of written English texts',
    sortOrder: 4,
  },
  {
    name: 'Writing',
    description: 'Developing written expression and essay composition skills',
    sortOrder: 5,
  },
  { name: 'Speaking', description: 'Improving oral fluency and communication', sortOrder: 6 },
  {
    name: 'Pronunciation',
    description: 'Refining accent, intonation, and phonetic precision',
    sortOrder: 7,
  },
  {
    name: 'Conversation',
    description: 'Practicing natural interactive conversation in English',
    sortOrder: 8,
  },
]

const categories = [
  {
    name: 'IELTS',
    description: 'Materials and practice specifically for IELTS preparation',
    sortOrder: 1,
  },
  {
    name: 'TOEFL',
    description: 'Materials and practice specifically for TOEFL preparation',
    sortOrder: 2,
  },
  {
    name: 'General English',
    description: 'Everyday English language acquisition and practice',
    sortOrder: 3,
  },
  {
    name: 'Vocabulary',
    description: 'Flashcards, word lists, and vocabulary building',
    sortOrder: 4,
  },
  { name: 'Grammar', description: 'Grammar exercises, rules, and syntax drills', sortOrder: 5 },
  { name: 'Listening', description: 'Podcasts, audiobooks, and listening practice', sortOrder: 6 },
  { name: 'Reading', description: 'Articles, books, news, and reading practice', sortOrder: 7 },
  {
    name: 'Writing',
    description: 'Essays, journal entries, emails, and composition',
    sortOrder: 8,
  },
  { name: 'Speaking', description: 'Monologues, shadowing, and speaking drills', sortOrder: 9 },
  {
    name: 'Pronunciation',
    description: 'Phonetic practice, minimal pairs, and intonation',
    sortOrder: 10,
  },
  {
    name: 'Conversation',
    description: 'Live dialogue, language exchange, and speaking clubs',
    sortOrder: 11,
  },
  { name: 'Mock Test', description: 'Full or sectional timed mock exam attempts', sortOrder: 12 },
  { name: 'Review', description: 'Reviewing past mistakes, notes, and weak points', sortOrder: 13 },
  { name: 'Other', description: 'Miscellaneous English learning activities', sortOrder: 14 },
]

async function main() {
  console.log('Seeding database...')

  // Upsert the default user (Phase 1/2 — single user, no auth)
  await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      displayName: 'Default User',
      timezone: 'UTC',
    },
  })
  console.log('✓ Default user created')

  // Upsert default skills
  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { name: skill.name },
      update: { description: skill.description, sortOrder: skill.sortOrder },
      create: { ...skill, isDefault: true },
    })
  }
  console.log(`✓ ${skills.length} default skills seeded`)

  // Upsert default categories
  for (const category of categories) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, name: category.name },
    })
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { description: category.description, sortOrder: category.sortOrder },
      })
    } else {
      await prisma.category.create({
        data: { ...category, userId: null, isDefault: true },
      })
    }
  }
  console.log(`✓ ${categories.length} default categories seeded`)

  console.log('Seeding complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
