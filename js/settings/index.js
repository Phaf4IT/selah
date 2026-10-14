import {
    STORAGE_KEYS,
    THEMES,
    TRANSLATIONS_CACHE_TTL
} from "../config.js";
import { loadBackground } from "../background/index.js";
import { saveDailySession, storageGet, storageSet } from "../storage.js";
import { state } from "../state.js";
import {
    $,
    friendlyError,
    isObject,
    safeString,
    setText,
    showToast
} from "../utils.js";
import { fetchHelloaoJson, getThemeLabel, showVerse } from "../verses/index.js";
import { closePanel } from "../ui/dialog.js";
import { updateClock } from "../ui/clock.js";

export function sanitizeSettings(raw) {
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

export function fillSettingsForm() {
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

export function getSettingsFormValues() {
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

export async function saveSettings(event) {
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
            await saveDailySession({ verseOffset: 0 });
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

export async function loadTranslations(options = {}) {
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

export function renderTranslationOptions() {
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
