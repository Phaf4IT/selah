import {
    HELLOAO_API_BASE,
    STORAGE_KEYS,
    THEMES,
    VERSE_CACHE_TTL
} from "../config.js";
import { VERSE_CATALOG } from "./catalog.js";
import { saveDailySession, storageGet, storageSet } from "../storage.js";
import { state } from "../state.js";
import {
    $,
    deterministicIndex,
    fetchWithTimeout,
    friendlyError,
    isObject,
    localDateKey,
    safeString,
    setStatus,
    setText
} from "../utils.js";
import { createFavoriteId } from "../favorites/ids.js";

let OFFLINE_VERSES = [];

export function makeVerseKey(bibleId, verseId) {
    return `${safeString(bibleId, 100)}::${safeString(verseId, 100)}`;
}

export function getCurrentBibleName() {
    return state.settings.bibleName || "Geselecteerde Bijbel";
}

export function getCurrentTranslationLabel() {
    if (state.currentSource === "offline") {
        return "Offline voorbeeldtekst — vertaling niet geverifieerd";
    }

    return getCurrentBibleName();
}

export function getCurrentCopyright() {
    if (state.currentSource === "offline") {
        return "Offline voorbeeldtekst; geen geverifieerd citaat uit de geselecteerde vertaling.";
    }

    return state.currentVerse?.copyright || state.settings.bibleCopyright || "";
}

export function getThemeLabel(theme = state.settings.theme) {
    return THEMES[theme] || THEMES.all;
}

export function getCandidatesForTheme(theme) {
    if (theme === "all") {
        return [...VERSE_CATALOG];
    }

    const filtered = VERSE_CATALOG.filter((verse) =>
        verse.themes.includes(theme)
    );

    return filtered.length ? filtered : [...VERSE_CATALOG];
}

export function makeDailySeed() {
    return [
        localDateKey(),
        state.settings.theme,
        state.settings.bibleId || "offline"
    ].join("|");
}

export function chooseDailyCatalogVerse(offset = 0) {
    const candidates = getCandidatesForTheme(state.settings.theme);
    const index = deterministicIndex(makeDailySeed(), candidates.length);

    return candidates[(index + offset + candidates.length) % candidates.length];
}

export async function loadOfflineVerses() {
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

export function getOfflineCandidates() {
    if (state.settings.theme === "all") {
        return [...OFFLINE_VERSES];
    }

    const filtered = OFFLINE_VERSES.filter((verse) =>
        verse.themes.includes(state.settings.theme)
    );

    return filtered.length ? filtered : [...OFFLINE_VERSES];
}

export function chooseOfflineVerse(offset = 0) {
    const candidates = getOfflineCandidates();
    const index = deterministicIndex(makeDailySeed(), candidates.length);

    return candidates[(index + offset + candidates.length) % candidates.length];
}

export function normalizeHelloaoVerse(chapterData, catalogVerse, translation, verseNumber) {
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

export async function fetchHelloaoJson(path) {
    const response = await fetchWithTimeout(`${HELLOAO_API_BASE}/${path}`, {
        method: "GET", headers: { "Accept": "application/json" }, cache: "no-store"
    });
    return response.json();
}

export async function getVerseCache() {
    const cache = await storageGet(STORAGE_KEYS.verseCache, {});
    return isObject(cache) ? cache : {};
}

export async function getCachedVerse(cacheKey) {
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

export function sanitizeCachedVerse(raw) {
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

export async function saveVerseCache(cacheKey, verse) {
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

export async function fetchApiVerse(catalogVerse) {
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

export async function loadVerseWithFallback(catalogVerse) {
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

export function renderVerse(verse, source, message = "") {
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

export function updateFavoriteButton() {
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

export async function showVerse(offset = 0) {
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

export async function showNextVerse() {
    state.manualVerseOffset += 1;

    const candidates = getCandidatesForTheme(state.settings.theme);

    if (state.manualVerseOffset >= candidates.length) {
        state.manualVerseOffset = 0;
    }

    await saveDailySession({ verseOffset: state.manualVerseOffset });

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
