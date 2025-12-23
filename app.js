// RSS Feed URLs
const FEEDS = {
    home: 'https://www.tagesschau.de/index~rss2.xml',
    inland: 'https://www.tagesschau.de/inland/index~rss2.xml',
    ausland: 'https://www.tagesschau.de/ausland/index~rss2.xml',
    wirtschaft: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml',
    wissen: 'https://www.tagesschau.de/wissen/index~rss2.xml'
};

// CORS Proxies (fallback chain for reliability)
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];

// Maximum articles per feed
const MAX_ARTICLES_PER_FEED = 35;

// App State
let currentFeed = 'home';
let articlesCache = {};
let activeFetches = {}; // Track in-flight requests to prevent duplicates

// DOM Elements
const articlesList = document.getElementById('articles-list');
const loading = document.getElementById('loading');
const navTabs = document.querySelectorAll('.nav-tab');
const refreshButton = document.getElementById('refresh-button');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Load cached data
    loadCacheFromStorage();

    // Set up navigation
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const feed = tab.dataset.feed;
            switchFeed(feed);
        });
    });

    // Set up refresh button
    refreshButton.addEventListener('click', handleRefresh);

    // Load initial feed
    loadFeed(currentFeed);
}

// Switch between feeds
function switchFeed(feed) {
    if (feed === currentFeed) return;

    currentFeed = feed;

    // Update active tab
    navTabs.forEach(tab => {
        if (tab.dataset.feed === feed) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Load feed
    loadFeed(feed);
}

// Load RSS feed
async function loadFeed(feed) {
    // Check cache first - if we have it, show immediately
    if (articlesCache[feed]) {
        renderArticles(articlesCache[feed]);
        // Still fetch in background to update (doesn't block UI)
        fetchFeed(feed);
        return;
    }

    // No cache - clear articles and wait
    articlesList.innerHTML = '';

    await fetchFeed(feed);
}

// Fetch feed from API
async function fetchFeed(feed) {
    const feedUrl = FEEDS[feed];

    // Prevent duplicate simultaneous requests
    if (activeFetches[feed]) {
        console.log(`[${feed}] Already fetching, skipping duplicate request`);
        return activeFetches[feed];
    }

    // Show loading indicators
    refreshButton.classList.add('refreshing');

    // Create fetch promise
    const fetchPromise = performFetch(feed, feedUrl);
    activeFetches[feed] = fetchPromise;

    try {
        await fetchPromise;
    } finally {
        delete activeFetches[feed];
        // Remove loading indicators
        refreshButton.classList.remove('refreshing');
    }
}

// Perform the actual fetch with retry logic
async function performFetch(feed, feedUrl) {
    let lastError = null;

    // Try each CORS proxy in sequence
    for (let proxyIndex = 0; proxyIndex < CORS_PROXIES.length; proxyIndex++) {
        const proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(feedUrl);

        try {
            console.log(`[${feed}] Attempting fetch with proxy ${proxyIndex + 1}/${CORS_PROXIES.length}`);

            const response = await fetch(proxyUrl, {
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlText = await response.text();

        // Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // Check for parse errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Failed to parse RSS feed XML');
        }

        // Extract items from RSS feed
        const items = xmlDoc.querySelectorAll('item');

        // Debug: Log first item structure for home and inland feeds
        if ((feed === 'home' || feed === 'inland') && items.length > 0) {
            console.log(`[${feed}] First item XML:`, items[0].outerHTML);
            console.log(`[${feed}] First item children:`, Array.from(items[0].children).map(c => c.tagName));
            const desc = items[0].querySelector('description')?.textContent;
            console.log(`[${feed}] Description (first 500 chars):`, desc?.substring(0, 500));
            console.log(`[${feed}] Has img tag in description:`, desc?.includes('<img'));
        }

        // Process articles
        const articles = Array.from(items).map(item => {
            const title = item.querySelector('title')?.textContent || '';
            const link = item.querySelector('link')?.textContent || '';
            const description = item.querySelector('description')?.textContent || '';
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            const guid = item.querySelector('guid')?.textContent || link;

            // Try to get content:encoded which often has the image HTML
            const contentEncoded = item.querySelector('encoded, content\\:encoded')?.textContent || '';

            // Extract image from enclosure, description, or content:encoded
            const image = extractImageFromXML(item, description, contentEncoded);

            // Determine section from URL (for Home tab categorization)
            const section = getSectionFromUrl(link);

            return {
                title: title.trim(),
                description: cleanDescription(description),
                link: link.trim(),
                pubDate: pubDate,
                image: image,
                guid: guid,
                section: section
            };
        });

        // Filter out video content (tagesschau, tagesthemen, 100 sekunden, etc.)
        // Also filter articles where description matches title (usually video content)
        const filteredArticles = articles.filter(article => {
            if (isVideoContent(article.title)) return false;
            if (article.title && article.description && article.title.trim() === article.description.trim()) return false;
            return true;
        });

        // Sort articles by date (newest first)
        filteredArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Limit to maximum articles per feed
        const limitedArticles = filteredArticles.slice(0, MAX_ARTICLES_PER_FEED);

        // Log stats
        const articlesWithImages = limitedArticles.filter(a => a.image).length;
        const itemsFiltered = articles.length - filteredArticles.length;
        const itemsLimited = filteredArticles.length - limitedArticles.length;
        console.log(`[${feed}] Loaded ${limitedArticles.length} articles (${articlesWithImages} with images)${itemsFiltered > 0 ? `, filtered ${itemsFiltered} items` : ''}${itemsLimited > 0 ? `, limited from ${filteredArticles.length}` : ''}`);

        // Cache articles
        articlesCache[feed] = limitedArticles;
        saveCacheToStorage();

        // Render if still on same feed
        if (currentFeed === feed) {
            renderArticles(limitedArticles);
        }

        // Success! Break out of retry loop
        console.log(`[${feed}] Successfully fetched using proxy ${proxyIndex + 1}`);
        return;

        } catch (error) {
            lastError = error;
            console.warn(`[${feed}] Proxy ${proxyIndex + 1} failed:`, error.message);

            // If this wasn't the last proxy, try the next one
            if (proxyIndex < CORS_PROXIES.length - 1) {
                console.log(`[${feed}] Trying next proxy...`);
                continue;
            }
        }
    }

    // All proxies failed
    console.error(`[${feed}] All proxies failed. Last error:`, lastError);

    // Show error state if no cache
    if (!articlesCache[feed]) {
        articlesList.innerHTML = `
            <div class="error-state">
                <h3>Fehler beim Laden</h3>
                <p>Die Artikel konnten nicht geladen werden.</p>
                <p style="font-size: 12px; margin-top: 8px;">Alle ${CORS_PROXIES.length} Proxy-Server sind fehlgeschlagen.</p>
                <p style="font-size: 11px; color: #999;">Letzter Fehler: ${lastError?.message || 'Unbekannt'}</p>
            </div>
        `;
    } else {
        // Still show cached articles even if refresh fails
        console.log(`[${feed}] Using cached articles due to fetch error`);
    }
}

// Determine section from article URL
function getSectionFromUrl(url) {
    if (!url) return 'Aktuell';

    if (url.includes('/inland/')) return 'Inland';
    if (url.includes('/ausland/')) return 'Ausland';
    if (url.includes('/wirtschaft/')) return 'Wirtschaft';
    if (url.includes('/wissen/')) return 'Wissen';
    if (url.includes('/sport/')) return 'Sport';
    if (url.includes('/investigativ/')) return 'Investigativ';
    if (url.includes('/faktenfinder/')) return 'Faktenfinder';

    return 'Aktuell';
}

// Check if article is video content
function isVideoContent(title) {
    if (!title) return false;

    const videoKeywords = [
        'tagesschau in 100 sekunden',
        'tagesschau 20:00 uhr',
        'tagesthemen',
        'nachtmagazin',
        'tagesschau vor 20 jahren',
        'wetter vor der tagesschau'
    ];

    const lowerTitle = title.toLowerCase();

    // Check exact matches first
    for (const keyword of videoKeywords) {
        if (lowerTitle === keyword || lowerTitle.startsWith(keyword)) {
            return true;
        }
    }

    // Check if title is just "tagesschau" (typically the news broadcast)
    if (lowerTitle === 'tagesschau' || lowerTitle === 'die tagesschau') {
        return true;
    }

    return false;
}

// Extract image from RSS XML item
function extractImageFromXML(item, description, contentEncoded) {
    // Try enclosure tag - any type
    let enclosure = item.querySelector('enclosure[type^="image"]');
    if (!enclosure) {
        // Try any enclosure
        enclosure = item.querySelector('enclosure');
    }
    if (enclosure) {
        const url = enclosure.getAttribute('url');
        if (url && url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
            return url;
        }
    }

    // Try media:content or media:thumbnail with namespace
    const mediaElements = [
        'content', 'media\\:content',
        'thumbnail', 'media\\:thumbnail',
        'image', 'media\\:image'
    ];

    for (const selector of mediaElements) {
        const element = item.querySelector(selector);
        if (element) {
            const url = element.getAttribute('url') || element.textContent;
            if (url && url.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp)/i)) {
                return url.trim();
            }
        }
    }

    // Try to find any element with 'image' in the name
    const allChildren = Array.from(item.children);
    for (const child of allChildren) {
        if (child.tagName.toLowerCase().includes('image') ||
            child.tagName.toLowerCase().includes('thumb') ||
            child.tagName.toLowerCase().includes('media')) {
            const url = child.getAttribute('url') ||
                       child.getAttribute('href') ||
                       child.textContent;
            if (url && url.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp)/i)) {
                return url.trim();
            }
        }
    }

    // Try content:encoded first (often has full HTML with images)
    if (contentEncoded) {
        try {
            // Create a temporary DOM element to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contentEncoded;

            // Find all img tags
            const imgTags = tempDiv.querySelectorAll('img');
            if (imgTags.length > 0) {
                const src = imgTags[0].getAttribute('src');
                if (src && src.startsWith('http')) {
                    return src.trim();
                }
            }
        } catch (e) {
            console.error('Failed to parse content:encoded HTML:', e);
        }
    }

    // Try to extract from description HTML - parse as actual HTML
    if (description) {
        try {
            // Create a temporary DOM element to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = description;

            // Find all img tags
            const imgTags = tempDiv.querySelectorAll('img');
            if (imgTags.length > 0) {
                const src = imgTags[0].getAttribute('src');
                if (src && src.startsWith('http')) {
                    return src.trim();
                }
            }
        } catch (e) {
            console.error('Failed to parse description HTML:', e);
        }

        // Fallback to regex if DOM parsing fails
        const patterns = [
            /<img[^>]+src=["']([^"']+)["']/i,
            /<img[^>]+src=([^\s>]+)/i,
            /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)/i
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match) {
                let url = match[1] || match[0];
                // Clean up URL
                url = url.replace(/["'>].*$/, '').trim();
                if (url.startsWith('http')) {
                    return url;
                }
            }
        }
    }

    return null;
}

// Clean description (remove HTML tags and excessive whitespace)
function cleanDescription(html) {
    if (!html) return '';

    // Remove HTML tags
    const text = html.replace(/<[^>]*>/g, ' ');

    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    const decoded = textarea.value;

    // Clean up whitespace
    return decoded.replace(/\s+/g, ' ').trim();
}

// Render articles list
function renderArticles(articles) {
    if (!articles || articles.length === 0) {
        articlesList.innerHTML = `
            <div class="empty-state">
                <h3>Keine Artikel gefunden</h3>
                <p>Es sind derzeit keine Artikel verfügbar.</p>
            </div>
        `;
        return;
    }

    articlesList.innerHTML = articles.map(article => `
        <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="article-card ${!article.image ? 'no-image' : ''}">
            ${article.image ? `
                <img
                    class="article-image"
                    src="${article.image}"
                    alt="${escapeHtml(article.title)}"
                    loading="lazy"
                    onerror="this.parentElement.classList.add('no-image'); this.style.display='none';"
                >
            ` : ''}
            <div class="article-content">
                <h2 class="article-title">${escapeHtml(article.title)}</h2>
                ${article.description ? `
                    <p class="article-description">${escapeHtml(article.description)}</p>
                ` : ''}
                <div class="article-meta">
                    <time class="article-date">${formatDate(article.pubDate)}</time>
                    ${currentFeed === 'home' && article.section ? `
                        <span class="meta-separator">•</span>
                        <span class="article-section">${article.section}</span>
                    ` : ''}
                </div>
            </div>
        </a>
    `).join('');
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;

    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Local Storage
function saveCacheToStorage() {
    try {
        const cacheData = {
            timestamp: Date.now(),
            articles: articlesCache
        };
        localStorage.setItem('newsCache', JSON.stringify(cacheData));
    } catch (e) {
        console.error('Failed to save cache:', e);
    }
}

function loadCacheFromStorage() {
    try {
        const cached = localStorage.getItem('newsCache');
        if (cached) {
            const data = JSON.parse(cached);
            const age = Date.now() - data.timestamp;

            // Use cache if less than 2 hours old (increased from 30 minutes)
            // News doesn't change that frequently, and stale cache is better than loading spinner
            if (age < 2 * 60 * 60 * 1000) {
                articlesCache = data.articles || {};
                console.log(`Loaded cache from ${Math.round(age / 60000)} minutes ago`);
            } else {
                console.log('Cache expired, will fetch fresh data');
            }
        }
    } catch (e) {
        console.error('Failed to load cache:', e);
    }
}

// Handle refresh button click
async function handleRefresh() {
    try {
        // Clear cache for current feed to force fresh fetch
        delete articlesCache[currentFeed];
        delete activeFetches[currentFeed];

        // Fetch fresh data (loading indicators handled by fetchFeed)
        await loadFeed(currentFeed);

        console.log(`[${currentFeed}] Feed refreshed successfully`);
    } catch (error) {
        console.error(`[${currentFeed}] Refresh failed:`, error);
    }
}

// Handle online/offline events
window.addEventListener('online', () => {
    loadFeed(currentFeed);
});

window.addEventListener('offline', () => {
    console.log('App is offline');
});
