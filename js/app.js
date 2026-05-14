// ============================================
// app.js - CloseDraft Dashboard Logic
// ============================================

// ==================== GLOBAL VARIABLES ====================
let clients = [];
let selectedClientId = null;
let clientToDelete = null;
let currentFilter = 'all';
let currentSearchQuery = '';
let currentSort = 'name-asc';  // ← ADD THIS
let generatedSubject = '';
let generatedBody = '';
let currentEmailClient = null;
let currentPage = 'dashboard';
let currentEmailFilter = 'all';
let allEmails = [];
let currentDetailEmail = null;
let csvData = [];
let csvHeaders = [];
let showArchived = false;
let templates = [];
let currentTemplate = null;
let templateToDelete = null;
let generatedSubjectA = '';
let generatedSubjectB = '';
let currentSubjectChoice = 'A';
let confirmCallback = null;

// --- New global declarations for page & nav elements ---
let dashboardPage, clientsPage, emailsPage, templatesPage, analyticsPage, settingsPage, sequencesPage, campaignsPage;
let dashboardNav, clientsNav, emailsNav, templatesNav, analyticsNav, settingsNav, campaignsNav, sequencesNav;

// Wait for auth to set userSettings
if (!window.userSettings || window.userSettings.name === 'Freelancer') {
    console.log('⏳ Waiting for user settings...');
    // Retry after a short delay
    setTimeout(() => {
        refreshUserSettings();
        if (currentPage === 'dashboard') {
            updateDashboardGreeting();
        }
    }, 500);
}

let userSettings = window.userSettings || {
    name: 'Freelancer',
    email: '',
    id: null
};

// Function to refresh settings from global
function refreshUserSettings() {
    if (window.userSettings) {
        userSettings.name = window.userSettings.name;
        userSettings.email = window.userSettings.email;
        userSettings.id = window.userSettings.id;
    }
}

// ============================================
// PLAN LIMITS
// ============================================

function getUserPlan() {
    // Get plan from profiles table (set during auth/webhook)
    // For now, default to 'free' if not set
    return window.userPlan || 'free';
}

function getClientLimit() {
    const plan = getUserPlan();
    return plan === 'free' ? 10 : Infinity;
}

function getEmailLimit() {
    const plan = getUserPlan();
    return plan === 'free' ? 20 : Infinity;
}

function checkClientLimit() {
    const limit = getClientLimit();
    const currentCount = clients.filter(c => !c.archived).length;

    if (currentCount >= limit) {
        showUpgradeModal('clients');
        return false;
    }
    return true;
}

function showUpgradeModal(type) {
    const modal = document.getElementById('upgradeModal');
    const messageEl = document.getElementById('upgradeMessage');
    if (!modal || !messageEl) return;

    const messages = {
        'clients': "You've reached the free limit of 10 clients.",
        'emails': "You've reached the free limit of 15 AI emails this month.",
        'campaigns': "AutoDraft campaigns are available on the Pro plan.",
        'gmail': "Gmail integration is available on the Pro plan.",
        'discord': "Discord notifications are available on the Pro plan.",
        'telegram': "Telegram notifications are available on the Pro plan.",
        'invoices': "Invoice generator is available on the Pro plan."
    };
    messageEl.textContent = messages[type] || "You've reached the free limit.";
    modal.classList.remove('hidden');
}

function showConfirmModal(message, callback, title = 'Confirm Action', btnText = 'Delete') {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMessage');
    const titleEl = document.getElementById('confirmTitle');
    const btnEl = document.getElementById('confirmBtn');
    if (!modal || !msgEl || !titleEl || !btnEl) return;

    msgEl.textContent = message;
    titleEl.textContent = title;
    btnEl.textContent = btnText;
    confirmCallback = callback;
    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmCallback = null;
}

function confirmAction() {
    if (typeof confirmCallback === 'function') {
        confirmCallback();
    }
    closeConfirmModal();
}

// ==================== AUTH TOKEN HELPER ====================
async function getAuthToken() {
    const { data: { session } } = await window.supabase.auth.getSession();
    return session?.access_token || null;
}

async function authFetch(url, options = {}) {
    const token = await getAuthToken();
    if (!token) {
        console.error('❌ No auth token available');
        throw new Error('Not authenticated');
    }

    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        }
    });
}

// ==================== USER SETTINGS ====================


// ============================================
// LOADING SKELETONS
// ============================================

function showClientListSkeleton() {
    const container = document.getElementById('clientListContainer');
    const emptyState = document.getElementById('emptyState');
    const template = document.getElementById('clientListSkeletonTemplate');

    if (!container) return;

    container.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');

    if (template) {
        for (let i = 0; i < 3; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'skeleton-card mb-3';
            skeletonCard.innerHTML = template.innerHTML;
            container.appendChild(skeletonCard);
        }
    }
}

function showEmailListSkeleton() {
    const container = document.getElementById('emailHistoryList');
    const emptyState = document.getElementById('emailEmptyState');
    const template = document.getElementById('emailListSkeletonTemplate');

    if (!container) return;

    container.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');

    if (template) {
        for (let i = 0; i < 3; i++) {
            const skeletonRow = document.createElement('div');
            skeletonRow.className = 'grid grid-cols-12 items-center px-6 py-4';
            skeletonRow.innerHTML = template.innerHTML;
            container.appendChild(skeletonRow);
        }
    }
}

// ==================== CLIENT SEARCH FUNCTIONS ====================
function handleClientSearch() {
    const searchInput = document.getElementById('clientSearch');
    if (!searchInput) return;

    currentSearchQuery = searchInput.value.toLowerCase().trim();
    renderClientList();
    renderAttentionSection();
}

function filterClientsBySearch(clientsArray) {
    if (!currentSearchQuery) return clientsArray;

    return clientsArray.filter(client => {
        return (
            client.name?.toLowerCase().includes(currentSearchQuery) ||
            client.business?.toLowerCase().includes(currentSearchQuery) ||
            client.email?.toLowerCase().includes(currentSearchQuery) ||
            client.project?.toLowerCase().includes(currentSearchQuery)
        );
    });
}

// ============================================
// CLIENT SORTING
// ============================================

function sortClientsList() {
    const sortSelect = document.getElementById('sortClients');
    if (!sortSelect) return;

    currentSort = sortSelect.value;
    renderClientList();
    renderAttentionSection();
}

function sortClientsArray(clientsArray) {
    const sorted = [...clientsArray];

    switch (currentSort) {
        case 'name-asc':
            return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        case 'name-desc':
            return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        case 'date-newest':
            return sorted.sort((a, b) => new Date(b.last_contacted || 0) - new Date(a.last_contacted || 0));
        case 'date-oldest':
            return sorted.sort((a, b) => new Date(a.last_contacted || 0) - new Date(b.last_contacted || 0));
        case 'value-highest':
            return sorted.sort((a, b) => (b.amount || 0) - (a.amount || 0));
        case 'value-lowest':
            return sorted.sort((a, b) => (a.amount || 0) - (b.amount || 0));
        default:
            return sorted;
    }
}

// ==================== PAGE LOAD & REFRESH ====================
window.addEventListener('pageshow', function (event) {
    if (event.persisted || performance.navigation.type === 1) {
        loadClients();
        loadEmailHistory();
        loadTemplates();
        if (currentPage === 'dashboard') {
            loadDashboard();
        } else if (currentPage === 'clients') {
            loadClients();
        } else if (currentPage === 'emails') {
            loadEmailHistory();
        } else if (currentPage === 'templates') {
            loadTemplates();
        }
    }
});

(async function () {
    // Get all page elements - now assign to globals (no const)
    dashboardPage = document.getElementById('dashboardPage');
    clientsPage = document.getElementById('clientsPage');
    emailsPage = document.getElementById('emailsPage');
    templatesPage = document.getElementById('templatesPage');
    analyticsPage = document.getElementById('analyticsPage');
    settingsPage = document.getElementById('settingsPage');
    sequencesPage = document.getElementById('sequencesPage');
    campaignsPage = document.getElementById('campaignsPage');

    // Hide all pages except dashboard
    if (clientsPage) clientsPage.classList.add('hidden');
    if (emailsPage) emailsPage.classList.add('hidden');
    if (templatesPage) templatesPage.classList.add('hidden');
    if (analyticsPage) analyticsPage.classList.add('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');
    if (sequencesPage) sequencesPage.classList.add('hidden');
    if (campaignsPage) campaignsPage.classList.add('hidden');

    // Show dashboard with initial styles
    if (dashboardPage) {
        dashboardPage.classList.remove('hidden');
        dashboardPage.style.opacity = '1';
        dashboardPage.style.transform = 'translateY(0)';
    }

    // Set default page to dashboard
    currentPage = 'dashboard';

    // Set active nav item to dashboard - using globals
    dashboardNav = document.getElementById('dashboardNav');
    clientsNav = document.getElementById('clientsNav');
    emailsNav = document.getElementById('emailsNav');
    templatesNav = document.getElementById('templatesNav');
    analyticsNav = document.getElementById('analyticsNav');
    campaignsNav = document.getElementById('campaignsNav');
    sequencesNav = document.getElementById('sequencesNav');

    // Remove active state from all nav items first
    if (dashboardNav) {
        dashboardNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        dashboardNav.classList.add('text-slate-400');
    }
    if (clientsNav) {
        clientsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        clientsNav.classList.add('text-slate-400');
    }
    if (emailsNav) {
        emailsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        emailsNav.classList.add('text-slate-400');
    }
    if (templatesNav) {
        templatesNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        templatesNav.classList.add('text-slate-400');
    }
    if (analyticsNav) {
        analyticsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        analyticsNav.classList.add('text-slate-400');
    }
    if (settingsNav) {
        settingsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        settingsNav.classList.add('text-slate-400');
    }
    if (campaignsNav) {
        campaignsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        campaignsNav.classList.add('text-slate-400');
    }

    // Set dashboard nav as active
    if (dashboardNav) {
        dashboardNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        dashboardNav.classList.remove('text-slate-400');
    }

    // Load initial data — wait for auth token to be ready
    async function initializeDashboard() {
        // Ensure auth token is available before making API calls
        const token = await getAuthToken();
        if (!token) {
            console.log('⏳ Auth token not ready, retrying...');
            setTimeout(initializeDashboard, 500);
            return;
        }

        await loadClients();
        await loadEmailHistory();
        await loadDashboard();
        loadTemplates();
    }

    initializeDashboard();

    const editClientForm = document.getElementById('editClientForm');
    if (editClientForm) editClientForm.addEventListener('submit', handleEditClient);

    const addTemplateForm = document.getElementById('addTemplateForm');
    if (addTemplateForm) addTemplateForm.addEventListener('submit', handleAddTemplate);

    const editTemplateForm = document.getElementById('editTemplateForm');
    if (editTemplateForm) editTemplateForm.addEventListener('submit', handleEditTemplate);

    // Set up search listeners
    const emailSearch = document.getElementById('emailSearch');
    if (emailSearch) emailSearch.addEventListener('input', handleEmailSearch);

    const clientSearch = document.getElementById('clientSearch');
    if (clientSearch) clientSearch.addEventListener('input', handleClientSearch);
})();

// ============================================
// PAGE NAVIGATION (Sidebar) with Smooth Transitions
// ============================================

function switchPage(page) {
    console.log('🔄 Switching to page:', page);  // ← ADD THIS

    // Get all page elements (now global)
    const selectedPage = document.getElementById(`${page}Page`);
    if (selectedPage) {
        // Hide all pages first
        if (dashboardPage) dashboardPage.classList.add('hidden');
        if (clientsPage) clientsPage.classList.add('hidden');
        if (emailsPage) emailsPage.classList.add('hidden');
        if (templatesPage) templatesPage.classList.add('hidden');
        if (analyticsPage) analyticsPage.classList.add('hidden');
        if (sequencesPage) sequencesPage.classList.add('hidden');
        if (campaignsPage) campaignsPage.classList.add('hidden');

        selectedPage.classList.remove('hidden');
        console.log('✅ Showing page:', page);
    } else {
        console.error('❌ Page not found:', page);
    }

    // Get the current active page
    const currentActivePage = document.getElementById(`${currentPage}Page`);
    const newActivePage = document.getElementById(`${page}Page`);

    if (!newActivePage) return;

    // Add exit animation to current page
    if (currentActivePage) {
        currentActivePage.style.opacity = '0';
        currentActivePage.style.transform = 'translateY(-5px)';
        currentActivePage.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    }

    // Wait for exit animation, then switch
    setTimeout(() => {
        // Hide all pages
        if (dashboardPage) dashboardPage.classList.add('hidden');
        if (clientsPage) clientsPage.classList.add('hidden');
        if (emailsPage) emailsPage.classList.add('hidden');
        if (templatesPage) templatesPage.classList.add('hidden');
        if (analyticsPage) analyticsPage.classList.add('hidden');
        if (settingsPage) settingsPage.classList.add('hidden');

        // Show new page
        newActivePage.classList.remove('hidden');
        newActivePage.style.opacity = '0';
        newActivePage.style.transform = 'translateY(5px)';
        newActivePage.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

        // Trigger enter animation
        requestAnimationFrame(() => {
            newActivePage.style.opacity = '1';
            newActivePage.style.transform = 'translateY(0)';
        });

        // Reset current page styles
        if (currentActivePage) {
            currentActivePage.style.opacity = '';
            currentActivePage.style.transform = '';
            currentActivePage.style.transition = '';
        }

        // Remove active state from all nav items
        if (dashboardNav) {
            dashboardNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            dashboardNav.classList.add('text-slate-400');
        }
        if (clientsNav) {
            clientsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            clientsNav.classList.add('text-slate-400');
        }
        if (emailsNav) {
            emailsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            emailsNav.classList.add('text-slate-400');
        }
        if (templatesNav) {
            templatesNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            templatesNav.classList.add('text-slate-400');
        }
        if (analyticsNav) {
            analyticsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            analyticsNav.classList.add('text-slate-400');
        }
        if (sequencesNav) {
            sequencesNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            sequencesNav.classList.add('text-slate-400');
        }
        if (campaignsNav) {
            campaignsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            campaignsNav.classList.add('text-slate-400');
        }

        // Activate new nav item and load appropriate data
        if (page === 'dashboard' && dashboardNav) {
            dashboardNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            dashboardNav.classList.remove('text-slate-400');
            loadDashboard();
        } else if (page === 'clients' && clientsNav) {
            clientsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            clientsNav.classList.remove('text-slate-400');
            loadClients();
        } else if (page === 'emails' && emailsNav) {
            emailsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            emailsNav.classList.remove('text-slate-400');
            loadEmailHistory();
        } else if (page === 'templates' && templatesNav) {
            templatesNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            templatesNav.classList.remove('text-slate-400');
            loadTemplates();
        } else if (page === 'analytics' && analyticsNav) {
            analyticsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            analyticsNav.classList.remove('text-slate-400');
            // Analytics is a static page, no data loading needed
        } else if (page === 'sequences' && sequencesNav) {
            sequencesNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            sequencesNav.classList.remove('text-slate-400');
            loadSequences();
        } else if (page === 'settings') {      // ← ADD THIS
            loadSettings();
        } else if (page === 'campaigns' && campaignsNav) {
            campaignsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            campaignsNav.classList.remove('text-slate-400');
            loadCampaigns();
            updateGmailStatusIndicator();
        }

        currentPage = page;

        // Clean up transition styles after animation completes
        setTimeout(() => {
            newActivePage.style.transition = '';
        }, 200);

    }, 100); // Short delay for exit animation
}

// ============================================
// MORE OPTIONS DROPDOWN
// ============================================

function toggleMoreOptions() {
    const menu = document.getElementById('moreOptionsMenu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

function closeMoreOptions() {
    const menu = document.getElementById('moreOptionsMenu');
    if (menu) {
        menu.classList.add('hidden');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
    const menu = document.getElementById('moreOptionsMenu');
    const button = event.target.closest('button[onclick="toggleMoreOptions()"]');

    if (menu && !menu.contains(event.target) && !button) {
        menu.classList.add('hidden');
    }
});

// ============================================
// DASHBOARD PAGE FUNCTIONS
// ============================================

async function loadDashboard() {
    updateDashboardGreeting();
    updateDashboardStats();
    renderDashboardAttentionList();
    renderDashboardActivity();
    populateQuickEmailClients();
    initOnboardingChecklist();
    loadQuickNotes();

    // Show tooltip once per session
    if (!sessionStorage.getItem('needsAttentionTooltipShown')) {
        const tooltip = document.getElementById('needsAttentionTooltip');
        if (tooltip) {
            tooltip.classList.remove('hidden');
            sessionStorage.setItem('needsAttentionTooltipShown', 'true');
            setTimeout(() => tooltip.classList.add('hidden'), 8000);
        }
    }
    function dismissTooltip() {
        document.getElementById('needsAttentionTooltip')?.classList.add('hidden');
    }
}

function updateDashboardGreeting() {
    // Use window.userSettings directly if available
    const settings = window.userSettings || userSettings;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const icon = hour < 12 ? '☀️' : hour < 18 ? '🌤️' : '🌙';

    document.getElementById('dashboardUserName').textContent = `${greeting}, ${settings.name}`;
    document.getElementById('dashboardGreetingIcon').textContent = icon;

    const dateEl = document.getElementById('dashboardDate');
    if (dateEl) {
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
}

function updateDashboardStats() {
    document.getElementById('dashTotalClients').textContent = clients.length;

    const attentionClients = getAttentionClients();
    document.getElementById('dashNeedsAttention').textContent = attentionClients.length;

    const pendingTotal = clients.filter(c => c.status === 'payment_due').reduce((sum, c) => sum + (c.amount || 0), 0);
    document.getElementById('dashPendingPayments').textContent = `$${pendingTotal.toLocaleString()}`;

    document.getElementById('dashEmailsSent').textContent = allEmails.length;

    // Bar chart stats
    const total = clients.length || 1;
    const activeCount = clients.filter(c => c.status === 'active').length;
    const waitingCount = clients.filter(c => c.status === 'waiting').length;
    const paymentDueCount = clients.filter(c => c.status === 'payment_due').length;

    document.getElementById('dashActiveClients').textContent = activeCount;
    document.getElementById('dashWaitingClients').textContent = waitingCount;
    document.getElementById('dashPaymentDueCount').textContent = paymentDueCount;

    document.getElementById('dashActiveBar').style.width = `${(activeCount / total) * 100}%`;
    document.getElementById('dashWaitingBar').style.width = `${(waitingCount / total) * 100}%`;
    document.getElementById('dashPaymentBar').style.width = `${(paymentDueCount / total) * 100}%`;

    updateEmailLimitDisplay();
}

function renderDashboardAttentionList() {
    const container = document.getElementById('dashboardAttentionList');
    const emptyState = document.getElementById('dashboardAttentionEmpty');
    const quickEmailSelect = document.getElementById('dashboardQuickEmailClient');

    const attentionClients = getAttentionClients().slice(0, 5); // show up to 5

    // Populate Quick Email dropdown with ONLY attention clients
    if (quickEmailSelect) {
        quickEmailSelect.innerHTML = '<option value="">-- Select a client --</option>' +
            attentionClients.map(c => `<option value="${c.id}">${c.name} (${c.business || 'No business'})</option>`).join('');
    }

    if (attentionClients.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    container.innerHTML = attentionClients.map(client => `
        <div class="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 font-bold">
                    ${client.name.charAt(0)}
                </div>
                <div>
                    <p class="font-medium text-white">${client.name}</p>
                    <p class="text-xs text-slate-400">Last contact: ${formatDate(client.last_contacted)}</p>
                </div>
            </div>
            <button onclick="event.stopPropagation(); writeAttentionEmail('${client.id}')"
                class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
                Write them
            </button>
        </div>
    `).join('');
}

function writeAttentionEmail(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    currentEmailClient = client;
    document.getElementById('emailClientName').textContent = client.name;
    document.getElementById('emailConfig').classList.remove('hidden');
    document.getElementById('emailResult').classList.add('hidden');
    document.getElementById('emailType').value = 'Follow-up';
    document.getElementById('emailTone').value = 'Friendly';
    document.getElementById('emailModal').classList.remove('hidden');
}

function renderDashboardActivity() {

}

function populateQuickEmailClients() {
    const select = document.getElementById('dashboardQuickEmailClient');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select a client --</option>' +
        clients.map(client => `<option value="${client.id}">${client.name} (${client.business || 'No business'})</option>`).join('');
}

async function generateQuickEmail() {
    const clientId = document.getElementById('dashboardQuickEmailClient').value;
    if (!clientId) {
        showToast('Please select a client', 'error');
        return;
    }
    // 🔥 CHECK EMAIL LIMIT
    if (!checkEmailLimit()) {
        return false;
    }

    const type = document.getElementById('dashboardQuickEmailType').value;
    const tone = document.getElementById('dashboardQuickEmailTone').value;
    const btn = document.getElementById('dashboardGenerateBtn');

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span><span>Generating...</span>';

    try {
        const response = await authFetch('/api/generate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, type, tone, freelancerName: window.userSettings?.name || userSettings.name })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate');

        // Show in email modal
        currentEmailClient = clients.find(c => c.id === clientId);
        generatedSubjectA = data.subjectA || data.subject || 'No subject';
        generatedSubjectB = data.subjectB || data.subjectA || 'No subject';
        generatedBody = data.body || data.fullText;
        currentSubjectChoice = 'A';

        document.getElementById('generatedSubject').textContent = generatedSubjectA;
        document.getElementById('subjectTabA').className = 'px-3 py-1 rounded-md text-xs font-medium bg-indigo-500 text-white transition-all';
        document.getElementById('subjectTabB').className = 'px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all';

        document.getElementById('emailClientName').textContent = currentEmailClient.name;
       // ✅ CHANGE
document.getElementById('generatedBody').value = generatedBody;
document.getElementById('emailConfig').classList.add('hidden');
document.getElementById('emailResult').classList.remove('hidden');
document.getElementById('emailModal').classList.remove('hidden');

        updateSendButtons();
        
        // Refresh email list so checklist can detect the new email
        await loadEmailHistory();
        checkOnboardingProgress();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function updateSidebarProfile() {
    const avatar = document.getElementById('sidebarProfileAvatar');
    const nameEl = document.getElementById('sidebarProfileName');
    const emailEl = document.getElementById('sidebarProfileEmail');
    const badge = document.getElementById('sidebarProBadge');
    if (!avatar || !nameEl || !emailEl || !badge) return;

    const settings = window.userSettings || userSettings;
    const initial = (settings.name || 'U').charAt(0).toUpperCase();

    avatar.textContent = initial;
    nameEl.textContent = settings.name || 'Freelancer';
    emailEl.textContent = settings.email || '';

    // Show Pro badge only on Pro plans
    const plan = window.userPlan || 'free';
    if (plan !== 'free') {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================
// CLIENTS PAGE FUNCTIONS
// ============================================

async function loadClients() {
    try {
        // Show skeleton immediately
        showClientListSkeleton();

        // Start timing
        const startTime = Date.now();

        clients = await fetchClients(showArchived);

        // Ensure skeleton shows for at least 600ms (feels intentional)
        const elapsed = Date.now() - startTime;
        if (elapsed < 600) {
            await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
        }

        renderAttentionSection();
        renderClientList();
        updateStats();
        updateArchivedCount();
    } catch (error) {
        showToast('Failed to load clients', 'error');
    }
}

function renderClientList() {
    const container = document.getElementById('clientListContainer');
    const emptyState = document.getElementById('emptyState');
    const noSearchResults = document.getElementById('noSearchResults');

    if (!container) return;
    container.innerHTML = '';

    // Apply status filter
    let filteredClients = clients;
    if (currentFilter !== 'all' && currentFilter !== 'attention') {
        filteredClients = clients.filter(c => c.status === currentFilter);
    }

    // Apply search filter
    filteredClients = filterClientsBySearch(filteredClients);

    // Apply sorting
    filteredClients = sortClientsArray(filteredClients);

    // Hide both empty states initially
    if (emptyState) emptyState.classList.add('hidden');
    if (noSearchResults) noSearchResults.classList.add('hidden');

    if (filteredClients.length === 0) {
        const hasSearchOrFilter = currentSearchQuery ||
            (currentFilter !== 'all' && currentFilter !== 'attention') ||
            showArchived;
        if (hasSearchOrFilter) {
            if (noSearchResults) noSearchResults.classList.remove('hidden');
        } else {
            if (emptyState) emptyState.classList.remove('hidden');
        }
        return;
    }

    // Helper function for status badge
    function getStatusBadge(status) {
        switch (status) {
            case 'active': return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-[11px] font-semibold border border-green-500/20"><span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>Active</span>';
            case 'waiting': return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[11px] font-semibold border border-amber-500/20"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Waiting</span>';
            case 'payment_due': return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-[11px] font-semibold border border-red-500/20"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>Payment Due</span>';
            default: return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-400 text-[11px] font-semibold border border-slate-500/20"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>' + status + '</span>';
        }
    }

    container.innerHTML = filteredClients.map(client => {
        const isStale = needsAttention(client);
        const deadlineClass = getDeadlineUrgency(client.deadline);

        return `
        <tr class="hover:bg-white/[0.02] transition-colors group relative cursor-pointer"
            onclick="selectClient('${client.id}')">
            <td class="py-4 px-6" onclick="event.stopPropagation()">
                <input type="checkbox" class="client-checkbox w-4 h-4 rounded bg-slate-700 border-white/10 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer" data-client-id="${client.id}">
            </td>
            <td class="py-4 px-6">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-xs shrink-0">
                        ${client.name.charAt(0)}
                    </div>
                    <div>
                        <p class="text-white font-medium text-sm flex items-center gap-2">
                            ${client.name}
                            ${isStale ? `<span class="text-amber-400" title="Needs follow-up (${getDaysStale(client.last_contacted)} days)"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span>` : ''}
                            ${client.archived ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-white/10">Archived</span>' : ''}
                        </p>
                        <p class="text-slate-500 text-[11px]">${client.business || 'No business'}</p>
                        ${client.tags && client.tags.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mt-1">
                            ${client.tags.map(tag => `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">${tag}</span>`).join('')}
                        </div>` : ''}
                    </div>
                </div>
            </td>
            <td class="py-4 px-6 hidden md:table-cell text-sm text-white">${client.project || '—'}</td>
            <td class="py-4 px-6 hidden lg:table-cell text-sm text-white font-medium">${client.amount ? '$' + client.amount.toLocaleString() : '—'}</td>
            <td class="py-4 px-6 hidden md:table-cell">
                <span class="text-sm ${deadlineClass}">${client.deadline ? formatDate(client.deadline) : '—'}</span>
            </td>
            <td class="py-4 px-6">
                <span class="text-sm ${isStale ? 'text-amber-400 font-medium' : 'text-slate-300'}">${formatDate(client.last_contacted)}</span>
            </td>
            <td class="py-4 px-6">${getStatusBadge(client.status)}</td>
            <td class="py-4 px-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="flex items-center gap-2">
                    <button onclick="event.stopPropagation(); openEditModalForClient('${client.id}')" class="text-slate-400 hover:text-indigo-400 transition-colors" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                    <button onclick="event.stopPropagation(); archiveOrDeleteClient('${client.id}', ${client.archived})" class="text-slate-400 hover:text-amber-400 transition-colors" title="${client.archived ? 'Restore' : 'Archive'}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
                        </svg>
                    </button>
                    <button onclick="event.stopPropagation(); deleteCurrentClient('${client.id}')" class="text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function openEditModalForClient(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    document.getElementById('editClientId').value = client.id;
    document.getElementById('editClientName').value = client.name;
    document.getElementById('editClientBusiness').value = client.business || '';
    document.getElementById('editClientEmail').value = client.email || '';
    document.getElementById('editClientProject').value = client.project || '';
    document.getElementById('editClientAmount').value = client.amount || '';
    document.getElementById('editClientDeadline').value = client.deadline ? client.deadline.split('T')[0] : '';
    document.getElementById('editClientStatus').value = client.status;
    document.getElementById('editModal').classList.remove('hidden');
}

function toggleSelectAll(checkbox) {
    const isChecked = checkbox.checked;
    // Sync all select-all checkboxes
    document.querySelectorAll('#selectAllClients, #selectAllClientsTop').forEach(el => el.checked = isChecked);
    // Toggle all client checkboxes
    document.querySelectorAll('.client-checkbox').forEach(cb => cb.checked = isChecked);
    updateBulkDeleteButton();
}

function archiveOrDeleteClient(clientId, isArchived) {
    if (isArchived) {
        restoreClient(clientId);
    } else {
        archiveCurrentClient(clientId);
    }
}

function deleteCurrentClient(clientId) {
    clientToDelete = clientId;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function updateStats() {
    document.getElementById('totalClients').textContent = clients.length;
    document.getElementById('activeClients').textContent = clients.filter(c => c.status === 'active').length;
    document.getElementById('needsAttention').textContent = clients.filter(c => c.status === 'waiting').length;
    document.getElementById('paymentDue').textContent = clients.filter(c => c.status === 'payment_due').length;
}

function filterClients() {
    const filterValue = document.getElementById('statusFilter').value;
    currentFilter = filterValue;
    if (filterValue === 'attention') {
        renderAttentionFilteredList();
    } else {
        renderClientList();
    }
}

async function handleAddClient(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }
    // 🔥 CHECK CLIENT LIMIT
    if (!checkClientLimit()) {
        return false;  // Stop execution, modal shown
    }

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    const clientData = {
        name: document.getElementById('clientName').value,
        business: document.getElementById('clientBusiness').value || null,
        email: document.getElementById('clientEmail').value || null,
        project: document.getElementById('clientProject').value || null,
        amount: document.getElementById('clientAmount').value ? parseFloat(document.getElementById('clientAmount').value) : null,
        deadline: document.getElementById('clientDeadline').value || null,
        status: document.getElementById('clientStatus').value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    try {
        await addClient(clientData);
        showToast('Client added successfully', 'success');
        closeAddModal();  // Close modal FIRST
        await loadClients();  // Then reload clients
        return false;  // ← ADD THIS
    } catch (error) {
        showToast(error.message || 'Failed to add client', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }

    return false;  // ← ADD THIS TOO
}

// ============================================
// TEMPLATES PAGE FUNCTIONS
// ============================================
async function loadTemplates() {
    try {
        const response = await authFetch('/api/templates');
        const data = await response.json();
        templates = data.templates || [];
        renderTemplatesGrid();
    } catch (error) {
        console.error('Failed to load templates:', error);
        showToast('Failed to load templates', 'error');
    }
}

function renderTemplatesGrid() {
    const container = document.getElementById('templatesGrid');
    const emptyState = document.getElementById('templatesEmptyState');

    if (templates.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Helper to get the right badge color for each type
    function getTypeBadgeColor(type) {
        switch (type) {
            case 'Follow-up': return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
            case 'Payment Reminder': return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
            case 'Cold Outreach': return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
            default: return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
        }
    }

    // Helper for tone badge color
    function getToneBadgeColor(tone) {
        switch (tone) {
            case 'Friendly': return 'bg-green-500/10 text-green-300 border-green-500/20';
            case 'Professional': return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
            case 'Firm': return 'bg-red-500/10 text-red-300 border-red-500/20';
            case 'Casual': return 'bg-purple-500/10 text-purple-300 border-purple-500/20';
            default: return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
        }
    }

    container.innerHTML = templates.map(template => `
        <div class="glass-card rounded-2xl p-5 flex flex-col gap-4 relative group hover:border-indigo-500/30 transition-all cursor-pointer" onclick="useTemplate('${template.id}')">
            
            <!-- Edit/Delete buttons – hidden until hover -->
            <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                <button onclick="event.stopPropagation(); editTemplate('${template.id}')" 
                    class="p-1.5 rounded-lg bg-slate-700/80 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 transition-colors" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                </button>
                <button onclick="event.stopPropagation(); deleteTemplate('${template.id}')" 
                    class="p-1.5 rounded-lg bg-slate-700/80 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>

            <!-- Type & Tone pills -->
            <div class="flex flex-wrap gap-2 pr-16">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getTypeBadgeColor(template.type)}">
                    ${template.type || 'No type'}
                </span>
                <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getToneBadgeColor(template.tone)}">
                    ${template.tone || 'No tone'}
                </span>
            </div>

            <!-- Template name -->
            <div>
                <h3 class="font-semibold text-white text-sm mb-1">${escapeHTML(template.name)}</h3>
                <p class="text-xs text-slate-400 line-clamp-2">
                    ${template.body ? escapeHTML(template.body.substring(0, 100)) + '...' : 'No content'}
                </p>
            </div>

            <!-- Divider -->
            <div class="border-t border-white/5"></div>

            <!-- Bottom row: subject preview or dates (optional) -->
            <div class="flex items-center text-xs text-slate-500 gap-4">
                <span class="flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                    </svg>
                    ${template.subject ? escapeHTML(template.subject) : 'No subject'}
                </span>
                <span class="flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    ${template.created_at ? formatDate(template.created_at) : 'Recently'}
                </span>
            </div>
        </div>
    `).join('');
}

function openAddTemplateModal() {
    document.getElementById('addTemplateModal').classList.remove('hidden');
    document.getElementById('addTemplateForm').reset();

    // Reset type pills to default (first one active)
    document.querySelectorAll('.add-type-pill').forEach((b, i) => {
        if (i === 0) {
            b.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            b.classList.add('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
        } else {
            b.classList.remove('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
            b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
        }
    });
    document.getElementById('templateType').value = 'Follow-up';

    // Reset tone pills to default (first one active)
    document.querySelectorAll('.add-tone-pill').forEach((b, i) => {
        if (i === 0) {
            b.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            b.classList.add('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
        } else {
            b.classList.remove('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
            b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
        }
    });
    document.getElementById('templateTone').value = 'Friendly';

    // Initialize click handlers for the pills
    initAddTemplatePills();
}

function closeAddTemplateModal() {
    document.getElementById('addTemplateModal').classList.add('hidden');
}

async function handleAddTemplate(e) {
    e.preventDefault();

    const templateData = {
        name: document.getElementById('templateName').value,
        type: document.getElementById('templateType').value,
        tone: document.getElementById('templateTone').value,
        subject: document.getElementById('templateSubject').value,
        body: document.getElementById('templateBody').value
    };

    try {
        const response = await authFetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });

        if (!response.ok) throw new Error('Failed to save template');

        showToast('Template saved', 'success');
        closeAddTemplateModal();
        loadTemplates();
    } catch (error) {
        showToast('Failed to save template', 'error');
    }
}

function editTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    document.getElementById('editTemplateId').value = template.id;
    document.getElementById('editTemplateName').value = template.name;
    document.getElementById('editTemplateSubject').value = template.subject || '';
    document.getElementById('editTemplateBody').value = template.body;

    // Set active type pill
    document.querySelectorAll('.edit-type-pill').forEach(b => {
        if (b.dataset.type === template.type) {
            b.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            b.classList.add('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
        } else {
            b.classList.remove('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
            b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
        }
    });
    document.getElementById('editTemplateType').value = template.type;

    // Set active tone pill
    document.querySelectorAll('.edit-tone-pill').forEach(b => {
        if (b.dataset.tone === template.tone) {
            b.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            b.classList.add('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
        } else {
            b.classList.remove('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
            b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
        }
    });
    document.getElementById('editTemplateTone').value = template.tone;

    document.getElementById('editTemplateModal').classList.remove('hidden');

    initEditTemplatePills();
}

function closeEditTemplateModal() {
    document.getElementById('editTemplateModal').classList.add('hidden');
    currentTemplate = null;
}

async function handleEditTemplate(e) {
    e.preventDefault();

    const templateId = document.getElementById('editTemplateId').value;
    const templateData = {
        name: document.getElementById('editTemplateName').value,
        type: document.getElementById('editTemplateType').value,
        tone: document.getElementById('editTemplateTone').value,
        subject: document.getElementById('editTemplateSubject').value,
        body: document.getElementById('editTemplateBody').value
    };

    try {
        const response = await authFetch(`/api/templates/${templateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });

        if (!response.ok) throw new Error('Failed to update template');

        showToast('Template updated', 'success');
        closeEditTemplateModal();
        loadTemplates();
    } catch (error) {
        showToast('Failed to update template', 'error');
    }
}

async function deleteTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    templateToDelete = templateId;
    document.getElementById('deleteTemplateName').textContent = `Are you sure you want to delete "${template.name}"?`;
    document.getElementById('deleteTemplateModal').classList.remove('hidden');
}

function closeDeleteTemplateModal() {
    document.getElementById('deleteTemplateModal').classList.add('hidden');
    templateToDelete = null;
}

async function confirmDeleteTemplate() {
    if (!templateToDelete) return;

    try {
        const response = await authFetch(`/api/templates/${templateToDelete}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete template');

        showToast('Template deleted', 'success');
        closeDeleteTemplateModal();
        loadTemplates();
    } catch (error) {
        showToast('Failed to delete template', 'error');
        closeDeleteTemplateModal();
    }
}

function useTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    // Switch to clients page to select a client
    switchPage('clients');
    showToast('Select a client to use this template', 'info');

    // Store template for later use
    localStorage.setItem('pendingTemplate', JSON.stringify(template));
}

// Pill selection helpers for Add / Edit Template modals
function initAddTemplatePills() {
    // Type pills
    document.querySelectorAll('.add-type-pill').forEach(btn => {
        btn.addEventListener('click', function () {
            // Remove active from all type pills
            document.querySelectorAll('.add-type-pill').forEach(b => {
                b.classList.remove('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
                b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            });
            // Activate clicked
            this.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            this.classList.add('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
            document.getElementById('templateType').value = this.dataset.type;
        });
    });

    // Tone pills
    document.querySelectorAll('.add-tone-pill').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.add-tone-pill').forEach(b => {
                b.classList.remove('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
                b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            });
            this.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            this.classList.add('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
            document.getElementById('templateTone').value = this.dataset.tone;
        });
    });
}

function initEditTemplatePills() {
    // Type pills
    document.querySelectorAll('.edit-type-pill').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.edit-type-pill').forEach(b => {
                b.classList.remove('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
                b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            });
            this.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            this.classList.add('bg-indigo-500/20', 'border-indigo-400', 'text-indigo-300');
            document.getElementById('editTemplateType').value = this.dataset.type;
        });
    });

    // Tone pills
    document.querySelectorAll('.edit-tone-pill').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.edit-tone-pill').forEach(b => {
                b.classList.remove('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
                b.classList.add('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            });
            this.classList.remove('bg-slate-500/10', 'border-slate-500/30', 'text-slate-400');
            this.classList.add('bg-purple-500/20', 'border-purple-400', 'text-purple-300');
            document.getElementById('editTemplateTone').value = this.dataset.tone;
        });
    });
}

// ============================================
// CLIENT DETAIL PANEL
// ============================================

function selectClient(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    selectedClientId = clientId;

    // Helper to safely set textContent
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
        else console.warn(`⚠️ Missing element: #${id}`);
    };
    // Helper to safely set innerHTML
    const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
        else console.warn(`⚠️ Missing element: #${id}`);
    };
    // Helper to safely set value
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
        else console.warn(`⚠️ Missing element: #${id}`);
    };

    // Basic client info
    setText('detailAvatar', client.name.charAt(0));
    setText('detailName', client.name);
    setText('detailBusiness', client.business || 'No business');
    setText('detailEmail', client.email || 'No email');
    setText('detailProject', client.project || 'No project');
    setText('detailAmount', client.amount ? `$${client.amount.toLocaleString()}` : '-');
    setHtml('detailStatus', getStatusBadge(client.status));
    setText('detailLastContact', formatDate(client.last_contacted));
    setText('detailCreated', formatDate(client.created_at));
    setText('detailDeadline', client.deadline ? formatDate(client.deadline) : '-');

    // Notes (textarea uses .value)
    const notesEl = document.getElementById('detailNotes');
    if (notesEl) notesEl.value = client.notes || '';
    else console.warn('⚠️ Missing element: #detailNotes');

    // Edit form fields (hidden inputs & editable fields)
    setValue('editClientId', client.id);
    setValue('editClientName', client.name);
    setValue('editClientBusiness', client.business || '');
    setValue('editClientEmail', client.email || '');
    setValue('editClientProject', client.project || '');
    setValue('editClientAmount', client.amount || '');

    const statusSelect = document.getElementById('editClientStatus');
    if (statusSelect) statusSelect.value = client.status;
    else console.warn('⚠️ Missing element: #editClientStatus');

    const deadlineInput = document.getElementById('editClientDeadline');
    if (deadlineInput) deadlineInput.value = client.deadline ? client.deadline.split('T')[0] : '';
    else console.warn('⚠️ Missing element: #editClientDeadline');

    // Update action buttons (archive/restore/delete)
    updateDetailPanelActions(client);

    // Render tags
    renderClientTags(client.tags || []);

    // Load activity timeline
    if (typeof loadClientTimeline === 'function') {
        loadClientTimeline(clientId);
    } else {
        console.warn('⚠️ loadClientTimeline() not defined – timeline may be missing');
    }

    // Open the panel
    openDetailPanel();
}

function openDetailPanel() {
    document.getElementById('clientDetailPanel').classList.add('translate-x-0');
    document.getElementById('clientDetailPanel').classList.remove('translate-x-full');
}

function closeDetailPanel() {
    document.getElementById('clientDetailPanel').classList.add('translate-x-full');
    document.getElementById('clientDetailPanel').classList.remove('translate-x-0');
    selectedClientId = null;
}

async function markAsContacted() {
    if (!selectedClientId) return;
    const newDate = new Date().toISOString();

    try {
        await updateClient(selectedClientId, { last_contacted: newDate });
        showToast('Updating...', 'info');
        await new Promise(resolve => setTimeout(resolve, 300));

        const freshClients = await fetchClients();
        clients = freshClients;

        renderAttentionSection();
        renderClientList();
        updateStats();

        const updatedClient = clients.find(c => c.id === selectedClientId);
        if (updatedClient) {
            document.getElementById('detailLastContact').textContent = formatDate(updatedClient.last_contacted);
            document.getElementById('detailStatus').innerHTML = getStatusBadge(updatedClient.status);
        }

        // Record activity
        await authFetch('/api/client-activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: selectedClientId,
                activity_type: 'contacted',
                metadata: { date: new Date().toISOString() }
            })
        });

        showToast('✓ Marked as contacted', 'success');

        // 🔁 Refresh the timeline
        if (typeof loadClientTimeline === 'function') {
            await loadClientTimeline(selectedClientId);
        }

        checkOnboardingProgress();
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to update', 'error');
    }
}

async function saveNotes() {
    if (!selectedClientId) return;
    const notes = document.getElementById('detailNotes').value;
    try {
        await updateClient(selectedClientId, { notes });
        const client = clients.find(c => c.id === selectedClientId);
        if (client) client.notes = notes;
        showToast('Notes saved', 'success');
    } catch (error) {
        showToast('Failed to save notes', 'error');
    }
}


async function submitAddClientForm() {
    const clientData = {
        name: document.getElementById('clientName').value,
        business: document.getElementById('clientBusiness').value || null,
        email: document.getElementById('clientEmail').value || null,
        project: document.getElementById('clientProject').value || null,
        amount: document.getElementById('clientAmount').value ? parseFloat(document.getElementById('clientAmount').value) : null,
        deadline: document.getElementById('clientDeadline').value || null,
        status: document.getElementById('clientStatus').value
    };

    if (!clientData.name) {
        showToast('Client name is required', 'error');
        return;
    }

    const submitBtn = document.querySelector('#addClientForm button[onclick="submitAddClientForm()"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    try {
        await addClient(clientData);
        showToast('Client added successfully', 'success');
        closeAddModal();
        await loadClients();
    } catch (error) {
        showToast(error.message || 'Failed to add client', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ============================================
// EDIT & DELETE CLIENT
// ============================================

function openEditModal() {
    closeDetailPanel();
    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

async function handleEditClient(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    const clientId = document.getElementById('editClientId').value;

    const updates = {
        name: document.getElementById('editClientName').value,
        business: document.getElementById('editClientBusiness').value || null,
        email: document.getElementById('editClientEmail').value || null,
        project: document.getElementById('editClientProject').value || null,
        amount: document.getElementById('editClientAmount').value ? parseFloat(document.getElementById('editClientAmount').value) : null,
        deadline: document.getElementById('editClientDeadline').value || null,  // ← ADD THIS
        status: document.getElementById('editClientStatus').value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        await updateClient(clientId, updates);
        showToast('Client updated successfully', 'success');
        closeEditModal();
        await loadClients();
        if (selectedClientId === clientId) {
            const updatedClient = clients.find(c => c.id === clientId);
            if (updatedClient) selectClient(clientId);
        }
    } catch (error) {
        showToast(error.message || 'Failed to update client', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function deleteCurrentClient() {
    if (!selectedClientId) return;
    clientToDelete = selectedClientId;
    closeDetailPanel();
    openDeleteModal();
}

function openDeleteModal() {
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
    clientToDelete = null;
}

async function confirmDelete() {
    if (!clientToDelete) return;
    try {
        await deleteClient(clientToDelete);
        showToast('Client deleted', 'success');
        closeDeleteModal();
        await loadClients();
    } catch (error) {
        showToast('Failed to delete client', 'error');
        closeDeleteModal();
    }
}

// ============================================
// NEEDS ATTENTION FEATURE
// ============================================

function needsAttention(client) {
    // Check for overdue deadline first (more urgent)
    if (client.deadline) {
        const deadline = new Date(client.deadline);
        const now = new Date();
        if (deadline < now) return true; // Overdue
        const diffTime = Math.abs(deadline - now);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 2) return true; // Due within 2 days
    }

    // Check for stale communication
    if (!client.last_contacted) return true;
    const lastContact = new Date(client.last_contacted);
    const now = new Date();
    const diffTime = Math.abs(now - lastContact);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
}

function getDaysStale(dateString) {
    if (!dateString) return 0;
    const lastContact = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - lastContact);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getAttentionClients() {
    return clients.filter(c => needsAttention(c));
}

function renderAttentionSection() {
    let attentionClients = getAttentionClients();

    // Apply search filter
    attentionClients = filterClientsBySearch(attentionClients);

    // Apply sorting  ← ADD THIS
    attentionClients = sortClientsArray(attentionClients);

    const section = document.getElementById('attentionSection');
    const listContainer = document.getElementById('attentionList');
    const countEl = document.getElementById('attentionCount');
    if (!section || !listContainer || !countEl) return;

    if (attentionClients.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    countEl.textContent = attentionClients.length;

    listContainer.innerHTML = attentionClients.slice(0, 3).map(client => `
        <div class="glass-card p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all border border-amber-500/20" onclick="selectClient('${client.id}')">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 font-bold text-xs">
                    ${client.name.charAt(0)}
                </div>
                <div>
                    <h4 class="font-medium text-white text-sm">${client.name}</h4>
                    <p class="text-xs text-slate-400">Last contact: ${formatDate(client.last_contacted)}</p>
                </div>
            </div>
            <button onclick="event.stopPropagation(); quickFollowUp('${client.id}')" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                Draft
            </button>
        </div>
    `).join('');

    if (attentionClients.length > 3) {
        listContainer.innerHTML += `
            <button onclick="filterAttentionClients()" class="text-xs text-indigo-400 hover:text-indigo-300 text-center py-2 w-full">
                +${attentionClients.length - 3} more need attention →
            </button>
        `;
    }
}

function quickFollowUp(clientId) {
    selectClient(clientId);
    setTimeout(() => {
        closeDetailPanel();
        openEmailModal(clientId);
        document.getElementById('emailType').value = 'Follow-up';
        document.getElementById('emailTone').value = 'Friendly';
    }, 200);
}

function filterAttentionClients() {
    currentFilter = 'attention';
    document.getElementById('statusFilter').value = 'attention';
    renderAttentionFilteredList();
}

function renderAttentionFilteredList() {
    let attentionClients = getAttentionClients();

    // Apply search filter
    attentionClients = filterClientsBySearch(attentionClients);

    // Apply sorting  ← ADD THIS
    attentionClients = sortClientsArray(attentionClients);

    const container = document.getElementById('clientListContainer');
    const emptyState = document.getElementById('emptyState');
    if (!container) return;

    container.innerHTML = '';

    if (attentionClients.length === 0) {
        emptyState.classList.remove('hidden');
        const emptyMessage = document.querySelector('#emptyState p');
        if (emptyMessage) {
            emptyMessage.textContent = currentSearchQuery
                ? 'No clients match your search'
                : 'No clients need attention right now! 🎉';
        }
        return;
    }

    emptyState.classList.add('hidden');

    let html = '';
    attentionClients.forEach(client => {
        const isStale = needsAttention(client);
        html += `
            <div class="glass-card p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all ${isStale ? 'border-l-2 border-amber-500' : ''}" onclick="selectClient('${client.id}')">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-sm">
                        ${client.name.charAt(0)}
                    </div>
                    <div>
                        <h3 class="font-semibold text-white flex items-center gap-2">
                            ${client.name}
                            ${isStale ? `
                                <span class="text-amber-400" title="Needs follow-up">
                                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </span>
                            ` : ''}
                        </h3>
                        <p class="text-sm text-slate-400">${client.business || 'No business'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-6">
                    <div class="text-right">
                        <p class="text-xs text-slate-500 uppercase tracking-wider">Last Contact</p>
                        <p class="text-sm ${isStale ? 'text-amber-400 font-medium' : 'text-white'}">${formatDate(client.last_contacted)}</p>
                    </div>
                    ${getStatusBadge(client.status)}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================
// AI EMAIL GENERATION
// ============================================

function generateEmailForClient() {
    if (!selectedClientId) return;
    const clientId = selectedClientId;
    closeDetailPanel();
    openEmailModal(clientId);
}

function openEmailModal(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    currentEmailClient = client;
    document.getElementById('emailClientName').textContent = client.name;
    document.getElementById('emailConfig').classList.remove('hidden');
    document.getElementById('emailResult').classList.add('hidden');
    document.getElementById('emailModal').classList.remove('hidden');
}

function closeEmailModal() {
    document.getElementById('emailModal').classList.add('hidden');
    currentEmailClient = null;
}

function resetEmailModal() {
    document.getElementById('emailConfig').classList.remove('hidden');
    document.getElementById('emailResult').classList.add('hidden');
    document.getElementById('emailType').value = 'Follow-up';
    document.getElementById('emailTone').value = 'Friendly';
}

async function generateEmail() {
    if (!currentEmailClient) return;
    if (!checkEmailLimit()) {
        return false;
    }

    const type = document.getElementById('emailType').value;
    const tone = document.getElementById('emailTone').value;
    const btn = document.getElementById('generateEmailBtn');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span><span>Generating...</span>';

    try {
        const response = await authFetch('/api/generate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: currentEmailClient.id,
                type,
                tone,
                freelancerName: window.userSettings?.name || userSettings.name
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate');

        generatedSubjectA = data.subjectA || data.subject || 'No subject';
        generatedSubjectB = data.subjectB || data.subjectA || 'No subject';
        generatedBody = data.body || data.fullText;
        currentSubjectChoice = 'A';

        document.getElementById('generatedSubject').textContent = generatedSubjectA;
        document.getElementById('subjectTabA').className = 'px-3 py-1 rounded-md text-xs font-medium bg-indigo-500 text-white transition-all';
        document.getElementById('subjectTabB').className = 'px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all';
        
        // ✅ CHANGE: use .value for textarea
        document.getElementById('generatedBody').value = generatedBody;
        document.getElementById('emailConfig').classList.add('hidden');
        document.getElementById('emailResult').classList.remove('hidden');

        // ✅ ADD: check which buttons to show
        updateSendButtons();

        await loadEmailHistory();
        checkOnboardingProgress();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function switchSubject(choice) {
    currentSubjectChoice = choice;
    const subject = choice === 'A' ? generatedSubjectA : generatedSubjectB;
    document.getElementById('generatedSubject').textContent = subject;

    const tabA = document.getElementById('subjectTabA');
    const tabB = document.getElementById('subjectTabB');

    if (choice === 'A') {
        tabA.className = 'px-3 py-1 rounded-md text-xs font-medium bg-indigo-500 text-white transition-all';
        tabB.className = 'px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all';
    } else {
        tabB.className = 'px-3 py-1 rounded-md text-xs font-medium bg-indigo-500 text-white transition-all';
        tabA.className = 'px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all';
    }
}

function copyCurrentSubject() {
    const subject = currentSubjectChoice === 'A' ? generatedSubjectA : generatedSubjectB;
    navigator.clipboard.writeText(subject);
    showToast('Subject copied!', 'success');
}

function copyBody() {
    const body = document.getElementById('generatedBody').value;
    navigator.clipboard.writeText(body);
    showToast('Body copied!', 'success');
}


function copyFullEmail() {
    const subject = currentSubjectChoice === 'A' ? generatedSubjectA : generatedSubjectB;
    const body = document.getElementById('generatedBody').value;
    const fullEmail = `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullEmail);
    showToast('Full email copied!', 'success');
}

function openInGmail() {
    if (!currentEmailClient) {
        showToast('No client selected', 'error');
        return;
    }
    const recipient = currentEmailClient.email;
    if (!recipient) {
        showToast('This client has no email address. Please add one first.', 'error');
        return;
    }
    const subject = currentSubjectChoice === 'A' ? generatedSubjectA : generatedSubjectB;
    const body = document.getElementById('generatedBody').value;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
    showToast(`Opening Gmail for ${currentEmailClient.name}...`, 'success');
}

// ============================================
// EMPTY STATES HELPERS
// ============================================

function clearSearchAndFilters() {
    // Clear search input
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) searchInput.value = '';
    currentSearchQuery = '';

    // Reset filter to "All Clients"
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.value = 'all';
    currentFilter = 'all';

    // Reset sort to default
    const sortSelect = document.getElementById('sortClients');
    if (sortSelect) sortSelect.value = 'name-asc';
    currentSort = 'name-asc';

    // Hide archived toggle
    const archivedToggle = document.getElementById('archivedToggle');
    if (archivedToggle) archivedToggle.checked = false;
    showArchived = false;

    // Reload clients
    loadClients();
}

function clearEmailSearch() {
    const searchInput = document.getElementById('emailSearch');
    if (searchInput) searchInput.value = '';

    // Reset to all emails
    currentEmailFilter = 'all';
    filterEmails('all');
}

// ============================================
// BULK IMPORT (CSV)
// ============================================

function openImportModal() {
    document.getElementById('importModal').classList.remove('hidden');
    // Reset state
    csvData = [];
    csvHeaders = [];
    document.getElementById('previewContainer').classList.add('hidden');
    document.getElementById('importBtn').disabled = true;
    document.getElementById('csvFileInput').value = '';
}

function closeImportModal() {
    document.getElementById('importModal').classList.add('hidden');
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        parseCSV(content);
    };
    reader.readAsText(file);
}

function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        showToast('CSV file is empty', 'error');
        return;
    }

    // Parse headers (first line)
    csvHeaders = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Parse data rows
    csvData = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        csvHeaders.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        csvData.push(row);
    }

    // Show preview
    const preview = csvData.slice(0, 5).map(row =>
        `${row.name || '-'} | ${row.business || '-'} | ${row.email || '-'}`
    ).join('\n');

    document.getElementById('csvPreview').textContent = preview || 'No valid data rows';
    document.getElementById('rowCount').textContent = csvData.length;
    document.getElementById('previewContainer').classList.remove('hidden');
    document.getElementById('importBtn').disabled = csvData.length === 0;
}

async function importClients() {
    if (csvData.length === 0) {
        showToast('No data to import', 'error');
        return;
    }

    const limit = getClientLimit();
    const currentCount = clients.filter(c => !c.archived).length;
    const availableSlots = limit - currentCount;

    // Check if user can import any clients
    if (availableSlots <= 0) {
        showUpgradeModal('clients');
        closeImportModal();
        return;
    }

    const btn = document.getElementById('importBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing...';

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];

        // Check if we've hit the limit
        if (successCount >= availableSlots) {
            skippedCount = csvData.length - i;
            break;
        }

        if (!row.name) {
            failCount++;
            continue;
        }

        const clientData = {
            name: row.name,
            business: row.business || null,
            email: row.email || null,
            project: row.project || null,
            amount: row.amount ? parseFloat(row.amount) : null,
            deadline: row.deadline || null,
            tags: row.tags ? row.tags.split(';').map(t => t.trim()) : [],
            status: row.status || 'active'
        };

        try {
            await addClient(clientData);
            successCount++;
        } catch (error) {
            console.error('Failed to import client:', row.name, error);
            failCount++;
        }
    }

    // Show appropriate message
    if (skippedCount > 0) {
        showToast(
            `✅ ${successCount} clients imported. ⚠️ ${skippedCount} skipped (free limit reached). Upgrade to Pro for unlimited clients.`,
            'info'
        );

        // Show upgrade modal after a short delay
        setTimeout(() => {
            showUpgradeModal('clients');
        }, 1500);
    } else if (failCount > 0) {
        showToast(`Imported ${successCount} clients (${failCount} failed)`, 'success');
    } else {
        showToast(`Imported ${successCount} clients`, 'success');
    }

    closeImportModal();
    await loadClients();

    btn.disabled = false;
    btn.textContent = originalText;
}

// ============================================
// EXPORT TO CSV
// ============================================

function exportToCSV() {
    // Get currently filtered/sorted clients (respect search, filter, sort)
    let exportClients = [...clients];

    // Apply current filter
    if (currentFilter !== 'all' && currentFilter !== 'attention') {
        exportClients = exportClients.filter(c => c.status === currentFilter);
    } else if (currentFilter === 'attention') {
        exportClients = exportClients.filter(c => needsAttention(c));
    }

    // Apply search
    exportClients = filterClientsBySearch(exportClients);

    // Apply sort
    exportClients = sortClientsArray(exportClients);

    // Define CSV headers
    const headers = ['Name', 'Business', 'Email', 'Project', 'Amount', 'Status', 'Tags', 'Last Contacted', 'Notes', 'Archived'];

    // Convert clients to CSV rows
    const rows = exportClients.map(client => [
        client.name || '',
        client.business || '',
        client.email || '',
        client.project || '',
        client.amount || '',
        client.status || 'active',
        client.last_contacted ? formatDate(client.last_contacted) : 'Never',
        client.notes || '',
        client.tags ? client.tags.join('; ') : '',
        client.archived ? 'Yes' : 'No'
    ]);

    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        // Escape commas and quotes
        const escapedRow = row.map(cell => {
            if (cell === null || cell === undefined) return '';
            const cellStr = String(cell);
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return '"' + cellStr.replace(/"/g, '""') + '"';
            }
            return cellStr;
        });
        csvContent += escapedRow.join(',') + '\n';
    });

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `closedraft_clients_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${exportClients.length} clients`, 'success');
}

// ============================================
// ARCHIVE CLIENT
// ============================================
async function archiveCurrentClient() {
    if (!selectedClientId) return;

    try {
        await archiveClient(selectedClientId);
        showToast('Client archived', 'success');
        closeDetailPanel();
        await loadClients();
        updateArchivedCount();  // ← ADD THIS
    } catch (error) {
        showToast('Failed to archive client', 'error');
    }
}

async function restoreClient(clientId) {
    try {
        const response = await authFetch(`/api/clients/${clientId}/restore`, {
            method: 'PATCH'
        });

        if (!response.ok) throw new Error('Failed to restore');

        showToast('Client restored', 'success');
        await loadClients();
        updateArchivedCount();  // ← ADD THIS

        // Close detail panel if the restored client was selected
        if (selectedClientId === clientId) {
            closeDetailPanel();
        }
    } catch (error) {
        showToast('Failed to restore client', 'error');
    }
}

function toggleShowArchived() {
    const toggle = document.getElementById('archivedToggle');
    showArchived = toggle.checked;
    loadClients();
}

async function updateArchivedCount() {
    try {
        // Fetch ALL clients including archived to get count
        const allClients = await fetchClients(true);
        const archivedCount = allClients.filter(c => c.archived).length;

        const countEl = document.getElementById('archivedCount');
        if (countEl) {
            countEl.textContent = archivedCount;
        }
    } catch (error) {
        console.error('Failed to fetch archived count:', error);
    }
}
// ============================================
// EMAIL HISTORY PAGE
// ============================================

async function loadEmailHistory() {
    try {
        showEmailListSkeleton();

        const startTime = Date.now();

        const response = await authFetch('/api/emails');
        const data = await response.json();
        allEmails = data.emails || [];

        // Ensure skeleton shows for at least 600ms
        const elapsed = Date.now() - startTime;
        if (elapsed < 600) {
            await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
        }

        updateEmailStats();
        renderEmailHistoryList();
        updateEmailTabCounts();
    } catch (error) {
        console.error('Failed to load email history:', error);
        showToast('Failed to load email history', 'error');
    }
}

function updateEmailLimitDisplay() {
    const plan = getUserPlan();
    const statsContainer = document.getElementById('dashEmailsSent');

    if (plan === 'free' && statsContainer) {
        const used = getEmailsThisMonth();
        const limit = 15;
        const remaining = limit - used;

        // Add a small indicator
        const parent = statsContainer.parentElement;
        let indicator = parent.querySelector('.email-limit-indicator');

        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'email-limit-indicator text-xs text-slate-500 ml-2';
            statsContainer.after(indicator);
        }

        indicator.textContent = `${used}/${limit} this month`;

        if (remaining <= 5) {
            indicator.classList.add('text-amber-400');
        }
    }
}

function updateEmailStats() {
    const totalEl = document.getElementById('totalEmailsSent');
    const monthEl = document.getElementById('emailsThisMonth');
    const toneEl = document.getElementById('mostUsedTone');

    if (totalEl) totalEl.textContent = allEmails.length;

    if (monthEl) {
        const now = new Date();
        const thisMonth = allEmails.filter(e => {
            const date = new Date(e.created_at);
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        });
        monthEl.textContent = thisMonth.length;
    }

    if (toneEl) {
        const tones = {};
        allEmails.forEach(e => { tones[e.tone] = (tones[e.tone] || 0) + 1; });
        const mostUsed = Object.entries(tones).sort((a, b) => b[1] - a[1])[0];
        toneEl.textContent = mostUsed ? mostUsed[0] : '-';
    }
}

function updateEmailTabCounts() {
    const allEl = document.getElementById('emailCountAll');
    const followupEl = document.getElementById('emailCountFollowup');
    const paymentEl = document.getElementById('emailCountPayment');
    const coldEl = document.getElementById('emailCountCold');

    if (allEl) allEl.textContent = allEmails.length;
    if (followupEl) followupEl.textContent = allEmails.filter(e => e.type === 'Follow-up').length;
    if (paymentEl) paymentEl.textContent = allEmails.filter(e => e.type === 'Payment Reminder').length;
    if (coldEl) coldEl.textContent = allEmails.filter(e => e.type === 'Cold Outreach').length;
}

function filterEmails(filter) {
    currentEmailFilter = filter;

    // Reset all tabs to default style
    ['emailTabAll', 'emailTabFollowup', 'emailTabPayment', 'emailTabCold'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.remove('bg-indigo-500/20', 'text-indigo-300', 'border-indigo-500/30');
        btn.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
    });

    // Activate the correct tab
    const tabMap = {
        'all': 'emailTabAll',
        'Follow-up': 'emailTabFollowup',
        'Payment Reminder': 'emailTabPayment',
        'Cold Outreach': 'emailTabCold'
    };
    const activeTabId = tabMap[filter];
    const activeBtn = document.getElementById(activeTabId);
    if (activeBtn) {
        activeBtn.classList.remove('bg-transparent', 'text-slate-400', 'border-transparent');
        activeBtn.classList.add('bg-indigo-500/20', 'text-indigo-300', 'border-indigo-500/30');
    }

    renderEmailHistoryList();
}

function renderEmailHistoryList() {
    const container = document.getElementById('emailHistoryList');
    const emptyState = document.getElementById('emailEmptyState');
    const noResults = document.getElementById('noEmailResults');

    if (!container) return;
    container.innerHTML = '';

    let filteredEmails = allEmails;
    if (currentEmailFilter !== 'all') {
        filteredEmails = allEmails.filter(e => e.type === currentEmailFilter);
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (noResults) noResults.classList.add('hidden');

    if (filteredEmails.length === 0) {
        if (allEmails.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
        } else {
            if (noResults) noResults.classList.remove('hidden');
        }
        return;
    }

    // Helper to return a colored tone badge
    function getToneBadge(tone) {
        switch (tone) {
            case 'Friendly': return 'bg-green-500/10 text-green-400 border-green-500/20';
            case 'Professional': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'Firm': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'Casual': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    }

    container.innerHTML = filteredEmails.map(email => `
    <tr class="hover:bg-white/[0.02] transition-colors group relative cursor-pointer"
        onclick="viewEmailDetail('${email.id}')">
        <td class="py-4 px-6">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-xs shrink-0">
                    ${email.clients?.name?.charAt(0) || '?'}
                </div>
                <div>
                    <p class="text-white font-medium text-sm">${email.clients?.name || 'Unknown'}</p>
                    <p class="text-slate-500 text-[11px]">${email.clients?.business || ''}</p>
                </div>
            </div>
        </td>
        <td class="py-4 px-6">
            <p class="text-white text-sm">${email.subject || 'No subject'}</p>
            <p class="text-slate-500 text-[11px] truncate max-w-[220px]">${email.body?.substring(0, 60) || ''}...</p>
        </td>
        <td class="py-4 px-6">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                ${email.type}
            </span>
        </td>
        <td class="py-4 px-6 text-slate-400 text-sm">${formatDate(email.created_at)}</td>
        <td class="py-4 px-6">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getToneBadge(email.tone)}">
                ${email.tone}
            </span>
        </td>
        <td class="py-4 px-6 text-right" onclick="event.stopPropagation()">
            <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="viewEmailDetail('${email.id}')" 
                    class="text-slate-500 hover:text-white transition-colors p-1" title="View">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                </button>
                <button onclick="deleteEmailById('${email.id}')" 
                    class="text-slate-500 hover:text-red-400 transition-colors p-1" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </td>
    </tr>
`).join('');
}

// Current selected email for detail view
function viewEmailDetail(emailId) {
    const email = allEmails.find(e => e.id === emailId);
    if (!email) return;

    currentDetailEmail = email;

    // Populate modal
    document.getElementById('detailEmailTo').textContent = email.clients?.name || 'Unknown Client';
    document.getElementById('detailEmailDate').textContent = formatDate(email.created_at);
    document.getElementById('detailEmailType').textContent = email.type || '-';
    document.getElementById('detailEmailTone').textContent = email.tone || '-';
    document.getElementById('detailEmailSubject').textContent = email.subject || 'No subject';
    document.getElementById('detailEmailBody').textContent = email.body || 'No content';

    // Show modal
    document.getElementById('emailDetailModal').classList.remove('hidden');
}

function closeEmailDetailModal() {
    document.getElementById('emailDetailModal').classList.add('hidden');
    currentDetailEmail = null;
}

function copyDetailSubject() {
    if (!currentDetailEmail) return;
    navigator.clipboard.writeText(currentDetailEmail.subject || '');
    showToast('Subject copied!', 'success');
}

function copyDetailBody() {
    if (!currentDetailEmail) return;
    navigator.clipboard.writeText(currentDetailEmail.body || '');
    showToast('Body copied!', 'success');
}

function copyFullDetailEmail() {
    if (!currentDetailEmail) return;
    const fullEmail = `Subject: ${currentDetailEmail.subject || ''}\n\n${currentDetailEmail.body || ''}`;
    navigator.clipboard.writeText(fullEmail);
    showToast('Full email copied!', 'success');
}

function openDetailInGmail() {
    if (!currentDetailEmail) return;

    const recipient = currentDetailEmail.clients?.email;
    if (!recipient) {
        showToast('No recipient email found', 'error');
        return;
    }

    const subject = encodeURIComponent(currentDetailEmail.subject || '');
    const body = encodeURIComponent(currentDetailEmail.body || '');
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`;

    window.open(gmailUrl, '_blank');
    showToast('Opening in Gmail...', 'success');
}

async function updateSendButtons() {
    const sendBtn = document.getElementById('sendNowBtn');
    const connectBtn = document.getElementById('connectGmailToSendBtn');
    if (!sendBtn || !connectBtn) return;

    const plan = getUserPlan();
    if (plan === 'free') {
        sendBtn.classList.add('hidden');
        connectBtn.classList.add('hidden');
        return;
    }

    try {
        const res = await authFetch('/api/gmail/status');
        const data = await res.json();
        if (data.connected) {
            sendBtn.classList.remove('hidden');
            connectBtn.classList.add('hidden');
        } else {
            sendBtn.classList.add('hidden');
            connectBtn.classList.remove('hidden');
        }
    } catch (e) {
        sendBtn.classList.add('hidden');
        connectBtn.classList.add('hidden');
    }
}

async function sendNow() {
    if (!currentEmailClient) return;
    const subject = currentSubjectChoice === 'A' ? generatedSubjectA : generatedSubjectB;
    const body = document.getElementById('generatedBody').value.trim();
    if (!body) {
        showToast('Email body cannot be empty', 'error');
        return;
    }
    const btn = document.getElementById('sendNowBtn');
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Sending…';

    try {
        const res = await authFetch('/api/send-now', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: currentEmailClient.id,
                subject,
                body,
                type: document.getElementById('emailType').value,
                tone: document.getElementById('emailTone').value,
                freelancerName: window.userSettings?.name || 'Freelancer'
            })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to send');
        }
        showToast('Email sent!', 'success');
        await loadEmailHistory();
        closeEmailModal();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }
}

function handleEmailSearch(e) {
    const query = e.target.value.toLowerCase();
    const filtered = allEmails.filter(email =>
        email.clients?.name?.toLowerCase().includes(query) ||
        email.subject?.toLowerCase().includes(query) ||
        email.body?.toLowerCase().includes(query)
    );

    const container = document.getElementById('emailHistoryList');
    const emptyState = document.getElementById('emailEmptyState');
    const noResults = document.getElementById('noEmailResults');

    if (!container) return;

    container.innerHTML = '';

    if (emptyState) emptyState.classList.add('hidden');
    if (noResults) noResults.classList.add('hidden');

    if (filtered.length === 0) {
        if (noResults) noResults.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = filtered.map(email => `
        <div class="grid grid-cols-12 items-center px-6 py-4 hover:bg-white/5 transition-all cursor-pointer" onclick="viewEmailDetail('${email.id}')">
            <div class="col-span-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-xs">
                    ${email.clients?.name?.charAt(0) || '?'}
                </div>
                <div>
                    <h4 class="text-sm font-medium text-white">${email.clients?.name || 'Unknown'}</h4>
                    <p class="text-xs text-slate-500">${email.clients?.business || ''}</p>
                </div>
            </div>
            <div class="col-span-4">
                <p class="text-sm text-white truncate">${email.subject || 'No subject'}</p>
                <p class="text-xs text-slate-500 truncate">${email.body?.substring(0, 50)}...</p>
            </div>
            <div class="col-span-2">
                <span class="text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300">${email.type}</span>
            </div>
            <div class="col-span-2 text-xs text-slate-400">${formatDate(email.created_at)}</div>
            <div class="col-span-1 text-right">
                <span class="text-xs px-2 py-1 rounded-full bg-slate-700/50 text-slate-400">${email.tone}</span>
            </div>
        </div>
    `).join('');
}

async function deleteEmailById(emailId) {
    showConfirmModal('Delete this email? This cannot be undone.', async () => {
        try {
            const res = await authFetch(`/api/emails/${emailId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            showToast('Email deleted', 'success');

            // Clear search inputs to avoid confusion
            const searchInput = document.getElementById('emailSearch');
            const searchMobile = document.getElementById('emailSearchMobile');
            if (searchInput) searchInput.value = '';
            if (searchMobile) searchMobile.value = '';

            // Reload email history (respects current filter)
            await loadEmailHistory();
        } catch (e) {
            showToast('Failed to delete email', 'error');
        }
    }, 'Delete Email', 'Delete');
}


function updateDetailPanelActions(client) {
    const actionsContainer = document.getElementById('detailPanelActions');
    if (!actionsContainer) return;

    if (client.archived) {
        // Show Restore button + Delete button
        actionsContainer.innerHTML = `
            <button onclick="restoreClient('${client.id}')" 
                class="p-2 text-slate-400 hover:text-green-400 transition-colors" title="Restore Client">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
            </button>
            <button onclick="deleteCurrentClient()" 
                class="p-2 text-slate-400 hover:text-red-400 transition-colors" title="Delete Client">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                    </path>
                </svg>
            </button>
        `;
    } else {
        // Show Archive button + Delete button
        actionsContainer.innerHTML = `
            <button onclick="archiveCurrentClient()" 
                class="p-2 text-slate-400 hover:text-amber-400 transition-colors" title="Archive Client">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4">
                    </path>
                </svg>
            </button>
            <button onclick="deleteCurrentClient()" 
                class="p-2 text-slate-400 hover:text-red-400 transition-colors" title="Delete Client">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                    </path>
                </svg>
            </button>
        `;
    }
}
// ============================================
// BULK SELECT & DELETE
// ============================================

// Toggle select all checkboxes
function toggleSelectAll(selectAllCheckbox) {
    const isChecked = selectAllCheckbox.checked;
    const checkboxes = document.querySelectorAll('.client-checkbox');

    checkboxes.forEach(cb => {
        cb.checked = isChecked;
    });

    updateBulkDeleteButton();
}

// Update bulk delete button visibility and count
function updateBulkDeleteButton() {
    const selectedCheckboxes = document.querySelectorAll('.client-checkbox:checked');
    const selectedCount = selectedCheckboxes.length;
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const selectedCountSpan = document.getElementById('selectedCount');

    if (bulkDeleteBtn) {
        if (selectedCount > 0) {
            bulkDeleteBtn.classList.remove('hidden');
            selectedCountSpan.textContent = selectedCount;
        } else {
            bulkDeleteBtn.classList.add('hidden');
        }
    }

    // Update select all checkbox state
    const allCheckboxes = document.querySelectorAll('.client-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllClients');
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = !allChecked && selectedCount > 0;
    }
}

// Listen for checkbox changes
document.addEventListener('change', function (e) {
    if (e.target.classList.contains('client-checkbox')) {
        updateBulkDeleteButton();
    }
});

// Open bulk delete confirmation modal
function openBulkDeleteModal() {
    const selectedCheckboxes = document.querySelectorAll('.client-checkbox:checked');
    const selectedCount = selectedCheckboxes.length;

    if (selectedCount === 0) return;

    // Store selected client IDs for deletion
    window.bulkDeleteClientIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.clientId);

    // Update modal message
    document.getElementById('bulkDeleteCount').textContent = selectedCount;
    document.getElementById('bulkDeleteModal').classList.remove('hidden');
}

// Close bulk delete modal
function closeBulkDeleteModal() {
    document.getElementById('bulkDeleteModal').classList.add('hidden');
    window.bulkDeleteClientIds = [];
}

// Confirm bulk delete
async function confirmBulkDelete() {
    const clientIds = window.bulkDeleteClientIds;
    if (!clientIds || clientIds.length === 0) return;

    const btn = document.querySelector('#bulkDeleteModal .confirm-delete-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    let successCount = 0;
    let failCount = 0;

    for (const clientId of clientIds) {
        try {
            await deleteClient(clientId);
            successCount++;
        } catch (error) {
            console.error('Failed to delete client:', clientId, error);
            failCount++;
        }
    }

    showToast(`Deleted ${successCount} clients${failCount > 0 ? ` (${failCount} failed)` : ''}`, 'success');

    closeBulkDeleteModal();
    await loadClients();

    btn.disabled = false;
    btn.textContent = originalText;
}

// ============================================
// UPGRADE MODAL
// ============================================

function showUpgradeModal(type) {
    const modal = document.getElementById('upgradeModal');
    const messageEl = document.getElementById('upgradeMessage');

    if (!modal || !messageEl) {
        console.error('❌ Upgrade modal elements not found');
        return;
    }

    // Set the message based on what limit was hit
    if (type === 'clients') {
        messageEl.textContent = "You've reached the free limit of 10 clients.";
    } else if (type === 'emails') {
        messageEl.textContent = "You've reached the free limit of 20 AI emails this month.";
    } else {
        messageEl.textContent = "You've reached the free limit.";
    }

    // Store the upgrade type
    window.upgradeType = type;

    // Show the modal
    modal.classList.remove('hidden');
}

function closeUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ============================================
// EMAIL LIMITS
// ============================================

function getEmailsThisMonth() {
    const now = new Date();
    const thisMonth = allEmails.filter(email => {
        const emailDate = new Date(email.created_at);
        return emailDate.getMonth() === now.getMonth() &&
            emailDate.getFullYear() === now.getFullYear();
    });
    return thisMonth.length;
}

function checkEmailLimit() {
    const plan = getUserPlan();

    // Pro users have no limit
    if (plan !== 'free') {
        return true;
    }

    const limit = 15;
    const currentCount = getEmailsThisMonth();

    if (currentCount >= limit) {
        showUpgradeModal('emails');
        return false;
    }

    return true;
}

// ============================================
// SETTINGS PAGE
// ============================================

async function loadSettings() {
    // Load user profile into form
    if (window.userSettings) {
        document.getElementById('settingsName').value = window.userSettings.name || '';
        document.getElementById('settingsEmail').value = window.userSettings.email || '';

        const initial = (window.userSettings.name || 'U').charAt(0).toUpperCase();
        // Update both header avatar and card avatar
        const headerAvatar = document.getElementById('settingsAvatar');
        if (headerAvatar) headerAvatar.textContent = initial;
        const cardAvatar = document.getElementById('settingsAvatarLarge');
        if (cardAvatar) cardAvatar.textContent = initial;
    }

    if (typeof loadDiscordStatus === 'function') await loadDiscordStatus();
    if (typeof loadTelegramStatus === 'function') await loadTelegramStatus();
    if (typeof loadGmailStatus === 'function') await loadGmailStatus();

    // Load plan info
    await loadUserPlanInfo();
}

async function loadUserPlanInfo() {
    // Force refresh plan from database
    if (window.userSettings?.id) {
        const { data } = await window.supabase
            .from('profiles')
            .select('plan')
            .eq('id', window.userSettings.id)
            .single();

        if (data?.plan) {
            window.userPlan = data.plan;
        }
    }

    const plan = window.userPlan || 'free';

    const planDisplay = document.getElementById('currentPlanDisplay');
    const planDescription = document.getElementById('planDescription');
    const upgradeBtn = document.getElementById('upgradeSettingsBtn');
    const proFeatures = document.getElementById('proFeaturesList');
    const subscriptionNote = document.getElementById('subscriptionNote');
    const planBadge = document.getElementById('planActiveBadge'); // new ID

    if (plan === 'free') {
        if (planDisplay) planDisplay.textContent = 'Free Plan';
        if (planDescription) planDescription.textContent = '10 clients · 20 AI emails/month';
        if (upgradeBtn) upgradeBtn.classList.remove('hidden');
        if (proFeatures) proFeatures.classList.add('hidden');
        if (subscriptionNote) subscriptionNote.classList.add('hidden');
        if (planBadge) {
            planBadge.textContent = 'Free';
            planBadge.className = 'px-2.5 py-1 rounded-full bg-slate-500/20 text-slate-300 text-xs font-semibold';
        }
    } else {
        const planName = plan === 'pro_monthly' ? 'Pro Monthly' :
            plan === 'pro_yearly' ? 'Pro Yearly' : 'Pro Lifetime';
        if (planDisplay) planDisplay.textContent = planName;
        if (planDescription) planDescription.textContent = 'Unlimited clients · Unlimited AI emails · Chrome Extension';
        if (upgradeBtn) upgradeBtn.classList.add('hidden');
        if (proFeatures) proFeatures.classList.remove('hidden');
        if (subscriptionNote) subscriptionNote.classList.remove('hidden');
        if (planBadge) {
            planBadge.textContent = 'Active';
            planBadge.className = 'px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold';
        }
    }
}

async function saveSettings() {
    const name = document.getElementById('settingsName').value;

    if (!name) {
        showToast('Name cannot be empty', 'error');
        return;
    }

    try {
        const { error } = await window.supabase
            .from('profiles')
            .update({ full_name: name })
            .eq('id', window.userSettings.id);

        if (error) throw error;

        // Update local settings
        window.userSettings.name = name;
        updateSidebarProfile();

        // Update all avatars
        const initial = name.charAt(0).toUpperCase();
        document.querySelectorAll('.w-8.h-8.rounded-full.gradient-primary').forEach(avatar => {
            avatar.textContent = initial;
        });

        // Update greeting if on dashboard
        const greetingEl = document.getElementById('dashboardUserName');
        if (greetingEl) {
            const parts = greetingEl.textContent.split(', ');
            if (parts.length === 2) {
                greetingEl.textContent = `${parts[0]}, ${name}`;
            }
        }

        showToast('Settings saved', 'success');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('Failed to save settings', 'error');
    }
}

function confirmDeleteAccount() {
    if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
        showToast('Please contact support to delete your account', 'info');
    }
}

// ============================================
// ONBOARDING CHECKLIST & DEMO DATA
// ============================================

function initOnboardingChecklist() {
    // Show checklist and banner for new users (those with demo data)
    const hasClients = clients.length > 0;
    const allAreDemo = clients.every(c => c.name && ['Sarah Chen', 'Marcus Lee', 'Elena Rodriguez', 'James Ward', 'Ava Mitchell', 'Daniel Brooks', 'Emma Collins', 'Isabella Hughes'].includes(c.name));

    const checklist = document.getElementById('onboardingChecklist');
    const banner = document.getElementById('demoBanner');

    // If all clients are demo clients, show checklist and banner
    if (hasClients && allAreDemo && clients.length <= 8) {
        if (checklist) checklist.classList.remove('hidden');
        if (banner) banner.classList.remove('hidden');
    }

    // Check which items are completed
    checkOnboardingProgress();
}

function checkOnboardingProgress() {
    // Check item 1: Has generated at least 1 email
    if (allEmails.length > 0) {
        markCheckComplete('checkItem1');
    }

    // Check item 2: Has at least 1 non-demo client (client with unique name not in demo list)
    const demoNames = ['Sarah Chen', 'Marcus Lee', 'Elena Rodriguez', 'James Ward', 'Ava Mitchell', 'Daniel Brooks', 'Emma Collins', 'Isabella Hughes'];
    const hasRealClient = clients.some(c => !demoNames.includes(c.name));
    if (hasRealClient) {
        markCheckComplete('checkItem2');
    }

    // Check item 3: Has marked a client as contacted (any client with last_contacted = today)
    const today = new Date().toDateString();
    const hasContactedToday = clients.some(c => {
        const contactDate = c.last_contacted ? new Date(c.last_contacted).toDateString() : null;
        return contactDate === today;
    });
    if (hasContactedToday) {
        markCheckComplete('checkItem3');
    }

    // If all items complete, hide the checklist after a delay
    const allComplete = allEmails.length > 0 && hasRealClient && hasContactedToday;
    if (allComplete) {
        setTimeout(() => {
            const checklist = document.getElementById('onboardingChecklist');
            const banner = document.getElementById('demoBanner');
            if (checklist) checklist.classList.add('hidden');
            if (banner) banner.classList.add('hidden');
        }, 3000);
    }
}

function markCheckComplete(itemId) {
    const item = document.getElementById(itemId);
    if (!item) return;
    const circle = item.querySelector('.w-5.h-5');
    const icon = item.querySelector('svg');
    const text = item.querySelector('span');

    if (circle) {
        circle.classList.remove('bg-slate-700');
        circle.classList.add('bg-green-500/20');
    }
    if (icon) {
        icon.classList.remove('text-slate-500');
        icon.classList.add('text-green-400');
    }
    if (text) {
        text.classList.remove('text-slate-400');
        text.classList.add('text-green-400');
    }
}

async function clearDemoData() {
    if (!confirm('Remove all demo clients? This cannot be undone.')) return;

    const demoNames = ['Sarah Chen', 'Marcus Lee', 'Elena Rodriguez', 'James Ward', 'Ava Mitchell', 'Daniel Brooks', 'Emma Collins', 'Isabella Hughes'];
    const demoClients = clients.filter(c => demoNames.includes(c.name));

    let deleted = 0;
    for (const client of demoClients) {
        try {
            await deleteClient(client.id);
            deleted++;
        } catch (e) {
            console.error('Failed to delete:', client.name, e);
        }
    }

    showToast(`Cleared ${deleted} demo clients`, 'success');
    await loadClients();
    updateDashboardStats();
    renderDashboardAttentionList();

    // Hide banner
    const banner = document.getElementById('demoBanner');
    if (banner) banner.classList.add('hidden');
}

function getDeadlineUrgency(deadline) {
    if (!deadline) return 'text-white';
    const now = new Date();
    const dl = new Date(deadline);
    if (dl < now) return 'text-red-400 font-medium';
    const diffDays = Math.ceil((dl - now) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) return 'text-amber-400 font-medium';
    return 'text-white';
}

// ============================================
// QUICK NOTES
// ============================================

let quickNotes = [];

async function loadQuickNotes() {
    try {
        const { data, error } = await window.supabase
            .from('profiles')
            .select('quick_notes')
            .eq('id', window.userSettings.id)
            .single();

        if (!error && data?.quick_notes) {
            quickNotes = typeof data.quick_notes === 'string'
                ? JSON.parse(data.quick_notes)
                : data.quick_notes;
        } else {
            quickNotes = [];
        }
    } catch (e) {
        quickNotes = [];
    }
    renderNotesList();
}

function renderNotesList() {
    const list = document.getElementById('notesList');
    const empty = document.getElementById('notesEmpty');
    const count = document.getElementById('notesCount');

    if (!list) return;

    const activeNotes = quickNotes.filter(n => !n.done);
    const doneNotes = quickNotes.filter(n => n.done);

    list.innerHTML = '';

    if (quickNotes.length === 0) {
        empty.classList.remove('hidden');
        count.textContent = '';
        return;
    }

    empty.classList.add('hidden');
    count.textContent = `${activeNotes.length} active · ${doneNotes.length} done`;

    // Active notes first
    activeNotes.forEach((note, index) => {
        const realIndex = quickNotes.indexOf(note);
        list.innerHTML += `
            <div class="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 group">
                <button onclick="toggleNote(${realIndex})" class="w-5 h-5 rounded-full border-2 border-slate-500 hover:border-green-400 flex items-center justify-center flex-shrink-0 transition-all">
                    <svg class="w-3 h-3 text-transparent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                </button>
                <span class="text-sm text-slate-300 flex-1">${escapeHTML(note.text)}</span>
                <button onclick="deleteNote(${realIndex})" class="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
    });

    // Done notes (strikethrough)
    if (doneNotes.length > 0) {
        list.innerHTML += `<div class="pt-2 mt-2 border-t border-white/5"></div>`;
        doneNotes.forEach((note, index) => {
            const realIndex = quickNotes.indexOf(note);
            list.innerHTML += `
                <div class="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 group opacity-60">
                    <button onclick="toggleNote(${realIndex})" class="w-5 h-5 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center flex-shrink-0">
                        <svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </button>
                    <span class="text-sm text-slate-500 line-through flex-1">${escapeHTML(note.text)}</span>
                    <button onclick="deleteNote(${realIndex})" class="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            `;
        });
    }
}

async function addNote() {
    const input = document.getElementById('newNoteInput');
    const text = input.value.trim();
    if (!text) return;

    quickNotes.unshift({ text, done: false, created_at: new Date().toISOString() });
    input.value = '';
    await saveNotesToDB();
    renderNotesList();
}

async function toggleNote(index) {
    quickNotes[index].done = !quickNotes[index].done;
    await saveNotesToDB();
    renderNotesList();
}

async function deleteNote(index) {
    quickNotes.splice(index, 1);
    await saveNotesToDB();
    renderNotesList();
}

async function saveNotesToDB() {
    try {
        await window.supabase
            .from('profiles')
            .update({
                quick_notes: JSON.stringify(quickNotes),
                updated_at: new Date().toISOString()
            })
            .eq('id', window.userSettings.id);
    } catch (e) {
        console.error('Failed to save notes:', e);
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// CLIENT TAGS
// ============================================

function renderClientTags(tags) {
    const container = document.getElementById('detailTags');
    if (!container) return;

    if (!tags || tags.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500">No tags yet</p>';
        return;
    }

    container.innerHTML = tags.map(tag => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            ${tag}
            <button onclick="removeTagFromClient('${tag}')" class="hover:text-red-400 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </span>
    `).join('');
}

async function addTagToClient() {
    if (!selectedClientId) return;
    const select = document.getElementById('tagSelect');
    const tag = select.value;
    if (!tag) return;

    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    const tags = [...(client.tags || [])];
    if (tags.includes(tag)) {
        showToast('Tag already exists', 'error');
        return;
    }

    tags.push(tag);

    try {
        await updateClient(selectedClientId, { tags });
        client.tags = tags;
        renderClientTags(tags);
        renderClientList();
        select.value = '';
        showToast('Tag added', 'success');
    } catch (e) {
        showToast('Failed to add tag', 'error');
    }
}

async function removeTagFromClient(tag) {
    if (!selectedClientId) return;
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    const tags = (client.tags || []).filter(t => t !== tag);

    try {
        await updateClient(selectedClientId, { tags });
        client.tags = tags;
        renderClientTags(tags);
        renderClientList();
        showToast('Tag removed', 'success');
    } catch (e) {
        showToast('Failed to remove tag', 'error');
    }
}

function openActivityModal() {
    const list = document.getElementById('activityModalList');
    const empty = document.getElementById('activityModalEmpty');

    const recentEmails = allEmails.slice(0, 10);

    if (recentEmails.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        list.innerHTML = recentEmails.map(email => `
            <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                    </svg>
                </div>
                <div>
                    <p class="text-sm text-white">Email sent to <span class="text-indigo-300">${email.clients?.name || 'Unknown'}</span></p>
                    <p class="text-xs text-slate-500">${formatDate(email.created_at)} • ${email.type}</p>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('activityModal').classList.remove('hidden');
}

function closeActivityModal() {
    document.getElementById('activityModal').classList.add('hidden');
}

// ============================================
// EMAIL SEQUENCES
// ============================================

let sequences = [];

async function loadSequences() {
    // First check Gmail connection
    try {
        const gmailRes = await authFetch('/api/gmail/status');
        const gmailData = await gmailRes.json();
        const gmailConnected = gmailData.connected;

        const grid = document.getElementById('sequencesGrid');
        const empty = document.getElementById('sequencesEmpty');
        const gmailRequired = document.getElementById('sequencesGmailRequired');

        if (!gmailConnected) {
            // Hide normal content, show Gmail required message
            if (grid) grid.innerHTML = '';
            if (empty) empty.classList.add('hidden');
            if (gmailRequired) gmailRequired.classList.remove('hidden');
            return;
        }

        // Hide the Gmail required message
        if (gmailRequired) gmailRequired.classList.add('hidden');

        // Existing code to load sequences...
        const response = await authFetch('/api/sequences');
        const data = await response.json();
        sequences = data.sequences || [];
        renderSequencesGrid();

    } catch (e) {
        console.error('Failed to load sequences:', e);
    }
}

function renderSequencesGrid() {
    const grid = document.getElementById('sequencesGrid');
    if (!grid) return;
    const empty = document.getElementById('sequencesEmpty');

    if (sequences.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = sequences.map(seq => {
        const currentStep = seq.current_step || 0;
        const progress = seq.total_steps > 0 ? Math.round((currentStep / seq.total_steps) * 100) : 0;
        const nextStep = (seq.steps || []).find(s => !s.sent_at);
        const isComplete = !nextStep && seq.total_steps > 0 && currentStep >= seq.total_steps;

        return `
        <div class="glass-card rounded-2xl p-5 ${isComplete ? 'opacity-70' : ''}">
            <div class="flex items-start justify-between mb-3">
                <div>
                    <h3 class="font-semibold text-white">${escapeHTML(seq.name)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${seq.clients?.name || 'Unknown'} • ${seq.type}</p>
                </div>
                <span class="status-badge ${seq.status === 'active' ? 'status-active' : 'status-waiting'}">${isComplete ? 'COMPLETED' : (seq.status || 'ACTIVE')}</span>
            </div>
            <div class="mb-3">
                <div class="flex justify-between text-xs mb-1">
                    <span class="text-slate-400">Progress</span>
                    <span class="text-white">${currentStep}/${seq.total_steps}</span>
                </div>
                <div class="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div class="h-full gradient-primary rounded-full" style="width: ${progress}%"></div>
                </div>
            </div>
            ${nextStep ? `
                <p class="text-xs text-slate-500 mb-3">Next: Day ${nextStep.day_delay} (Step ${nextStep.step_number})</p>
                <div class="flex gap-2">
                    <button onclick="sendNextInSequence('${seq.id}')" class="flex-1 gradient-primary text-white py-2 rounded-lg text-xs font-bold">Generate Next Email</button>
                    <button onclick="deleteSequence('${seq.id}')" class="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all" title="Delete Sequence">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            ` : `
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                    <p class="text-xs text-green-400 font-medium">✓ All emails sent</p>
                    <button onclick="deleteSequence('${seq.id}')" class="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all" title="Delete Sequence">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            `}
        </div>`;
    }).join('');
}

function openAddSequenceModal() {
    document.getElementById('addSequenceModal').classList.remove('hidden');
    // Populate client dropdown
    const select = document.getElementById('seqClient');
    select.innerHTML = '<option value="">-- Select a client --</option>' +
        clients.map(c => `<option value="${c.id}">${c.name} (${c.business || 'N/A'})</option>`).join('');
}

function closeAddSequenceModal() {
    document.getElementById('addSequenceModal').classList.add('hidden');
    document.getElementById('addSequenceForm').reset();
}

// Attach sequence form handler
const seqForm = document.getElementById('addSequenceForm');
if (seqForm) {
    seqForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const days = document.querySelectorAll('.seq-day');
        const steps = Array.from(days).map((input, i) => ({
            stepNumber: i + 1,
            dayDelay: parseInt(input.value) || 1
        }));

        const data = {
            clientId: document.getElementById('seqClient').value,
            name: document.getElementById('seqName').value,
            type: document.getElementById('seqType').value,
            tone: document.getElementById('seqTone').value,
            steps: steps
        };

        if (!data.clientId || !data.name) {
            showToast('Client and name are required', 'error');
            return;
        }

        const submitBtn = seqForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const response = await authFetch('/api/sequences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Failed');
            showToast('Sequence created', 'success');
            closeAddSequenceModal();
            loadSequences();
        } catch (e) {
            showToast('Failed to create sequence', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

async function sendNextInSequence(seqId) {
    // Find the button that was clicked and show loading state
    const buttons = document.querySelectorAll(`button[onclick="sendNextInSequence('${seqId}')"]`);
    const btn = buttons[0];
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="loader"></span> Generating...';
    }

    try {
        const response = await authFetch(`/api/sequences/${seqId}/send-next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ freelancerName: window.userSettings?.name || 'Freelancer' })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        console.log('📊 Server response:', data);
        console.log('📊 Step:', data.step, 'Total:', data.total);

        // Find the sequence to get client info
        const sequence = sequences.find(s => s.id === seqId);

        if (sequence && sequence.clients) {
            currentEmailClient = sequence.clients;
            document.getElementById('emailClientName').textContent = currentEmailClient.name;
        }

        // Set the two subjects
        generatedSubjectA = data.subjectA || data.subject || 'Follow-up';
        generatedSubjectB = data.subjectB || data.subject || 'Follow-up';
        generatedBody = data.body;
        currentSubjectChoice = 'A';

        // Update modal UI with subject A initially
        document.getElementById('generatedSubject').textContent = generatedSubjectA;

        // Style the subject tabs
        const tabA = document.getElementById('subjectTabA');
        const tabB = document.getElementById('subjectTabB');
        if (tabA && tabB) {
            tabA.className = 'px-3 py-1 rounded-md text-xs font-medium bg-indigo-500 text-white transition-all';
            tabB.className = 'px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all';
        }

        document.getElementById('generatedBody').value = generatedBody;   
        document.getElementById('emailConfig').classList.add('hidden');
        document.getElementById('emailResult').classList.remove('hidden');
        document.getElementById('emailModal').classList.remove('hidden');

        updateSendButtons();

        showToast(`Step ${data.step}/${data.total} generated`, 'success');

        await loadSequences();  // Refresh to update progress bar
        await loadEmailHistory();

    } catch (e) {
        showToast(e.message || 'Failed to generate', 'error');
    } finally {
        // Restore button state
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function deleteSequence(seqId) {
    showConfirmModal('Delete this sequence? This cannot be undone.', async () => {
        try {
            await authFetch(`/api/sequences/${seqId}`, { method: 'DELETE' });
            showToast('Sequence deleted', 'success');
            loadSequences();
        } catch (e) {
            showToast('Failed to delete', 'error');
        }
    }, 'Delete Sequence', 'Delete');
}

// ============================================
// CLIENT ACTIVITY TIMELINE
// ============================================

async function loadClientTimeline(clientId) {
    try {
        const response = await authFetch(`/api/client-activities/${clientId}`);
        const data = await response.json();
        console.log('📜 Timeline activities fetched:', data.activities);
        renderTimeline(data.activities || []);
    } catch (error) {
        console.error('Failed to load timeline', error);
        const container = document.getElementById('clientTimelineList');
        if (container) container.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">Failed to load activity.</p>';
    }
}

function renderTimeline(activities) {
    const container = document.getElementById('clientTimelineList');
    if (!container) return;

    if (!activities || activities.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">No activity yet.</p>';
        return;
    }

    console.log('🎨 Rendering activities:', activities);

    container.innerHTML = activities.map(act => {
        const date = new Date(act.created_at).toLocaleString();
        let icon = '', text = '';

        switch (act.activity_type) {
            case 'email_sent':
                icon = '📧';
                text = `Email sent: "${act.metadata?.subject || 'No subject'}" (${act.metadata?.type || 'email'})`;
                break;
            case 'contacted':
                icon = '✓';
                text = `Marked as contacted`;
                break;
            case 'status_change':
                icon = '🔄';
                text = `Status changed: ${act.metadata?.old_status} → ${act.metadata?.new_status}`;
                break;
            default:
                icon = '📝';
                text = act.activity_type;
        }

        return `
            <div class="flex gap-3 py-3 border-b border-white/5">
                <div class="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">${icon}</div>
                <div class="flex-1">
                    <p class="text-sm text-white">${text}</p>
                    <p class="text-xs text-slate-500">${date}</p>
                </div>
            </div>
        `;
    }).join('');
}

function generateInvoice() {
    if (getUserPlan() === 'free') {
        showUpgradeModal('invoices');
        return;
    }

    if (!selectedClientId) {
        showToast('No client selected', 'error');
        return;
    }

    const client = clients.find(c => c.id === selectedClientId);
    if (!client) {
        showToast('Client not found', 'error');
        return;
    }

    // Validate required fields
    if (!client.amount || client.amount <= 0) {
        showToast('No project amount set for this client. Please add a value first.', 'error');
        return;
    }

    // Build invoice HTML
    const invoiceHtml = buildInvoiceHtml(client);

    // Open a new window and write the invoice
    const invoiceWindow = window.open('', '_blank');
    invoiceWindow.document.write(invoiceHtml);
    invoiceWindow.document.close();
    invoiceWindow.print();  // Triggers print dialog → Save as PDF
}

function buildInvoiceHtml(client) {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const invoiceNumber = `INV-${client.id.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const amountFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(client.amount);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Invoice - ${client.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: #f5f7fa;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
        }
        .invoice {
            max-width: 800px;
            width: 100%;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .invoice-header {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            padding: 30px;
            color: white;
        }
        .invoice-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .invoice-header p {
            opacity: 0.9;
            font-size: 14px;
        }
        .invoice-body {
            padding: 30px;
        }
        .client-details {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
        }
        .client-details h3 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #1e293b;
        }
        .client-details p {
            color: #475569;
            margin: 4px 0;
        }
        .invoice-items {
            margin-bottom: 30px;
        }
        .invoice-items table {
            width: 100%;
            border-collapse: collapse;
        }
        .invoice-items th {
            text-align: left;
            padding: 12px 8px;
            background: #f1f5f9;
            font-weight: 600;
            color: #1e293b;
            border-bottom: 2px solid #cbd5e1;
        }
        .invoice-items td {
            padding: 12px 8px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
        }
        .total-row {
            font-weight: 700;
            background: #f8fafc;
        }
        .total-amount {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .invoice {
                box-shadow: none;
                border-radius: 0;
            }
            .invoice-header {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="invoice-header">
            <h1>INVOICE</h1>
            <p>Generated by CloseDraft</p>
        </div>
        <div class="invoice-body">
            <div class="client-details">
                <h3>Bill To:</h3>
                <p><strong>${escapeHtml(client.name)}</strong></p>
                ${client.business ? `<p>${escapeHtml(client.business)}</p>` : ''}
                ${client.email ? `<p>${escapeHtml(client.email)}</p>` : ''}
            </div>
            
            <div class="invoice-details" style="margin-bottom: 30px; display: flex; justify-content: space-between;">
                <div><strong>Invoice Number:</strong> ${invoiceNumber}</div>
                <div><strong>Date:</strong> ${today}</div>
            </div>
            
            <div class="invoice-items">
                <table>
                    <thead>
                        <tr><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${client.project ? escapeHtml(client.project) : 'Professional Services'}${client.deadline ? `<br><small style="color: #64748b;">Due: ${new Date(client.deadline).toLocaleDateString()}</small>` : ''}</td>
                            <td>${amountFormatted}</td>
                        </tr>
                        <tr class="total-row">
                            <td><strong>Total</strong></td>
                            <td class="total-amount">${amountFormatted}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div style="background: #fefce8; padding: 16px; border-radius: 12px; border-left: 4px solid #eab308;">
                <p style="font-size: 14px; color: #854d0e;"><strong>Payment Instructions</strong><br>
                Please make payment within 14 days. Contact us for payment methods.</p>
            </div>
        </div>
        <div class="footer">
            <p>Thank you for your business!<br>CloseDraft – Client management for freelancers</p>
        </div>
    </div>
</body>
</html>
    `;
}

// Helper to escape HTML (prevent injection)
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function (c) {
        return c;
    });
}

// ==================== DISCORD OAUTH ====================
function connectDiscord() {
    if (getUserPlan() === 'free') {
        showUpgradeModal('discord');
        return;
    }

    authFetch('/api/discord/auth-url')
        .then(r => r.json())
        .then(data => { window.location.href = data.url; });
}

async function loadDiscordStatus() {
    try {
        const res = await authFetch('/api/discord/status');
        const data = await res.json();

        const disconnectedDiv = document.getElementById('discordDisconnected');
        const connectedDiv = document.getElementById('discordConnected');
        const statusText = document.getElementById('discordStatusText');

        if (data.connected) {
            disconnectedDiv.classList.add('hidden');
            connectedDiv.classList.remove('hidden');
            if (statusText) {
                statusText.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full status-dot-connected"></span>Connected as ${data.username || 'User'}</span>`;
                statusText.className = 'text-xs text-green-400 mt-0.5 font-medium';
            }
            // Set checkboxes according to prefs
            document.querySelectorAll('.discord-pref-checkbox').forEach(cb => {
                const type = cb.getAttribute('data-notif-type');
                cb.checked = data.prefs[type] !== false;
            });
        } else {
            disconnectedDiv.classList.remove('hidden');
            connectedDiv.classList.add('hidden');
            if (statusText) {
                statusText.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full status-dot-disconnected"></span>Not connected</span>`;
                statusText.className = 'text-xs text-slate-400 mt-0.5';
            }
        }
    } catch (e) {
        console.error('Failed to load Discord status', e);
    }
}

async function saveDiscordPrefs() {
    const prefs = {};
    document.querySelectorAll('.discord-pref-checkbox').forEach(cb => {
        prefs[cb.getAttribute('data-notif-type')] = cb.checked;
    });
    await authFetch('/api/discord/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs })
    });
    showToast('Discord notification preferences saved', 'success');
}

async function disconnectDiscordOAuth() {
    showConfirmModal('Disconnect Discord? You will stop receiving notifications.', async () => {
        await authFetch('/api/discord/disconnect', { method: 'POST' });
        showToast('Discord disconnected', 'success');
        loadDiscordStatus();
    }, 'Disconnect Discord', 'Disconnect');
}

async function loadTelegramStatus() {
    const res = await authFetch('/api/user/telegram-status');
    const data = await res.json();
    const disconnectedDiv = document.getElementById('telegramDisconnected');
    const connectedDiv = document.getElementById('telegramConnected');
    const statusText = document.getElementById('telegramStatusText');

    if (data.connected) {
        disconnectedDiv.classList.add('hidden');
        connectedDiv.classList.remove('hidden');
        if (statusText) {
            statusText.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full status-dot-connected"></span>Connected</span>`;
            statusText.className = 'text-xs text-green-400 mt-0.5 font-medium';
        }
        document.querySelectorAll('.telegram-pref-checkbox').forEach(cb => {
            const type = cb.getAttribute('data-notif-type');
            cb.checked = data.prefs[type] !== false;
        });
    } else {
        disconnectedDiv.classList.remove('hidden');
        connectedDiv.classList.add('hidden');
        if (statusText) {
            statusText.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full status-dot-disconnected"></span>Not connected</span>`;
            statusText.className = 'text-xs text-slate-400 mt-0.5';
        }
    }
}

async function connectTelegram() {
    if (getUserPlan() === 'free') {
        showUpgradeModal('telegram');
        return;
    }

    const res = await authFetch('/api/user/telegram-link');
    const data = await res.json();
    window.open(data.link, '_blank');
    showToast('Opening Telegram... Send /start to the bot.', 'info');
    // Re-check connection after a delay
    setTimeout(loadTelegramStatus, 5000);
}

async function disconnectTelegram() {
    showConfirmModal('Disconnect Telegram? You will stop receiving notifications.', async () => {
        await authFetch('/api/user/telegram-disconnect', { method: 'POST' });
        showToast('Telegram disconnected', 'success');
        loadTelegramStatus();
    }, 'Disconnect Telegram', 'Disconnect');
}

async function saveTelegramPrefs() {
    const prefs = {};
    document.querySelectorAll('.telegram-pref-checkbox').forEach(cb => {
        prefs[cb.getAttribute('data-notif-type')] = cb.checked;
    });
    await authFetch('/api/user/telegram-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs })
    });
    showToast('Notification preferences saved', 'success');
}

// Gmail connection ------------------------------------------------------------
function connectGmail() {
    if (getUserPlan() === 'free') {
        showUpgradeModal('gmail');
        return;
    }
    authFetch('/api/gmail/auth-url')
        .then(r => r.json())
        .then(data => { window.location.href = data.url; });
}

async function disconnectGmail() {
    showConfirmModal('Disconnect Gmail? You will stop sending campaigns.', async () => {
        const res = await authFetch('/api/gmail/disconnect', { method: 'POST' });
        if (res.ok) {
            showToast('Gmail disconnected', 'success');
            if (typeof loadGmailStatus === 'function') await loadGmailStatus();
            const campaignsPage = document.getElementById('campaignsPage');
            if (campaignsPage && !campaignsPage.classList.contains('hidden')) {
                loadCampaigns();
            }
        } else {
            showToast('Failed to disconnect', 'error');
        }
    }, 'Disconnect Gmail', 'Disconnect');
}

async function loadGmailStatus() {
    try {
        const res = await authFetch('/api/gmail/status');
        const data = await res.json();
        const connected = data.connected;

        document.getElementById('gmailSettingsDisconnected').classList.toggle('hidden', connected);
        document.getElementById('gmailSettingsConnected').classList.toggle('hidden', !connected);

        const statusText = document.getElementById('gmailSettingsStatus');
        if (connected) {
            statusText.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full status-dot-connected"></span>Connected as ${data.email || 'user@example.com'}</span>`;
            statusText.className = 'text-xs text-green-400 mt-0.5 font-medium';
        } else {
            statusText.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full status-dot-disconnected"></span>Not connected</span>`;
            statusText.className = 'text-xs text-slate-400 mt-0.5';
        }
    } catch (e) {
        console.error('Failed to load Gmail status in settings', e);
    }
}

// Check Gmail status and load campaigns
async function loadCampaigns() {
    const gmailStatusCard = document.getElementById('gmailStatusCard');
    const gmailStatusIcon = document.getElementById('gmailStatusIcon');
    const gmailStatusTitle = document.getElementById('gmailStatusTitle');
    const gmailStatusEmail = document.getElementById('gmailStatusEmail');
    const gmailDisconnectBtn = document.getElementById('gmailDisconnectBtn');
    const gmailConnectBtn = document.getElementById('gmailConnectBtn');
    const campaignsList = document.getElementById('campaignsList');
    const campaignsEmpty = document.getElementById('campaignsEmpty');

    // 1. Check Gmail connection
    try {
        const statusRes = await authFetch('/api/gmail/status');
        if (!statusRes.ok) throw new Error(`Server returned ${statusRes.status}`);
        const { connected, email } = await statusRes.json();

        gmailStatusCard.classList.remove('hidden');

        if (connected) {
            gmailStatusIcon.className = 'w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center';
            gmailStatusIcon.innerHTML = `<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`;
            gmailStatusTitle.textContent = 'Gmail connected';
            gmailStatusTitle.className = 'font-semibold text-white text-sm';
            gmailStatusEmail.textContent = email || 'user@example.com';
            gmailDisconnectBtn.classList.remove('hidden');
            gmailConnectBtn.classList.add('hidden');
        } else {
            gmailStatusIcon.className = 'w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center';
            gmailStatusIcon.innerHTML = `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`;
            gmailStatusTitle.textContent = 'Gmail disconnected';
            gmailStatusTitle.className = 'font-semibold text-slate-400 text-sm';
            gmailStatusEmail.textContent = '';
            gmailDisconnectBtn.classList.add('hidden');
            gmailConnectBtn.classList.remove('hidden');
        }
    } catch (err) {
        gmailStatusCard.classList.add('hidden');
    }

    // 2. Update header indicator
    updateGmailStatusIndicator();

    // 3. Fetch and render campaigns
    if (!gmailStatusCard.classList.contains('hidden') && gmailStatusTitle.textContent === 'Gmail connected') {
        try {
            const resp = await authFetch('/api/campaigns');
            if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
            const { campaigns } = await resp.json();
            renderCampaignsList(campaigns);
        } catch (err) {
            campaignsList.innerHTML = '';
            campaignsEmpty.classList.remove('hidden');
            campaignsEmpty.textContent = 'Failed to load campaigns.';
        }
    } else {
        campaignsList.innerHTML = '';
        campaignsEmpty.classList.add('hidden');
    }
}

async function updateGmailStatusIndicator() {
    const indicator = document.getElementById('gmailStatusIndicator');
    const dot = document.getElementById('gmailStatusDot');
    const text = document.getElementById('gmailStatusText');
    if (!indicator || !dot || !text) return;

    try {
        const res = await authFetch('/api/gmail/status');
        const data = await res.json();
        const connected = data.connected;

        indicator.classList.remove('hidden');

        if (connected) {
            dot.className = 'w-2 h-2 rounded-full status-dot-connected';
            text.textContent = 'Gmail connected';
            text.className = 'text-xs font-medium text-green-400';
        } else {
            dot.className = 'w-2 h-2 rounded-full status-dot-disconnected';
            text.textContent = 'Gmail disconnected';
            text.className = 'text-xs font-medium text-slate-400';
        }
    } catch (e) {
        indicator.classList.add('hidden');
    }
}

// Watch for the gmail_connected query parameter on page load
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected') === '1') {
        showToast('Gmail connected successfully!', 'success');
        // Remove parameter from URL without reloading
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        // If campaigns page is currently visible, reload it
        const campaignsPage = document.getElementById('campaignsPage');
        if (campaignsPage && !campaignsPage.classList.contains('hidden')) {
            loadCampaigns();
        }
    }
});

function renderCampaignsList(campaigns) {
    const container = document.getElementById('campaignsList');
    const empty = document.getElementById('campaignsEmpty');
    if (campaigns.length === 0) {
        empty.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }
    empty.classList.add('hidden');

    container.innerHTML = campaigns.map(c => {
        const progress = c.totalSends > 0
            ? Math.round((c.sentCount / c.totalSends) * 100)
            : 0;
        const isComplete = progress === 100 && c.totalSends > 0;
        const statusClass = c.status === 'active' ? 'bg-green-500/15 text-green-400' :
            c.status === 'draft' ? 'bg-slate-500/15 text-slate-400' :
                c.anyReplied ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-500/15 text-slate-400';
        const statusDot = c.status === 'active' ? 'bg-green-400' :
            c.status === 'draft' ? 'bg-slate-400' :
                c.anyReplied ? 'bg-blue-400' : 'bg-slate-400';
        const statusLabel = c.status === 'active' ? 'Active' :
            c.status === 'draft' ? 'Draft' :
                c.anyReplied ? 'Replied' : c.status;

        return `
        <div class="glass-card rounded-2xl p-5 flex flex-col gap-4 relative group hover:border-indigo-500/30 transition-all">
            <!-- Top row: status badge + delete button -->
            <div class="flex justify-between items-start">
                <div>
                    <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusClass} text-[10px] font-semibold mb-2">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
                        ${statusLabel}
                    </div>
                    <h3 class="font-semibold text-white text-sm">${escapeHTML(c.name)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                        </svg>
                        ${c.type} · ${c.tone}
                    </p>
                </div>
                <button onclick="event.stopPropagation(); deleteCampaign('${c.id}')" 
                    class="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition-all opacity-0 group-hover:opacity-100" 
                    title="Delete Campaign">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>

            <!-- Progress section -->
            <div class="space-y-1.5">
                <div class="flex justify-between text-xs">
                    <span class="text-slate-300 font-medium">${c.sentCount}/${c.totalSends} emails sent</span>
                    <span class="text-slate-500">${progress}%</span>
                </div>
                <div class="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div class="h-full gradient-primary rounded-full transition-all duration-500 ${isComplete ? 'opacity-50' : ''}" style="width: ${progress}%"></div>
                </div>
            </div>

            <!-- Divider -->
            <div class="border-t border-white/5"></div>

            <!-- Bottom row: stats + optional launch button -->
            <div class="flex items-center justify-between">
                <div class="flex gap-4 text-xs text-slate-500">
                    <span class="flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                        ${c.leads?.count || 0} leads
                    </span>
                    <span class="flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                        </svg>
                        ${c.steps?.count || 0} steps
                    </span>
                </div>
                ${c.status === 'draft'
                ? `<button onclick="event.stopPropagation(); launchCampaign('${c.id}')" class="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold transition-all">Launch</button>`
                : ''}
            </div>
        </div>`;
    }).join('');
}

async function launchCampaign(id) {
    await authFetch(`/api/campaigns/${id}/launch`, { method: 'POST' });
    showToast('Campaign launched! Emails will be sent automatically.', 'success');
    loadCampaigns();
}

async function deleteCampaign(id) {
    showConfirmModal('Delete this campaign? This cannot be undone.', async () => {
        try {
            const res = await authFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            showToast('Campaign deleted', 'success');
            loadCampaigns();
        } catch (err) {
            showToast('Failed to delete campaign', 'error');
        }
    }, 'Delete Campaign', 'Delete');
}

// Populate client checkboxes when opening the campaign modal
async function openCreateCampaignModal() {
    if (getUserPlan() === 'free') {
        showUpgradeModal('campaigns');
        return;
    }

    // Check Gmail connection first
    try {
        const res = await authFetch('/api/gmail/status');
        if (!res.ok) throw new Error('Failed to check Gmail status');
        const data = await res.json();
        if (!data.connected) {
            showToast('Please connect your Gmail account to use AutoDraft', 'error');
            const gmailCard = document.getElementById('gmailStatusCard');
            if (gmailCard) {
                gmailCard.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-background');
                setTimeout(() => {
                    gmailCard.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-background');
                }, 3000);
            }
            return;
        }
    } catch (e) {
        showToast('Unable to verify Gmail connection', 'error');
        return;
    }

    // Existing modal population code
    const container = document.getElementById('campaignClientList');
    container.innerHTML = clients.map(c => `
    <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
      <input type="checkbox" class="campaign-client-checkbox rounded bg-slate-700 border-white/10 text-indigo-500 focus:ring-0" value="${c.id}">
      ${c.name} (${c.business || 'N/A'})
    </label>
  `).join('');

    // Reset steps to default three empty ones
    document.getElementById('campaignSteps').innerHTML = `
    <div class="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
      <span class="text-xs font-bold text-indigo-400">1</span>
      <div class="flex-1 space-y-2">
        <input type="text" placeholder="Subject" class="campaign-step-subject w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs">
        <textarea placeholder="Body" rows="2" class="campaign-step-body w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs resize-none"></textarea>
      </div>
      <span class="text-xs text-slate-500">Day <input type="number" value="1" min="1" max="30" class="campaign-step-day w-14 px-1 py-1 rounded bg-slate-700/50 border border-white/10 text-white text-xs text-center"></span>
    </div>
    <div class="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
      <span class="text-xs font-bold text-indigo-400">2</span>
      <div class="flex-1 space-y-2">
        <input type="text" placeholder="Subject" class="campaign-step-subject w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs">
        <textarea placeholder="Body" rows="2" class="campaign-step-body w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs resize-none"></textarea>
      </div>
      <span class="text-xs text-slate-500">Day <input type="number" value="3" min="1" max="30" class="campaign-step-day w-14 px-1 py-1 rounded bg-slate-700/50 border border-white/10 text-white text-xs text-center"></span>
    </div>
    <div class="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
      <span class="text-xs font-bold text-indigo-400">3</span>
      <div class="flex-1 space-y-2">
        <input type="text" placeholder="Subject" class="campaign-step-subject w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs">
        <textarea placeholder="Body" rows="2" class="campaign-step-body w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs resize-none"></textarea>
      </div>
      <span class="text-xs text-slate-500">Day <input type="number" value="7" min="1" max="30" class="campaign-step-day w-14 px-1 py-1 rounded bg-slate-700/50 border border-white/10 text-white text-xs text-center"></span>
    </div>
  `;

    document.getElementById('createCampaignModal').classList.remove('hidden');
}

// Generate AI steps via API
async function generateCampaignSteps() {
    const type = document.getElementById('campaignType').value;
    const tone = document.getElementById('campaignTone').value;
    const btn = event.target;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
        const res = await authFetch('/api/campaigns/generate-steps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, tone, numSteps: 3 })
        });
        const data = await res.json();

        if (data.steps && data.steps.length) {
            const stepsContainer = document.getElementById('campaignSteps');
            stepsContainer.innerHTML = data.steps.map((step, i) => `
        <div class="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
          <span class="text-xs font-bold text-indigo-400">${i + 1}</span>
          <div class="flex-1 space-y-2">
            <input type="text" value="${step.subject}" class="campaign-step-subject w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs">
            <textarea rows="2" class="campaign-step-body w-full px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-white text-xs resize-none">${step.body}</textarea>
          </div>
          <span class="text-xs text-slate-500">Day <input type="number" value="${step.dayDelay}" min="1" max="30" class="campaign-step-day w-14 px-1 py-1 rounded bg-slate-700/50 border border-white/10 text-white text-xs text-center"></span>
        </div>
      `).join('');
            showToast('AI steps generated! Edit if needed.', 'success');
        }
    } catch (e) {
        showToast('Failed to generate steps', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// Handle campaign form submission
document.getElementById('createCampaignForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const name = document.getElementById('campaignName').value;
    const type = document.getElementById('campaignType').value;
    const tone = document.getElementById('campaignTone').value;
    const clientIds = Array.from(document.querySelectorAll('.campaign-client-checkbox:checked')).map(cb => cb.value);
    if (!name || clientIds.length === 0) return showToast('Name and at least one client required', 'error');

    const steps = [];
    document.querySelectorAll('#campaignSteps > div').forEach(stepDiv => {
        const subject = stepDiv.querySelector('.campaign-step-subject')?.value;
        const body = stepDiv.querySelector('.campaign-step-body')?.value;
        const dayDelay = parseInt(stepDiv.querySelector('.campaign-step-day')?.value) || 1;
        if (subject && body) steps.push({ dayDelay, subject, body });
    });
    if (steps.length === 0) return showToast('At least one step required', 'error');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
        await authFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, tone, clientIds, steps })
        });
        showToast('Campaign created!', 'success');
        closeCreateCampaignModal();
        loadCampaigns();
    } catch (err) {
        showToast('Failed to create campaign', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
    }
});

function closeCreateCampaignModal() {
    document.getElementById('createCampaignModal').classList.add('hidden');
    // Refresh campaigns list after modal closes
    loadCampaigns();
}

// Detect Gmail connection redirect & monitor campaigns page visibility
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected') === '1') {
        showToast('Gmail connected successfully!', 'success');
        // Remove parameter without reloading
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        // If campaigns page is currently visible, reload it
        const campaignsPage = document.getElementById('campaignsPage');
        if (campaignsPage && !campaignsPage.classList.contains('hidden')) {
            loadCampaigns();
        }
    }
    // Auto-open Discord invite after connection
    if (params.get('discord_connected') === '1') {
        showToast('Discord connected! Join the server to start receiving notifications.', 'success');
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        window.open('https://discord.gg/JbBeQW8MP5', '_blank');
    }

    // MutationObserver: when campaigns page becomes visible, re-check Gmail status
    const observer = new MutationObserver(() => {
        const campaignsPage = document.getElementById('campaignsPage');
        if (campaignsPage && !campaignsPage.classList.contains('hidden')) {
            authFetch('/api/gmail/status')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('gmailNotConnected').classList.toggle('hidden', data.connected);
                })
                .catch(() => { });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

async function openSingleSequenceModal() {

    if (getUserPlan() === 'free') {
        showUpgradeModal('campaigns');
        return;
    }

    // Check if Gmail is connected before allowing single sequence
    try {
        const res = await authFetch('/api/gmail/status');
        if (!res.ok) throw new Error('Failed to check Gmail status');
        const data = await res.json();
        if (!data.connected) {
            showToast('Please connect your Gmail account to use AutoDraft', 'error');
            // Optionally highlight the Gmail connection card
            const gmailCard = document.getElementById('gmailStatusCard');
            if (gmailCard) {
                gmailCard.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-background');
                setTimeout(() => {
                    gmailCard.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-background');
                }, 3000);
            }
            return; // stop here – do not open modal
        }
    } catch (e) {
        showToast('Unable to verify Gmail connection', 'error');
        return;
    }

    // If connected, proceed with original modal logic
    const select = document.getElementById('singleSeqClient');
    select.innerHTML = '<option value="">-- Select a client --</option>' +
        clients.map(c => `<option value="${c.id}">${c.name} (${c.business || 'N/A'})</option>`).join('');
    document.getElementById('singleSequenceForm').reset();
    document.getElementById('singleSequenceModal').classList.remove('hidden');
}

function closeSingleSequenceModal() {
    document.getElementById('singleSequenceModal').classList.add('hidden');
}

document.getElementById('singleSequenceForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const clientId = document.getElementById('singleSeqClient').value;
    const name = document.getElementById('singleSeqName').value;
    const type = document.getElementById('singleSeqType').value;
    const tone = document.getElementById('singleSeqTone').value;

    if (!clientId || !name) {
        return showToast('Client and name are required', 'error');
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
        // AI‑generated steps with default timings (day 1, 3, 7)
        const steps = [];
        const defaultDelays = [1, 3, 7];
        for (let i = 0; i < 3; i++) {
            const res = await authFetch('/api/campaigns/generate-steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, tone, numSteps: 1 })
            });
            const data = await res.json();
            if (data.steps && data.steps.length) {
                steps.push({
                    dayDelay: defaultDelays[i],
                    subject: data.steps[0].subject,
                    body: data.steps[0].body
                });
            }
        }

        // Create campaign (single lead)
        const res = await authFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                type,
                tone,
                clientIds: [clientId],
                steps
            })
        });

        if (!res.ok) throw new Error('Failed to create campaign');

        const campaign = await res.json();
        // Auto‑launch
        await authFetch(`/api/campaigns/${campaign.campaign.id}/launch`, { method: 'POST' });

        showToast('Single sequence started! Emails will be sent automatically.', 'success');
        closeSingleSequenceModal();
        loadCampaigns();
    } catch (err) {
        showToast(err.message || 'Failed to create sequence', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
    }
});