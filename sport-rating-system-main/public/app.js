const API_URL = '/api';

// State
let currentCompetitionId = null;
let athletes = [];
let branches = [];
let seasons = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    loadInitialData();
    setupForms();
});

// Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            showPage(page);
            
            // Update active nav link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

function showPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        
        // Load data for the page
        switch(pageName) {
            case 'ratings':
                loadRatings();
                break;
            case 'athletes':
                loadAthletes();
                break;
            case 'competitions':
                loadCompetitions();
                break;
            case 'branches':
                loadBranches();
                break;
            case 'seasons':
                loadSeasons();
                break;
        }
    }
}

// Load initial data
async function loadInitialData() {
    try {
        branches = await fetchAPI('/branches');
        seasons = await fetchAPI('/seasons');
        athletes = await fetchAPI('/athletes');
        
        populateBranchSelects();
        populateSeasonSelects();
        populateAthleteSelects();
        populateFilters();
        
        // Load default page
        loadRatings();
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

// API Helper
async function fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
    }
    
    return response.json();
}

// Ratings
async function loadRatings() {
    const tbody = document.getElementById('ratings-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Загрузка...</td></tr>';
    
    try {
        const ratings = await fetchAPI('/ratings');
        
        if (ratings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Нет данных</td></tr>';
            return;
        }
        
        tbody.innerHTML = ratings.map((rating, index) => `
            <tr>
                <td><strong>${index + 1}</strong></td>
                <td>${rating.first_name} ${rating.last_name}</td>
                <td>${rating.branch_name || '-'}</td>
                <td class="belt-${rating.belt_level?.toLowerCase()}">${rating.belt_level || '-'}</td>
                <td><strong>${rating.total_points}</strong></td>
                <td>${rating.fights_count}</td>
                <td>${rating.wins_count}</td>
                <td>${rating.ippon_count}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading ratings:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Ошибка загрузки</td></tr>';
    }
}

// Athletes
async function loadAthletes() {
    const tbody = document.getElementById('athletes-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Загрузка...</td></tr>';
    
    try {
        athletes = await fetchAPI('/athletes');
        
        if (athletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Нет данных</td></tr>';
            return;
        }
        
        tbody.innerHTML = athletes.map(athlete => `
            <tr>
                <td>${athlete.first_name} ${athlete.last_name}</td>
                <td>${athlete.branch_name || '-'}</td>
                <td>${athlete.weight_category || '-'}</td>
                <td class="belt-${athlete.belt_level?.toLowerCase()}">${athlete.belt_level || '-'}</td>
                <td>${formatDate(athlete.birth_date)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewAthleteRating(${athlete.id})">Рейтинг</button>
                </td>
            </tr>
        `).join('');
        
        populateAthleteSelects();
    } catch (error) {
        console.error('Error loading athletes:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Ошибка загрузки</td></tr>';
    }
}

async function viewAthleteRating(athleteId) {
    try {
        const ratings = await fetchAPI(`/ratings/athlete/${athleteId}`);
        const athlete = athletes.find(a => a.id === athleteId);
        
        alert(`Рейтинг: ${athlete.first_name} ${athlete.last_name}\n\n` +
              ratings.map(r => `${r.season_name}: ${r.total_points} очков (${r.wins_count} побед из ${r.fights_count})`).join('\n'));
    } catch (error) {
        console.error('Error loading athlete rating:', error);
        alert('Ошибка загрузки рейтинга');
    }
}

// Competitions
async function loadCompetitions() {
    const container = document.getElementById('competitions-list');
    container.innerHTML = '<p class="text-center">Загрузка...</p>';
    
    try {
        const competitions = await fetchAPI('/competitions');
        
        if (competitions.length === 0) {
            container.innerHTML = '<p class="text-center">Нет соревнований</p>';
            return;
        }
        
        container.innerHTML = competitions.map(comp => `
            <div class="competition-card" onclick="viewCompetition(${comp.id})">
                <h3>${comp.name}</h3>
                <div class="meta">📅 ${formatDate(comp.competition_date)}</div>
                <div class="meta">📍 ${comp.location || 'Не указано'}</div>
                <div class="meta">🏆 ${comp.season_name || 'Вне сезона'}</div>
                <span class="level level-${comp.level}">${getLevelName(comp.level)}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading competitions:', error);
        container.innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

async function viewCompetition(competitionId) {
    currentCompetitionId = competitionId;
    
    try {
        const competition = await fetchAPI(`/competitions/${competitionId}`);
        
        document.getElementById('competition-title').textContent = competition.name;
        
        document.getElementById('competition-info').innerHTML = `
            <div class="info-item">
                <strong>Дата</strong>
                <div>${formatDate(competition.competition_date)}</div>
            </div>
            <div class="info-item">
                <strong>Место</strong>
                <div>${competition.location || '-'}</div>
            </div>
            <div class="info-item">
                <strong>Уровень</strong>
                <div><span class="level level-${competition.level}">${getLevelName(competition.level)}</span></div>
            </div>
            <div class="info-item">
                <strong>Сезон</strong>
                <div>${competition.season_name || '-'}</div>
            </div>
        `;
        
        // Load categories and fights
        await loadCompetitionFights(competitionId, competition.categories);
        
        showPage('competition-detail');
    } catch (error) {
        console.error('Error loading competition:', error);
        alert('Ошибка загрузки соревнования');
    }
}

async function loadCompetitionFights(competitionId, categories) {
    const container = document.getElementById('categories-fights');
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<p>Нет весовых категорий. Добавьте категории и бои.</p>';
        return;
    }
    
    try {
        const fights = await fetchAPI(`/competitions/${competitionId}/fights`);
        
        // Group fights by category
        const fightsByCategory = {};
        fights.forEach(fight => {
            const key = `${fight.weight_category}-${fight.gender}`;
            if (!fightsByCategory[key]) {
                fightsByCategory[key] = [];
            }
            fightsByCategory[key].push(fight);
        });
        
        container.innerHTML = categories.map(category => {
            const key = `${category.weight_category}-${category.gender}`;
            const categoryFights = fightsByCategory[key] || [];
            
            return `
                <div class="category-section">
                    <div class="category-header">
                        ${category.weight_category} (${category.gender === 'M' ? 'Мужчины' : 'Женщины'}) - 
                        Боёв: ${categoryFights.length}
                    </div>
                    ${categoryFights.length > 0 ? categoryFights.map(fight => `
                        <div class="fight-item" onclick="viewFight(${fight.id})">
                            <div class="fight-athletes">
                                <span class="athlete-name ${fight.winner_id === fight.athlete1_id ? 'winner' : ''}">
                                    ${fight.athlete1_name}
                                </span>
                                <span class="vs">VS</span>
                                <span class="athlete-name ${fight.winner_id === fight.athlete2_id ? 'winner' : ''}">
                                    ${fight.athlete2_name}
                                </span>
                            </div>
                            <div class="fight-result">
                                <span>${fight.athlete1_score} : ${fight.athlete2_score}</span>
                                <span class="result-badge result-${fight.result_type}">${getResultName(fight.result_type)}</span>
                            </div>
                        </div>
                    `).join('') : '<p>Нет боёв в этой категории</p>'}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading fights:', error);
        container.innerHTML = '<p>Ошибка загрузки боёв</p>';
    }
}

async function viewFight(fightId) {
    try {
        const fight = await fetchAPI(`/fights/${fightId}`);
        
        alert(`Бой: ${fight.athlete1_name} VS ${fight.athlete2_name}\n\n` +
              `Счёт: ${fight.athlete1_score} : ${fight.athlete2_score}\n` +
              `Победитель: ${fight.winner_name}\n` +
              `Результат: ${getResultName(fight.result_type)}\n` +
              `Соревнование: ${fight.competition_name}`);
    } catch (error) {
        console.error('Error loading fight:', error);
        alert('Ошибка загрузки боя');
    }
}

// Branches
async function loadBranches() {
    const tbody = document.getElementById('branches-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Загрузка...</td></tr>';
    
    try {
        branches = await fetchAPI('/branches');
        
        if (branches.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Нет данных</td></tr>';
            return;
        }
        
        tbody.innerHTML = branches.map(branch => `
            <tr>
                <td>${branch.name}</td>
                <td>${branch.city || '-'}</td>
                <td>${branch.address || '-'}</td>
                <td>${formatDate(branch.created_at)}</td>
            </tr>
        `).join('');
        
        populateBranchSelects();
    } catch (error) {
        console.error('Error loading branches:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Ошибка загрузки</td></tr>';
    }
}

// Seasons
async function loadSeasons() {
    const tbody = document.getElementById('seasons-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Загрузка...</td></tr>';
    
    try {
        seasons = await fetchAPI('/seasons');
        
        if (seasons.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Нет данных</td></tr>';
            return;
        }
        
        tbody.innerHTML = seasons.map(season => `
            <tr>
                <td>${season.name}</td>
                <td>${formatDate(season.start_date)}</td>
                <td>${formatDate(season.end_date)}</td>
                <td>
                    <span class="badge ${season.is_active ? 'badge-active' : 'badge-inactive'}">
                        ${season.is_active ? 'Активный' : 'Завершён'}
                    </span>
                </td>
            </tr>
        `).join('');
        
        populateSeasonSelects();
    } catch (error) {
        console.error('Error loading seasons:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Ошибка загрузки</td></tr>';
    }
}

// Forms Setup
function setupForms() {
    // Athlete Form
    document.getElementById('athlete-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        try {
            await fetchAPI('/athletes', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            closeModal('athlete-modal');
            e.target.reset();
            loadAthletes();
            alert('Спортсмен добавлен');
        } catch (error) {
            console.error('Error creating athlete:', error);
            alert('Ошибка создания спортсмена');
        }
    });
    
    // Branch Form
    document.getElementById('branch-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        try {
            await fetchAPI('/branches', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            closeModal('branch-modal');
            e.target.reset();
            loadBranches();
            alert('Филиал добавлен');
        } catch (error) {
            console.error('Error creating branch:', error);
            alert('Ошибка создания филиала');
        }
    });
    
    // Season Form
    document.getElementById('season-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            start_date: formData.get('start_date'),
            end_date: formData.get('end_date'),
            is_active: formData.get('is_active') ? 1 : 0
        };
        
        try {
            await fetchAPI('/seasons', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            closeModal('season-modal');
            e.target.reset();
            loadSeasons();
            alert('Сезон добавлен');
        } catch (error) {
            console.error('Error creating season:', error);
            alert('Ошибка создания сезона');
        }
    });
    
    // Competition Form
    document.getElementById('competition-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        try {
            await fetchAPI('/competitions', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            closeModal('competition-modal');
            e.target.reset();
            loadCompetitions();
            alert('Соревнование добавлено');
        } catch (error) {
            console.error('Error creating competition:', error);
            alert('Ошибка создания соревнования');
        }
    });
    
    // Fight Form
    document.getElementById('fight-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        // Convert numeric fields
        data.athlete1_score = parseInt(data.athlete1_score) || 0;
        data.athlete2_score = parseInt(data.athlete2_score) || 0;
        
        try {
            await fetchAPI('/fights', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            closeModal('fight-modal');
            e.target.reset();
            viewCompetition(currentCompetitionId);
            alert('Бой добавлен и рейтинг обновлён');
        } catch (error) {
            console.error('Error creating fight:', error);
            alert('Ошибка создания боя');
        }
    });
    
    // Update winner select when athletes are selected
    const athlete1Select = document.getElementById('fight-athlete1-select');
    const athlete2Select = document.getElementById('fight-athlete2-select');
    const winnerSelect = document.getElementById('fight-winner-select');
    
    function updateWinnerOptions() {
        const athlete1 = athlete1Select.value;
        const athlete2 = athlete2Select.value;
        
        winnerSelect.innerHTML = '<option value="">Выберите победителя</option>';
        
        if (athlete1) {
            const athlete = athletes.find(a => a.id == athlete1);
            if (athlete) {
                winnerSelect.innerHTML += `<option value="${athlete.id}">${athlete.first_name} ${athlete.last_name}</option>`;
            }
        }
        
        if (athlete2) {
            const athlete = athletes.find(a => a.id == athlete2);
            if (athlete) {
                winnerSelect.innerHTML += `<option value="${athlete.id}">${athlete.first_name} ${athlete.last_name}</option>`;
            }
        }
    }
    
    athlete1Select.addEventListener('change', updateWinnerOptions);
    athlete2Select.addEventListener('change', updateWinnerOptions);
}

// Populate Selects
function populateBranchSelects() {
    const selects = document.querySelectorAll('#athlete-branch-select, #branch-filter');
    selects.forEach(select => {
        const currentValue = select.value;
        const isFilter = select.id === 'branch-filter';
        
        select.innerHTML = isFilter ? '<option value="">Все филиалы</option>' : '<option value="">Выберите филиал</option>';
        branches.forEach(branch => {
            select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
        });
        
        if (currentValue) select.value = currentValue;
    });
}

function populateSeasonSelects() {
    const selects = document.querySelectorAll('#competition-season-select, #season-filter');
    selects.forEach(select => {
        const currentValue = select.value;
        const isFilter = select.id === 'season-filter';
        
        select.innerHTML = isFilter ? '<option value="">Текущий сезон</option>' : '<option value="">Выберите сезон</option>';
        seasons.forEach(season => {
            select.innerHTML += `<option value="${season.id}">${season.name}</option>`;
        });
        
        if (currentValue) select.value = currentValue;
    });
}

function populateAthleteSelects() {
    const selects = document.querySelectorAll('#fight-athlete1-select, #fight-athlete2-select');
    selects.forEach(select => {
        select.innerHTML = '<option value="">Выберите спортсмена</option>';
        athletes.forEach(athlete => {
            select.innerHTML += `<option value="${athlete.id}">${athlete.first_name} ${athlete.last_name} (${athlete.weight_category || 'без категории'})</option>`;
        });
    });
}

function populateFilters() {
    const branchFilter = document.getElementById('branch-filter');
    const seasonFilter = document.getElementById('season-filter');
    
    branchFilter.addEventListener('change', loadRatings);
    seasonFilter.addEventListener('change', loadRatings);
}

// Modal Functions
function showAthleteModal() {
    document.getElementById('athlete-modal').classList.add('active');
}

function showBranchModal() {
    document.getElementById('branch-modal').classList.add('active');
}

function showSeasonModal() {
    document.getElementById('season-modal').classList.add('active');
}

function showCompetitionModal() {
    document.getElementById('competition-modal').classList.add('active');
}

async function showFightModal() {
    if (!currentCompetitionId) {
        alert('Выберите соревнование');
        return;
    }
    
    try {
        const competition = await fetchAPI(`/competitions/${currentCompetitionId}`);
        
        document.getElementById('fight-competition-id').value = currentCompetitionId;
        
        // Populate categories
        const categorySelect = document.getElementById('fight-category-select');
        categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
        competition.categories.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.weight_category} (${cat.gender === 'M' ? 'М' : 'Ж'})</option>`;
        });
        
        document.getElementById('fight-modal').classList.add('active');
    } catch (error) {
        console.error('Error loading competition categories:', error);
        alert('Ошибка загрузки категорий');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

function getLevelName(level) {
    const levels = {
        'club': 'Клубное',
        'city': 'Городское',
        'regional': 'Региональное',
        'national': 'Национальное',
        'international': 'Международное'
    };
    return levels[level] || level;
}

function getResultName(result) {
    const results = {
        'ippon': 'Иппон',
        'wazari': 'Ваза-ари',
        'points': 'По баллам',
        'disqualification': 'Дисквалификация',
        'forfeit': 'Неявка'
    };
    return results[result] || result;
}

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
