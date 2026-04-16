// ui.js - UI utilities

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    const iconEl = document.getElementById('toastIcon');
    
    if (!toast || !msgEl || !iconEl) return;
    
    msgEl.textContent = message;
    toast.classList.remove('success', 'error');
    
    // Reset any inline styles
    toast.style.background = '';
    
    if (type === 'success') {
        toast.classList.add('success');
        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
    } else if (type === 'error') {
        toast.classList.add('error');
        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
    } else {
        // Info type - dark background
        toast.style.background = '#1e293b';
        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    }
    
    toast.classList.add('show');
    
    // Longer timeout for info messages
    const timeout = type === 'info' ? 6000 : 4000;
    setTimeout(() => toast.classList.remove('show'), timeout);
}

function openAddModal() {
    document.getElementById('addModal').classList.remove('hidden');
}

function closeAddModal() {
    document.getElementById('addModal').classList.add('hidden');
    document.getElementById('addClientForm').reset();
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    
    // Parse the input date
    const inputDate = new Date(dateString);
    const now = new Date();
    
    // Reset hours to compare dates only (ignore time)
    const inputDateOnly = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Calculate difference in days
    const diffTime = nowOnly.getTime() - inputDateOnly.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    // Format as "Apr 13" for older dates
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[inputDate.getMonth()]} ${inputDate.getDate()}`;
}

function getStatusBadge(status) {
    const badges = {
        active: '<span class="status-badge status-active">Active</span>',
        waiting: '<span class="status-badge status-waiting">Waiting</span>',
        payment_due: '<span class="status-badge status-payment">Payment Due</span>'
    };
    return badges[status] || badges.active;
}

function openDetailPanel(clientId) {
    // Will be called from app.js
    window.selectedClientId = clientId;
    document.getElementById('clientDetailPanel').classList.add('translate-x-0');
    document.getElementById('clientDetailPanel').classList.remove('translate-x-full');
}

function closeDetailPanel() {
    document.getElementById('clientDetailPanel').classList.add('translate-x-full');
    document.getElementById('clientDetailPanel').classList.remove('translate-x-0');
    window.selectedClientId = null;
}

function openEditModal() {
    closeDetailPanel();
    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editClientForm').reset();
}

function openDeleteModal() {
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}