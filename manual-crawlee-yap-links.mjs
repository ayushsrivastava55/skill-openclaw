import { CheerioCrawler } from 'crawlee';

const targets = [
  'https://www.yap.market/',
  'https://go.yap.market/home',
  'https://go.yap.market/activator/profile',
  'https://go.yap.market/'
];

const pages = [];

const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: targets.length,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: 45,
  async requestHandler({ request, $, response }) {
    const loadedUrl = request.loadedUrl || request.url;
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    pages.push({
      url: loadedUrl,
      statusCode: response?.statusCode ?? null,
      title: $('title').first().text().trim(),
      textSample: text.slice(0, 420)
    });
  },
  failedRequestHandler({ request, error }) {
    pages.push({ url: request.url, error: String(error) });
  }
});

await crawler.run(targets.map((url) => ({ url })));
console.log(JSON.stringify({ ok: true, scanned: pages.length, pages }, null, 2));
