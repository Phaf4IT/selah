import { STORAGE_KEYS } from "./config.js";
import { isObject, localDateKey } from "./utils.js";

export function hasChromeStorage() {
    return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function storageGet(key, fallbackValue) {
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

export async function storageSet(key, value) {
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

export async function storageRemove(key) {
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

export async function getDailySession() {
    const raw = await storageGet(STORAGE_KEYS.dailySession, {});

    if (!isObject(raw) || raw.dateKey !== localDateKey()) {
        return {
            dateKey: localDateKey(),
            verseOffset: 0,
            backgroundManualOffset: 0
        };
    }

    return {
        dateKey: localDateKey(),
        verseOffset: Math.max(0, Number(raw.verseOffset) || 0),
        backgroundManualOffset: Math.max(0, Number(raw.backgroundManualOffset) || 0)
    };
}

export async function saveDailySession(updates) {
    const session = {
        ...(await getDailySession()),
        ...updates,
        dateKey: localDateKey()
    };

    await storageSet(STORAGE_KEYS.dailySession, session);
    return session;
}
