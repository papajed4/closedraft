// clients.js - Supabase client operations

async function fetchClients(showArchived = false) {
    try {
        const cacheBuster = Date.now() + '-' + Math.random().toString(36);
        const url = `/api/clients?cb=${cacheBuster}&showArchived=${showArchived}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        const data = await response.json();
        console.log('📥 Fetched clients:', data.clients?.length || 0);
        return data.clients || [];
    } catch (error) {
        console.error('Failed to fetch clients:', error);
        return [];
    }
}

async function addClient(clientData) {
    try {
        const response = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add client');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Failed to add client:', error);
        throw error;
    }
}

async function updateClientStatus(clientId, status) {
    try {
        const response = await fetch(`/api/clients/${clientId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        if (!response.ok) throw new Error('Failed to update client');
        return await response.json();
    } catch (error) {
        console.error('Failed to update client:', error);
        throw error;
    }
}

async function deleteClient(clientId) {
    try {
        const response = await fetch(`/api/clients/${clientId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete client');
        return true;
    } catch (error) {
        console.error('Failed to delete client:', error);
        throw error;
    }
}

async function updateClient(clientId, updates) {
    try {
        const response = await fetch(`/api/clients/${clientId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update client');
        }
        
        const data = await response.json();
        return data; // Make sure this returns the updated client
    } catch (error) {
        console.error('Failed to update client:', error);
        throw error;
    }
}

async function archiveClient(clientId) {
    try {
        const response = await fetch(`/api/clients/${clientId}/archive`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: true })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to archive client');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Failed to archive client:', error);
        throw error;
    }
}
