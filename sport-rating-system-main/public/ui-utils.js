/* ============================================
   ORTUS JUDO — Shared UI Utilities
   Toast, Confirm, Loading, Helpers
   ============================================ */

// ============= TOAST SYSTEM =============

function ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info', duration = 4000) {
  const container = ensureToastContainer();
  const icons = {
    success: '\u2705',
    error: '\u274C',
    warning: '\u26A0\uFE0F',
    info: '\u2139\uFE0F'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  toast.style.animationDuration = '0.3s, 0.3s';
  toast.style.animationDelay = `0s, ${duration / 1000}s`;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, duration + 400);
}

function showSuccess(msg) { showToast(msg, 'success'); }
function showError(msg) { showToast(msg, 'error', 5000); }
function showWarning(msg) { showToast(msg, 'warning'); }
function showInfo(msg) { showToast(msg, 'info'); }

// ============= CONFIRM DIALOG =============

function showConfirm(title, message, onConfirm, confirmText = 'Подтвердить', cancelText = 'Отмена') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">${cancelText}</button>
          <button class="btn btn-danger confirm-ok">${confirmText}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
      if (result && onConfirm) onConfirm();
    };

    overlay.querySelector('.confirm-cancel').onclick = () => close(false);
    overlay.querySelector('.confirm-ok').onclick = () => close(true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-ok').focus();
  });
}

// ============= LOADING STATES =============

function showLoading(container, text = 'Загрузка...') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner spinner-lg"></div>
      <span>${text}</span>
    </div>
  `;
}

function showEmpty(container, icon, title, text) {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      ${text ? `<div class="empty-state-text">${text}</div>` : ''}
    </div>
  `;
}

function showSkeletonCards(container, count = 3) {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = Array(count).fill(0).map(() => `
    <div class="skeleton skeleton-card"></div>
  `).join('');
}

// ============= MOBILE NAV TOGGLE =============

function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.nav-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    menu.classList.toggle('nav-open');
    toggle.classList.toggle('nav-toggle-active');
  });

  // Close menu on link click
  menu.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('click', () => {
      menu.classList.remove('nav-open');
      toggle.classList.remove('nav-toggle-active');
    });
  });
}

// ============= FORM VALIDATION =============

function validateForm(formElement) {
  const errors = [];
  const inputs = formElement.querySelectorAll('[required]');

  inputs.forEach(input => {
    input.classList.remove('input-error');
    const label = input.closest('.form-group')?.querySelector('label')?.textContent || input.name;

    if (!input.value.trim()) {
      errors.push(`${label} — обязательное поле`);
      input.classList.add('input-error');
    }
  });

  // Phone validation
  const phoneInput = formElement.querySelector('[name="phone"]');
  if (phoneInput && phoneInput.value && !/^\+?[0-9]{10,15}$/.test(phoneInput.value.replace(/\s/g, ''))) {
    errors.push('Неверный формат телефона');
    phoneInput.classList.add('input-error');
  }

  // Password validation
  const passInput = formElement.querySelector('[name="password"]');
  if (passInput && passInput.value && passInput.value.length < 6) {
    errors.push('Пароль должен содержать минимум 6 символов');
    passInput.classList.add('input-error');
  }

  if (errors.length > 0) {
    showError(errors[0]);
    return false;
  }
  return true;
}

// ============= DATE FORMATTER =============

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============= ESCAPE HTML =============

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============= DEBOUNCE =============

function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============= INIT ON DOM READY =============

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
});
