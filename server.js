require('dotenv').config();
const express = require('express');
const path = require('path');
const { supabase } = require('./lib/supabase');
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
    console.log('📨 Body:', req.body);
    next();
});

// Get all clients (exclude archived by default)
app.get('/api/clients', async (req, res) => {
    try {
        const showArchived = req.query.showArchived === 'true';
        
        let query = supabase
            .from('clients')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (!showArchived) {
            query = query.eq('archived', false);
        }
        
        const { data: clients, error } = await query;
        
        if (error) throw error;
        
        // Prevent caching
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
    const { name, business, email, project, amount, status } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Client name is required' });
    }
    
    try {
        const { data, error } = await supabase
            .from('clients')
            .insert([{
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
    const { id } = req.params;
    const updates = req.body;
    
    console.log('📝 PATCH /api/clients/' + id);
    console.log('📝 Updates received:', updates);
    
    try {
        const { data: existing, error: fetchError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single();
        
        if (fetchError || !existing) {
            console.error('❌ Client not found:', id);
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const { data, error } = await supabase
            .from('clients')
            .update(updates)
            .eq('id', id)
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
    const { id } = req.params;
    
    try {
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});

// Generate email endpoint
app.post('/api/generate-email', async (req, res) => {
    console.log('📧 Generate email endpoint hit');
    console.log('📧 req.body:', req.body);
    
    if (!req.body) {
        return res.status(400).json({ error: 'No request body' });
    }
    
    const { clientId, type, tone, freelancerName } = req.body;
    
    console.log('📧 Parsed:', { clientId, type, tone, freelancerName });
    
    if (!clientId || !type || !tone) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            received: { clientId, type, tone }
        });
    }
    
    try {
        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .single();
        
        if (error || !client) {
            console.error('❌ Client not found:', clientId);
            return res.status(404).json({ error: 'Client not found' });
        }
        
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
        
        // Save to emails table
        const { data: savedEmail, error: saveError } = await supabase
            .from('emails')
            .insert([{
                client_id: clientId,
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
});

// Get email history for a client
app.get('/api/emails/:clientId', async (req, res) => {
    const { clientId } = req.params;
    
    try {
        const { data: emails, error } = await supabase
            .from('emails')
            .select('*')
            .eq('client_id', clientId)
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
    try {
        const { data: emails, error } = await supabase
            .from('emails')
            .select(`
                *,
                clients:client_id (name, business)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.status(200).json({ emails });
    } catch (error) {
        console.error('Error fetching all emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// Archive client
app.patch('/api/clients/:id/archive', async (req, res) => {
    const { id } = req.params;
    
    try {
        const { data, error } = await supabase
            .from('clients')
            .update({ archived: true })
            .eq('id', id)
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
    const { id } = req.params;
    
    try {
        const { data, error } = await supabase
            .from('clients')
            .update({ archived: false })
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        
        res.status(200).json({ client: data });
    } catch (error) {
        console.error('Error restoring client:', error);
        res.status(500).json({ error: 'Failed to restore client' });
    }
});

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});

// Health check
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.listen(port, () => {
    console.log(`✅ CloseDraft running at http://localhost:${port}`);
});