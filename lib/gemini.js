// lib/gemini.js
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";

async function generateEmail(prompt) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

        console.log('📞 Calling Gemini API with model:', MODEL_NAME);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{
                        text: "You are an expert freelance copywriter who writes professional, warm, and effective client emails. Always write COMPLETE emails with a proper greeting, full body paragraphs, and a professional sign-off. Never cut off mid-sentence. Never return incomplete responses. Write at least 3-4 sentences in the body. Use the freelancer's actual name in the sign-off, not '[Your Name]'."
                    }]
                },
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
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

        console.log('✅ Gemini response received');

        const fullText = data.candidates[0].content.parts[0].text;
        console.log('📝 Response length:', fullText.length, 'characters');

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
- Length: 80-120 words
- Write a COMPLETE email with proper greeting and sign-off using "${freelancerName || 'Your Name'}".`,

        'Payment Reminder': `
This is a PAYMENT REMINDER.
- Subject: Clear but not aggressive, include invoice/project reference
- Opening: Polite greeting, state the purpose professionally
- Body: Mention the project, the amount ($${client.amount || '[Amount]'}), and that payment is now due/overdue
- Include: Payment instructions or offer to resend invoice
- Closing: Maintain good relationship, offer help if needed
- Length: 80-100 words
- Write a COMPLETE email with proper greeting and sign-off using "${freelancerName || 'Your Name'}".`,

        'Cold Outreach': `
This is a COLD OUTREACH email to a potential new client.
- Subject: Curiosity-driven, under 7 words, make them want to open
- Opening: Genuine, specific compliment about their business or work
- Introduction: Briefly state who you are and what you do
- Value: One clear sentence about how you could help them
- Call to action: Low-commitment ask ("open to a quick chat?", "interested in hearing more?")
- Length: 80-120 words
- Write a COMPLETE email with proper greeting and sign-off using "${freelancerName || 'Your Name'}".`
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

IMPORTANT: Write the FULL email. Include a subject line, greeting, complete body paragraphs, and a professional sign-off with "${freelancerName || 'Your Name'}".

Format exactly like this:
Subject: [Your subject line here]

[Email body starts here. Write multiple complete sentences. End with a proper sign-off using ${freelancerName || 'Your Name'}.]`;

    return prompt;
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

module.exports = { generateEmail, buildPrompt };