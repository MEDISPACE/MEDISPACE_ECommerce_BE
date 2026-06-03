import databaseService from '~/services/database.services'
import { seedBlogData } from '~/services/seed.blog'

async function main() {
  await databaseService.connect()
  await seedBlogData()
  process.exit(0)
}

main().catch((error) => {
  console.error('[seed-blog] failed', error)
  process.exit(1)
})
