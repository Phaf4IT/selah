"use strict";

/*
 * Selah — persoonlijke christelijke Chrome-newtab-extensie.
 *
 * De offline teksten en overdenkingen staan in offline-verses.json.
 * Ze zijn vrije parafrases / Bijbels geïnspireerde gedachten en geen
 * geverifieerde letterlijke citaten uit een geselecteerde vertaling.
 *
 * HelloAO wordt zonder API-sleutel gebruikt. Controleer voor de gekozen
 * vertaling de licentie, copyrightvoorwaarden en toegestane caching.
 */

const STORAGE_KEYS = Object.freeze({
    settings: "selah.settings.v1",
    favorites: "selah.favorites.v1",
    verseCache: "selah.verseCache.helloao.v1",
    translationsCache: "selah.translationsCache.helloao.v1",
    backgroundCache: "selah.backgroundCache.v1"
});

const HELLOAO_API_BASE = "https://bible.helloao.org/api";
const OPENVERSE_API_BASE = "https://api.openverse.org/v1";

const VERSE_CACHE_TTL = 24 * 60 * 60 * 1000;
const TRANSLATIONS_CACHE_TTL = 24 * 60 * 60 * 1000;
const BACKGROUND_CACHE_TTL = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

const THEMES = Object.freeze({
    all: "Alle thema's",
    trust: "Vertrouwen",
    peace: "Vrede en rust",
    gratitude: "Dankbaarheid",
    hope: "Kracht en hoop",
    prayer: "Gebed",
    love: "Liefde en genade"
});

/*
 * De IDs hieronder zijn de gangbare HelloAO-boek- en vers-ID's.
 * De beschikbaarheid van een specifiek vers wordt door de gekozen
 * Bijbelversie bepaald. Bij een fout wordt de volgende kandidaat
 * geprobeerd.
 */
const VERSE_CATALOG = [
    {
        id: "PSA.46.10",
        reference: "Psalm 46:11",
        reflection: "Waar mag jij vandaag wat meer rust en vertrouwen vinden?",
        themes: ["trust", "peace", "prayer"]
    },
    {
        id: "PSA.23.1",
        reference: "Psalm 23:1",
        reflection: "Wat heb je vandaag al ontvangen waarvoor je dankbaar bent?",
        themes: ["trust", "gratitude", "peace"]
    },
    {
        id: "PRO.3.5",
        reference: "Spreuken 3:5",
        reflection: "Wat mag je vandaag aan God toevertrouwen?",
        themes: ["trust", "prayer"]
    },
    {
        id: "ISA.41.10",
        reference: "Jesaja 41:10",
        reflection: "Welke zorg kun je vandaag loslaten?",
        themes: ["hope", "trust"]
    },
    {
        id: "MAT.11.28",
        reference: "Mattheüs 11:28",
        reflection: "Waar heb jij behoefte aan rust?",
        themes: ["peace", "hope"]
    },
    {
        id: "PSA.121.2",
        reference: "Psalm 121:2",
        reflection: "Waar zoek jij hulp wanneer je het even niet weet?",
        themes: ["hope", "trust"]
    },
    {
        id: "PHP.4.6",
        reference: "Filippenzen 4:6",
        reflection: "Waar wil je vandaag bewust voor bidden?",
        themes: ["prayer", "peace", "trust"]
    },
    {
        id: "PSA.118.24",
        reference: "Psalm 118:24",
        reflection: "Wat is één klein ding waar je vandaag blij om kunt zijn?",
        themes: ["gratitude", "hope"]
    },
    {
        id: "JHN.14.27",
        reference: "Johannes 14:27",
        reflection: "Hoe kun je vandaag vrede toelaten in je gedachten?",
        themes: ["peace", "trust"]
    },
    {
        id: "1CO.13.4",
        reference: "1 Korinthe 13:4",
        reflection: "Hoe kun je vandaag liefde tonen aan iemand in je omgeving?",
        themes: ["love"]
    },
    {
        id: "ROM.8.28",
        reference: "Romeinen 8:28",
        reflection: "Waar hoop je op, ook als je de uitkomst nog niet kent?",
        themes: ["hope", "trust"]
    },
    {
        id: "LAM.3.22",
        reference: "Klaagliederen 3:22",
        reflection: "Waar mag je vandaag opnieuw beginnen?",
        themes: ["love", "hope", "gratitude"]
    },
    {
        id: "1TH.5.16",
        reference: "1 Thessalonicenzen 5:16",
        reflection: "Welk klein moment van vreugde wil je vandaag opmerken?",
        themes: ["gratitude", "hope"]
    },
    {
        id: "PSA.55.22",
        reference: "Psalm 55:23",
        reflection: "Welke last zou je vandaag willen neerleggen?",
        themes: ["trust", "prayer", "peace"]
    },
    {
        id: "EPH.4.32",
        reference: "Efeze 4:32",
        reflection: "Aan wie kun je vandaag vriendelijkheid of vergeving geven?",
        themes: ["love"]
    },
    {
        id: "HEB.11.1",
        reference: "Hebreeën 11:1",
        reflection: "Waar vraagt jouw geloof om vertrouwen zonder alle antwoorden?",
        themes: ["trust", "hope"]
    }
];

// De offline teksten en overdenkingen staan in offline-verses.json.
let OFFLINE_VERSES = [];


const DEFAULT_SETTINGS = Object.freeze({
    name: "",
    theme: "all",
    bibleId: "",
    bibleName: "",
    bibleAbbreviation: "",
    bibleCopyright: "",
    bibleLanguage: "",
    reflectionEnabled: true,
    backgroundFrequency: "daily",
});

const state = {
    settings: { ...DEFAULT_SETTINGS },
    favorites: [],
    currentVerse: null,
    currentVerseKey: "",
    currentVerseIsFavorite: false,
    currentSource: "offline",
    currentOfflineIndex: 0,
    currentFavoriteId: null,
    manualVerseOffset: 0,
    translations: [],
    activePanel: null,
    noteFavoriteId: null,
    toastTimer: null,
    lastTranslationRequestAt: 0,
    lastOpenverseRequestAt: 0,
    openverseImages: [],
    currentBackgroundIndex: -1
};

const $ = (id) => document.getElementById(id);

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, maxLength = 10000) {
    if (typeof value !== "string") {
        return "";
    }

    return value.slice(0, maxLength);
}

function escapeHTMLText(value) {
    return safeString(value).replace(/\s+/g, " ").trim();
}

function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function localWeekKey(date = new Date()) {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;

    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);

    return localDateKey(copy);
}

function hashString(input) {
    let hash = 2166136261;

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function deterministicIndex(seed, length) {
    if (!length) {
        return 0;
    }

    return hashString(seed) % length;
}

function isValidHttpUrl(value, allowedHosts) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            allowedHosts.includes(url.hostname)
        );
    } catch {
        return false;
    }
}

function isValidImageUrl(value) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value == null ? "" : String(value);
    }
}

function setStatus(message) {
    setText("statusMessage", message);
}

function showToast(message) {
    const toast = $("toast");

    if (!toast) {
        return;
    }

    toast.textContent = message;
    toast.classList.add("visible");

    if (state.toastTimer) {
        clearTimeout(state.toastTimer);
    }

    state.toastTimer = setTimeout(() => {
        toast.classList.remove("visible");
        state.toastTimer = null;
    }, 3200);
}

function friendlyError(error, fallback) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("401") || message.includes("403")) {
        return "De Bijbelbron heeft geen toegang verleend of de vertaling is niet beschikbaar.";
    }

    if (message.includes("429")) {
        return "De API-limiet is bereikt. Probeer het later opnieuw.";
    }

    if (message.includes("404")) {
        return "Deze tekst of vertaling is niet beschikbaar bij de gekozen bron.";
    }

    if (message.toLowerCase().includes("timeout")) {
        return "De aanvraag duurde te lang. Controleer je verbinding en probeer het opnieuw.";
    }

    return fallback;
}

function hasChromeStorage() {
    return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function storageGet(key, fallbackValue) {
    if (hasChromeStorage()) {
        try {
            const result = await chrome.storage.local.get(key);
            return Object.prototype.hasOwnProperty.call(result, key)
                ? result[key]
                : fallbackValue;
        } catch (error) {
            console.warn(`Selah: Chrome-opslag niet beschikbaar voor ${key}; lokale reserveopslag wordt geprobeerd.`, error);
        }
    }

    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallbackValue : JSON.parse(raw);
    } catch (error) {
        console.error(`Selah: lezen uit reserveopslag mislukt (${key}).`, error);
        return fallbackValue;
    }
}

async function storageSet(key, value) {
    if (hasChromeStorage()) {
        try {
            await chrome.storage.local.set({ [key]: value });
            return;
        } catch (error) {
            console.warn(`Selah: Chrome-opslag niet beschikbaar voor ${key}; lokale reserveopslag wordt gebruikt.`, error);
        }
    }

    localStorage.setItem(key, JSON.stringify(value));
}

async function storageRemove(key) {
    if (hasChromeStorage()) {
        try {
            await chrome.storage.local.remove(key);
            return;
        } catch (error) {
            console.warn(`Selah: Chrome-opslag niet beschikbaar voor ${key}; lokale reserveopslag wordt gebruikt.`, error);
        }
    }

    localStorage.removeItem(key);
}

function sanitizeSettings(raw) {
    const source = isObject(raw) ? raw : {};
    const theme = Object.hasOwn(THEMES, source.theme) ? source.theme : "all";
    const frequency = ["daily", "weekly", "fixed"].includes(source.backgroundFrequency)
        ? source.backgroundFrequency
        : "daily";

    return {
        name: safeString(source.name, 60).trim(),
        theme,
        bibleId: safeString(source.bibleId, 100),
        bibleName: safeString(source.bibleName, 200),
        bibleAbbreviation: safeString(source.bibleAbbreviation, 80),
        bibleCopyright: safeString(source.bibleCopyright, 3000),
        bibleLanguage: safeString(source.bibleLanguage, 20),
        reflectionEnabled: source.reflectionEnabled !== false,
        backgroundFrequency: frequency,
    };
}

function sanitizeFavorite(raw) {
    if (!isObject(raw)) {
        return null;
    }

    const text = safeString(raw.text, 10000).trim();
    const reference = safeString(raw.reference, 300).trim();

    if (!text || !reference) {
        return null;
    }

    const id = safeString(raw.id, 200) || createFavoriteId({
        text,
        reference,
        bibleId: safeString(raw.bibleId, 100)
    });

    return {
        id,
        text,
        reference,
        reflection: safeString(raw.reflection, 2000),
        themes: Array.isArray(raw.themes)
            ? raw.themes.filter((theme) => Object.hasOwn(THEMES, theme))
            : [],
        bibleId: safeString(raw.bibleId, 100),
        bibleName: safeString(raw.bibleName, 200),
        translation: safeString(raw.translation, 100),
        copyright: safeString(raw.copyright, 3000),
        source: raw.source === "api" ? "api" : "offline",
        note: safeString(raw.note, 3000),
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    };
}

function createFavoriteId(verse) {
    const identity = [
        safeString(verse.bibleId, 100),
        safeString(verse.reference, 300).toLowerCase(),
        safeString(verse.text, 10000).toLowerCase()
    ].join("|");

    return `fav-${hashString(identity).toString(16)}-${identity.length}`;
}

function makeVerseKey(bibleId, verseId) {
    return `${safeString(bibleId, 100)}::${safeString(verseId, 100)}`;
}

function getCurrentBibleName() {
    return state.settings.bibleName || "Geselecteerde Bijbel";
}

function getCurrentTranslationLabel() {
    if (state.currentSource === "offline") {
        return "Offline voorbeeldtekst — vertaling niet geverifieerd";
    }

    return getCurrentBibleName();
}

function getCurrentCopyright() {
    if (state.currentSource === "offline") {
        return "Offline voorbeeldtekst; geen geverifieerd citaat uit de geselecteerde vertaling.";
    }

    return state.currentVerse?.copyright || state.settings.bibleCopyright || "";
}

function getThemeLabel(theme = state.settings.theme) {
    return THEMES[theme] || THEMES.all;
}

function getCandidatesForTheme(theme) {
    if (theme === "all") {
        return [...VERSE_CATALOG];
    }

    const filtered = VERSE_CATALOG.filter((verse) =>
        verse.themes.includes(theme)
    );

    return filtered.length ? filtered : [...VERSE_CATALOG];
}

function makeDailySeed() {
    return [
        localDateKey(),
        state.settings.theme,
        state.settings.bibleId || "offline"
    ].join("|");
}

function chooseDailyCatalogVerse(offset = 0) {
    const candidates = getCandidatesForTheme(state.settings.theme);
    const index = deterministicIndex(makeDailySeed(), candidates.length);

    return candidates[(index + offset + candidates.length) % candidates.length];
}

async function loadOfflineVerses() {
    try {
        const response = await fetch(chrome.runtime.getURL("offline-verses.json"), {
            cache: "no-store"
        });
        if (!response.ok) throw new Error(`offline-verses.json: HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("offline-verses.json bevat geen teksten.");
        }
        OFFLINE_VERSES = data.filter((item) =>
            item && typeof item.text === "string" &&
            typeof item.reference === "string" &&
            typeof item.reflection === "string" &&
            Array.isArray(item.themes)
        );
        if (!OFFLINE_VERSES.length) throw new Error("Geen geldige offline teksten gevonden.");
    } catch (error) {
        console.error("Selah: offline-verses.json kon niet worden geladen.", error);
        OFFLINE_VERSES = [{
            text: "Neem even de tijd om stil te worden en adem rustig in.",
            reference: "Moment van stilte",
            reflection: "Wat zou je vandaag aan God willen toevertrouwen?",
            themes: ["trust", "peace", "prayer"]
        }];
    }
}

function getOfflineCandidates() {
    if (state.settings.theme === "all") {
        return [...OFFLINE_VERSES];
    }

    const filtered = OFFLINE_VERSES.filter((verse) =>
        verse.themes.includes(state.settings.theme)
    );

    return filtered.length ? filtered : [...OFFLINE_VERSES];
}

function chooseOfflineVerse(offset = 0) {
    const candidates = getOfflineCandidates();
    const index = deterministicIndex(makeDailySeed(), candidates.length);

    return candidates[(index + offset + candidates.length) % candidates.length];
}

function normalizeHelloaoVerse(chapterData, catalogVerse, translation, verseNumber) {
    if (!isObject(chapterData) || !isObject(chapterData.chapter) ||
        !Array.isArray(chapterData.chapter.content)) {
        throw new Error("HelloAO gaf geen geldig hoofdstuk terug.");
    }
    const item = chapterData.chapter.content.find((part) =>
        part && part.type === "verse" && Number(part.number) === Number(verseNumber)
    );
    if (!item) throw new Error("Dit vers is niet beschikbaar in de gekozen vertaling.");
    const text = typeof item.text === "string" ? item.text :
        Array.isArray(item.content)
            ? item.content.map((part) => typeof part === "string" ? part : (part?.text || "")).join("")
            : "";
    if (!text.trim()) throw new Error("HelloAO gaf geen tekst voor dit vers terug.");
    return {
        id: catalogVerse.id, text: text.trim(), reference: catalogVerse.reference,
        reflection: catalogVerse.reflection, themes: [...catalogVerse.themes],
        bibleId: translation.id, bibleName: translation.name,
        translation: translation.abbreviation || translation.id,
        copyright: translation.copyright || translation.license || "",
        source: "api"
    };
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response;
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error("timeout");
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchHelloaoJson(path) {
    const response = await fetchWithTimeout(`${HELLOAO_API_BASE}/${path}`, {
        method: "GET", headers: { "Accept": "application/json" }, cache: "no-store"
    });
    return response.json();
}

async function getVerseCache() {
    const cache = await storageGet(STORAGE_KEYS.verseCache, {});
    return isObject(cache) ? cache : {};
}

async function getCachedVerse(cacheKey) {
    const cache = await getVerseCache();
    const entry = cache[cacheKey];

    if (!isObject(entry) || !Number.isFinite(entry.savedAt)) {
        return null;
    }

    if (Date.now() - entry.savedAt > VERSE_CACHE_TTL) {
        return null;
    }

    const verse = sanitizeCachedVerse(entry.verse);

    return verse;
}

function sanitizeCachedVerse(raw) {
    if (!isObject(raw)) {
        return null;
    }

    const text = safeString(raw.text, 10000).trim();
    const reference = safeString(raw.reference, 300).trim();

    if (!text || !reference || raw.source !== "api") {
        return null;
    }

    return {
        id: safeString(raw.id, 100),
        text,
        reference,
        reflection: safeString(raw.reflection, 2000),
        themes: Array.isArray(raw.themes)
            ? raw.themes.filter((theme) => Object.hasOwn(THEMES, theme))
            : [],
        bibleId: safeString(raw.bibleId, 100),
        bibleName: safeString(raw.bibleName, 200),
        translation: safeString(raw.translation, 100),
        copyright: safeString(raw.copyright, 3000),
        source: "api"
    };
}

async function saveVerseCache(cacheKey, verse) {
    /*
     * Lokale caching is beperkt tot 24 uur. Dit is geen vervanging
     * voor de licentievoorwaarden van de specifieke vertaling.
     * Gebruik een vertaling alleen wanneer de licentie dit toestaat.
     */
    const cache = await getVerseCache();
    const now = Date.now();

    for (const [key, entry] of Object.entries(cache)) {
        if (!isObject(entry) || !Number.isFinite(entry.savedAt)) {
            delete cache[key];
            continue;
        }

        if (now - entry.savedAt > VERSE_CACHE_TTL) {
            delete cache[key];
        }
    }

    cache[cacheKey] = {
        savedAt: now,
        verse
    };

    const entries = Object.entries(cache)
        .sort((a, b) => b[1].savedAt - a[1].savedAt)
        .slice(0, 40);

    const trimmedCache = Object.fromEntries(entries);

    await storageSet(STORAGE_KEYS.verseCache, trimmedCache);
}

async function fetchApiVerse(catalogVerse) {
    const translationId = state.settings.bibleId;
    if (!translationId) throw new Error("Kies eerst een Bijbelvertaling.");
    const cacheKey = makeVerseKey(translationId, catalogVerse.id);
    const cached = await getCachedVerse(cacheKey);
    if (cached) return cached;
    const match = /^([A-Z0-9]+)\.(\d+)\.(\d+)$/.exec(catalogVerse.id);
    if (!match) throw new Error("De versverwijzing heeft een ongeldig formaat.");
    const [, bookId, chapterNumber, verseNumber] = match;
    const path = `${encodeURIComponent(translationId)}/${encodeURIComponent(bookId)}/${chapterNumber}.json`;
    const result = await fetchHelloaoJson(path);
    const translation = {
        id: translationId, name: state.settings.bibleName || translationId,
        abbreviation: state.settings.bibleAbbreviation,
        copyright: state.settings.bibleCopyright
    };
    const verse = normalizeHelloaoVerse(result, catalogVerse, translation, verseNumber);
    await saveVerseCache(cacheKey, verse);
    return verse;
}

async function loadVerseWithFallback(catalogVerse) {
    if (state.settings.bibleId) {
        try {
            return { verse: await fetchApiVerse(catalogVerse), source: "api", message: "" };
        } catch (error) {
            console.warn("Selah: HelloAO-tekst kon niet worden geladen.", error);
            const cached = await getCachedVerse(makeVerseKey(state.settings.bibleId, catalogVerse.id));
            if (cached) return {
                verse: cached, source: "api",
                message: "De laatst beschikbare tekst uit de cache wordt getoond."
            };
            return {
                verse: null, source: "offline",
                message: friendlyError(error, "De Bijbelbron is tijdelijk niet beschikbaar. De offline voorbeeldtekst wordt getoond.")
            };
        }
    }
    return {
        verse: null, source: "offline",
        message: "Kies een Bijbelvertaling in de instellingen om teksten via Bible.helloao.org te laden."
    };
}

function renderVerse(verse, source, message = "") {
    state.currentVerse = verse;
    state.currentSource = source;
    state.currentVerseKey = verse
        ? makeVerseKey(verse.bibleId || "offline", verse.id || verse.reference)
        : "";
    state.currentFavoriteId = null;

    $("verseText").textContent = verse?.text || "Er is nog geen tekst beschikbaar.";
    $("verseReference").textContent = verse?.reference || "";
    $("verseTranslation").textContent = verse
        ? getCurrentTranslationLabel()
        : "";

    $("verseCopyright").textContent = verse ? getCurrentCopyright() : "";

    const reflectionContainer = $("reflectionContainer");
    const reflectionVisible =
        Boolean(verse?.reflection) && state.settings.reflectionEnabled;

    reflectionContainer.hidden = !reflectionVisible;
    $("reflectionText").textContent = verse?.reflection || "";

    setText("currentTheme", getThemeLabel());
    setStatus(message);

    updateFavoriteButton();
}

function updateFavoriteButton() {
    const button = $("favoriteVerseButton");
    const label = $("favoriteButtonLabel");

    if (!state.currentVerse) {
        button.disabled = true;
        button.setAttribute("aria-pressed", "false");
        label.textContent = "❤️";
        state.currentVerseIsFavorite = false;
        return;
    }

    const favoriteId = createFavoriteId({
        text: state.currentVerse.text,
        reference: state.currentVerse.reference,
        bibleId: state.currentVerse.bibleId || ""
    });

    const existing = state.favorites.find((favorite) =>
        favorite.id === favoriteId ||
        (
            favorite.text === state.currentVerse.text &&
            favorite.reference === state.currentVerse.reference &&
            favorite.bibleId === (state.currentVerse.bibleId || "")
        )
    );

    state.currentFavoriteId = existing?.id || null;
    state.currentVerseIsFavorite = Boolean(existing);

    button.disabled = false;
    button.setAttribute("aria-pressed", String(Boolean(existing)));
    label.textContent = existing ?  "❤️" : "🩶";
}

async function showVerse(offset = 0) {
    const catalogVerse = chooseDailyCatalogVerse(offset);

    setText("verseText", "Even een moment van rust...");
    setText("verseReference", "");
    setText("verseTranslation", "");
    setText("verseCopyright", "");
    setStatus("Een tekst ophalen...");

    const result = await loadVerseWithFallback(catalogVerse);

    if (result.verse) {
        renderVerse(result.verse, result.source, result.message);
        return;
    }

    const offline = chooseOfflineVerse(offset);

    renderVerse(
        {
            ...offline,
            id: `offline-${offline.reference}`,
            bibleId: "",
            bibleName: "",
            translation: "Offline voorbeeldtekst",
            copyright: "",
            source: "offline"
        },
        "offline",
        result.message
    );
}

async function showNextVerse() {
    state.manualVerseOffset += 1;

    const candidates = getCandidatesForTheme(state.settings.theme);

    if (state.manualVerseOffset >= candidates.length) {
        state.manualVerseOffset = 0;
    }

    const selected = chooseDailyCatalogVerse(state.manualVerseOffset);
    const result = await loadVerseWithFallback(selected);

    if (result.verse) {
        renderVerse(result.verse, result.source, result.message);
        return;
    }

    const offline = chooseOfflineVerse(state.manualVerseOffset);

    renderVerse(
        {
            ...offline,
            id: `offline-${offline.reference}`,
            bibleId: "",
            bibleName: "",
            translation: "Offline voorbeeldtekst",
            copyright: "",
            source: "offline"
        },
        "offline",
        result.message
    );
}

function updateClock() {
    const now = new Date();

    setText(
        "clock",
        new Intl.DateTimeFormat("nl-NL", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).format(now)
    );

    setText(
        "date",
        new Intl.DateTimeFormat("nl-NL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(now)
    );

    const hour = now.getHours();
    let greeting = "Welkom";

    if (hour >= 5 && hour < 12) {
        greeting = "Goedemorgen";
    } else if (hour >= 12 && hour < 18) {
        greeting = "Goedemiddag";
    } else if (hour >= 18 && hour < 23) {
        greeting = "Goedenavond";
    } else {
        greeting = "Een rustige nacht";
    }

    const name = state.settings.name.trim();
    setText("greeting", name ? `${greeting}, ${name}.` : `${greeting}.`);
}

function fillSettingsForm() {
    $("userName").value = state.settings.name;
    $("themeSelect").value = state.settings.theme;
    $("backgroundFrequency").value = state.settings.backgroundFrequency;
    $("reflectionEnabled").checked = state.settings.reflectionEnabled;

    if (state.settings.bibleId) {
        const select = $("translationSelect");
        const existingOption = [...select.options].find(
            (option) => option.value === state.settings.bibleId
        );

        if (!existingOption) {
            const option = document.createElement("option");
            option.value = state.settings.bibleId;
            option.textContent = state.settings.bibleName || state.settings.bibleId;
            select.appendChild(option);
        }

        select.value = state.settings.bibleId;
    } else {
        $("translationSelect").value = "";
    }
}

function getSettingsFormValues() {
    const selectedOption = $("translationSelect").selectedOptions[0];

    return sanitizeSettings({
        name: $("userName").value,
        theme: $("themeSelect").value,
        bibleId: $("translationSelect").value,
        bibleName: selectedOption?.dataset.name ||
            (selectedOption?.value === state.settings.bibleId
                ? state.settings.bibleName
                : ""),
        bibleAbbreviation: selectedOption?.dataset.abbreviation ||
            (selectedOption?.value === state.settings.bibleId
                ? state.settings.bibleAbbreviation
                : ""),
        bibleCopyright: selectedOption?.dataset.copyright ||
            (selectedOption?.value === state.settings.bibleId
                ? state.settings.bibleCopyright
                : ""),
        bibleLanguage: selectedOption?.dataset.language ||
            (selectedOption?.value === state.settings.bibleId
                ? state.settings.bibleLanguage
                : ""),
        reflectionEnabled: $("reflectionEnabled").checked,
        backgroundFrequency: $("backgroundFrequency").value,
    });
}

async function saveSettings(event) {
    event.preventDefault();

    const oldSettings = { ...state.settings };
    const newSettings = getSettingsFormValues();

    state.settings = newSettings;

    try {
        await storageSet(STORAGE_KEYS.settings, newSettings);

        setText("settingsMessage", "Instellingen bewaard.");
        showToast("Je instellingen zijn bewaard.");

        updateClock();
        setText("currentTheme", getThemeLabel());

        if (
            oldSettings.theme !== newSettings.theme ||
            oldSettings.bibleId !== newSettings.bibleId
        ) {
            state.manualVerseOffset = 0;
            await showVerse(0);
        } else if (
            oldSettings.reflectionEnabled !== newSettings.reflectionEnabled
        ) {
            if ($("reflectionContainer")) {
                $("reflectionContainer").hidden =
                    !newSettings.reflectionEnabled ||
                    !Boolean(state.currentVerse?.reflection);
            }
        }

        if (
            oldSettings.backgroundFrequency !== newSettings.backgroundFrequency
        ) {
            await loadBackground({ force: false });
        }

        closePanel();
    } catch (error) {
        console.error("Selah: instellingen konden niet worden opgeslagen.", error);
        state.settings = oldSettings;
        setText(
            "settingsMessage",
            "Opslaan is niet gelukt. Controleer de extensieopslag en probeer opnieuw."
        );
    }
}

async function loadTranslations(options = {}) {
    const force = options.force === true;
    const status = $("translationStatus");
    const button = $("loadTranslationsButton");
    const now = Date.now();
    if (!force && now - state.lastTranslationRequestAt < 3000) {
        status.textContent = "Wacht even voordat je opnieuw vertalingen ophaalt.";
        return;
    }
    state.lastTranslationRequestAt = now;
    button.disabled = true;
    status.textContent = "Beschikbare vertalingen ophalen via HelloAO...";
    try {
        if (!force) {
            const cached = await storageGet(STORAGE_KEYS.translationsCache, null);
            if (isObject(cached) && Array.isArray(cached.items) &&
                Date.now() - cached.savedAt < TRANSLATIONS_CACHE_TTL) {
                state.translations = cached.items;
                renderTranslationOptions();
                status.textContent = `${state.translations.length} vertalingen geladen uit de cache.`;
                return;
            }
        }
        const result = await fetchHelloaoJson("available_translations.json");
        const rawItems = Array.isArray(result) ? result :
            (Array.isArray(result.translations) ? result.translations :
            (Array.isArray(result.data) ? result.data : null));
        if (!rawItems) throw new Error("HelloAO gaf geen lijst met vertalingen terug.");
        const items = rawItems.filter((item) => isObject(item) && typeof item.id === "string")
            .map((item) => ({
                id: safeString(item.id, 100),
                name: safeString(item.name || item.englishName || item.id, 200),
                abbreviation: safeString(item.abbreviation || item.shortName || "", 80),
                copyright: safeString(item.copyright || item.license || item.licenseUrl || "", 3000),
                language: safeString(item.language || item.languageCode || "", 30)
            })).sort((a, b) => a.name.localeCompare(b.name, "nl"));
        state.translations = items;
        renderTranslationOptions();
        await storageSet(STORAGE_KEYS.translationsCache, { savedAt: Date.now(), items });
        status.textContent = items.length
            ? `${items.length} vertalingen beschikbaar. Kies bij voorkeur een Nederlandse vertaling.`
            : "Geen vertalingen gevonden.";
    } catch (error) {
        console.error("Selah: HelloAO-vertalingen ophalen mislukt.", error);
        status.textContent = friendlyError(error, "Vertalingen ophalen is niet gelukt. Controleer je verbinding.");
    } finally {
        button.disabled = false;
    }
}

function renderTranslationOptions() {
    const select = $("translationSelect");
    const previousValue = select.value || state.settings.bibleId;
    select.replaceChildren();
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Selecteer een vertaling";
    select.appendChild(emptyOption);
    for (const translation of state.translations) {
        const option = document.createElement("option");
        option.value = translation.id;
        option.textContent = translation.abbreviation
            ? `${translation.name} (${translation.abbreviation})` : translation.name;
        option.dataset.name = translation.name;
        option.dataset.abbreviation = translation.abbreviation;
        option.dataset.copyright = translation.copyright;
        option.dataset.language = translation.language;
        select.appendChild(option);
    }
    if (previousValue && ![...select.options].some((option) => option.value === previousValue)
        && state.settings.bibleId) {
        const option = document.createElement("option");
        option.value = state.settings.bibleId;
        option.textContent = state.settings.bibleName || state.settings.bibleId;
        option.dataset.name = state.settings.bibleName;
        option.dataset.abbreviation = state.settings.bibleAbbreviation;
        option.dataset.copyright = state.settings.bibleCopyright;
        option.dataset.language = state.settings.bibleLanguage;
        select.appendChild(option);
    }
    if (previousValue) select.value = previousValue;
}

function openPanel(panelName) {
    const panels = {
        settings: $("settingsPanel"),
        favorites: $("favoritesPanel")
    };

    const target = panels[panelName];

    if (!target) {
        return;
    }

    for (const [name, panel] of Object.entries(panels)) {
        const isActive = name === panelName;

        panel.classList.toggle("open", isActive);
        panel.setAttribute("aria-hidden", String(!isActive));
        panel.inert = !isActive;
    }

    $("panelBackdrop").hidden = false;
    state.activePanel = panelName;

    if (panelName === "settings") {
        fillSettingsForm();
        setText("settingsMessage", "");
        $("closeSettingsButton").focus();
    } else {
        renderFavorites();
        $("favoriteSearch").focus();
    }
}

function closePanel() {
    $("settingsPanel").classList.remove("open");
    $("settingsPanel").setAttribute("aria-hidden", "true");
    $("settingsPanel").inert = true;

    $("favoritesPanel").classList.remove("open");
    $("favoritesPanel").setAttribute("aria-hidden", "true");
    $("favoritesPanel").inert = true;

    $("panelBackdrop").hidden = true;
    state.activePanel = null;
}

async function loadFavorites() {
    const raw = await storageGet(STORAGE_KEYS.favorites, []);

    state.favorites = Array.isArray(raw)
        ? raw.map(sanitizeFavorite).filter(Boolean)
        : [];

    /*
     * Repareer oude of dubbele records zonder de notities te verliezen.
     */
    const seen = new Set();

    state.favorites = state.favorites.filter((favorite) => {
        const key = [
            favorite.bibleId,
            favorite.reference.toLowerCase(),
            favorite.text.toLowerCase()
        ].join("|");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

async function persistFavorites() {
    await storageSet(STORAGE_KEYS.favorites, state.favorites);
}

async function toggleFavorite() {
    if (!state.currentVerse) {
        return;
    }

    const verse = state.currentVerse;
    const identity = createFavoriteId({
        text: verse.text,
        reference: verse.reference,
        bibleId: verse.bibleId || ""
    });

    const existingIndex = state.favorites.findIndex((favorite) =>
        favorite.id === identity ||
        (
            favorite.text === verse.text &&
            favorite.reference === verse.reference &&
            favorite.bibleId === (verse.bibleId || "")
        )
    );

    if (existingIndex >= 0) {
        state.favorites.splice(existingIndex, 1);

        try {
            await persistFavorites();
            updateFavoriteButton();
            renderFavorites();
            showToast("Tekst verwijderd uit je favorieten.");
        } catch (error) {
            console.error("Selah: favoriet verwijderen mislukt.", error);
            await loadFavorites();
            updateFavoriteButton();
            showToast("Verwijderen is niet gelukt. Probeer het opnieuw.");
        }

        return;
    }

    const favorite = sanitizeFavorite({
        id: identity,
        text: verse.text,
        reference: verse.reference,
        reflection: verse.reflection || "",
        themes: verse.themes || [],
        bibleId: verse.bibleId || "",
        bibleName: verse.bibleName || "",
        translation: getCurrentTranslationLabel(),
        copyright: getCurrentCopyright(),
        source: state.currentSource,
        note: "",
        createdAt: Date.now()
    });

    if (!favorite) {
        showToast("Deze tekst kan niet als favoriet worden opgeslagen.");
        return;
    }

    state.favorites.unshift(favorite);

    try {
        await persistFavorites();
        updateFavoriteButton();
        renderFavorites();
        showToast("Tekst bewaard bij je favorieten.");
    } catch (error) {
        console.error("Selah: favoriet opslaan mislukt.", error);
        await loadFavorites();
        updateFavoriteButton();
        showToast("Opslaan is niet gelukt. Controleer de opslagruimte.");
    }
}

function renderFavorites() {
    const container = $("favoritesList");
    const query = $("favoriteSearch").value.trim().toLocaleLowerCase("nl");

    const filtered = state.favorites.filter((favorite) => {
        const searchable = [
            favorite.text,
            favorite.reference,
            favorite.note,
            favorite.bibleName,
            favorite.translation
        ].join(" ").toLocaleLowerCase("nl");

        return searchable.includes(query);
    });

    setText(
        "favoritesCount",
        `${filtered.length} ${filtered.length === 1 ? "favoriet" : "favorieten"}`
    );

    container.replaceChildren();

    if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = query
            ? "Geen teksten gevonden. Probeer een andere zoekterm."
            : "Je hebt nog geen favoriete teksten. Bewaar een tekst om deze hier terug te vinden.";
        container.appendChild(empty);
        return;
    }

    for (const favorite of filtered) {
        const card = document.createElement("article");
        card.className = "favorite-card";

        const text = document.createElement("p");
        text.className = "favorite-card-text";
        text.textContent = favorite.text;

        const reference = document.createElement("p");
        reference.className = "favorite-card-reference";
        reference.textContent = favorite.reference;

        const meta = document.createElement("p");
        meta.className = "favorite-card-meta";
        meta.textContent = [
            favorite.translation || favorite.bibleName,
            favorite.source === "offline"
                ? "Offline voorbeeldtekst — vertaling niet geverifieerd"
                : ""
        ].filter(Boolean).join(" · ");

        card.append(text, reference);

        if (meta.textContent) {
            card.appendChild(meta);
        }

        if (favorite.note) {
            const note = document.createElement("p");
            note.className = "favorite-card-note";
            note.textContent = `Notitie: ${favorite.note}`;
            card.appendChild(note);
        }

        const actions = document.createElement("div");
        actions.className = "favorite-card-actions";

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.textContent = "Open tekst";
        openButton.addEventListener("click", () => openFavorite(favorite.id));

        const noteButton = document.createElement("button");
        noteButton.type = "button";
        noteButton.textContent = favorite.note ? "Notitie bewerken" : "Notitie toevoegen";
        noteButton.addEventListener("click", () => openNoteDialog(favorite.id));

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "Verwijderen";
        removeButton.addEventListener("click", () => removeFavorite(favorite.id));

        actions.append(openButton, noteButton, removeButton);
        card.appendChild(actions);
        container.appendChild(card);
    }
}

function openFavorite(favoriteId) {
    const favorite = state.favorites.find((item) => item.id === favoriteId);

    if (!favorite) {
        showToast("Deze favoriet is niet meer beschikbaar.");
        return;
    }

    const source = favorite.source === "api" ? "api" : "offline";

    renderVerse(
        {
            id: favorite.id,
            text: favorite.text,
            reference: favorite.reference,
            reflection: favorite.reflection,
            themes: favorite.themes,
            bibleId: favorite.bibleId,
            bibleName: favorite.bibleName,
            translation: favorite.translation,
            copyright: favorite.copyright,
            source
        },
        source,
        favorite.note ? `Je notitie: ${favorite.note}` : ""
    );

    closePanel();
}

async function removeFavorite(favoriteId) {
    const index = state.favorites.findIndex((favorite) =>
        favorite.id === favoriteId
    );

    if (index < 0) {
        return;
    }

    const removed = state.favorites.splice(index, 1)[0];

    try {
        await persistFavorites();
        updateFavoriteButton();
        renderFavorites();
        showToast("Favoriet verwijderd.");
    } catch (error) {
        console.error("Selah: favoriet verwijderen mislukt.", error);
        state.favorites.splice(index, 0, removed);
        renderFavorites();
        showToast("Verwijderen is niet gelukt. Probeer opnieuw.");
    }
}

function openNoteDialog(favoriteId) {
    const favorite = state.favorites.find((item) => item.id === favoriteId);

    if (!favorite) {
        showToast("Deze favoriet is niet meer beschikbaar.");
        return;
    }

    state.noteFavoriteId = favoriteId;

    setText("noteVerseReference", favorite.reference);
    setText("noteVerseText", favorite.text);
    $("noteInput").value = favorite.note;
    setText("noteMessage", "");

    const dialog = $("noteDialog");

    if (!dialog.open) {
        dialog.showModal();
    }

    $("noteInput").focus();
}

function closeNoteDialog() {
    const dialog = $("noteDialog");

    if (dialog.open) {
        dialog.close();
    }

    state.noteFavoriteId = null;
}

async function saveNote(event) {
    event.preventDefault();

    const favorite = state.favorites.find(
        (item) => item.id === state.noteFavoriteId
    );

    if (!favorite) {
        setText("noteMessage", "De bijbehorende favoriet is niet gevonden.");
        return;
    }

    const previousNote = favorite.note;
    favorite.note = safeString($("noteInput").value, 3000).trim();

    try {
        await persistFavorites();
        renderFavorites();
        closeNoteDialog();
        showToast("Je notitie is bewaard.");
    } catch (error) {
        favorite.note = previousNote;
        console.error("Selah: notitie opslaan mislukt.", error);
        setText(
            "noteMessage",
            "Notitie opslaan is niet gelukt. Probeer het opnieuw."
        );
    }
}

function makeBackgroundCacheKey() {
    const frequency = state.settings.backgroundFrequency;

    if (frequency === "fixed") {
        return "fixed";
    }

    if (frequency === "weekly") {
        return `week-${localWeekKey()}`;
    }

    return `day-${localDateKey()}`;
}

async function getBackgroundCache() {
    const cache = await storageGet(STORAGE_KEYS.backgroundCache, {});
    return isObject(cache) ? cache : {};
}

function makeFallbackBackgroundEntry() {
    return {
        url: "",
        photographer: "",
        photographerUrl: "",
        photoUrl: "",
        license: "",
        licenseUrl: "",
        title: "",
        source: "fallback",
        savedAt: Date.now()
    };
}

function sanitizeBackgroundEntry(raw) {
    if (!isObject(raw)) {
        return null;
    }

    const isFallback = raw.source === "fallback";

    if (!isFallback && !isValidImageUrl(raw.url)) {
        return null;
    }

    return {
        url: isFallback ? "" : raw.url,
        photographer: safeString(raw.photographer, 200),
        photographerUrl: isValidHttpUrl(raw.photographerUrl, [
            new URL(raw.photographerUrl || "https://invalid.example").hostname
        ]) ? raw.photographerUrl : "",
        photoUrl: isValidImageUrl(raw.photoUrl) ? raw.photoUrl : "",
        license: safeString(raw.license, 100),
        licenseUrl: isValidImageUrl(raw.licenseUrl) ? raw.licenseUrl : "",
        title: safeString(raw.title, 300),
        source: isFallback ? "fallback" : "openverse",
        savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : 0
    };
}

async function getCachedBackground(force = false) {
    const cache = await getBackgroundCache();
    const cacheKey = makeBackgroundCacheKey();
    const entry = sanitizeBackgroundEntry(cache[cacheKey]);

    if (!entry) {
        return null;
    }

    if (force) {
        return null;
    }

    if (
        entry.source === "openverse" &&
        Date.now() - entry.savedAt > BACKGROUND_CACHE_TTL
    ) {
        return null;
    }

    return entry;
}

function renderBackgroundCredit(entry) {
    const container = $("backgroundCredit");
    container.replaceChildren();

    if (entry.source !== "openverse") {
        container.textContent =
            "Neem even de tijd om stil te worden.";
        return;
    }

    const addLink = (label, url) => {
        if (!url || !isValidImageUrl(url)) {
            return;
        }

        if (container.childNodes.length) {
            container.appendChild(document.createTextNode(" · "));
        }

        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        container.appendChild(link);
    };

    if (entry.title) {
        container.appendChild(document.createTextNode(entry.title));
    }

    if (entry.photographer) {
        if (container.childNodes.length) {
            container.appendChild(document.createTextNode(" · "));
        }

        container.appendChild(
            document.createTextNode(`Foto: ${entry.photographer}`)
        );
    }

    addLink("Bron", entry.photoUrl);
    addLink(
        entry.license || "Licentie",
        entry.licenseUrl
    );

    if (!container.childNodes.length) {
        container.textContent = "Foto via Openverse.";
    }
}

function applyBackground(entry) {
    const safeEntry = sanitizeBackgroundEntry(entry) ||
        makeFallbackBackgroundEntry();

    const background = $("background");

    if (!safeEntry.url) {
        background.style.backgroundImage = "none";
        background.style.backgroundColor = "#263b35";
        renderBackgroundCredit(safeEntry);
        return;
    }

    const image = new Image();

    image.onload = () => {
        background.style.backgroundImage =
            `url("${safeEntry.url.replace(/["\\\n\r]/g, "")}")`;
        background.style.backgroundColor = "#263b35";
        renderBackgroundCredit(safeEntry);
    };

    image.onerror = () => {
        applyBackground(makeFallbackBackgroundEntry());
    };

    image.src = safeEntry.url;
}

async function saveBackgroundCache(entry) {
    const cache = await getBackgroundCache();
    const cacheKey = makeBackgroundCacheKey();

    cache[cacheKey] = {
        ...entry,
        savedAt: Date.now()
    };

    const keys = Object.keys(cache);

    if (keys.length > 20) {
        const entries = Object.entries(cache)
            .sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0))
            .slice(0, 20);

        await storageSet(STORAGE_KEYS.backgroundCache, Object.fromEntries(entries));
        return;
    }

    await storageSet(STORAGE_KEYS.backgroundCache, cache);
}

async function fetchOpenverseBackground() {
    const url = new URL(`${OPENVERSE_API_BASE}/images/`);

    url.searchParams.set("q", "nature landscape");
    url.searchParams.set("category", "photograph");
    url.searchParams.set("aspect_ratio", "wide");
    url.searchParams.set("page_size", "20");
    url.searchParams.set("page", "1");
    url.searchParams.set("mature", "false");
    url.searchParams.set("filter_dead", "true");

    const response = await fetchWithTimeout(url.toString(), {
        method: "GET",
        headers: {
            "Accept": "application/json"
        },
        cache: "no-store"
    });

    const data = await response.json();

    if (!isObject(data) || !Array.isArray(data.results)) {
        throw new Error(
            "Openverse gaf geen geldige afbeeldingsresultaten terug."
        );
    }

    const candidates = data.results.filter((item) =>
        isObject(item) &&
        isValidImageUrl(item.url) &&
        isValidImageUrl(item.foreign_landing_url) &&
        typeof item.license === "string" &&
        item.license.trim() !== "" &&
        typeof item.license_url === "string" &&
        isValidImageUrl(item.license_url)
    );

    if (!candidates.length) {
        throw new Error("Geen geschikte foto's gevonden.");
    }

    state.openverseImages = candidates.map((photo) => ({
        url: photo.url,
        title: safeString(photo.title, 300),
        photographer: safeString(photo.creator, 200),
        photographerUrl: isValidImageUrl(photo.creator_url)
            ? photo.creator_url
            : "",
        photoUrl: photo.foreign_landing_url,
        license: safeString(photo.license, 100).toUpperCase(),
        licenseUrl: photo.license_url,
        source: "openverse",
        savedAt: Date.now()
    }));

    return state.openverseImages[0];
}

async function loadBackground(options = {}) {
    const force = options.force === true;

    // Bij handmatig wisselen: kies een andere foto uit de bestaande array.
    if (force && state.openverseImages.length > 1) {
        const previousIndex = state.currentBackgroundIndex;

        let nextIndex = Math.floor(
            Math.random() * state.openverseImages.length
        );

        // Voorkom dat dezelfde foto direct opnieuw gekozen wordt.
        while (nextIndex === previousIndex) {
            nextIndex = Math.floor(
                Math.random() * state.openverseImages.length
            );
        }

        state.currentBackgroundIndex = nextIndex;
        applyBackground(state.openverseImages[nextIndex]);
        return;
    }

    // Gebruik eerst de bestaande cache.
    if (!force) {
        const cached = await getCachedBackground(false);

        if (cached) {
            applyBackground(cached);
            return;
        }
    }

    const button = $("refreshBackgroundButton");
    if (button) button.disabled = true;

    try {
        // Alleen ophalen als de array nog niet gevuld is.
        if (!state.openverseImages.length) {
            await fetchOpenverseBackground();
        }

        if (state.openverseImages.length) {
            state.currentBackgroundIndex = 0;

            const entry = state.openverseImages[0];
            applyBackground(entry);
            await saveBackgroundCache(entry);
        } else {
            applyBackground(makeFallbackBackgroundEntry());
        }
    } catch (error) {
        console.error("Selah: Openverse-afbeeldingen laden mislukt.", error);
        applyBackground(makeFallbackBackgroundEntry());
    } finally {
        if (button) button.disabled = false;
    }
}

function setupEventListeners() {
    $("brandLink").addEventListener("click", (event) => {
        event.preventDefault();
        closePanel();
        closeNoteDialog();
    });

    $("settingsButton").addEventListener("click", () => {
        openPanel("settings");
    });

    $("favoritesButton").addEventListener("click", () => {
        openPanel("favorites");
    });

    $("closeSettingsButton").addEventListener("click", closePanel);
    $("cancelSettingsButton").addEventListener("click", closePanel);
    $("closeFavoritesButton").addEventListener("click", closePanel);

    $("panelBackdrop").addEventListener("click", closePanel);

    $("settingsForm").addEventListener("submit", saveSettings);

    $("loadTranslationsButton").addEventListener("click", () => {
        loadTranslations({ force: true });
    });

    $("themeSelect").addEventListener("change", () => {
        setText("currentTheme", getThemeLabel($("themeSelect").value));
    });

    $("favoriteVerseButton").addEventListener("click", toggleFavorite);

    $("nextVerseButton").addEventListener("click", showNextVerse);

    $("favoriteSearch").addEventListener("input", renderFavorites);

    $("noteForm").addEventListener("submit", saveNote);

    $("closeNoteButton").addEventListener("click", closeNoteDialog);
    $("cancelNoteButton").addEventListener("click", closeNoteDialog);

    $("noteDialog").addEventListener("click", (event) => {
        if (event.target === $("noteDialog")) {
            closeNoteDialog();
        }
    });

    $("refreshBackgroundButton").addEventListener("click", () => {
        loadBackground({ force: true });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePanel();
        }
    });
}

async function loadInitialState() {
    const rawSettings = await storageGet(
        STORAGE_KEYS.settings,
        DEFAULT_SETTINGS
    );

    state.settings = sanitizeSettings(rawSettings);

    await loadFavorites();

    fillSettingsForm();
    updateClock();
    setText("currentTheme", getThemeLabel());

    /*
     * Eerst wordt de beschikbare cache gebruikt; daarna wordt waar
     * nodig de API geraadpleegd. Een fout mag de pagina niet blokkeren.
     */
    await loadBackground({ force: false });

    try {
        await showVerse(0);
    } catch (error) {
        console.error("Selah: initialiseren van de Bijbeltekst mislukt.", error);

        const fallback = chooseOfflineVerse(0);

        renderVerse(
            {
                ...fallback,
                id: `offline-${fallback.reference}`,
                bibleId: "",
                bibleName: "",
                translation: "Offline voorbeeldtekst",
                copyright: "",
                source: "offline"
            },
            "offline",
            "De Bijbeltekst kon niet worden geladen. Je ziet nu een offline voorbeeldtekst."
        );
    }
}

async function init() {
    setupEventListeners();

    try {
        await loadOfflineVerses();
        await loadInitialState();
    } catch (error) {
        console.error("Selah: initialiseren mislukt.", error);

        state.settings = { ...DEFAULT_SETTINGS };
        updateClock();

        const fallback = chooseOfflineVerse(0);

        renderVerse(
            {
                ...fallback,
                id: `offline-${fallback.reference}`,
                bibleId: "",
                bibleName: "",
                translation: "Offline voorbeeldtekst",
                copyright: "",
                source: "offline"
            },
            "offline",
            "Sommige gegevens konden niet worden geladen. De offline modus is actief."
        );

        applyBackground(makeFallbackBackgroundEntry());
    }

    /*
     * De klok heeft geen achtergrondtaken nodig. Een interval volstaat
     * en er wordt maar één interval aangemaakt.
     */
    setInterval(updateClock, 15000);

    /*
     * Werk de opslagstatus bij wanneer instellingen in een andere
     * extensiepagina of een ander tabblad worden gewijzigd.
     */
    if (hasChromeStorage() && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
            return;
        }

        if (changes[STORAGE_KEYS.settings]) {
            state.settings = sanitizeSettings(
                changes[STORAGE_KEYS.settings].newValue
            );

            updateClock();
            setText("currentTheme", getThemeLabel());
        }

        if (changes[STORAGE_KEYS.favorites]) {
            const newValue = changes[STORAGE_KEYS.favorites].newValue;

            state.favorites = Array.isArray(newValue)
                ? newValue.map(sanitizeFavorite).filter(Boolean)
                : [];

            updateFavoriteButton();
            renderFavorites();
        }
      });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => {
        console.error("Selah: onverwachte initialisatiefout.", error);
        setStatus("Er ging iets mis bij het starten. Herlaad dit tabblad.");
    });
});