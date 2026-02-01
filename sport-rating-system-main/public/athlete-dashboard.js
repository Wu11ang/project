const API_URL = '/api';

let currentUser = null;
let authToken = null;
let athleteProfile = null;
let myRegistrations = [];
let dashboardData = null;
let currentCompId = null;
let currentCompData = null;

document.addEventListener('DOMContentLoaded', async () => {
    authToken = localStorage.getItem('token');
    if (!authToken) { window.location.href = 'login.html'; return; }

    try {
        await loadCurrentUser();
        setupNavigation();
        setupUserMenu();
        loadDashboard();
    } catch (error) {
        console.error('Auth error:', error);
        logout();
    }
});

async function loadCurrentUser() {
    currentUser = await fetchAPI('/auth/me');
    const nameDisplay = `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('user-name').textContent = nameDisplay;

    // Update dropdown name
    const dropdownName = document.getElementById('dropdown-full-name');
    if (dropdownName) dropdownName.textContent = nameDisplay;

    // Update navbar photo
    const navPhoto = document.getElementById('nav-user-photo');
    const navPlaceholder = document.querySelector('.user-avatar-placeholder');

    if (currentUser.photo_url) {
        navPhoto.src = currentUser.photo_url;
        navPhoto.style.display = 'block';
        if (navPlaceholder) navPlaceholder.style.display = 'none';
    } else {
        navPhoto.style.display = 'none';
        if (navPlaceholder) navPlaceholder.style.display = 'block';
    }

    if (currentUser.role !== 'athlete') {
        window.location.href = currentUser.role === 'admin' ? 'index.html' : 'coach-dashboard.html';
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}



async function fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            ...options.headers
        }
    });
    if (response.status === 401 || response.status === 403) { logout(); throw new Error('Unauthorized'); }
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'API error'); }
    return response.json();
}

async function fetchRaw(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { 'Authorization': `Bearer ${authToken}`, ...options.headers }
    });
    if (response.status === 401 || response.status === 403) { logout(); throw new Error('Unauthorized'); }
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'API error'); }
    return response.json();
}

// ============= NAVIGATION =============

function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.hasAttribute('target')) return;
            e.preventDefault();
            const page = link.dataset.page;
            if (page) {
                showPage(page);
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`${pageName}-page`);
    if (target) {
        target.classList.add('active');
        switch (pageName) {
            case 'dashboard': loadDashboard(); break;
            case 'profile': loadProfile(); break;
            case 'competitions': loadAvailableCompetitions(); break;
            case 'my-competitions': loadMyCompetitions(); break;
            case 'fight-history': loadFightHistory(); break;
            case 'schedule': loadCoachSchedule(); loadMyBookings(); loadMySubscriptions(); break;
        }
    }
}

// ============= DASHBOARD HOME =============

async function loadDashboard() {
    try {
        // Load profile first if not loaded
        if (!athleteProfile) {
            athleteProfile = await fetchAPI('/athletes/me');
        }

        dashboardData = await fetchAPI('/athletes/dashboard');
        const d = dashboardData;

        // Hero summary card
        const photoSrc = d.athlete.photo_url || '';
        const photoHtml = photoSrc
            ? `<img src="${photoSrc}" alt="Фото" class="hero-photo">`
            : `<div class="hero-photo hero-photo-placeholder">👤</div>`;

        const DAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

        document.getElementById('dashboard-summary').innerHTML = `
            <div class="hero-card">
                <div class="hero-left">
                    ${photoHtml}
                    <div class="hero-info">
                        <h1 class="hero-name">${d.athlete.first_name} ${d.athlete.last_name}</h1>
                        <div class="hero-belt belt-tag belt-tag-${(d.athlete.belt_level || 'white').toLowerCase()}">${d.athlete.belt_level || 'White'}</div>
                        <div class="hero-meta">${d.athlete.martial_art || 'Judo'} | ${d.athlete.weight_category || '-'}</div>
                    </div>
                </div>
                <div class="hero-stats">
                    <div class="hero-stat">
                        <div class="hero-stat-value">${d.rating.total_points}</div>
                        <div class="hero-stat-label">Очков</div>
                    </div>
                    <div class="hero-stat">
                        <div class="hero-stat-value">${d.rank ? '#' + d.rank : '-'}</div>
                        <div class="hero-stat-label">Место</div>
                    </div>
                    <div class="hero-stat">
                        <div class="hero-stat-value medal-display">${d.medalCounts.gold > 0 ? d.medalCounts.gold + '🥇' : ''}${d.medalCounts.silver > 0 ? ' ' + d.medalCounts.silver + '🥈' : ''}${d.medalCounts.bronze > 0 ? ' ' + d.medalCounts.bronze + '🥉' : ''}${(d.medalCounts.gold + d.medalCounts.silver + d.medalCounts.bronze) === 0 ? '-' : ''}</div>
                        <div class="hero-stat-label">Медали</div>
                    </div>
                </div>
                <div class="hero-events">
                    ${d.upcomingCompetition ? `<div class="hero-event">
                        <span class="hero-event-icon">⚔️</span>
                        <div>
                            <strong>${d.upcomingCompetition.name}</strong>
                            <div class="hero-event-meta">${formatDate(d.upcomingCompetition.competition_date)} | ${d.upcomingCompetition.weight_category || ''}</div>
                        </div>
                    </div>` : ''}
                    ${d.nextTraining ? `<div class="hero-event">
                        <span class="hero-event-icon">📅</span>
                        <div>
                            <strong>Тренировка</strong>
                            <div class="hero-event-meta">${DAY_NAMES_SHORT[d.nextTraining.day_of_week]}, ${d.nextTraining.start_time} - ${d.nextTraining.end_time}</div>
                        </div>
                    </div>` : ''}
                </div>
            </div>
        `;

        // Belt progress
        renderBeltProgress(d.beltProgress);

        // Fight stats
        renderFightStats(d.fightStats, d.winStreak);

        // Achievements
        renderAchievements(d.achievements, d.medalCounts);

        // Activity feed
        loadActivityFeed();
    } catch (err) {
        console.error('Dashboard error:', err);
        document.getElementById('dashboard-summary').innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

function renderBeltProgress(bp) {
    const el = document.getElementById('belt-progress-content');
    if (!bp || !bp.current) {
        el.innerHTML = '<p>Нет данных о поясе</p>';
        return;
    }

    const BELT_COLORS = {
        'White': '#e2e8f0', 'Yellow': '#fbbf24', 'Orange': '#fb923c',
        'Green': '#34d399', 'Blue': '#60a5fa', 'Brown': '#92400e', 'Black': '#1e293b'
    };

    const currentColor = BELT_COLORS[bp.current.name] || '#e2e8f0';
    const nextColor = bp.next ? (BELT_COLORS[bp.next.name] || '#ccc') : currentColor;

    const BELT_NAMES_RU = {
        'White': 'Белый', 'Yellow': 'Жёлтый', 'Orange': 'Оранжевый',
        'Green': 'Зелёный', 'Blue': 'Синий', 'Brown': 'Коричневый', 'Black': 'Чёрный'
    };

    if (!bp.next) {
        el.innerHTML = `<div class="belt-max">
            <div class="belt-circle" style="background:${currentColor}; ${bp.current.name === 'Black' ? 'color:#fff;' : ''}">🥋</div>
            <p style="margin-top:1rem; font-weight:600;">${BELT_NAMES_RU[bp.current.name] || bp.current.name} пояс</p>
            <p style="color:var(--text-secondary);">Максимальный уровень достигнут!</p>
        </div>`;
        return;
    }

    el.innerHTML = `
        <div class="belt-progress-bar-container">
            <div class="belt-endpoints">
                <div class="belt-endpoint">
                    <div class="belt-mini" style="background:${currentColor}"></div>
                    <span>${BELT_NAMES_RU[bp.current.name] || bp.current.name}</span>
                </div>
                <div class="belt-endpoint">
                    <div class="belt-mini" style="background:${nextColor}; ${bp.next.name === 'Black' ? 'border:2px solid #333;' : ''}"></div>
                    <span>${BELT_NAMES_RU[bp.next.name] || bp.next.name}</span>
                </div>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${bp.progress}%; background: linear-gradient(90deg, ${currentColor}, ${nextColor});"></div>
            </div>
            <div class="belt-points-info">
                <span>${bp.totalPoints} / ${bp.next.min_points} очков</span>
                <span>${bp.progress}%</span>
            </div>
            ${bp.progress >= 100 ? '<p class="belt-ready-badge">Готов к повышению! Ожидайте решения тренера.</p>' : ''}
        </div>
    `;
}

function renderFightStats(fs, winStreak) {
    const el = document.getElementById('fight-stats-content');
    if (!fs || fs.total_fights === 0) {
        el.innerHTML = '<p class="text-center" style="color:var(--text-secondary);">Нет боёв. Участвуйте в соревнованиях!</p>';
        return;
    }

    const winRate = fs.total_fights > 0 ? Math.round((fs.wins / fs.total_fights) * 100) : 0;
    const maxType = Math.max(fs.ippon_wins || 0, fs.wazari_wins || 0, fs.yuko_wins || 0, fs.shido_wins || 0, 1);

    el.innerHTML = `
        <div class="stats-overview">
            <div class="stat-circle">
                <svg viewBox="0 0 36 36" class="stat-svg">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke="#e2e8f0" stroke-width="3"/>
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke="var(--success-color)" stroke-width="3"
                          stroke-dasharray="${winRate}, 100" stroke-linecap="round"/>
                </svg>
                <div class="stat-circle-text">
                    <strong>${winRate}%</strong>
                    <span>побед</span>
                </div>
            </div>
            <div class="stat-numbers">
                <div class="stat-row"><span>Всего боёв</span><strong>${fs.total_fights}</strong></div>
                <div class="stat-row"><span>Побед</span><strong style="color:var(--success-color);">${fs.wins}</strong></div>
                <div class="stat-row"><span>Поражений</span><strong style="color:var(--danger-color);">${fs.losses}</strong></div>
                ${winStreak > 0 ? `<div class="stat-row"><span>Серия побед</span><strong style="color:var(--warning-color);">🔥 ${winStreak}</strong></div>` : ''}
            </div>
        </div>
        <div class="stat-bars">
            <h3 style="margin:1rem 0 0.5rem; font-size:0.9rem; color:var(--text-secondary);">По типу победы</h3>
            <div class="stat-bar-row"><span>Иппон</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${((fs.ippon_wins || 0) / maxType) * 100}%; background:#f59e0b;"></div></div><strong>${fs.ippon_wins || 0}</strong></div>
            <div class="stat-bar-row"><span>Вазари</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${((fs.wazari_wins || 0) / maxType) * 100}%; background:#3b82f6;"></div></div><strong>${fs.wazari_wins || 0}</strong></div>
            <div class="stat-bar-row"><span>Юко</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${((fs.yuko_wins || 0) / maxType) * 100}%; background:#10b981;"></div></div><strong>${fs.yuko_wins || 0}</strong></div>
            <div class="stat-bar-row"><span>Шидо</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${((fs.shido_wins || 0) / maxType) * 100}%; background:#ef4444;"></div></div><strong>${fs.shido_wins || 0}</strong></div>
        </div>
    `;
}

function renderAchievements(achievements, medalCounts) {
    const el = document.getElementById('achievements-content');
    const total = medalCounts.gold + medalCounts.silver + medalCounts.bronze;

    if (total === 0) {
        el.innerHTML = '<p class="text-center" style="color:var(--text-secondary);">Пока нет медалей. Участвуйте в турнирах!</p>';
        return;
    }

    const medalIcons = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const placeNames = { 1: '1 место', 2: '2 место', 3: '3 место' };

    el.innerHTML = `
        <div class="medals-summary">
            <div class="medal-count-item"><span class="medal-icon medal-gold">🥇</span><strong>${medalCounts.gold}</strong></div>
            <div class="medal-count-item"><span class="medal-icon medal-silver">🥈</span><strong>${medalCounts.silver}</strong></div>
            <div class="medal-count-item"><span class="medal-icon medal-bronze">🥉</span><strong>${medalCounts.bronze}</strong></div>
        </div>
        <div class="achievements-list">
            ${achievements.map(a => `
                <div class="achievement-item">
                    <span class="achievement-medal medal-${a.place === 1 ? 'gold' : a.place === 2 ? 'silver' : 'bronze'}">${medalIcons[a.place]}</span>
                    <div class="achievement-info">
                        <strong>${a.competition_name}</strong>
                        <span class="achievement-meta">${formatDate(a.competition_date)} | ${a.weight_category} | ${getLevelName(a.level)}</span>
                    </div>
                    <span class="achievement-place">${placeNames[a.place]}</span>
                </div>
            `).join('')}
        </div>
    `;
}

async function loadActivityFeed() {
    const el = document.getElementById('activity-feed');
    try {
        const events = await fetchAPI('/athletes/activity-feed');
        if (events.length === 0) {
            el.innerHTML = '<p class="text-center" style="color:var(--text-secondary);">Нет событий</p>';
            return;
        }

        const ICONS = {
            win: '<span class="feed-icon feed-icon-win">✓</span>',
            loss: '<span class="feed-icon feed-icon-loss">✕</span>',
            registration: '<span class="feed-icon feed-icon-reg">📋</span>',
            training: '<span class="feed-icon feed-icon-train">🏋️</span>',
            belt: '<span class="feed-icon feed-icon-belt">🥋</span>'
        };

        el.innerHTML = `<div class="feed-list">
            ${events.map(e => `
                <div class="feed-item">
                    ${ICONS[e.icon] || '<span class="feed-icon">📌</span>'}
                    <div class="feed-body">
                        <div class="feed-text">${e.text}</div>
                        <div class="feed-detail">${e.detail || ''}</div>
                        <div class="feed-date">${formatDateTime(e.date)}</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
    } catch (err) {
        el.innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

// ============= PROFILE =============

async function loadProfile() {
    const card = document.getElementById('profile-card');
    card.innerHTML = '<p class="text-center">Загрузка...</p>';
    try {
        athleteProfile = await fetchAPI('/athletes/me');
        const a = athleteProfile;
        const photoSrc = a.photo_url || '';
        const photoHtml = photoSrc
            ? `<img src="${photoSrc}" alt="Фото" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid var(--primary-color);">`
            : `<div style="width:120px; height:120px; border-radius:50%; background:#e0e0e0; display:flex; align-items:center; justify-content:center; font-size:2.5rem; color:#999; border:3px solid var(--border-color);">👤</div>`;

        card.innerHTML = `
            <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
                <div style="text-align: center;">
                    ${photoHtml}
                    <div style="margin-top: 0.75rem;">
                        <label class="btn btn-sm btn-secondary" style="cursor:pointer;">
                            Загрузить фото
                            <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="uploadPhoto(this)">
                        </label>
                    </div>
                </div>
                <div style="flex:1; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div><strong>ФИО:</strong><p>${a.first_name} ${a.last_name}</p></div>
                    <div><strong>Телефон:</strong><p>${a.phone}</p></div>
                    <div><strong>Дата рождения:</strong><p>${formatDate(a.birth_date)}</p></div>
                    <div><strong>Пол:</strong><p>${a.gender === 'M' ? 'Мужской' : 'Женский'}</p></div>
                    <div><strong>Рост:</strong><p>${a.height || '-'} см</p></div>
                    <div><strong>Вес:</strong><p>${a.weight || '-'} кг</p></div>
                    <div><strong>Весовая категория:</strong><p>${a.weight_category || '-'}</p></div>
                    <div><strong>Пояс:</strong><p class="belt-${(a.belt_level || '').toLowerCase()}">${a.belt_level || '-'}</p></div>
                    <div><strong>Филиал:</strong><p>${a.branch_name || '-'}</p></div>
                    <div><strong>Вид единоборства:</strong><p>${a.martial_art || 'Дзюдо'}</p></div>
                    <div><strong>Тренер:</strong>
                        <p><a href="#" onclick="showCoachProfile(${a.coach_id}); return false;" style="color: var(--primary-color); text-decoration: underline;">${a.coach_first_name || '-'} ${a.coach_last_name || ''}</a></p>
                    </div>
                </div>
            </div>
        `;
        loadMyRegistrations();
        loadRatingHistory();
    } catch (error) {
        card.innerHTML = '<p class="text-center">Ошибка загрузки профиля</p>';
    }
}

async function uploadPhoto(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) { showError('Максимум 5 МБ'); return; }
    const formData = new FormData();
    formData.append('photo', file);
    try {
        await fetchRaw('/athletes/photo', { method: 'POST', body: formData });
        loadProfile();
    } catch (error) { showError(error.message); }
}

async function loadMyRegistrations() {
    try { myRegistrations = await fetchAPI('/athletes/my-registrations'); }
    catch (e) { myRegistrations = []; }
}

async function loadRatingHistory() {
    const tbody = document.getElementById('rating-history-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Загрузка...</td></tr>';
    try {
        if (!athleteProfile) athleteProfile = await fetchAPI('/athletes/me');
        const history = await fetchAPI(`/ratings/athlete/${athleteProfile.id}`);
        if (history.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center">Нет данных</td></tr>'; return; }
        tbody.innerHTML = history.map(r => `<tr><td>${r.season_name}</td><td><strong>${r.total_points}</strong></td><td>${r.fights_count}</td><td>${r.wins_count}</td><td>${r.ippon_count}</td></tr>`).join('');
    } catch (error) { tbody.innerHTML = '<tr><td colspan="5" class="text-center">Ошибка</td></tr>'; }
}

// ============= COMPETITIONS (Themed Cards) =============

async function loadAvailableCompetitions() {
    const container = document.getElementById('competitions-list');
    container.innerHTML = '<p class="text-center">Загрузка...</p>';
    try {
        const competitions = await fetchAPI('/competitions');
        if (myRegistrations.length === 0) await loadMyRegistrations();
        const registeredCompIds = new Set(myRegistrations.map(r => r.competition_id));

        if (competitions.length === 0) { container.innerHTML = '<p class="text-center">Нет доступных соревнований</p>'; return; }

        const now = new Date();
        container.innerHTML = competitions.map(comp => {
            const isRegistered = registeredCompIds.has(comp.id);
            const compDate = new Date(comp.competition_date);
            const isPast = compDate < now && compDate.toDateString() !== now.toDateString();
            const isToday = compDate.toDateString() === now.toDateString();
            const daysUntil = Math.ceil((compDate - now) / (1000 * 60 * 60 * 24));

            let statusBadge = '';
            if (isPast) statusBadge = '<span class="comp-status comp-status-past">Завершено</span>';
            else if (isToday) statusBadge = '<span class="comp-status comp-status-live">Сегодня</span>';
            else if (daysUntil <= 7) statusBadge = `<span class="comp-status comp-status-soon">Через ${daysUntil} дн.</span>`;

            let actionBtn = isRegistered
                ? `<span class="comp-registered-badge">✓ Зарегистрирован</span>`
                : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); registerForCompetition(${comp.id})">Зарегистрироваться</button>`;

            return `
            <div class="comp-card" onclick="openCompetitionDetail(${comp.id})">
                <div class="comp-card-header">
                    <span class="comp-level-badge level-${comp.level}">${getLevelName(comp.level)}</span>
                    ${statusBadge}
                </div>
                <h3 class="comp-card-title">${comp.name}</h3>
                <div class="comp-card-meta">
                    <span><i class="icon">📅</i> ${formatDate(comp.competition_date)}</span>
                    <span><i class="icon">📍</i> ${comp.location || 'Не указано'}</span>
                </div>
                <div class="comp-card-footer">
                    ${actionBtn}
                    <span class="view-detail-link">Подробнее →</span>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

// ============= COMPETITION DETAIL (Select category -> bracket) =============

async function openCompetitionDetail(compId) {
    currentCompId = compId;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('competition-detail-page').classList.add('active');

    try {
        currentCompData = await fetchAPI(`/competitions/${compId}`);
        const comp = currentCompData;

        document.getElementById('comp-detail-title').textContent = comp.name;
        document.getElementById('comp-detail-info').innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:1rem;">
                <div><strong>Дата:</strong><p>${formatDate(comp.competition_date)}</p></div>
                <div><strong>Место:</strong><p>${comp.location || 'Не указано'}</p></div>
                <div><strong>Уровень:</strong><p><span class="comp-level-badge level-${comp.level}">${getLevelName(comp.level)}</span></p></div>
                <div><strong>Сезон:</strong><p>${comp.season_name || 'Вне сезона'}</p></div>
                ${comp.description ? `<div style="grid-column:1/-1;"><strong>Описание:</strong><p>${comp.description}</p></div>` : ''}
            </div>
        `;

        // Category select
        const select = document.getElementById('comp-category-select');
        select.innerHTML = '<option value="">Выберите категорию</option>';
        if (comp.categories && comp.categories.length > 0) {
            comp.categories.forEach(cat => {
                const genderLabel = cat.gender === 'M' ? 'Муж' : 'Жен';
                select.innerHTML += `<option value="${cat.id}" data-gender="${cat.gender}">${cat.weight_category} (${genderLabel})</option>`;
            });
        }

        // Load registrations
        if (myRegistrations.length === 0) await loadMyRegistrations();

        document.getElementById('comp-category-action').innerHTML = '';
        document.getElementById('comp-bracket-container').style.display = 'none';
        document.getElementById('comp-bracket-view').innerHTML = '';

    } catch (error) { showError(error.message); }
}

async function onCategorySelect() {
    const select = document.getElementById('comp-category-select');
    const categoryId = parseInt(select.value);
    const actionDiv = document.getElementById('comp-category-action');
    const bracketContainer = document.getElementById('comp-bracket-container');
    const bracketView = document.getElementById('comp-bracket-view');

    if (!categoryId) {
        actionDiv.innerHTML = '';
        bracketContainer.style.display = 'none';
        return;
    }

    // Registration status
    const isRegisteredCat = myRegistrations.some(r => r.competition_id === currentCompId && r.category_id === categoryId);
    const isRegisteredComp = myRegistrations.some(r => r.competition_id === currentCompId);
    const selectedOption = select.options[select.selectedIndex];
    const catGender = selectedOption.dataset.gender;
    const isMyGender = catGender === (athleteProfile ? athleteProfile.gender : '');

    if (isRegisteredCat) {
        actionDiv.innerHTML = '<span class="comp-registered-badge" style="display:inline-block;">✓ Вы зарегистрированы в этой категории</span>';
    } else if (isRegisteredComp) {
        actionDiv.innerHTML = '<span style="color:var(--text-secondary);">Вы уже зарегистрированы в другой категории</span>';
    } else if (isMyGender) {
        actionDiv.innerHTML = `<button class="btn btn-primary" onclick="registerForCompetitionWithCategory(${currentCompId}, ${categoryId})">Зарегистрироваться в этой категории</button>`;
    } else {
        actionDiv.innerHTML = '<span style="color:var(--text-secondary);">Эта категория не соответствует вашему полу</span>';
    }

    // Load bracket for this category
    try {
        const bracketData = await fetchAPI(`/competitions/${currentCompId}/bracket`);
        if (bracketData.categories && bracketData.categories.length > 0) {
            const catName = selectedOption.textContent;
            const matchingCat = bracketData.categories.find(c => {
                const catId = parseInt(select.value);
                // Match by category name since bracket API groups by name
                return catName.includes(c.category.trim()) || c.category.includes(catName.split(' (')[0]);
            });

            if (matchingCat && matchingCat.matches.length > 0) {
                bracketContainer.style.display = '';
                renderBracketInline(matchingCat.matches, bracketView);
            } else {
                bracketContainer.style.display = 'none';
            }
        } else {
            bracketContainer.style.display = 'none';
        }
    } catch (e) {
        bracketContainer.style.display = 'none';
    }
}

function renderBracketInline(matches, container) {
    const maxRound = Math.max(...matches.map(m => m.round_number));
    const roundNames = {};
    for (let r = 1; r <= maxRound; r++) {
        if (r === maxRound) roundNames[r] = 'Финал';
        else if (r === maxRound - 1) roundNames[r] = 'Полуфинал';
        else if (r === maxRound - 2) roundNames[r] = 'Четвертьфинал';
        else roundNames[r] = `Раунд ${r}`;
    }

    let html = '<div class="bracket-inline">';
    for (let r = 1; r <= maxRound; r++) {
        const roundMatches = matches.filter(m => m.round_number === r).sort((a, b) => a.match_number - b.match_number);
        html += `<div class="bracket-round">
            <div class="bracket-round-title">${roundNames[r]}</div>`;
        for (const m of roundMatches) {
            const a1Class = m.winner_id && m.winner_id === m.athlete1_id ? 'bracket-winner' : (m.winner_id && m.winner_id !== m.athlete1_id ? 'bracket-loser' : '');
            const a2Class = m.winner_id && m.winner_id === m.athlete2_id ? 'bracket-winner' : (m.winner_id && m.winner_id !== m.athlete2_id ? 'bracket-loser' : '');

            const a1Name = m.athlete1_name || (m.is_bye ? 'BYE' : 'TBD');
            const a2Name = m.athlete2_name || (m.is_bye ? 'BYE' : 'TBD');

            const a1Click = m.athlete1_id ? `onclick="showOpponentProfile(${m.athlete1_id})"` : '';
            const a2Click = m.athlete2_id ? `onclick="showOpponentProfile(${m.athlete2_id})"` : '';

            html += `<div class="bracket-match ${m.is_bye ? 'bracket-bye' : ''}">
                <div class="bracket-player ${a1Class}" ${a1Click}>${a1Name}${m.score1 != null && !m.is_bye ? ` <span class="bracket-score">${m.score1}</span>` : ''}</div>
                <div class="bracket-player ${a2Class}" ${a2Click}>${a2Name}${m.score2 != null && !m.is_bye ? ` <span class="bracket-score">${m.score2}</span>` : ''}</div>
                ${m.result_type ? `<div class="bracket-result-type">${m.result_type}</div>` : ''}
            </div>`;
        }
        html += '</div>';
    }

    // Champion
    const finalMatch = matches.find(m => m.round_number === maxRound);
    if (finalMatch && finalMatch.winner_id) {
        const winnerName = finalMatch.winner_id === finalMatch.athlete1_id ? finalMatch.athlete1_name : finalMatch.athlete2_name;
        html += `<div class="bracket-champion">
            <div class="bracket-champion-icon">🏆</div>
            <div class="bracket-champion-name">${winnerName}</div>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// ============= MY COMPETITIONS (Timeline) =============

async function loadMyCompetitions() {
    const container = document.getElementById('my-competitions-list');
    container.innerHTML = '<p class="text-center">Загрузка...</p>';
    try {
        if (myRegistrations.length === 0) await loadMyRegistrations();
        const allComps = await fetchAPI('/competitions');
        const registeredCompIds = new Set(myRegistrations.map(r => r.competition_id));
        const myComps = allComps.filter(c => registeredCompIds.has(c.id));

        if (myComps.length === 0) {
            container.innerHTML = '<p class="text-center">Вы не зарегистрированы ни на одно соревнование</p>';
            return;
        }

        // Sort by date
        myComps.sort((a, b) => new Date(a.competition_date) - new Date(b.competition_date));
        const now = new Date();

        // Find closest upcoming
        let closestIdx = -1;
        for (let i = 0; i < myComps.length; i++) {
            if (new Date(myComps[i].competition_date) >= now) { closestIdx = i; break; }
        }

        // Load achievements if available
        const achievements = dashboardData ? dashboardData.achievements : [];

        container.innerHTML = `<div class="timeline">
            ${myComps.map((comp, idx) => {
            const compDate = new Date(comp.competition_date);
            const isPast = compDate < now && compDate.toDateString() !== now.toDateString();
            const isClosest = idx === closestIdx;
            const myReg = myRegistrations.find(r => r.competition_id === comp.id);
            const medal = achievements.find(a => a.competition_id === comp.id);
            const medalIcon = medal ? (medal.place === 1 ? '🥇' : medal.place === 2 ? '🥈' : '🥉') : '';

            return `
                <div class="timeline-item ${isPast ? 'timeline-past' : ''} ${isClosest ? 'timeline-current' : ''}">
                    <div class="timeline-dot ${isPast ? (medal ? 'timeline-dot-medal' : 'timeline-dot-done') : isClosest ? 'timeline-dot-next' : 'timeline-dot-future'}">
                        ${medal ? medalIcon : isPast ? '✓' : isClosest ? '◉' : '○'}
                    </div>
                    <div class="timeline-content" onclick="openCompetitionDetail(${comp.id})" style="cursor:pointer;">
                        <div class="timeline-date">${formatDate(comp.competition_date)}</div>
                        <div class="timeline-title">${comp.name}</div>
                        <div class="timeline-meta">
                            <span class="comp-level-badge level-${comp.level}">${getLevelName(comp.level)}</span>
                            ${myReg ? `<span>${myReg.weight_category}</span>` : ''}
                            ${medal ? `<span class="timeline-medal">${medal.place === 1 ? '1 место' : medal.place === 2 ? '2 место' : '3 место'}</span>` : ''}
                        </div>
                        ${isClosest ? '<div class="timeline-badge-next">БЛИЖАЙШЕЕ</div>' : ''}
                    </div>
                </div>`;
        }).join('')}
        </div>`;
    } catch (error) { container.innerHTML = '<p class="text-center">Ошибка загрузки</p>'; }
}

// ============= OPPONENT PROFILE =============

async function showOpponentProfile(athleteId) {
    const content = document.getElementById('opponent-modal-content');
    content.innerHTML = '<p>Загрузка...</p>';
    document.getElementById('opponent-modal').classList.add('active');

    try {
        const opp = await fetchAPI(`/athletes/${athleteId}/public-profile`);
        const photoHtml = opp.photo_url
            ? `<img src="${opp.photo_url}" style="width:80px; height:80px; border-radius:50%; object-fit:cover;">`
            : `<div style="width:80px; height:80px; border-radius:50%; background:#e0e0e0; display:flex; align-items:center; justify-content:center; font-size:2rem; color:#999;">👤</div>`;

        const BELT_NAMES_RU = { 'White': 'Белый', 'Yellow': 'Жёлтый', 'Orange': 'Оранжевый', 'Green': 'Зелёный', 'Blue': 'Синий', 'Brown': 'Коричневый', 'Black': 'Чёрный' };

        content.innerHTML = `
            <div style="text-align:center; margin-bottom:1.5rem;">
                ${photoHtml}
                <h3 style="margin-top:0.75rem;">${opp.first_name} ${opp.last_name}</h3>
                <p style="color:var(--text-secondary);">${opp.branch_name || ''} | ${opp.martial_art || 'Judo'}</p>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; text-align:center;">
                <div class="card" style="margin:0; padding:1rem;">
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Пояс</div>
                    <div class="belt-tag belt-tag-${(opp.belt_level || 'white').toLowerCase()}" style="margin-top:0.25rem;">${BELT_NAMES_RU[opp.belt_level] || opp.belt_level || '-'}</div>
                </div>
                <div class="card" style="margin:0; padding:1rem;">
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Рейтинг</div>
                    <div style="font-size:1.5rem; font-weight:700; margin-top:0.25rem;">${opp.total_points}</div>
                </div>
                <div class="card" style="margin:0; padding:1rem;">
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Побед / Поражений</div>
                    <div style="font-size:1.2rem; font-weight:600; margin-top:0.25rem;">${opp.wins} / ${opp.losses}</div>
                </div>
                <div class="card" style="margin:0; padding:1rem;">
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Иппон</div>
                    <div style="font-size:1.2rem; font-weight:600; margin-top:0.25rem;">${opp.ippon_rate}%</div>
                </div>
            </div>
        `;
    } catch (err) { content.innerHTML = '<p>Ошибка загрузки</p>'; }
}

// ============= REGISTER FORM =============

async function registerForCompetition(competitionId) {
    try {
        let competition = await fetchAPI(`/competitions/${competitionId}`);
        if (!competition.categories || competition.categories.length === 0) {
            await fetchAPI(`/competitions/${competitionId}/auto-categories`, { method: 'POST' });
            competition = await fetchAPI(`/competitions/${competitionId}`);
        }
        if (!athleteProfile) athleteProfile = await fetchAPI('/athletes/me');

        document.getElementById('reg-competition-id').value = competitionId;
        document.getElementById('reg-comp-info').innerHTML = `<p><strong>${competition.name}</strong></p><p>Дата: ${formatDate(competition.competition_date)}</p>`;

        const categorySelect = document.getElementById('reg-category-select');
        categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
        const myCategories = competition.categories.filter(c => c.gender === athleteProfile.gender);
        if (myCategories.length === 0) { showError('Нет подходящих категорий'); return; }

        myCategories.forEach(c => { categorySelect.innerHTML += `<option value="${c.id}">${c.weight_category}</option>`; });
        if (athleteProfile.weight_category) {
            const match = myCategories.find(c => c.weight_category === athleteProfile.weight_category);
            if (match) categorySelect.value = match.id;
        }
        document.getElementById('register-modal').classList.add('active');
    } catch (error) { showError(error.message); }
}

async function registerForCompetitionWithCategory(compId, categoryId) {
    try {
        if (!athleteProfile) athleteProfile = await fetchAPI('/athletes/me');
        await fetchAPI(`/competitions/${compId}/register`, {
            method: 'POST',
            body: JSON.stringify({ athlete_id: athleteProfile.id, category_id: categoryId })
        });
        showSuccess('Вы успешно зарегистрированы!');
        await loadMyRegistrations();
        openCompetitionDetail(compId);
    } catch (error) { showError(error.message); }
}

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!athleteProfile) athleteProfile = await fetchAPI('/athletes/me');
    const data = { athlete_id: athleteProfile.id, category_id: parseInt(document.getElementById('reg-category-select').value) };
    const competitionId = document.getElementById('reg-competition-id').value;
    try {
        await fetchAPI(`/competitions/${competitionId}/register`, { method: 'POST', body: JSON.stringify(data) });
        showSuccess('Зарегистрированы!');
        closeModal('register-modal');
        await loadMyRegistrations();
        loadAvailableCompetitions();
    } catch (error) { showError(error.message); }
});

// ============= FIGHT HISTORY =============

async function loadFightHistory() {
    const container = document.getElementById('fight-history-list');
    container.innerHTML = '<p class="text-center">Загрузка...</p>';
    try {
        if (!athleteProfile) athleteProfile = await fetchAPI('/athletes/me');
        const fights = await fetchAPI('/athletes/my-sparrings');
        if (fights.length === 0) { container.innerHTML = '<p class="text-center" style="color:var(--text-secondary);">Нет записанных боёв</p>'; return; }

        container.innerHTML = fights.map(f => {
            const isA1 = f.athlete1_id === athleteProfile.id;
            const myName = isA1 ? `${f.athlete1_first_name} ${f.athlete1_last_name}` : `${f.athlete2_first_name} ${f.athlete2_last_name}`;
            const oppName = isA1 ? `${f.athlete2_first_name} ${f.athlete2_last_name}` : `${f.athlete1_first_name} ${f.athlete1_last_name}`;
            const oppId = isA1 ? f.athlete2_id : f.athlete1_id;
            const won = f.winner_id === athleteProfile.id;
            const pts = won ? (f.result_type === 'ippon' ? f.win_ippon_points : f.win_points_points) : f.loss_points;

            return `<div class="fight-card ${won ? 'fight-win' : 'fight-loss'}">
                <div class="fight-card-header">
                    <span class="fight-result-badge ${won ? 'fight-badge-win' : 'fight-badge-loss'}">${won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</span>
                    <span class="fight-comp-name">${f.competition_name}</span>
                    <span class="fight-date">${formatDate(f.competition_date)}</span>
                </div>
                <div class="fight-card-body">
                    <div class="fight-side">
                        <strong>${myName}</strong>
                        <div class="fight-score">${isA1 ? f.athlete1_score : f.athlete2_score}</div>
                    </div>
                    <div class="fight-vs">VS</div>
                    <div class="fight-side fight-side-opp" onclick="showOpponentProfile(${oppId})" style="cursor:pointer;">
                        <strong>${oppName}</strong>
                        <div class="fight-score">${isA1 ? f.athlete2_score : f.athlete1_score}</div>
                    </div>
                </div>
                <div class="fight-card-footer">
                    <span>Результат: <strong>${f.result_type}</strong></span>
                    <span>Категория: ${f.weight_category}</span>
                    <span>Очки: <strong>${pts != null ? (won ? '+' : '') + pts : '?'}</strong></span>
                </div>
            </div>`;
        }).join('');
    } catch (err) { container.innerHTML = '<p class="text-center">Ошибка загрузки</p>'; }
}

// ============= SCHEDULE & BOOKINGS =============

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

async function loadCoachSchedule() {
    const container = document.getElementById('coach-schedule-list');
    const info = document.getElementById('coach-schedule-info');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        if (!athleteProfile) athleteProfile = await fetchAPI('/athletes/me');
        if (!athleteProfile.coach_id) { container.innerHTML = '<p>Тренер не назначен</p>'; return; }
        const coach = await fetchAPI(`/coaches/${athleteProfile.coach_id}/profile`);
        info.innerHTML = `<p style="margin-bottom:1rem;"><strong>${coach.first_name} ${coach.last_name}</strong> — ${coach.specialization || 'Дзюдо'}</p>`;
        if (!coach.schedules || coach.schedules.length === 0) { container.innerHTML = '<p>Расписание пусто</p>'; return; }
        const trialBadge = !athleteProfile.trial_used ? '<span class="badge badge-active" style="margin-bottom:1rem; display:inline-block;">Первая тренировка БЕСПЛАТНО!</span><br>' : '';
        container.innerHTML = trialBadge + `<table class="table"><thead><tr><th>День</th><th>Время</th><th>Тип</th><th>Цена</th><th>Действия</th></tr></thead><tbody>` +
            coach.schedules.map(s => `<tr><td>${DAY_NAMES[s.day_of_week]}</td><td>${s.start_time} — ${s.end_time}</td><td>${s.is_paid ? 'Платная' : 'Бесплатная'}</td><td>${s.is_paid ? s.price + ' тг' : '—'}</td><td><button class="btn btn-sm btn-primary" onclick="bookTraining(${s.id})">Записаться</button></td></tr>`).join('') + '</tbody></table>';
    } catch (err) { container.innerHTML = '<p>Ошибка загрузки</p>'; }
}

async function bookTraining(scheduleId) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const bookingDate = prompt('Дата тренировки (ГГГГ-ММ-ДД):', dateStr);
    if (!bookingDate) return;
    try {
        const result = await fetchAPI('/bookings', { method: 'POST', body: JSON.stringify({ schedule_id: scheduleId, booking_date: bookingDate }) });
        showSuccess(result.is_trial ? 'Записаны на бесплатную пробную тренировку!' : result.payment_status === 'paid' ? 'Записаны! Оплата по подписке.' : 'Записаны!');
        loadMyBookings();
    } catch (err) { showError(err.message); }
}

// User Menu Dropdown
function setupUserMenu() {
    const trigger = document.getElementById('user-menu-trigger');
    const menu = document.getElementById('user-dropdown');

    if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            menu.classList.remove('active');
        });
    }
}

function closeUserMenu() {
    const menu = document.getElementById('user-dropdown');
    if (menu) menu.classList.remove('active');
}

function showError(msg) {
    alert('❌ ' + msg);
}

async function loadMyBookings() {
    const container = document.getElementById('my-bookings-list');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        const bookings = await fetchAPI('/bookings/my');
        if (bookings.length === 0) { container.innerHTML = '<p class="text-center">Нет записей</p>'; return; }
        container.innerHTML = `<table class="table"><thead><tr><th>Дата</th><th>Время</th><th>Тренер</th><th>Статус</th><th>Оплата</th><th>Действия</th></tr></thead><tbody>` +
            bookings.map(b => `<tr><td>${formatDate(b.booking_date)}</td><td>${b.start_time} — ${b.end_time}</td><td>${b.coach_first_name} ${b.coach_last_name}</td><td><span class="badge ${b.status === 'attended' ? 'badge-active' : b.status === 'cancelled' ? 'badge-inactive' : ''}">${b.status}</span></td><td>${b.is_trial ? 'Пробная' : b.payment_status}</td><td>${b.status === 'booked' ? `<button class="btn btn-sm btn-danger" onclick="cancelBooking(${b.id})">Отменить</button>` : ''}</td></tr>`).join('') + '</tbody></table>';
    } catch (err) { container.innerHTML = '<p>Ошибка загрузки</p>'; }
}

async function cancelBooking(id) {
    if (!await showConfirm('Подтверждение', 'Отменить запись?')) return;
    try { await fetchAPI(`/bookings/${id}`, { method: 'DELETE' }); loadMyBookings(); }
    catch (err) { showError(err.message); }
}

async function loadMySubscriptions() {
    const container = document.getElementById('my-subscription-info');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        const subs = await fetchAPI('/subscriptions/my');
        if (subs.length === 0) { container.innerHTML = '<p class="text-center">Нет активных подписок</p>'; return; }
        container.innerHTML = subs.map(s => `
            <div style="padding:0.75rem; border:1px solid var(--border-color); border-radius:6px; margin-bottom:0.5rem;">
                <strong>${s.coach_first_name} ${s.coach_last_name}</strong> — ${s.type}
                <br>Период: ${formatDate(s.start_date)} — ${formatDate(s.end_date)}
                ${s.type === 'per_session' ? `<br>Занятий: ${s.sessions_used}/${s.sessions_total}` : ''}
                <br>Цена: ${s.price} тг
                <span class="badge ${s.status === 'active' ? 'badge-active' : 'badge-inactive'}" style="margin-left:0.5rem;">${s.status}</span>
            </div>
        `).join('');
    } catch (err) { container.innerHTML = '<p>Ошибка загрузки</p>'; }
}

// ============= COACH PROFILE MODAL =============

async function showCoachProfile(coachId) {
    const content = document.getElementById('coach-profile-content');
    content.innerHTML = '<p>Загрузка...</p>';
    document.getElementById('coach-profile-modal').classList.add('active');
    try {
        const coach = await fetchAPI(`/coaches/${coachId}/profile`);
        let scheduleHtml = '<p>Нет расписания</p>';
        if (coach.schedules && coach.schedules.length > 0) {
            scheduleHtml = `<table class="table"><thead><tr><th>День</th><th>Время</th><th>Тип</th><th>Цена</th></tr></thead><tbody>` +
                coach.schedules.map(s => `<tr><td>${DAY_NAMES[s.day_of_week]}</td><td>${s.start_time} — ${s.end_time}</td><td>${s.is_paid ? 'Платная' : 'Бесплатная'}</td><td>${s.is_paid ? s.price + ' тг' : '—'}</td></tr>`).join('') + '</tbody></table>';
        }
        content.innerHTML = `
            <div style="margin-bottom:1.5rem;"><h3>${coach.first_name} ${coach.last_name}</h3>
                <p><strong>Дисциплина:</strong> ${coach.specialization || 'Не указана'}</p>
                <p><strong>Филиал:</strong> ${coach.branch_name || 'Не указан'}</p>
            </div><h3>Расписание</h3>${scheduleHtml}
        `;
    } catch (err) { content.innerHTML = '<p>Ошибка загрузки</p>'; }
}

// ============= UTILS =============

function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU');
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч. назад`;
    if (diff < 172800000) return 'Вчера';
    return d.toLocaleDateString('ru-RU');
}

function getLevelName(level) {
    const levels = { 'club': 'Клубное', 'city': 'Городское', 'regional': 'Региональное', 'national': 'Национальное', 'international': 'Международное' };
    return levels[level] || level;
}

window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) e.target.classList.remove('active'); });

// ================= NOTIFICATIONS =================

function toggleNotifications() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.style.display = 'none';
        badge.textContent = '0';
    }

    // Save current time as 'last read'
    localStorage.setItem('lastReadNotificationTime', new Date().toISOString());

    // Scroll to activity feed
    const feedSection = document.getElementById('activity-feed');
    if (feedSection) {
        showPage('dashboard'); // Ensure dashboard is visible
        feedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Highlight effect
        feedSection.style.transition = 'background 0.3s';
        feedSection.style.background = 'rgba(99, 102, 241, 0.1)';
        setTimeout(() => {
            feedSection.style.background = 'transparent';
        }, 1500);
    }
}

async function checkUnreadNotifications() {
    try {
        const lastRead = localStorage.getItem('lastReadNotificationTime') || new Date(0).toISOString();
        const feed = await fetchAPI('/athletes/activity-feed');

        // Count items newer than lastRead
        const newItems = feed.filter(item => new Date(item.date) > new Date(lastRead));
        // Also can filter by item.is_read if backed adds it, but time based is robust for now
        const count = newItems.length;

        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (count > 0) {
                badge.style.display = 'flex';
                badge.textContent = count > 9 ? '9+' : count;
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Error checking notifications:', e);
    }
}

// ================= NOTIFICATIONS =================

function toggleNotifications() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.style.display = 'none';
        badge.textContent = '0';
    }

    // Save current time as 'last read'
    localStorage.setItem('lastReadNotificationTime', new Date().toISOString());

    // Scroll to activity feed
    const feedSection = document.getElementById('activity-feed');
    if (feedSection) {
        showPage('dashboard'); // Ensure dashboard is visible
        feedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Highlight effect
        feedSection.style.transition = 'background 0.3s';
        feedSection.style.background = 'rgba(99, 102, 241, 0.1)';
        setTimeout(() => {
            feedSection.style.background = 'transparent';
        }, 1500);
    }
}

async function checkUnreadNotifications() {
    try {
        const lastRead = localStorage.getItem('lastReadNotificationTime') || new Date(0).toISOString();
        const feed = await fetchAPI('/athletes/activity-feed');

        // Count items newer than lastRead
        const newItems = feed.filter(item => new Date(item.date) > new Date(lastRead));
        // Also can filter by item.is_read if backed adds it, but time based is robust for now
        const count = newItems.length;

        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (count > 0) {
                badge.style.display = 'flex';
                badge.textContent = count > 9 ? '9+' : count;
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Error checking notifications:', e);
    }
}
