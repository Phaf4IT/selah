import {
    BACKGROUND_CACHE_TTL,
    OPENVERSE_API_BASE,
    OPENVERSE_MAX_PAGE,
    OPENVERSE_QUERIES,
    STORAGE_KEYS
} from "../config.js";
import { saveDailySession, storageGet, storageSet } from "../storage.js";
import { state } from "../state.js";
import {
    $,
    deterministicIndex,
    fetchWithTimeout,
    isObject,
    isValidHttpUrl,
    isValidImageUrl,
    localDateKey,
    localWeekKey,
    safeString
} from "../utils.js";

export function makeBackgroundCacheKey() {
    const frequency = state.settings.backgroundFrequency;

    if (frequency === "fixed") {
        return "fixed";
    }

    if (frequency === "weekly") {
        return `week-${localWeekKey()}`;
    }

    return `day-${localDateKey()}`;
}

export function makeBackgroundDiscoverySeed(extra = "") {
    return [makeBackgroundCacheKey(), extra].filter(Boolean).join("|");
}

export function mapOpenversePhotoToEntry(photo) {
    return {
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
    };
}

export function pickBackgroundIndexFromPool(length) {
    if (!length) {
        return 0;
    }

    const seed = makeBackgroundDiscoverySeed();
    state.backgroundDailyIndex = deterministicIndex(`${seed}|image`, length);

    return (
        state.backgroundDailyIndex + state.backgroundManualOffset
    ) % length;
}

export async function getBackgroundCache() {
    const cache = await storageGet(STORAGE_KEYS.backgroundCache, {});
    return isObject(cache) ? cache : {};
}

export function makeFallbackBackgroundEntry() {
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

export function sanitizeBackgroundEntry(raw) {
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

export async function getCachedBackground(force = false) {
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

export function renderBackgroundCredit(entry) {
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

export function applyBackground(entry) {
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

export async function saveBackgroundCache(entry) {
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

export async function fetchOpenverseBackground(extraSeed = "") {
    const seed = makeBackgroundDiscoverySeed(extraSeed);
    const query = OPENVERSE_QUERIES[
        deterministicIndex(`${seed}|query`, OPENVERSE_QUERIES.length)
    ];
    const page = 1 + deterministicIndex(`${seed}|page`, OPENVERSE_MAX_PAGE);
    const url = new URL(`${OPENVERSE_API_BASE}/images/`);

    url.searchParams.set("q", query);
    url.searchParams.set("category", "photograph");
    url.searchParams.set("aspect_ratio", "wide");
    url.searchParams.set("page_size", "20");
    url.searchParams.set("page", String(page));
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

    state.openverseImages = candidates.map(mapOpenversePhotoToEntry);

    return state.openverseImages;
}

export async function ensureOpenversePool(extraSeed = "") {
    if (state.openverseImages.length) {
        return state.openverseImages;
    }

    return fetchOpenverseBackground(extraSeed);
}

export async function applyBackgroundFromPool(index) {
    if (!state.openverseImages.length) {
        applyBackground(makeFallbackBackgroundEntry());
        return;
    }

    const safeIndex = (
        index + state.openverseImages.length * 1000
    ) % state.openverseImages.length;

    state.currentBackgroundIndex = safeIndex;

    const entry = state.openverseImages[safeIndex];
    applyBackground(entry);
    await saveBackgroundCache(entry);
}

export async function loadBackground(options = {}) {
    const force = options.force === true;

    if (force) {
        state.backgroundManualOffset += 1;
        await saveDailySession({
            backgroundManualOffset: state.backgroundManualOffset
        });
    }

    if (!force) {
        const cached = await getCachedBackground(false);

        if (cached) {
            applyBackground(cached);

            const cachedIndex = state.openverseImages.findIndex((item) =>
                item.url === cached.url
            );

            if (cachedIndex >= 0) {
                state.currentBackgroundIndex = cachedIndex;
            } else {
                void ensureOpenversePool("").catch((error) => {
                    console.warn(
                        "Selah: achtergrondpool kon niet worden voorbereid.",
                        error
                    );
                });
            }

            return;
        }
    }

    const button = $("refreshBackgroundButton");
    if (button) button.disabled = true;

    try {
        const canReusePool =
            force &&
            state.openverseImages.length > 1;

        if (canReusePool) {
            const pickIndex = pickBackgroundIndexFromPool(
                state.openverseImages.length
            );

            await applyBackgroundFromPool(pickIndex);
            return;
        }

        const extraSeed = force
            ? `manual-${state.backgroundManualOffset}`
            : "";

        if (force) {
            state.openverseImages = [];
        }

        await ensureOpenversePool(extraSeed);

        if (state.openverseImages.length) {
            const pickIndex = pickBackgroundIndexFromPool(
                state.openverseImages.length
            );

            await applyBackgroundFromPool(pickIndex);
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
