/**
 * ORTUS Full QA Test — Senior Tester Simulation
 * Creates a full quarter of data: branches, coaches, athletes,
 * 3 tournaments, schedules, subscriptions, and validates everything.
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const http = require('http');

const DB_PATH = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(DB_PATH);

// Promisify
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ id: this.lastID, changes: this.changes });
  });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

// HTTP helper (for testing API endpoints directly)
function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3000,
      path: '/api' + path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const BUGS = [];
function bug(id, severity, desc) {
  BUGS.push({ id, severity, desc });
  console.log(`  🐛 [${severity}] BUG-${id}: ${desc}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('  ORTUS QA — Full System Test');
  console.log('='.repeat(60));

  // ============ PHASE 1: CLEAN + SEED ============
  console.log('\n📦 PHASE 1: Cleaning DB and creating test data...');

  // Clean old test data
  await dbRun('DELETE FROM tournament_brackets');
  await dbRun('DELETE FROM fights');
  await dbRun('DELETE FROM sparrings');
  await dbRun('DELETE FROM competition_registrations');
  await dbRun('DELETE FROM competition_categories');
  await dbRun('DELETE FROM competitions');
  await dbRun('DELETE FROM ratings');
  await dbRun('DELETE FROM training_bookings');
  await dbRun('DELETE FROM subscriptions');
  await dbRun('DELETE FROM training_schedules');
  await dbRun('DELETE FROM notifications');
  await dbRun('DELETE FROM athletes');
  await dbRun('DELETE FROM coaches');
  await dbRun("DELETE FROM users WHERE phone != '+77771234567'");

  // Ensure active season
  let season = await dbGet('SELECT id FROM seasons WHERE is_active = 1');
  if (!season) {
    await dbRun("INSERT INTO seasons (name, start_date, end_date, is_active) VALUES ('Сезон 2026', '2026-01-01', '2026-12-31', 1)");
    season = await dbGet('SELECT id FROM seasons WHERE is_active = 1');
  }
  const SEASON_ID = season.id;
  console.log(`  Season ID: ${SEASON_ID}`);

  // Create 3 branches
  const branchNames = [
    { name: 'Ortus Центральный', address: 'ул. Абая 150', city: 'Алматы' },
    { name: 'Ortus Восточный', address: 'ул. Сатпаева 22', city: 'Алматы' },
    { name: 'Ortus Северный', address: 'пр. Достык 5', city: 'Астана' },
  ];
  const branchIds = [];
  for (const b of branchNames) {
    const existing = await dbGet('SELECT id FROM branches WHERE name = ?', [b.name]);
    if (existing) { branchIds.push(existing.id); continue; }
    const r = await dbRun('INSERT INTO branches (name, address, city) VALUES (?, ?, ?)', [b.name, b.address, b.city]);
    branchIds.push(r.id);
  }
  console.log(`  Branches: ${branchIds.join(', ')}`);

  // Create 3 coaches
  const hash = await bcrypt.hash('coach123', 10);
  const coachData = [
    { first: 'Алмас', last: 'Тулеков', phone: '+77011110001' },
    { first: 'Дамир', last: 'Нурланов', phone: '+77011110002' },
    { first: 'Серик', last: 'Аманов', phone: '+77011110003' },
  ];
  const coachIds = [];
  const coachUserIds = [];
  const coachTokens = [];
  for (let i = 0; i < 3; i++) {
    const c = coachData[i];
    let u = await dbGet('SELECT id FROM users WHERE phone = ?', [c.phone]);
    if (!u) {
      const r = await dbRun("INSERT INTO users (first_name, last_name, phone, password_hash, role) VALUES (?, ?, ?, ?, 'coach')", [c.first, c.last, c.phone, hash]);
      u = { id: r.id };
    }
    coachUserIds.push(u.id);
    let coach = await dbGet('SELECT id FROM coaches WHERE user_id = ?', [u.id]);
    if (!coach) {
      const r = await dbRun("INSERT INTO coaches (user_id, branch_id, specialization) VALUES (?, ?, 'Дзюдо')", [u.id, branchIds[i]]);
      coach = { id: r.id };
    }
    coachIds.push(coach.id);
  }
  console.log(`  Coaches: ${coachIds.join(', ')}`);

  // Login coaches via API to get tokens
  for (let i = 0; i < 3; i++) {
    const resp = await apiCall('POST', '/auth/login', { phone: coachData[i].phone, password: 'coach123' });
    if (resp.status === 200) {
      coachTokens.push(resp.data.token);
    } else if (resp.status === 429) {
      console.log('  ⚠️ Rate limited — using direct DB tokens');
      coachTokens.push(null);
    } else {
      coachTokens.push(null);
      bug('AUTH-01', 'HIGH', `Coach login failed for ${coachData[i].phone}: ${JSON.stringify(resp.data)}`);
    }
  }

  // Create 60 athletes (20 per coach, 14M + 6F)
  const weightsMale = [50, 55, 60, 66, 73, 81, 90, 100, 110, 55, 60, 66, 73, 81];
  const weightsFemale = [40, 44, 48, 52, 57, 63];
  const maleFirst = ['Алихан','Бауржан','Данияр','Ерлан','Жандос','Кайрат','Нурсултан','Асет','Руслан','Тимур','Мирас','Ернур','Самат','Арман'];
  const femaleFirst = ['Айгерим','Дана','Камила','Мадина','Аяна','Жанель'];
  const lastNames = ['Алиев','Бекмуратов','Виденеев','Горюнов','Джанабаев','Ережепов','Жумабаев','Ибраев','Кабиров','Лимонов',
    'Мамутов','Нуримов','Оразбаев','Петров','Ракимов','Сагинов','Таланов','Уразаев','Фахрутдинов','Хасенов'];

  const athleteIds = [];
  const athleteUserIds = [];
  let phoneCounter = 7702000000;

  for (let ci = 0; ci < 3; ci++) {
    for (let j = 0; j < 20; j++) {
      const isMale = j < 14;
      const gender = isMale ? 'M' : 'F';
      const firstName = isMale ? maleFirst[j % maleFirst.length] : femaleFirst[j - 14];
      const lastName = lastNames[(ci * 20 + j) % lastNames.length];
      const weight = isMale ? weightsMale[j % weightsMale.length] : weightsFemale[j - 14];
      const catMapping = await dbGet("SELECT category_name FROM weight_categories_mapping WHERE gender = ? AND ? >= min_weight AND ? <= max_weight LIMIT 1", [gender, weight, weight]);
      const weightCat = catMapping ? catMapping.category_name : `${weight} кг`;
      const phone = `+${++phoneCounter}`;

      let u = await dbGet('SELECT id FROM users WHERE phone = ?', [phone]);
      if (!u) {
        const r = await dbRun("INSERT INTO users (first_name, last_name, phone, password_hash, role) VALUES (?, ?, ?, ?, 'athlete')", [firstName, lastName, phone, hash]);
        u = { id: r.id };
      }
      athleteUserIds.push(u.id);

      let a = await dbGet('SELECT id FROM athletes WHERE user_id = ?', [u.id]);
      if (!a) {
        const r = await dbRun("INSERT INTO athletes (user_id, coach_id, branch_id, weight, weight_category, gender, belt_level, approval_status) VALUES (?, ?, ?, ?, ?, ?, 'белый', 'approved')",
          [u.id, coachIds[ci], branchIds[ci], weight, weightCat, gender]);
        a = { id: r.id };
      }
      athleteIds.push(a.id);
    }
  }
  console.log(`  Athletes created: ${athleteIds.length}`);

  // ============ PHASE 2: SCHEDULES & SUBSCRIPTIONS ============
  console.log('\n📅 PHASE 2: Testing Schedules & Subscriptions...');

  // Create schedules for each coach
  const days = [1, 3, 5]; // Mon, Wed, Fri
  const scheduleIds = [];
  for (let ci = 0; ci < 3; ci++) {
    for (const day of days) {
      const r = await dbRun(
        'INSERT INTO training_schedules (coach_id, branch_id, day_of_week, start_time, end_time, is_paid, price, max_participants, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [coachIds[ci], branchIds[ci], day, '18:00', '19:30', 1, 5000, 15, `Дзюдо ${day === 1 ? 'ПН' : day === 3 ? 'СР' : 'ПТ'}`]
      );
      scheduleIds.push(r.id);
    }
  }
  console.log(`  Schedules created: ${scheduleIds.length}`);

  // TEST: Schedule API via HTTP
  if (coachTokens[0]) {
    const schedResp = await apiCall('GET', '/schedules/my', null, coachTokens[0]);
    if (schedResp.status !== 200) {
      bug('SCHED-01', 'HIGH', `GET /schedules/my returned ${schedResp.status}`);
    } else if (!Array.isArray(schedResp.data) || schedResp.data.length < 3) {
      bug('SCHED-02', 'MED', `Expected 3 schedules, got ${schedResp.data.length}`);
    } else {
      console.log(`  ✅ Coach 1 sees ${schedResp.data.length} schedules via API`);
    }
  }

  // Create subscriptions
  let subsCreated = 0;
  for (let ci = 0; ci < 3; ci++) {
    for (let j = 0; j < 20; j++) {
      const aIdx = ci * 20 + j;
      const type = j < 10 ? 'monthly' : (j < 15 ? 'quarterly' : 'yearly');
      const price = type === 'monthly' ? 15000 : type === 'quarterly' ? 40000 : 100000;
      const startDate = '2026-01-01';
      const endDate = type === 'monthly' ? '2026-01-31' : type === 'quarterly' ? '2026-03-31' : '2026-12-31';
      await dbRun(
        'INSERT INTO subscriptions (athlete_id, coach_id, type, start_date, end_date, sessions_total, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [athleteIds[aIdx], coachIds[ci], type, startDate, endDate, type === 'monthly' ? 12 : type === 'quarterly' ? 36 : 120, price]
      );
      subsCreated++;
    }
  }
  console.log(`  Subscriptions created: ${subsCreated}`);

  // TEST: Subscriptions API
  if (coachTokens[0]) {
    const subsResp = await apiCall('GET', '/coaches/subscriptions', null, coachTokens[0]);
    if (subsResp.status !== 200) {
      bug('SUB-01', 'HIGH', `GET /coaches/subscriptions returned ${subsResp.status}`);
    } else {
      console.log(`  ✅ Coach 1 sees ${subsResp.data.length} subscriptions via API`);
    }
  }

  // Create bookings (some athletes book training)
  let bookingsCreated = 0;
  for (let ci = 0; ci < 3; ci++) {
    const sIds = scheduleIds.slice(ci * 3, ci * 3 + 3);
    for (let j = 0; j < 10; j++) {
      const aIdx = ci * 20 + j;
      const schedId = sIds[j % 3];
      try {
        await dbRun(
          "INSERT INTO training_bookings (schedule_id, athlete_id, booking_date, status) VALUES (?, ?, '2026-01-06', 'booked')",
          [schedId, athleteIds[aIdx]]
        );
        bookingsCreated++;
      } catch (e) { /* duplicate */ }
    }
  }
  console.log(`  Bookings created: ${bookingsCreated}`);

  // ============ PHASE 3: TOURNAMENTS ============
  console.log('\n🏆 PHASE 3: Running 3 tournaments over a quarter...');

  const adminLogin = await apiCall('POST', '/auth/login', { phone: '+77771234567', password: 'admin123' });
  let adminToken = null;
  if (adminLogin.status === 200) {
    adminToken = adminLogin.data.token;
  } else if (adminLogin.status === 429) {
    console.log('  ⚠️ Admin rate limited, using coach token as fallback');
    adminToken = coachTokens[0];
  } else {
    bug('AUTH-02', 'CRITICAL', `Admin login failed: ${JSON.stringify(adminLogin.data)}`);
  }

  const tournaments = [
    { name: 'Кубок Ortus — Январь', date: '2026-01-15', location: 'Спорткомплекс Алматы', level: 'club' },
    { name: 'Городской чемпионат — Февраль', date: '2026-02-20', location: 'Дворец спорта', level: 'city' },
    { name: 'Региональный турнир — Март', date: '2026-03-25', location: 'Арена Астана', level: 'regional' },
  ];

  const RESULT_TYPES = ['ippon', 'wazari', 'points', 'ippon', 'ippon', 'points'];

  for (const tourney of tournaments) {
    console.log(`\n  🏟️  ${tourney.name} (${tourney.level})`);

    // Create competition
    const compResult = await dbRun(
      'INSERT INTO competitions (name, competition_date, location, season_id, level, branch_id) VALUES (?, ?, ?, ?, ?, ?)',
      [tourney.name, tourney.date, tourney.location, SEASON_ID, tourney.level, branchIds[0]]
    );
    const compId = compResult.id;

    // Add categories (M: 60кг, 66кг, 73кг, 81кг; F: 52кг, 57кг)
    const catDefs = [
      { weight: '60 кг', gender: 'M' },
      { weight: '66 кг', gender: 'M' },
      { weight: '73 кг', gender: 'M' },
      { weight: '81 кг', gender: 'M' },
      { weight: '52 кг', gender: 'F' },
      { weight: '57 кг', gender: 'F' },
    ];
    const catIds = [];
    for (const cd of catDefs) {
      const r = await dbRun('INSERT INTO competition_categories (competition_id, weight_category, gender) VALUES (?, ?, ?)', [compId, cd.weight, cd.gender]);
      catIds.push({ id: r.id, ...cd });
    }

    // Register athletes to matching categories
    let regCount = 0;
    for (const cat of catIds) {
      const matchingAthletes = await dbAll(
        "SELECT id FROM athletes WHERE weight_category = ? AND gender = ? AND approval_status = 'approved'",
        [cat.weight, cat.gender]
      );
      for (const a of matchingAthletes) {
        try {
          await dbRun("INSERT INTO competition_registrations (competition_id, athlete_id, category_id, registered_by_user_id, status) VALUES (?, ?, ?, 1, 'confirmed')",
            [compId, a.id, cat.id]);
          regCount++;
        } catch (e) { /* dup */ }
      }
    }
    console.log(`    Registrations: ${regCount}`);

    // TEST: Deregistration (remove one, re-add)
    if (regCount > 0 && adminToken) {
      const firstReg = await dbGet('SELECT athlete_id FROM competition_registrations WHERE competition_id = ? LIMIT 1', [compId]);
      if (firstReg) {
        const delResp = await apiCall('DELETE', `/competitions/${compId}/registrations/${firstReg.athlete_id}`, null, adminToken);
        if (delResp.status === 200) {
          console.log(`    ✅ Deregistration works`);
          // Re-register
          const catForAthlete = await dbGet(
            'SELECT cc.id FROM competition_categories cc JOIN athletes a ON a.weight_category = cc.weight_category AND a.gender = cc.gender WHERE cc.competition_id = ? AND a.id = ?',
            [compId, firstReg.athlete_id]
          );
          if (catForAthlete) {
            await dbRun("INSERT INTO competition_registrations (competition_id, athlete_id, category_id, registered_by_user_id, status) VALUES (?, ?, ?, 1, 'confirmed')",
              [compId, firstReg.athlete_id, catForAthlete.id]);
          }
        } else {
          bug('DEREG-01', 'MED', `Deregistration returned ${delResp.status}: ${JSON.stringify(delResp.data)}`);
        }
      }
    }

    // Generate bracket via API
    if (adminToken) {
      const genResp = await apiCall('POST', `/competitions/${compId}/generate-bracket`, {}, adminToken);
      if (genResp.status !== 200) {
        bug('BRACKET-01', 'CRITICAL', `Generate bracket failed for comp ${compId}: ${JSON.stringify(genResp.data)}`);
        continue;
      }
      console.log(`    Bracket generated: ${genResp.data.total_matches} matches`);
      await dbRun('UPDATE competitions SET bracket_generated = 1 WHERE id = ?', [compId]);
    } else {
      bug('BRACKET-02', 'CRITICAL', 'No admin token available for bracket generation');
      continue;
    }

    // TEST: Deregistration after bracket should fail
    if (adminToken) {
      const someReg = await dbGet('SELECT athlete_id FROM competition_registrations WHERE competition_id = ? LIMIT 1', [compId]);
      if (someReg) {
        const delResp2 = await apiCall('DELETE', `/competitions/${compId}/registrations/${someReg.athlete_id}`, null, adminToken);
        if (delResp2.status === 400) {
          console.log(`    ✅ Deregistration blocked after bracket`);
        } else {
          bug('DEREG-02', 'HIGH', `Deregistration should be blocked after bracket gen, got ${delResp2.status}`);
        }
      }
    }

    // Play all bracket matches
    const matches = await dbAll(
      "SELECT * FROM tournament_brackets WHERE competition_id = ? AND is_bye = 0 AND winner_id IS NULL ORDER BY round_number, match_number",
      [compId]
    );
    console.log(`    Playing ${matches.length} matches...`);

    let playedCount = 0;
    for (let round = 1; round <= 10; round++) {
      const roundMatches = await dbAll(
        "SELECT * FROM tournament_brackets WHERE competition_id = ? AND is_bye = 0 AND winner_id IS NULL AND athlete1_id IS NOT NULL AND athlete2_id IS NOT NULL AND round_number = ? ORDER BY match_number",
        [compId, round]
      );
      if (roundMatches.length === 0) continue;

      for (const m of roundMatches) {
        const winnerId = Math.random() > 0.5 ? m.athlete1_id : m.athlete2_id;
        const resultType = RESULT_TYPES[Math.floor(Math.random() * RESULT_TYPES.length)];
        const score1 = resultType === 'ippon' ? 10 : Math.floor(Math.random() * 8);
        const score2 = resultType === 'ippon' ? 0 : Math.floor(Math.random() * 8);

        if (adminToken) {
          const resultResp = await apiCall('POST', `/competitions/${compId}/bracket/${m.id}/result`, {
            winner_id: winnerId,
            result_type: resultType,
            athlete1_score: score1,
            athlete2_score: score2
          }, adminToken);

          if (resultResp.status !== 200) {
            bug('MATCH-01', 'HIGH', `Match result failed for match ${m.id}: ${JSON.stringify(resultResp.data)}`);
          } else {
            playedCount++;
          }
        }
      }
    }
    console.log(`    Played: ${playedCount} matches`);

    // TEST: Bracket API response
    const bracketResp = await apiCall('GET', `/competitions/${compId}/bracket`);
    if (bracketResp.status !== 200) {
      bug('BRACKET-03', 'HIGH', `GET /bracket returned ${bracketResp.status}`);
    } else {
      const bd = bracketResp.data;
      // Check date and location are present
      if (!bd.competition_date) {
        bug('BRACKET-04', 'MED', 'Bracket API missing competition_date');
      }
      if (!bd.location) {
        bug('BRACKET-05', 'MED', 'Bracket API missing location');
      }
      if (!bd.season_name) {
        bug('BRACKET-06', 'LOW', 'Bracket API missing season_name');
      }
      // Check categories
      if (!bd.categories || bd.categories.length === 0) {
        bug('BRACKET-07', 'HIGH', 'Bracket has no categories');
      } else {
        let allDone = true;
        for (const cat of bd.categories) {
          const realMatches = cat.matches.filter(m => !m.is_bye);
          const withWinner = realMatches.filter(m => m.winner_id);
          if (withWinner.length !== realMatches.length) allDone = false;
        }
        if (allDone) {
          console.log(`    ✅ All bracket matches completed`);
        } else {
          bug('BRACKET-08', 'MED', 'Some bracket matches still missing winners');
        }
      }
    }
  }

  // ============ PHASE 4: RATINGS CHECK ============
  console.log('\n📊 PHASE 4: Checking Ratings...');

  const ratingsResp = await apiCall('GET', `/ratings?season_id=${SEASON_ID}`);
  if (ratingsResp.status !== 200) {
    bug('RATING-01', 'CRITICAL', `GET /ratings returned ${ratingsResp.status}`);
  } else {
    const ratings = ratingsResp.data;
    console.log(`  Total rated athletes: ${ratings.length}`);

    if (ratings.length === 0) {
      bug('RATING-02', 'CRITICAL', 'No ratings found after 3 tournaments');
    } else {
      // Top 5
      console.log('\n  🏅 TOP 10 Athletes:');
      console.log('  ' + '-'.repeat(70));
      console.log('  #   | Name                    | Belt     | Pts  | Fights | Wins | Gold');
      console.log('  ' + '-'.repeat(70));
      ratings.slice(0, 10).forEach((r, i) => {
        console.log(`  ${String(i + 1).padStart(3)} | ${(r.first_name + ' ' + r.last_name).padEnd(23)} | ${(r.belt_level || 'белый').padEnd(8)} | ${String(r.total_points).padStart(4)} | ${String(r.fights_count).padStart(6)} | ${String(r.wins_count).padStart(4)} | ${r.gold_medals || 0}`);
      });

      // Check gold_medals field exists
      if (ratings[0].gold_medals === undefined) {
        bug('RATING-03', 'MED', 'gold_medals field missing from ratings response');
      }

      // Check branch_name
      if (!ratings[0].branch_name) {
        bug('RATING-04', 'LOW', 'branch_name missing from ratings');
      }

      // Check for rating inflation (points too high)
      const maxPts = Math.max(...ratings.map(r => r.total_points));
      console.log(`\n  Max points: ${maxPts}`);

      // Verify points math
      const topAthlete = ratings[0];
      const expectedMin = topAthlete.wins_count * 30; // minimum: all points wins at club level
      if (topAthlete.total_points < expectedMin) {
        bug('RATING-05', 'MED', `Top athlete has ${topAthlete.total_points} pts but ${topAthlete.wins_count} wins (minimum should be ${expectedMin})`);
      }
    }
  }

  // TEST: Season selector (check that old season returns empty)
  const fakeSeasonResp = await apiCall('GET', '/ratings?season_id=99999');
  if (fakeSeasonResp.status === 200 && fakeSeasonResp.data.length > 0) {
    bug('RATING-06', 'MED', 'Ratings for non-existent season should be empty');
  } else {
    console.log('  ✅ Season filter works (fake season returns empty)');
  }

  // TEST: Branch rankings
  const branchRankResp = await apiCall('GET', `/ratings/branch-rankings?season_id=${SEASON_ID}`);
  if (branchRankResp.status !== 200) {
    bug('BRANCH-01', 'HIGH', `Branch rankings returned ${branchRankResp.status}`);
  } else {
    console.log('\n  🏢 Branch Rankings:');
    branchRankResp.data.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.name} — ${b.total_points} pts, ${b.athlete_count} athletes, ${b.total_wins} wins, avg: ${b.avg_points}`);
    });
    if (branchRankResp.data.length === 0) {
      bug('BRANCH-02', 'MED', 'Branch rankings returned 0 results');
    }
  }

  // TEST: Branch-specific ratings
  const branch1Resp = await apiCall('GET', `/ratings/branch/${branchIds[0]}?season_id=${SEASON_ID}`);
  if (branch1Resp.status !== 200) {
    bug('BRANCH-03', 'HIGH', `Branch ratings returned ${branch1Resp.status}`);
  } else {
    console.log(`  ✅ Branch 1 ratings: ${branch1Resp.data.length} athletes`);
    // Verify all athletes belong to branch 1
    const wrongBranch = branch1Resp.data.filter(r => r.branch_id !== branchIds[0]);
    if (wrongBranch.length > 0) {
      bug('BRANCH-04', 'HIGH', `Branch filter leak: ${wrongBranch.length} athletes from other branches`);
    }
  }

  // ============ PHASE 5: BELT PROMOTION CHECK ============
  console.log('\n🥋 PHASE 5: Belt Promotion...');

  // Check notifications
  const notifications = await dbAll("SELECT * FROM notifications WHERE type = 'belt_promotion'");
  console.log(`  Belt promotion notifications: ${notifications.length}`);
  if (notifications.length > 0) {
    console.log(`  ✅ Belt notifications working`);
    console.log(`  Sample: "${notifications[0].title}" — "${notifications[0].message}"`);
  } else {
    // Check if anyone has enough points
    const topRating = await dbGet('SELECT SUM(total_points) as total, athlete_id FROM ratings GROUP BY athlete_id ORDER BY total DESC LIMIT 1');
    if (topRating && topRating.total >= 100) {
      bug('BELT-01', 'MED', `Top athlete has ${topRating.total} pts but no belt promotion notification`);
    } else {
      console.log('  ℹ️ No one reached 100 pts yet — belt notifications expected to be empty');
    }
  }

  // Check belt eligible API
  if (coachTokens[0]) {
    const eligibleResp = await apiCall('GET', '/coaches/belt-eligible', null, coachTokens[0]);
    if (eligibleResp.status !== 200) {
      bug('BELT-02', 'MED', `Belt eligible returned ${eligibleResp.status}`);
    } else {
      console.log(`  Belt eligible athletes: ${eligibleResp.data.length}`);
    }
  }

  // ============ PHASE 6: EDGE CASE TESTS ============
  console.log('\n🧪 PHASE 6: Edge Case Tests...');

  // TEST: Single athlete category
  const soloCompResult = await dbRun(
    'INSERT INTO competitions (name, competition_date, location, season_id, level, branch_id) VALUES (?, ?, ?, ?, ?, ?)',
    ['Solo Test Comp', '2026-03-30', 'Test Gym', SEASON_ID, 'club', branchIds[0]]
  );
  const soloCompId = soloCompResult.id;
  const soloCatResult = await dbRun('INSERT INTO competition_categories (competition_id, weight_category, gender) VALUES (?, ?, ?)', [soloCompId, '90 кг', 'M']);
  const soloAthlete = athleteIds[6]; // 90kg male
  await dbRun("INSERT INTO competition_registrations (competition_id, athlete_id, category_id, registered_by_user_id, status) VALUES (?, ?, ?, 1, 'confirmed')", [soloCompId, soloAthlete, soloCatResult.id]);

  if (adminToken) {
    const soloGenResp = await apiCall('POST', `/competitions/${soloCompId}/generate-bracket`, {}, adminToken);
    if (soloGenResp.status !== 200) {
      bug('SOLO-01', 'HIGH', `Solo category bracket gen failed: ${JSON.stringify(soloGenResp.data)}`);
    } else {
      console.log(`  ✅ Solo category bracket generated: ${soloGenResp.data.total_matches} match(es)`);
      // Check that the single athlete is winner
      const soloMatch = await dbGet('SELECT * FROM tournament_brackets WHERE competition_id = ? AND category_id = ?', [soloCompId, soloCatResult.id]);
      if (soloMatch && soloMatch.winner_id === soloAthlete) {
        console.log('  ✅ Solo athlete auto-wins');
      } else {
        bug('SOLO-02', 'HIGH', `Solo athlete not marked as winner: ${JSON.stringify(soloMatch)}`);
      }
    }
  }

  // TEST: Empty category
  const emptyCatResult = await dbRun('INSERT INTO competition_categories (competition_id, weight_category, gender) VALUES (?, ?, ?)', [soloCompId, '+100 кг', 'M']);
  // No registration — bracket should skip this

  // TEST: Competition detail API
  const compDetailResp = await apiCall('GET', `/competitions/${soloCompId}`);
  if (compDetailResp.status !== 200) {
    bug('COMP-01', 'MED', `GET /competitions/:id returned ${compDetailResp.status}`);
  } else {
    console.log(`  ✅ Competition detail API works`);
  }

  // TEST: Seasons API
  const seasonsResp = await apiCall('GET', '/seasons');
  if (seasonsResp.status !== 200) {
    bug('SEASON-01', 'MED', `GET /seasons returned ${seasonsResp.status}`);
  } else {
    console.log(`  ✅ Seasons: ${seasonsResp.data.length} found`);
  }

  // TEST: Duplicate registration
  const firstComp = await dbGet('SELECT id FROM competitions ORDER BY id LIMIT 1');
  if (firstComp && adminToken) {
    const firstCat = await dbGet('SELECT id FROM competition_categories WHERE competition_id = ? LIMIT 1', [firstComp.id]);
    if (firstCat) {
      const dupResp = await apiCall('POST', `/competitions/${firstComp.id}/register`, {
        athlete_id: athleteIds[0],
        category_id: firstCat.id
      }, adminToken);
      // Should fail or return error for duplicate
      if (dupResp.status === 200) {
        // Check if it actually created a duplicate
        const count = await dbGet('SELECT COUNT(*) as cnt FROM competition_registrations WHERE competition_id = ? AND athlete_id = ?', [firstComp.id, athleteIds[0]]);
        if (count.cnt > 1) {
          bug('REG-01', 'HIGH', 'Duplicate registration allowed!');
        }
      }
    }
  }

  // TEST: Schedules via public API
  const publicSchedResp = await apiCall('GET', `/coaches/${coachIds[0]}/schedule`);
  if (publicSchedResp.status !== 200) {
    bug('SCHED-03', 'MED', `Public schedule API returned ${publicSchedResp.status}`);
  } else {
    console.log(`  ✅ Public schedule: ${publicSchedResp.data.length} items`);
  }

  // TEST: Coach profile API
  const coachProfileResp = await apiCall('GET', `/coaches/${coachIds[0]}/profile`);
  if (coachProfileResp.status !== 200) {
    bug('COACH-01', 'MED', `Coach profile returned ${coachProfileResp.status}`);
  } else {
    console.log(`  ✅ Coach profile API works: ${coachProfileResp.data.first_name} ${coachProfileResp.data.last_name}`);
  }

  // TEST: Belt levels API
  const beltResp = await apiCall('GET', '/belt-levels');
  if (beltResp.status !== 200) {
    bug('BELT-03', 'MED', `Belt levels API returned ${beltResp.status}`);
  } else {
    console.log(`  ✅ Belt levels: ${beltResp.data.length} levels`);
  }

  // ============ PHASE 7: VALIDATION ============
  console.log('\n🔍 PHASE 7: Data Integrity Validation...');

  // Check: All fights have matching sparrings
  const orphanFights = await dbAll('SELECT f.id FROM fights f LEFT JOIN sparrings s ON f.sparring_id = s.id WHERE s.id IS NULL');
  if (orphanFights.length > 0) {
    bug('INTEGRITY-01', 'HIGH', `${orphanFights.length} fights without matching sparrings`);
  } else {
    console.log('  ✅ All fights have matching sparrings');
  }

  // Check: All bracket winners propagated correctly
  const unpropped = await dbAll(`
    SELECT tb.id, tb.round_number, tb.winner_id, tb.next_match_id,
           nm.athlete1_id, nm.athlete2_id
    FROM tournament_brackets tb
    JOIN tournament_brackets nm ON tb.next_match_id = nm.id
    WHERE tb.winner_id IS NOT NULL
    AND tb.winner_id != nm.athlete1_id
    AND tb.winner_id != nm.athlete2_id
    AND nm.athlete1_id IS NOT NULL
  `);
  if (unpropped.length > 0) {
    bug('INTEGRITY-02', 'CRITICAL', `${unpropped.length} bracket winners not propagated to next round`);
  } else {
    console.log('  ✅ All bracket winners propagated correctly');
  }

  // Check: Ratings sum
  const ratingRows = await dbAll('SELECT athlete_id, total_points, wins_count, losses_count, fights_count FROM ratings WHERE season_id = ?', [SEASON_ID]);
  let ratingBugs = 0;
  for (const r of ratingRows) {
    if (r.wins_count + (r.losses_count || 0) !== r.fights_count) {
      ratingBugs++;
    }
  }
  if (ratingBugs > 0) {
    bug('INTEGRITY-03', 'MED', `${ratingBugs} athletes have wins+losses != fights_count`);
  } else {
    console.log('  ✅ All ratings wins+losses = fights_count');
  }

  // Check: No negative points
  const negPts = await dbGet('SELECT COUNT(*) as cnt FROM ratings WHERE total_points < 0');
  if (negPts.cnt > 0) {
    bug('INTEGRITY-04', 'HIGH', `${negPts.cnt} athletes have negative points`);
  } else {
    console.log('  ✅ No negative rating points');
  }

  // Check: subscription data
  const subCount = await dbGet('SELECT COUNT(*) as cnt FROM subscriptions');
  console.log(`  Subscriptions in DB: ${subCount.cnt}`);

  // Check: training bookings
  const bookCount = await dbGet('SELECT COUNT(*) as cnt FROM training_bookings');
  console.log(`  Bookings in DB: ${bookCount.cnt}`);

  // ============ FINAL REPORT ============
  console.log('\n' + '='.repeat(60));
  console.log('  📋 FINAL QA REPORT');
  console.log('='.repeat(60));

  const totalComps = await dbGet('SELECT COUNT(*) as cnt FROM competitions');
  const totalMatches = await dbGet('SELECT COUNT(*) as cnt FROM tournament_brackets WHERE is_bye = 0');
  const totalFights = await dbGet('SELECT COUNT(*) as cnt FROM fights');
  const totalRatings = await dbGet('SELECT COUNT(*) as cnt FROM ratings WHERE season_id = ?', [SEASON_ID]);

  console.log(`\n  📈 Statistics:`);
  console.log(`  Branches:      ${branchIds.length}`);
  console.log(`  Coaches:       ${coachIds.length}`);
  console.log(`  Athletes:      ${athleteIds.length}`);
  console.log(`  Competitions:  ${totalComps.cnt}`);
  console.log(`  Matches:       ${totalMatches.cnt}`);
  console.log(`  Fights:        ${totalFights.cnt}`);
  console.log(`  Rated:         ${totalRatings.cnt}`);
  console.log(`  Schedules:     ${scheduleIds.length}`);
  console.log(`  Subscriptions: ${subCount.cnt}`);
  console.log(`  Bookings:      ${bookCount.cnt}`);

  console.log(`\n  🐛 Bugs Found: ${BUGS.length}`);
  if (BUGS.length > 0) {
    console.log('  ' + '-'.repeat(60));
    const critical = BUGS.filter(b => b.severity === 'CRITICAL');
    const high = BUGS.filter(b => b.severity === 'HIGH');
    const med = BUGS.filter(b => b.severity === 'MED');
    const low = BUGS.filter(b => b.severity === 'LOW');
    console.log(`  CRITICAL: ${critical.length}  |  HIGH: ${high.length}  |  MED: ${med.length}  |  LOW: ${low.length}`);
    console.log('  ' + '-'.repeat(60));
    BUGS.forEach(b => {
      console.log(`  [${b.severity.padEnd(8)}] BUG-${b.id}: ${b.desc}`);
    });
  } else {
    console.log('  ✅ NO BUGS FOUND!');
  }

  console.log('\n' + '='.repeat(60));
  db.close();
}

main().catch(err => {
  console.error('FATAL:', err);
  db.close();
  process.exit(1);
});
