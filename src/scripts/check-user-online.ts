import { MongoClient } from 'mongodb'
import { config } from 'dotenv'

config()

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

async function checkUserOnline() {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(process.env.DB_NAME)
    const users = db.collection('users')
    
    // Find any user with name containing 'Thông' or 'Thống'
    const user = await users.findOne({ 
      $or: [
        { firstName: /Thôn/i }, 
        { lastName: /Thôn/i },
        { firstName: /Thông/i },
        { lastName: /Thông/i }
      ] 
    })
    if (user) {
      console.log(`[USER] ${user.firstName} ${user.lastName}`)
      console.log(`  _id: ${user._id}`)
      console.log(`  isOnline: ${user.isOnline}`)
      console.log(`  onlineCount: ${user.onlineCount}`)
    } else {
      console.log('[USER] Không tìm thấy người dùng có tên tương tự.')
    }
  } catch (err) {
    console.error('Lỗi:', err)
  } finally {
    await client.close()
  }
}

checkUserOnline()
