const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Use Railway's persistent volume if available, otherwise local folder
const AUTH_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/.wwebjs_auth`
    : './.wwebjs_auth';

// Initialize the WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium', // Forces use of OS Chromium
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

// Event: QR Code Generated
client.on('qr', (qr) => {
    console.log('New QR Code Generated');
    currentQR = qr;
});

// Event: Client Connected
client.on('ready', () => {
    console.log('WhatsApp Client is connected and ready!');
    isConnected = true;
    currentQR = null; 
});

// Event: Client Disconnected
client.on('disconnected', () => {
    console.log('WhatsApp disconnected.');
    isConnected = false;
});

// Event: Incoming Message (Forward to Next.js)
client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast') return;

    try {
        console.log(`Received message from ${msg.from}`);
        
        // Ensure this matches your Vercel Next.js URL in production
        const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000/api/whatsapp/webhook';
        
        await axios.post(NEXTJS_API_URL, {
            from: msg.from,
            body: msg.body,
            timestamp: msg.timestamp,
            // Include tenant identification if you scale to multiple numbers
            tenant_id: process.env.TENANT_ID || 'default_tenant'
        });

    } catch (err) {
        console.error('Error forwarding message to Next.js:', err.message);
    }
});

// API: Get QR Code
app.get('/api/qr', async (req, res) => {
    if (isConnected) {
        return res.json({ status: 'connected', qrImage: null });
    }
    
    if (!currentQR) {
        return res.json({ status: 'loading', qrImage: null });
    }

    const qrImage = await qrcode.toDataURL(currentQR);
    res.json({ status: 'waiting_for_scan', qrImage });
});

// API: Send Message Outbound
app.post('/api/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        await client.sendMessage(to, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
client.initialize();
app.listen(PORT, () => {
    console.log(`Nuron Worker running on port ${PORT}`);
});