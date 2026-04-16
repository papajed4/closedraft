// background.js - Service worker

const SUPABASE_URL = 'https://txibbsaodcpaturobeok.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4aWJic2FvZGNwYXR1cm9iZW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODkyODQsImV4cCI6MjA5MTI2NTI4NH0.1omA2j3QaFzr83KxqpQOSrRngu6mGkJB2d_PYDGNR24';

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getSupabaseConfig') {
        sendResponse({
            url: SUPABASE_URL,
            anonKey: SUPABASE_ANON_KEY
        });
    }

    if (message.action === 'openLogin') {
        chrome.tabs.create({ url: 'https://closedraft.onrender.com/login.html' });
    }

    if (message.action === 'openPricing') {
        chrome.tabs.create({ url: 'https://closedraft.onrender.com/pricing.html' });
    }

    return true;
});

// Set up auth state listener
chrome.storage.local.get(['supabaseSession'], (result) => {
    if (result.supabaseSession) {
        // Session exists
    }
});