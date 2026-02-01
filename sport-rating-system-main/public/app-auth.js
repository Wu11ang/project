const API_URL = '/api';

let currentUser = null;
let authToken = null;
let allBranches = [];
let allCoaches = [];

// Check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
    authToken = localStorage.getItem('token');

    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    try {
        await loadCurrentUser();
        await loadReferenceData();
        setupNavigation();
        setupUserMenu(); // New dropdown init
        setupProfileForms();
        showPage('dashboard');
    } catch (error) {
        console.error('Auth error:', error);
        logout();
    }
});

// Load reference data (branches, coaches) for dropdowns
async function loadReferenceData() {
    try {
        allBranches = await fetchAPI('/branches');
        // Load all coaches from all branches
        const coaches = [];
        for (const branch of allBranches) {
            try {
                const branchCoaches = await fetchAPI(`/coaches/branch/${branch.id}`);
                coaches.push(...branchCoaches);
            } catch (e) { /* skip */ }
        }
        allCoaches = coaches;
    } catch (e) {
        console.error('Error loading reference data:', e);
    }
}

// Load current user info
async function loadCurrentUser() {
    try {
        const response = await fetchAPI('/auth/me');
        currentUser = response;

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

        if (currentUser.role !== 'admin') {
            window.location.href = currentUser.role === 'coach' ? 'coach-dashboard.html' : 'athlete-dashboard.html';
        }
    } catch (error) {
        throw new Error('Failed to load user info');
    }
}

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Get role text
function getRoleText(role) {
    const roles = {
        'admin': 'Администратор',
        'coach': 'Тренер',
        'athlete': 'Спортсмен'
    };
    return roles[role] || role;
}

// Fetch API with auth
async function fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            ...options.headers
        }
    });

    if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API error');
    }

    return response.json();
}

// Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.hasAttribute('target')) return;

            e.preventDefault();
            const page = link.dataset.page;
            if (page) {
                showPage(page);
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    });
}

function showPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.classList.add('active');

        switch (pageName) {
            case 'dashboard': loadDashboardSummary(); break;
            case 'ratings': loadRatings(); break;
            case 'athletes': loadAthletes(); break;
            case 'competitions': loadCompetitions(); break;
            case 'branches': loadBranches(); break;
            case 'seasons': loadSeasons(); break;
            case 'profile': loadProfile(); break;
        }
    }
}

async function loadDashboardSummary() {
    const seasonBadge = document.getElementById('active-season-badge');
    const topAthletesWidget = document.getElementById('top-athletes-widget');
    const recentEventsWidget = document.getElementById('recent-events-widget');

    try {
        const data = await fetchAPI('/admin/dashboard-stats');

        // Render Season Badge
        seasonBadge.textContent = data.activeSeason ? `Активный сезон: ${data.activeSeason.name}` : 'Нет активного сезона';

        // Update Stats Values
        document.getElementById('stats-athletes').textContent = data.counts.athletes;
        document.getElementById('stats-competitions').textContent = data.counts.competitions;
        document.getElementById('stats-branches').textContent = data.counts.branches;

        document.getElementById('stats-points').textContent = data.metrics.total_points;
        document.getElementById('stats-wins').textContent = data.metrics.total_wins;
        document.getElementById('stats-top-branch').textContent = data.metrics.top_branch;

        // Setup Drill-downs (Clickable cards)
        document.querySelectorAll('.stat-card.clickable').forEach(card => {
            card.onclick = () => {
                const page = card.dataset.page;
                showPage(page);

                // Update nav active state
                document.querySelectorAll('.nav-link').forEach(l => {
                    l.classList.toggle('active', l.dataset.page === page);
                });
            };
        });

        // Render Top Athletes Widget
        if (data.topAthletes.length === 0) {
            topAthletesWidget.innerHTML = '<p class="text-center">Нет данных</p>';
        } else {
            topAthletesWidget.innerHTML = `
                <div class="dashboard-widget-list">
                    ${data.topAthletes.map(a => `
                        <div class="widget-item">
                            <div class="info">
                                <span class="main-text">${a.first_name} ${a.last_name}</span>
                                <span class="sub-text">${a.branch_name || '-'}</span>
                            </div>
                            <span class="action-value">${a.total_points} очков</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Render Recent Events Widget
        if (data.recentCompetitions.length === 0) {
            recentEventsWidget.innerHTML = '<p class="text-center">Нет данных</p>';
        } else {
            recentEventsWidget.innerHTML = `
                <div class="dashboard-widget-list">
                    ${data.recentCompetitions.map(c => `
                        <div class="widget-item">
                            <div class="info">
                                <span class="main-text">${c.name}</span>
                                <span class="sub-text">${formatDate(c.competition_date)} • ${c.branch_name || 'Глобальный'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// ============= RATINGS =============

async function loadRatings() {
    const tbody = document.getElementById('ratings-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Загрузка...</td></tr>';

    try {
        const ratings = await fetchAPI('/ratings');

        if (ratings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Нет данных</td></tr>';
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
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editRating(${rating.athlete_id}, '${rating.first_name} ${rating.last_name}', ${rating.total_points}, ${rating.fights_count}, ${rating.wins_count}, ${rating.ippon_count})">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRating(${rating.athlete_id}, '${rating.first_name} ${rating.last_name}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading ratings:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Ошибка загрузки</td></tr>';
    }
}

function editRating(athleteId, name, points, fights, wins, ippon) {
    document.getElementById('rating-athlete-id').value = athleteId;
    document.getElementById('rating-athlete-name').value = name;
    document.getElementById('rating-points').value = points;
    document.getElementById('rating-fights').value = fights;
    document.getElementById('rating-wins').value = wins;
    document.getElementById('rating-ippon').value = ippon;
    openModal('rating-modal');
}

async function submitRatingEdit(e) {
    e.preventDefault();
    const athleteId = document.getElementById('rating-athlete-id').value;
    const data = {
        total_points: parseInt(document.getElementById('rating-points').value),
        fights_count: parseInt(document.getElementById('rating-fights').value),
        wins_count: parseInt(document.getElementById('rating-wins').value),
        ippon_count: parseInt(document.getElementById('rating-ippon').value)
    };
    try {
        await fetchAPI(`/admin/ratings/${athleteId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        closeModal('rating-modal');
        loadRatings();
    } catch (error) {
        showError(error.message);
    }
}

async function deleteRating(athleteId, name) {
    if (!await showConfirm('Подтверждение', `Удалить рейтинг спортсмена "${name}"?`)) return;
    try {
        await fetchAPI(`/admin/ratings/${athleteId}`, { method: 'DELETE' });
        loadRatings();
    } catch (error) {
        showError(error.message);
    }
}

// ============= ATHLETES =============

async function loadAthletes() {
    const tbody = document.getElementById('athletes-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Загрузка...</td></tr>';

    try {
        const athletes = await fetchAPI('/athletes');

        if (athletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = athletes.map(athlete => {
            const isPending = athlete.approval_status === 'pending';
            const statusClass = isPending ? 'status-pending' : 'status-approved';
            const statusText = isPending ? 'Ожидание' : 'Одобрен';

            return `
            <tr>
                <td>${athlete.first_name} ${athlete.last_name}</td>
                <td>${athlete.phone || '-'}</td>
                <td>${athlete.branch_name || '-'}</td>
                <td>${athlete.coach_first_name ? (athlete.coach_first_name + ' ' + athlete.coach_last_name) : '-'}</td>
                <td>${athlete.weight || '-'}</td>
                <td>${athlete.weight_category || '-'}</td>
                <td class="belt-${athlete.belt_level?.toLowerCase()}">${athlete.belt_level || '-'}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div style="display:flex; gap:0.25rem;">
                        ${isPending ? `
                            <button class="btn btn-sm btn-success" onclick="approveAthlete(${athlete.id})" title="Одобрить">✓</button>
                            <button class="btn btn-sm btn-danger" onclick="rejectAthlete(${athlete.id})" title="Отклонить">✕</button>
                        ` : ''}
                        <button class="btn btn-sm btn-primary" onclick="editAthlete(${athlete.id})" title="Редактировать">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteAthlete(${athlete.id}, '${athlete.first_name} ${athlete.last_name}')" title="Удалить">🗑️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error('Error loading athletes:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Ошибка загрузки</td></tr>';
    }
}

async function approveAthlete(athleteId) {
    if (!await showConfirm('Подтверждение', 'Одобрить спортсмена?')) return;
    try {
        await fetch(`${API_URL}/coaches/approve-athlete/${athleteId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ status: 'approved' })
        });
        loadAthletes();
    } catch (e) { showError(e.message); }
}

async function rejectAthlete(athleteId) {
    if (!await showConfirm('Подтверждение', 'Отклонить заявку?')) return;
    try {
        await fetch(`${API_URL}/coaches/approve-athlete/${athleteId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ status: 'rejected' })
        });
        loadAthletes();
    } catch (e) { showError(e.message); }
}

async function editAthlete(athleteId) {
    try {
        const athletes = await fetchAPI('/athletes');
        const athlete = athletes.find(a => a.id === athleteId);
        if (!athlete) { showError('Спортсмен не найден'); return; }

        document.getElementById('athlete-edit-id').value = athlete.id;
        document.getElementById('athlete-first-name').value = athlete.first_name || '';
        document.getElementById('athlete-last-name').value = athlete.last_name || '';
        document.getElementById('athlete-phone').value = athlete.phone || '';
        document.getElementById('athlete-gender').value = athlete.gender || 'M';
        document.getElementById('athlete-birth-date').value = athlete.birth_date || '';
        document.getElementById('athlete-weight').value = athlete.weight || '';
        document.getElementById('athlete-height').value = athlete.height || '';
        document.getElementById('athlete-belt').value = athlete.belt_level || 'Белый';
        document.getElementById('athlete-martial-art').value = athlete.martial_art || 'Judo';

        // Populate branch select
        const branchSelect = document.getElementById('athlete-branch-select');
        branchSelect.innerHTML = '<option value="">Не указан</option>' +
            allBranches.map(b => `<option value="${b.id}" ${b.id === athlete.branch_id ? 'selected' : ''}>${b.name}</option>`).join('');

        // Populate coach select
        const coachSelect = document.getElementById('athlete-coach-select');
        coachSelect.innerHTML = '<option value="">Не указан</option>' +
            allCoaches.map(c => `<option value="${c.id}" ${c.id === athlete.coach_id ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`).join('');

        openModal('athlete-modal');
    } catch (error) {
        showError(error.message);
    }
}

async function submitAthleteEdit(e) {
    e.preventDefault();
    const athleteId = document.getElementById('athlete-edit-id').value;
    const data = {
        first_name: document.getElementById('athlete-first-name').value,
        last_name: document.getElementById('athlete-last-name').value,
        phone: document.getElementById('athlete-phone').value,
        gender: document.getElementById('athlete-gender').value,
        birth_date: document.getElementById('athlete-birth-date').value,
        weight: parseFloat(document.getElementById('athlete-weight').value) || null,
        height: parseFloat(document.getElementById('athlete-height').value) || null,
        belt_level: document.getElementById('athlete-belt').value,
        branch_id: document.getElementById('athlete-branch-select').value || null,
        coach_id: document.getElementById('athlete-coach-select').value || null,
        martial_art: document.getElementById('athlete-martial-art').value
    };
    try {
        await fetchAPI(`/admin/athletes/${athleteId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        closeModal('athlete-modal');
        loadAthletes();
    } catch (error) {
        showError(error.message);
    }
}

async function deleteAthlete(athleteId, name) {
    if (!await showConfirm('Подтверждение', `Удалить спортсмена "${name}"? Все данные (рейтинг, регистрации, подписки) будут удалены.`)) return;
    try {
        await fetchAPI(`/admin/athletes/${athleteId}`, { method: 'DELETE' });
        loadAthletes();
    } catch (error) {
        showError(error.message);
    }
}

// ============= COMPETITIONS =============

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
            <div class="competition-card">
                <span class="level level-${comp.level}">${getLevelName(comp.level)}</span>
                <h3>${comp.name}</h3>
                <div class="meta">
                    <span class="icon">📅</span>
                    <span>${formatDate(comp.competition_date)}</span>
                </div>
                <div class="meta">
                    <span class="icon">📍</span>
                    <span>${comp.location || 'Не указано'}</span>
                </div>
                <div class="meta">
                    <span class="icon">🏆</span>
                    <span>${comp.season_name || 'Вне сезона'}</span>
                </div>
                <div style="margin-top: 1.25rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-primary" style="flex:1" onclick="viewCompetition(${comp.id})">Подробнее</button>
                    <button class="btn btn-sm btn-secondary" onclick="editCompetition(${comp.id})">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCompetition(${comp.id}, '${comp.name.replace(/'/g, "\\'")}')">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading competitions:', error);
        container.innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

async function viewCompetition(id) {
    try {
        const comp = await fetchAPI(`/competitions/${id}`);
        document.getElementById('comp-view-title').textContent = comp.name;

        let html = `
            <div class="modal-detail-grid">
                <div class="detail-row">
                    <span class="detail-label">📅 Дата</span>
                    <span class="detail-value">${formatDate(comp.competition_date)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">📍 Место</span>
                    <span class="detail-value">${comp.location || 'Не указано'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">🚀 Уровень</span>
                    <span class="detail-value">${getLevelName(comp.level)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">🏆 Сезон</span>
                    <span class="detail-value">${comp.season_name || 'Вне сезона'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">🏢 Филиал</span>
                    <span class="detail-value">${comp.branch_name || 'Не указан'}</span>
                </div>
                ${comp.description ? `
                <div class="detail-row full-width">
                    <span class="detail-label">📝 Описание</span>
                    <span class="detail-value">${comp.description}</span>
                </div>` : ''}
            </div>
        `;

        if (comp.categories && comp.categories.length > 0) {
            html += '<h3 style="margin-top:1rem;">Категории</h3><ul>';
            comp.categories.forEach(cat => {
                html += `<li>${cat.weight_category} (${cat.gender === 'M' ? 'М' : 'Ж'})</li>`;
            });
            html += '</ul>';
        }

        // Link to bracket
        html += `<p style="margin-top:1rem;"><a href="bracket.html?competition=${id}" target="_blank" class="btn btn-sm btn-primary">Турнирная сетка</a></p>`;

        document.getElementById('comp-view-body').innerHTML = html;
        document.getElementById('comp-view-edit-btn').onclick = () => { closeModal('competition-view-modal'); editCompetition(id); };
        document.getElementById('comp-view-delete-btn').onclick = () => { closeModal('competition-view-modal'); deleteCompetition(id, comp.name); };
        openModal('competition-view-modal');
    } catch (error) {
        showError(error.message);
    }
}

async function editCompetition(id) {
    try {
        const comp = await fetchAPI(`/competitions/${id}`);
        const [seasons, branches] = await Promise.all([
            fetchAPI('/seasons'),
            fetchAPI('/branches')
        ]);

        document.getElementById('competition-modal-title').textContent = 'Редактировать соревнование';
        document.getElementById('competition-submit-btn').textContent = 'Сохранить';
        document.getElementById('competition-edit-id').value = id;
        document.getElementById('comp-name').value = comp.name || '';
        document.getElementById('comp-date').value = comp.competition_date || '';
        document.getElementById('comp-location').value = comp.location || '';
        document.getElementById('comp-level').value = comp.level || 'club';
        document.getElementById('comp-description').value = comp.description || '';

        const seasonSelect = document.getElementById('competition-season-select');
        seasonSelect.innerHTML = '<option value="">Вне сезона</option>' +
            seasons.map(s => `<option value="${s.id}" ${s.id === comp.season_id ? 'selected' : ''}>${s.name}</option>`).join('');

        const branchSelect = document.getElementById('competition-branch-select');
        branchSelect.innerHTML = '<option value="">Не указан</option>' +
            branches.map(b => `<option value="${b.id}" ${b.id === comp.branch_id ? 'selected' : ''}>${b.name}</option>`).join('');

        // Hide categories for edit mode (categories are managed separately)
        document.getElementById('comp-categories-group').style.display = 'none';

        openModal('competition-modal');
    } catch (error) {
        showError(error.message);
    }
}

async function deleteCompetition(id, name) {
    if (!await showConfirm('Подтверждение', `Удалить соревнование "${name}"? Все категории, регистрации и сетки будут удалены.`)) return;
    try {
        await fetchAPI(`/competitions/${id}`, { method: 'DELETE' });
        loadCompetitions();
    } catch (error) {
        showError(error.message);
    }
}

// ============= BRANCHES =============

async function loadBranches() {
    const tbody = document.getElementById('branches-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Загрузка...</td></tr>';

    try {
        const branches = await fetchAPI('/branches');

        if (branches.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = branches.map(branch => `
            <tr>
                <td>${branch.name}</td>
                <td>${branch.city || '-'}</td>
                <td>${branch.address || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" style="background: var(--brand-primary);" onclick="viewBranchUsers(${branch.id}, '${(branch.name || '').replace(/'/g, "\\'")}')" title="Просмотр пользователей">🔍</button>
                    <button class="btn btn-sm btn-primary" onclick="editBranch(${branch.id}, '${(branch.name || '').replace(/'/g, "\\'")}', '${(branch.city || '').replace(/'/g, "\\'")}', '${(branch.address || '').replace(/'/g, "\\'")}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBranch(${branch.id}, '${(branch.name || '').replace(/'/g, "\\'")}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading branches:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Ошибка загрузки</td></tr>';
    }
}

function editBranch(id, name, city, address) {
    document.getElementById('branch-modal-title').textContent = 'Редактировать филиал';
    document.getElementById('branch-submit-btn').textContent = 'Сохранить';
    document.getElementById('branch-edit-id').value = id;
    document.getElementById('branch-name').value = name;
    document.getElementById('branch-city').value = city;
    document.getElementById('branch-address').value = address;
    openModal('branch-modal');
}

async function deleteBranch(id, name) {
    if (!await showConfirm('Подтверждение', `Удалить филиал "${name}"?`)) return;
    try {
        await fetchAPI(`/branches/${id}`, { method: 'DELETE' });
        loadBranches();
    } catch (error) {
        showError(error.message);
    }
}

async function viewBranchUsers(branchId, branchName) {
    document.getElementById('branch-users-title').textContent = `Пользователи филиала: ${branchName}`;
    document.getElementById('branch-coaches-tbody').innerHTML = '<tr><td colspan="3" class="text-center">Загрузка...</td></tr>';
    document.getElementById('branch-athletes-tbody').innerHTML = '<tr><td colspan="4" class="text-center">Загрузка...</td></tr>';

    openModal('branch-users-modal');

    try {
        const data = await fetchAPI(`/branches/${branchId}/users`);

        // Render Coaches
        const coachesTbody = document.getElementById('branch-coaches-tbody');
        if (data.coaches.length === 0) {
            coachesTbody.innerHTML = '<tr><td colspan="3" class="text-center">Нет тренеров</td></tr>';
        } else {
            coachesTbody.innerHTML = data.coaches.map(c => `
                <tr>
                    <td><strong>${c.first_name} ${c.last_name}</strong></td>
                    <td>${c.specialization || '-'}</td>
                    <td>${c.phone || '-'}</td>
                </tr>
            `).join('');
        }

        // Render Athletes
        const athletesTbody = document.getElementById('branch-athletes-tbody');
        if (data.athletes.length === 0) {
            athletesTbody.innerHTML = '<tr><td colspan="4" class="text-center">Нет спортсменов</td></tr>';
        } else {
            athletesTbody.innerHTML = data.athletes.map(a => `
                <tr>
                    <td><strong>${a.first_name} ${a.last_name}</strong></td>
                    <td><span class="badge">${a.belt_level || 'Белый'}</span></td>
                    <td>${a.weight_category || '-'}</td>
                    <td>${a.phone || '-'}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading branch users:', error);
        alert('Ошибка при загрузке пользователей филиала');
    }
}

// ============= SEASONS =============

async function loadSeasons() {
    const tbody = document.getElementById('seasons-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Загрузка...</td></tr>';

    try {
        const seasons = await fetchAPI('/seasons');

        if (seasons.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Нет данных</td></tr>';
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
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editSeason(${season.id}, '${(season.name || '').replace(/'/g, "\\'")}', '${season.start_date || ''}', '${season.end_date || ''}', ${season.is_active ? 1 : 0})">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSeason(${season.id}, '${(season.name || '').replace(/'/g, "\\'")}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading seasons:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Ошибка загрузки</td></tr>';
    }
}

function editSeason(id, name, startDate, endDate, isActive) {
    document.getElementById('season-modal-title').textContent = 'Редактировать сезон';
    document.getElementById('season-submit-btn').textContent = 'Сохранить';
    document.getElementById('season-edit-id').value = id;
    document.getElementById('season-name').value = name;
    document.getElementById('season-start-date').value = startDate;
    document.getElementById('season-end-date').value = endDate;
    document.getElementById('season-is-active').checked = !!isActive;
    openModal('season-modal');
}

async function deleteSeason(id, name) {
    if (!await showConfirm('Подтверждение', `Удалить сезон "${name}"?`)) return;
    try {
        await fetchAPI(`/seasons/${id}`, { method: 'DELETE' });
        loadSeasons();
    } catch (error) {
        showError(error.message);
    }
}

// ============= SUBMIT HANDLERS =============

async function submitBranch(e) {
    e.preventDefault();
    const editId = document.getElementById('branch-edit-id').value;
    const data = {
        name: document.getElementById('branch-name').value,
        city: document.getElementById('branch-city').value,
        address: document.getElementById('branch-address').value
    };
    try {
        if (editId) {
            await fetchAPI(`/branches/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
            await fetchAPI('/branches', { method: 'POST', body: JSON.stringify(data) });
        }
        closeModal('branch-modal');
        loadBranches();
    } catch (error) {
        showError(error.message);
    }
}

async function submitSeason(e) {
    e.preventDefault();
    const editId = document.getElementById('season-edit-id').value;
    const data = {
        name: document.getElementById('season-name').value,
        start_date: document.getElementById('season-start-date').value,
        end_date: document.getElementById('season-end-date').value,
        is_active: document.getElementById('season-is-active').checked
    };
    try {
        if (editId) {
            await fetchAPI(`/seasons/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
            await fetchAPI('/seasons', { method: 'POST', body: JSON.stringify(data) });
        }
        closeModal('season-modal');
        loadSeasons();
    } catch (error) {
        showError(error.message);
    }
}

async function submitCompetition(e) {
    e.preventDefault();
    const editId = document.getElementById('competition-edit-id').value;

    if (editId) {
        // Edit mode
        const data = {
            name: document.getElementById('comp-name').value,
            competition_date: document.getElementById('comp-date').value,
            location: document.getElementById('comp-location').value,
            level: document.getElementById('comp-level').value,
            season_id: document.getElementById('competition-season-select').value || null,
            branch_id: document.getElementById('competition-branch-select').value || null,
            description: document.getElementById('comp-description').value
        };
        try {
            await fetchAPI(`/competitions/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
            closeModal('competition-modal');
            loadCompetitions();
        } catch (error) {
            showError(error.message);
        }
    } else {
        // Create mode
        const categories = getAdminCategories();
        const data = {
            name: document.getElementById('comp-name').value,
            competition_date: document.getElementById('comp-date').value,
            location: document.getElementById('comp-location').value,
            level: document.getElementById('comp-level').value,
            season_id: document.getElementById('competition-season-select').value || null,
            branch_id: document.getElementById('competition-branch-select').value || null,
            description: document.getElementById('comp-description').value,
            categories: categories
        };
        try {
            await fetchAPI('/competitions', { method: 'POST', body: JSON.stringify(data) });
            closeModal('competition-modal');
            loadCompetitions();
        } catch (error) {
            showError(error.message);
        }
    }
}

// ============= UTILITY =============

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

// Modal management
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
    const form = modal.querySelector('form');
    if (form) form.reset();

    // Reset edit state for modals with edit/create dual mode
    if (modalId === 'branch-modal') {
        document.getElementById('branch-edit-id').value = '';
        document.getElementById('branch-modal-title').textContent = 'Новый филиал';
        document.getElementById('branch-submit-btn').textContent = 'Создать';
    }
    if (modalId === 'season-modal') {
        document.getElementById('season-edit-id').value = '';
        document.getElementById('season-modal-title').textContent = 'Новый сезон';
        document.getElementById('season-submit-btn').textContent = 'Создать';
    }
    if (modalId === 'competition-modal') {
        document.getElementById('competition-edit-id').value = '';
        document.getElementById('competition-modal-title').textContent = 'Новое соревнование';
        document.getElementById('competition-submit-btn').textContent = 'Создать';
        document.getElementById('comp-categories-group').style.display = '';
    }
}

// Category rows for competition creation
let adminCategoryRowCount = 0;

function addAdminCategoryRow() {
    adminCategoryRowCount++;
    const container = document.getElementById('admin-categories-list');
    const row = document.createElement('div');
    row.id = `admin-cat-row-${adminCategoryRowCount}`;
    row.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;';
    row.innerHTML = `
        <select class="select cat-weight" style="flex:2;" required>
            <option value="">Категория</option>
            <option value="50 кг">50 кг</option>
            <option value="55 кг">55 кг</option>
            <option value="60 кг">60 кг</option>
            <option value="66 кг">66 кг</option>
            <option value="73 кг">73 кг</option>
            <option value="81 кг">81 кг</option>
            <option value="90 кг">90 кг</option>
            <option value="100 кг">100 кг</option>
            <option value="+100 кг">+100 кг</option>
            <option value="40 кг">40 кг</option>
            <option value="44 кг">44 кг</option>
            <option value="48 кг">48 кг</option>
            <option value="52 кг">52 кг</option>
            <option value="57 кг">57 кг</option>
            <option value="63 кг">63 кг</option>
            <option value="70 кг">70 кг</option>
            <option value="78 кг">78 кг</option>
            <option value="+78 кг">+78 кг</option>
        </select>
        <select class="select cat-gender" style="flex:1;" required>
            <option value="M">М</option>
            <option value="F">Ж</option>
        </select>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeAdminCategoryRow(${adminCategoryRowCount})">✕</button>
    `;
    container.appendChild(row);
}

function removeAdminCategoryRow(id) {
    const row = document.getElementById(`admin-cat-row-${id}`);
    if (row) row.remove();
}

function getAdminCategories() {
    const container = document.getElementById('admin-categories-list');
    const rows = container.querySelectorAll('[id^="admin-cat-row-"]');
    const categories = [];
    rows.forEach(row => {
        const weight = row.querySelector('.cat-weight').value;
        const gender = row.querySelector('.cat-gender').value;
        if (weight && gender) {
            categories.push({ weight_category: weight, gender: gender });
        }
    });
    return categories;
}

// Open competition modal for creating new competition
async function openCompetitionModal() {
    try {
        const [seasons, branches] = await Promise.all([
            fetchAPI('/seasons'),
            fetchAPI('/branches')
        ]);

        const seasonSelect = document.getElementById('competition-season-select');
        seasonSelect.innerHTML = '<option value="">Вне сезона</option>' +
            seasons.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        const branchSelect = document.getElementById('competition-branch-select');
        branchSelect.innerHTML = '<option value="">Не указан</option>' +
            branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    } catch (error) {
        console.error('Error loading modal data:', error);
    }

    // Reset to create mode
    document.getElementById('competition-edit-id').value = '';
    document.getElementById('competition-modal-title').textContent = 'Новое соревнование';
    document.getElementById('competition-submit-btn').textContent = 'Создать';
    document.getElementById('comp-categories-group').style.display = '';
    document.getElementById('admin-categories-list').innerHTML = '';
    adminCategoryRowCount = 0;

    openModal('competition-modal');
}

// ============= PROFILE MANAGEMENT =============

function setupProfileForms() {
    const infoForm = document.getElementById('profile-info-form');
    const passForm = document.getElementById('profile-password-form');
    const photoInput = document.getElementById('profile-photo-input');

    if (infoForm) infoForm.addEventListener('submit', handleUpdateProfile);
    if (passForm) passForm.addEventListener('submit', handleChangePassword);
    if (photoInput) photoInput.addEventListener('change', handlePhotoUpload);
}

async function loadProfile() {
    try {
        await loadCurrentUser(); // Refresh data

        document.getElementById('profile-first-name').value = currentUser.first_name || '';
        document.getElementById('profile-last-name').value = currentUser.last_name || '';
        document.getElementById('profile-phone').value = currentUser.phone || '';
        document.getElementById('profile-full-name').textContent = `${currentUser.first_name} ${currentUser.last_name}`;

        const photoDisplay = document.getElementById('profile-photo-display');
        if (currentUser.photo_url) {
            photoDisplay.src = currentUser.photo_url;
        } else {
            photoDisplay.src = '/placeholder-avatar.png';
        }
    } catch (err) {
        showError('Ошибка загрузки профиля');
    }
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    const data = {
        first_name: document.getElementById('profile-first-name').value,
        last_name: document.getElementById('profile-last-name').value,
        phone: document.getElementById('profile-phone').value
    };

    try {
        await fetchAPI('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });
        showSuccess('Профиль обновлен!');
        loadProfile();
    } catch (err) { showError(err.message); }
}

async function handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;

    if (newPassword !== confirmPassword) {
        return showError('Пароли не совпадают');
    }

    try {
        await fetchAPI('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });
        showSuccess('Пароль успешно изменен!');
        e.target.reset();
    } catch (err) { showError(err.message); }
}

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file);

    try {
        const response = await fetch(`${API_URL}/auth/profile-photo`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });

        if (!response.ok) throw new Error('Ошибка при загрузке фото');

        const result = await response.json();
        showSuccess('Фото обновлено!');
        loadProfile();
    } catch (err) { showError(err.message); }
}

function showSuccess(msg) {
    alert('✅ ' + msg);
}

function showError(msg) {
    alert('❌ ' + msg);
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
