import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

const skills = [
  {
    name: 'Vocabulary',
    description: 'Learning and practicing new words and phrases',
    sortOrder: 1,
  },
  { name: 'Grammar', description: 'Understanding and applying grammar rules', sortOrder: 2 },
  { name: 'Listening', description: 'Developing comprehension of spoken English', sortOrder: 3 },
  { name: 'Reading', description: 'Improving comprehension of written English', sortOrder: 4 },
  { name: 'Writing', description: 'Developing written expression skills', sortOrder: 5 },
  { name: 'Speaking', description: 'Improving oral communication', sortOrder: 6 },
  { name: 'Pronunciation', description: 'Refining pronunciation and intonation', sortOrder: 7 },
  { name: 'Conversation', description: 'Practicing natural conversation in English', sortOrder: 8 },
]

async function main() {
  console.log('Seeding database...')

  // Upsert the default user (Phase 1 — single user, no auth)
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
  console.log(`✓ ${skills.length} skills seeded`)

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
