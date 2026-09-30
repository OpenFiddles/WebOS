/**
 * WebOS Kernel Server Core
 * Handles local web serving and the Web Browser Iframe Proxy
 */
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. SERVE YOUR OS FILES
app.use(express.static(path.join(__dirname)));

// 2. THE WEB BROWSER INTERCEPT PROXY ROUTE
app.get('/api/browser-proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send("System Error: Missing target URL parameter.");
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 6000 
        });

        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.setHeader('Content-Type', 'text/html');

        // URL REWRITING ENGINE:
        // Automatically injects a <base href="..."> tag right at the top of the webpage head.
        // This instantly tells the iframe to load all relative links, images, and styles
        // from the original website instead of crashing your localhost environment!
        let htmlContent = response.data;
        const parsedUrl = new URL(targetUrl);
        const baseTag = `<base href="${parsedUrl.origin}/">`;
        
        htmlContent = htmlContent.replace('<head>', `<head>${baseTag}`);

        res.send(htmlContent);

    } catch (error) {
        res.status(500).send(`
            <div style="background:#1e1e1e; color:#ff6b6b; font-family:sans-serif; padding:20px; border:2px solid #ff3333; border-radius:5px; margin:20px;">
                <h3>🌐 Browser Proxy Navigation Failure</h3>
                <p>WebOS couldn't connect to: <strong>${targetUrl}</strong></p>
                <p><small>Reason: ${error.message}</small></p>
            </div>
        `);
    }
});

// 3. START THE KERNEL ENGINE
app.listen(PORT, () => {
    console.log(`Done :3, check your server at 'localhost:${PORT}'`)
});
