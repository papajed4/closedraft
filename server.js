require('dotenv').config();
const express = require('express');
const path = require('path');
const { supabase, supabaseAdmin } = require('./lib/supabase');
const { generateEmail, buildPrompt } = require('./lib/gemini');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));

// Add body parsing debug
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

// Supabase config endpoint (safe to expose anon key)
app.get('/api/supabase-config', (req, res) => {
    res.json({
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY
    });
});

// Health check - simple
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Health check - detailed
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==================== PROTECTED API ENDPOINTS ====================

// Get all clients (exclude archived by default)
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

        if (!showArchived) {
            query = query.eq('archived', false);
        }

        const { data: clients, error } = await query;

        if (error) throw error;

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.status(200).json({ clients });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// Add new client
app.post('/api/clients', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, business, email, project, amount, status } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Client name is required' });
    }

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

// Update client
app.patch('/api/clients/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const updates = req.body;

    console.log('📝 PATCH /api/clients/' + id);
    console.log('📝 Updates received:', updates);

    try {
        // Verify client belongs to user
        const { data: existing, error: fetchError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !existing) {
            console.error('❌ Client not found or unauthorized:', id);
            return res.status(404).json({ error: 'Client not found' });
        }

        const { data, error } = await supabase
            .from('clients')
            .update(updates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) {
            console.error('❌ Supabase update error:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log('✅ Client updated successfully:');
        res.status(200).json({ client: data });

    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Failed to update client' });
    }
});

// Delete client
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

// Archive client
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

// Restore client (unarchive)
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

// Generate email endpoint
app.post('/api/generate-email', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    console.log('📧 Generate email endpoint hit');

    if (!req.body) {
        return res.status(400).json({ error: 'No request body' });
    }

    const { clientId, type, tone, freelancerName, recipient } = req.body;

    if (!type || !tone) {
        return res.status(400).json({
            error: 'Missing required fields',
            received: { type, tone }
        });
    }

    // If clientId provided, fetch and generate
    if (clientId) {
        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('user_id', user.id)
            .single();

        if (error || !client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        return generateEmailForClient(client, type, tone, freelancerName, res, user);
    }

    // If no clientId but we have recipient, try to find client
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

    // Fallback - no client found, generate mock email and save
    const mockSubject = `${type}: Quick follow-up`;
    const mockBody = `Hi there,\n\nJust following up. Let me know if you have any questions!\n\nBest,\n${freelancerName || 'Freelancer'}`;

    const { data: savedEmail, error: saveError } = await supabase
        .from('emails')
        .insert([{
            user_id: user.id,
            client_id: null,
            subject: mockSubject,
            body: mockBody,
            type,
            tone
        }])
        .select()
        .single();

    if (saveError) {
        console.error('❌ Failed to save mock email:', saveError);
    } else {
        console.log('✅ Mock email saved:', savedEmail.id);
    }

    return res.status(200).json({
        subject: mockSubject,
        body: mockBody,
        emailId: savedEmail?.id
    });
});



// Helper function

async function generateEmailForClient(client, type, tone, freelancerName, res, user) {
    try {
        console.log('✅ Client found:', client.name);

        const prompt = buildPrompt(client, type, tone, freelancerName || '');
        console.log('📝 Calling Gemini...');

        const generatedText = await generateEmail(prompt);
        console.log('✅ Gemini responded');

        let subject = '';
        let body = generatedText;

        const subjectMatch = generatedText.match(/^Subject:\s*(.+)$/m);
        if (subjectMatch) {
            subject = subjectMatch[1].trim();
            body = generatedText.replace(/^Subject:\s*.+\n+/, '').trim();
        }

        // SAVE TO EMAILS TABLE
        const { data: savedEmail, error: saveError } = await supabase
            .from('emails')
            .insert([{
                user_id: user.id,
                client_id: client.id,
                subject,
                body,
                type,
                tone
            }])
            .select()
            .single();

        if (saveError) {
            console.error('❌ Failed to save email:', saveError);
        } else {
            console.log('✅ Email saved to history:', savedEmail.id);
        }

        res.status(200).json({
            subject,
            body,
            fullText: generatedText,
            emailId: savedEmail?.id
        });
    } catch (error) {
        console.error('❌ Email generation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate email' });
    }
}

// Get email history for a client
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

// Get all email history
app.get('/api/emails', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: emails, error } = await supabase
            .from('emails')
            .select(`
                *,
                clients:client_id (name, business, email)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json({ emails });
    } catch (error) {
        console.error('Error fetching all emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// ==================== TEMPLATES API (PROTECTED) ====================

// Get all templates
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

// Add new template
app.post('/api/templates', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, type, tone, subject, body } = req.body;

    if (!name || !body) {
        return res.status(400).json({ error: 'Name and body are required' });
    }

    try {
        const { data, error } = await supabase
            .from('templates')
            .insert([{
                user_id: user.id,
                name,
                type,
                tone,
                subject,
                body
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ template: data });
    } catch (error) {
        console.error('Error adding template:', error);
        res.status(500).json({ error: 'Failed to save template' });
    }
});

// Update template
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

// Delete template
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

// Create checkout session
app.post('/api/create-checkout', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { productId } = req.body;

    if (!productId) {
        return res.status(400).json({ error: 'Product ID is required' });
    }

    try {
        const checkout = await polarApi.checkouts.create({
            products: [productId],
            customerEmail: user.email,
            successUrl: `${req.headers.origin}/app.html?checkout=success`,
            cancelUrl: `${req.headers.origin}/pricing.html?checkout=cancelled`,
            metadata: {
                userId: user.id
            }
        });

        console.log('✅ Checkout created:', checkout.id);

        // 🔥 CRITICAL: Store payment record
        const { error: insertError } = await supabase
            .from('payments')
            .insert([{
                user_id: user.id,
                checkout_id: checkout.id,
                product_id: productId,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);

        if (insertError) {
            console.error('❌ Failed to store payment:', insertError);
        } else {
            console.log('✅ Payment record stored for checkout:', checkout.id);
        }

        res.json({ url: checkout.url });
    } catch (error) {
        console.error('❌ Checkout error:', error);
        res.status(500).json({
            error: error.message || 'Failed to create checkout session'
        });
    }
});

// Polar webhook endpoint
app.post('/api/polar-webhook', async (req, res) => {
    const event = req.body;

    console.log('📦 Polar webhook received:', event.type);

    try {
        // ========== CHECKOUT.UPDATED ==========
        if (event.type === 'checkout.updated') {
            const checkout = event.data;

            // Update payment status AND customer_id
            const updateData = {
                status: checkout.status,
                updated_at: new Date().toISOString()
            };

            // If checkout has customer_id, store it
            if (checkout.customer_id) {
                updateData.customer_id = checkout.customer_id;
            }

            console.log(`📦 Checkout ${checkout.id} status: ${checkout.status}`);

            // Update payment status
            const { error: updateError } = await supabase
                .from('payments')
                .update({
                    status: checkout.status,
                    updated_at: new Date().toISOString()
                })
                .eq('checkout_id', checkout.id);

            if (updateError) {
                console.error('❌ Failed to update payment:', updateError);
            } else {
                console.log(`✅ Payment ${checkout.id} updated to ${checkout.status}`);
            }

            // If checkout succeeded, upgrade the user
            if (checkout.status === 'succeeded') {
                console.log('🔍 Looking up payment for checkout:', checkout.id);

                // Get the payment record
                const { data: payment, error: fetchError } = await supabase
                    .from('payments')
                    .select('user_id, product_id')
                    .eq('checkout_id', checkout.id)
                    .single();

                if (fetchError) {
                    console.error('❌ Failed to fetch payment:', fetchError);
                } else if (!payment) {
                    console.error('❌ No payment found for checkout:', checkout.id);
                } else {
                    console.log('✅ Found payment for user:', payment.user_id);
                    console.log('📦 Product ID:', payment.product_id);

                    // Determine plan type based on product ID
                    let plan = 'pro_monthly';
                    if (payment.product_id === '63c76fe9-4ac3-40b3-b65f-25773c471aa9') {
                        plan = 'pro_yearly';
                        console.log('📦 Detected yearly plan');
                    } else if (payment.product_id === 'YOUR_LIFETIME_ID') {
                        plan = 'pro_lifetime';
                        console.log('📦 Detected lifetime plan');
                    } else if (payment.product_id === '5d5c4dd0-6a3b-4b76-bcec-fbd7bd22cd1b') {
                        plan = 'pro_monthly';
                        console.log('📦 Detected monthly plan');
                    }

                    // Update the user's profile using ADMIN client
                    const { error: profileError } = await supabaseAdmin
                        .from('profiles')
                        .update({
                            plan: plan,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', payment.user_id);

                    if (profileError) {
                        console.error('❌ Failed to upgrade user:', profileError);
                    } else {
                        console.log(`✅ User ${payment.user_id} upgraded to ${plan}`);
                    }
                }
            }
        }

        // ========== SUBSCRIPTION.CREATED ==========
        if (event.type === 'subscription.created') {
            const subscription = event.data;
            const checkoutId = subscription.checkoutId;

            console.log('📦 Subscription created:', subscription.id);
            console.log('📦 Linked to checkout:', checkoutId);

            if (checkoutId) {
                const { error } = await supabase
                    .from('payments')
                    .update({
                        subscription_id: subscription.id,
                        updated_at: new Date().toISOString()
                    })
                    .eq('checkout_id', checkoutId);

                if (error) {
                    console.error('❌ Failed to link subscription:', error);
                } else {
                    console.log('✅ Subscription linked to payment');
                }
            }
        }

        // ========== SUBSCRIPTION.CANCELED (Optional) ==========
        if (event.type === 'subscription.canceled') {
            const subscription = event.data;

            console.log('📦 Subscription canceled:', subscription.id);

            // Find the user with this subscription and downgrade to free
            const { data: payment, error: fetchError } = await supabase
                .from('payments')
                .select('user_id')
                .eq('subscription_id', subscription.id)
                .single();

            if (!fetchError && payment) {
                const { error: downgradeError } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        plan: 'free',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', payment.user_id);

                if (downgradeError) {
                    console.error('❌ Failed to downgrade user:', downgradeError);
                } else {
                    console.log(`✅ User ${payment.user_id} downgraded to free`);
                }
            }
        }

        res.status(200).json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ==================== SERVE PAGES ====================

// Serve landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve login page
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve signup page
app.get('/signup.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// Serve dashboard (protected by frontend auth check)
app.get('/app.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});

app.listen(port, () => {
    console.log(`✅ CloseDraft running at http://localhost:${port}`);
});