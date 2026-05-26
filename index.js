const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const AUTH_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/.wwebjs_auth`
    : './.wwebjs_auth';

// Initialize the WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
        headless: true,
        // Uses the exact path mapped in our Dockerfile
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
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

client.on('qr', (qr) => {
    console.log('New QR Code Generated');
    currentQR = qr;
});

client.on('ready', () => {
    console.log('WhatsApp Client is connected and ready!');
    isConnected = true;
    currentQR = null; 
});

client.on('disconnected', () => {
    console.log('WhatsApp disconnected.');
    isConnected = false;
});

client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast') return;

    try {
        console.log(`Received message from ${msg.from}`);
        const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000/api/whatsapp/webhook';
        
        await axios.post(NEXTJS_API_URL, {
            from: msg.from,
            body: msg.body,
            timestamp: msg.timestamp,
            tenant_id: process.env.TENANT_ID || 'default_tenant'
        });

    } catch (err) {
        console.error('Error forwarding message to Next.js:', err.message);
    }
});

// ... Keep your app.get('/api/qr') and app.post('/api/send') below this exactly as they were! ...