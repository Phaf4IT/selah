import { REQUEST_TIMEOUT_MS } from "./config.js";
import { state } from "./state.js";

export const $ = (id) => document.getElementById(id);

export function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function safeString(value, maxLength = 10000) {
    if (typeof value !== "string") {
        return "";
    }

    return value.slice(0, maxLength);
}

export function escapeHTMLText(value) {
    return safeString(value).replace(/\s+/g, " ").trim();
}

export function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function localWeekKey(date = new Date()) {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;

    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);

    return localDateKey(copy);
}

export function hashString(input) {
    let hash = 2166136261;

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

export function deterministicIndex(seed, length) {
    if (!length) {
        return 0;
    }

    return hashString(seed) % length;
}

export function isValidHttpUrl(value, allowedHosts) {
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

export function isValidImageUrl(value) {
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

export function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value == null ? "" : String(value);
    }
}

export function setStatus(message) {
    setText("statusMessage", message);
}

export function showToast(message) {
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

export function friendlyError(error, fallback) {
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

export async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
