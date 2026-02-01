const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ortus-judo-secret-' + require('crypto').randomBytes(16).toString('hex');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `athlete_${req.user.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only jpg, png, webp allowed'));
  }
});

// Simple rate limiter for auth endpoints
const loginAttempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 min
  const maxAttempts = 20;

  if (!loginAttempts.has(ip)) loginAttempts.set(ip, []);
  const attempts = loginAttempts.get(ip).filter(t => now - t < windowMs);
  loginAttempts.set(ip, attempts);

  if (attempts.length >= maxAttempts) {
    return res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 15 минут.' });
  }
  attempts.push(now);
  next();
}

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static('public'));

// Database connection
const db = new sqlite3.Database('./database.db', async (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    try {
      await dbRun('ALTER TABLE users ADD COLUMN photo_url TEXT');
    } catch (e) { }

    // Create NOTIFICATIONS table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        title TEXT,
        message TEXT,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});

// Helper function to promisify database queries
const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// ============= MIDDLEWARE: AUTH =============

// Verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Check if user has required role
function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ============= AUTH ENDPOINTS =============

// Register new user
app.post('/api/auth/register', rateLimit, async (req, res) => {
  const { phone, password, role, first_name, last_name, branch_id, coach_id, birth_date, gender, height, weight, specialization } = req.body;

  try {
    // Validate required fields
    if (!phone || !password || !role || !first_name || !last_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if phone already exists
    const existingUser = await dbGet('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await dbRun(
      'INSERT INTO users (phone, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [phone, passwordHash, role, first_name, last_name]
    );

    const userId = userResult.id;

    // If athlete, create athlete profile
    if (role === 'athlete') {
      // Determine weight category automatically
      let weightCategory = null;
      if (weight && gender) {
        const categoryMapping = await dbGet(
          'SELECT category_name FROM weight_categories_mapping WHERE gender = ? AND ? >= min_weight AND ? <= max_weight',
          [gender, weight, weight]
        );
        if (categoryMapping) {
          weightCategory = categoryMapping.category_name;
        }
      }

      await dbRun(
        'INSERT INTO athletes (user_id, birth_date, gender, height, weight, weight_category, branch_id, coach_id, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, birth_date, gender, height, weight, weightCategory, branch_id, coach_id, 'pending']
      );
    }

    // If coach, create coach profile
    if (role === 'coach') {
      await dbRun(
        'INSERT INTO coaches (user_id, branch_id, specialization) VALUES (?, ?, ?)',
        [userId, branch_id, specialization || 'Judo']
      );
    }

    res.json({
      message: 'Registration successful',
      userId: userId,
      needsApproval: role === 'athlete'
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', rateLimit, async (req, res) => {
  const { phone, password } = req.body;

  try {
    // Find user
    const user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // For athletes, check approval status
    if (user.role === 'athlete') {
      const athlete = await dbGet('SELECT approval_status FROM athletes WHERE user_id = ?', [user.id]);
      if (athlete && athlete.approval_status === 'pending') {
        return res.status(403).json({ error: 'Your account is pending coach approval' });
      }
      if (athlete && athlete.approval_status === 'rejected') {
        return res.status(403).json({ error: 'Your account was rejected by coach' });
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: token,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, phone, role, first_name, last_name, is_active, photo_url FROM users WHERE id = ?', [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get additional info based on role
    if (user.role === 'athlete') {
      const athlete = await dbGet(`
        SELECT a.*, b.name as branch_name, c.user_id as coach_user_id, 
               u.first_name as coach_first_name, u.last_name as coach_last_name
        FROM athletes a
        LEFT JOIN branches b ON a.branch_id = b.id
        LEFT JOIN coaches c ON a.coach_id = c.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE a.user_id = ?
      `, [user.id]);
      user.athlete_profile = athlete;
    }

    if (user.role === 'coach') {
      const coach = await dbGet(`
        SELECT c.*, b.name as branch_name
        FROM coaches c
        LEFT JOIN branches b ON c.branch_id = b.id
        WHERE c.user_id = ?
      `, [user.id]);
      user.coach_profile = coach;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update current user info
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { first_name, last_name, phone } = req.body;
  try {
    if (phone) {
      const existing = await dbGet('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, req.user.id]);
      if (existing) return res.status(400).json({ error: 'Этот номер телефона уже занят' });
    }

    await dbRun(
      'UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone) WHERE id = ?',
      [first_name, last_name, phone, req.user.id]
    );

    res.json({ message: 'Профиль обновлен' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile photo
app.post('/api/auth/profile-photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const photoUrl = `/uploads/${req.file.filename}`;

    // Update users table (unified)
    await dbRun('UPDATE users SET photo_url = ? WHERE id = ?', [photoUrl, req.user.id]);

    // Also update athlete table if it exists for this user (legacy/consistency)
    if (req.user.role === 'athlete') {
      await dbRun('UPDATE athletes SET photo_url = ? WHERE user_id = ?', [photoUrl, req.user.id]);
    }

    res.json({ photo_url: photoUrl, message: 'Фото обновлено' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Текущий пароль указан неверно' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ message: 'Пароль успешно изменен' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= BRANCHES ENDPOINTS =============

// Get all branches
app.get('/api/branches', async (req, res) => {
  try {
    const branches = await dbAll('SELECT * FROM branches ORDER BY name');
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create branch (admin only)
app.post('/api/branches', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, city, address } = req.body;
  try {
    const result = await dbRun(
      'INSERT INTO branches (name, city, address) VALUES (?, ?, ?)',
      [name, city, address]
    );
    res.json({ id: result.id, message: 'Branch created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get branch profile (public)
app.get('/api/branches/:id/profile', async (req, res) => {
  try {
    const branchId = req.params.id;

    const branch = await dbGet('SELECT * FROM branches WHERE id = ?', [branchId]);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const coaches = await dbAll(`
      SELECT c.id, c.specialization, c.experience_years,
             u.first_name, u.last_name
      FROM coaches c
      JOIN users u ON c.user_id = u.id
      WHERE c.branch_id = ? AND u.is_active = 1
      ORDER BY u.last_name, u.first_name
    `, [branchId]);

    const athleteStats = await dbGet(`
      SELECT COUNT(*) as total_athletes
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      WHERE a.branch_id = ? AND a.approval_status = 'approved' AND u.is_active = 1
    `, [branchId]);

    const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
    let ratingStats = { total_points: 0, total_wins: 0, total_fights: 0, total_ippon: 0, avg_points: 0 };

    if (activeSeason) {
      const stats = await dbGet(`
        SELECT COALESCE(SUM(r.total_points), 0) as total_points,
               COALESCE(SUM(r.wins_count), 0) as total_wins,
               COALESCE(SUM(r.fights_count), 0) as total_fights,
               COALESCE(SUM(r.ippon_count), 0) as total_ippon,
               COALESCE(AVG(r.total_points), 0) as avg_points
        FROM ratings r
        JOIN athletes a ON r.athlete_id = a.id
        WHERE a.branch_id = ? AND r.season_id = ?
      `, [branchId, activeSeason.id]);
      if (stats) ratingStats = stats;
    }

    const branchScore = Math.round(
      (ratingStats.total_points * 0.4) +
      (ratingStats.avg_points * 0.3) +
      (ratingStats.total_wins * 0.3)
    );

    let topAthletes = [];
    if (activeSeason) {
      topAthletes = await dbAll(`
        SELECT r.total_points, r.wins_count, r.fights_count, r.ippon_count,
               a.belt_level, a.weight_category, a.gender, a.photo_url,
               u.first_name, u.last_name
        FROM ratings r
        JOIN athletes a ON r.athlete_id = a.id
        JOIN users u ON a.user_id = u.id
        WHERE a.branch_id = ? AND r.season_id = ? AND a.approval_status = 'approved'
        ORDER BY r.total_points DESC
        LIMIT 10
      `, [branchId, activeSeason.id]);
    }

    const coachCounts = await dbAll(`
      SELECT coach_id, COUNT(*) as athlete_count
      FROM athletes
      WHERE branch_id = ? AND approval_status = 'approved'
      GROUP BY coach_id
    `, [branchId]);
    const countMap = {};
    coachCounts.forEach(c => { countMap[c.coach_id] = c.athlete_count; });
    coaches.forEach(c => { c.athlete_count = countMap[c.id] || 0; });

    res.json({
      branch,
      coaches,
      stats: {
        total_athletes: athleteStats.total_athletes,
        total_coaches: coaches.length,
        total_points: ratingStats.total_points,
        total_wins: ratingStats.total_wins,
        total_fights: ratingStats.total_fights,
        total_ippon: ratingStats.total_ippon,
        avg_points: Math.round(ratingStats.avg_points),
        branch_score: branchScore
      },
      topAthletes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= COACHES ENDPOINTS =============

// Get coaches by branch
app.get('/api/coaches/branch/:branchId', async (req, res) => {
  try {
    const coaches = await dbAll(`
      SELECT c.id, u.first_name, u.last_name, u.phone, c.specialization, c.experience_years
      FROM coaches c
      JOIN users u ON c.user_id = u.id
      WHERE c.branch_id = ? AND u.is_active = 1
      ORDER BY u.last_name, u.first_name
    `, [req.params.branchId]);
    res.json(coaches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Dashboard Stats
app.get('/api/admin/dashboard-stats', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const athletesCount = await dbGet('SELECT COUNT(*) as cnt FROM athletes');
    const coachesCount = await dbGet('SELECT COUNT(*) as cnt FROM coaches');
    const branchesCount = await dbGet('SELECT COUNT(*) as cnt FROM branches');
    const competitionsCount = await dbGet('SELECT COUNT(*) as cnt FROM competitions');
    const activeSeason = await dbGet('SELECT * FROM seasons WHERE is_active = 1 LIMIT 1');

    const seasonId = activeSeason ? activeSeason.id : 0;

    // Advanced Metrics
    const performanceStats = await dbGet(`
      SELECT 
        SUM(total_points) as total_points, 
        SUM(total_wins) as total_wins, 
        SUM(total_ippon) as total_ippon 
      FROM ratings 
      WHERE season_id = ?
    `, [seasonId]);

    const topBranch = await dbGet(`
      SELECT b.name
      FROM branches b
      JOIN athletes a ON a.branch_id = b.id
      JOIN ratings r ON r.athlete_id = a.id
      WHERE r.season_id = ?
      GROUP BY b.id
      ORDER BY SUM(r.total_points) DESC
      LIMIT 1
    `, [seasonId]);

    const topAthletes = await dbAll(`
      SELECT r.total_points, u.first_name, u.last_name, b.name as branch_name
      FROM ratings r
      JOIN athletes a ON r.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      WHERE r.season_id = ?
      ORDER BY r.total_points DESC
      LIMIT 5
    `, [seasonId]);

    const recentCompetitions = await dbAll(`
      SELECT c.name, c.competition_date, b.name as branch_name
      FROM competitions c
      LEFT JOIN branches b ON c.branch_id = b.id
      ORDER BY c.competition_date DESC
      LIMIT 5
    `);

    res.json({
      counts: {
        athletes: athletesCount.cnt,
        coaches: coachesCount.cnt,
        branches: branchesCount.cnt,
        competitions: competitionsCount.cnt
      },
      metrics: {
        total_points: performanceStats.total_points || 0,
        total_wins: performanceStats.total_wins || 0,
        total_ippon: performanceStats.total_ippon || 0,
        top_branch: topBranch ? topBranch.name : '-'
      },
      activeSeason: activeSeason || null,
      topAthletes,
      recentCompetitions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users (coaches & athletes) for a branch
app.get('/api/branches/:id/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const branchId = req.params.id;

    // Fetch coaches
    const coaches = await dbAll(`
      SELECT c.id, u.first_name, u.last_name, u.phone, c.specialization
      FROM coaches c
      JOIN users u ON c.user_id = u.id
      WHERE c.branch_id = ? AND u.is_active = 1
      ORDER BY u.last_name, u.first_name
    `, [branchId]);

    // Fetch athletes
    const athletes = await dbAll(`
      SELECT a.id, u.first_name, u.last_name, u.phone, a.belt_level, a.weight_category
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      WHERE a.branch_id = ? AND u.is_active = 1
      ORDER BY u.last_name, u.first_name
    `, [branchId]);

    res.json({
      coaches,
      athletes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get coach's pending athletes (coach only)
app.get('/api/coaches/pending-athletes', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);

    if (!coach) {
      return res.status(404).json({ error: 'Coach profile not found' });
    }

    const pendingAthletes = await dbAll(`
      SELECT a.*, u.first_name, u.last_name, u.phone, b.name as branch_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      WHERE a.coach_id = ? AND a.approval_status = 'pending'
      ORDER BY a.created_at DESC
    `, [coach.id]);

    res.json(pendingAthletes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve/reject athlete (coach only)
app.post('/api/coaches/approve-athlete/:athleteId', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'

  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);

    if (!coach) {
      return res.status(404).json({ error: 'Coach profile not found' });
    }

    // Verify athlete belongs to this coach (Admins bypass this)
    if (req.user.role !== 'admin') {
      const athlete = await dbGet('SELECT id FROM athletes WHERE id = ? AND coach_id = ?', [req.params.athleteId, coach.id]);
      if (!athlete) {
        return res.status(403).json({ error: 'Not authorized to approve this athlete' });
      }
    }

    await dbRun(
      'UPDATE athletes SET approval_status = ? WHERE id = ?',
      [status, req.params.athleteId]
    );

    res.json({ message: `Athlete ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get coach's athletes
app.get('/api/coaches/my-athletes', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);

    if (!coach) {
      return res.status(404).json({ error: 'Coach profile not found' });
    }

    const athletes = await dbAll(`
      SELECT a.*, u.first_name, u.last_name, u.phone, b.name as branch_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      WHERE a.coach_id = ? AND a.approval_status = 'approved'
      ORDER BY u.last_name, u.first_name
    `, [coach.id]);

    res.json(athletes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update athlete characteristics (coach only)
app.put('/api/coaches/update-athlete/:athleteId', authenticateToken, authorizeRole('coach', 'admin'), async (req, res) => {
  const { weight, height, belt_level } = req.body;

  try {
    // Get current athlete data
    const athlete = await dbGet('SELECT * FROM athletes WHERE id = ?', [req.params.athleteId]);

    if (!athlete) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    // If coach, verify ownership
    if (req.user.role === 'coach') {
      const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
      if (athlete.coach_id !== coach.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    // Log changes
    const changes = [];
    if (weight && weight !== athlete.weight) {
      changes.push({ field: 'weight', old: athlete.weight, new: weight });
    }
    if (height && height !== athlete.height) {
      changes.push({ field: 'height', old: athlete.height, new: height });
    }
    if (belt_level && belt_level !== athlete.belt_level) {
      changes.push({ field: 'belt_level', old: athlete.belt_level, new: belt_level });
    }

    // Save logs
    for (const change of changes) {
      await dbRun(
        'INSERT INTO athlete_changes_log (athlete_id, changed_by_user_id, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
        [req.params.athleteId, req.user.id, change.field, change.old, change.new]
      );
    }

    // Determine new weight category if weight changed
    let weightCategory = athlete.weight_category;
    if (weight && athlete.gender) {
      const categoryMapping = await dbGet(
        'SELECT category_name FROM weight_categories_mapping WHERE gender = ? AND ? >= min_weight AND ? <= max_weight',
        [athlete.gender, weight, weight]
      );
      if (categoryMapping) {
        weightCategory = categoryMapping.category_name;
      }
    }

    // Update athlete
    await dbRun(
      'UPDATE athletes SET weight = ?, height = ?, belt_level = ?, weight_category = ? WHERE id = ?',
      [weight || athlete.weight, height || athlete.height, belt_level || athlete.belt_level, weightCategory, req.params.athleteId]
    );

    res.json({ message: 'Athlete updated successfully', changesCount: changes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Продолжение в следующем сообщении из-за лимита символов...
// ============= ATHLETES ENDPOINTS =============

// Get all athletes (admin/coach)
app.get('/api/athletes', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin' ? '' : "WHERE a.approval_status = 'approved'";
    const athletes = await dbAll(`
      SELECT a.*, u.first_name, u.last_name, u.phone, b.name as branch_name,
             cu.first_name as coach_first_name, cu.last_name as coach_last_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      LEFT JOIN coaches c ON a.coach_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      ${whereClause}
      ORDER BY u.last_name, u.first_name
    `);
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get athlete profile (own profile)
app.get('/api/athletes/me', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet(`
      SELECT a.*, u.first_name, u.last_name, u.phone, b.name as branch_name,
             cu.first_name as coach_first_name, cu.last_name as coach_last_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      LEFT JOIN coaches c ON a.coach_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      WHERE a.user_id = ?
    `, [req.user.id]);

    if (!athlete) {
      return res.status(404).json({ error: 'Athlete profile not found' });
    }

    res.json(athlete);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload athlete photo
app.post('/api/athletes/photo', authenticateToken, authorizeRole('athlete'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    const athlete = await dbGet('SELECT id, photo_url FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    // Delete old photo file if exists
    if (athlete.photo_url) {
      const oldPath = path.join(__dirname, 'public', athlete.photo_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await dbRun('UPDATE athletes SET photo_url = ? WHERE user_id = ?', [photoUrl, req.user.id]);
    res.json({ photo_url: photoUrl, message: 'Photo uploaded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my registrations (athlete)
app.get('/api/athletes/my-registrations', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const registrations = await dbAll(`
      SELECT cr.competition_id, cr.category_id, cc.weight_category, cc.gender
      FROM competition_registrations cr
      JOIN competition_categories cc ON cr.category_id = cc.id
      WHERE cr.athlete_id = ?
    `, [athlete.id]);

    res.json(registrations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= SEASONS ENDPOINTS =============

// Get all seasons
app.get('/api/seasons', async (req, res) => {
  try {
    const seasons = await dbAll('SELECT * FROM seasons ORDER BY start_date DESC');
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active season
app.get('/api/seasons/active', async (req, res) => {
  try {
    const season = await dbGet('SELECT * FROM seasons WHERE is_active = 1 LIMIT 1');
    res.json(season || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create season (admin only)
app.post('/api/seasons', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, start_date, end_date, is_active } = req.body;
  try {
    if (is_active) {
      await dbRun('UPDATE seasons SET is_active = 0');
    }
    const result = await dbRun(
      'INSERT INTO seasons (name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)',
      [name, start_date, end_date, is_active ? 1 : 0]
    );
    res.json({ id: result.id, message: 'Season created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= COMPETITIONS ENDPOINTS =============

// Get all competitions
app.get('/api/competitions', async (req, res) => {
  try {
    const { branch_id } = req.query;
    let query = `
      SELECT c.*, s.name as season_name, b.name as branch_name,
             u.first_name as creator_first_name, u.last_name as creator_last_name
      FROM competitions c
      LEFT JOIN seasons s ON c.season_id = s.id
      LEFT JOIN branches b ON c.branch_id = b.id
      LEFT JOIN users u ON c.created_by_user_id = u.id
    `;
    const params = [];
    if (branch_id) {
      query += ' WHERE c.branch_id = ?';
      params.push(branch_id);
    }
    query += ' ORDER BY c.competition_date DESC';
    const competitions = await dbAll(query, params);
    res.json(competitions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get competition by ID with categories
app.get('/api/competitions/:id', async (req, res) => {
  try {
    const competition = await dbGet(`
      SELECT c.*, s.name as season_name, b.name as branch_name
      FROM competitions c
      LEFT JOIN seasons s ON c.season_id = s.id
      LEFT JOIN branches b ON c.branch_id = b.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    const categories = await dbAll(
      'SELECT * FROM competition_categories WHERE competition_id = ? ORDER BY weight_category',
      [req.params.id]
    );

    competition.categories = categories;
    res.json(competition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create competition (admin/coach)
app.post('/api/competitions', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  const { name, competition_date, location, level, season_id, branch_id, description, categories } = req.body;
  try {
    // Auto-set branch_id from coach's branch if not provided
    let effectiveBranchId = branch_id;
    if (!effectiveBranchId && req.user.role === 'coach') {
      const coach = await dbGet('SELECT branch_id FROM coaches WHERE user_id = ?', [req.user.id]);
      if (coach) effectiveBranchId = coach.branch_id;
    }

    // Auto-assign active season if not provided
    let effectiveSeasonId = season_id;
    if (!effectiveSeasonId) {
      const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
      if (activeSeason) effectiveSeasonId = activeSeason.id;
    }

    const result = await dbRun(
      'INSERT INTO competitions (name, competition_date, location, level, season_id, branch_id, created_by_user_id, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, competition_date, location, level, effectiveSeasonId, effectiveBranchId, req.user.id, description]
    );

    const competitionId = result.id;

    // Add categories if provided
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        await dbRun(
          'INSERT INTO competition_categories (competition_id, weight_category, gender, max_participants) VALUES (?, ?, ?, ?)',
          [competitionId, cat.weight_category, cat.gender, cat.max_participants || null]
        );
      }
    }

    res.json({ id: competitionId, message: 'Competition created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-populate default categories for a competition (if none exist)
app.post('/api/competitions/:id/auto-categories', authenticateToken, async (req, res) => {
  try {
    const existing = await dbAll('SELECT id FROM competition_categories WHERE competition_id = ?', [req.params.id]);
    if (existing.length > 0) {
      return res.json({ message: 'Categories already exist', count: existing.length });
    }

    const mappings = await dbAll('SELECT DISTINCT category_name, gender FROM weight_categories_mapping ORDER BY gender, min_weight');
    for (const m of mappings) {
      await dbRun(
        'INSERT INTO competition_categories (competition_id, weight_category, gender) VALUES (?, ?, ?)',
        [req.params.id, m.category_name, m.gender]
      );
    }

    res.json({ message: 'Default categories created', count: mappings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add category to existing competition
app.post('/api/competitions/:id/categories', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  const { weight_category, gender, max_participants } = req.body;
  try {
    const result = await dbRun(
      'INSERT INTO competition_categories (competition_id, weight_category, gender, max_participants) VALUES (?, ?, ?, ?)',
      [req.params.id, weight_category, gender, max_participants || null]
    );
    res.json({ id: result.id, message: 'Category added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete category from competition
app.delete('/api/competitions/:id/categories/:categoryId', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  try {
    await dbRun('DELETE FROM competition_categories WHERE id = ? AND competition_id = ?', [req.params.categoryId, req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register for competition (athlete/coach)
app.post('/api/competitions/:id/register', authenticateToken, async (req, res) => {
  const { athlete_id, category_id } = req.body;

  try {
    // If athlete registering themselves
    if (req.user.role === 'athlete') {
      const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
      if (!athlete || athlete.id != athlete_id) {
        return res.status(403).json({ error: 'Can only register yourself' });
      }
    }

    // If coach registering athlete
    if (req.user.role === 'coach') {
      const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
      const athlete = await dbGet('SELECT coach_id FROM athletes WHERE id = ?', [athlete_id]);
      if (!athlete || athlete.coach_id !== coach.id) {
        return res.status(403).json({ error: 'Can only register your athletes' });
      }
    }

    // Check if already registered
    const existing = await dbGet(
      'SELECT id FROM competition_registrations WHERE competition_id = ? AND athlete_id = ?',
      [req.params.id, athlete_id]
    );

    if (existing) {
      return res.status(400).json({ error: 'Already registered for this competition' });
    }

    await dbRun(
      'INSERT INTO competition_registrations (competition_id, athlete_id, category_id, registered_by_user_id) VALUES (?, ?, ?, ?)',
      [req.params.id, athlete_id, category_id, req.user.id]
    );

    res.json({ message: 'Successfully registered for competition' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get registrations for competition
app.get('/api/competitions/:id/registrations', authenticateToken, async (req, res) => {
  try {
    const registrations = await dbAll(`
      SELECT cr.*, a.id as athlete_id, u.first_name, u.last_name, 
             a.weight, a.weight_category, a.belt_level, a.gender,
             cc.weight_category as category_name, cc.gender as category_gender
      FROM competition_registrations cr
      JOIN athletes a ON cr.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      JOIN competition_categories cc ON cr.category_id = cc.id
      WHERE cr.competition_id = ?
      ORDER BY cc.weight_category, u.last_name
    `, [req.params.id]);

    res.json(registrations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete registration (before bracket generation)
app.delete('/api/competitions/:compId/registrations/:athleteId', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  try {
    const comp = await dbGet('SELECT bracket_generated FROM competitions WHERE id = ?', [req.params.compId]);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    if (comp.bracket_generated) return res.status(400).json({ error: 'Нельзя отменить регистрацию после генерации сетки' });

    await dbRun(
      'DELETE FROM competition_registrations WHERE competition_id = ? AND athlete_id = ?',
      [req.params.compId, req.params.athleteId]
    );
    res.json({ message: 'Registration cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= SPARRINGS ENDPOINTS =============

// Create sparring (coach/admin)
app.post('/api/sparrings', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  const { competition_id, category_id, athlete1_id, athlete2_id, round_name } = req.body;

  try {
    const result = await dbRun(
      'INSERT INTO sparrings (competition_id, category_id, athlete1_id, athlete2_id, round_name) VALUES (?, ?, ?, ?, ?)',
      [competition_id, category_id, athlete1_id, athlete2_id, round_name || null]
    );

    res.json({ id: result.id, message: 'Sparring created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sparrings for competition
app.get('/api/competitions/:id/sparrings', async (req, res) => {
  try {
    const sparrings = await dbAll(`
      SELECT s.*,
             a1.id as athlete1_id, u1.first_name as athlete1_first_name, u1.last_name as athlete1_last_name,
             a2.id as athlete2_id, u2.first_name as athlete2_first_name, u2.last_name as athlete2_last_name,
             cc.weight_category, cc.gender as category_gender,
             f.id as fight_id, f.winner_id, f.result_type
      FROM sparrings s
      JOIN athletes a1 ON s.athlete1_id = a1.id
      JOIN users u1 ON a1.user_id = u1.id
      JOIN athletes a2 ON s.athlete2_id = a2.id
      JOIN users u2 ON a2.user_id = u2.id
      JOIN competition_categories cc ON s.category_id = cc.id
      LEFT JOIN fights f ON s.id = f.sparring_id
      WHERE s.competition_id = ?
      ORDER BY cc.weight_category, s.created_at
    `, [req.params.id]);

    res.json(sparrings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= FIGHTS ENDPOINTS =============

// Add fight result (coach/admin)
app.post('/api/fights', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  const { sparring_id, winner_id, result_type, athlete1_score, athlete2_score, duration_seconds, notes } = req.body;

  try {
    // Get sparring info
    const sparring = await dbGet('SELECT * FROM sparrings WHERE id = ?', [sparring_id]);

    if (!sparring) {
      return res.status(404).json({ error: 'Sparring not found' });
    }

    // Insert fight
    const result = await dbRun(
      'INSERT INTO fights (sparring_id, winner_id, result_type, athlete1_score, athlete2_score, duration_seconds, notes, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [sparring_id, winner_id, result_type, athlete1_score, athlete2_score, duration_seconds, notes, req.user.id]
    );

    // Update sparring status
    await dbRun('UPDATE sparrings SET status = ? WHERE id = ?', ['completed', sparring_id]);

    // Update ratings
    await updateRatings(sparring.competition_id, sparring.athlete1_id, sparring.athlete2_id, winner_id, result_type);

    res.json({ id: result.id, message: 'Fight recorded and ratings updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Function to update ratings after a fight
async function updateRatings(competition_id, athlete1_id, athlete2_id, winner_id, result_type) {
  const competition = await dbGet(
    'SELECT season_id, level FROM competitions WHERE id = ?',
    [competition_id]
  );

  if (!competition || !competition.season_id) return;

  const config = await dbGet(
    'SELECT * FROM rating_config WHERE competition_level = ?',
    [competition.level]
  );

  if (!config) return;

  const winnerPoints = result_type === 'ippon' ? config.win_ippon_points : config.win_points_points;
  const loserPoints = config.loss_points;

  if (winner_id) {
    await dbRun(`
      INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, wins_count, ippon_count)
      VALUES (?, ?, ?, 1, 1, ?)
      ON CONFLICT(athlete_id, season_id) DO UPDATE SET
        total_points = total_points + ?,
        fights_count = fights_count + 1,
        wins_count = wins_count + 1,
        ippon_count = ippon_count + ?,
        updated_at = CURRENT_TIMESTAMP
    `, [winner_id, competition.season_id, winnerPoints, result_type === 'ippon' ? 1 : 0, winnerPoints, result_type === 'ippon' ? 1 : 0]);

    // Check belt promotion eligibility
    await checkBeltPromotion(winner_id, competition.season_id);

    const loser_id = athlete1_id === winner_id ? athlete2_id : athlete1_id;
    if (loser_id) {
      await dbRun(`
        INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, losses_count)
        VALUES (?, ?, ?, 1, 1)
        ON CONFLICT(athlete_id, season_id) DO UPDATE SET
          total_points = total_points + ?,
          fights_count = fights_count + 1,
          losses_count = losses_count + 1,
          updated_at = CURRENT_TIMESTAMP
      `, [loser_id, competition.season_id, loserPoints, loserPoints]);
    }
  }
}

async function checkBeltPromotion(athleteId, seasonId) {
  try {
    // Get athlete's total points across all seasons
    const totalRow = await dbGet(
      'SELECT SUM(total_points) as total FROM ratings WHERE athlete_id = ?',
      [athleteId]
    );
    const totalPoints = totalRow ? totalRow.total : 0;

    // Get athlete's current belt
    const athlete = await dbGet(
      'SELECT a.id, a.user_id, a.belt_level, a.coach_id, u.first_name, u.last_name FROM athletes a JOIN users u ON a.user_id = u.id WHERE a.id = ?',
      [athleteId]
    );
    if (!athlete) return;

    // Get next belt level
    const currentBelt = await dbGet('SELECT * FROM belt_levels WHERE name = ?', [athlete.belt_level || 'белый']);
    const currentOrder = currentBelt ? currentBelt.rank_order : 0;

    const nextBelt = await dbGet(
      'SELECT * FROM belt_levels WHERE rank_order > ? AND min_points <= ? ORDER BY rank_order ASC LIMIT 1',
      [currentOrder, totalPoints]
    );

    if (nextBelt && nextBelt.name !== athlete.belt_level) {
      // Check if notification already sent for this belt level
      const existing = await dbGet(
        `SELECT id FROM notifications WHERE user_id = ? AND type = 'belt_promotion' AND message LIKE ?`,
        [athlete.user_id, `%${nextBelt.name} пояс%`]
      );
      if (!existing) {
        // Notify the athlete
        await createNotification(
          athlete.user_id,
          'belt_promotion',
          'Повышение пояса доступно!',
          `Поздравляем, ${athlete.first_name}! Вы набрали ${totalPoints} очков и можете получить ${nextBelt.name} пояс.`,
          null
        );

        // Notify the coach
        if (athlete.coach_id) {
          const coach = await dbGet('SELECT user_id FROM coaches WHERE id = ?', [athlete.coach_id]);
          if (coach) {
            await createNotification(
              coach.user_id,
              'belt_promotion',
              'Спортсмен готов к повышению',
              `${athlete.first_name} ${athlete.last_name} набрал(а) ${totalPoints} очков — доступен ${nextBelt.name} пояс.`,
              null
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('Belt promotion check error:', err);
  }
}

// ============= RATINGS ENDPOINTS =============

app.get('/api/ratings', async (req, res) => {
  try {
    let seasonId = req.query.season_id;
    if (!seasonId) {
      const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
      if (!activeSeason) return res.json([]);
      seasonId = activeSeason.id;
    }

    const limit = parseInt(req.query.limit) || 0;
    const offset = parseInt(req.query.offset) || 0;

    let sql = `
      SELECT r.*, a.belt_level, a.weight_category, a.gender, a.photo_url, a.branch_id,
             u.first_name, u.last_name, b.name as branch_name, s.name as season_name,
             (SELECT COUNT(*) FROM tournament_brackets tb
              JOIN competition_categories cc ON tb.category_id = cc.id
              JOIN competitions comp ON tb.competition_id = comp.id
              WHERE tb.winner_id = r.athlete_id
              AND comp.season_id = r.season_id
              AND tb.round_number = (SELECT MAX(tb2.round_number) FROM tournament_brackets tb2 WHERE tb2.category_id = tb.category_id AND tb2.competition_id = tb.competition_id)
             ) as gold_medals
      FROM ratings r
      JOIN athletes a ON r.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      JOIN seasons s ON r.season_id = s.id
      WHERE r.season_id = ?
      ORDER BY r.total_points DESC, r.wins_count DESC
    `;
    const params = [seasonId];
    if (limit > 0) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    const ratings = await dbAll(sql, params);
    res.json(ratings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ratings/branch/:branchId', async (req, res) => {
  try {
    let seasonId = req.query.season_id;
    if (!seasonId) {
      const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
      if (!activeSeason) return res.json([]);
      seasonId = activeSeason.id;
    }

    const ratings = await dbAll(`
      SELECT r.*, a.belt_level, a.weight_category, a.gender, a.photo_url, a.branch_id,
             u.first_name, u.last_name, b.name as branch_name, s.name as season_name
      FROM ratings r
      JOIN athletes a ON r.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      JOIN seasons s ON r.season_id = s.id
      WHERE r.season_id = ? AND a.branch_id = ?
      ORDER BY r.total_points DESC, r.wins_count DESC
    `, [seasonId, req.params.branchId]);

    res.json(ratings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Branch rankings (aggregate)
app.get('/api/ratings/branch-rankings', async (req, res) => {
  try {
    let seasonId = req.query.season_id;
    if (!seasonId) {
      const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
      if (!activeSeason) return res.json([]);
      seasonId = activeSeason.id;
    }

    const rankings = await dbAll(`
      SELECT b.id, b.name, b.city,
             COUNT(DISTINCT r.athlete_id) as athlete_count,
             COALESCE(SUM(r.total_points), 0) as total_points,
             COALESCE(SUM(r.wins_count), 0) as total_wins,
             COALESCE(ROUND(AVG(r.total_points), 1), 0) as avg_points
      FROM branches b
      LEFT JOIN athletes a ON a.branch_id = b.id
      LEFT JOIN ratings r ON r.athlete_id = a.id AND r.season_id = ?
      GROUP BY b.id
      HAVING athlete_count > 0
      ORDER BY total_points DESC
    `, [seasonId]);

    res.json(rankings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggregate data for Branch Profile Page
app.get('/api/branch-profile/:id', async (req, res) => {
  try {
    const branchId = req.params.id;
    const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');

    // 1. Branch Info
    const branch = await dbGet('SELECT * FROM branches WHERE id = ?', [branchId]);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // 2. Stats
    const athletesCount = await dbGet('SELECT COUNT(*) as count FROM athletes WHERE branch_id = ?', [branchId]);
    const coachesCount = await dbGet('SELECT COUNT(*) as count FROM coaches WHERE branch_id = ?', [branchId]);

    const ratingStats = await dbGet(`
      SELECT 
        SUM(COALESCE(r.wins_count, 0)) as total_wins,
        SUM(COALESCE(r.total_points, 0)) as branch_score
      FROM athletes a
      LEFT JOIN ratings r ON a.id = r.athlete_id AND r.season_id = ?
      WHERE a.branch_id = ?
    `, [activeSeason ? activeSeason.id : 0, branchId]);

    const stats = {
      total_athletes: athletesCount.count || 0,
      total_coaches: coachesCount.count || 0,
      total_wins: ratingStats.total_wins || 0,
      branch_score: ratingStats.branch_score || 0,
      avg_points_per_athlete: athletesCount.count > 0 ? (ratingStats.branch_score / athletesCount.count).toFixed(1) : 0
    };

    // 3. Coaches in this branch
    const coaches = await dbAll(`
      SELECT c.id, c.specialization, c.experience_years,
             u.first_name, u.last_name,
             (SELECT COUNT(*) FROM athletes WHERE coach_id = c.id) as athlete_count
      FROM coaches c
      JOIN users u ON c.user_id = u.id
      WHERE c.branch_id = ?
    `, [branchId]);

    // 4. Top Athletes in this branch
    const topAthletes = await dbAll(`
      SELECT a.id, a.photo_url, a.gender, a.belt_level, u.first_name, u.last_name,
             r.total_points, r.wins_count
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN ratings r ON a.id = r.athlete_id AND r.season_id = ?
      WHERE a.branch_id = ?
      ORDER BY COALESCE(r.total_points, 0) DESC, COALESCE(r.wins_count, 0) DESC
      LIMIT 10
    `, [activeSeason ? activeSeason.id : 0, branchId]);

    res.json({ branch, stats, coaches, topAthletes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ratings/athlete/:athleteId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'athlete') {
      const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
      if (!athlete || athlete.id != req.params.athleteId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    if (req.user.role === 'coach') {
      const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
      const athlete = await dbGet('SELECT coach_id FROM athletes WHERE id = ?', [req.params.athleteId]);
      if (!athlete || athlete.coach_id !== coach.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    const ratings = await dbAll(`
      SELECT r.*, s.name as season_name, s.start_date, s.end_date
      FROM ratings r
      JOIN seasons s ON r.season_id = s.id
      WHERE r.athlete_id = ?
      ORDER BY s.start_date DESC
    `, [req.params.athleteId]);

    res.json(ratings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= DISCIPLINES ENDPOINTS =============

app.get('/api/disciplines', async (req, res) => {
  try {
    const disciplines = await dbAll('SELECT * FROM disciplines ORDER BY id');
    res.json(disciplines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= BELT LEVELS ENDPOINTS =============

app.get('/api/belt-levels', async (req, res) => {
  try {
    const levels = await dbAll('SELECT * FROM belt_levels ORDER BY rank_order');
    res.json(levels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get athletes eligible for belt promotion (coach)
app.get('/api/coaches/belt-eligible', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
    if (!activeSeason) return res.json([]);

    const eligible = await dbAll(`
      SELECT a.id, a.belt_level, a.weight_category, u.first_name, u.last_name,
             r.total_points,
             bl_current.rank_order as current_rank,
             bl_next.name as next_belt_name, bl_next.min_points as next_belt_min_points
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN ratings r ON a.id = r.athlete_id AND r.season_id = ?
      LEFT JOIN belt_levels bl_current ON a.belt_level = bl_current.name
      LEFT JOIN belt_levels bl_next ON bl_next.rank_order = COALESCE(bl_current.rank_order, 0) + 1
      WHERE a.coach_id = ? AND a.approval_status = 'approved'
        AND bl_next.id IS NOT NULL
        AND COALESCE(r.total_points, 0) >= bl_next.min_points
      ORDER BY r.total_points DESC
    `, [activeSeason.id, coach.id]);

    res.json(eligible);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Promote athlete belt (coach)
app.post('/api/coaches/promote-belt/:athleteId', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { new_belt_level } = req.body;
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const athlete = await dbGet('SELECT * FROM athletes WHERE id = ? AND coach_id = ?', [req.params.athleteId, coach.id]);
    if (!athlete) return res.status(403).json({ error: 'Not authorized' });

    const oldBelt = athlete.belt_level;

    await dbRun('UPDATE athletes SET belt_level = ? WHERE id = ?', [new_belt_level, req.params.athleteId]);

    await dbRun(
      'INSERT INTO athlete_changes_log (athlete_id, changed_by_user_id, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [req.params.athleteId, req.user.id, 'belt_level', oldBelt, new_belt_level]
    );

    res.json({ message: 'Belt promoted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= TRAINING SCHEDULES ENDPOINTS =============

// Get coach's own schedules
app.get('/api/schedules/my', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id, branch_id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const schedules = await dbAll(
      'SELECT * FROM training_schedules WHERE coach_id = ? ORDER BY day_of_week, start_time',
      [coach.id]
    );
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create schedule (coach)
app.post('/api/schedules', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { day_of_week, start_time, end_time, is_paid, price, max_participants, description } = req.body;
  try {
    const coach = await dbGet('SELECT id, branch_id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const result = await dbRun(
      'INSERT INTO training_schedules (coach_id, branch_id, day_of_week, start_time, end_time, is_paid, price, max_participants, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [coach.id, coach.branch_id, day_of_week, start_time, end_time, is_paid ? 1 : 0, price || 0, max_participants || 20, description || null]
    );
    res.json({ id: result.id, message: 'Schedule created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update schedule (coach)
app.put('/api/schedules/:id', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { day_of_week, start_time, end_time, is_paid, price, max_participants, description, is_active } = req.body;
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    const schedule = await dbGet('SELECT * FROM training_schedules WHERE id = ? AND coach_id = ?', [req.params.id, coach.id]);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    await dbRun(
      'UPDATE training_schedules SET day_of_week=?, start_time=?, end_time=?, is_paid=?, price=?, max_participants=?, description=?, is_active=? WHERE id=?',
      [day_of_week ?? schedule.day_of_week, start_time ?? schedule.start_time, end_time ?? schedule.end_time,
      is_paid !== undefined ? (is_paid ? 1 : 0) : schedule.is_paid, price ?? schedule.price,
      max_participants ?? schedule.max_participants, description ?? schedule.description,
      is_active !== undefined ? (is_active ? 1 : 0) : schedule.is_active, req.params.id]
    );
    res.json({ message: 'Schedule updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete schedule (coach)
app.delete('/api/schedules/:id', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    await dbRun('UPDATE training_schedules SET is_active = 0 WHERE id = ? AND coach_id = ?', [req.params.id, coach.id]);
    res.json({ message: 'Schedule deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get coach public schedule
app.get('/api/coaches/:coachId/schedule', async (req, res) => {
  try {
    const schedules = await dbAll(
      'SELECT * FROM training_schedules WHERE coach_id = ? AND is_active = 1 ORDER BY day_of_week, start_time',
      [req.params.coachId]
    );
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get coach public profile
app.get('/api/coaches/:coachId/profile', async (req, res) => {
  try {
    const coach = await dbGet(`
      SELECT c.id, c.specialization, c.experience_years, c.branch_id,
             u.first_name, u.last_name, u.phone, b.name as branch_name
      FROM coaches c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN branches b ON c.branch_id = b.id
      WHERE c.id = ?
    `, [req.params.coachId]);

    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const schedules = await dbAll(
      'SELECT * FROM training_schedules WHERE coach_id = ? AND is_active = 1 ORDER BY day_of_week, start_time',
      [req.params.coachId]
    );

    coach.schedules = schedules;
    res.json(coach);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get coach's athletes (public, limited info)
app.get('/api/coaches/:coachId/athletes', async (req, res) => {
  try {
    const athletes = await dbAll(`
      SELECT a.id, a.belt_level, a.weight_category, a.gender, a.photo_url,
             u.first_name, u.last_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      WHERE a.coach_id = ? AND a.approval_status = 'approved' AND u.is_active = 1
      ORDER BY u.last_name, u.first_name
    `, [req.params.coachId]);
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= TRAINING BOOKINGS ENDPOINTS =============

// Get athlete's bookings
app.get('/api/bookings/my', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const bookings = await dbAll(`
      SELECT tb.*, ts.day_of_week, ts.start_time, ts.end_time, ts.is_paid, ts.price, ts.description,
             cu.first_name as coach_first_name, cu.last_name as coach_last_name
      FROM training_bookings tb
      JOIN training_schedules ts ON tb.schedule_id = ts.id
      JOIN coaches c ON ts.coach_id = c.id
      JOIN users cu ON c.user_id = cu.id
      WHERE tb.athlete_id = ?
      ORDER BY tb.booking_date DESC
    `, [athlete.id]);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Book a training session
app.post('/api/bookings', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  const { schedule_id, booking_date } = req.body;
  try {
    const athlete = await dbGet('SELECT id, trial_used FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const schedule = await dbGet('SELECT * FROM training_schedules WHERE id = ? AND is_active = 1', [schedule_id]);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    // Check max participants
    const bookingsCount = await dbGet(
      'SELECT COUNT(*) as cnt FROM training_bookings WHERE schedule_id = ? AND booking_date = ? AND status = ?',
      [schedule_id, booking_date, 'booked']
    );
    if (bookingsCount.cnt >= schedule.max_participants) {
      return res.status(400).json({ error: 'Training session is full' });
    }

    let isTrial = 0;
    let paymentStatus = 'pending';

    if (!athlete.trial_used) {
      isTrial = 1;
      paymentStatus = 'free';
      await dbRun('UPDATE athletes SET trial_used = 1 WHERE id = ?', [athlete.id]);
    } else if (!schedule.is_paid) {
      paymentStatus = 'free';
    } else {
      // Check active subscription
      const subscription = await dbGet(`
        SELECT * FROM subscriptions
        WHERE athlete_id = ? AND coach_id = ? AND status = 'active'
          AND start_date <= ? AND end_date >= ?
          AND (type != 'per_session' OR sessions_used < sessions_total)
      `, [athlete.id, schedule.coach_id, booking_date, booking_date]);

      if (subscription) {
        paymentStatus = 'paid';
        if (subscription.type === 'per_session') {
          await dbRun('UPDATE subscriptions SET sessions_used = sessions_used + 1 WHERE id = ?', [subscription.id]);
        }
      }
    }

    const result = await dbRun(
      'INSERT INTO training_bookings (schedule_id, athlete_id, booking_date, is_trial, payment_status) VALUES (?, ?, ?, ?, ?)',
      [schedule_id, athlete.id, booking_date, isTrial, paymentStatus]
    );

    res.json({ id: result.id, message: 'Booking created', is_trial: isTrial, payment_status: paymentStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel booking
app.delete('/api/bookings/:id', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
    await dbRun(
      "UPDATE training_bookings SET status = 'cancelled' WHERE id = ? AND athlete_id = ? AND status = 'booked'",
      [req.params.id, athlete.id]
    );
    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coach: get bookings for their schedules
app.get('/api/coaches/bookings', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const bookings = await dbAll(`
      SELECT tb.*, ts.day_of_week, ts.start_time, ts.end_time,
             u.first_name, u.last_name, u.phone,
             a.weight, a.belt_level
      FROM training_bookings tb
      JOIN training_schedules ts ON tb.schedule_id = ts.id
      JOIN athletes a ON tb.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE ts.coach_id = ?
      ORDER BY tb.booking_date DESC, ts.start_time
    `, [coach.id]);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coach: update booking status
app.put('/api/coaches/bookings/:id', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { status } = req.body;
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    const booking = await dbGet(`
      SELECT tb.* FROM training_bookings tb
      JOIN training_schedules ts ON tb.schedule_id = ts.id
      WHERE tb.id = ? AND ts.coach_id = ?
    `, [req.params.id, coach.id]);

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    await dbRun('UPDATE training_bookings SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Booking updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= SUBSCRIPTIONS ENDPOINTS =============

// Athlete: get my subscriptions
app.get('/api/subscriptions/my', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const subs = await dbAll(`
      SELECT s.*, cu.first_name as coach_first_name, cu.last_name as coach_last_name
      FROM subscriptions s
      JOIN coaches c ON s.coach_id = c.id
      JOIN users cu ON c.user_id = cu.id
      WHERE s.athlete_id = ?
      ORDER BY s.start_date DESC
    `, [athlete.id]);
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coach: create subscription
app.post('/api/subscriptions', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { athlete_id, type, start_date, end_date, sessions_total, price } = req.body;
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const result = await dbRun(
      'INSERT INTO subscriptions (athlete_id, coach_id, type, start_date, end_date, sessions_total, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [athlete_id, coach.id, type, start_date, end_date, sessions_total || null, price]
    );
    res.json({ id: result.id, message: 'Subscription created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coach: update subscription
app.put('/api/subscriptions/:id', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { status } = req.body;
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    await dbRun('UPDATE subscriptions SET status = ? WHERE id = ? AND coach_id = ?', [status, req.params.id, coach.id]);
    res.json({ message: 'Subscription updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coach: get subscriptions list
app.get('/api/coaches/subscriptions', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });

    const subs = await dbAll(`
      SELECT s.*, u.first_name, u.last_name, u.phone
      FROM subscriptions s
      JOIN athletes a ON s.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE s.coach_id = ?
      ORDER BY s.status, s.end_date DESC
    `, [coach.id]);
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= TOURNAMENT BRACKET ENDPOINTS =============

// Generate bracket for a competition
app.post('/api/competitions/:id/generate-bracket', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  try {
    const competitionId = parseInt(req.params.id);
    const competition = await dbGet('SELECT * FROM competitions WHERE id = ?', [competitionId]);
    if (!competition) return res.status(404).json({ error: 'Competition not found' });

    // Check if bracket already exists
    const existing = await dbAll('SELECT id FROM tournament_brackets WHERE competition_id = ?', [competitionId]);
    if (existing.length > 0) {
      // Delete old bracket
      await dbRun('DELETE FROM tournament_brackets WHERE competition_id = ?', [competitionId]);
    }

    const categories = await dbAll('SELECT * FROM competition_categories WHERE competition_id = ?', [competitionId]);
    let totalMatches = 0;

    for (const category of categories) {
      const registrations = await dbAll(
        "SELECT cr.athlete_id FROM competition_registrations cr WHERE cr.competition_id = ? AND cr.category_id = ? AND cr.status != 'cancelled'",
        [competitionId, category.id]
      );

      if (registrations.length === 0) continue;

      // Single athlete — auto-win (champion without fights)
      if (registrations.length === 1) {
        const soloId = registrations[0].athlete_id;
        await dbRun(
          'INSERT INTO tournament_brackets (competition_id, category_id, round_number, match_number, athlete1_id, is_bye, winner_id) VALUES (?, ?, 1, 1, ?, 1, ?)',
          [competitionId, category.id, soloId, soloId]
        );
        totalMatches++;
        continue;
      }

      // Fisher-Yates shuffle
      const athletes = registrations.map(r => r.athlete_id);
      for (let i = athletes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [athletes[i], athletes[j]] = [athletes[j], athletes[i]];
      }

      // Calculate bracket size (next power of 2)
      const n = athletes.length;
      let bracketSize = 1;
      while (bracketSize < n) bracketSize *= 2;

      const totalRounds = Math.log2(bracketSize);
      const firstRoundMatches = bracketSize / 2;
      const byes = bracketSize - n;

      // Create all match slots for all rounds
      const matchIds = {};

      // Create matches from final backwards to assign next_match_id
      for (let round = totalRounds; round >= 1; round--) {
        const matchesInRound = Math.pow(2, totalRounds - round);
        for (let m = 1; m <= matchesInRound; m++) {
          const nextMatchKey = round < totalRounds ? `${round + 1}-${Math.ceil(m / 2)}` : null;
          const nextMatchId = nextMatchKey ? (matchIds[nextMatchKey] || null) : null;

          const result = await dbRun(
            'INSERT INTO tournament_brackets (competition_id, category_id, round_number, match_number, next_match_id) VALUES (?, ?, ?, ?, ?)',
            [competitionId, category.id, round, m, nextMatchId]
          );
          matchIds[`${round}-${m}`] = result.id;
          totalMatches++;
        }
      }

      // Fill first round with athletes
      let athleteIdx = 0;
      for (let m = 1; m <= firstRoundMatches; m++) {
        const matchId = matchIds[`1-${m}`];
        const nextMatchId = matchIds[`2-${Math.ceil(m / 2)}`] || null;

        if (m <= byes) {
          // Bye match: only athlete1, auto-advance
          const a1 = athletes[athleteIdx++];
          await dbRun(
            'UPDATE tournament_brackets SET athlete1_id=?, is_bye=1, winner_id=? WHERE id=?',
            [a1, a1, matchId]
          );
          // Propagate winner to next round
          if (nextMatchId) {
            const nextMatch = await dbGet('SELECT * FROM tournament_brackets WHERE id = ?', [nextMatchId]);
            if (!nextMatch.athlete1_id) {
              await dbRun('UPDATE tournament_brackets SET athlete1_id=? WHERE id=?', [a1, nextMatchId]);
            } else {
              await dbRun('UPDATE tournament_brackets SET athlete2_id=? WHERE id=?', [a1, nextMatchId]);
            }
          }
        } else {
          // Real match
          const a1 = athletes[athleteIdx++];
          const a2 = athletes[athleteIdx++];
          await dbRun(
            'UPDATE tournament_brackets SET athlete1_id=?, athlete2_id=? WHERE id=?',
            [a1, a2, matchId]
          );
        }
      }
    }

    await dbRun('UPDATE competitions SET bracket_generated = 1 WHERE id = ?', [competitionId]);
    res.json({ message: 'Bracket generated', total_matches: totalMatches });
  } catch (err) {
    console.error('Bracket generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get bracket for competition
app.get('/api/competitions/:id/bracket', async (req, res) => {
  try {
    const competition = await dbGet(`
      SELECT c.name, c.competition_date, c.location, s.name as season_name
      FROM competitions c
      LEFT JOIN seasons s ON c.season_id = s.id
      WHERE c.id = ?
    `, [req.params.id]);
    if (!competition) return res.status(404).json({ error: 'Competition not found' });

    const brackets = await dbAll(`
      SELECT tb.*,
             u1.first_name as athlete1_first_name, u1.last_name as athlete1_last_name,
             u2.first_name as athlete2_first_name, u2.last_name as athlete2_last_name,
             uw.first_name as winner_first_name, uw.last_name as winner_last_name,
             cc.weight_category, cc.gender as category_gender,
             f.result_type, f.athlete1_score, f.athlete2_score
      FROM tournament_brackets tb
      LEFT JOIN athletes a1 ON tb.athlete1_id = a1.id
      LEFT JOIN users u1 ON a1.user_id = u1.id
      LEFT JOIN athletes a2 ON tb.athlete2_id = a2.id
      LEFT JOIN users u2 ON a2.user_id = u2.id
      LEFT JOIN athletes aw ON tb.winner_id = aw.id
      LEFT JOIN users uw ON aw.user_id = uw.id
      JOIN competition_categories cc ON tb.category_id = cc.id
      LEFT JOIN sparrings sp ON tb.sparring_id = sp.id
      LEFT JOIN fights f ON sp.id = f.sparring_id
      WHERE tb.competition_id = ?
      ORDER BY cc.weight_category, tb.round_number, tb.match_number
    `, [req.params.id]);

    // Group by category
    const categoriesMap = {};
    for (const row of brackets) {
      const key = `${row.category_gender || ''} ${row.weight_category}`.trim();
      if (!categoriesMap[key]) {
        categoriesMap[key] = { category: key, matches: [] };
      }
      categoriesMap[key].matches.push({
        id: row.id,
        round_number: row.round_number,
        match_number: row.match_number,
        athlete1_id: row.athlete1_id,
        athlete1_name: row.athlete1_first_name ? `${row.athlete1_last_name} ${row.athlete1_first_name}` : null,
        athlete2_id: row.athlete2_id,
        athlete2_name: row.athlete2_first_name ? `${row.athlete2_last_name} ${row.athlete2_first_name}` : null,
        winner_id: row.winner_id,
        is_bye: row.is_bye,
        result_type: row.result_type,
        score1: row.athlete1_score,
        score2: row.athlete2_score
      });
    }

    res.json({
      competition: competition.name,
      competition_date: competition.competition_date,
      location: competition.location,
      season_name: competition.season_name,
      categories: Object.values(categoriesMap)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record bracket match result
app.post('/api/competitions/:id/bracket/:matchId/result', authenticateToken, authorizeRole('admin', 'coach'), async (req, res) => {
  const { winner_id, result_type, athlete1_score, athlete2_score, notes } = req.body;
  try {
    const match = await dbGet('SELECT * FROM tournament_brackets WHERE id = ? AND competition_id = ?', [req.params.matchId, req.params.id]);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.winner_id) return res.status(400).json({ error: 'Match already has a result' });

    // Create sparring
    const sparringResult = await dbRun(
      'INSERT INTO sparrings (competition_id, category_id, athlete1_id, athlete2_id, round_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, match.category_id, match.athlete1_id, match.athlete2_id, `Раунд ${match.round_number}`, 'completed']
    );

    // Create fight
    await dbRun(
      'INSERT INTO fights (sparring_id, winner_id, result_type, athlete1_score, athlete2_score, notes, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sparringResult.id, winner_id, result_type, athlete1_score || 0, athlete2_score || 0, notes, req.user.id]
    );

    // Update bracket match
    await dbRun('UPDATE tournament_brackets SET winner_id = ?, sparring_id = ? WHERE id = ?', [winner_id, sparringResult.id, match.id]);

    // Propagate winner to next match
    if (match.next_match_id) {
      const nextMatch = await dbGet('SELECT * FROM tournament_brackets WHERE id = ?', [match.next_match_id]);
      if (!nextMatch.athlete1_id) {
        await dbRun('UPDATE tournament_brackets SET athlete1_id = ? WHERE id = ?', [winner_id, match.next_match_id]);
      } else {
        await dbRun('UPDATE tournament_brackets SET athlete2_id = ? WHERE id = ?', [winner_id, match.next_match_id]);
      }
    }

    // Update ratings
    await updateRatings(parseInt(req.params.id), match.athlete1_id, match.athlete2_id, winner_id, result_type);

    res.json({ message: 'Match result recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= FIGHT HISTORY ENDPOINT =============

// Athlete: get my sparring history
app.get('/api/athletes/my-sparrings', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const sparrings = await dbAll(`
      SELECT s.id, s.round_name, s.status,
             f.result_type, f.athlete1_score, f.athlete2_score, f.fight_date, f.winner_id, f.notes,
             u1.first_name as athlete1_first_name, u1.last_name as athlete1_last_name, s.athlete1_id,
             u2.first_name as athlete2_first_name, u2.last_name as athlete2_last_name, s.athlete2_id,
             cc.weight_category, cc.gender as category_gender,
             c.name as competition_name, c.level as competition_level, c.competition_date,
             rc.win_ippon_points, rc.win_points_points, rc.loss_points
      FROM sparrings s
      JOIN fights f ON s.id = f.sparring_id
      JOIN athletes a1 ON s.athlete1_id = a1.id
      JOIN users u1 ON a1.user_id = u1.id
      JOIN athletes a2 ON s.athlete2_id = a2.id
      JOIN users u2 ON a2.user_id = u2.id
      JOIN competition_categories cc ON s.category_id = cc.id
      JOIN competitions c ON s.competition_id = c.id
      LEFT JOIN rating_config rc ON c.level = rc.competition_level
      WHERE (s.athlete1_id = ? OR s.athlete2_id = ?) AND s.status = 'completed'
      ORDER BY f.fight_date DESC
    `, [athlete.id, athlete.id]);

    res.json(sparrings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= BRANCH ATHLETES ENDPOINT =============

// Get all athletes in a branch (across all coaches)
app.get('/api/branches/:id/athletes', authenticateToken, authorizeRole('coach', 'admin'), async (req, res) => {
  try {
    const athletes = await dbAll(`
      SELECT a.*, u.first_name, u.last_name, u.phone,
             cu.first_name as coach_first_name, cu.last_name as coach_last_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN coaches c ON a.coach_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      WHERE a.branch_id = ? AND a.approval_status = 'approved'
      ORDER BY u.last_name, u.first_name
    `, [req.params.id]);
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= ATHLETE DASHBOARD SUMMARY =============

// Dashboard summary: stats, upcoming events, belt progress
app.get('/api/athletes/dashboard', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet(`
      SELECT a.*, u.first_name, u.last_name, b.name as branch_name,
             cu.first_name as coach_first_name, cu.last_name as coach_last_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      LEFT JOIN coaches c ON a.coach_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      WHERE a.user_id = ?
    `, [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
    let rating = null, rank = null;
    if (activeSeason) {
      rating = await dbGet('SELECT * FROM ratings WHERE athlete_id = ? AND season_id = ?', [athlete.id, activeSeason.id]);
      if (rating) {
        const rankRow = await dbGet(`
          SELECT COUNT(*) + 1 as rank FROM ratings
          WHERE season_id = ? AND total_points > ?
        `, [activeSeason.id, rating.total_points]);
        rank = rankRow ? rankRow.rank : null;
      }
    }

    // Fight stats
    const fightStats = await dbGet(`
      SELECT
        COUNT(*) as total_fights,
        SUM(CASE WHEN f.winner_id = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN f.winner_id != ? AND f.winner_id IS NOT NULL THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN f.winner_id = ? AND f.result_type = 'ippon' THEN 1 ELSE 0 END) as ippon_wins,
        SUM(CASE WHEN f.winner_id = ? AND f.result_type = 'wazari' THEN 1 ELSE 0 END) as wazari_wins,
        SUM(CASE WHEN f.winner_id = ? AND f.result_type = 'yuko' THEN 1 ELSE 0 END) as yuko_wins,
        SUM(CASE WHEN f.winner_id = ? AND f.result_type = 'shido' THEN 1 ELSE 0 END) as shido_wins
      FROM sparrings s
      JOIN fights f ON s.id = f.sparring_id
      WHERE (s.athlete1_id = ? OR s.athlete2_id = ?) AND s.status = 'completed'
    `, [athlete.id, athlete.id, athlete.id, athlete.id, athlete.id, athlete.id, athlete.id, athlete.id]);

    // Win streak
    const recentFights = await dbAll(`
      SELECT f.winner_id FROM sparrings s
      JOIN fights f ON s.id = f.sparring_id
      WHERE (s.athlete1_id = ? OR s.athlete2_id = ?) AND s.status = 'completed'
      ORDER BY f.fight_date DESC LIMIT 20
    `, [athlete.id, athlete.id]);
    let winStreak = 0;
    for (const f of recentFights) {
      if (f.winner_id === athlete.id) winStreak++;
      else break;
    }

    // Medals from tournament brackets (1st, 2nd, 3rd places)
    const medals = await dbAll(`
      SELECT
        c.id as competition_id, c.name as competition_name, c.competition_date, c.level,
        cc.weight_category, cc.gender as category_gender,
        tb.round_number, tb.winner_id, tb.athlete1_id, tb.athlete2_id,
        (SELECT MAX(tb2.round_number) FROM tournament_brackets tb2 WHERE tb2.competition_id = tb.competition_id AND tb2.category_id = tb.category_id) as max_round
      FROM tournament_brackets tb
      JOIN competition_categories cc ON tb.category_id = cc.id
      JOIN competitions c ON tb.competition_id = c.id
      WHERE tb.winner_id IS NOT NULL
        AND (tb.athlete1_id = ? OR tb.athlete2_id = ?)
        AND tb.is_bye = 0
      ORDER BY c.competition_date DESC
    `, [athlete.id, athlete.id]);

    // Calculate places
    const achievements = [];
    const processedComps = new Set();
    for (const m of medals) {
      const compCatKey = `${m.competition_id}-${m.weight_category}-${m.category_gender}`;
      if (processedComps.has(compCatKey)) continue;

      if (m.round_number === m.max_round) {
        // Final match
        const place = m.winner_id === athlete.id ? 1 : 2;
        processedComps.add(compCatKey);
        achievements.push({
          competition_id: m.competition_id,
          competition_name: m.competition_name,
          competition_date: m.competition_date,
          level: m.level,
          weight_category: m.weight_category,
          category_gender: m.category_gender,
          place: place
        });
      } else if (m.round_number === m.max_round - 1 && m.winner_id !== athlete.id) {
        // Lost in semifinal = 3rd place
        processedComps.add(compCatKey);
        achievements.push({
          competition_id: m.competition_id,
          competition_name: m.competition_name,
          competition_date: m.competition_date,
          level: m.level,
          weight_category: m.weight_category,
          category_gender: m.category_gender,
          place: 3
        });
      }
    }

    // Upcoming competition
    const upcomingComp = await dbGet(`
      SELECT c.name, c.competition_date, c.location, c.level,
             cc.weight_category
      FROM competition_registrations cr
      JOIN competitions c ON cr.competition_id = c.id
      JOIN competition_categories cc ON cr.category_id = cc.id
      WHERE cr.athlete_id = ? AND c.competition_date >= date('now')
      ORDER BY c.competition_date ASC LIMIT 1
    `, [athlete.id]);

    // Next training
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
    const nextTraining = await dbGet(`
      SELECT ts.day_of_week, ts.start_time, ts.end_time
      FROM training_schedules ts
      JOIN coaches c ON ts.coach_id = c.id
      WHERE c.id = ? AND ts.is_active = 1
      ORDER BY CASE WHEN ts.day_of_week >= ? THEN ts.day_of_week - ? ELSE ts.day_of_week + 7 - ? END ASC
      LIMIT 1
    `, [athlete.coach_id, dayOfWeek, dayOfWeek, dayOfWeek]);

    // Belt progress
    const currentBelt = await dbGet('SELECT * FROM belt_levels WHERE name = ?', [athlete.belt_level || 'White']);
    const nextBelt = currentBelt ? await dbGet('SELECT * FROM belt_levels WHERE rank_order = ?', [currentBelt.rank_order + 1]) : null;
    const totalPoints = rating ? rating.total_points : 0;

    res.json({
      athlete,
      rating: rating || { total_points: 0, fights_count: 0, wins_count: 0, ippon_count: 0 },
      rank,
      fightStats: fightStats || { total_fights: 0, wins: 0, losses: 0, ippon_wins: 0, wazari_wins: 0, yuko_wins: 0, shido_wins: 0 },
      winStreak,
      achievements,
      medalCounts: {
        gold: achievements.filter(a => a.place === 1).length,
        silver: achievements.filter(a => a.place === 2).length,
        bronze: achievements.filter(a => a.place === 3).length
      },
      upcomingCompetition: upcomingComp || null,
      nextTraining: nextTraining || null,
      beltProgress: {
        current: currentBelt,
        next: nextBelt,
        totalPoints,
        progress: nextBelt ? Math.min(100, Math.round((totalPoints / nextBelt.min_points) * 100)) : 100
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Activity feed: recent events
app.get('/api/athletes/activity-feed', authenticateToken, authorizeRole('athlete'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id, coach_id FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const events = [];

    // Recent fights
    const fights = await dbAll(`
      SELECT f.fight_date, f.winner_id, f.result_type, f.athlete1_score, f.athlete2_score,
             s.athlete1_id, s.athlete2_id,
             u1.first_name as a1fn, u1.last_name as a1ln,
             u2.first_name as a2fn, u2.last_name as a2ln,
             c.name as comp_name, rc.win_ippon_points, rc.win_points_points, rc.loss_points
      FROM sparrings s
      JOIN fights f ON s.id = f.sparring_id
      JOIN athletes a1 ON s.athlete1_id = a1.id JOIN users u1 ON a1.user_id = u1.id
      JOIN athletes a2 ON s.athlete2_id = a2.id JOIN users u2 ON a2.user_id = u2.id
      JOIN competitions c ON s.competition_id = c.id
      LEFT JOIN rating_config rc ON c.level = rc.competition_level
      WHERE (s.athlete1_id = ? OR s.athlete2_id = ?)
      ORDER BY f.fight_date DESC LIMIT 10
    `, [athlete.id, athlete.id]);

    for (const f of fights) {
      const won = f.winner_id === athlete.id;
      const isA1 = f.athlete1_id === athlete.id;
      const oppName = isA1 ? `${f.a2fn} ${f.a2ln}` : `${f.a1fn} ${f.a1ln}`;
      const points = won ? (f.result_type === 'ippon' ? f.win_ippon_points : f.win_points_points) : f.loss_points;
      events.push({
        type: 'fight',
        date: f.fight_date,
        icon: won ? 'win' : 'loss',
        text: won ? `Победа над ${oppName} (${f.result_type})` : `Поражение от ${oppName}`,
        detail: `${f.comp_name} | ${points > 0 ? '+' : ''}${points || 0} очков`
      });
    }

    // Recent registrations
    const regs = await dbAll(`
      SELECT cr.registered_at, c.name as comp_name, cc.weight_category
      FROM competition_registrations cr
      JOIN competitions c ON cr.competition_id = c.id
      JOIN competition_categories cc ON cr.category_id = cc.id
      WHERE cr.athlete_id = ?
      ORDER BY cr.registered_at DESC LIMIT 5
    `, [athlete.id]);

    for (const r of regs) {
      events.push({
        type: 'registration',
        date: r.registered_at,
        icon: 'registration',
        text: `Регистрация на "${r.comp_name}"`,
        detail: `Категория: ${r.weight_category}`
      });
    }

    // Recent bookings
    const bookings = await dbAll(`
      SELECT tb.created_at, tb.booking_date, tb.is_trial, ts.start_time, ts.end_time,
             cu.first_name, cu.last_name
      FROM training_bookings tb
      JOIN training_schedules ts ON tb.schedule_id = ts.id
      JOIN coaches c ON ts.coach_id = c.id
      JOIN users cu ON c.user_id = cu.id
      WHERE tb.athlete_id = ? AND tb.status != 'cancelled'
      ORDER BY tb.created_at DESC LIMIT 5
    `, [athlete.id]);

    for (const b of bookings) {
      events.push({
        type: 'booking',
        date: b.created_at,
        icon: 'training',
        text: b.is_trial ? 'Пробная тренировка' : 'Тренировка',
        detail: `${b.booking_date} | ${b.start_time}-${b.end_time} | ${b.first_name} ${b.last_name}`
      });
    }

    // Belt changes
    const beltChanges = await dbAll(`
      SELECT acl.changed_at, acl.old_value, acl.new_value
      FROM athlete_changes_log acl
      WHERE acl.athlete_id = ? AND acl.field_name = 'belt_level'
      ORDER BY acl.changed_at DESC LIMIT 5
    `, [athlete.id]);

    for (const bc of beltChanges) {
      events.push({
        type: 'belt',
        date: bc.changed_at,
        icon: 'belt',
        text: `Повышение пояса: ${bc.old_value} → ${bc.new_value}`,
        detail: ''
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json(events.slice(0, 15));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public athlete profile (for opponent viewing)
app.get('/api/athletes/:id/public-profile', authenticateToken, async (req, res) => {
  try {
    const athlete = await dbGet(`
      SELECT a.id, a.belt_level, a.weight_category, a.gender, a.photo_url, a.martial_art,
             u.first_name, u.last_name, b.name as branch_name
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      WHERE a.id = ?
    `, [req.params.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
    let rating = { total_points: 0 };
    if (activeSeason) {
      const r = await dbGet('SELECT total_points FROM ratings WHERE athlete_id = ? AND season_id = ?', [req.params.id, activeSeason.id]);
      if (r) rating = r;
    }

    const stats = await dbGet(`
      SELECT
        COUNT(*) as total_fights,
        SUM(CASE WHEN f.winner_id = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN f.winner_id != ? AND f.winner_id IS NOT NULL THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN f.winner_id = ? AND f.result_type = 'ippon' THEN 1 ELSE 0 END) as ippon_wins
      FROM sparrings s
      JOIN fights f ON s.id = f.sparring_id
      WHERE (s.athlete1_id = ? OR s.athlete2_id = ?) AND s.status = 'completed'
    `, [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id]);

    const ipponRate = stats.wins > 0 ? Math.round((stats.ippon_wins / stats.wins) * 100) : 0;

    res.json({
      ...athlete,
      total_points: rating.total_points,
      total_fights: stats.total_fights || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      ippon_rate: ipponRate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= ADMIN CRUD ENDPOINTS =============

// --- BRANCHES: Edit & Delete ---
app.put('/api/branches/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, city, address } = req.body;
  try {
    const branch = await dbGet('SELECT * FROM branches WHERE id = ?', [req.params.id]);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    await dbRun('UPDATE branches SET name = ?, city = ?, address = ? WHERE id = ?',
      [name || branch.name, city !== undefined ? city : branch.city, address !== undefined ? address : branch.address, req.params.id]);
    res.json({ message: 'Branch updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/branches/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const branch = await dbGet('SELECT * FROM branches WHERE id = ?', [req.params.id]);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    await dbRun('DELETE FROM branches WHERE id = ?', [req.params.id]);
    res.json({ message: 'Branch deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SEASONS: Edit & Delete ---
app.put('/api/seasons/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, start_date, end_date, is_active } = req.body;
  try {
    const season = await dbGet('SELECT * FROM seasons WHERE id = ?', [req.params.id]);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (is_active) {
      await dbRun('UPDATE seasons SET is_active = 0 WHERE id != ?', [req.params.id]);
    }
    await dbRun('UPDATE seasons SET name = ?, start_date = ?, end_date = ?, is_active = ? WHERE id = ?',
      [name || season.name, start_date || season.start_date, end_date || season.end_date, is_active ? 1 : 0, req.params.id]);
    res.json({ message: 'Season updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/seasons/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const season = await dbGet('SELECT * FROM seasons WHERE id = ?', [req.params.id]);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    await dbRun('DELETE FROM seasons WHERE id = ?', [req.params.id]);
    res.json({ message: 'Season deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- COMPETITIONS: Edit & Delete ---
app.put('/api/competitions/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, competition_date, location, level, season_id, branch_id, description } = req.body;
  try {
    const comp = await dbGet('SELECT * FROM competitions WHERE id = ?', [req.params.id]);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    await dbRun(
      'UPDATE competitions SET name = ?, competition_date = ?, location = ?, level = ?, season_id = ?, branch_id = ?, description = ? WHERE id = ?',
      [name || comp.name, competition_date || comp.competition_date, location !== undefined ? location : comp.location,
      level || comp.level, season_id !== undefined ? season_id : comp.season_id, branch_id !== undefined ? branch_id : comp.branch_id,
      description !== undefined ? description : comp.description, req.params.id]
    );
    res.json({ message: 'Competition updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/competitions/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const comp = await dbGet('SELECT * FROM competitions WHERE id = ?', [req.params.id]);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    await dbRun('DELETE FROM competition_categories WHERE competition_id = ?', [req.params.id]);
    await dbRun('DELETE FROM competition_registrations WHERE competition_id = ?', [req.params.id]);
    await dbRun('DELETE FROM tournament_brackets WHERE competition_id = ?', [req.params.id]);
    await dbRun('DELETE FROM competitions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Competition deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ATHLETES: Admin Edit (full) & Delete ---
app.put('/api/admin/athletes/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { first_name, last_name, phone, weight, height, belt_level, gender, birth_date, branch_id, coach_id, martial_art } = req.body;
  try {
    const athlete = await dbGet('SELECT a.*, u.id as uid FROM athletes a JOIN users u ON a.user_id = u.id WHERE a.id = ?', [req.params.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

    // Update user table (name, phone)
    if (first_name || last_name || phone) {
      await dbRun('UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?',
        [first_name || athlete.first_name, last_name || athlete.last_name, phone || athlete.phone, athlete.uid]);
    }

    // Recalculate weight category if weight or gender changed
    let weightCategory = athlete.weight_category;
    const effectiveWeight = weight || athlete.weight;
    const effectiveGender = gender || athlete.gender;
    if (effectiveWeight && effectiveGender) {
      const categoryMapping = await dbGet(
        'SELECT category_name FROM weight_categories_mapping WHERE gender = ? AND ? >= min_weight AND ? <= max_weight',
        [effectiveGender, effectiveWeight, effectiveWeight]
      );
      if (categoryMapping) weightCategory = categoryMapping.category_name;
    }

    await dbRun(
      `UPDATE athletes SET weight = ?, height = ?, belt_level = ?, gender = ?, birth_date = ?,
       branch_id = ?, coach_id = ?, martial_art = ?, weight_category = ? WHERE id = ?`,
      [effectiveWeight, height || athlete.height, belt_level || athlete.belt_level,
        effectiveGender, birth_date || athlete.birth_date,
        branch_id !== undefined ? branch_id : athlete.branch_id,
        coach_id !== undefined ? coach_id : athlete.coach_id,
        martial_art || athlete.martial_art, weightCategory, req.params.id]
    );

    res.json({ message: 'Athlete updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/athletes/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const athlete = await dbGet('SELECT * FROM athletes WHERE id = ?', [req.params.id]);
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
    await dbRun('DELETE FROM ratings WHERE athlete_id = ?', [req.params.id]);
    await dbRun('DELETE FROM competition_registrations WHERE athlete_id = ?', [req.params.id]);
    await dbRun('DELETE FROM training_bookings WHERE athlete_id = ?', [req.params.id]);
    await dbRun('DELETE FROM subscriptions WHERE athlete_id = ?', [req.params.id]);
    await dbRun('DELETE FROM athletes WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM users WHERE id = ?', [athlete.user_id]);
    res.json({ message: 'Athlete deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RATINGS: Admin Edit ---
app.put('/api/admin/ratings/:athleteId', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { total_points, fights_count, wins_count, ippon_count, season_id } = req.body;
  try {
    // Find active season if not specified
    let effectiveSeasonId = season_id;
    if (!effectiveSeasonId) {
      const activeSeason = await dbGet('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
      if (!activeSeason) return res.status(400).json({ error: 'No active season found' });
      effectiveSeasonId = activeSeason.id;
    }

    const existing = await dbGet('SELECT * FROM ratings WHERE athlete_id = ? AND season_id = ?',
      [req.params.athleteId, effectiveSeasonId]);

    if (existing) {
      await dbRun(
        'UPDATE ratings SET total_points = ?, fights_count = ?, wins_count = ?, ippon_count = ? WHERE athlete_id = ? AND season_id = ?',
        [total_points !== undefined ? total_points : existing.total_points,
        fights_count !== undefined ? fights_count : existing.fights_count,
        wins_count !== undefined ? wins_count : existing.wins_count,
        ippon_count !== undefined ? ippon_count : existing.ippon_count,
        req.params.athleteId, effectiveSeasonId]
      );
    } else {
      await dbRun(
        'INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, wins_count, ippon_count) VALUES (?, ?, ?, ?, ?, ?)',
        [req.params.athleteId, effectiveSeasonId, total_points || 0, fights_count || 0, wins_count || 0, ippon_count || 0]
      );
    }

    res.json({ message: 'Rating updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/ratings/:athleteId', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { season_id } = req.query;
    if (season_id) {
      await dbRun('DELETE FROM ratings WHERE athlete_id = ? AND season_id = ?', [req.params.athleteId, season_id]);
    } else {
      await dbRun('DELETE FROM ratings WHERE athlete_id = ?', [req.params.athleteId]);
    }
    res.json({ message: 'Rating deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= AUTO QUARTERLY SEASONS =============

function getQuarterInfo(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  const quarterNames = {
    1: `Q1 ${year} (Янв-Мар)`,
    2: `Q2 ${year} (Апр-Июн)`,
    3: `Q3 ${year} (Июл-Сен)`,
    4: `Q4 ${year} (Окт-Дек)`
  };
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, endMonth + 1, 0).getDate();
  const endDate = `${year}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { quarter, year, name: quarterNames[quarter], startDate, endDate };
}

async function ensureCurrentSeason() {
  try {
    const now = new Date();
    const qi = getQuarterInfo(now);

    // Check if this quarter's season already exists
    const existing = await dbGet(
      'SELECT id FROM seasons WHERE start_date = ? AND end_date = ?',
      [qi.startDate, qi.endDate]
    );

    if (!existing) {
      // Deactivate all other seasons
      await dbRun('UPDATE seasons SET is_active = 0');
      // Create current quarter season
      const result = await dbRun(
        'INSERT INTO seasons (name, start_date, end_date, is_active) VALUES (?, ?, ?, 1)',
        [qi.name, qi.startDate, qi.endDate]
      );
      console.log(`📅 Auto-created season: ${qi.name} (id: ${result.id})`);
    } else {
      // Make sure current quarter is active
      await dbRun('UPDATE seasons SET is_active = 0');
      await dbRun('UPDATE seasons SET is_active = 1 WHERE id = ?', [existing.id]);
    }
  } catch (err) {
    console.error('Error ensuring current season:', err.message);
  }
}

// ============= AI ASSISTANT ENDPOINTS =============

app.get('/api/ai/coach-analysis', authenticateToken, authorizeRole('coach'), async (req, res) => {
  try {
    const coach = await dbGet('SELECT b.name as branch_name, c.id as coach_id FROM coaches c JOIN branches b ON c.branch_id = b.id WHERE c.user_id = ?', [req.user.id]);
    if (!coach) return res.status(404).json({ error: 'Coach profile not found' });

    // Get athlete data
    const athletes = await dbAll(`
            SELECT a.id, u.first_name, u.last_name, a.belt_level, a.weight, a.gender, 
            (SELECT total_points FROM ratings WHERE athlete_id = a.id ORDER BY id DESC LIMIT 1) as rating
            FROM athletes a 
            JOIN users u ON a.user_id = u.id 
            WHERE a.coach_id = ? AND a.approval_status = 'approved'
        `, [coach.coach_id]);

    // Get recent fight results
    const fights = await dbAll(`
            SELECT f.*, a1.first_name as ath1_name, a1.last_name as ath1_lname,
                   a2.first_name as ath2_name, a2.last_name as ath2_lname
            FROM fights f
            JOIN users a1 ON f.athlete1_id = a1.id
            JOIN users a2 ON f.athlete2_id = a2.id
            WHERE f.athlete1_id IN (SELECT user_id FROM athletes WHERE coach_id = ?)
               OR f.athlete2_id IN (SELECT user_id FROM athletes WHERE coach_id = ?)
            ORDER BY f.id DESC LIMIT 20
        `, [coach.coach_id, coach.coach_id]);

    // Generate "AI Insights" based on data
    const insights = [];

    // 1. Identification of Leaders
    const leaders = [...athletes].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
    if (leaders.length > 0) {
      insights.push({
        type: 'success',
        title: 'Анализ лидеров',
        text: `Ваши топ-атлеты: ${leaders.map(l => l.first_name).join(', ')}. Они показывают стабильный прирост в рейтинге.`
      });
    }

    // 2. Weight category warnings
    const noviceHeavies = athletes.filter(a => a.weight > 80 && (a.belt_level === 'White' || a.belt_level === 'Yellow'));
    if (noviceHeavies.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Контроль веса и техники',
        text: `У вас ${noviceHeavies.length} тяжеловесов с начальным уровнем технки. Рекомендую усилить работу над координацией и страховкой.`
      });
    }

    // 3. Fight dynamics
    const winRate = fights.length > 0 ? (fights.filter(f => f.winner_id && athletes.some(a => a.id === f.winner_id)).length / fights.length) : 0;
    if (winRate > 0.6) {
      insights.push({
        type: 'success',
        title: 'Динамика побед',
        text: 'У ваших бойцов отличный процент побед. Рассмотрите возможность участия в турнирах более высокого уровня.'
      });
    } else if (fights.length > 5) {
      insights.push({
        type: 'info',
        title: 'Рекомендация по тренировкам',
        text: 'Последние бои показывают необходимость работы над защитными действиями (Ne-waza).'
      });
    }

    res.json({
      summary: `Ассистент ORTUS проанализировал ${athletes.length} спортсменов филиала ${coach.branch_name}.`,
      insights: insights,
      topProspect: leaders[0] || null
    });
  } catch (error) {
    console.error('AI Analysis error:', error);
    res.status(500).json({ error: 'Failed to generate AI analysis' });
  }
});

app.post('/api/ai/chat', authenticateToken, authorizeRole('coach'), async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  // Mock AI response logic with high-quality sports content
  const msg = message.toLowerCase();
  let response = "Интересный вопрос! Как ваш AI-ассистент, я рекомендую сфокусироваться на комплексном подходе: сочетании технической подготовки и психологической устойчивости.";

  if (msg.includes('дзюдо') || msg.includes('техника')) {
    response = "В дзюдо ключевое значение имеет 'Сэйрёку Дзэнъё' — максимальное использование духа и тела. Рекомендую уделить больше времени отработке Ути-коми для постановки входа в прием.";
  } else if (msg.includes('подготовка') || msg.includes('соревнования')) {
    response = "Перед турниром важно снизить интенсивность нагрузок за 3-5 дней (тэйперинг), чтобы накопить гликоген и восстановить нервную систему. Следите за сгонкой веса ваших учеников.";
  } else if (msg.includes('лучший') || msg.includes('кто')) {
    response = "Исходя из последних данных, лучшую динамику показывают спортсмены с синим поясом. Если вас интересует конкретный атлет, укажите его имя.";
  } else if (msg.includes('привет') || msg.includes('здравствуй')) {
    response = "Здравствуйте! Я ваш персональный AI-ассистент ORTUS. Я проанализировал результаты ваших учеников и готов ответить на любые вопросы о спорте и тренировках.";
  }

  res.json({ response });
});

// ============================================
// NOTIFICATIONS & ACTIVITY FEED
// ============================================

// Helper to create notification
async function createNotification(userId, type, title, message, link = null) {
  try {
    await dbRun(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
      [userId, type, title, message, link]
    );
  } catch (err) {
    console.error('Notification error:', err);
  }
}

app.get('/api/athletes/activity-feed', authenticateToken, async (req, res) => {
  try {
    const athlete = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [req.user.id]);
    if (!athlete) return res.json([]);

    const feed = [];

    // 1. Recent Fight Results
    const recentFights = await dbAll(`
      SELECT 
        s.id, s.date, s.winner_id,
        CASE WHEN s.athlete1_id = ? THEN s.athlete2_id ELSE s.athlete1_id END as opponent_id,
        CASE WHEN s.athlete1_id = ? THEN COALESCE(a2.first_name || ' ' || a2.last_name, 'Unknown') ELSE COALESCE(a1.first_name || ' ' || a1.last_name, 'Unknown') END as opponent_name
      FROM sparrings s
      LEFT JOIN athletes a1 ON s.athlete1_id = a1.id
      LEFT JOIN athletes a2 ON s.athlete2_id = a2.id
      WHERE (s.athlete1_id = ? OR s.athlete2_id = ?) 
      AND s.winner_id IS NOT NULL
      ORDER BY s.date DESC LIMIT 5
    `, [athlete.id, athlete.id, athlete.id, athlete.id]);

    for (const fight of recentFights) {
      const isWin = fight.winner_id === athlete.id;
      feed.push({
        icon: isWin ? 'win' : 'loss',
        text: isWin ? 'Победа в спарринге' : 'Поражение в спарринге',
        detail: `Против: ${fight.opponent_name}`,
        date: fight.date,
        sortDate: new Date(fight.date)
      });
    }

    // 2. Belt Promotions
    const beltChanges = await dbAll(`
      SELECT new_value, timestamp 
      FROM athlete_changes_log 
      WHERE athlete_id = ? AND field_name = 'belt_level'
      ORDER BY timestamp DESC LIMIT 3
    `, [athlete.id]);

    for (const change of beltChanges) {
      feed.push({
        icon: 'belt',
        text: 'Новый пояс!',
        detail: `Вы получили ${change.new_value} пояс. Поздравляем!`,
        date: change.timestamp,
        sortDate: new Date(change.timestamp)
      });
    }

    // 3. Upcoming Competitions
    const upcoming = await dbAll(`
      SELECT name, competition_date 
      FROM competitions 
      WHERE competition_date >= date('now') 
      ORDER BY competition_date ASC LIMIT 2
    `);

    for (const comp of upcoming) {
      feed.push({
        icon: 'registration',
        text: 'Скоро турнир',
        detail: `${comp.name} - ${comp.competition_date}`,
        date: new Date().toISOString(),
        sortDate: new Date() // Pin to top
      });
    }

    // 4. System Notifications
    try {
      const notes = await dbAll(`
            SELECT title, message, created_at FROM notifications 
            WHERE user_id = ? AND is_read = 0
            ORDER BY created_at DESC
        `, [req.user.id]);

      for (const n of notes) {
        feed.push({
          icon: 'training',
          text: n.title,
          detail: n.message,
          date: n.created_at,
          sortDate: new Date(n.created_at)
        });
      }
    } catch (e) {
      // Table might not exist yet if query fails
    }

    feed.sort((a, b) => b.sortDate - a.sortDate);
    res.json(feed);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/coaches/activity-feed', authenticateToken, async (req, res) => {
  try {
    const coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [req.user.id]);
    if (!coach) return res.json([]);

    // Simple feed for coaches: Pending Athletes
    const pending = await dbAll(`SELECT COUNT(*) as c FROM athletes WHERE coach_id = ? AND is_active = 0`, [coach.id]);
    const feed = [];

    if (pending[0].c > 0) {
      feed.push({
        icon: 'users',
        title: 'Новые заявки',
        message: `Ожидают подтверждения: ${pending[0].c}`,
        time: new Date().toISOString()
      });
    }

    // Recent Athlete Success (Top 3)
    const medals = await dbAll(`
        SELECT cr.place, c.name as comp_name, a.first_name, a.last_name, c.competition_date
        FROM competition_results cr
        JOIN athletes a ON cr.athlete_id = a.id
        JOIN competitions c ON cr.competition_id = c.id
        WHERE a.coach_id = ? AND cr.place <= 3
        ORDER BY c.competition_date DESC LIMIT 5
    `, [coach.id]);

    for (const m of medals) {
      const placeIcon = m.place === 1 ? '🥇' : m.place === 2 ? '🥈' : '🥉';
      feed.push({
        icon: 'medal',
        title: `Медаль: ${m.first_name} ${m.last_name}`,
        message: `${placeIcon} ${m.place} место на турнире "${m.comp_name}"`,
        time: m.competition_date
      });
    }

    res.json(feed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============= START SERVER =============

app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`\n📱 Default admin credentials:`);
  console.log(`   Phone: +77771234567`);
  console.log(`   Password: admin123\n`);

  // Auto-create current quarterly season
  await ensureCurrentSeason();
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err.message);
    console.log('Database connection closed');
    process.exit(0);
  });
});
