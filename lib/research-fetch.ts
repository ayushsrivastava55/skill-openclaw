import type { BrandConfig } from "@/lib/brand-types";
import { env } from "@/lib/env";

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_HTML_TEXT_LENGTH = 20_000;
const MAX_LINKS_PER_PAGE = 80;
const MIN_PAGE_TEXT_LENGTH = 80;
const FAST_GUESS_PATHS = ["/about", "/products", "/pricing", "/blog", "/docs", "/features", "/changelog"];
const DEEP_GUESS_PATHS = ["/news", "/press", "/resources", "/insights"];
const NOT_FOUND_PATTERNS = [
  /(^|\b)404(\b|$)/i,
  /\bpage not found\b/i,
  /\bnot found\b/i,
  /\bdoes(?:n't| not) exist\b/i,
  /\bcould(?:n't| not) find\b/i,
  /\bno longer available\b/i
];
const BRAND_NAME_STOPWORDS = new Set([
  "foundation",
  "protocol",
  "network",
  "labs",
  "lab",
  "inc",
  "llc",
  "company",
  "official",
  "team"
]);

type SourceType = "website" | "social" | "coverage" | "competitor" | "other";

export interface ResearchSourceCandidate {
  url: string;
  sourceType: SourceType;
  priority: number;
}

export interface FetchedResearchPage {
  url: string;
  finalUrl: string;
  domain: string;
  sourceType: SourceType;
  title: string;
  description: string;
  excerpt: string;
  text: string;
  links: string[];
  fetchedAt: string;
}

type CrawleeModule = {
  CheerioCrawler: new (options: Record<string, unknown>) => {
    run: (requests: Array<{ url: string; userData?: Record<string, unknown> }>) => Promise<void>;
  };
  PlaywrightCrawler?: new (options: Record<string, unknown>) => {
    run: (requests: Array<{ url: string; userData?: Record<string, unknown> }>) => Promise<void>;
  };
};

let crawleeModulePromise: Promise<CrawleeModule | null> | null = null;

function normalizeUrl(raw: string, base?: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const hasProtocol = /^https?:\/\//i.test(value);
    const candidate = hasProtocol ? value : `https://${value}`;
    const url = base ? new URL(value, base) : new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function baseDomain(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

function htmlDecode(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const text = htmlDecode(withoutScripts.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, MAX_HTML_TEXT_LENGTH);
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlDecode(match[1]).replace(/\s+/g, " ").trim().slice(0, 220) : "";
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["'][^>]*>/i);
  if (match) {
    return htmlDecode(match[1]).replace(/\s+/g, " ").trim().slice(0, 400);
  }
  const og = html.match(/<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["'][^>]*>/i);
  return og ? htmlDecode(og[1]).replace(/\s+/g, " ").trim().slice(0, 400) : "";
}

function extractLinks(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const pattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(html))) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= MAX_LINKS_PER_PAGE) break;
  }

  return urls;
}

function inferExcerpt(title: string, description: string, text: string): string {
  if (description) return description.slice(0, 320);
  if (title && text) {
    const merged = `${title}. ${text}`.replace(/\s+/g, " ").trim();
    return merged.slice(0, 320);
  }
  return text.slice(0, 320);
}

function isLikelyNotFoundPage(input: { title: string; description: string; text: string }): boolean {
  const combined = `${input.title} ${input.description} ${input.text.slice(0, 900)}`.trim();
  if (!combined) return false;
  return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(combined));
}

function dedupeCandidates(candidates: ResearchSourceCandidate[]): ResearchSourceCandidate[] {
  const byUrl = new Map<string, ResearchSourceCandidate>();
  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate.url);
    if (!normalized) continue;
    const existing = byUrl.get(normalized);
    if (!existing || candidate.priority > existing.priority) {
      byUrl.set(normalized, { ...candidate, url: normalized });
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => b.priority - a.priority);
}

function dedupePages(pages: FetchedResearchPage[]): FetchedResearchPage[] {
  const byKey = new Map<string, FetchedResearchPage>();
  for (const page of pages) {
    const key = `${page.finalUrl}|${page.sourceType}`;
    if (!byKey.has(key)) byKey.set(key, page);
  }
  return Array.from(byKey.values());
}

function isLowSignalPage(page: FetchedResearchPage): boolean {
  const title = page.title.toLowerCase();
  const body = `${page.description} ${page.excerpt} ${page.text.slice(0, 900)}`.toLowerCase();
  if (page.text.length < 220) return true;
  if (!page.title && !page.description) return true;
  if (/javascript (is|to be) (required|enabled)|enable javascript|please wait|just a moment|verify you are human/.test(body)) {
    return true;
  }
  if (/access denied|forbidden|unavailable/.test(title)) return true;
  return false;
}

function shouldUseBrowserFallback(
  pages: FetchedResearchPage[],
  candidates: ResearchSourceCandidate[]
): boolean {
  const hasWebsiteCandidate = candidates.some((candidate) => candidate.sourceType === "website");
  if (!hasWebsiteCandidate) return false;
  if (pages.length === 0) return true;
  const websitePages = pages.filter((page) => page.sourceType === "website");
  if (websitePages.length === 0) return true;
  const lowSignalCount = websitePages.filter(isLowSignalPage).length;
  return lowSignalCount / websitePages.length >= 0.6;
}

function isDisallowedSocialCrawl(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return domain === "x.com" || domain.endsWith(".x.com") || domain === "twitter.com" || domain.endsWith(".twitter.com");
}

function extractBrandKeywords(name: string): string[] {
  return Array.from(
    new Set(
      name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !BRAND_NAME_STOPWORDS.has(token))
    )
  ).slice(0, 4);
}

function isBrandRelatedDomain(input: {
  linkDomain: string;
  rootDomain: string;
  brandKeywords: string[];
}): boolean {
  const normalized = baseDomain(input.linkDomain);
  if (!normalized) return false;
  if (input.rootDomain && normalized.endsWith(input.rootDomain)) return true;
  return input.brandKeywords.some((keyword) => normalized.includes(keyword));
}

function buildPageRecord(input: {
  requestedUrl: string;
  finalUrl: string;
  sourceType: SourceType;
  html: string;
}): FetchedResearchPage | null {
  const title = extractTitle(input.html);
  const description = extractMetaDescription(input.html);
  const text = stripHtml(input.html);
  if (!text || text.length < MIN_PAGE_TEXT_LENGTH) return null;
  if (isLikelyNotFoundPage({ title, description, text })) return null;

  return {
    url: input.requestedUrl,
    finalUrl: input.finalUrl,
    domain: getDomain(input.finalUrl || input.requestedUrl),
    sourceType: input.sourceType,
    title,
    description,
    excerpt: inferExcerpt(title, description, text),
    text,
    links: extractLinks(input.html, input.finalUrl || input.requestedUrl),
    fetchedAt: new Date().toISOString()
  };
}

async function fetchHtmlBasic(url: string): Promise<{ finalUrl: string; html: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "BrandDeployResearchBot/1.0",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = await response.text();
    return {
      finalUrl: response.url || url,
      html
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchResearchCandidatesBasic(
  candidates: ResearchSourceCandidate[],
  limit: number
): Promise<FetchedResearchPage[]> {
  const selected = candidates.slice(0, Math.max(1, limit));

  const results = await Promise.all(
    selected.map(async (candidate) => {
      const payload = await fetchHtmlBasic(candidate.url);
      if (!payload) return null;
      return buildPageRecord({
        requestedUrl: candidate.url,
        finalUrl: payload.finalUrl,
        sourceType: candidate.sourceType,
        html: payload.html
      });
    })
  );

  return results.filter((item): item is FetchedResearchPage => Boolean(item));
}

async function loadCrawleeModule(): Promise<CrawleeModule | null> {
  if (crawleeModulePromise) return crawleeModulePromise;

  crawleeModulePromise = (async () => {
    try {
      const dynamicImport = new Function("specifier", "return import(specifier)") as (
        specifier: string
      ) => Promise<unknown>;
      const moduleCandidate = (await dynamicImport("crawlee")) as Record<string, unknown>;
      if (typeof moduleCandidate.CheerioCrawler !== "function") {
        return null;
      }
      return {
        CheerioCrawler: moduleCandidate.CheerioCrawler as CrawleeModule["CheerioCrawler"],
        PlaywrightCrawler:
          typeof moduleCandidate.PlaywrightCrawler === "function"
            ? (moduleCandidate.PlaywrightCrawler as NonNullable<CrawleeModule["PlaywrightCrawler"]>)
            : undefined
      };
    } catch {
      return null;
    }
  })();

  return crawleeModulePromise;
}

async function fetchResearchCandidatesWithCheerio(
  candidates: ResearchSourceCandidate[],
  limit: number
): Promise<FetchedResearchPage[] | null> {
  const crawlee = await loadCrawleeModule();
  if (!crawlee) return null;

  const selected = candidates.slice(0, Math.max(1, limit));
  const pages: FetchedResearchPage[] = [];

  try {
    const crawler = new crawlee.CheerioCrawler({
      minConcurrency: 1,
      maxConcurrency: 4,
      maxRequestsPerMinute: 40,
      maxRequestsPerCrawl: selected.length,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      respectRobotsTxtFile: true,
      requestHandler: async ({
        request,
        body,
        response
      }: {
        request: Record<string, unknown>;
        body: unknown;
        response?: { statusCode?: number };
      }) => {
        const requestedUrl =
          (typeof request.url === "string" && request.url) || (typeof request.loadedUrl === "string" && request.loadedUrl) || "";
        if (!requestedUrl) return;
        if (typeof response?.statusCode === "number" && response.statusCode >= 400) return;

        const sourceTypeRaw = (request.userData as Record<string, unknown> | undefined)?.sourceType;
        const sourceType: SourceType =
          sourceTypeRaw === "website" ||
          sourceTypeRaw === "social" ||
          sourceTypeRaw === "coverage" ||
          sourceTypeRaw === "competitor"
            ? sourceTypeRaw
            : "other";

        const html =
          typeof body === "string" ? body : Buffer.isBuffer(body) ? body.toString("utf8") : "";
        if (!html) return;

        const finalUrl =
          (typeof request.loadedUrl === "string" && request.loadedUrl) || requestedUrl;
        const page = buildPageRecord({
          requestedUrl,
          finalUrl,
          sourceType,
          html
        });
        if (page) pages.push(page);
      }
    });

    await crawler.run(
      selected.map((candidate) => ({
        url: candidate.url,
        userData: { sourceType: candidate.sourceType }
      }))
    );

    return dedupePages(pages);
  } catch {
    return null;
  }
}

async function fetchResearchCandidatesWithPlaywright(
  candidates: ResearchSourceCandidate[],
  limit: number
): Promise<FetchedResearchPage[] | null> {
  const crawlee = await loadCrawleeModule();
  if (!crawlee?.PlaywrightCrawler) return null;

  const selected = candidates.slice(0, Math.max(1, limit));
  const pages: FetchedResearchPage[] = [];

  try {
    const crawler = new crawlee.PlaywrightCrawler({
      minConcurrency: 1,
      maxConcurrency: 2,
      maxRequestsPerMinute: 25,
      maxRequestsPerCrawl: selected.length,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 45,
      respectRobotsTxtFile: true,
      launchContext: {
        launchOptions: {
          headless: true
        }
      },
      requestHandler: async ({
        request,
        page,
        response
      }: {
        request: Record<string, unknown>;
        page: { content: () => Promise<string>; url: () => string };
        response?: { status: () => number };
      }) => {
        const requestedUrl =
          (typeof request.url === "string" && request.url) || (typeof request.loadedUrl === "string" && request.loadedUrl) || "";
        if (!requestedUrl) return;

        const statusCode = typeof response?.status === "function" ? response.status() : null;
        if (typeof statusCode === "number" && statusCode >= 400) return;

        const sourceTypeRaw = (request.userData as Record<string, unknown> | undefined)?.sourceType;
        const sourceType: SourceType =
          sourceTypeRaw === "website" ||
          sourceTypeRaw === "social" ||
          sourceTypeRaw === "coverage" ||
          sourceTypeRaw === "competitor"
            ? sourceTypeRaw
            : "other";

        const html = await page.content();
        if (!html) return;
        const finalUrl = page.url() || requestedUrl;

        const record = buildPageRecord({
          requestedUrl,
          finalUrl,
          sourceType,
          html
        });
        if (record) pages.push(record);
      }
    });

    await crawler.run(
      selected.map((candidate) => ({
        url: candidate.url,
        userData: { sourceType: candidate.sourceType }
      }))
    );

    return dedupePages(pages);
  } catch {
    return null;
  }
}

export function listFastPassCandidates(brand: BrandConfig): ResearchSourceCandidate[] {
  const candidates: ResearchSourceCandidate[] = [];
  const includeGuessedPaths = env.RESEARCH_ENABLE_GUESS_PATHS === "1";

  const website = normalizeUrl(brand.website || "");
  if (website) {
    candidates.push({ url: website, sourceType: "website", priority: 100 });

    if (includeGuessedPaths) {
      for (const path of FAST_GUESS_PATHS) {
        const next = normalizeUrl(path, website);
        if (next) {
          candidates.push({ url: next, sourceType: "website", priority: 85 });
        }
      }
    }
  }

  if (brand.socialLinks) {
    for (const url of Object.values(brand.socialLinks)) {
      const normalized = normalizeUrl(url || "");
      if (!normalized) continue;
      if (isDisallowedSocialCrawl(normalized)) continue;
      candidates.push({ url: normalized, sourceType: "social", priority: 80 });
    }
  }

  return dedupeCandidates(candidates).slice(0, 16);
}

export function listDeepPassCandidates(
  brand: BrandConfig,
  pages: FetchedResearchPage[]
): ResearchSourceCandidate[] {
  const candidates: ResearchSourceCandidate[] = [];
  const includeGuessedPaths = env.RESEARCH_ENABLE_GUESS_PATHS === "1";
  const website = normalizeUrl(brand.website || "");
  const rootDomain = website ? baseDomain(getDomain(website)) : "";
  const brandKeywords = extractBrandKeywords(brand.name || "");

  for (const page of pages) {
    const linkPriority = page.sourceType === "website" ? 70 : 55;

    for (const link of page.links) {
      if (isDisallowedSocialCrawl(link)) continue;

      const linkDomain = baseDomain(getDomain(link));
      if (
        linkDomain &&
        !isBrandRelatedDomain({
          linkDomain,
          rootDomain,
          brandKeywords
        })
      ) {
        continue;
      }

      let pathname = "";
      try {
        pathname = new URL(link).pathname || "/";
      } catch {
        continue;
      }

      const pathDepth = pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean).length;
      const isLandingPath = pathname === "/" || pathDepth <= 1;
      const isInterestingPath = /\/(blog|news|press|resources|learn|insights|changelog|updates|docs|product|features|about|team)/i.test(
        pathname
      );

      if (
        isInterestingPath ||
        (isLandingPath &&
          linkDomain &&
          isBrandRelatedDomain({
            linkDomain,
            rootDomain,
            brandKeywords
          }))
      ) {
        const priority = isInterestingPath ? linkPriority : Math.max(45, linkPriority - 8);
        candidates.push({ url: link, sourceType: "website", priority });
      }
    }
  }

  if (website && includeGuessedPaths) {
    for (const path of DEEP_GUESS_PATHS) {
      const normalized = normalizeUrl(path, website);
      if (normalized) {
        candidates.push({ url: normalized, sourceType: "website", priority: 60 });
      }
    }
  }

  return dedupeCandidates(candidates).slice(0, 24);
}

export async function fetchResearchCandidates(
  candidates: ResearchSourceCandidate[],
  limit: number
): Promise<FetchedResearchPage[]> {
  const mode = env.RESEARCH_CRAWLER_ENGINE;

  if (mode === "basic") {
    return fetchResearchCandidatesBasic(candidates, limit);
  }

  if (mode === "playwright") {
    const browserPages = await fetchResearchCandidatesWithPlaywright(candidates, limit);
    if (browserPages && browserPages.length > 0) return browserPages;

    const cheerioPages = await fetchResearchCandidatesWithCheerio(candidates, limit);
    if (cheerioPages && cheerioPages.length > 0) return cheerioPages;

    return fetchResearchCandidatesBasic(candidates, limit);
  }

  if (mode === "cheerio" || mode === "crawlee") {
    const cheerioPages = await fetchResearchCandidatesWithCheerio(candidates, limit);
    if (cheerioPages && cheerioPages.length > 0) return cheerioPages;
    return fetchResearchCandidatesBasic(candidates, limit);
  }

  // adaptive
  const cheerioPages = await fetchResearchCandidatesWithCheerio(candidates, limit);
  const basePages = cheerioPages ?? [];

  if (!shouldUseBrowserFallback(basePages, candidates)) {
    if (basePages.length > 0) return basePages;
    return fetchResearchCandidatesBasic(candidates, limit);
  }

  const browserPages = await fetchResearchCandidatesWithPlaywright(candidates, limit);
  if (browserPages && browserPages.length > 0) {
    return dedupePages([...browserPages, ...basePages]);
  }

  if (basePages.length > 0) return basePages;
  return fetchResearchCandidatesBasic(candidates, limit);
}
