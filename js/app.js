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
let currentPage = 'clients';
let currentEmailFilter = 'all';
let allEmails = [];
let currentDetailEmail = null;
let csvData = [];
let csvHeaders = [];
let showArchived = false;

// ==================== USER SETTINGS ====================
const userSettings = {
    name: 'Jedidiah',  // ← CHANGE TO YOUR REAL NAME
    email: 'your-email@gmail.com'
};

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
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadClients();
    document.getElementById('addClientForm').addEventListener('submit', handleAddClient);
    document.getElementById('editClientForm').addEventListener('submit', handleEditClient);

    // Set up email search
    const emailSearch = document.getElementById('emailSearch');
    if (emailSearch) {
        emailSearch.addEventListener('input', handleEmailSearch);
    }

    // Set up client search  ← ADD THIS
    const clientSearch = document.getElementById('clientSearch');
    if (clientSearch) {
        clientSearch.addEventListener('input', handleClientSearch);
    }
});

// ============================================
// PAGE NAVIGATION (Sidebar)
// ============================================

function switchPage(page) {
    currentPage = page;

    const clientsPage = document.getElementById('clientsPage');
    const emailsPage = document.getElementById('emailsPage');
    const settingsPage = document.getElementById('settingsPage');

    if (clientsPage) clientsPage.classList.add('hidden');
    if (emailsPage) emailsPage.classList.add('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');

    const clientsNav = document.getElementById('clientsNav');
    const emailsNav = document.getElementById('emailsNav');
    const settingsNav = document.getElementById('settingsNav');

    if (clientsNav) {
        clientsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        clientsNav.classList.add('text-slate-400');
    }
    if (emailsNav) {
        emailsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        emailsNav.classList.add('text-slate-400');
    }
    if (settingsNav) {
        settingsNav.classList.remove('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
        settingsNav.classList.add('text-slate-400');
    }

    if (page === 'clients') {
        if (clientsPage) clientsPage.classList.remove('hidden');
        if (clientsNav) {
            clientsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            clientsNav.classList.remove('text-slate-400');
        }
        loadClients();
    } else if (page === 'emails') {
        if (emailsPage) emailsPage.classList.remove('hidden');
        if (emailsNav) {
            emailsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            emailsNav.classList.remove('text-slate-400');
        }
        loadEmailHistory();
    } else if (page === 'settings') {
        if (settingsPage) settingsPage.classList.remove('hidden');
        if (settingsNav) {
            settingsNav.classList.add('text-white', 'border-l-2', 'border-indigo-500', 'bg-indigo-500/10');
            settingsNav.classList.remove('text-slate-400');
        }
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
        // Check if there's an active search or filter
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

    emptyState.classList.add('hidden');

    let html = '';
    filteredClients.forEach(client => {
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
        <span class="text-amber-400" title="Needs follow-up (${getDaysStale(client.last_contacted)} days)">
            <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
        </span>
    ` : ''}
    ${client.archived ? `
        <span class="status-badge bg-slate-700/50 text-slate-400 border border-white/10">Archived</span>
    ` : ''}
</h3>
                        <p class="text-sm text-slate-400">${client.business || 'No business'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-6">
                    ${client.project ? `
                        <div class="text-right hidden md:block">
                            <p class="text-xs text-slate-500 uppercase tracking-wider">Project</p>
                            <p class="text-sm text-white">${client.project}</p>
                        </div>
                    ` : ''}
                    ${client.amount ? `
                        <div class="text-right hidden lg:block">
                            <p class="text-xs text-slate-500 uppercase tracking-wider">Value</p>
                            <p class="text-sm text-white font-medium">$${client.amount.toLocaleString()}</p>
                        </div>
                    ` : ''}
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
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    const clientData = {
        name: document.getElementById('clientName').value,
        business: document.getElementById('clientBusiness').value || null,
        email: document.getElementById('clientEmail').value || null,
        project: document.getElementById('clientProject').value || null,
        amount: document.getElementById('clientAmount').value ? parseFloat(document.getElementById('clientAmount').value) : null,
        status: document.getElementById('clientStatus').value
    };

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
// CLIENT DETAIL PANEL
// ============================================

function selectClient(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    selectedClientId = clientId;

    document.getElementById('detailAvatar').textContent = client.name.charAt(0);
    document.getElementById('detailName').textContent = client.name;
    document.getElementById('detailBusiness').textContent = client.business || 'No business';
    document.getElementById('detailEmail').textContent = client.email || 'No email';
    document.getElementById('detailProject').textContent = client.project || 'No project';
    document.getElementById('detailAmount').textContent = client.amount ? `$${client.amount.toLocaleString()}` : '-';
    document.getElementById('detailStatus').innerHTML = getStatusBadge(client.status);
    document.getElementById('detailLastContact').textContent = formatDate(client.last_contacted);
    document.getElementById('detailCreated').textContent = formatDate(client.created_at);
    document.getElementById('detailNotes').value = client.notes || '';

    document.getElementById('editClientId').value = client.id;
    document.getElementById('editClientName').value = client.name;
    document.getElementById('editClientBusiness').value = client.business || '';
    document.getElementById('editClientEmail').value = client.email || '';
    document.getElementById('editClientProject').value = client.project || '';
    document.getElementById('editClientAmount').value = client.amount || '';
    document.getElementById('editClientStatus').value = client.status;


    updateDetailPanelActions(client);

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

        showToast('✓ Marked as contacted', 'success');
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
    const type = document.getElementById('emailType').value;
    const tone = document.getElementById('emailTone').value;
    const btn = document.getElementById('generateEmailBtn');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span><span>Generating...</span>';

    try {
        const response = await fetch('/api/generate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: currentEmailClient.id,
                type,
                tone,
                freelancerName: userSettings.name
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate');

        generatedSubject = data.subject || 'No subject';
        generatedBody = data.body || data.fullText;

        document.getElementById('generatedSubject').textContent = generatedSubject;
        document.getElementById('generatedBody').textContent = generatedBody;
        document.getElementById('emailConfig').classList.add('hidden');
        document.getElementById('emailResult').classList.remove('hidden');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function copySubject() {
    navigator.clipboard.writeText(generatedSubject);
    showToast('Subject copied!', 'success');
}

function copyBody() {
    navigator.clipboard.writeText(generatedBody);
    showToast('Body copied!', 'success');
}

function copyFullEmail() {
    const fullEmail = `Subject: ${generatedSubject}\n\n${generatedBody}`;
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
    const subject = encodeURIComponent(generatedSubject);
    const body = encodeURIComponent(generatedBody);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`;
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

    const btn = document.getElementById('importBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing...';

    let successCount = 0;
    let failCount = 0;

    for (const row of csvData) {
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

    showToast(`Imported ${successCount} clients (${failCount} failed)`, 'success');
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
    const headers = ['Name', 'Business', 'Email', 'Project', 'Amount', 'Status', 'Last Contacted', 'Notes', 'Archived'];

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
        const response = await fetch(`/api/clients/${clientId}/restore`, {
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

        const response = await fetch('/api/emails');
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
    
    // Update active tab styling
    ['All', 'Followup', 'Payment', 'Cold'].forEach(tab => {
        const btn = document.getElementById(`emailTab${tab}`);
        if (!btn) return;

        const isActive = (tab === filter) ||
            (tab === 'All' && filter === 'all') ||
            (tab === 'Followup' && filter === 'Follow-up') ||
            (tab === 'Payment' && filter === 'Payment Reminder') ||
            (tab === 'Cold' && filter === 'Cold Outreach');

        if (isActive) {
            btn.classList.add('text-indigo-300', 'border-b-2', 'border-indigo-500');
            btn.classList.remove('text-slate-400');
        } else {
            btn.classList.remove('text-indigo-300', 'border-b-2', 'border-indigo-500');
            btn.classList.add('text-slate-400');
        }
    });
    
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
    
    // Hide both states initially
    if (emptyState) emptyState.classList.add('hidden');
    if (noResults) noResults.classList.add('hidden');
    
    if (filteredEmails.length === 0) {
        // Check if there are any emails at all
        if (allEmails.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
        } else {
            if (noResults) noResults.classList.remove('hidden');
        }
        return;
    }


    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = filteredEmails.map(email => `
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

