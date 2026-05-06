// nav.js - Shared navigation auth check + mobile menu for all public pages

document.addEventListener('DOMContentLoaded', async () => {
    const SUPABASE_URL = 'https://txibbsaodcpaturobeok.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4aWJic2FvZGNwYXR1cm9iZW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODkyODQsImV4cCI6MjA5MTI2NTI4NH0.1omA2j3QaFzr83KxqpQOSrRngu6mGkJB2d_PYDGNR24';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user } } = await supabase.auth.getUser();

    const navAuth = document.getElementById('navAuth');
    const mobileNavAuth = document.getElementById('mobileNavAuth');

    if (user) {
        const initial = (user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase();

        // Update desktop nav
        if (navAuth) {
            navAuth.innerHTML = `
                <a href="/app.html" class="gradient-primary text-white px-5 py-2 rounded-xl text-sm font-bold">Dashboard</a>
                <div class="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm hidden md:flex">${initial}</div>
            `;
        }

        // Update mobile nav
        if (mobileNavAuth) {
            mobileNavAuth.innerHTML = `
                <a href="/app.html" class="block text-center px-5 py-2.5 rounded-xl gradient-primary text-white font-bold">Dashboard</a>
            `;
        }
    }

    // Mobile menu toggle (now inside DOMContentLoaded)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const menuIconOpen = document.getElementById('menuIconOpen');
    const menuIconClose = document.getElementById('menuIconClose');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            if (menuIconOpen) menuIconOpen.classList.toggle('hidden');
            if (menuIconClose) menuIconClose.classList.toggle('hidden');
        });
    }
});