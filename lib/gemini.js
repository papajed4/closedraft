// lib/gemini.js
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";

// Helper to generate email with retry if incomplete
async function generateEmailWithRetry(prompt, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`📞 Calling Gemini (attempt ${attempt}/${maxRetries})...`);

        const generatedText = await generateEmail(prompt);

        // Check if email looks complete
        const hasClosing = /(Best|Regards|Thanks|Sincerely|Cheers|All the best)/i.test(generatedText);
        const hasSignature = /([A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+)/.test(generatedText.split('\n').pop() || '');
        const isLongEnough = generatedText.length > 300;

        if (hasClosing && isLongEnough) {
            console.log(`✅ Email generation successful (attempt ${attempt})`);
            return generatedText;
        }

        console.warn(`⚠️ Attempt ${attempt}: Incomplete email (len=${generatedText.length}, hasClosing=${hasClosing}, hasSig=${hasSignature}). Retrying...`);

        // Add stronger hint for retry
        prompt += "\n\nCRITICAL: Your previous response was incomplete. Write the COMPLETE email with proper closing and signature. Do NOT cut off.";
    }

    // Fallback: return last attempt
    console.error('❌ Failed to generate complete email after retries');
    return await generateEmail(prompt);
}

async function generateEmail(prompt) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{
                        text: `You are an expert freelance copywriter specializing in professional client emails.

CRITICAL RULES (MUST FOLLOW):
- Write COMPLETE emails only. Never cut off mid-sentence.
- Every email MUST have: greeting, at least 4-5 full sentences, professional closing, and signature.
- Use the freelancer's actual name in sign-off, not "[Your Name]".
- Minimum length: 150 words.
- Always include TWO distinct subject lines (Subject A and Subject B) that are meaningfully different.
- End body with a proper closing (Best, Regards, Thanks, etc.) followed by the freelancer's name.

FAILURE TO FOLLOW THESE RULES WILL CAUSE THE EMAIL TO BE REJECTED.`
                    }]
                },
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.8,          // Slightly higher for more diverse subjects
                    maxOutputTokens: 2000,     // Increased from 1000 to ensure complete email
                    topP: 0.95,
                    topK: 40,
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API error:', JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || 'Gemini API failed');
        }

        const fullText = data.candidates[0].content.parts[0].text;
        console.log(`📝 Response length: ${fullText.length} characters`);

        // Quick validation – if too short, throw to trigger retry
        if (fullText.length < 200) {
            throw new Error('Generated email too short, likely incomplete');
        }

        return fullText;
    } catch (error) {
        console.error('Gemini generation failed:', error);
        throw error;
    }
}

function buildPrompt(client, type, tone, freelancerName = '') {
    const toneInstructions = {
        'Friendly': 'Warm, conversational, personable. Use "I" and "you". Include a friendly opener.',
        'Professional': 'Polished, clear, business-appropriate. Direct but courteous.',
        'Firm': 'Assertive and clear about expectations. Professional but not rude.',
        'Casual': 'Relaxed, informal. Like messaging a colleague. Use contractions.'
    };

    const emailTypeInstructions = {
        'Follow-up': `
This is a FOLLOW-UP email.
- Subject: Under 7 words, reference the ongoing conversation
- Opening: Friendly check-in, reference the last interaction
- Body: Ask about project status, offer help, show you're thinking of them
- Closing: Low-pressure call to action like "Let me know if you need anything from me"
- Length: 120-180 words
- Write a COMPLETE email with proper greeting and sign-off using "${freelancerName || 'Your Name'}"`,

        'Payment Reminder': `
This is a PAYMENT REMINDER.
- Subject: Clear but not aggressive, include invoice/project reference
- Opening: Polite greeting, state the purpose professionally
- Body: Mention the project, the amount ($${client.amount || '[Amount]'}), and that payment is now due/overdue
- Include: Payment instructions or offer to resend invoice
- Closing: Maintain good relationship, offer help if needed
- Length: 120-180 words
- Write a COMPLETE email with proper greeting and sign-off using "${freelancerName || 'Your Name'}"`,

        'Cold Outreach': `
This is a COLD OUTREACH email to a potential new client.
- Subject: Curiosity-driven, under 7 words, make them want to open
- Opening: Genuine, specific compliment about their business or work
- Introduction: Briefly state who you are and what you do
- Value: One clear sentence about how you could help them
- Call to action: Low-commitment ask ("open to a quick chat?", "interested in hearing more?")
- Length: 120-180 words
- Write a COMPLETE email with proper greeting and sign-off using "${freelancerName || 'Your Name'}"`
    };

    const prompt = `Write a professional freelance email.

FREELANCER INFORMATION:
- Your Name: ${freelancerName || '[Your Name]'}

CLIENT INFORMATION:
- Client Name: ${client.name}
- Business: ${client.business || 'Not specified'}
- Project: ${client.project || 'Not specified'}
- Last Contact: ${client.last_contacted ? new Date(client.last_contacted).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}

EMAIL TYPE: ${type}
TONE: ${tone} (${toneInstructions[tone]})

INSTRUCTIONS:
${emailTypeInstructions[type]}

FORMAT REQUIREMENTS (STRICT):
1. Start with "Subject A: [first subject]"
2. Then "Subject B: [second subject]" – must be different from A
3. Then a blank line
4. Then the email body (greeting, 4-5 paragraphs, closing, and signature)

IMPORTANT: 
- Subject A and Subject B MUST be different (different hooks, angles, or tones).
- The email body MUST be complete (no cut-offs, no "..." at end).
- End with a proper sign-off like "Best," or "Thanks," followed by "${freelancerName || 'Your Name'}" on a new line.

Example format:
Subject A: Following up on our chat
Subject B: Quick question about your project

Hi ${client.name},

[Body content...]

Best,
${freelancerName || 'Your Name'}

Now write the actual email following exactly this format.`;
    return prompt;
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

module.exports = { generateEmail: generateEmailWithRetry, buildPrompt };