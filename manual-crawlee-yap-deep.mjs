import { CheerioCrawler } from 'crawlee';

const startUrl = 'https://yap.market';
const pages = [];
const seen = new Set([startUrl]);

const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: 12,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: 45,
  async requestHandler(ctx) {
    const { request, $, response, enqueueLinks } = ctx;
    const loadedUrl = request.loadedUrl || request.url;
    const depth = Number(request.userData?.depth || 0);

    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const title = $('title').first().text().trim();

    pages.push({
      url: loadedUrl,
      statusCode: response?.statusCode ?? null,
      title,
      textSample: text.slice(0, 380)
    });

    if (depth >= 2) return;

    await enqueueLinks({
      selector: 'a[href]',
      strategy: 'same-hostname',
      transformRequestFunction(req) {
        try {
          const u = new URL(req.url);
          if (!u.hostname.endsWith('yap.market')) return null;
          u.hash = '';
          req.url = u.toString();
          if (seen.has(req.url)) return null;
          seen.add(req.url);
          req.userData = { ...(req.userData || {}), depth: depth + 1 };
          return req;
        } catch {
          return null;
        }
      }
    });
  },
  failedRequestHandler({ request, error }) {
    pages.push({ url: request.url, error: String(error) });
  }
});

await crawler.run([{ url: startUrl, userData: { depth: 0 } }]);

const uniquePages = [];
const dedupe = new Set();
for (const p of pages) {
  if (!p.url) continue;
  if (dedupe.has(p.url)) continue;
  dedupe.add(p.url);
  uniquePages.push(p);
}

console.log(JSON.stringify({ ok: true, scanned: uniquePages.length, pages: uniquePages }, null, 2));
