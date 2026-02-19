const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 4001;

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsed = url.parse(req.url, true);

    if (parsed.pathname !== '/proxy') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
    }

    const targetUrl = parsed.query.url;
    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing url parameter');
        return;
    }

    const referer = parsed.query.referer || 'https://megacloud.blog/';

    const targetParsed = url.parse(targetUrl);
    const protocol = targetParsed.protocol === 'https:' ? https : http;

    const proxyReq = protocol.get(targetUrl, {
        headers: {
            'Referer': referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://megacloud.blog',
        }
    }, (proxyRes) => {
        // Forward content type
        const contentType = proxyRes.headers['content-type'] || 'application/octet-stream';

        res.writeHead(proxyRes.statusCode, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
        });

        // For m3u8 playlists, we need to rewrite internal URLs
        if (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.endsWith('.m3u8')) {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => {
                // Rewrite relative URLs in playlist to go through proxy
                const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                const rewritten = body.replace(/^(?!#)(.+\.(?:m3u8|ts|key).*)$/gm, (match) => {
                    const absolute = match.startsWith('http') ? match : baseUrl + match;
                    return `/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(referer)}`;
                });
                // Also rewrite URLs that are absolute but not proxied
                const rewritten2 = rewritten.replace(/^(https?:\/\/.+)$/gm, (match) => {
                    if (match.includes('/proxy?')) return match;
                    return `/proxy?url=${encodeURIComponent(match)}&referer=${encodeURIComponent(referer)}`;
                });
                res.end(rewritten2);
            });
        } else {
            proxyRes.pipe(res);
        }
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy error');
    });

    proxyReq.setTimeout(15000, () => {
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Timeout');
    });
});

server.listen(PORT, () => {
    console.log(`HLS Proxy running at http://localhost:${PORT}`);
});
