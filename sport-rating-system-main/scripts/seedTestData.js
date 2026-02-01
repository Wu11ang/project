const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { err ? reject(err) : resolve({ id: this.lastID, changes: this.changes }); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { err ? reject(err) : resolve(rows); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { err ? reject(err) : resolve(row); });
});

const maleNames = ['Арман','Нурлан','Ерлан','Даулет','Асылхан','Тимур','Рустам','Бауыржан','Серик','Алмас','Данияр','Мирас','Нуржан','Кайрат','Жандос','Берик','Сагынтай','Ринат','Олжас','Самат','Марат','Темирлан','Айдар','Куаныш','Думан','Нурбол','Ельнар','Бекзат','Жасулан','Адиль','Ернар','Талгат','Азамат','Абылай','Ислам','Султан','Санжар','Ержан','Досым','Габит','Аян','Нуртас'];
const femaleNames = ['Аида','Камила','Дана','Жанар','Айгуль','Назгуль','Сауле','Динара','Мадина','Гульнара','Алтынай','Балнур','Жибек','Куралай','Нургуль','Айжан','Томирис','Арайлым','Сания','Ботагоз','Ажар','Наргиз','Ляйла','Карлыгаш','Зарина','Айнур','Маржан','Галия','Асель','Рауан'];
const lastNames = ['Алиев','Нурланов','Сериков','Жумабеков','Тулегенов','Ахметов','Байжанов','Касымов','Ермеков','Султанов','Кайратов','Темирханов','Бекболатов','Оспанов','Мухтаров','Сагатов','Рахимов','Токтаров','Абдрахманов','Исмаилов'];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  const passwordHash = bcrypt.hashSync('coach123', 10);
  const athleteHash = bcrypt.hashSync('athlete123', 10);

  console.log('Creating season...');
  const season = await dbRun('INSERT INTO seasons (name, start_date, end_date, is_active) VALUES (?, ?, ?, 1)', ['Сезон 2026', '2026-01-01', '2026-12-31']);
  const seasonId = season.id;

  console.log('Creating 3 branches...');
  const branches = [
    { name: 'ORTUS Центральный', city: 'Астана', address: 'ул. Кабанбай Батыра 42' },
    { name: 'ORTUS Юг', city: 'Астана', address: 'ул. Сыганак 18' },
    { name: 'ORTUS Север', city: 'Астана', address: 'пр. Туран 55' }
  ];
  const branchIds = [];
  for (const b of branches) {
    const res = await dbRun('INSERT INTO branches (name, city, address) VALUES (?, ?, ?)', [b.name, b.city, b.address]);
    branchIds.push(res.id);
  }

  console.log('Creating 3 coaches...');
  const coachData = [
    { first: 'Ерболат', last: 'Сатыбалдиев', phone: '+77001001001' },
    { first: 'Канат', last: 'Мухамедов', phone: '+77001001002' },
    { first: 'Бахтияр', last: 'Оразов', phone: '+77001001003' }
  ];
  const coachIds = [];
  for (let i = 0; i < 3; i++) {
    const c = coachData[i];
    const user = await dbRun('INSERT INTO users (phone, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [c.phone, passwordHash, 'coach', c.first, c.last]);
    const coach = await dbRun('INSERT INTO coaches (user_id, branch_id, specialization, experience_years) VALUES (?, ?, ?, ?)',
      [user.id, branchIds[i], 'Judo', 5 + Math.floor(Math.random() * 15)]);
    coachIds.push(coach.id);
    console.log(`  ${c.first} ${c.last} -> ${branches[i].name}`);
  }

  console.log('Creating 60 athletes (20 per coach)...');
  let phoneNum = 7700200001;
  const allAthletes = [];

  for (let ci = 0; ci < 3; ci++) {
    for (let a = 0; a < 20; a++) {
      const gender = a < 14 ? 'M' : 'F';
      const firstName = gender === 'M' ? randomFrom(maleNames) : randomFrom(femaleNames);
      const lastName = randomFrom(lastNames);
      const weight = gender === 'M' ? Math.round(50 + Math.random() * 55) : Math.round(40 + Math.random() * 45);
      const height = gender === 'M' ? Math.round(160 + Math.random() * 30) : Math.round(150 + Math.random() * 25);
      const birthYear = 2000 + Math.floor(Math.random() * 10);
      const birthMonth = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
      const birthDay = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');

      const catRow = await dbGet(
        'SELECT category_name FROM weight_categories_mapping WHERE gender = ? AND ? >= min_weight AND ? <= max_weight',
        [gender, weight, weight]
      );
      const weightCategory = catRow ? catRow.category_name : null;
      const belts = ['белый', 'белый', 'белый', 'жёлтый', 'жёлтый', 'оранжевый', 'зелёный'];

      const user = await dbRun('INSERT INTO users (phone, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
        [`+${phoneNum++}`, athleteHash, 'athlete', firstName, lastName]);
      const athlete = await dbRun(
        'INSERT INTO athletes (user_id, birth_date, gender, height, weight, weight_category, belt_level, branch_id, coach_id, approval_status, martial_art) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, `${birthYear}-${birthMonth}-${birthDay}`, gender, height, weight, weightCategory, randomFrom(belts), branchIds[ci], coachIds[ci], 'approved', 'Judo']
      );
      allAthletes.push({ id: athlete.id, gender, weight, weightCategory, branchId: branchIds[ci], firstName, lastName });
    }
  }
  console.log(`  Total: ${allAthletes.length} athletes`);

  // Distribution
  const catCounts = {};
  for (const a of allAthletes) {
    const key = `${a.gender} ${a.weightCategory}`;
    catCounts[key] = (catCounts[key] || 0) + 1;
  }
  console.log('  Weight distribution:');
  for (const [k, v] of Object.entries(catCounts).sort()) console.log(`    ${k}: ${v}`);

  console.log('\nCreating competition "Кубок ORTUS 2026"...');
  const comp = await dbRun(
    'INSERT INTO competitions (name, competition_date, location, level, season_id, branch_id, created_by_user_id, description, registration_open) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['Кубок ORTUS 2026', '2026-02-15', 'СК "Барыс", Астана', 'club', seasonId, branchIds[0], 1, 'Клубный турнир между всеми филиалами', 1]
  );
  const compId = comp.id;

  // Categories
  const mappings = await dbAll('SELECT DISTINCT category_name, gender FROM weight_categories_mapping ORDER BY gender, min_weight');
  const categoryIds = {};
  for (const m of mappings) {
    const res = await dbRun('INSERT INTO competition_categories (competition_id, weight_category, gender) VALUES (?, ?, ?)',
      [compId, m.category_name, m.gender]);
    categoryIds[`${m.gender} ${m.category_name}`] = res.id;
  }

  // Register all
  let regCount = 0;
  for (const a of allAthletes) {
    const catId = categoryIds[`${a.gender} ${a.weightCategory}`];
    if (!catId) continue;
    await dbRun('INSERT INTO competition_registrations (competition_id, athlete_id, category_id, registered_by_user_id) VALUES (?, ?, ?, ?)',
      [compId, a.id, catId, 1]);
    regCount++;
  }
  console.log(`  Registered: ${regCount} athletes`);

  // Generate bracket
  console.log('Generating bracket...');
  const categories = await dbAll('SELECT * FROM competition_categories WHERE competition_id = ?', [compId]);
  let totalMatches = 0;

  for (const category of categories) {
    const registrations = await dbAll(
      "SELECT athlete_id FROM competition_registrations WHERE competition_id = ? AND category_id = ? AND status != 'cancelled'",
      [compId, category.id]
    );
    if (registrations.length < 2) continue;

    const athletes = registrations.map(r => r.athlete_id);
    for (let i = athletes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [athletes[i], athletes[j]] = [athletes[j], athletes[i]];
    }

    const n = athletes.length;
    let bracketSize = 1;
    while (bracketSize < n) bracketSize *= 2;
    const totalRounds = Math.log2(bracketSize);
    const firstRoundMatches = bracketSize / 2;
    const byes = bracketSize - n;
    const matchIds = {};

    for (let round = totalRounds; round >= 1; round--) {
      const matchesInRound = Math.pow(2, totalRounds - round);
      for (let m = 1; m <= matchesInRound; m++) {
        const nextMatchKey = round < totalRounds ? `${round + 1}-${Math.ceil(m / 2)}` : null;
        const nextMatchId = nextMatchKey ? (matchIds[nextMatchKey] || null) : null;
        const result = await dbRun(
          'INSERT INTO tournament_brackets (competition_id, category_id, round_number, match_number, next_match_id) VALUES (?, ?, ?, ?, ?)',
          [compId, category.id, round, m, nextMatchId]
        );
        matchIds[`${round}-${m}`] = result.id;
        totalMatches++;
      }
    }

    let athleteIdx = 0;
    for (let m = 1; m <= firstRoundMatches; m++) {
      const matchId = matchIds[`1-${m}`];
      const nextMatchId = matchIds[`2-${Math.ceil(m / 2)}`] || null;
      if (m <= byes) {
        const a1 = athletes[athleteIdx++];
        await dbRun('UPDATE tournament_brackets SET athlete1_id=?, is_bye=1, winner_id=? WHERE id=?', [a1, a1, matchId]);
        if (nextMatchId) {
          const nm = await dbGet('SELECT * FROM tournament_brackets WHERE id = ?', [nextMatchId]);
          if (!nm.athlete1_id) await dbRun('UPDATE tournament_brackets SET athlete1_id=? WHERE id=?', [a1, nextMatchId]);
          else await dbRun('UPDATE tournament_brackets SET athlete2_id=? WHERE id=?', [a1, nextMatchId]);
        }
      } else {
        const a1 = athletes[athleteIdx++];
        const a2 = athletes[athleteIdx++];
        await dbRun('UPDATE tournament_brackets SET athlete1_id=?, athlete2_id=? WHERE id=?', [a1, a2, matchId]);
      }
    }
    console.log(`  ${category.gender} ${category.weight_category}: ${n} athletes, ${totalRounds} rounds`);
  }
  await dbRun('UPDATE competitions SET bracket_generated = 1 WHERE id = ?', [compId]);
  console.log(`  Total matches: ${totalMatches}`);

  // Play all matches
  console.log('\nPlaying all bracket matches...');
  const resultTypes = ['ippon', 'wazari', 'points', 'ippon', 'ippon', 'wazari'];
  const config = await dbGet('SELECT * FROM rating_config WHERE competition_level = ?', ['club']);
  let matchesPlayed = 0;

  const activeCats = await dbAll(`
    SELECT DISTINCT cc.id, cc.weight_category, cc.gender
    FROM competition_categories cc
    JOIN competition_registrations cr ON cc.id = cr.category_id
    WHERE cc.competition_id = ?
  `, [compId]);

  for (const cat of activeCats) {
    const catMatches = await dbAll(
      'SELECT * FROM tournament_brackets WHERE competition_id = ? AND category_id = ? ORDER BY round_number, match_number',
      [compId, cat.id]
    );
    const maxRound = Math.max(...catMatches.map(m => m.round_number));

    for (let round = 1; round <= maxRound; round++) {
      const roundMatches = catMatches.filter(m => m.round_number === round && !m.is_bye);

      for (const match of roundMatches) {
        const fm = await dbGet('SELECT * FROM tournament_brackets WHERE id = ?', [match.id]);
        if (!fm.athlete1_id || !fm.athlete2_id || fm.winner_id) continue;

        const winnerId = Math.random() < 0.5 ? fm.athlete1_id : fm.athlete2_id;
        const loserId = winnerId === fm.athlete1_id ? fm.athlete2_id : fm.athlete1_id;
        const resultType = randomFrom(resultTypes);

        const sparring = await dbRun(
          'INSERT INTO sparrings (competition_id, category_id, athlete1_id, athlete2_id, round_name, status) VALUES (?, ?, ?, ?, ?, ?)',
          [compId, cat.id, fm.athlete1_id, fm.athlete2_id, `Раунд ${round}`, 'completed']
        );

        await dbRun(
          'INSERT INTO fights (sparring_id, winner_id, result_type, athlete1_score, athlete2_score, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
          [sparring.id, winnerId, resultType, Math.floor(Math.random() * 10), Math.floor(Math.random() * 5), 1]
        );

        await dbRun('UPDATE tournament_brackets SET winner_id = ?, sparring_id = ? WHERE id = ?', [winnerId, sparring.id, fm.id]);

        if (fm.next_match_id) {
          const nm = await dbGet('SELECT * FROM tournament_brackets WHERE id = ?', [fm.next_match_id]);
          if (!nm.athlete1_id) await dbRun('UPDATE tournament_brackets SET athlete1_id = ? WHERE id = ?', [winnerId, fm.next_match_id]);
          else await dbRun('UPDATE tournament_brackets SET athlete2_id = ? WHERE id = ?', [winnerId, fm.next_match_id]);
        }

        // Ratings
        const wp = resultType === 'ippon' ? config.win_ippon_points : config.win_points_points;
        await dbRun(`
          INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, wins_count, ippon_count)
          VALUES (?, ?, ?, 1, 1, ?)
          ON CONFLICT(athlete_id, season_id) DO UPDATE SET
            total_points = total_points + ?, fights_count = fights_count + 1,
            wins_count = wins_count + 1, ippon_count = ippon_count + ?,
            updated_at = CURRENT_TIMESTAMP
        `, [winnerId, seasonId, wp, resultType === 'ippon' ? 1 : 0, wp, resultType === 'ippon' ? 1 : 0]);

        await dbRun(`
          INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, losses_count)
          VALUES (?, ?, 0, 1, 1)
          ON CONFLICT(athlete_id, season_id) DO UPDATE SET
            fights_count = fights_count + 1, losses_count = losses_count + 1,
            updated_at = CURRENT_TIMESTAMP
        `, [loserId, seasonId]);

        matchesPlayed++;
      }
    }
  }
  console.log(`  Played: ${matchesPlayed} matches`);

  // VERIFICATION
  console.log('\n========== RESULTS ==========');
  const ratings = await dbAll(`
    SELECT r.*, u.first_name, u.last_name, a.weight_category, a.gender, b.name as branch_name
    FROM ratings r JOIN athletes a ON r.athlete_id = a.id
    JOIN users u ON a.user_id = u.id LEFT JOIN branches b ON a.branch_id = b.id
    WHERE r.season_id = ? ORDER BY r.total_points DESC
  `, [seasonId]);

  console.log(`\nRatings: ${ratings.length} entries`);
  console.log('\nТоп-20:');
  ratings.slice(0, 20).forEach((r, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${r.last_name} ${r.first_name} | ${r.branch_name} | ${r.gender} ${r.weight_category} | ${r.total_points}pts | W${r.wins_count} L${r.losses_count} | ippon:${r.ippon_count}`);
  });

  console.log('\nФилиалы:');
  const bs = {};
  for (const r of ratings) {
    if (!bs[r.branch_name]) bs[r.branch_name] = { pts: 0, wins: 0, ath: 0 };
    bs[r.branch_name].pts += r.total_points;
    bs[r.branch_name].wins += r.wins_count;
    bs[r.branch_name].ath++;
  }
  for (const [n, s] of Object.entries(bs)) console.log(`  ${n}: ${s.pts}pts, ${s.wins}W, ${s.ath} athletes`);

  // Champions
  console.log('\nЧемпионы:');
  for (const cat of activeCats) {
    const fr = await dbGet('SELECT MAX(round_number) as mr FROM tournament_brackets WHERE competition_id=? AND category_id=?', [compId, cat.id]);
    const fm = await dbGet(`SELECT tb.*, u.first_name, u.last_name FROM tournament_brackets tb
      LEFT JOIN athletes a ON tb.winner_id=a.id LEFT JOIN users u ON a.user_id=u.id
      WHERE tb.competition_id=? AND tb.category_id=? AND tb.round_number=?`, [compId, cat.id, fr.mr]);
    if (fm?.winner_id) console.log(`  ${cat.gender} ${cat.weight_category}: ${fm.last_name} ${fm.first_name}`);
    else console.log(`  ${cat.gender} ${cat.weight_category}: НЕТ ЧЕМПИОНА`);
  }

  console.log('\n=== ТЕСТ ЗАВЕРШЕН ===');
  console.log('Для ручного тестирования:');
  console.log('  Админ: +77771234567 / admin123');
  console.log('  Тренер 1: +77001001001 / coach123');
  console.log('  Тренер 2: +77001001002 / coach123');
  console.log('  Тренер 3: +77001001003 / coach123');

  db.close();
}

main().catch(e => { console.error('FATAL:', e); db.close(); process.exit(1); });
