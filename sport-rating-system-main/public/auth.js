const API_URL = '/api';

let branches = [];
let coaches = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = 'admin.html';
        return;
    }

    setupForms();
    loadBranches();
    loadDisciplines();
});

// Setup form handlers
function setupForms() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('register-branch').addEventListener('change', handleBranchChange);
}

// Show/hide forms
function showLogin(e) {
    if (e) e.preventDefault();
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    loginForm.classList.add('active');
    registerForm.classList.remove('active');

    // Clear inline styles that might have been set by showLoading
    loginForm.style.display = '';
    registerForm.style.display = '';

    // Reset registration to step 1 if we ever go back
    currentStep = 1;
    updateStepIndicators();
    document.querySelectorAll('.form-step-container').forEach((s, i) => {
        s.classList.toggle('active', i === 0);
    });

    hideError();
}

function showRegister(e) {
    if (e) e.preventDefault();
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    registerForm.classList.add('active');
    loginForm.classList.remove('active');

    // Clear inline styles
    loginForm.style.display = '';
    registerForm.style.display = '';

    hideError();
}

// Toggle role-specific fields
function toggleRoleFields() {
    const role = document.getElementById('register-role').value;
    const athleteFields = document.getElementById('athlete-fields');
    // For coaching role, we'll only show specific fields in Step 2.
    // Logic will be handled during step transitions.
}

// ============= STEP NAVIGATION =============

let currentStep = 1;

function updateStepIndicators() {
    document.querySelectorAll('.reg-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        if (stepNum === currentStep) {
            step.classList.add('active');
        } else if (stepNum < currentStep) {
            step.classList.add('completed');
        }
    });
}

function nextStep(step) {
    const role = document.getElementById('register-role').value;
    if (!role && step === 1) {
        showError('Выберите роль');
        return;
    }

    // Step 1 validation
    if (step === 1) {
        const firstName = document.getElementById('register-first-name').value;
        const lastName = document.getElementById('register-last-name').value;
        const phone = document.getElementById('register-phone').value;
        const password = document.getElementById('register-password').value;

        if (!firstName || !lastName || !phone || !password) {
            showError('Заполните все важные поля');
            return;
        }
        if (password.length < 6) {
            showError('Пароль минимум 6 символов');
            return;
        }

        // Branch/Coach loading logic is already global, but let's ensure fields visibility
        const athleteFields = document.getElementById('athlete-fields');
        if (role === 'coach') {
            athleteFields.style.display = 'none';
        } else {
            athleteFields.style.display = 'grid';
        }
    }

    hideError();
    document.getElementById(`step-${step}`).classList.remove('active');
    currentStep = step + 1;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    updateStepIndicators();
}

function prevStep(step) {
    hideError();
    document.getElementById(`step-${step}`).classList.remove('active');
    currentStep = step - 1;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    updateStepIndicators();
}

// Load branches
async function loadBranches() {
    try {
        const response = await fetch(`${API_URL}/branches`);
        branches = await response.json();

        const select = document.getElementById('register-branch');
        select.innerHTML = '<option value="">Выберите филиал</option>';
        branches.forEach(branch => {
            select.innerHTML += `<option value="${branch.id}">${branch.name} - ${branch.city || ''}</option>`;
        });
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Load disciplines
async function loadDisciplines() {
    try {
        const response = await fetch(`${API_URL}/disciplines`);
        const disciplines = await response.json();
        const select = document.getElementById('register-discipline');
        select.innerHTML = '<option value="">Выберите вид</option>';
        disciplines.forEach(d => {
            select.innerHTML += `<option value="${d.name}">${d.display_name}</option>`;
        });
    } catch (error) {
        console.error('Error loading disciplines:', error);
        const select = document.getElementById('register-discipline');
        select.innerHTML = `
            <option value="">Выберите вид</option>
            <option value="Judo">Дзюдо</option>
            <option value="BJJ">Бразильское Джиу-Джитсу</option>
            <option value="MMA">ММА</option>
        `;
    }
}

// Load coaches when branch selected
async function handleBranchChange() {
    const branchId = document.getElementById('register-branch').value;
    const coachSelect = document.getElementById('register-coach');

    if (!branchId) {
        coachSelect.innerHTML = '<option value="">Сначала выберите филиал</option>';
        return;
    }

    try {
        coachSelect.innerHTML = '<option value="">Загрузка...</option>';
        const response = await fetch(`${API_URL}/coaches/branch/${branchId}`);
        coaches = await response.json();

        if (coaches.length === 0) {
            coachSelect.innerHTML = '<option value="">Нет тренеров в этом филиале</option>';
            return;
        }

        coachSelect.innerHTML = '<option value="">Выберите тренера</option>';
        coaches.forEach(coach => {
            coachSelect.innerHTML += `<option value="${coach.id}">${coach.first_name} ${coach.last_name}</option>`;
        });
    } catch (error) {
        console.error('Error loading coaches:', error);
        coachSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;

    if (!phone || !password) {
        showError('Заполните все поля');
        return;
    }

    showLoading();

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка входа');
        }

        // Save token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Redirect based on role
        if (data.user.role === 'admin') {
            window.location.href = 'admin.html';
        } else if (data.user.role === 'coach') {
            window.location.href = 'coach-dashboard.html';
        } else if (data.user.role === 'athlete') {
            window.location.href = 'athlete-dashboard.html';
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();

    const role = document.getElementById('register-role').value;
    const firstName = document.getElementById('register-first-name').value.trim();
    const lastName = document.getElementById('register-last-name').value.trim();
    const phone = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;
    const branchId = document.getElementById('register-branch').value;

    // Validation
    if (!role || !firstName || !lastName || !phone || !password) {
        showError('Заполните все обязательные поля');
        return;
    }

    if (password.length < 6) {
        showError('Пароль должен быть минимум 6 символов');
        return;
    }

    if (!branchId) {
        showError('Выберите филиал');
        return;
    }

    const discipline = document.getElementById('register-discipline').value || null;

    const data = {
        role,
        first_name: firstName,
        last_name: lastName,
        phone,
        password,
        branch_id: parseInt(branchId)
    };

    // Athlete-specific fields
    if (role === 'athlete') {
        const coachId = document.getElementById('register-coach').value;
        if (!coachId) {
            showError('Выберите тренера');
            return;
        }

        data.coach_id = parseInt(coachId);
        data.birth_date = document.getElementById('register-birth-date').value || null;
        data.gender = document.getElementById('register-gender').value || null;
        data.height = parseInt(document.getElementById('register-height').value) || null;
        data.weight = parseFloat(document.getElementById('register-weight').value) || null;
        data.martial_art = discipline;
    }

    // Coach-specific fields
    if (role === 'coach') {
        data.specialization = discipline;
    }

    showLoading();

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Ошибка регистрации');
        }

        hideLoading();

        if (result.needsApproval) {
            showSuccess('Регистрация успешна! Ожидайте подтверждения от тренера.');
            setTimeout(() => showLogin(), 3000);
        } else {
            showSuccess('Регистрация успешна! Теперь вы можете войти.');
            setTimeout(() => showLogin(), 2000);
        }

        // Clear form
        document.getElementById('register-form').reset();
        toggleRoleFields();
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// Weight category auto-calculation
const weightCategoriesMap = {
    M: [
        { min: 0, max: 50, name: '50 кг' },
        { min: 50.01, max: 55, name: '55 кг' },
        { min: 55.01, max: 60, name: '60 кг' },
        { min: 60.01, max: 66, name: '66 кг' },
        { min: 66.01, max: 73, name: '73 кг' },
        { min: 73.01, max: 81, name: '81 кг' },
        { min: 81.01, max: 90, name: '90 кг' },
        { min: 90.01, max: 100, name: '100 кг' },
        { min: 100.01, max: 999, name: '+100 кг' }
    ],
    F: [
        { min: 0, max: 40, name: '40 кг' },
        { min: 40.01, max: 44, name: '44 кг' },
        { min: 44.01, max: 48, name: '48 кг' },
        { min: 48.01, max: 52, name: '52 кг' },
        { min: 52.01, max: 57, name: '57 кг' },
        { min: 57.01, max: 63, name: '63 кг' },
        { min: 63.01, max: 70, name: '70 кг' },
        { min: 70.01, max: 78, name: '78 кг' },
        { min: 78.01, max: 999, name: '+78 кг' }
    ]
};

function updateWeightCategory() {
    const gender = document.getElementById('register-gender').value;
    const weight = parseFloat(document.getElementById('register-weight').value);
    const categoryInput = document.getElementById('register-weight-category');

    if (!gender || !weight || weight <= 0) {
        categoryInput.value = '';
        categoryInput.placeholder = 'Укажите пол и вес';
        return;
    }

    const categories = weightCategoriesMap[gender];
    if (!categories) {
        categoryInput.value = '';
        return;
    }

    const match = categories.find(c => weight >= c.min && weight <= c.max);
    categoryInput.value = match ? match.name : 'Не определена';
}

// UI helpers
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    const activeForm = document.querySelector('.auth-form.active');
    if (activeForm) {
        activeForm.style.display = ''; // Let CSS handle it
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.className = 'error-message';

    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.className = 'success-message';
}

function hideError() {
    document.getElementById('error-message').style.display = 'none';
}
