const API_URL = '/api';

let currentUser = null;
let authToken = null;
let myAthletes = [];
let currentCompetition = null;
let competitionRegistrations = [];
let showOnlyMyBranch = true;

document.addEventListener('DOMContentLoaded', async () => {
    authToken = localStorage.getItem('token');

    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    try {
        await loadCurrentUser();
        setupNavigation();
        setupForms();
        setupUserMenu();
        showPage('dashboard');
    } catch (error) {
        console.error('Auth error:', error);
        logout();
    }
});

async function loadDashboardStats() {
    const statsAthletes = document.getElementById('stats-my-athletes');
    const statsPending = document.getElementById('stats-pending');
    const statsPoints = document.getElementById('stats-total-points');
    const upcomingWidget = document.getElementById('upcoming-competitions-widget');
    const topStudentsWidget = document.getElementById('top-students-widget');

    try {
        // We'll reuse existing endpoints or build a quick aggregation
        const athletes = await fetchAPI('/coaches/my-athletes');
        const pending = await fetchAPI('/coaches/pending-athletes');
        const ratings = await fetchAPI('/ratings');

        // Filter ratings for coach's athletes only
        const myAthleteIds = new Set(athletes.map(a => a.id));
        const myRatings = ratings.filter(r => myAthleteIds.has(r.athlete_id))
            .sort((a, b) => b.total_points - a.total_points);

        const totalPoints = myRatings.reduce((sum, r) => sum + r.total_points, 0);

        statsAthletes.textContent = athletes.length;
        statsPending.textContent = pending.length;
        statsPoints.textContent = totalPoints;
        document.getElementById('pending-count').textContent = pending.length;

        // Render upcoming
        const comps = await fetchAPI('/competitions');
        const upcoming = comps.slice(0, 3);
        upcomingWidget.innerHTML = upcoming.length ? `
            <div class="dashboard-widget-list">
                ${upcoming.map(c => `
                    <div class="widget-item">
                        <div class="info">
                            <span class="main-text">${c.name}</span>
                            <span class="sub-text">${formatDate(c.competition_date)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : '<p class="text-center">Нет событий</p>';

        // Render top students
        topStudentsWidget.innerHTML = myRatings.length ? `
            <div class="dashboard-widget-list">
                ${myRatings.slice(0, 5).map(r => `
                    <div class="widget-item">
                        <div class="info">
                            <span class="main-text">${r.first_name} ${r.last_name}</span>
                            <span class="sub-text">Место в рейтинге: ${ratings.indexOf(r) + 1}</span>
                        </div>
                        <span class="action-value">${r.total_points} очков</span>
                    </div>
                `).join('')}
            </div>
        ` : '<p class="text-center">Нет данных</p>';

    } catch (e) { console.error(e); }

    // Load Activity Feed
    loadCoachActivityFeed();
}

async function loadCoachActivityFeed() {
    const container = document.getElementById('activity-feed-widget');
    try {
        const feed = await fetchAPI('/coaches/activity-feed');
        if (feed.length === 0) {
            container.innerHTML = '<p class="text-center" style="color:var(--text-secondary);">Нет новых событий</p>';
            return;
        }

        const ICONS = {
            users: '<span style="font-size:1.2rem;">👥</span>',
            medal: '<span style="font-size:1.2rem;">🏅</span>',
            win: '<span style="font-size:1.2rem;">⚔️</span>',
            belt: '<span style="font-size:1.2rem;">🥋</span>'
        };

        container.innerHTML = `<div class="dashboard-widget-list">
            ${feed.map(item => `
                <div class="widget-item" style="align-items: flex-start;">
                    ${ICONS[item.icon] || '<span>📌</span>'}
                    <div class="info">
                        <span class="main-text">${item.title || item.text}</span>
                        <span class="sub-text">${item.message || item.detail}</span>
                        <span class="sub-text" style="font-size:0.7rem; opacity:0.6;">${formatDate(item.time || item.date)}</span>
                    </div>
                </div>
            `).join('')}
        </div>`;
    } catch (e) {
        container.innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

async function loadCurrentUser() {
    const response = await fetchAPI('/auth/me');
    currentUser = response;
    currentUser.branch_id = currentUser.coach_profile ? currentUser.coach_profile.branch_id : null;

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

    if (currentUser.role !== 'coach') {
        window.location.href = currentUser.role === 'admin' ? 'index.html' : 'athlete-dashboard.html';
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

function openBranchPage() {
    const branchId = currentUser ? currentUser.branch_id : null;
    if (branchId) {
        window.open('branch.html?id=' + branchId, '_blank');
    } else {
        showError('Филиал не привязан к вашему профилю');
    }
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

                // Close mobile menu if open
                document.querySelector('.nav-menu').classList.remove('active');
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
    }

    // Page specific loads
    switch (pageName) {
        case 'dashboard':
            loadDashboardStats();
            break;
        case 'my-athletes':
            loadMyAthletes();
            break;
        case 'pending':
            loadPendingAthletes();
            break;
        case 'competitions':
            loadCompetitions();
            break;
        case 'ratings':
            loadRatingsSeasons();
            loadRatings();
            break;
        case 'schedule':
            loadSchedule();
            loadBookings();
            loadSubscriptions();
            break;
        case 'branch-athletes':
            loadBranchAthletes();
            break;
        case 'profile':
            loadProfile();
            break;
        case 'ai':
            initAI();
            break;
    }
}

function initAI() {
    const messages = document.getElementById('ai-chat-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
}

// My Athletes
async function loadMyAthletes() {
    const tbody = document.getElementById('athletes-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Загрузка...</td></tr>';

    try {
        myAthletes = await fetchAPI('/coaches/my-athletes');

        if (myAthletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">У вас пока нет спортсменов</td></tr>';
            return;
        }

        // Check belt eligible
        let eligibleMap = {};
        try {
            const eligible = await checkBeltEligible();
            eligible.forEach(e => { eligibleMap[e.id] = e; });
        } catch (e) { }

        tbody.innerHTML = myAthletes.map(athlete => {
            const elig = eligibleMap[athlete.id];
            return `<tr>
                <td>${athlete.first_name} ${athlete.last_name}</td>
                <td>${athlete.gender === 'M' ? 'М' : 'Ж'}</td>
                <td>${athlete.weight || '-'} кг</td>
                <td>${athlete.height || '-'} см</td>
                <td>${athlete.weight_category || '-'}</td>
                <td class="belt-${athlete.belt_level?.toLowerCase()}">${athlete.belt_level || '-'}
                    ${elig ? `<br><button class="btn btn-sm btn-success" onclick="promoteBelt(${athlete.id}, '${elig.next_belt_name}')" style="margin-top:4px;">↑ ${elig.next_belt_name}</button>` : ''}
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAthlete(${athlete.id})">Редактировать</button>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error('Error loading athletes:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Ошибка загрузки</td></tr>';
    }
}

function editAthlete(athleteId) {
    const athlete = myAthletes.find(a => a.id === athleteId);
    if (!athlete) return;

    document.getElementById('edit-athlete-id').value = athlete.id;
    document.getElementById('edit-weight').value = athlete.weight || '';
    document.getElementById('edit-height').value = athlete.height || '';
    document.getElementById('edit-belt').value = athlete.belt_level || 'белый';

    document.getElementById('edit-athlete-modal').classList.add('active');
}

// Pending Athletes
async function loadPendingAthletes() {
    const container = document.getElementById('pending-list');
    container.innerHTML = '<p class="text-center">Загрузка...</p>';

    try {
        const pending = await fetchAPI('/coaches/pending-athletes');

        document.getElementById('pending-count').textContent = pending.length;

        if (pending.length === 0) {
            container.innerHTML = '<div class="card"><p class="text-center">Нет заявок на подтверждение</p></div>';
            return;
        }

        container.innerHTML = pending.map(athlete => `
            <div class="card pending-card">
                <div class="pending-info">
                    <h3>${athlete.first_name} ${athlete.last_name}</h3>
                    <div class="pending-grid">
                        <p><strong>Телефон:</strong> <span>${athlete.phone}</span></p>
                        <p><strong>Дата рождения:</strong> <span>${formatDate(athlete.birth_date)}</span></p>
                        <p><strong>Пол:</strong> <span>${athlete.gender === 'M' ? 'Мужской' : 'Женский'}</span></p>
                        <p><strong>Параметры:</strong> <span>${athlete.weight || '-'} кг, ${athlete.height || '-'} см</span></p>
                        <p><strong>Филиал:</strong> <span>${athlete.branch_name || '-'}</span></p>
                    </div>
                </div>
                <div class="pending-actions">
                    <button class="btn btn-success" onclick="approveAthlete(${athlete.id})">Одобрить</button>
                    <button class="btn btn-danger" onclick="rejectAthlete(${athlete.id})">Отклонить</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading pending athletes:', error);
        container.innerHTML = '<div class="card"><p class="text-center">Ошибка загрузки</p></div>';
    }
}

async function approveAthlete(athleteId) {
    if (!await showConfirm('Подтверждение', 'Одобрить заявку спортсмена?')) return;

    try {
        await fetchAPI(`/coaches/approve-athlete/${athleteId}`, {
            method: 'POST',
            body: JSON.stringify({ status: 'approved' })
        });

        showSuccess('Спортсмен одобрен!');
        loadPendingAthletes();
        loadMyAthletes();
    } catch (error) {
        showError(error.message);
    }
}

async function rejectAthlete(athleteId) {
    if (!await showConfirm('Подтверждение', 'Отклонить заявку спортсмена?')) return;

    try {
        await fetchAPI(`/coaches/approve-athlete/${athleteId}`, {
            method: 'POST',
            body: JSON.stringify({ status: 'rejected' })
        });

        showSuccess('Заявка отклонена');
        loadPendingAthletes();
    } catch (error) {
        showError(error.message);
    }
}

// Competitions
function toggleBranchFilter() {
    showOnlyMyBranch = !showOnlyMyBranch;
    loadCompetitions();
}

async function loadCompetitions() {
    const container = document.getElementById('competitions-list');
    container.innerHTML = '<p class="text-center">Загрузка...</p>';

    try {
        const branchParam = showOnlyMyBranch && currentUser.branch_id ? `?branch_id=${currentUser.branch_id}` : '';
        const competitions = await fetchAPI(`/competitions${branchParam}`);

        // Build grid container if it doesn't exist
        let grid = document.querySelector('.competitions-grid');
        if (!grid) {
            container.innerHTML = `
                <div class="filter-bar" style="margin-bottom:1.5rem;text-align:right;">
                    <label style="cursor:pointer; display:inline-flex; align-items:center; gap:0.5rem; font-weight:600;">
                        <input type="checkbox" ${showOnlyMyBranch ? 'checked' : ''} onchange="toggleBranchFilter()"> Только мой филиал
                    </label>
                </div>
                <div class="competitions-grid"></div>
            `;
            grid = container.querySelector('.competitions-grid');
        }

        if (competitions.length === 0) {
            grid.innerHTML = '<p class="text-center" style="grid-column: 1/-1;">Нет соревнований</p>';
            return;
        }

        grid.innerHTML = competitions.map(comp => {
            const status = getCompetitionStatus(comp.competition_date);
            return `
            <div class="competition-card" onclick="viewCompetition(${comp.id})">
                <span class="level level-${comp.level}">${getLevelName(comp.level)}</span>
                <span class="comp-status comp-status-${status.class}">${status.label}</span>
                <h3>${comp.name}</h3>
                <div class="meta">📅 ${formatDate(comp.competition_date)}</div>
                <div class="meta">📍 ${comp.location || 'Не указано'}</div>
                <div class="meta">🏆 ${comp.season_name || 'Текущий сезон'}</div>
                ${comp.branch_name ? `<div class="meta">🏢 ${comp.branch_name}</div>` : ''}
            </div>
        `}).join('');
    } catch (error) {
        console.error('Error loading competitions:', error);
        container.innerHTML = '<p class="text-center">Ошибка загрузки</p>';
    }
}

let currentWizardStep = 1;

async function viewCompetition(competitionId) {
    try {
        currentCompetition = await fetchAPI(`/competitions/${competitionId}`);

        // Auto-populate categories if none exist
        if (!currentCompetition.categories || currentCompetition.categories.length === 0) {
            await fetchAPI(`/competitions/${competitionId}/auto-categories`, {
                method: 'POST'
            });
            currentCompetition = await fetchAPI(`/competitions/${competitionId}`);
        }

        document.getElementById('competition-title').textContent = currentCompetition.name;
        document.getElementById('competition-info').innerHTML = `
            <p><strong>Дата:</strong> ${formatDate(currentCompetition.competition_date)}</p>
            <p><strong>Место:</strong> ${currentCompetition.location || '-'}</p>
            <p><strong>Уровень:</strong> ${getLevelName(currentCompetition.level)}</p>
            <p><strong>Сезон:</strong> ${currentCompetition.season_name || 'Текущий'}</p>
        `;

        renderCompetitionCategories();
        updateBracketLink();
        await loadRegistrations(competitionId);
        await loadSparrings(competitionId);

        // Auto-detect step
        const categories = currentCompetition.categories || [];
        const regsCount = competitionRegistrations ? competitionRegistrations.length : 0;
        const hasBracket = currentCompetition.bracket_generated;

        let autoStep = 1;
        if (categories.length > 0) autoStep = 2;
        if (regsCount > 0) autoStep = 3;
        if (hasBracket) autoStep = 4;
        // Check if there are completed fights
        const bracketData = hasBracket ? await fetchBracketSummary(competitionId) : null;
        if (bracketData && bracketData.hasResults) autoStep = 5;
        if (bracketData && bracketData.allComplete) autoStep = 6;

        showPage('competition-detail');
        goToWizardStep(autoStep);
    } catch (error) {
        showError('Ошибка загрузки соревнования: ' + error.message);
    }
}

async function fetchBracketSummary(competitionId) {
    try {
        const data = await fetchAPI(`/competitions/${competitionId}/bracket`);
        if (!data.categories || data.categories.length === 0) return null;
        let totalMatches = 0;
        let completedMatches = 0;
        data.categories.forEach(cat => {
            cat.matches.forEach(m => {
                if (!m.is_bye) {
                    totalMatches++;
                    if (m.winner_id) completedMatches++;
                }
            });
        });
        return {
            hasResults: completedMatches > 0,
            allComplete: totalMatches > 0 && completedMatches === totalMatches,
            data: data
        };
    } catch (e) {
        return null;
    }
}

function goToWizardStep(step) {
    currentWizardStep = step;

    // Hide all panels
    document.querySelectorAll('.wizard-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById(`wizard-step-${step}`);
    if (panel) panel.style.display = '';

    // Update stepper indicators
    document.querySelectorAll('.wizard-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s === step) el.classList.add('active');
        else if (s < step) el.classList.add('completed');
    });

    // Load step-specific data
    if (step === 3 && currentCompetition) loadRegistrations(currentCompetition.id);
    if (step === 4 && currentCompetition) updateBracketLink();
    if (step === 5 && currentCompetition) loadSparrings(currentCompetition.id);
    if (step === 6 && currentCompetition) loadCompetitionResults();
}

async function loadCompetitionResults() {
    const container = document.getElementById('competition-results');
    container.innerHTML = '<p>Загрузка...</p>';

    try {
        const data = await fetchAPI(`/competitions/${currentCompetition.id}/bracket`);
        if (!data.categories || data.categories.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">Сетка ещё не сгенерирована.</p>';
            return;
        }

        let html = '';
        data.categories.forEach(cat => {
            // Find the final match (highest round)
            const maxRound = Math.max(...cat.matches.map(m => m.round_number));
            const finalMatch = cat.matches.find(m => m.round_number === maxRound);

            let champion = '-';
            let silver = '-';
            if (finalMatch && finalMatch.winner_id) {
                champion = finalMatch.winner_id === finalMatch.athlete1_id
                    ? (finalMatch.athlete1_name || 'Спортсмен 1')
                    : (finalMatch.athlete2_name || 'Спортсмен 2');
                silver = finalMatch.winner_id === finalMatch.athlete1_id
                    ? (finalMatch.athlete2_name || '-')
                    : (finalMatch.athlete1_name || '-');
            }

            // Count total athletes and completed matches
            const realMatches = cat.matches.filter(m => !m.is_bye);
            const completedMatches = realMatches.filter(m => m.winner_id);

            html += `
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                    <h3 style="margin-bottom: 0.5rem;">${cat.category}</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem;">
                        <div><span style="color: var(--text-secondary);">Матчей:</span> <strong>${completedMatches.length}/${realMatches.length}</strong></div>
                        <div><span style="color: gold;">&#9733;</span> <strong>${champion}</strong></div>
                        ${silver !== '-' ? `<div><span style="color: silver;">&#9733;</span> ${silver}</div>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<p style="color: var(--text-secondary);">Нет данных</p>';

        // Add bracket link
        if (currentCompetition.bracket_generated) {
            container.innerHTML += `
                <div style="margin-top: 1rem;">
                    <a href="bracket.html?competition=${currentCompetition.id}" target="_blank" class="btn btn-primary">Открыть полную сетку</a>
                </div>
            `;
        }
    } catch (err) {
        container.innerHTML = '<p style="color: var(--text-secondary);">Ошибка загрузки итогов</p>';
    }
}

async function loadRegistrations(competitionId) {
    const container = document.getElementById('registrations-list');
    container.innerHTML = '<p>Загрузка...</p>';

    try {
        competitionRegistrations = await fetchAPI(`/competitions/${competitionId}/registrations`);

        if (competitionRegistrations.length === 0) {
            container.innerHTML = '<p>Нет зарегистрированных спортсменов</p>';
            return;
        }

        // Group by category
        const byCategory = {};
        competitionRegistrations.forEach(reg => {
            const key = `${reg.category_name} (${reg.category_gender === 'M' ? 'М' : 'Ж'})`;
            if (!byCategory[key]) byCategory[key] = [];
            byCategory[key].push(reg);
        });

        const canDeregister = !currentCompetition.bracket_generated;
        container.innerHTML = Object.entries(byCategory).map(([cat, regs]) => `
            <div style="margin-bottom: 1.5rem;">
                <h4>${cat} <span style="color: var(--text-secondary); font-weight: 400;">(${regs.length})</span></h4>
                <ul>
                    ${regs.map(r => `<li style="display:flex;align-items:center;gap:0.5rem;">
                        <span>${r.first_name} ${r.last_name} (${r.weight} кг)</span>
                        ${canDeregister ? `<button class="btn btn-sm btn-danger" onclick="deregisterAthlete(${r.athlete_id})" title="Отменить" style="padding:0.1rem 0.4rem;font-size:0.75rem;">✕</button>` : ''}
                    </li>`).join('')}
                </ul>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p>Ошибка загрузки</p>';
    }
}

async function deregisterAthlete(athleteId) {
    if (!currentCompetition) return;
    try {
        await fetchAPI(`/competitions/${currentCompetition.id}/registrations/${athleteId}`, { method: 'DELETE' });
        showSuccess('Регистрация отменена');
        await loadRegistrations(currentCompetition.id);
    } catch (err) {
        showError(err.message);
    }
}

async function loadSparrings(competitionId) {
    const container = document.getElementById('sparrings-list');
    container.innerHTML = '<p>Загрузка...</p>';

    try {
        const sparrings = await fetchAPI(`/competitions/${competitionId}/sparrings`);

        if (sparrings.length === 0) {
            container.innerHTML = '<p>Нет спаррингов</p>';
            return;
        }

        // Group by category
        const byCategory = {};
        sparrings.forEach(sp => {
            const key = `${sp.weight_category} (${sp.category_gender === 'M' ? 'М' : 'Ж'})`;
            if (!byCategory[key]) byCategory[key] = [];
            byCategory[key].push(sp);
        });

        container.innerHTML = Object.entries(byCategory).map(([cat, spars]) => `
            <div style="margin-bottom: 1.5rem;">
                <h4>${cat}</h4>
                ${spars.map(sp => `
                    <div class="fight-item" style="margin-bottom: 0.5rem;">
                        <div>
                            <strong>${sp.athlete1_first_name} ${sp.athlete1_last_name}</strong>
                            vs
                            <strong>${sp.athlete2_first_name} ${sp.athlete2_last_name}</strong>
                        </div>
                        <div>
                            ${sp.fight_id ?
                `<span class="badge badge-active">Завершён (${sp.result_type})</span>` :
                `<button class="btn btn-sm btn-primary" onclick="addFightResult(${sp.id}, '${sp.athlete1_first_name} ${sp.athlete1_last_name}', '${sp.athlete2_first_name} ${sp.athlete2_last_name}', ${sp.athlete1_id}, ${sp.athlete2_id})">Добавить результат</button>`
            }
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p>Ошибка загрузки</p>';
    }
}

function addFightResult(sparringId, athlete1Name, athlete2Name, athlete1Id, athlete2Id) {
    document.getElementById('fight-sparring-id').value = sparringId;
    document.getElementById('fight-athletes-info').innerHTML = `
        <p><strong>${athlete1Name}</strong> vs <strong>${athlete2Name}</strong></p>
    `;

    const winnerSelect = document.getElementById('fight-winner-select');
    winnerSelect.innerHTML = `
        <option value="">Выберите победителя</option>
        <option value="${athlete1Id}">${athlete1Name}</option>
        <option value="${athlete2Id}">${athlete2Name}</option>
    `;

    document.getElementById('fight-modal').classList.add('active');
}

// Ratings
let ratingsSeasonId = null;

async function loadRatingsSeasons() {
    try {
        const seasons = await fetchAPI('/seasons');
        const select = document.getElementById('ratings-season-selector');
        select.innerHTML = '';
        if (seasons.length === 0) {
            select.innerHTML = '<option value="">Нет сезонов</option>';
            return;
        }
        seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name + (s.is_active ? ' (активный)' : '');
            if (s.is_active) opt.selected = true;
            select.appendChild(opt);
        });
        ratingsSeasonId = select.value || null;
    } catch (error) {
        console.error('Error loading seasons:', error);
    }
}

function onRatingsSeasonChange() {
    const select = document.getElementById('ratings-season-selector');
    ratingsSeasonId = select.value || null;
    loadRatings();
}

function onRatingsFilterChange() {
    loadRatings();
}

async function loadRatings() {
    const tbody = document.getElementById('ratings-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Загрузка...</td></tr>';

    try {
        let url = '/ratings';
        if (ratingsSeasonId) url += `?season_id=${ratingsSeasonId}`;
        let ratings = await fetchAPI(url);

        // Filter "only mine" if checked
        const onlyMine = document.getElementById('ratings-only-mine');
        if (onlyMine && onlyMine.checked && myAthletes.length > 0) {
            const myIds = new Set(myAthletes.map(a => a.id));
            ratings = ratings.filter(r => myIds.has(r.athlete_id));
        }

        if (ratings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = ratings.map((rating, index) => `
            <tr>
                <td><strong>${index + 1}</strong></td>
                <td>${rating.first_name} ${rating.last_name}${rating.gold_medals > 0 ? ' <span style="color:gold;" title="' + rating.gold_medals + ' золот.">&#127942;</span>' : ''}</td>
                <td class="belt-${rating.belt_level?.toLowerCase()}">${rating.belt_level || '-'}</td>
                <td><strong>${rating.total_points}</strong></td>
                <td>${rating.wins_count}W / ${rating.losses_count || 0}L</td>
                <td>${rating.fights_count}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading ratings:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Ошибка загрузки</td></tr>';
    }
}

// Forms
function setupForms() {
    document.getElementById('edit-athlete-form').addEventListener('submit', handleEditAthlete);
    document.getElementById('competition-form').addEventListener('submit', handleCreateCompetition);
    document.getElementById('register-athlete-form').addEventListener('submit', handleRegisterAthlete);
    document.getElementById('sparring-form').addEventListener('submit', handleCreateSparring);
    document.getElementById('fight-form').addEventListener('submit', handleAddFight);
    document.getElementById('schedule-form').addEventListener('submit', handleCreateSchedule);
    document.getElementById('subscription-form').addEventListener('submit', handleCreateSubscription);

    // Profile handlers
    document.getElementById('profile-info-form').addEventListener('submit', handleUpdateProfile);
    document.getElementById('profile-password-form').addEventListener('submit', handleChangePassword);
    document.getElementById('profile-photo-input').addEventListener('change', handlePhotoUpload);
}

async function loadProfile() {
    try {
        await loadCurrentUser(); // Refresh data

        document.getElementById('profile-first-name').value = currentUser.first_name || '';
        document.getElementById('profile-last-name').value = currentUser.last_name || '';
        document.getElementById('profile-phone').value = currentUser.phone || '';
        document.getElementById('profile-full-name').textContent = `${currentUser.first_name} ${currentUser.last_name}`;
        document.getElementById('profile-role-tag').textContent = currentUser.role === 'coach' ? 'Сертифицированный тренер' : 'Администратор';

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

async function handleCreateSchedule(e) {
    e.preventDefault();
    const data = {
        day_of_week: parseInt(document.getElementById('sched-day').value),
        start_time: document.getElementById('sched-start').value,
        end_time: document.getElementById('sched-end').value,
        is_paid: parseInt(document.getElementById('sched-paid').value),
        price: parseFloat(document.getElementById('sched-price').value) || 0,
        max_participants: parseInt(document.getElementById('sched-max').value) || 20,
        description: document.getElementById('sched-desc').value || null
    };
    try {
        await fetchAPI('/schedules', { method: 'POST', body: JSON.stringify(data) });
        showSuccess('Занятие добавлено!');
        closeModal('schedule-modal');
        e.target.reset();
        loadSchedule();
    } catch (err) { showError(err.message); }
}

async function handleCreateSubscription(e) {
    e.preventDefault();
    const data = {
        athlete_id: parseInt(document.getElementById('sub-athlete').value),
        type: document.getElementById('sub-type').value,
        start_date: document.getElementById('sub-start').value,
        end_date: document.getElementById('sub-end').value,
        sessions_total: parseInt(document.getElementById('sub-sessions').value) || null,
        price: parseFloat(document.getElementById('sub-price').value)
    };
    try {
        await fetchAPI('/subscriptions', { method: 'POST', body: JSON.stringify(data) });
        showSuccess('Подписка создана!');
        closeModal('subscription-modal');
        e.target.reset();
        loadSubscriptions();
    } catch (err) { showError(err.message); }
}

async function handleEditAthlete(e) {
    e.preventDefault();

    const athleteId = document.getElementById('edit-athlete-id').value;
    const data = {
        weight: parseFloat(document.getElementById('edit-weight').value),
        height: parseInt(document.getElementById('edit-height').value),
        belt_level: document.getElementById('edit-belt').value
    };

    try {
        await fetchAPI(`/coaches/update-athlete/${athleteId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        showSuccess('Данные спортсмена обновлены!');
        closeModal('edit-athlete-modal');
        loadMyAthletes();
    } catch (error) {
        showError(error.message);
    }
}

async function handleCreateCompetition(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const categories = getCategories();
    const data = {
        name: formData.get('name'),
        competition_date: formData.get('competition_date'),
        location: formData.get('location'),
        level: formData.get('level'),
        season_id: formData.get('season_id') ? parseInt(formData.get('season_id')) : null,
        branch_id: currentUser.coach_profile?.branch_id || null,
        description: formData.get('description'),
        categories: categories
    };

    try {
        await fetchAPI('/competitions', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showSuccess('Соревнование создано!');
        closeModal('competition-modal');
        e.target.reset();
        loadCompetitions();
    } catch (error) {
        showError(error.message);
    }
}

async function handleRegisterAthlete(e) {
    e.preventDefault();

    const data = {
        athlete_id: parseInt(document.getElementById('reg-athlete-select').value),
        category_id: parseInt(document.getElementById('reg-category-select').value)
    };

    try {
        await fetchAPI(`/competitions/${currentCompetition.id}/register`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showSuccess('Спортсмен зарегистрирован!');
        closeModal('register-athlete-modal');
        loadRegistrations(currentCompetition.id);
    } catch (error) {
        showError(error.message);
    }
}

async function handleCreateSparring(e) {
    e.preventDefault();

    const data = {
        competition_id: currentCompetition.id,
        category_id: parseInt(document.getElementById('spar-category-select').value),
        athlete1_id: parseInt(document.getElementById('spar-athlete1-select').value),
        athlete2_id: parseInt(document.getElementById('spar-athlete2-select').value),
        round_name: document.getElementById('spar-round').value || null
    };

    try {
        await fetchAPI('/sparrings', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showSuccess('Спарринг создан!');
        closeModal('sparring-modal');
        e.target.reset();
        loadSparrings(currentCompetition.id);
    } catch (error) {
        showError(error.message);
    }
}

async function handleAddFight(e) {
    e.preventDefault();

    const data = {
        sparring_id: parseInt(document.getElementById('fight-sparring-id').value),
        winner_id: parseInt(document.getElementById('fight-winner-select').value),
        result_type: document.getElementById('fight-result-type').value,
        athlete1_score: parseInt(document.getElementById('fight-score1').value),
        athlete2_score: parseInt(document.getElementById('fight-score2').value),
        notes: document.getElementById('fight-notes').value || null
    };

    try {
        await fetchAPI('/fights', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showSuccess('Результат боя сохранён! Рейтинг обновлён.');
        closeModal('fight-modal');
        e.target.reset();
        loadSparrings(currentCompetition.id);
    } catch (error) {
        showError(error.message);
    }
}

// Competition categories management
function renderCompetitionCategories() {
    const container = document.getElementById('competition-categories-list');
    const categories = currentCompetition.categories || [];

    if (categories.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">Нет весовых категорий. Добавьте категории, чтобы можно было регистрировать спортсменов.</p>';
        return;
    }

    container.innerHTML = categories.map(cat => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
            <span><strong>${cat.weight_category}</strong> (${cat.gender === 'M' ? 'М' : 'Ж'})</span>
            <button class="btn btn-sm btn-danger" onclick="deleteCategoryFromCompetition(${cat.id})">Удалить</button>
        </div>
    `).join('');
}

async function addCategoryToCompetition() {
    const weight = document.getElementById('add-cat-weight').value;
    const gender = document.getElementById('add-cat-gender').value;

    if (!weight) {
        showError('Выберите весовую категорию');
        return;
    }

    try {
        await fetchAPI(`/competitions/${currentCompetition.id}/categories`, {
            method: 'POST',
            body: JSON.stringify({ weight_category: weight, gender: gender })
        });

        // Reload competition data
        currentCompetition = await fetchAPI(`/competitions/${currentCompetition.id}`);
        renderCompetitionCategories();
        document.getElementById('add-cat-weight').value = '';
    } catch (error) {
        showError(error.message);
    }
}

async function deleteCategoryFromCompetition(categoryId) {
    if (!await showConfirm('Подтверждение', 'Удалить эту категорию?')) return;

    try {
        await fetchAPI(`/competitions/${currentCompetition.id}/categories/${categoryId}`, {
            method: 'DELETE'
        });

        currentCompetition = await fetchAPI(`/competitions/${currentCompetition.id}`);
        renderCompetitionCategories();
    } catch (error) {
        showError(error.message);
    }
}

// Category rows for competition creation
let categoryRowCount = 0;

function addCategoryRow() {
    categoryRowCount++;
    const container = document.getElementById('comp-categories-list');
    const row = document.createElement('div');
    row.id = `cat-row-${categoryRowCount}`;
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
        <button type="button" class="btn btn-sm btn-danger" onclick="removeCategoryRow(${categoryRowCount})">✕</button>
    `;
    container.appendChild(row);
}

function removeCategoryRow(id) {
    const row = document.getElementById(`cat-row-${id}`);
    if (row) row.remove();
}

function getCategories() {
    const container = document.getElementById('comp-categories-list');
    const rows = container.querySelectorAll('[id^="cat-row-"]');
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

// Modals
async function showCompetitionModal() {
    const seasons = await fetchAPI('/seasons');
    const select = document.getElementById('comp-season-select');
    select.innerHTML = '<option value="">Автоматически (текущий)</option>';
    seasons.forEach(s => {
        const selected = s.is_active ? ' selected' : '';
        select.innerHTML += `<option value="${s.id}"${selected}>${s.name}${s.is_active ? ' ✓' : ''}</option>`;
    });

    // Reset categories list
    document.getElementById('comp-categories-list').innerHTML = '';
    categoryRowCount = 0;

    document.getElementById('competition-modal').classList.add('active');
}

async function showRegisterAthleteModal() {
    const athleteSelect = document.getElementById('reg-athlete-select');
    athleteSelect.innerHTML = '<option value="">Выберите спортсмена</option>';
    myAthletes.forEach(a => {
        athleteSelect.innerHTML += `<option value="${a.id}">${a.first_name} ${a.last_name} (${a.weight_category || 'без категории'})</option>`;
    });

    const categorySelect = document.getElementById('reg-category-select');
    categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
    currentCompetition.categories.forEach(c => {
        categorySelect.innerHTML += `<option value="${c.id}">${c.weight_category} (${c.gender === 'M' ? 'М' : 'Ж'})</option>`;
    });

    document.getElementById('register-athlete-modal').classList.add('active');
}

async function showSparringModal() {
    const categorySelect = document.getElementById('spar-category-select');
    categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
    currentCompetition.categories.forEach(c => {
        categorySelect.innerHTML += `<option value="${c.id}">${c.weight_category} (${c.gender === 'M' ? 'М' : 'Ж'})</option>`;
    });

    const athlete1Select = document.getElementById('spar-athlete1-select');
    const athlete2Select = document.getElementById('spar-athlete2-select');

    const options = competitionRegistrations.map(r =>
        `<option value="${r.athlete_id}">${r.first_name} ${r.last_name}</option>`
    ).join('');

    athlete1Select.innerHTML = '<option value="">Выберите спортсмена</option>' + options;
    athlete2Select.innerHTML = '<option value="">Выберите спортсмена</option>' + options;

    document.getElementById('sparring-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Utils
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

function getCompetitionStatus(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compDate = new Date(dateStr);
    compDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((compDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays > 0) return { label: 'Предстоящее', class: 'upcoming' };
    if (diffDays === 0) return { label: 'Сегодня', class: 'active' };
    return { label: 'Завершено', class: 'finished' };
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

// ============= JUDO SCORING =============

const JUDO_POINTS = {
    ippon: { name: 'Иппон', points: 10 },
    wazari: { name: 'Ваза-ари', points: 7 },
    yuko: { name: 'Юко', points: 5 },
    shido: { name: 'Шидо', points: 3 },
    points: { name: 'По баллам', points: 0 },
    disqualification: { name: 'Дисквалификация', points: 0 }
};

function onResultTypeChange() {
    const type = document.getElementById('fight-result-type').value;
    const info = document.getElementById('fight-auto-points-info');
    const scoring = JUDO_POINTS[type];

    if (scoring && scoring.points > 0) {
        const desc = type === 'shido'
            ? `<strong>${scoring.name}</strong> — <strong>${scoring.points} балла</strong> штраф сопернику`
            : `<strong>${scoring.name}</strong> — автоматически <strong>${scoring.points} баллов</strong> победителю`;
        info.innerHTML = desc;
        info.style.display = 'block';
    } else {
        info.innerHTML = '<em>Ручной ввод счёта</em>';
        info.style.display = 'block';
    }
}

// ============= SCHEDULE MANAGEMENT =============

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

async function loadSchedule() {
    const container = document.getElementById('schedule-list');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        const schedules = await fetchAPI('/schedules/my');
        if (schedules.length === 0) {
            container.innerHTML = '<p class="text-center">Расписание пусто. Добавьте занятия.</p>';
            return;
        }
        container.innerHTML = `<table class="table"><thead><tr>
            <th>День</th><th>Время</th><th>Тип</th><th>Цена</th><th>Макс.</th><th>Описание</th><th>Действия</th>
        </tr></thead><tbody>` +
            schedules.map(s => `<tr>
            <td>${DAY_NAMES[s.day_of_week]}</td>
            <td>${s.start_time} — ${s.end_time}</td>
            <td>${s.is_paid ? 'Платная' : 'Бесплатная'}</td>
            <td>${s.is_paid ? s.price + ' тг' : '—'}</td>
            <td>${s.max_participants}</td>
            <td>${s.description || '—'}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteSchedule(${s.id})">Удалить</button></td>
        </tr>`).join('') + '</tbody></table>';
    } catch (err) {
        container.innerHTML = '<p>Ошибка загрузки</p>';
    }
}

function showScheduleModal() {
    document.getElementById('schedule-modal').classList.add('active');
}

async function deleteSchedule(id) {
    if (!await showConfirm('Подтверждение', 'Удалить занятие из расписания?')) return;
    try {
        await fetchAPI(`/schedules/${id}`, { method: 'DELETE' });
        loadSchedule();
    } catch (err) { showError(err.message); }
}

async function loadBookings() {
    const container = document.getElementById('bookings-list');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        const bookings = await fetchAPI('/coaches/bookings');
        if (bookings.length === 0) {
            container.innerHTML = '<p class="text-center">Нет записей</p>';
            return;
        }
        container.innerHTML = `<table class="table"><thead><tr>
            <th>Дата</th><th>Время</th><th>Спортсмен</th><th>Статус</th><th>Оплата</th><th>Действия</th>
        </tr></thead><tbody>` +
            bookings.map(b => `<tr>
            <td>${formatDate(b.booking_date)}</td>
            <td>${b.start_time} — ${b.end_time}</td>
            <td>${b.first_name} ${b.last_name}</td>
            <td><span class="badge ${b.status === 'attended' ? 'badge-active' : b.status === 'cancelled' ? 'badge-inactive' : ''}">${b.status}</span></td>
            <td>${b.is_trial ? 'Пробная' : b.payment_status}</td>
            <td>
                ${b.status === 'booked' ? `
                    <button class="btn btn-sm btn-success" onclick="markBooking(${b.id}, 'attended')">Был</button>
                    <button class="btn btn-sm btn-danger" onclick="markBooking(${b.id}, 'no_show')">Не пришёл</button>
                ` : ''}
            </td>
        </tr>`).join('') + '</tbody></table>';
    } catch (err) {
        container.innerHTML = '<p>Ошибка загрузки</p>';
    }
}

async function markBooking(id, status) {
    try {
        await fetchAPI(`/coaches/bookings/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
        loadBookings();
    } catch (err) { showError(err.message); }
}

async function loadSubscriptions() {
    const container = document.getElementById('subscriptions-list');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        const subs = await fetchAPI('/coaches/subscriptions');
        if (subs.length === 0) {
            container.innerHTML = '<p class="text-center">Нет подписок</p>';
            return;
        }
        container.innerHTML = `<table class="table"><thead><tr>
            <th>Спортсмен</th><th>Тип</th><th>Период</th><th>Цена</th><th>Статус</th>
        </tr></thead><tbody>` +
            subs.map(s => `<tr>
            <td>${s.first_name} ${s.last_name}</td>
            <td>${s.type}</td>
            <td>${formatDate(s.start_date)} — ${formatDate(s.end_date)}</td>
            <td>${s.price} тг</td>
            <td><span class="badge ${s.status === 'active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        </tr>`).join('') + '</tbody></table>';
    } catch (err) {
        container.innerHTML = '<p>Ошибка загрузки</p>';
    }
}

function showSubscriptionModal() {
    const select = document.getElementById('sub-athlete');
    select.innerHTML = '<option value="">Выберите</option>';
    myAthletes.forEach(a => {
        select.innerHTML += `<option value="${a.id}">${a.first_name} ${a.last_name}</option>`;
    });
    document.getElementById('subscription-modal').classList.add('active');
}

// ============= BRANCH ATHLETES =============

async function loadBranchAthletes() {
    const tbody = document.getElementById('branch-athletes-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Загрузка...</td></tr>';
    try {
        const branchId = currentUser.coach_profile?.branch_id;
        if (!branchId) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Филиал не указан</td></tr>';
            return;
        }
        const athletes = await fetchAPI(`/branches/${branchId}/athletes`);
        if (athletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Нет спортсменов</td></tr>';
            return;
        }
        tbody.innerHTML = athletes.map(a => `<tr>
            <td>${a.first_name} ${a.last_name}</td>
            <td>${a.coach_first_name || ''} ${a.coach_last_name || ''}</td>
            <td>${a.gender === 'M' ? 'М' : 'Ж'}</td>
            <td>${a.weight || '-'} кг</td>
            <td>${a.weight_category || '-'}</td>
            <td class="belt-${a.belt_level?.toLowerCase()}">${a.belt_level || '-'}</td>
        </tr>`).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Ошибка загрузки</td></tr>';
    }
}

// ============= BRACKET GENERATION =============

async function generateBracket() {
    if (!currentCompetition) return;
    if (!await showConfirm('Подтверждение', 'Генерировать турнирную сетку? Существующая сетка будет пересоздана.')) return;
    try {
        const result = await fetchAPI(`/competitions/${currentCompetition.id}/generate-bracket`, { method: 'POST' });
        showSuccess(`Турнирная сетка создана! Матчей: ${result.total_matches}`);
        currentCompetition.bracket_generated = 1;
        updateBracketLink();
    } catch (err) { showError(err.message); }
}

function updateBracketLink() {
    const link = document.getElementById('view-bracket-link');
    if (currentCompetition && currentCompetition.bracket_generated) {
        link.style.display = 'inline-block';
        link.href = `bracket.html?competition=${currentCompetition.id}`;
    } else {
        link.style.display = 'none';
    }
}

// ============= BELT PROMOTION =============

async function checkBeltEligible() {
    try {
        const eligible = await fetchAPI('/coaches/belt-eligible');
        if (eligible.length > 0) {
            const names = eligible.map(e => `${e.first_name} ${e.last_name} → ${e.next_belt_name}`).join(', ');
            console.log('Belt eligible:', names);
        }
        return eligible;
    } catch (err) { return []; }
}

async function promoteBelt(athleteId, newBelt) {
    if (!await showConfirm('Подтверждение', `Повысить пояс до "${newBelt}"?`)) return;
    try {
        await fetchAPI(`/coaches/promote-belt/${athleteId}`, {
            method: 'POST',
            body: JSON.stringify({ new_belt_level: newBelt })
        });
        showSuccess('Пояс повышен!');
        loadMyAthletes();
    } catch (err) { showError(err.message); }
}

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

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
// ============= AI ASSISTANT FUNCTIONS =============

async function generateAIAnalysis() {
    const container = document.getElementById('ai-insights-container');
    const btn = document.querySelector('.btn-ai');

    btn.disabled = true;
    btn.textContent = 'Анализирую данные...';
    container.innerHTML = '<div class="text-center"><div class="spinner"></div><p>Искусственный интеллект ORTUS изучает результаты ваших учеников...</p></div>';

    try {
        const data = await fetchAPI('/ai/coach-analysis');

        let html = `
            <div class="card" style="margin-bottom: 1.5rem;">
                <p><strong>Резюме ассистента:</strong> ${data.summary}</p>
            </div>
        `;

        if (data.insights && data.insights.length > 0) {
            html += data.insights.map(insight => `
                <div class="ai-insight-card ${insight.type}">
                    <div class="ai-insight-icon">
                        ${insight.type === 'success' ? '🎯' : insight.type === 'warning' ? '⚠️' : '💡'}
                    </div>
                    <div class="ai-insight-content">
                        <h4>${insight.title}</h4>
                        <p>${insight.text}</p>
                    </div>
                </div>
            `).join('');
        }

        if (data.topProspect) {
            html += `
                <div class="ai-insight-card success">
                    <div class="ai-insight-icon">⭐</div>
                    <div class="ai-insight-content">
                        <h4>Главный претендент на победу</h4>
                        <p>${data.topProspect.first_name} ${data.topProspect.last_name} показывает лучший рейтинг (${data.topProspect.rating || 0}). Рекомендую сфокусироваться на его подготовке к ближайшему чемпионату.</p>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        showSuccess('Анализ завершен успешно!');
    } catch (e) {
        container.innerHTML = '<p class="text-center danger-text">Ошибка при генерации анализа. Попробуйте позже.</p>';
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Обновить аудит';
    }
}

async function sendAIChat() {
    const input = document.getElementById('ai-chat-input');
    const messages = document.getElementById('ai-chat-messages');
    const text = input.value.trim();

    if (!text) return;

    // Add user message
    const userDiv = document.createElement('div');
    userDiv.className = 'ai-msg user';
    userDiv.textContent = text;
    messages.appendChild(userDiv);

    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    // Loading indicator
    const botDiv = document.createElement('div');
    botDiv.className = 'ai-msg bot';
    botDiv.innerHTML = '<div class="spinner spinner-sm"></div>';
    messages.appendChild(botDiv);

    try {
        const data = await fetchAPI('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message: text })
        });

        botDiv.textContent = data.response;
    } catch (e) {
        botDiv.textContent = 'Извините, сейчас я не могу ответить. Попробуйте позже.';
    } finally {
        messages.scrollTop = messages.scrollHeight;
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
    const feedWidget = document.getElementById('activity-feed-widget');
    if (feedWidget) {
        showPage('dashboard');
        feedWidget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight effect
        feedWidget.style.transition = 'box-shadow 0.3s';
        feedWidget.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.3)';
        setTimeout(() => {
            feedWidget.style.boxShadow = 'none';
        }, 1500);
    }
}

async function checkUnreadNotifications() {
    try {
        const lastRead = localStorage.getItem('lastReadNotificationTime') || new Date(0).toISOString();
        const feed = await fetchAPI('/coaches/activity-feed');
        
        // Count items newer than lastRead
        const newItems = feed.filter(item => {
            const date = item.time || item.date;
            return date && new Date(date) > new Date(lastRead);
        });
        
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
