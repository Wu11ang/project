const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, '../database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Пользователи (users) - для всех ролей
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'coach', 'athlete')) NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Филиалы клуба
  db.run(`CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Тренеры (расширенная информация)
  db.run(`CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    branch_id INTEGER,
    specialization TEXT,
    experience_years INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  )`);

  // Спортсмены
  db.run(`CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    birth_date DATE,
    gender TEXT CHECK(gender IN ('M', 'F')),
    height INTEGER,
    weight REAL,
    weight_category TEXT,
    belt_level TEXT,
    branch_id INTEGER,
    coach_id INTEGER,
    photo_url TEXT,
    martial_art TEXT DEFAULT 'Judo',
    trial_used INTEGER DEFAULT 0,
    approval_status TEXT CHECK(approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (coach_id) REFERENCES coaches(id)
  )`);

  // Сезоны
  db.run(`CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Соревнования
  db.run(`CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    competition_date DATE NOT NULL,
    location TEXT,
    level TEXT CHECK(level IN ('club', 'city', 'regional', 'national', 'international')),
    season_id INTEGER,
    branch_id INTEGER,
    created_by_user_id INTEGER,
    description TEXT,
    registration_open INTEGER DEFAULT 1,
    bracket_generated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
  )`);

  // Весовые категории соревнований
  db.run(`CREATE TABLE IF NOT EXISTS competition_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    weight_category TEXT NOT NULL,
    gender TEXT CHECK(gender IN ('M', 'F')),
    max_participants INTEGER,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
  )`);

  // Регистрация спортсменов на соревнования
  db.run(`CREATE TABLE IF NOT EXISTS competition_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    athlete_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    registered_by_user_id INTEGER NOT NULL,
    registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    weigh_in_weight REAL,
    status TEXT CHECK(status IN ('registered', 'confirmed', 'cancelled')) DEFAULT 'registered',
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id),
    FOREIGN KEY (category_id) REFERENCES competition_categories(id),
    FOREIGN KEY (registered_by_user_id) REFERENCES users(id),
    UNIQUE(competition_id, athlete_id)
  )`);

  // Спарринги (пары для боя)
  db.run(`CREATE TABLE IF NOT EXISTS sparrings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    athlete1_id INTEGER NOT NULL,
    athlete2_id INTEGER NOT NULL,
    round_name TEXT,
    status TEXT CHECK(status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES competition_categories(id),
    FOREIGN KEY (athlete1_id) REFERENCES athletes(id),
    FOREIGN KEY (athlete2_id) REFERENCES athletes(id)
  )`);

  // Бои/поединки (результаты спаррингов)
  db.run(`CREATE TABLE IF NOT EXISTS fights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sparring_id INTEGER UNIQUE NOT NULL,
    winner_id INTEGER,
    result_type TEXT CHECK(result_type IN ('ippon', 'wazari', 'yuko', 'shido', 'points', 'disqualification', 'forfeit')),
    athlete1_score INTEGER DEFAULT 0,
    athlete2_score INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    fight_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    recorded_by_user_id INTEGER,
    FOREIGN KEY (sparring_id) REFERENCES sparrings(id) ON DELETE CASCADE,
    FOREIGN KEY (winner_id) REFERENCES athletes(id),
    FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
  )`);

  // Рейтинги спортсменов
  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL,
    season_id INTEGER,
    total_points INTEGER DEFAULT 0,
    fights_count INTEGER DEFAULT 0,
    wins_count INTEGER DEFAULT 0,
    losses_count INTEGER DEFAULT 0,
    ippon_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    UNIQUE(athlete_id, season_id)
  )`);

  // Конфигурация начисления очков
  db.run(`CREATE TABLE IF NOT EXISTS rating_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_level TEXT NOT NULL UNIQUE,
    win_ippon_points INTEGER NOT NULL,
    win_points_points INTEGER NOT NULL,
    loss_points INTEGER DEFAULT 0,
    description TEXT
  )`);

  // Таблица соответствия веса и категории
  db.run(`CREATE TABLE IF NOT EXISTS weight_categories_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gender TEXT CHECK(gender IN ('M', 'F')) NOT NULL,
    min_weight REAL NOT NULL,
    max_weight REAL NOT NULL,
    category_name TEXT NOT NULL,
    age_group TEXT DEFAULT 'junior'
  )`);

  // Логи изменений характеристик спортсмена
  db.run(`CREATE TABLE IF NOT EXISTS athlete_changes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL,
    changed_by_user_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
  )`);

  // Дисциплины единоборств
  db.run(`CREATE TABLE IF NOT EXISTS disciplines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL
  )`);

  // Расписание тренировок
  db.run(`CREATE TABLE IF NOT EXISTS training_schedules (
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

  // Бронирование тренировок
  db.run(`CREATE TABLE IF NOT EXISTS training_bookings (
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

  // Подписки
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
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

  // Турнирная сетка
  db.run(`CREATE TABLE IF NOT EXISTS tournament_brackets (
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

  // Уровни поясов
  db.run(`CREATE TABLE IF NOT EXISTS belt_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rank_order INTEGER NOT NULL,
    min_points INTEGER DEFAULT 0
  )`);

  // Вставка базовой конфигурации очков
  db.run(`INSERT OR IGNORE INTO rating_config (id, competition_level, win_ippon_points, win_points_points, loss_points, description) VALUES
    (1, 'club', 50, 30, 0, 'Клубные соревнования'),
    (2, 'city', 100, 60, 0, 'Городские соревнования'),
    (3, 'regional', 150, 90, 0, 'Региональные соревнования'),
    (4, 'national', 250, 150, 0, 'Национальные соревнования'),
    (5, 'international', 400, 250, 0, 'Международные соревнования')
  `);

  // Вставка весовых категорий (юниоры)
  db.run(`INSERT OR IGNORE INTO weight_categories_mapping (gender, min_weight, max_weight, category_name, age_group) VALUES
    -- Мужчины юниоры
    ('M', 0, 50, '50 кг', 'junior'),
    ('M', 50.01, 55, '55 кг', 'junior'),
    ('M', 55.01, 60, '60 кг', 'junior'),
    ('M', 60.01, 66, '66 кг', 'junior'),
    ('M', 66.01, 73, '73 кг', 'junior'),
    ('M', 73.01, 81, '81 кг', 'junior'),
    ('M', 81.01, 90, '90 кг', 'junior'),
    ('M', 90.01, 100, '100 кг', 'junior'),
    ('M', 100.01, 999, '+100 кг', 'junior'),
    -- Женщины юниоры
    ('F', 0, 40, '40 кг', 'junior'),
    ('F', 40.01, 44, '44 кг', 'junior'),
    ('F', 44.01, 48, '48 кг', 'junior'),
    ('F', 48.01, 52, '52 кг', 'junior'),
    ('F', 52.01, 57, '57 кг', 'junior'),
    ('F', 57.01, 63, '63 кг', 'junior'),
    ('F', 63.01, 70, '70 кг', 'junior'),
    ('F', 70.01, 78, '78 кг', 'junior'),
    ('F', 78.01, 999, '+78 кг', 'junior')
  `);

  // Вставка дисциплин
  db.run(`INSERT OR IGNORE INTO disciplines (id, name, display_name) VALUES
    (1, 'Judo', 'Дзюдо'),
    (2, 'BJJ', 'Бразильское Джиу-Джитсу'),
    (3, 'MMA', 'ММА')
  `);

  // Вставка уровней поясов
  db.run(`INSERT OR IGNORE INTO belt_levels (id, name, rank_order, min_points) VALUES
    (1, 'белый', 1, 0),
    (2, 'жёлтый', 2, 100),
    (3, 'оранжевый', 3, 300),
    (4, 'зелёный', 4, 600),
    (5, 'синий', 5, 1000),
    (6, 'коричневый', 6, 1500),
    (7, 'чёрный', 7, 2500)
  `);

  // Индексы для производительности
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_athletes_user_id ON athletes(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_athletes_coach_id ON athletes(coach_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_athletes_branch_id ON athletes(branch_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ratings_athlete_season ON ratings(athlete_id, season_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_competitions_season ON competitions(season_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_competitions_branch ON competitions(branch_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_registrations_competition ON competition_registrations(competition_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sparrings_competition ON sparrings(competition_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_fights_sparring ON fights(sparring_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_brackets_competition ON tournament_brackets(competition_id, category_id)`);

  // Создание дефолтного админа
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, phone, password_hash, role, first_name, last_name, is_active) VALUES
    (1, '+77771234567', ?, 'admin', 'Администратор', 'Системы', 1)
  `, [adminPassword], function(err) {
    if (err) {
      console.error('Error creating admin:', err);
    } else {
      console.log('✅ Default admin created: +77771234567 / admin123');
    }
  });

  console.log('✅ Database schema created successfully!');
  console.log('\n📱 Default credentials:');
  console.log('   Phone: +77771234567');
  console.log('   Password: admin123');
  console.log('   Role: admin');
});

db.close();
