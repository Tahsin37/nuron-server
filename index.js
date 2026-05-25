const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// In Railway, we will mount a volume to this specific path
const AUTH_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/.wwebjs_auth`
    : './.wwebjs_auth';

// Initialize the WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

let currentQR = null;
let isConnected = false;

// 1. Generate QR Code Event
client.on('qr', (qr) => {
    console.log('New QR Code Generated');
    currentQR = qr; // Save the raw text QR
});

// 2. Client is Ready Event
client.on('ready', () => {
    console.log('WhatsApp Client is connected and ready!');
    isConnected = true;
    currentQR = null; // Clear QR once connected
});

client.on('disconnected', () => {
    console.log('WhatsApp disconnected.');
    isConnected = false;
});

// 3. Catch Incoming Messages and Send to Next.js
client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast') return;

    try {
        console.log(`Received message from ${msg.from}: ${msg.body}`);
        
        // POST to your Next.js API (Nuron Dashboard)
        const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000/api/whatsapp/webhook';
        
        await axios.post(NEXTJS_API_URL, {
            from: msg.from,
            body: msg.body,
            tenant_id: process.env.TENANT_ID // Useful if running 1 worker per client initially
        });

    } catch (err) {
        console.error('Error forwarding message to Next.js:', err.message);
    }
});

// --- EXPRESS API ROUTES ---

// Endpoint for your Next.js dashboard to fetch the QR Code
app.get('/api/qr', async (req, res) => {
    if (isConnected) {
        return res.json({ status: 'connected', qrImage: null });
    }
    
    if (!currentQR) {
        return res.json({ status: 'loading', qrImage: null });
    }

    // Convert raw text QR to a Base64 Image to display on your Next.js frontend
    const qrImage = await qrcode.toDataURL(currentQR);
    res.json({ status: 'waiting_for_scan', qrImage });
});

// Endpoint for your Next.js dashboard to send replies BACK to WhatsApp
app.post('/api/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        await client.sendMessage(to, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start everything
const PORT = process.env.PORT || 8080;
client.initialize();
app.listen(PORT, () => {
    console.log(`Nuron Worker running on port ${PORT}`);
});