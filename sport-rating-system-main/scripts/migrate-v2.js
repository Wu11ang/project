const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.db');
const db = new sqlite3.Database(dbPath);

const runSQL = (sql) => {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        // Ignore "duplicate column" or "table already exists" errors
        if (err.message.includes('duplicate') || err.message.includes('already exists')) {
          resolve();
        } else {
          reject(err);
        }
      } else {
        resolve();
      }
    });
  });
};

async function migrate() {
  console.log('Starting migration v2...');

  // Add new columns to athletes
  try { await runSQL("ALTER TABLE athletes ADD COLUMN martial_art TEXT DEFAULT 'Judo'"); console.log('  + athletes.martial_art'); } catch(e) { console.log('  ~ athletes.martial_art already exists'); }
  try { await runSQL("ALTER TABLE athletes ADD COLUMN trial_used INTEGER DEFAULT 0"); console.log('  + athletes.trial_used'); } catch(e) { console.log('  ~ athletes.trial_used already exists'); }

  // Add new column to competitions
  try { await runSQL("ALTER TABLE competitions ADD COLUMN bracket_generated INTEGER DEFAULT 0"); console.log('  + competitions.bracket_generated'); } catch(e) { console.log('  ~ competitions.bracket_generated already exists'); }

  // Create new tables
  await runSQL(`CREATE TABLE IF NOT EXISTS disciplines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL
  )`);
  console.log('  + disciplines table');

  await runSQL(`CREATE TABLE IF NOT EXISTS training_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_paid INTEGER DEFAULT 0,
    price REAL DEFAULT 0,
    max_participants INTEGER DEFAULT 20,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coach_id) REFERENCES coaches(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  )`);
  console.log('  + training_schedules table');

  await runSQL(`CREATE TABLE IF NOT EXISTS training_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    athlete_id INTEGER NOT NULL,
    booking_date DATE NOT NULL,
    status TEXT CHECK(status IN ('booked', 'attended', 'cancelled', 'no_show')) DEFAULT 'booked',
    is_trial INTEGER DEFAULT 0,
    payment_status TEXT CHECK(payment_status IN ('free', 'pending', 'paid')) DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES training_schedules(id),
    FOREIGN KEY (athlete_id) REFERENCES athletes(id),
    UNIQUE(schedule_id, athlete_id, booking_date)
  )`);
  console.log('  + training_bookings table');

  await runSQL(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL,
    coach_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('monthly', 'quarterly', 'yearly', 'per_session')) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    sessions_total INTEGER,
    sessions_used INTEGER DEFAULT 0,
    price REAL NOT NULL,
    status TEXT CHECK(status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id),
    FOREIGN KEY (coach_id) REFERENCES coaches(id)
  )`);
  console.log('  + subscriptions table');

  await runSQL(`CREATE TABLE IF NOT EXISTS tournament_brackets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    match_number INTEGER NOT NULL,
    athlete1_id INTEGER,
    athlete2_id INTEGER,
    winner_id INTEGER,
    sparring_id INTEGER,
    is_bye INTEGER DEFAULT 0,
    next_match_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES competition_categories(id),
    FOREIGN KEY (athlete1_id) REFERENCES athletes(id),
    FOREIGN KEY (athlete2_id) REFERENCES athletes(id),
    FOREIGN KEY (winner_id) REFERENCES athletes(id),
    FOREIGN KEY (sparring_id) REFERENCES sparrings(id)
  )`);
  console.log('  + tournament_brackets table');

  await runSQL(`CREATE TABLE IF NOT EXISTS belt_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rank_order INTEGER NOT NULL,
    min_points INTEGER DEFAULT 0
  )`);
  console.log('  + belt_levels table');

  // Seed data
  await runSQL(`INSERT OR IGNORE INTO disciplines (id, name, display_name) VALUES (1, 'Judo', 'Дзюдо')`);
  await runSQL(`INSERT OR IGNORE INTO disciplines (id, name, display_name) VALUES (2, 'BJJ', 'Бразильское Джиу-Джитсу')`);
  await runSQL(`INSERT OR IGNORE INTO disciplines (id, name, display_name) VALUES (3, 'MMA', 'ММА')`);
  console.log('  + disciplines seed data');

  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (1, 'белый', 1, 0)`);
  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (2, 'жёлтый', 2, 100)`);
  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (3, 'оранжевый', 3, 300)`);
  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (4, 'зелёный', 4, 600)`);
  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (5, 'синий', 5, 1000)`);
  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (6, 'коричневый', 6, 1500)`);
  await runSQL(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES (7, 'чёрный', 7, 2500)`);
  console.log('  + belt_levels seed data');

  // Note: SQLite doesn't support ALTER TABLE to modify CHECK constraints.
  // The fights table result_type CHECK will only apply to new databases.
  // For existing DB, shido/yuko values will still be accepted since SQLite
  // CHECK constraints are not enforced on ALTER, and we handle validation in server.js.

  console.log('\n✅ Migration v2 complete!');
  db.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
});
