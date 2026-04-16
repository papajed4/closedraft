// content.js - Runs inside Gmail

let closeDraftButton = null;
let isPremium = false;
let currentUser = null;

// Don't load Supabase in content script - use background script instead
// We'll communicate via messages

// Inject CloseDraft button into Gmail compose
function injectButton() {
    if (closeDraftButton) return;
    
    // Wait for compose window to exist
    const checkForCompose = setInterval(() => {
        const composeBox = document.querySelector('[role="dialog"]');
        const toolbar = composeBox?.querySelector('[class*="aoD"]');
        
        if (toolbar && !closeDraftButton) {
            clearInterval(checkForCompose);
            
            // Create our button
            closeDraftButton = document.createElement('button');
            closeDraftButton.id = 'closedraft-btn';
            closeDraftButton.innerHTML = `
                <span style="font-size:14px;margin-right:4px;">✨</span>
                <span style="font-weight:600;">CloseDraft</span>
            `;
            closeDraftButton.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                color: white;
                border: none;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                margin-left: 8px;
                transition: opacity 0.2s;
            `;
            closeDraftButton.onmouseover = () => closeDraftButton.style.opacity = '0.9';
            closeDraftButton.onmouseout = () => closeDraftButton.style.opacity = '1';
            closeDraftButton.onclick = openGenerator;
            
            // Insert into toolbar
            toolbar.appendChild(closeDraftButton);
            console.log('✅ CloseDraft button injected!');
        }
    }, 500);
}

// Open the email generator popup
function openGenerator() {
    // Just open the extension popup - auth check happens there
    console.log('CloseDraft button clicked');
}

// Extract recipient email from Gmail compose
function getRecipientEmail() {
    console.log('🔍 Looking for recipient email...');
    
    // Try multiple selectors for Gmail's "To" field
    const selectors = [
        '[name="to"]',
        '[aria-label*="To"]',
        'input[aria-label*="To"]',
        '[data-email]',
        '.agP.aFw',
        '[class*="agP"]',
        '[class*="aFw"]'
    ];
    
    for (const selector of selectors) {
        const field = document.querySelector(selector);
        if (field) {
            console.log('✅ Found field with selector:', selector);
            console.log('📝 Field content:', field.value || field.innerText || field.textContent);
            
            // Try to get email from value, innerText, or textContent
            const text = field.value || field.innerText || field.textContent || '';
            const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            
            if (emailMatch) {
                console.log('✅ Found email:', emailMatch[0]);
                return emailMatch[0];
            }
        }
    }
    
    // Fallback: look for any email in the compose dialog
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
        const text = dialog.innerText;
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            console.log('✅ Found email in dialog:', emailMatch[0]);
            return emailMatch[0];
        }
    }
    
    console.log('❌ Could not find recipient email');
    return null;
}

// Show a small notification in Gmail
function showNotification(message, isSuccess = true) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isSuccess ? '#14532d' : '#7f1d1d'};
        color: white;
        padding: 12px 24px;
        border-radius: 40px;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
        animation: slideUp 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

// Add animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(style);

// Watch for compose window opening
function watchForCompose() {
    const observer = new MutationObserver(() => {
        if (document.querySelector('[role="dialog"]')) {
            injectButton();
        } else {
            closeDraftButton = null;
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getRecipient') {
        const email = getRecipientEmail();
        console.log('📧 getRecipient request, returning:', email);
        sendResponse({ email: email });
    }
    
    if (message.action === 'insertDraft') {
        insertDraftIntoCompose(message.subject, message.body);
        sendResponse({ success: true });
    }
    
    return true; // Keep channel open for async response
});

// Insert generated draft into Gmail compose
function insertDraftIntoCompose(subject, body) {
    console.log('📧 Inserting draft - Subject:', subject);
    
    // Try multiple selectors for Gmail compose fields
    const subjectSelectors = [
        '[name="subjectbox"]',
        '[name="subject"]',
        'input[aria-label*="Subject"]',
        'input[placeholder*="Subject"]'
    ];
    
    const bodySelectors = [
        '[role="textbox"]',
        '[aria-label*="Message"]',
        '[aria-label*="Body"]',
        '[contenteditable="true"]',
        '.Am.Al.editable'
    ];
    
    // Find subject field
    let subjectField = null;
    for (const selector of subjectSelectors) {
        subjectField = document.querySelector(selector);
        if (subjectField) break;
    }
    
    // Find body field
    let bodyField = null;
    for (const selector of bodySelectors) {
        bodyField = document.querySelector(selector);
        if (bodyField) break;
    }
    
    console.log('📧 Subject field found:', !!subjectField);
    console.log('📧 Body field found:', !!bodyField);
    
    if (subjectField) {
        subjectField.value = subject;
        // Trigger input event
        subjectField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    if (bodyField) {
        bodyField.focus();
        // Try multiple ways to insert text
        if (bodyField.innerText !== undefined) {
            bodyField.innerText = body;
        } else if (bodyField.textContent !== undefined) {
            bodyField.textContent = body;
        }
        
        // Also try execCommand as fallback
        try {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, body);
        } catch (e) {
            console.log('execCommand failed, using direct assignment');
        }
        
        // Trigger input event
        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    if (subjectField || bodyField) {
        showNotification('✅ Draft inserted!', true);
    } else {
        console.error('❌ Could not find compose fields');
        showNotification('❌ Could not insert - please make sure compose window is open', false);
    }
}

// Initialize
console.log('🚀 CloseDraft content script loaded!');
watchForCompose();