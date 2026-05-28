import databaseService from './services/database.services'

async function run() {
  await databaseService.connect()
  console.log('Connected to MongoDB')
  
  const products = await databaseService.products.find({
    name: { $regex: 'Thái Dương|La Beauty', $options: 'i' }
  }).toArray()
  
  console.log('Found products:')
  for (const p of products) {
    console.log(`- ID: ${p._id}, Name: "${p.name}", requiresPrescription: ${p.requiresPrescription}`)
  }
  
  process.exit(0)
}

run().catch(console.error)
