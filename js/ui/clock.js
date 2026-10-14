import { state } from "../state.js";
import { setText } from "../utils.js";

export function updateClock() {
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
