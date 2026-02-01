const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const branchId = urlParams.get('id');

    if (!branchId) {
        showError();
        return;
    }

    loadBranchProfile(branchId);
});

async function loadBranchProfile(branchId) {
    try {
        const response = await fetch(`${API_URL}/branch-profile/${branchId}`);
        if (!response.ok) throw new Error('Branch not found');
        const data = await response.json();

        renderPage(data);
        hideLoading();
    } catch (err) {
        console.error('Error loading branch:', err);
        showError();
    }
}

function renderPage(data) {
    // Basic Info
    document.getElementById('branch-name').textContent = data.branch.name;
    document.getElementById('branch-location').textContent = data.branch.city || 'Региональный центр';
    document.getElementById('branch-address').textContent = data.branch.address || '';
    document.title = 'Ortus Judo - ' + data.branch.name;

    // Badge
    const coachBadge = document.getElementById('coach-count-badge');
    if (coachBadge) coachBadge.textContent = data.coaches ? data.coaches.length : 0;

    // Stats
    animateCounter('stat-athletes', data.stats.total_athletes);
    animateCounter('stat-coaches', data.stats.total_coaches);
    animateCounter('stat-wins', data.stats.total_wins);
    animateCounter('stat-score', data.stats.branch_score);

    // Analytics
    renderRatingBars(data.stats);

    // Grid Contents
    renderCoaches(data.coaches);
    renderTopAthletes(data.topAthletes);
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;

    let count = 0;
    const duration = 1500;
    const step = target / (duration / 16);

    function update() {
        count += step;
        if (count < target) {
            el.textContent = Math.floor(count).toLocaleString('ru-RU');
            requestAnimationFrame(update);
        } else {
            el.textContent = target.toLocaleString('ru-RU');
        }
    }
    update();
}

function renderRatingBars(stats) {
    setBar('bar-points', 'val-points', stats.branch_score, 10000);
    setBar('bar-avg', 'val-avg', stats.avg_points_per_athlete, 500);
}

function setBar(barId, valId, value, maxValue) {
    const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
    const fill = document.getElementById(barId);
    const val = document.getElementById(valId);
    if (fill) fill.style.width = Math.max(pct, 4) + '%';
    if (val) val.textContent = value.toLocaleString('ru-RU');
}

function renderCoaches(coaches) {
    const grid = document.getElementById('coaches-grid');
    const block = document.getElementById('block-coaches');
    if (!grid) return;

    if (!coaches || coaches.length === 0) {
        if (block) block.style.display = 'none';
        return;
    }
    if (block) block.style.display = 'block';

    grid.innerHTML = coaches.map((coach, i) => {
        const initials = ((coach.first_name || '')[0] || '') + ((coach.last_name || '')[0] || '');
        const exp = coach.experience_years ? coach.experience_years + ' лет' : 'Мастер';
        return `
        <div class="coach-card" onclick="openCoachPanel(${coach.id}, '${escapeHtml(coach.first_name + ' ' + coach.last_name)}', '${escapeHtml(coach.specialization || 'Judo Master')}')">
            <div class="coach-avatar">${escapeHtml(initials)}</div>
            <div class="coach-name">${escapeHtml(coach.first_name)} ${escapeHtml(coach.last_name)}</div>
            <div class="coach-spec">${escapeHtml(coach.specialization || 'Инструктор Judo')}</div>
            <div class="coach-meta">
                <span>⚡ ${exp} опыта</span>
                <span>👥 ${coach.athlete_count} учеников</span>
            </div>
        </div>
        `;
    }).join('');
}

function renderTopAthletes(athletes) {
    const grid = document.getElementById('athletes-grid');
    const block = document.getElementById('block-athletes');
    if (!grid) return;

    if (!athletes || athletes.length === 0) {
        if (block) block.style.display = 'none';
        return;
    }
    if (block) block.style.display = 'block';

    grid.innerHTML = athletes.map((a, i) => `
        <div class="athlete-card">
            <div class="athlete-rank">#${i + 1}</div>
            <img src="${a.photo_url || getDefaultPhoto(a.gender)}" 
                 class="athlete-photo" 
                 onerror="this.src='${getDefaultPhoto(a.gender)}'"
                 alt="${escapeHtml(a.first_name)}">
            <div class="athlete-name">
                <div style="font-weight:800;">${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</div>
                <div class="belt-badge ${getBeltClass(a.belt_level)}" style="font-size:0.65rem; padding:2px 8px; display:inline-block; margin-top:4px; opacity:0.8;">${escapeHtml(a.belt_level)}</div>
            </div>
            <div class="athlete-stats-row">
                <div class="item">🔥 <strong>${a.total_points || 0}</strong></div>
                <div class="item">🏆 <strong>${a.wins_count || 0}</strong></div>
            </div>
        </div>
    `).join('');
}

async function openCoachPanel(coachId, coachName, spec) {
    const panel = document.getElementById('coach-panel');
    const header = document.getElementById('panel-header');
    const athletesDiv = document.getElementById('panel-athletes');

    const initials = coachName.split(' ').map(n => n[0]).join('');

    header.innerHTML = `
        <div class="coach-avatar" style="width:100px; height:100px; font-size:2.5rem; margin-bottom:1.5rem; background:linear-gradient(135deg, var(--accent), #8b5cf6);">${escapeHtml(initials)}</div>
        <h3 style="font-size:3rem; line-height:1; font-family:var(--font-family-heading); font-weight:950;">${escapeHtml(coachName)}</h3>
        <p style="color:var(--accent); font-weight:800; font-size:1rem; text-transform:uppercase; margin-top:0.8rem; letter-spacing:0.15em;">${escapeHtml(spec)}</p>
    `;
    athletesDiv.innerHTML = '<div class="loader-circle" style="width:40px; height:40px; margin: 4rem auto;"></div>';

    panel.style.display = 'flex';
    setTimeout(() => panel.classList.add('active'), 10);

    try {
        const res = await fetch(`${API_URL}/coaches/${coachId}/athletes`);
        if (!res.ok) throw new Error('API Error');
        const athletes = await res.json();

        if (athletes.length === 0) {
            athletesDiv.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:3rem; font-weight:600;">Нет активных спортсменов</p>';
        } else {
            athletesDiv.innerHTML = athletes.map(a => `
                <div class="athlete-card" style="margin-bottom:1.2rem; background:rgba(255,255,255,0.03); grid-template-columns: 60px 1fr auto; padding: 1.2rem 2rem;">
                    <img src="${a.photo_url || getDefaultPhoto(a.gender)}" 
                         class="athlete-photo" 
                         onerror="this.src='${getDefaultPhoto(a.gender)}'"
                         style="width:50px; height:50px; border-width:2px;">
                    <div class="athlete-name" style="font-size:1.2rem;">${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</div>
                    <div class="belt-badge ${getBeltClass(a.belt_level)}" style="background:rgba(255,255,255,0.05); padding: 5px 15px; border-radius:100px; font-size:0.75rem; font-weight:900; border:1px solid rgba(255,255,255,0.1);">${escapeHtml(a.belt_level)}</div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Panel Error:', err);
        athletesDiv.innerHTML = `
            <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2); padding:2rem; border-radius:24px; text-align:center;">
                <p style="color:#ef4444; font-weight:800; margin-bottom:0.5rem;">Ошибка синхронизации</p>
                <p style="color:rgba(239, 68, 68, 0.6); font-size:0.9rem;">Не удалось загрузить список спортсменов.</p>
            </div>
        `;
    }
}

function closeCoachPanel() {
    const panel = document.getElementById('coach-panel');
    panel.classList.remove('active');
    setTimeout(() => panel.style.display = 'none', 600);
}

function hideLoading() {
    const loader = document.getElementById('page-loading');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 600);
    }
}

function showError() {
    const loader = document.getElementById('page-loading');
    const content = document.querySelector('.elite-wrapper');
    const error = document.getElementById('error-state');

    if (loader) loader.style.display = 'none';
    if (content) content.style.display = 'none';
    if (error) error.style.display = 'flex';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getDefaultPhoto(gender) {
    return gender === 'female' ? 'images/avatar-female.png' : 'images/avatar-male.png';
}

function getBeltClass(belt) {
    if (!belt) return 'belt-white';
    const b = belt.toLowerCase();
    if (b.includes('black')) return 'belt-black';
    if (b.includes('brown')) return 'belt-brown';
    if (b.includes('blue')) return 'belt-blue';
    if (b.includes('yellow')) return 'belt-yellow';
    if (b.includes('orange')) return 'belt-orange';
    if (b.includes('green')) return 'belt-green';
    return 'belt-white';
}
