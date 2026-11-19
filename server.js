/**
 * WebOS Kernel Server Core.
 * Provides static hosting and a constrained, best-effort web compatibility proxy.
 * This is not a Chromium engine: sites using unsupported browser APIs, service workers,
 * complex authentication/cookies, WebSockets, DRM, or anti-bot checks may still fail.
 */
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const dns = require('node:dns').promises;
const net = require('node:net');

const app = express();
const { createClient } = require('@supabase/supabase-js');
app.use(express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
app.get('/api/os-check', async (req, res) => {
  try {
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
const proxyUrl = (url, ref) => '/api/browser-proxy?url=' + encodeURIComponent(url) + (ref ? '&ref=' + encodeURIComponent(ref) : '');
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
  const bridge = '<script>(function(){var base=' + JSON.stringify(baseUrl) + ';function route(v){try{var raw=typeof v==="string"?v:(v&&v.url)||"";var u=new URL(raw,base);if(!/^https?:$/.test(u.protocol))return v;return "/api/browser-proxy?url="+encodeURIComponent(u.href)+"&ref="+encodeURIComponent(base)}catch(e){return v}}var f=window.fetch;window.fetch=function(input,init){var next=route(input);if(typeof Request!=="undefined"&&input instanceof Request){try{next=new Request(route(input.url),input)}catch(e){next=route(input.url)}}return f.call(this,next,init)};var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=route(u);return x.apply(this,arguments)};var open=window.open;window.open=function(u){return open.call(this,route(u),...Array.prototype.slice.call(arguments,1))};})();</script>';
  const headBase = '<base href="' + baseUrl.replace(/"/g, '&quot;') + '">';
  return attrs.replace(/<head(\s[^>]*)?>/i, match => match + headBase + bridge);
}
async function fetchPublicUrl(startUrl, req) {
  let target = await validateTarget(startUrl);
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    response = await axios({
      url: target.href, method: req.method === 'HEAD' ? 'HEAD' : req.method,
      data: req.method === 'POST' ? req.body : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': req.headers.accept || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {})
      },
      lookup: (hostname, options, callback) => {
        const vetted = target._webosResolvedAddresses || [];
        if (!vetted.length || hostname.toLowerCase() !== target.hostname.toLowerCase()) {
          return callback(new Error('The proxy could not verify the destination host.'));
        }
        const matching = vetted.filter(item => !options.family || item.family === options.family);
        const selected = matching[0] || vetted[0];
        if (options.all) return callback(null, vetted.map(item => ({ address: item.address, family: item.family })));
        return callback(null, selected.address, selected.family);
      },
      timeout: 15000, maxRedirects: 0, maxContentLength: 15 * 1024 * 1024,
      responseType: 'arraybuffer', validateStatus: () => true
    });
    if ([301,302,303,307,308].includes(response.status) && response.headers.location) {
      if (redirects === 5) throw new Error('The website redirected too many times.');
      target = await validateTarget(new URL(response.headers.location, target).href);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && req.method === 'POST')) req.method = 'GET';
      continue;
    }
    break;
  }
  return { response, finalUrl: target.href };
}
async function browserProxy(req, res) {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing URL parameter.');
    // GET form fields arrive on the proxy endpoint; forward them to the target.
    const destination = new URL(String(targetUrl));
    if (req.method === 'GET') {
      for (const [key, value] of Object.entries(req.query)) {
        if (['url', 'ref', '__proto__', 'constructor'].includes(key)) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined && item !== null) destination.searchParams.append(key, String(item));
        }
      }
    }
    const { response, finalUrl } = await fetchPublicUrl(destination.href, req);
    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    let body = Buffer.from(response.data || []);
    if (/text\/html/i.test(contentType)) body = Buffer.from(rewriteHtml(body.toString('utf8'), finalUrl));
    else if (/text\/css/i.test(contentType)) body = Buffer.from(rewriteCss(body.toString('utf8'), finalUrl));
    else if (/javascript|ecmascript/i.test(contentType)) body = Buffer.from(rewriteJavaScript(body.toString('utf8'), finalUrl));
    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    if (response.headers['content-disposition']) res.setHeader('Content-Disposition', response.headers['content-disposition']);
    if (response.headers['content-language']) res.setHeader('Content-Language', response.headers['content-language']);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Accept, Range');
  res.setHeader('Access-Control-Max-Age', '600');
  res.status(204).end();
});
app.all('/api/browser-proxy', (req, res) => {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) return res.status(405).send('This browser proxy currently supports GET, HEAD, and POST requests.');
  browserProxy(req, res);
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('WebOS kernel listening on port ' + PORT));
}
module.exports = app;
