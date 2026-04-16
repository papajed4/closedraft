// ============================================
// AUTHENTICATION LOGIC
// ============================================

let supabaseAuth = null;

// Initialize Supabase
async function initSupabase() {
    try {
        const response = await fetch('/api/supabase-config');
        const config = await response.json();
        supabaseAuth = window.supabase.createClient(config.url, config.anonKey);
        await checkAuthState();
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
    }
}

// Check auth state and redirect if needed
async function checkAuthState() {
    const { data: { user } } = await supabaseAuth.auth.getUser();
    
    if (user) {
        const currentPath = window.location.pathname;
        if (currentPath.includes('login.html') || currentPath.includes('signup.html') || currentPath === '/' || currentPath === '/index.html') {
            window.location.href = '/app.html';
        }
    } else {
        const currentPath = window.location.pathname;
        if (currentPath.includes('app.html')) {
            window.location.href = '/login.html';
        }
    }
}

// Sign in with Google
async function signInWithGoogle() {
    const btn = document.getElementById('googleSignInBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span><span>Redirecting...</span>';
    
    try {
        const { error } = await supabaseAuth.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/app.html' }
        });
        if (error) throw error;
    } catch (error) {
        showToast(error.message || 'Failed to sign in', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Sign up with Google
async function signUpWithGoogle() {
    const btn = document.getElementById('googleSignUpBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span><span>Redirecting...</span>';
    
    try {
        const { error } = await supabaseAuth.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/app.html' }
        });
        if (error) throw error;
    } catch (error) {
        showToast(error.message || 'Failed to sign up', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Email/Password Sign In
async function signInWithEmail(email, password) {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

// Email/Password Sign Up
async function signUpWithEmail(email, password, name) {
    const { data, error } = await supabaseAuth.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
    });
    if (error) throw error;
    return data;
}

// Sign out
async function signOut() {
    await supabaseAuth.auth.signOut();
    window.location.href = '/';
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    const iconEl = document.getElementById('toastIcon');
    if (!toast || !msgEl || !iconEl) return;
    
    msgEl.textContent = message;
    toast.classList.remove('error', 'success');
    
    if (type === 'success') {
        toast.classList.add('success');
        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
    } else if (type === 'error') {
        toast.classList.add('error');
        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
    } else {
        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    }
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    
    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const submitBtn = document.getElementById('loginSubmitBtn');
            const originalText = submitBtn.innerHTML;
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loader"></span><span>Signing in...</span>';
            
            try {
                await signInWithEmail(email, password);
                showToast('Signed in successfully!', 'success');
                setTimeout(() => window.location.href = '/app.html', 500);
            } catch (error) {
                showToast(error.message || 'Invalid email or password', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }
    
    // Signup Form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        const passwordInput = document.getElementById('signupPassword');
        const strengthBar = document.getElementById('passwordStrengthBar');
        
        if (passwordInput && strengthBar) {
            passwordInput.addEventListener('input', function() {
                const password = this.value;
                let strength = 0;
                if (password.length >= 8) strength += 25;
                if (password.match(/[a-z]/)) strength += 25;
                if (password.match(/[A-Z]/)) strength += 25;
                if (password.match(/[0-9]/) || password.match(/[^a-zA-Z0-9]/)) strength += 25;
                strengthBar.style.width = strength + '%';
                if (strength <= 25) strengthBar.className = 'password-strength bg-red-500';
                else if (strength <= 50) strengthBar.className = 'password-strength bg-amber-500';
                else if (strength <= 75) strengthBar.className = 'password-strength bg-yellow-500';
                else strengthBar.className = 'password-strength bg-green-500';
            });
        }
        
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const submitBtn = document.getElementById('signupSubmitBtn');
            const originalText = submitBtn.innerHTML;
            
            if (password.length < 8) {
                showToast('Password must be at least 8 characters', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loader"></span><span>Creating account...</span>';
            
            try {
                await signUpWithEmail(email, password, name);
                showToast('Account created! Check your email to confirm.', 'success');
                setTimeout(() => window.location.href = '/login.html', 2000);
            } catch (error) {
                showToast(error.message || 'Failed to create account', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }
});