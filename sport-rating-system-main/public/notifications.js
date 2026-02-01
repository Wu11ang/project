// ================= NOTIFICATIONS DROPDOWN =================

function toggleNotifications() {
    const dropdown = document.getElementById('notification-dropdown');
    const isActive = dropdown.classList.contains('active');

    if (isActive) {
        dropdown.classList.remove('active');
    } else {
        dropdown.classList.add('active');
        loadNotificationsDropdown();
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    const bell = document.querySelector('.notification-bell');
    if (dropdown && !dropdown.contains(e.target) && !bell.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

async function loadNotificationsDropdown() {
    const body = document.getElementById('notification-dropdown-body');
    try {
        const isAthlete = window.location.pathname.includes('athlete');
        const endpoint = isAthlete ? '/athletes/activity-feed' : '/coaches/activity-feed';
        const feed = await fetchAPI(endpoint);

        if (feed.length === 0) {
            body.innerHTML = '<p class="text-center" style="padding: 2rem; color: var(--text-secondary);">Нет уведомлений</p>';
            return;
        }

        const lastRead = localStorage.getItem('lastReadNotificationTime') || new Date(0).toISOString();
        const ICONS = {
            win: '⚔️',
            loss: '🛡️',
            belt: '🥋',
            registration: '🏆',
            training: '📌',
            users: '👥',
            medal: '🏅'
        };

        body.innerHTML = feed.map(item => {
            const itemDate = item.date || item.time;
            const isUnread = new Date(itemDate) > new Date(lastRead);
            const title = item.text || item.title;
            const message = item.detail || item.message;

            return `
                <div class="notification-item ${isUnread ? 'unread' : ''}">
                    <div class="notification-icon">${ICONS[item.icon] || '🔔'}</div>
                    <div class="notification-content">
                        <div class="notification-title">${title}</div>
                        <div class="notification-message">${message}</div>
                        <div class="notification-time">${formatDateTime(itemDate)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Notification load error:', e);
        body.innerHTML = '<p class="text-center" style="padding: 2rem;">Ошибка загрузки</p>';
    }
}

function markAllAsRead() {
    localStorage.setItem('lastReadNotificationTime', new Date().toISOString());
    checkUnreadNotifications();
    loadNotificationsDropdown();
}

async function checkUnreadNotifications() {
    try {
        const isAthlete = window.location.pathname.includes('athlete');
        const endpoint = isAthlete ? '/athletes/activity-feed' : '/coaches/activity-feed';
        const lastRead = localStorage.getItem('lastReadNotificationTime') || new Date(0).toISOString();
        const feed = await fetchAPI(endpoint);

        const newItems = feed.filter(item => {
            const itemDate = item.date || item.time;
            return itemDate && new Date(itemDate) > new Date(lastRead);
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
