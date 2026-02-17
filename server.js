const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow frontend to communicate with backend
app.use(express.json());

// Configuration
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const API_KEY = process.env.GEMINI_API_KEY;

// Prompt Construction Logic (Moved from Frontend)
const constructPrompt = (type, data) => {
    let context = "";
    if (type === "Cold Outreach") {
        context = `Write a ${data.tone} cold outreach email to ${data.clientName} at ${data.businessName}. 
        Hook: I noticed ${data.observation}. 
        My Service: ${data.service}.`;
    } else if (type === "Follow-Up") {
        context = `Write a ${data.tone} follow-up email to ${data.clientName}. 
        Context: Sent a proposal for ${data.offer} ${data.days} days ago and haven't heard back.`;
    } else if (type === "Payment Reminder") {
        context = `Write a ${data.tone} payment reminder to ${data.clientName}. 
        Project: ${data.project}. Amount: ${data.amount}. 
        Overdue by: ${data.overdue} days.`;
    }
    return context;
};

// System Instruction
const SYSTEM_INSTRUCTION = `
Act as a high-level freelance sales strategist.

Your task:
1. Generate ONE compelling email subject line.
2. Then generate the full email body.

Output format MUST be exactly:

Subject: <short compelling subject line>

Email:
<full email body>

Subject Rules:
- Under 7 words
- Personalize when possible (include business name if natural)
- Curiosity-driven OR benefit-driven
- Avoid generic phrases
- Make it feel like a 1-to-1 email
- No salesy language
Make the subject feel like something a real freelancer would send manually.

Email Rules:
- Under 180 words
- Natural human tone
- No AI clichés
- No corporate buzzwords
- Clear greeting
- Clear value/context
- Clear call-to-action
- Confident sign-off
- Match the requested tone perfectly

Do not add anything outside this format.
`;
// API Route
app.post('/generate', async (req, res) => {
    try {
        if (!API_KEY) {
            console.error("Gemini API Key is missing in .env file");
            return res.status(500).json({ error: "Server configuration error" });
        }

        const { emailType, formData } = req.body;

        if (!emailType || !formData) {
            return res.status(400).json({ error: "Missing required data" });
        }

        const prompt = constructPrompt(emailType, formData);

        // Call Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: {
                    parts: [{ text: SYSTEM_INSTRUCTION }]
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            throw new Error(`API Error: ${response.status}`);
        }

        const json = await response.json();

        let resultText = "";
        if (json.candidates && json.candidates[0].content) {
            resultText = json.candidates[0].content.parts[0].text;
        } else {
            throw new Error("Invalid response structure from AI");
        }

        res.json({ result: resultText });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Failed to generate email" });
    }
});

const path = require('path');

// Serve static files
app.use(express.static(__dirname));

// Serve index.html on root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`CloseDraft Server running at http://localhost:${port}`);
});