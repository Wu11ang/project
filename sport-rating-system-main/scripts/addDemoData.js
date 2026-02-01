const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.db');
const db = new sqlite3.Database(dbPath);

console.log('Добавление демо-данных...\n');

db.serialize(() => {
  // Добавляем филиалы
  console.log('Добавление филиалов...');
  db.run(`INSERT INTO branches (name, city, address) VALUES 
    ('Главный додзё', 'Астана', 'ул. Достык, 12'),
    ('Филиал "Север"', 'Астана', 'ул. Кабанбай батыра, 45'),
    ('Филиал "Юг"', 'Алматы', 'пр. Абая, 123')`);

  // Добавляем сезон
  console.log('Добавление сезона...');
  db.run(`INSERT INTO seasons (name, start_date, end_date, is_active) VALUES 
    ('Сезон 2025', '2025-01-01', '2025-12-31', 1),
    ('Сезон 2024', '2024-01-01', '2024-12-31', 0)`);

  // Добавляем спортсменов
  console.log('Добавление спортсменов...');
  db.run(`INSERT INTO athletes (first_name, last_name, birth_date, gender, weight_category, belt_level, branch_id, photo_url) VALUES 
    ('Асхат', 'Нурланов', '2010-03-15', 'M', '60 кг', 'синий', 1, NULL),
    ('Айдар', 'Токаев', '2009-07-22', 'M', '66 кг', 'зелёный', 1, NULL),
    ('Диас', 'Сатыбалдиев', '2011-11-03', 'M', '55 кг', 'жёлтый', 2, NULL),
    ('Ерасыл', 'Қазбеков', '2010-05-18', 'M', '60 кг', 'синий', 2, NULL),
    ('Айгерим', 'Садыкова', '2012-02-09', 'F', '52 кг', 'оранжевый', 1, NULL),
    ('Назерке', 'Омарова', '2011-08-25', 'F', '57 кг', 'зелёный', 3, NULL),
    ('Бекзат', 'Жумабаев', '2008-12-14', 'M', '73 кг', 'коричневый', 3, NULL),
    ('Темирлан', 'Алибеков', '2009-04-30', 'M', '66 кг', 'синий', 1, NULL)`);

  // Добавляем соревнование
  console.log('Добавление соревнований...');
  db.run(`INSERT INTO competitions (name, competition_date, location, level, season_id, description) VALUES 
    ('Кубок Астаны 2025', '2025-01-15', 'Спорткомплекс "Алау"', 'city', 1, 'Городское первенство среди юниоров'),
    ('Открытый турнир клуба', '2025-01-10', 'Главный додзё', 'club', 1, 'Внутриклубные соревнования')`, 
    function() {
      const comp1Id = 1;
      const comp2Id = 2;
      
      // Добавляем категории для первого соревнования
      console.log('Добавление весовых категорий...');
      db.run(`INSERT INTO competition_categories (competition_id, weight_category, gender, participants_count) VALUES 
        (${comp1Id}, '60 кг', 'M', 3),
        (${comp1Id}, '66 кг', 'M', 2),
        (${comp1Id}, '52 кг', 'F', 1),
        (${comp1Id}, '57 кг', 'F', 1)`, 
        function() {
          // Добавляем бои для первого соревнования
          console.log('Добавление боёв...');
          
          // Бой 1: Асхат vs Ерасыл в категории 60 кг (М)
          db.run(`INSERT INTO fights (competition_id, category_id, athlete1_id, athlete2_id, winner_id, result_type, athlete1_score, athlete2_score) VALUES 
            (${comp1Id}, 1, 1, 4, 1, 'ippon', 10, 0)`, function() {
              // Обновляем рейтинг для Асхата (победитель иппоном, город = 100 очков)
              db.run(`INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, wins_count, ippon_count) VALUES 
                (1, 1, 100, 1, 1, 1)`);
              
              // Обновляем рейтинг для Ерасыла (проигравший = 0 очков)
              db.run(`INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, losses_count) VALUES 
                (4, 1, 0, 1, 1)`);
            });
          
          // Бой 2: Айдар vs Темирлан в категории 66 кг (М)
          db.run(`INSERT INTO fights (competition_id, category_id, athlete1_id, athlete2_id, winner_id, result_type, athlete1_score, athlete2_score) VALUES 
            (${comp1Id}, 2, 2, 8, 2, 'points', 7, 3)`, function() {
              // Обновляем рейтинг для Айдара (победитель по баллам, город = 60 очков)
              db.run(`INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, wins_count) VALUES 
                (2, 1, 60, 1, 1)`);
              
              // Обновляем рейтинг для Темирлана (проигравший = 0 очков)
              db.run(`INSERT INTO ratings (athlete_id, season_id, total_points, fights_count, losses_count) VALUES 
                (8, 1, 0, 1, 1)`);
            });
          
          console.log('\n✅ Демо-данные успешно добавлены!');
          console.log('\nТеперь можете запустить сервер: npm start');
          console.log('И открыть http://localhost:3000 в браузере\n');
        });
    });
});

db.close();
