const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

db.get('SELECT * FROM users WHERE phone = ?', ['+77771234567'], async (err, user) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  if (!user) {
    console.log('❌ User not found!');
    db.close();
    return;
  }

  console.log('✅ User found:');
  console.log('  ID:', user.id);
  console.log('  Phone:', user.phone);
  console.log('  Role:', user.role);
  console.log('  Name:', user.first_name, user.last_name);
  console.log('  Active:', user.is_active);
  console.log('  Password hash:', user.password_hash.substring(0, 20) + '...');

  // Test password
  const testPassword = 'admin123';
  const match = await bcrypt.compare(testPassword, user.password_hash);
  console.log('\n🔐 Password test for "admin123":', match ? '✅ MATCH' : '❌ NO MATCH');

  db.close();
});
