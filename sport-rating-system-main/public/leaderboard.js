const API_URL = '/api';

const CONFIG = {
    autoRotationInterval: 12000,
    refreshInterval: 30000,
    branchId: null,
    seasonId: null,
    topCount: 50
};

let categories = [];
let currentCategoryIndex = 0;
let autoRotationEnabled = true;
let autoRotationTimer = null;
let refreshTimer = null;
let currentBranchName = '';
let currentSeasonName = '';

document.addEventListener('DOMContentLoaded', () => {
    initializeFromURL();
    loadInitialData();
    setupAutoRotation();
    setupRefresh();
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
});

function initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    CONFIG.branchId = urlParams.get('branch') || null;

    if (urlParams.get('auto') === 'false') {
        autoRotationEnabled = false;
    }
}

async function loadInitialData() {
    try {
        if (CONFIG.branchId) {
            const branches = await fetchAPI('/branches');
            const branch = branches.find(b => b.id == CONFIG.branchId);
            if (branch) {
                currentBranchName = branch.name;
                document.getElementById('branch-name').textContent = currentBranchName;
            }
        }

        // Load all seasons and populate selector
        const seasons = await fetchAPI('/seasons');
        const selector = document.getElementById('season-selector');
        if (selector && seasons.length > 0) {
            selector.innerHTML = seasons.map(s =>
                `<option value="${s.id}" ${s.is_active ? 'selected' : ''}>${s.name}</option>`
            ).join('');
            const activeSeason = seasons.find(s => s.is_active) || seasons[0];
            CONFIG.seasonId = activeSeason.id;
            currentSeasonName = activeSeason.name;
        }

        await loadCategories();
        await displayCurrentCategory();
        updateLastUpdateTime();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showError('Ошибка загрузки данных');
    }
}

function onSeasonChange() {
    const selector = document.getElementById('season-selector');
    CONFIG.seasonId = parseInt(selector.value);
    currentCategoryIndex = 0;
    loadCategories().then(() => displayCurrentCategory());
}

async function loadCategories() {
    try {
        const seasonParam = CONFIG.seasonId ? `?season_id=${CONFIG.seasonId}` : '';
        const endpoint = CONFIG.branchId ? `/ratings/branch/${CONFIG.branchId}${seasonParam}` : `/ratings${seasonParam}`;
        const ratings = await fetchAPI(endpoint);

        const categorySet = new Set();
        ratings.forEach(rating => {
            if (rating.weight_category) {
                categorySet.add(rating.weight_category);
            }
        });

        categories = ['Все категории', ...Array.from(categorySet).sort()];

        if (categories.length === 1) {
            showError('Нет данных о весовых категориях');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        categories = ['Все категории'];
    }
}

async function displayCurrentCategory() {
    const category = categories[currentCategoryIndex];

    const categoryElement = document.getElementById('current-category');
    categoryElement.style.animation = 'none';
    setTimeout(() => {
        categoryElement.textContent = category;
        categoryElement.style.animation = 'slideIn 0.5s ease';
    }, 10);

    await loadAndDisplayRatings(category);
}

async function loadAndDisplayRatings(category) {
    showLoading();

    try {
        const seasonParam = CONFIG.seasonId ? `?season_id=${CONFIG.seasonId}` : '';
        const endpoint = CONFIG.branchId ? `/ratings/branch/${CONFIG.branchId}${seasonParam}` : `/ratings${seasonParam}`;
        let ratings = await fetchAPI(endpoint);

        if (category !== 'Все категории') {
            ratings = ratings.filter(r => r.weight_category === category);
        }

        ratings.sort((a, b) => b.total_points - a.total_points);
        ratings = ratings.slice(0, CONFIG.topCount);

        if (ratings.length === 0) {
            showEmpty();
            return;
        }

        displayPodium(ratings.slice(0, 3));
        displayRankings(ratings.slice(3));
        // Show "load more" if we have exactly topCount results (more might exist)
        const loadMoreEl = document.getElementById('load-more-container');
        if (loadMoreEl) {
            loadMoreEl.style.display = ratings.length >= CONFIG.topCount ? '' : 'none';
        }
        hideLoading();
    } catch (error) {
        console.error('Error loading ratings:', error);
        showError('Ошибка загрузки рейтинга');
    }
}

function displayPodium(topThree) {
    const podium = document.getElementById('podium');

    if (topThree.length === 0) {
        podium.innerHTML = '';
        return;
    }

    podium.innerHTML = topThree.map((athlete, index) => {
        const rank = index + 1;
        return `
            <div class="podium-item rank-${rank}">
                <div class="podium-rank">${rank}</div>
                <div class="podium-photo-container">
                    <img src="${athlete.photo_url || getDefaultPhoto(athlete.gender)}" 
                         alt="${athlete.first_name} ${athlete.last_name}" 
                         class="podium-photo"
                         onerror="this.src='${getDefaultPhoto(athlete.gender)}'">
                </div>
                <div class="podium-name">${athlete.first_name} ${athlete.last_name}${athlete.gold_medals > 0 ? ` <span title="${athlete.gold_medals} золот." style="color:gold;">&#127942;${athlete.gold_medals > 1 ? athlete.gold_medals : ''}</span>` : ''}</div>
                <div class="podium-belt belt-${athlete.belt_level?.toLowerCase() || 'белый'}">${athlete.belt_level || 'Белый'} пояс</div>
                <div class="podium-stats">
                    <div class="podium-stat">
                        <span class="stat-value">${athlete.total_points}</span>
                        <span class="stat-label">Очки</span>
                    </div>
                    <div class="podium-stat">
                        <span class="stat-value">${athlete.wins_count}W / ${athlete.losses_count || 0}L</span>
                        <span class="stat-label">W/L</span>
                    </div>
                    <div class="podium-stat">
                        <span class="stat-value">${athlete.fights_count || 0}</span>
                        <span class="stat-label">Боёв</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function displayRankings(athletes) {
    const rankings = document.getElementById('rankings');

    if (athletes.length === 0) {
        rankings.innerHTML = '';
        return;
    }

    rankings.innerHTML = athletes.map((athlete, index) => {
        const rank = index + 4;
        return `
            <div class="rank-item">
                <div class="rank-number">${rank}</div>
                <img src="${athlete.photo_url || getDefaultPhoto(athlete.gender)}" 
                     alt="${athlete.first_name} ${athlete.last_name}" 
                     class="rank-photo"
                     onerror="this.src='${getDefaultPhoto(athlete.gender)}'">
                <div class="rank-info">
                    <div class="rank-name">${athlete.first_name} ${athlete.last_name}${athlete.gold_medals > 0 ? ` <span title="${athlete.gold_medals} золот." style="color:gold;">&#127942;${athlete.gold_medals > 1 ? athlete.gold_medals : ''}</span>` : ''}</div>
                    <div class="rank-belt belt-${athlete.belt_level?.toLowerCase() || 'белый'}">${athlete.belt_level || 'Белый'} пояс</div>
                </div>
                <div class="rank-stats">
                    <div class="rank-stat">
                        <span class="rank-stat-value">${athlete.total_points}</span>
                        <span class="rank-stat-label">Очки</span>
                    </div>
                    <div class="rank-stat">
                        <span class="rank-stat-value">${athlete.wins_count}W/${athlete.losses_count || 0}L</span>
                        <span class="rank-stat-label">W/L</span>
                    </div>
                    <div class="rank-stat">
                        <span class="rank-stat-value">${athlete.fights_count || 0}</span>
                        <span class="rank-stat-label">Боёв</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupAutoRotation() {
    if (autoRotationEnabled) startAutoRotation();
    updateRotationStatus();
}

function startAutoRotation() {
    if (autoRotationTimer) clearInterval(autoRotationTimer);
    autoRotationTimer = setInterval(() => nextCategory(), CONFIG.autoRotationInterval);
}

function stopAutoRotation() {
    if (autoRotationTimer) {
        clearInterval(autoRotationTimer);
        autoRotationTimer = null;
    }
}

function toggleAutoRotation() {
    autoRotationEnabled = !autoRotationEnabled;
    if (autoRotationEnabled) startAutoRotation();
    else stopAutoRotation();
    updateRotationStatus();
}

function updateRotationStatus() {
    const statusText = autoRotationEnabled ? 'Автосмена категорий: ВКЛ' : 'Автосмена категорий: ВЫКЛ';
    const btnText = autoRotationEnabled ? '<span>⏸</span> Стоп' : '<span>▶</span> Старт';

    document.getElementById('rotation-status').innerHTML = `
        <div class="status-dot" style="background: ${autoRotationEnabled ? 'var(--primary-blue)' : 'var(--text-muted)'}; box-shadow: ${autoRotationEnabled ? '0 0 10px var(--primary-blue)' : 'none'}; animation: ${autoRotationEnabled ? 'pulse 2s infinite' : 'none'}"></div>
        ${statusText}
    `;
    document.getElementById('rotation-btn-text').innerHTML = btnText;
}

function nextCategory() {
    currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
    displayCurrentCategory();
}

function previousCategory() {
    currentCategoryIndex = (currentCategoryIndex - 1 + categories.length) % categories.length;
    displayCurrentCategory();
}

function setupRefresh() {
    refreshTimer = setInterval(() => loadInitialData(), CONFIG.refreshInterval);
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('podium').style.display = 'none';
    document.getElementById('rankings').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('podium').style.display = 'flex';
    document.getElementById('rankings').style.display = 'grid';
}

function showEmpty() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('podium').style.display = 'none';
    document.getElementById('rankings').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

function showError(message) {
    const emptyState = document.getElementById('empty-state');
    emptyState.textContent = message;
    showEmpty();
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-update').textContent = timeString;
}

function getDefaultPhoto(gender) {
    if (gender === 'F') {
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Ccircle cx="100" cy="100" r="100" fill="%23e9ecef"/%3E%3Ctext x="100" y="115" font-size="80" text-anchor="middle" fill="%23495057"%3E👧%3C/text%3E%3C/svg%3E';
    }
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Ccircle cx="100" cy="100" r="100" fill="%23e9ecef"/%3E%3Ctext x="100" y="115" font-size="80" text-anchor="middle" fill="%23495057"%3E👦%3C/text%3E%3C/svg%3E';
}

async function fetchAPI(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
}

function handleKeyPress(e) {
    switch (e.key) {
        case 'ArrowRight': nextCategory(); break;
        case 'ArrowLeft': previousCategory(); break;
        case ' ': e.preventDefault(); toggleAutoRotation(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'r': case 'R': loadInitialData(); break;
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
        document.exitFullscreen();
    }
}

function handleFullscreenChange() {
    if (document.fullscreenElement) {
        document.body.classList.add('fullscreen-mode');
    } else {
        document.body.classList.remove('fullscreen-mode');
    }
}

window.addEventListener('beforeunload', () => {
    if (autoRotationTimer) clearInterval(autoRotationTimer);
    if (refreshTimer) clearInterval(refreshTimer);
});

function loadMoreRatings() {
    CONFIG.topCount += 50;
    const category = categories[currentCategoryIndex];
    loadAndDisplayRatings(category);
}

// ============= LEADERBOARD TABS =============

function switchLeaderboardTab(tab) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    if (tab === 'athletes') {
        document.getElementById('athletes-view').style.display = '';
        document.getElementById('branches-view').style.display = 'none';
    } else {
        document.getElementById('athletes-view').style.display = 'none';
        document.getElementById('branches-view').style.display = '';
        loadBranchRankings();
    }
}

async function loadBranchRankings() {
    const container = document.getElementById('branch-rankings-list');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Загрузка...</p></div>';

    try {
        const seasonParam = CONFIG.seasonId ? `?season_id=${CONFIG.seasonId}` : '';
        const rankings = await fetchAPI(`/ratings/branch-rankings${seasonParam}`);

        if (rankings.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.4);padding:2rem;">Нет данных</p>';
            return;
        }

        container.innerHTML = rankings.map((b, i) => `
            <div class="branch-rank-card">
                <div class="branch-rank-num">${i + 1}</div>
                <div class="branch-rank-info">
                    <div class="branch-rank-name">${b.name}</div>
                    <div class="branch-rank-city">${b.city || ''}</div>
                </div>
                <div class="branch-rank-stats">
                    <div class="branch-rank-stat">
                        <span class="branch-rank-stat-val">${b.total_points}</span>
                        <span class="branch-rank-stat-lbl">Очки</span>
                    </div>
                    <div class="branch-rank-stat">
                        <span class="branch-rank-stat-val">${b.athlete_count}</span>
                        <span class="branch-rank-stat-lbl">Спортсм.</span>
                    </div>
                    <div class="branch-rank-stat">
                        <span class="branch-rank-stat-val">${b.total_wins}</span>
                        <span class="branch-rank-stat-lbl">Побед</span>
                    </div>
                    <div class="branch-rank-stat">
                        <span class="branch-rank-stat-val">${b.avg_points}</span>
                        <span class="branch-rank-stat-lbl">Средн.</span>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.4);padding:2rem;">Ошибка загрузки</p>';
    }
}
