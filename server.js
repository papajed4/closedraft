require('dotenv').config();
const express = require('express');
const path = require('path');
const { supabase, supabaseAdmin } = require('./lib/supabase');
const { generateEmail, buildPrompt } = require('./lib/gemini');
const TelegramBot = require('node-telegram-bot-api');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // from .env
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

const CLOSEDRAFT_URL = process.env.RENDER_EXTERNAL_URL || 'https://closedraft.onrender.com';
bot.setWebHook(`${CLOSEDRAFT_URL}/api/telegram/webhook`);

const { oauth2Client, encryptToken, getGmailClient } = require('./lib/gmailAuth');



const app = express();
const port = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));

app.use((req, res, next) => {
    console.log('📨 Request:', req.method, req.path);
    next();
});

// ==================== AUTH MIDDLEWARE ====================
async function getUserFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error) return null;
    return user;
}

// ==================== PUBLIC ENDPOINTS ====================
app.get('/api/supabase-config', (req, res) => {
    res.json({
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY
    });
});

app.get('/ping', (req, res) => res.status(200).send('pong'));

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==================== CLIENTS API ====================
app.get('/api/clients', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const showArchived = req.query.showArchived === 'true';
        let query = supabase
            .from('clients')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (!showArchived) query = query.eq('archived', false);

        const { data: clients, error } = await query;
        if (error) throw error;

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).json({ clients });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

app.post('/api/clients', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, business, email, project, amount, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });

    try {
        const { data, error } = await supabase
            .from('clients')
            .insert([{
                user_id: user.id,
                name,
                business,
                email,
                project,
                amount,
                status: status || 'active',
                last_contacted: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ client: data });
    } catch (error) {
        console.error('Error adding client:', error);
        res.status(500).json({ error: 'Failed to add client' });
    }
});

app.patch('/api/clients/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const updates = req.body;

    try {
        const { data: existing, error: fetchError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !existing) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const { data, error } = await supabase
            .from('clients')
            .update(updates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;

        // Record status change in activity timeline
        if (updates.status && existing.status !== updates.status) {
            await supabase
                .from('client_activities')
                .insert({
                    client_id: id,
                    user_id: user.id,
                    activity_type: 'status_change',
                    metadata: { old_status: existing.status, new_status: updates.status },
                    created_at: new Date().toISOString()
                });
        }

        res.status(200).json({ client: data });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: 'Failed to update client' });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);
        if (error) throw error;
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});

app.patch('/api/clients/:id/archive', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('clients')
            .update({ archived: true })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw error;
        res.status(200).json({ client: data });
    } catch (error) {
        console.error('Error archiving client:', error);
        res.status(500).json({ error: 'Failed to archive client' });
    }
});

app.patch('/api/clients/:id/restore', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('clients')
            .update({ archived: false })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw error;
        res.status(200).json({ client: data });
    } catch (error) {
        console.error('Error restoring client:', error);
        res.status(500).json({ error: 'Failed to restore client' });
    }
});

// ==================== EMAIL GENERATION ====================
app.post('/api/generate-email', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId, type, tone, freelancerName, recipient } = req.body;
    if (!type || !tone) return res.status(400).json({ error: 'Missing required fields' });

    if (clientId) {
        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('user_id', user.id)
            .single();
        if (error || !client) return res.status(404).json({ error: 'Client not found' });
        return generateEmailForClient(client, type, tone, freelancerName, res, user);
    }

    if (recipient) {
        const { data: existingClient } = await supabase
            .from('clients')
            .select('*')
            .eq('user_id', user.id)
            .ilike('email', `%${recipient}%`)
            .single();
        if (existingClient) {
            return generateEmailForClient(existingClient, type, tone, freelancerName, res, user);
        }
    }

    // Fallback mock email
    const mockSubject = `${type}: Quick follow-up`;
    const mockBody = `Hi there,\n\nJust following up. Let me know if you have any questions!\n\nBest,\n${freelancerName || 'Freelancer'}`;
    const { data: savedEmail, error: saveError } = await supabase
        .from('emails')
        .insert([{ user_id: user.id, client_id: null, subject: mockSubject, body: mockBody, type, tone }])
        .select()
        .single();
    if (saveError) console.error('Failed to save mock email:', saveError);
    return res.status(200).json({ subjectA: mockSubject, subjectB: mockSubject, body: mockBody, emailId: savedEmail?.id });
});

async function generateEmailForClient(client, type, tone, freelancerName, res, user) {
    try {
        const prompt = buildPrompt(client, type, tone, freelancerName || '');
        const generatedText = await generateEmail(prompt);

        let subjectA = '', subjectB = '', body = generatedText;
        const subjectAMatch = generatedText.match(/^Subject A:\s*(.+)$/m);
        const subjectBMatch = generatedText.match(/^Subject B:\s*(.+)$/m);
        if (subjectAMatch && subjectBMatch) {
            subjectA = subjectAMatch[1].trim();
            subjectB = subjectBMatch[1].trim();
            body = generatedText.replace(/^Subject A:\s*.+\n+/m, '').replace(/^Subject B:\s*.+\n+/m, '').trim();
        } else {
            const subjectMatch = generatedText.match(/^Subject:\s*(.+)$/m);
            if (subjectMatch) {
                subjectA = subjectMatch[1].trim();
                subjectB = subjectA;
                body = generatedText.replace(/^Subject:\s*.+\n+/, '').trim();
            }
        }

        const { data: savedEmail, error: saveError } = await supabase
            .from('emails')
            .insert([{
                user_id: user.id,
                client_id: client.id,
                subject: subjectA,
                subject_b: subjectB,
                body,
                type,
                tone
            }])
            .select()
            .single();

        if (!saveError && savedEmail) {
            await supabase
                .from('client_activities')
                .insert({
                    client_id: client.id,
                    user_id: user.id,
                    activity_type: 'email_sent',
                    metadata: { subject: subjectA, type, tone },
                    created_at: new Date().toISOString()
                });
        }

        // Send Discord notification (if webhook is set)
        await sendDiscordNotification(user.id, `📧 Email sent to ${client.name} (${type}) – Hope they answer!`);

        await sendTelegramNotification(user.id, `📧 Email sent to ${client.name} (${type}) – Hope they answer!`, 'new_email');

        res.status(200).json({ subjectA, subjectB, body, fullText: generatedText, emailId: savedEmail?.id });
    } catch (error) {
        console.error('Email generation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate email' });
    }
}

// ==================== EMAIL HISTORY ====================
app.get('/api/emails/:clientId', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId } = req.params;
    try {
        const { data: emails, error } = await supabase
            .from('emails')
            .select('*')
            .eq('client_id', clientId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ emails });
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

app.get('/api/emails', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: emails, error } = await supabase
            .from('emails')
            .select(`*, clients:client_id (name, business, email)`)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ emails });
    } catch (error) {
        console.error('Error fetching all emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// ==================== TEMPLATES API ====================
app.get('/api/templates', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: templates, error } = await supabase
            .from('templates')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ templates });
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

app.post('/api/templates', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, type, tone, subject, body } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'Name and body are required' });

    try {
        const { data, error } = await supabase
            .from('templates')
            .insert([{ user_id: user.id, name, type, tone, subject, body }])
            .select()
            .single();
        if (error) throw error;
        res.status(201).json({ template: data });
    } catch (error) {
        console.error('Error adding template:', error);
        res.status(500).json({ error: 'Failed to save template' });
    }
});

app.patch('/api/templates/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const updates = req.body;
    try {
        const { data, error } = await supabase
            .from('templates')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw error;
        res.status(200).json({ template: data });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

app.delete('/api/templates/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('templates')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);
        if (error) throw error;
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

// ==================== POLAR PAYMENTS ====================
const { polarApi } = require('./lib/polar');

app.post('/api/create-checkout', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID is required' });

    try {
        const checkout = await polarApi.checkouts.create({
            products: [productId],
            customerEmail: user.email,
            successUrl: `${req.headers.origin}/app.html?checkout=success`,
            cancelUrl: `${req.headers.origin}/pricing.html?checkout=cancelled`,
            metadata: { userId: user.id }
        });
        console.log('✅ Checkout created:', checkout.id);
        await supabase.from('payments').insert([{
            user_id: user.id,
            checkout_id: checkout.id,
            product_id: productId,
            status: 'pending',
            created_at: new Date().toISOString()
        }]);
        res.json({ url: checkout.url });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
});

app.post('/api/polar-webhook', async (req, res) => {
    const event = req.body;
    console.log('📦 Polar webhook received:', event.type);

    try {
        if (event.type === 'checkout.updated') {
            const checkout = event.data;
            await supabase.from('payments').update({
                status: checkout.status,
                updated_at: new Date().toISOString()
            }).eq('checkout_id', checkout.id);

            if (checkout.status === 'succeeded') {
                const { data: payment } = await supabase
                    .from('payments')
                    .select('user_id, product_id')
                    .eq('checkout_id', checkout.id)
                    .single();
                if (payment) {
                    let plan = 'pro_monthly';
                    if (payment.product_id === '63c76fe9-4ac3-40b3-b65f-25773c471aa9') plan = 'pro_yearly';
                    else if (payment.product_id === '5d5c4dd0-6a3b-4b76-bcec-fbd7bd22cd1b') plan = 'pro_monthly';
                    await supabaseAdmin.from('profiles').update({ plan, updated_at: new Date().toISOString() }).eq('id', payment.user_id);
                }
            }
        }
        if (event.type === 'subscription.created') {
            const subscription = event.data;
            await supabase.from('payments').update({ subscription_id: subscription.id }).eq('checkout_id', subscription.checkoutId);
        }
        if (event.type === 'subscription.canceled') {
            const subscription = event.data;
            const { data: payment } = await supabase.from('payments').select('user_id').eq('subscription_id', subscription.id).single();
            if (payment) {
                await supabaseAdmin.from('profiles').update({ plan: 'free', updated_at: new Date().toISOString() }).eq('id', payment.user_id);
            }
        }
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ==================== PUBLIC DEMO ENDPOINT ====================
app.post('/api/demo-improve', async (req, res) => {
    const { message } = req.body;
    if (!message || message.length < 10) {
        return res.status(400).json({ error: 'Message too short. Please write at least 10 characters.' });
    }
    try {
        const prompt = `You are an expert freelance copywriter. Rewrite the following to be clearer, more professional, and more effective. Only return the improved version.

Original: "${message}"

Improved version:`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
            })
        });
        const data = await response.json();
        const improved = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate a reply.';
        res.status(200).json({ improved: improved.trim() });
    } catch (error) {
        console.error('Demo API error:', error);
        res.status(500).json({ error: 'Something went wrong.' });
    }
});

// ==================== SEQUENCES API ====================
app.get('/api/sequences', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: sequences, error } = await supabaseAdmin
            .from('sequences')
            .select(`*, clients:client_id (name, business, email), steps:sequence_steps(*)`)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ sequences });
    } catch (error) {
        console.error('Error fetching sequences:', error);
        res.status(500).json({ error: 'Failed to fetch sequences' });
    }
});

app.post('/api/sequences', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId, name, type, tone, steps } = req.body;
    if (!clientId || !name) return res.status(400).json({ error: 'Client and name are required' });

    try {
        const { data: sequence, error: seqError } = await supabaseAdmin
            .from('sequences')
            .insert([{
                user_id: user.id,
                client_id: clientId,
                name,
                type: type || 'follow-up',
                tone: tone || 'friendly',
                total_steps: steps.length
            }])
            .select()
            .single();
        if (seqError) throw seqError;

        const stepData = steps.map((step, index) => ({
            sequence_id: sequence.id,
            step_number: index + 1,
            day_delay: step.dayDelay,
            subject: step.subject,
            body: step.body
        }));
        const { error: stepsError } = await supabaseAdmin.from('sequence_steps').insert(stepData);
        if (stepsError) throw stepsError;

        res.status(201).json({ sequence });
    } catch (error) {
        console.error('Error creating sequence:', error);
        res.status(500).json({ error: 'Failed to create sequence' });
    }
});

app.post('/api/sequences/:id/send-next', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    try {
        const { data: sequence, error: seqError } = await supabaseAdmin
            .from('sequences')
            .select('*, steps:sequence_steps(*)')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
        if (seqError || !sequence) return res.status(404).json({ error: 'Sequence not found' });

        const nextStep = sequence.steps.sort((a, b) => a.step_number - b.step_number).find(s => !s.sent_at);
        if (!nextStep) return res.status(400).json({ error: 'All steps completed' });

        let body = nextStep.body;
        let subjectA = '', subjectB = '';
        if (!body) {
            const clientInfo = {
                name: sequence.clients?.name || 'Client',
                business: sequence.clients?.business || '',
                project: '',
                last_contacted: new Date().toISOString()
            };
            const prompt = buildPrompt(clientInfo, sequence.type, sequence.tone, req.body.freelancerName || 'Freelancer');
            const generatedText = await generateEmail(prompt);
            const subjectAMatch = generatedText.match(/^Subject A:\s*(.+)$/m);
            const subjectBMatch = generatedText.match(/^Subject B:\s*(.+)$/m);
            if (subjectAMatch && subjectBMatch) {
                subjectA = subjectAMatch[1].trim();
                subjectB = subjectBMatch[1].trim();
                body = generatedText.replace(/^Subject A:\s*.+\n+/m, '').replace(/^Subject B:\s*.+\n+/m, '').trim();
            } else {
                const subjectMatch = generatedText.match(/^Subject:\s*(.+)$/m);
                if (subjectMatch) subjectA = subjectMatch[1].trim();
                else subjectA = 'Follow-up';
                subjectB = subjectA;
                body = generatedText;
            }
        } else {
            subjectA = nextStep.subject || 'Follow-up';
            subjectB = nextStep.subject_b || subjectA;
        }

        const { data: savedEmail } = await supabase
            .from('emails')
            .insert([{
                user_id: user.id,
                client_id: sequence.client_id,
                subject: subjectA,
                subject_b: subjectB,
                body,
                type: sequence.type,
                tone: sequence.tone
            }])
            .select()
            .single();

        await supabaseAdmin.from('sequence_steps').update({
            sent_at: new Date().toISOString(),
            subject: subjectA,
            subject_b: subjectB,
            body
        }).eq('id', nextStep.id);

        const sentStepsCount = sequence.steps.filter(s => s.sent_at).length + 1;
        await supabaseAdmin.from('sequences').update({ current_step: sentStepsCount, updated_at: new Date().toISOString() }).eq('id', id);

        // Send Discord notification for sequence email
        await sendDiscordNotification(user.id, `📧 Sequence email sent to ${sequence.clients?.name} (${sequence.type}) – Hope they answer!`);

        await sendTelegramNotification(user.id, `📧 Sequence email sent to ${sequence.clients?.name} (${sequence.type}) – Hope they answer!`, 'new_email');

        res.status(200).json({
            subjectA, subjectB,
            subject: subjectA,
            body,
            emailId: savedEmail?.id,
            step: sentStepsCount,
            total: sequence.total_steps
        });
    } catch (error) {
        console.error('Error sending next:', error);
        res.status(500).json({ error: 'Failed to send next email' });
    }
});

app.delete('/api/sequences/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    try {
        const { error } = await supabaseAdmin.from('sequences').delete().eq('id', id).eq('user_id', user.id);
        if (error) throw error;
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting sequence:', error);
        res.status(500).json({ error: 'Failed to delete sequence' });
    }
});

// ==================== CLIENT ACTIVITIES TIMELINE ====================
app.get('/api/client-activities/:clientId', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId } = req.params;
    const { data, error } = await supabaseAdmin
        .from('client_activities')
        .select('*')
        .eq('client_id', clientId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ activities: data });
});

app.post('/api/client-activities', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { client_id, activity_type, metadata } = req.body;
    if (!client_id || !activity_type) return res.status(400).json({ error: 'Missing required fields' });

    const { error } = await supabaseAdmin
        .from('client_activities')
        .insert({
            client_id,
            user_id: user.id,
            activity_type,
            metadata: metadata || {},
            created_at: new Date().toISOString()
        });
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ success: true });
});

// ==================== DISCORD NOTIFICATIONS (MANUAL WEBHOOK) ====================
// Save/get webhook URL
app.get('/api/user/discord-webhook', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data } = await supabaseAdmin
        .from('profiles')
        .select('discord_webhook_url')
        .eq('id', user.id)
        .single();
    res.json({ webhookUrl: data?.discord_webhook_url || null });
});

app.post('/api/user/discord-webhook', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { webhookUrl } = req.body;
    await supabaseAdmin
        .from('profiles')
        .update({ discord_webhook_url: webhookUrl })
        .eq('id', user.id);
    res.json({ success: true });
});

// Test webhook
app.post('/api/discord/test', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { webhookUrl } = req.body;
    if (!webhookUrl) return res.status(400).json({ error: 'No webhook URL provided' });
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `✅ CloseDraft test from ${user.email}` })
        });
        if (response.ok) res.json({ success: true });
        else res.status(500).json({ error: 'Discord webhook failed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to send notification to user's Discord webhook
async function sendDiscordNotification(userId, message) {
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('discord_webhook_url')
        .eq('id', userId)
        .single();
    if (profile?.discord_webhook_url) {
        try {
            await fetch(profile.discord_webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });
        } catch (e) { console.error('Discord notification failed:', e); }
    }
}

async function sendTelegramNotification(userId, message, type = 'new_email') {
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('telegram_chat_id, notification_prefs')
        .eq('id', userId)
        .single();

    if (!profile?.telegram_chat_id) return;
    if (profile.notification_prefs && profile.notification_prefs[type] === false) return;

    try {
        await bot.sendMessage(profile.telegram_chat_id, message);
    } catch (e) {
        console.error('Telegram notification failed:', e.message);
    }
}

// ==================== TELEGRAM MANAGED NOTIFICATIONS ====================

// Webhook endpoint called by Telegram
app.post('/api/telegram/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Handle /start UNIQUE_TOKEN
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const token = match[1].trim();

    // Find user by telegram_link_token
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .eq('telegram_link_token', token)
        .single();

    if (profile) {
        // Store the chat ID and clear the link token (one-time use)
        await supabaseAdmin
            .from('profiles')
            .update({
                telegram_chat_id: chatId.toString(),
                telegram_link_token: null
            })
            .eq('id', profile.id);

        bot.sendMessage(chatId, '🎉 Welcome to CloseDraft Notifications! You’ll now receive client updates and reminders here.');
        console.log(`✅ Telegram linked for user ${profile.email}`);
    } else {
        bot.sendMessage(chatId, '❌ Invalid or expired link. Please try again from the Settings page.');
    }
});

// If user just types /start without token, prompt them
bot.onText(/^\/start$/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Hi! Please connect your CloseDraft account from the Settings page to receive notifications.');
});

// ---------- Frontend-facing APIs ----------

// Return the unique link token + URL
app.get('/api/user/telegram-link', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Generate a fresh random token
    const crypto = require('crypto');
    const token = crypto.randomBytes(16).toString('hex');

    await supabaseAdmin
        .from('profiles')
        .update({ telegram_link_token: token })
        .eq('id', user.id);

    const botUsername = (await bot.getMe()).username;
    const link = `https://t.me/${botUsername}?start=${token}`;
    res.json({ linkToken: token, link });
});

// Get current connection status and preferences
app.get('/api/user/telegram-status', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data } = await supabaseAdmin
        .from('profiles')
        .select('telegram_chat_id, telegram_link_token, notification_prefs')
        .eq('id', user.id)
        .single();

    const isConnected = !!data?.telegram_chat_id;
    res.json({
        connected: isConnected,
        prefs: data?.notification_prefs || {}
    });
});

// Update preferences
app.post('/api/user/telegram-prefs', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { prefs } = req.body; // entire JSON object
    await supabaseAdmin
        .from('profiles')
        .update({ notification_prefs: prefs })
        .eq('id', user.id);

    res.json({ success: true });
});

// Disconnect (clear chat ID)
app.post('/api/user/telegram-disconnect', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAdmin
        .from('profiles')
        .update({ telegram_chat_id: null })
        .eq('id', user.id);

    res.json({ success: true });
});

async function checkPro(req, res, next) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data: profile } = await supabaseAdmin.from('profiles').select('plan').eq('id', user.id).single();
    if (profile?.plan === 'free') return res.status(403).json({ error: 'Pro plan required' });
    next();
}

// ------ CAMPAIGN CREATION ------
app.post('/api/campaigns', checkPro, async (req, res) => {
    const user = await getUserFromToken(req);
    const { name, type, tone, clientIds, steps } = req.body; // steps: [{dayDelay, subject, body}, ...]

    try {
        // Create campaign
        const { data: campaign, error: campErr } = await supabaseAdmin
            .from('campaigns')
            .insert({ user_id: user.id, name, type, tone })
            .select()
            .single();
        if (campErr) throw campErr;

        // Create leads (links to clients)
        const leadsInserts = clientIds.map(clientId => ({
            campaign_id: campaign.id,
            client_id: clientId,
        }));
        const { data: leads, error: leadErr } = await supabaseAdmin.from('campaign_leads').insert(leadsInserts).select();
        if (leadErr) throw leadErr;

        // Create steps
        const stepsInserts = steps.map((s, idx) => ({
            campaign_id: campaign.id,
            step_number: idx + 1,
            day_delay: s.dayDelay,
            subject: s.subject,
            body: s.body,
        }));
        const { error: stepErr } = await supabaseAdmin.from('campaign_steps').insert(stepsInserts);
        if (stepErr) throw stepErr;

        res.status(201).json({ campaign });
    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

// ------ LAUNCH CAMPAIGN (activate and schedule sends) ------
app.post('/api/campaigns/:id/launch', checkPro, async (req, res) => {
    const user = await getUserFromToken(req);
    const { id } = req.params;

    try {
        // Fetch campaign with steps and leads
        const { data: campaign } = await supabaseAdmin
            .from('campaigns')
            .select('*, steps:campaign_steps(*), leads:campaign_leads(id, client_id)')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (!campaign || campaign.status !== 'draft') return res.status(400).json({ error: 'Invalid campaign' });

        // Update status to active
        await supabaseAdmin.from('campaigns').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', id);

        // Create scheduled sends for each lead & step
        const now = new Date();
        const sendInserts = [];
        for (const lead of campaign.leads) {
            for (const step of campaign.steps) {
                const scheduledTime = new Date(now);
                scheduledTime.setDate(scheduledTime.getDate() + step.day_delay);
                sendInserts.push({
                    campaign_id: id,
                    lead_id: lead.id,
                    step_number: step.step_number,
                    subject: step.subject,
                    body: step.body,
                    scheduled_at: scheduledTime.toISOString(),
                });
            }
        }

        if (sendInserts.length > 0) {
            await supabaseAdmin.from('campaign_sends').insert(sendInserts);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Launch campaign error:', error);
        res.status(500).json({ error: 'Launch failed' });
    }
});

// ------ LIST CAMPAIGNS ------
app.get('/api/campaigns', checkPro, async (req, res) => {
  const user = await getUserFromToken(req);
  try {
    // Fetch campaigns with manual counts
    const { data: campaigns, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch counts manually for each campaign
// Fetch counts manually for each campaign
const enriched = await Promise.all(
  campaigns.map(async (campaign) => {
    const [
      { count: leadsCount },
      { count: stepsCount },
      { count: sentCount },
      { count: totalSends },
      { data: leadsData }
    ] = await Promise.all([
      supabaseAdmin
        .from('campaign_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id),
      supabaseAdmin
        .from('campaign_steps')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id),
      supabaseAdmin
        .from('campaign_sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent'),
      supabaseAdmin
        .from('campaign_sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id),
      supabaseAdmin
        .from('campaign_leads')
        .select('status')
        .eq('campaign_id', campaign.id)
    ]);

    const anyReplied = leadsData ? leadsData.some(l => l.status === 'replied') : false;

    return {
      ...campaign,
      leads: { count: leadsCount },
      steps: { count: stepsCount },
      sentCount,
      totalSends,
      anyReplied,
    };
  })
);

    res.json({ campaigns: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// ------ DELETE CAMPAIGN ------
app.delete('/api/campaigns/:id', checkPro, async (req, res) => {
  const user = await getUserFromToken(req);
  const { id } = req.params;

  try {
    // Verify the campaign belongs to the user
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Delete all related campaign_sends, campaign_steps, campaign_leads, then the campaign itself
    await supabaseAdmin.from('campaign_sends').delete().eq('campaign_id', id);
    await supabaseAdmin.from('campaign_steps').delete().eq('campaign_id', id);
    await supabaseAdmin.from('campaign_leads').delete().eq('campaign_id', id);
    await supabaseAdmin.from('campaigns').delete().eq('id', id).eq('user_id', user.id);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ------ GENERATE AI STEPS (for campaign creation) ------
app.post('/api/campaigns/generate-steps', checkPro, async (req, res) => {
    const user = await getUserFromToken(req);
    const { type, tone, numSteps } = req.body;

    // Use existing Gemini prompt builder (customize for multi-step)
    // For MVP, generate one email per step with increasing urgency
    const steps = [];
    for (let i = 0; i < (numSteps || 3); i++) {
        const prompt = buildPrompt({ name: 'Client', business: '', project: '' }, type, tone, '');
        const generated = await generateEmail(prompt);
        // Parse out subject and body (simplified)
        const subjectMatch = generated.match(/^Subject A:\s*(.+)$/m);
        const body = generated.replace(/^Subject [AB]:\s*.+\n+/gm, '').trim();
        steps.push({
            dayDelay: [1, 3, 7][i] || (i * 3),
            subject: subjectMatch ? subjectMatch[1].trim() : `${type} #${i + 1}`,
            body: body || generated,
        });
    }
    res.json({ steps });
});


// Generate Google OAuth URL
app.get('/api/gmail/auth-url', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',          // ← force re‑consent to always get a refresh token
        scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
        state: JSON.stringify({ userId: user.id }),
    });
    res.json({ url: authUrl });
});

// Handle OAuth callback
app.get('/api/gmail/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing parameters');

    let userId;
    try { userId = JSON.parse(state).userId; } catch { return res.status(400).send('Invalid state'); }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Tokens received:', JSON.stringify(tokens, null, 2));   // <-- ADD

        if (!tokens.refresh_token) {
            console.error('❌ No refresh token received – user must re-authorize');
            return res.redirect(`${process.env.FRONTEND_URL || CLOSEDRAFT_URL}/app.html?gmail_error=missing_refresh_token`);
        }

        const encryptedRefresh = encryptToken(tokens.refresh_token);
        console.log('Encrypted refresh token:', encryptedRefresh.slice(0, 20) + '...');

        const { error } = await supabaseAdmin
            .from('user_gmail_tokens')
            .upsert({
                user_id: userId,
                access_token: tokens.access_token,
                refresh_token: encryptedRefresh,
                expiry_date: tokens.expiry_date, // ✅ correct
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (error) {
            console.error('❌ Upsert error:', error);
            return res.redirect(`${process.env.FRONTEND_URL || CLOSEDRAFT_URL}/app.html?gmail_error=db_error`);
        }

        console.log(`✅ Gmail tokens stored for user ${userId}`);
        res.redirect(`${process.env.FRONTEND_URL || CLOSEDRAFT_URL}/app.html?gmail_connected=1`);

    } catch (error) {
        console.error('OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL || CLOSEDRAFT_URL}/app.html?gmail_error=1`);
    }
});

// Get connection status
app.get('/api/gmail/status', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data } = await supabaseAdmin.from('user_gmail_tokens').select('id').eq('user_id', user.id).single();
    res.json({ connected: !!data });
});

// Disconnect
app.post('/api/gmail/disconnect', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    await supabaseAdmin.from('user_gmail_tokens').delete().eq('user_id', user.id);
    res.json({ success: true });
});

const { sendGmailEmail } = require('./lib/sendEmail');

// Scheduler: runs every 2 minutes
setInterval(async () => {
    console.log('📤 Checking pending sends...');
    try {
        const { data: pending } = await supabaseAdmin
            .from('campaign_sends')
            .select('*, campaign:campaign_id(user_id), lead:lead_id(client_id)')
            .eq('status', 'pending')
            .lte('scheduled_at', new Date().toISOString());

        for (const send of pending) {
            const userId = send.campaign.user_id;
            const clientId = send.lead.client_id;
            const { data: client } = await supabaseAdmin.from('clients').select('email, name').eq('id', clientId).single();
            if (!client || !client.email) continue;

            try {
               const result = await sendGmailEmail(userId, client.email, send.subject, send.body);
// Update send record with the REAL Message‑ID for reply detection
await supabaseAdmin.from('campaign_sends').update({
    sent_at: new Date().toISOString(),
    message_id: result.headerMessageId,   // ⬅️ use the long RFC 2822 ID
    status: 'sent',
}).eq('id', send.id);

                // Update lead status to in_progress
                await supabaseAdmin.from('campaign_leads').update({ current_step: send.step_number }).eq('id', send.lead_id);
            } catch (e) {
                console.error(`Failed to send to ${client.email}:`, e);
                await supabaseAdmin.from('campaign_sends').update({ status: 'failed' }).eq('id', send.id);
            }
        }
    } catch (err) {
        console.error('Scheduler error:', err);
    }
}, 120000); // 2 min

// Reply detection: runs every 5 minutes
// Reply detection: runs every 10 seconds (TEMPORARY – change back to 300000 after testing)
// Reply detection: runs every 10 seconds (TEMPORARY – change back to 300000 after testing)
setInterval(async () => {
  console.log('🔄 Checking for replies...');
  try {
    const { data: sentMessages } = await supabaseAdmin
      .from('campaign_sends')
      .select('message_id, campaign:campaign_id(user_id), lead:lead_id(id)')
      .not('message_id', 'is', null)
      .eq('status', 'sent');

    const userMsgs = {};
    for (const sm of sentMessages) {
      if (!sm.campaign || !sm.lead) continue;   // ← safety
      const uid = sm.campaign.user_id;
      if (!uid) continue;
      if (!userMsgs[uid]) userMsgs[uid] = [];
      userMsgs[uid].push(sm);
    }

    for (const [userId, messages] of Object.entries(userMsgs)) {
      try {
        const gmail = await getGmailClient(userId);
        const res = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 10,
          q: 'is:inbox'
        });
        if (!res.data.messages) continue;

        for (const msg of res.data.messages) {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['In-Reply-To', 'References']
          });

          const payload = full?.data?.payload;
          if (!payload || !payload.headers) continue;   // ← guard

          const headers = payload.headers;
          const inReplyTo = headers.find(h => h.name === 'In-Reply-To')?.value;
          const references = headers.find(h => h.name === 'References')?.value;
          const allRefs = [inReplyTo, ...(references ? references.split(' ') : [])].filter(Boolean);

          for (const ref of allRefs) {
            const matchedMsg = messages.find(m => m.message_id === ref);
            if (matchedMsg) {
              // Stop campaign for this lead
              await supabaseAdmin.from('campaign_leads')
                .update({ status: 'replied' })
                .eq('id', matchedMsg.lead.id);
              await supabaseAdmin.from('campaign_sends')
                .update({ status: 'replied' })
                .eq('lead_id', matchedMsg.lead.id)
                .eq('status', 'pending');
              console.log(`✅ Reply detected – campaign stopped for lead ${matchedMsg.lead.id}`);
              break;
            }
          }
        }
      } catch (e) {
        console.error(`Reply detection error for user ${userId}:`, e);
      }
    }
  } catch (err) {
    console.error('Reply detection error:', err);
  }
}, 300000); 

// ==================== SERVE PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/app.html', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));
app.get('/onboarding.html', (req, res) => res.sendFile(path.join(__dirname, 'onboarding.html')));

app.listen(port, () => {
    console.log(`✅ CloseDraft running at http://localhost:${port}`);
});