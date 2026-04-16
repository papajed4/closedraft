// popup.js - Extension popup logic

let supabaseClient = null;
let currentUser = null;
let userPlan = 'free';
let currentRecipient = null;
let currentClient = null;
let selectedTone = 'Friendly';
let generatedSubject = '';
let generatedBody = '';

// const API_URL = 'http://localhost:3000'; // For local testing
const API_URL = 'https://closedraft.onrender.com'; // For production

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
    await checkAuth();
    setupEventListeners();
    getCurrentTabRecipient();
});

// Initialize Supabase
async function initSupabase() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getSupabaseConfig' }, (config) => {
            if (config && window.supabase) {
                supabaseClient = window.supabase.createClient(config.url, config.anonKey);
                console.log('✅ Supabase initialized');
                resolve();
            } else {
                console.error('❌ Failed to initialize Supabase');
                resolve();
            }
        });
    });
}

// Check authentication
async function checkAuth() {
    if (!supabaseClient) {
        showState('loggedOut');
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        showState('loggedOut');
        return;
    }

    currentUser = session.user;

    // Get actual plan from database
const { data: userData } = await supabaseClient
    .from('profiles')
    .select('plan')
    .eq('id', currentUser.id)
    .single();

    userPlan = userData?.plan || 'free';
    
    const planStatus = document.getElementById('planStatus');
    if (planStatus) {
        planStatus.textContent = userPlan === 'pro' ? 'Pro' : 'Free';
        planStatus.className = `status ${userPlan}`;
    }

    showState(userPlan);
}



// Show appropriate state
function showState(state) {
    const loggedOutState = document.getElementById('loggedOutState');
    const freePlanState = document.getElementById('freePlanState');
    const proPlanState = document.getElementById('proPlanState');
    
    if (loggedOutState) loggedOutState.classList.add('hidden');
    if (freePlanState) freePlanState.classList.add('hidden');
    if (proPlanState) proPlanState.classList.add('hidden');

    if (state === 'loggedOut') {
        if (loggedOutState) loggedOutState.classList.remove('hidden');
    } else if (state === 'free') {
        if (freePlanState) freePlanState.classList.remove('hidden');
    } else if (state === 'pro') {
        if (proPlanState) proPlanState.classList.remove('hidden');
    }
}

// Get recipient from current Gmail tab
async function getCurrentTabRecipient() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getRecipient' }, (response) => {
            if (response?.email) {
                currentRecipient = response.email;
                const emailEl = document.getElementById('clientEmail');
                if (emailEl) emailEl.textContent = currentRecipient;
                findClientByEmail(currentRecipient);
            } else {
                const nameEl = document.getElementById('clientName');
                const emailEl = document.getElementById('clientEmail');
                if (nameEl) nameEl.textContent = 'New Recipient';
                if (emailEl) emailEl.textContent = 'No client match found';
            }
        });
    }
}

// Find client in Supabase
async function findClientByEmail(email) {
    if (!supabaseClient || !currentUser) return;

    const { data: clients } = await supabaseClient
        .from('clients')
        .select('*')
        .eq('user_id', currentUser.id)
        .ilike('email', `%${email}%`)
        .limit(1);

    const nameEl = document.getElementById('clientName');
    if (clients && clients.length > 0) {
        currentClient = clients[0];
        if (nameEl) nameEl.textContent = currentClient.name;
    } else {
        if (nameEl) nameEl.textContent = email.split('@')[0];
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tone buttons
    document.querySelectorAll('.tone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTone = btn.dataset.tone;
        });
    });

    // Generate button
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) generateBtn.addEventListener('click', generateEmail);

    // Sign in button
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: `${API_URL}/login.html` });
        });
    }

    // Upgrade button
    const upgradeBtn = document.getElementById('upgradeBtn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: `${API_URL}/pricing.html` });
        });
    }

    // Copy button
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(`Subject: ${generatedSubject}\n\n${generatedBody}`);
            showToast('Copied!');
        });
    }

    // Insert button
    const insertBtn = document.getElementById('insertBtn');
    if (insertBtn) {
        insertBtn.addEventListener('click', async () => {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'insertDraft',
                    subject: generatedSubject,
                    body: generatedBody
                });
                showToast('Inserted into Gmail!');
                window.close();
            }
        });
    }
}

// Generate email
async function generateEmail() {
    const typeEl = document.getElementById('emailType');
    const type = typeEl ? typeEl.value : 'Follow-up';
    
    const btn = document.getElementById('generateBtn');
    const btnText = document.getElementById('generateBtnText');
    const loader = document.getElementById('generateLoader');

    if (btn) btn.disabled = true;
    if (btnText) btnText.classList.add('hidden');
    if (loader) loader.classList.remove('hidden');

    try {
        // Get auth token
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        
        if (!token) {
            showToast('Please sign in again');
            showState('loggedOut');
            return;
        }

        const response = await fetch(`${API_URL}/api/generate-email`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                clientId: currentClient?.id || null,
                recipient: currentRecipient,
                type,
                tone: selectedTone,
                freelancerName: currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Freelancer'
            })
        });

        const data = await response.json();

        if (response.ok) {
            generatedSubject = data.subject;
            generatedBody = data.body;

            const subjectEl = document.getElementById('resultSubject');
            const bodyEl = document.getElementById('resultBody');
            const resultSection = document.getElementById('resultSection');
            
            if (subjectEl) subjectEl.textContent = generatedSubject;
            if (bodyEl) bodyEl.textContent = generatedBody;
            if (resultSection) resultSection.classList.remove('hidden');
        } else {
            showToast(data.error || 'Failed to generate');
        }
    } catch (error) {
        showToast('Network error - is your server running?');
        console.error('Generate error:', error);
    } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.classList.remove('hidden');
        if (loader) loader.classList.add('hidden');
    }
}

// Show toast
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #1e293b;
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        z-index: 9999;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}