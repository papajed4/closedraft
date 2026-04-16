// clients.js - Supabase client operations

// Helper to get auth token
async function getAuthToken() {
    const { data: { session } } = await window.supabase.auth.getSession();
    return session?.access_token || null;
}

// Helper for authenticated fetch
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

async function fetchClients(showArchived = false) {
    try {
        const cacheBuster = Date.now() + '-' + Math.random().toString(36);
        const url = `/api/clients?cb=${cacheBuster}&showArchived=${showArchived}`;

        const response = await authFetch(url, {
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (!response.ok) {
            console.error('❌ Failed to fetch clients:', response.status);
            return [];
        }

        const data = await response.json();
        console.log('📥 Fetched clients:', data.clients?.length || 0);
        return data.clients || [];
    } catch (error) {
        console.error('Failed to fetch clients:', error);
        return [];
    }
}

async function addClient(clientData) {
    const response = await authFetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add client');
    }

    return await response.json();
}

async function updateClientStatus(clientId, status) {
    const response = await authFetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });

    if (!response.ok) throw new Error('Failed to update client');
    return await response.json();
}

async function deleteClient(clientId) {
    const response = await authFetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete client');
    return true;
}

async function updateClient(clientId, updates) {
    const response = await authFetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update client');
    }

    return await response.json();
}

async function archiveClient(clientId) {
    const response = await authFetch(`/api/clients/${clientId}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to archive client');
    }

    return await response.json();
}