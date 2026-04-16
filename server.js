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

        console.log('✅ Client updated successfully:', data);
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
    // RESTORE AUTH CHECK
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    console.log('📧 Generate email endpoint hit');
    console.log('📧 req.body:', req.body);

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

    // If no clientId but we have recipient, create or find client
    if (!clientId && recipient) {
        // Try to find client by email
        const { data: existingClient } = await supabase
            .from('clients')
            .select('*')
            .eq('user_id', user.id)
            .ilike('email', `%${recipient}%`)
            .single();
        
        if (existingClient) {
            // Use existing client
            return generateEmailForClient(existingClient, type, tone, freelancerName, res);
        } else {
            // Return mock for unknown recipient
            return res.status(200).json({
                subject: `${type}: Quick follow-up`,
                body: `Hi there,\n\nJust following up. Let me know if you have any questions!\n\nBest,\n${freelancerName || 'Freelancer'}`
            });
        }
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

        return generateEmailForClient(client, type, tone, freelancerName, res);
    }

    // Fallback
    return res.status(200).json({
        subject: `${type}: Quick follow-up`,
        body: `Hi there,\n\nJust following up. Let me know if you have any questions!\n\nBest,\n${freelancerName || 'Freelancer'}`
    });
});

// Helper function
async function generateEmailForClient(client, type, tone, freelancerName, res) {
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

        res.status(200).json({
            subject,
            body,
            fullText: generatedText
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