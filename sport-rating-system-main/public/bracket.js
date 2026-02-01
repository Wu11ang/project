// Imperial Bracket Logic
const API = '/api';
let competitionId = null;
let isAuthorized = false;
let bracketDataCache = null;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    competitionId = params.get('competition');

    // Check if user is logged in as coach/admin
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    isAuthorized = token && (user.role === 'coach' || user.role === 'admin');

    if (!competitionId) {
        showError('ID соревнования не указан');
        return;
    }

    animateEntry();
    loadCompetitionData();
});

function animateEntry() {
    // Staggered animation for initial load handled by CSS classes
}

async function loadCompetitionData() {
    try {
        // Fetch real bracket data
        const res = await fetch(`${API}/competitions/${competitionId}/bracket`);

        if (!res.ok) {
            throw new Error('Турнир не найден');
        }

        const data = await res.json();
        bracketDataCache = data;
        renderHeader(data);
        renderCategoryTabs(data.categories);

        // Hide loader
        const loader = document.getElementById('page-loading');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }

    } catch (err) {
        console.error(err);
        showError();
    }
}

function renderHeader(data) {
    const title = document.getElementById('comp-title');
    const badge = document.getElementById('competition-badge');
    const date = document.getElementById('comp-date');
    const location = document.getElementById('comp-location');

    title.textContent = data.competition || 'Турнирная Сетка';
    document.title = `Сетка - ${data.competition}`;

    if (data.competition_date) {
        const d = new Date(data.competition_date);
        date.textContent = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } else if (data.season_name) {
        date.textContent = data.season_name;
    } else {
        date.textContent = '';
    }
    location.textContent = data.location || '';
}

function renderCategoryTabs(categories) {
    const container = document.getElementById('category-tabs');
    container.innerHTML = '';

    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="empty-state-text">Нет активных категорий</div>';
        return;
    }

    // Group by gender (M/F)
    const maleCategories = categories.filter(c => c.category.startsWith('M ') || c.category.startsWith('М ') || !c.category.startsWith('F ') && !c.category.startsWith('Ж '));
    const femaleCategories = categories.filter(c => c.category.startsWith('F ') || c.category.startsWith('Ж '));

    // If there are both genders, add labels
    const hasBoth = maleCategories.length > 0 && femaleCategories.length > 0;

    let isFirst = true;

    function addGroup(label, cats) {
        if (cats.length === 0) return;
        if (hasBoth) {
            const lbl = document.createElement('span');
            lbl.className = 'category-group-label';
            lbl.textContent = label;
            lbl.style.cssText = 'font-size:0.7rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;padding:0 0.5rem;align-self:center;';
            container.appendChild(lbl);
        }
        cats.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `category-tab ${isFirst ? 'active' : ''}`;
            btn.textContent = cat.category;
            btn.onclick = () => {
                document.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderBracket(cat);
            };
            container.appendChild(btn);
            if (isFirst) {
                renderBracket(cat);
                isFirst = false;
            }
        });
    }

    addGroup('Мужчины', maleCategories);
    addGroup('Женщины', femaleCategories);
}

function renderBracket(category) {
    const container = document.getElementById('bracket-container');
    const matches = category.matches || [];

    if (matches.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎲</div>
                <h3>Сетка пуста</h3>
                <p>Матчи для этой категории еще не сформированы.</p>
            </div>
        `;
        return;
    }

    // Organize by rounds
    const roundsMap = {};
    let maxRound = 0;

    matches.forEach(m => {
        if (!roundsMap[m.round_number]) roundsMap[m.round_number] = [];
        roundsMap[m.round_number].push(m);
        if (m.round_number > maxRound) maxRound = m.round_number;
    });

    // Sort matches in each round
    Object.keys(roundsMap).forEach(r => {
        roundsMap[r].sort((a, b) => a.match_number - b.match_number);
    });

    // Build Grid
    let html = '<div class="bracket">';

    for (let r = 1; r <= maxRound; r++) {
        html += `<div class="bracket-round">`;
        html += `<div class="round-title">${getRoundLabel(r, maxRound)}</div>`;

        roundsMap[r].forEach(match => {
            html += renderMatchCard(match);
        });

        html += `</div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // Draw connectors after rendering
    requestAnimationFrame(() => drawConnectors(container));
}

function drawConnectors(container) {
    // Remove any existing connectors
    container.querySelectorAll('.bracket-connector').forEach(c => c.remove());

    const bracket = container.querySelector('.bracket');
    if (!bracket) return;

    const rounds = bracket.querySelectorAll('.bracket-round');
    const bracketRect = bracket.getBoundingClientRect();

    for (let i = 0; i < rounds.length - 1; i++) {
        const currentMatches = rounds[i].querySelectorAll('.bracket-match');
        const nextMatches = rounds[i + 1].querySelectorAll('.bracket-match');

        // Each pair of matches in current round feeds into one match in next round
        for (let j = 0; j < nextMatches.length; j++) {
            const m1 = currentMatches[j * 2];
            const m2 = currentMatches[j * 2 + 1];
            const target = nextMatches[j];

            if (!m1 || !target) continue;

            const card1 = m1.querySelector('.match-card');
            const cardTarget = target.querySelector('.match-card');
            if (!card1 || !cardTarget) continue;

            const r1 = card1.getBoundingClientRect();
            const rTarget = cardTarget.getBoundingClientRect();

            // Vertical line between the two source matches
            if (m2) {
                const card2 = m2.querySelector('.match-card');
                if (card2) {
                    const r2 = card2.getBoundingClientRect();
                    const x = r1.right - bracketRect.left + 16;
                    const y1 = r1.top + r1.height / 2 - bracketRect.top;
                    const y2 = r2.top + r2.height / 2 - bracketRect.top;

                    const vLine = document.createElement('div');
                    vLine.className = 'bracket-connector';
                    vLine.style.cssText = `position:absolute;left:${x}px;top:${y1}px;width:1px;height:${y2 - y1}px;background:rgba(255,255,255,0.12);pointer-events:none;`;
                    bracket.appendChild(vLine);

                    // Horizontal line from vertical midpoint to next match
                    const midY = (y1 + y2) / 2;
                    const xTarget = rTarget.left - bracketRect.left - 16;
                    const hLine = document.createElement('div');
                    hLine.className = 'bracket-connector';
                    hLine.style.cssText = `position:absolute;left:${x}px;top:${midY}px;width:${xTarget - x}px;height:1px;background:rgba(255,255,255,0.12);pointer-events:none;`;
                    bracket.appendChild(hLine);
                }
            }
        }
    }

    // Ensure bracket is positioned relative for absolute children
    bracket.style.position = 'relative';
}

function renderMatchCard(match) {
    const p1 = {
        name: match.athlete1_name || (match.is_bye ? '' : 'TBD'),
        score: match.score1 ?? '-',
        isWinner: match.winner_id && match.winner_id === match.athlete1_id
    };

    const p2 = {
        name: match.athlete2_name || (match.is_bye ? 'BYE' : 'TBD'),
        score: match.score2 ?? '-',
        isWinner: match.winner_id && match.winner_id === match.athlete2_id
    };

    const statusBadge = match.winner_id ?
        `<span class="result-badge">${match.result_type || 'Завершен'}</span>` :
        `<span class="info-badge">#${match.match_number}</span>`;

    // Show "Record result" button for authorized users on unfinished, non-BYE matches with both athletes
    const canRecord = isAuthorized && !match.winner_id && !match.is_bye && match.athlete1_id && match.athlete2_id;
    const resultBtn = canRecord
        ? `<button class="match-result-btn" onclick="openResultModal(${match.id}, '${escapeHtml(p1.name)}', '${escapeHtml(p2.name)}', ${match.athlete1_id}, ${match.athlete2_id})">Записать результат</button>`
        : '';

    const byeClass = match.is_bye ? ' bye-match' : '';

    return `
        <div class="bracket-match${byeClass}">
            <div class="match-card">
                <div class="match-meta">
                    ${statusBadge}
                </div>
                <div class="competitors">
                    <div class="competitor ${p1.isWinner ? 'winner' : ''}">
                        <div class="name">${escapeHtml(p1.name)}</div>
                        <div class="score">${p1.score}</div>
                    </div>
                    <div class="competitor ${p2.isWinner ? 'winner' : ''}">
                        <div class="name">${escapeHtml(p2.name)}</div>
                        <div class="score">${p2.score}</div>
                    </div>
                </div>
                ${resultBtn}
            </div>
        </div>
    `;
}

function getRoundLabel(round, max) {
    const diff = max - round;
    if (diff === 0) return 'ФИНАЛ';
    if (diff === 1) return 'ПОЛУФИНАЛ';
    if (diff === 2) return '1/4 ФИНАЛА';
    return `РАУНД ${round}`;
}

function showError() {
    document.getElementById('page-loading').style.display = 'none';
    document.getElementById('error-state').style.display = 'flex';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============= RESULT RECORDING =============

function openResultModal(matchId, name1, name2, id1, id2) {
    document.getElementById('result-match-id').value = matchId;
    document.getElementById('result-match-info').innerHTML = `<strong>${name1}</strong> vs <strong>${name2}</strong>`;
    const sel = document.getElementById('result-winner');
    sel.innerHTML = `
        <option value="">Выберите победителя</option>
        <option value="${id1}">${name1}</option>
        <option value="${id2}">${name2}</option>
    `;
    document.getElementById('result-score1').value = 0;
    document.getElementById('result-score2').value = 0;
    document.getElementById('result-modal').style.display = 'flex';
}

function closeResultModal() {
    document.getElementById('result-modal').style.display = 'none';
}

async function submitMatchResult(e) {
    e.preventDefault();
    const matchId = document.getElementById('result-match-id').value;
    const winnerId = document.getElementById('result-winner').value;
    const resultType = document.getElementById('result-type').value;
    const score1 = parseInt(document.getElementById('result-score1').value) || 0;
    const score2 = parseInt(document.getElementById('result-score2').value) || 0;

    if (!winnerId) return;

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API}/competitions/${competitionId}/bracket/${matchId}/result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                winner_id: parseInt(winnerId),
                result_type: resultType,
                athlete1_score: score1,
                athlete2_score: score2
            })
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Ошибка');
            return;
        }

        closeResultModal();
        // Reload bracket data
        await loadCompetitionData();
    } catch (err) {
        alert('Ошибка сети: ' + err.message);
    }
}
