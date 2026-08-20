import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts strings or location names into Proper/Title Case.
 * Handles hyphens, slashes, spaces, and preserves uppercase airport codes (e.g., JFK, LAX).
 */
export function toProperCase(str?: string | null): string {
  if (!str) return "";
  return str.replace(/\b([a-zA-Z]+)\b/g, (match) => {
    // Keep standard 3-letter IATA uppercase airport codes intact if all caps
    if (match.length === 3 && match === match.toUpperCase()) {
      return match;
    }
    return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
  });
}

