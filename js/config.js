export const STORAGE_KEYS = Object.freeze({
    settings: "selah.settings.v1",
    favorites: "selah.favorites.v1",
    verseCache: "selah.verseCache.helloao.v1",
    translationsCache: "selah.translationsCache.helloao.v1",
    backgroundCache: "selah.backgroundCache.v1",
    dailySession: "selah.dailySession.v1"
});

export const HELLOAO_API_BASE = "https://bible.helloao.org/api";
export const OPENVERSE_API_BASE = "https://api.openverse.org/v1";

export const VERSE_CACHE_TTL = 24 * 60 * 60 * 1000;
export const TRANSLATIONS_CACHE_TTL = 24 * 60 * 60 * 1000;
export const BACKGROUND_CACHE_TTL = 24 * 60 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 12000;

export const OPENVERSE_QUERIES = Object.freeze([
    "nature landscape",
    "mountain sunrise",
    "forest path",
    "ocean horizon",
    "meadow flowers",
    "quiet lake",
    "rolling hills",
    "sky clouds"
]);

/** Anonymous Openverse requests: page × page_size may not exceed this depth. */
export const OPENVERSE_ANON_MAX_DEPTH = 240;

export const OPENVERSE_PAGE_SIZES = Object.freeze([12, 15, 20]);

/** Extra query slices — each yields a different result ordering/set within the depth cap. */
export const OPENVERSE_LICENSE_VARIANTS = Object.freeze([
    {},
    { license: "cc0" },
    { license: "by" },
    { license_type: "commercial" },
    { license_type: "modification" }
]);

export const THEMES = Object.freeze({
    all: "Alle thema's",
    trust: "Vertrouwen",
    peace: "Vrede en rust",
    gratitude: "Dankbaarheid",
    hope: "Kracht en hoop",
    prayer: "Gebed",
    love: "Liefde en genade"
});

export const DEFAULT_SETTINGS = Object.freeze({
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
