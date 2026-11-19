/**
 * WebOS Kernel Server Core.
 * Provides static hosting and a constrained, best-effort web compatibility proxy.
 * This is not a Chromium engine: sites using unsupported browser APIs, service workers,
 * complex authentication/cookies, WebSockets, DRM, or anti-bot checks may still fail.
 */
if (!process.env.VERCEL) require('dotenv').config();
const express = require('express');
const path = require('path');
const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');
const http = require('node:http');
// Vercel functions do not support persistent WebSocket upgrades; avoid loading this dependency there.
const WebSocket = process.env.VERCEL ? null : require('ws');

const app = express();
app.use(express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_req, res) => res.status(200).json({ ok: true, runtime: 'vercel-node', node: process.version }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
// Supabase is optional and loaded only when its diagnostic endpoint is requested.
app.get('/api/os-check', async (req, res) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      status: 'Database Not Configured',
      message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY to enable the database check.'
    });
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.from('your_table').select('*').limit(1);
    if (error) throw error;
    res.status(200).json({ status: 'Kernel Database Active', payload: data });
  } catch (error) {
    res.status(500).json({ status: 'Database Error', message: error.message });
  }
});

function isPrivateAddress(address) {
  const ip = address.toLowerCase().split('%')[0];
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 192 && p[1] === 0 && p[2] === 0) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19));
  }
  if (net.isIPv6(ip)) {
    return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') ||
      ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb') ||
      ip.startsWith('::ffff:');
  }
  return true;
}
async function validateTarget(input) {
  let url;
  try { url = new URL(input); } catch (_) { throw new Error('Invalid web address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP and HTTPS addresses are supported.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local and private network addresses are blocked.');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard web ports are supported.');
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(record => isPrivateAddress(record.address))) {
    throw new Error('This host resolves to a private network address and was blocked.');
  }
  url._webosResolvedAddresses = addresses;
  return url;
}

const PROXY_STATE_COOKIE = 'webos_proxy_state';
const COOKIE_SECRET = crypto.createHash('sha256').update(
  process.env.WEBOS_PROXY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || crypto.randomBytes(32)
).digest();
function parseRequestCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}
function decryptCookieState(req) {
  try {
    const token = parseRequestCookies(req.headers.cookie)[PROXY_STATE_COOKIE];
    if (!token) return [];
    const [ivText, tagText, dataText] = token.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', COOKIE_SECRET, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]);
    const parsed = JSON.parse(plain.toString('utf8'));
    return Array.isArray(parsed) ? parsed.filter(c => c && c.name && c.domain && c.value !== undefined && (!c.expires || c.expires > Date.now())) : [];
  } catch (_) { return []; }
}
function encryptCookieState(cookies) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', COOKIE_SECRET, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(cookies)), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
function cookiePathMatches(requestPath, cookiePath) {
  const p = cookiePath || '/';
  return requestPath === p || (requestPath.startsWith(p) && (p.endsWith('/') || requestPath[p.length] === '/'));
}
function cookiesForUrl(cookies, url) {
  const host = url.hostname.toLowerCase();
  const now = Date.now();
  return cookies.filter(c => {
    const domain = String(c.domain).toLowerCase().replace(/^\./, '');
    const domainOk = c.hostOnly ? host === domain : host === domain || host.endsWith('.' + domain);
    return domainOk && cookiePathMatches(url.pathname || '/', c.path) &&
      (!c.secure || url.protocol === 'https:') && (!c.expires || c.expires > now);
  }).map(c => c.name + '=' + c.value).join('; ');
}
function updateCookieJar(cookies, setCookieHeaders, url) {
  const jar = cookies.slice();
  for (const line of (Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : [])) {
    const parts = String(line).split(';');
    const first = parts.shift();
    const split = first.indexOf('=');
    if (split <= 0) continue;
    const name = first.slice(0, split).trim();
    const value = first.slice(split + 1).trim();
    if (!name || /[\s;,]/.test(name)) continue;
    const c = { name, value, domain: url.hostname.toLowerCase(), hostOnly: true, path: (url.pathname.match(/^.*\//) || ['/'])[0] || '/', secure: false, httpOnly: false, sameSite: '', updated: Date.now() };
    let remove = false;
    for (const attr of parts) {
      const [rawKey, ...rawValue] = attr.trim().split('=');
      const key = rawKey.toLowerCase(), val = rawValue.join('=').trim();
      if (key === 'domain' && val) {
        const domain = val.replace(/^\./, '').toLowerCase();
        if (url.hostname !== domain && !url.hostname.endsWith('.' + domain)) { remove = true; break; }
        c.domain = domain; c.hostOnly = false;
      } else if (key === 'path' && val.startsWith('/')) c.path = val;
      else if (key === 'secure') c.secure = true;
      else if (key === 'httponly') c.httpOnly = true;
      else if (key === 'samesite') c.sameSite = val;
      else if (key === 'max-age') {
        const seconds = Number(val);
        if (Number.isFinite(seconds)) { if (seconds <= 0) remove = true; else c.expires = Date.now() + seconds * 1000; }
      } else if (key === 'expires') {
        const time = Date.parse(val);
        if (Number.isFinite(time)) { c.expires = time; if (time <= Date.now()) remove = true; }
      }
    }
    const index = jar.findIndex(old => old.name === c.name && old.domain === c.domain && old.path === c.path);
    if (index >= 0) jar.splice(index, 1);
    if (!remove) jar.push(c);
  }
  return jar.filter(c => !c.expires || c.expires > Date.now())
    .sort((a, b) => b.updated - a.updated).slice(0, 40);
}
function persistCookieJar(res, cookies) {
  let jar = cookies;
  let token = encryptCookieState(jar);
  while (Buffer.byteLength(token) > 3500 && jar.length) {
    jar = jar.slice(0, -1);
    token = encryptCookieState(jar);
  }
  res.append('Set-Cookie', PROXY_STATE_COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax' + (process.env.NODE_ENV === 'production' ? '; Secure' : '') + '; Max-Age=2592000');
}
function vettedLookup(target) {
  return (hostname, options, callback) => {
    const vetted = target._webosResolvedAddresses || [];
    if (!vetted.length || hostname.toLowerCase() !== target.hostname.toLowerCase()) {
      return callback(new Error('The proxy could not verify the destination host.'));
    }
    const matching = vetted.filter(item => !options.family || item.family === options.family);
    const selected = matching[0] || vetted[0];
    if (options.all) return callback(null, vetted.map(item => ({ address: item.address, family: item.family })));
    return callback(null, selected.address, selected.family);
  };
}

const proxyUrl = url => '/api/browser-proxy?__webos_url=' + encodeURIComponent(url);
function rewriteCss(css, baseUrl) {
  return css.replace(/url\(\s*(['"]?)(?!data:|blob:|#)([^)'"]+)\1\s*\)/gi, (all, quote, raw) => {
    try { return 'url("' + proxyUrl(new URL(raw.trim(), baseUrl).href, baseUrl) + '")'; } catch (_) { return all; }
  }).replace(/@import\s+(?:url\()?\s*(['"])([^'"]+)\1\s*\)?/gi, (all, quote, raw) => {
    try { return '@import url("' + proxyUrl(new URL(raw, baseUrl).href, baseUrl) + '")'; } catch (_) { return all; }
  });
}
function rewriteJavaScript(source, baseUrl) {
  const route = raw => { try { return proxyUrl(new URL(raw, baseUrl).href, baseUrl); } catch (_) { return raw; } };
  return source
    .replace(/(\b(?:from\s*|import\s*|import\s*\(\s*)['"])(\.{1,2}\/[^'"]+)(['"])/g, (all, before, raw, after) => before + route(raw) + after)
    .replace(/(\bnew\s+(?:Worker|SharedWorker)\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g, (all, before, raw, after) => before + route(raw) + after)
    .replace(/\bimport\.meta\.url\b/g, JSON.stringify(baseUrl));
}
function rewriteHtml(html, baseUrl) {
  const removeCsp = html.replace(/<meta\b[^>]*http-equiv\s*=\s*(['"]?)content-security-policy\1[^>]*>/gi, '');
  const withoutBase = removeCsp.replace(/<base\b[^>]*>/gi, '');
  let attrs = withoutBase.replace(/\b(src|href|poster|action|data)\s*=\s*(['"])(.*?)\2/gi, (all, attr, quote, value) => {
    const raw = value.trim();
    if (!raw || /^(?:#|data:|blob:|javascript:|mailto:|tel:)/i.test(raw)) return all;
    try { return attr + '=' + quote + proxyUrl(new URL(raw, baseUrl).href, baseUrl) + quote; } catch (_) { return all; }
  });
  attrs = attrs.replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi, (all, quote, value) => {
    const rewritten = value.split(',').map(candidate => {
      const parts = candidate.trim().split(/\s+/); if (!parts[0]) return candidate;
      try { parts[0] = proxyUrl(new URL(parts[0], baseUrl).href, baseUrl); } catch (_) {}
      return parts.join(' ');
    }).join(', ');
    return 'srcset=' + quote + rewritten + quote;
  });
  attrs = attrs.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (all, open, css, close) => open + rewriteCss(css, baseUrl) + close);
  attrs = attrs.replace(/\bstyle\s*=\s*(['"])(.*?)\1/gi, (all, quote, css) => 'style=' + quote + rewriteCss(css, baseUrl) + quote);
  const bridge = '<script>(function(){var base=' + JSON.stringify(baseUrl) + ';function route(v){try{var raw=typeof v==="string"?v:(v&&v.url)||"";var u=new URL(raw,base);if(!/^https?:$/.test(u.protocol))return v;return "/api/browser-proxy?__webos_url="+encodeURIComponent(u.href)}catch(e){return v}}var f=window.fetch;window.fetch=function(input,init){var next=route(input);if(typeof Request!=="undefined"&&input instanceof Request){try{next=new Request(route(input.url),input)}catch(e){next=route(input.url)}}return f.call(this,next,init)};var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=route(u);return x.apply(this,arguments)};var open=window.open;window.open=function(u){return open.call(this,route(u),...Array.prototype.slice.call(arguments,1))};var NativeWebSocket=window.WebSocket;window.WebSocket=function(url,protocols){var u=new URL(url,base);if(u.protocol==='ws:'||u.protocol==='wss:'){var p=location.protocol==='https:'?'wss:':'ws:';var routed=p+'//'+location.host+'/api/browser-ws?__webos_url='+encodeURIComponent(u.href);return protocols===undefined?new NativeWebSocket(routed):new NativeWebSocket(routed,protocols)}return protocols===undefined?new NativeWebSocket(url):new NativeWebSocket(url,protocols)};window.WebSocket.prototype=NativeWebSocket.prototype;Object.defineProperty(window.WebSocket,'CONNECTING',{value:0});Object.defineProperty(window.WebSocket,'OPEN',{value:1});Object.defineProperty(window.WebSocket,'CLOSING',{value:2});Object.defineProperty(window.WebSocket,'CLOSED',{value:3});})();</script>';
  const headBase = '<base href="' + baseUrl.replace(/"/g, '&quot;') + '">';
  return attrs.replace(/<head(\s[^>]*)?>/i, match => match + headBase + bridge);
}
async function fetchPublicUrl(startUrl, req, cookieJar = []) {
  const axios = require('axios');
  let target = await validateTarget(startUrl);
  let activeCookies = cookieJar;
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    response = await axios({
      url: target.href, method: req.method === 'HEAD' ? 'HEAD' : req.method,
      data: !['GET', 'HEAD'].includes(req.method) ? req.body : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': req.headers.accept || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
        ...(req.headers.range ? { Range: req.headers.range } : {}),
        ...(req.headers['if-none-match'] ? { 'If-None-Match': req.headers['if-none-match'] } : {}),
        ...(req.headers['if-modified-since'] ? { 'If-Modified-Since': req.headers['if-modified-since'] } : {}),
        ...(cookiesForUrl(activeCookies, target) ? { Cookie: cookiesForUrl(activeCookies, target) } : {})
      },
      lookup: vettedLookup(target),
      timeout: 15000, maxRedirects: 0, maxContentLength: 15 * 1024 * 1024,
      responseType: 'arraybuffer', validateStatus: () => true
    });
    activeCookies = updateCookieJar(activeCookies, response.headers['set-cookie'], target);
    if ([301,302,303,307,308].includes(response.status) && response.headers.location) {
      if (redirects === 5) throw new Error('The website redirected too many times.');
      target = await validateTarget(new URL(response.headers.location, target).href);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && req.method === 'POST')) req.method = 'GET';
      continue;
    }
    break;
  }
  return { response, finalUrl: target.href, cookieJar: activeCookies };
}
async function browserProxy(req, res) {
  try {
    const targetUrl = req.query.__webos_url || req.query.url;
    if (!targetUrl) return res.status(400).send('Missing URL parameter.');
    // GET form fields arrive on the proxy endpoint; forward them to the target.
    const destination = new URL(String(targetUrl));
    if (req.method === 'GET') {
      for (const [key, value] of Object.entries(req.query)) {
        if (['__webos_url', '__proto__', 'constructor'].includes(key)) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined && item !== null) destination.searchParams.append(key, String(item));
        }
      }
    }
    let cookieJar = decryptCookieState(req);
    const { response, finalUrl, cookieJar: updatedCookieJar } = await fetchPublicUrl(destination.href, req, cookieJar);
    cookieJar = updatedCookieJar;
    persistCookieJar(res, cookieJar);
    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    let body = Buffer.from(response.data || []);
    if (/text\/html/i.test(contentType)) body = Buffer.from(rewriteHtml(body.toString('utf8'), finalUrl));
    else if (/text\/css/i.test(contentType)) body = Buffer.from(rewriteCss(body.toString('utf8'), finalUrl));
    else if (/javascript|ecmascript/i.test(contentType)) body = Buffer.from(rewriteJavaScript(body.toString('utf8'), finalUrl));
    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    if (response.headers['content-disposition']) res.setHeader('Content-Disposition', response.headers['content-disposition']);
    if (response.headers['content-language']) res.setHeader('Content-Language', response.headers['content-language']);
    for (const header of ['content-range', 'accept-ranges', 'etag', 'last-modified']) {
      if (response.headers[header]) res.setHeader(header, response.headers[header]);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'HEAD') res.send(body); else res.end();
  } catch (error) {
    console.warn('[browser-proxy]', error && error.message ? error.message : error);
    res.status(502).type('text/plain').send('WebOS Browser could not load this page. ' + (error.message || 'Unknown proxy error'));
  }
}
app.options('/api/browser-proxy', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Accept, Range');
  res.setHeader('Access-Control-Max-Age', '600');
  res.status(204).end();
});
app.all('/api/browser-proxy', (req, res) => {
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).send('This browser proxy supports GET, HEAD, POST, PUT, PATCH, and DELETE requests.');
  browserProxy(req, res);
});


function attachWebSocketProxy(server) {
  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/api/browser-ws?')) { socket.destroy(); return; }
    (async () => {
      let upstream;
      try {
        const requestUrl = new URL(req.url, 'http://webos.local');
        const rawTarget = requestUrl.searchParams.get('__webos_url');
        if (!rawTarget) throw new Error('Missing WebSocket destination.');
        const target = await validateTarget(rawTarget.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'));
        const wsTarget = new URL(target.href);
        wsTarget.protocol = wsTarget.protocol === 'https:' ? 'wss:' : 'ws:';
        const jar = decryptCookieState(req);
        const cookie = cookiesForUrl(jar, target);
        const protocols = req.headers['sec-websocket-protocol']
          ? req.headers['sec-websocket-protocol'].split(',').map(x => x.trim()).filter(Boolean) : [];
        upstream = new WebSocket(wsTarget.href, protocols, {
          headers: cookie ? { Cookie: cookie } : {},
          lookup: vettedLookup(target),
          handshakeTimeout: 15000,
          perMessageDeflate: false,
          maxPayload: 16 * 1024 * 1024
        });
        const timer = setTimeout(() => {
          if (upstream.readyState !== WebSocket.OPEN) {
            upstream.terminate();
            if (!socket.destroyed) socket.destroy();
          }
        }, 17000);
        upstream.once('open', () => {
          clearTimeout(timer);
          const localWsServer = new WebSocket.Server({
            noServer: true,
            perMessageDeflate: false,
            handleProtocols: offered => upstream.protocol && offered.has(upstream.protocol) ? upstream.protocol : false
          });
          localWsServer.handleUpgrade(req, socket, head, client => {
            localWsServer.emit('connection', client, req);
            client.on('message', (data, isBinary) => {
              if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
            });
            upstream.on('message', (data, isBinary) => {
              if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
            });
            client.on('close', (code, reason) => { if (upstream.readyState < WebSocket.CLOSING) upstream.close(code, reason); });
            upstream.on('close', (code, reason) => { if (client.readyState < WebSocket.CLOSING) client.close(code, reason); });
            client.on('error', () => upstream.terminate());
            upstream.on('error', () => client.close(1011, 'Upstream WebSocket error'));
          });
        });
        upstream.once('unexpected-response', (_request, response) => {
          clearTimeout(timer);
          if (!socket.destroyed) {
            socket.write('HTTP/1.1 ' + response.statusCode + ' ' + (response.statusMessage || 'WebSocket upgrade failed') + '\r\nConnection: close\r\n\r\n');
            socket.destroy();
          }
        });
        upstream.once('error', error => {
          clearTimeout(timer);
          console.warn('[browser-websocket]', error.message);
          if (!socket.destroyed) socket.destroy();
        });
      } catch (error) {
        console.warn('[browser-websocket]', error.message);
        if (!socket.destroyed) {
          socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
          socket.destroy();
        }
        upstream?.terminate();
      }
    })();
  });
}

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(app);
  attachWebSocketProxy(server);
  server.listen(PORT, () => console.log('WebOS kernel listening on port ' + PORT));
}
module.exports = app;
