
# WanderGrid

**The Ultimate Self-Hosted Expedition & Leave Management System.**

WanderGrid is a privacy-focused, full-stack application designed for digital nomads, remote teams, and travel enthusiasts. It seamlessly blends professional leave management policies with high-fidelity travel logistics and gamified exploration tracking.

## 🚀 Key Capabilities

### 🗺️ Immersive Geospatial Intelligence
*   **3D Interactive Globe**: Visualize your travel history and upcoming routes on a stunning 3D earth with Day, Night, and Satellite modes.
*   **Network & Scratch Maps**: Toggle between flight network visualizations (Arc lines) and "scratch-map" style country highlighting.
*   **Smart Geocoding**: Integrated OpenStreetMap/Nominatim support with robust local caching for fast, offline-capable location resolution.

### ✈️ Expedition Logistics Core
*   **Flight Command Center**: Import flight data from CSV/JSON or manual entry. Supports Round-Trip, One-Way, and complex Multi-City itineraries.
*   **Live Flight Tracking**: Real-time status updates via AviationStack integration (Active, Landed, Delayed, Diverted).
*   **Smart Itinerary**: Automatic grouping of individual flight segments into cohesive Trips based on temporal logic and location continuity.
*   **Asset Management**: Track Accommodations (Hotels, Airbnbs) and Activities with detailed budget analysis and per-night cost tracking.

### ⏳ Advanced Time-Off Engine
*   **Granular Policy Engine**: Define custom leave types (Annual, Sick, Sabbatical, Lieu) with specific accrual rules, carry-over logic, and expiry dates.
*   **Fiscal Year Management**: Flexible handling of cross-year leave requests and automated balance initialization for new years.
*   **Visual Calendar**: Drag-and-drop planning view supporting AM/PM splits, custom duration logic, and weekend/holiday masking.
*   **Public Holidays**: Automated import of statutory holidays for 100+ countries via Nager.Date with custom weekend shifting rules.

### 🏆 Gamification & Analytics
*   **Traveler Rank**: Level up from "Backyard Explorer" to "Citizen of the World" based on unique countries visited.
*   **Passport Stamps**: Beautifully rendered digital stamps for every country visited, grouped by region.
*   **Flight Log**: Deep analytics on distance flown, time in air, top airports, favorite airlines, and seat preferences.

## 🛠️ Technical Stack

*   **Frontend**: React 19, TypeScript, Tailwind CSS
*   **Visualization**: React Globe GL, Leaflet, Custom SVG Charts
*   **State & Persistence**: Hybrid Architecture.
    *   **Mode A (Demo)**: Zero-config LocalStorage (MockDB) for instant usage.
    *   **Mode B (Prod)**: Dockerized Node.js/PostgreSQL backend for persistent self-hosting.
*   **Integrations**:
    *   **AviationStack**: Real-time flight data.
    *   **Brandfetch**: Automatic logo retrieval for airlines and hotels.
    *   **OpenStreetMap**: Geocoding and reverse lookup.
    *   **Nager.Date**: Public holiday registry.

## 📦 Deployment

### Rapid Local Demo (No Backend)
1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Start the dev server: `npm start`
4.  The app defaults to **LocalStorage Mode** if the API is unreachable, saving all data to your browser.

### Production Self-Host (Docker)
1.  Configure `backend_files/docker-compose.yml` with your PostgreSQL credentials.
2.  (Optional) Set deployment overrides for NAS installs:
    *   `APP_PORT` to change the host port (e.g., `APP_PORT=6125` maps `6125 -> 3000`).
    *   `POSTGRES_DATA_DIR` to store data outside the repo (e.g., `POSTGRES_DATA_DIR=/volume1/docker/wandergrid`).
3.  Run `docker-compose up -d` inside `backend_files`.
4.  The app will automatically switch to **API Mode** and persist data to the database.

## 🔑 Configuration
Navigate to the **Settings** view to:
*   Set your Workspace currency and theme.
*   Input API Keys for **AviationStack** and **Brandfetch** to unlock live tracking and logos.
*   Manage users, entitlements, and import/export data backups.

---

*Private. Powerful. Yours.*
