# WanderGrid v0.2

A private, self-hosted Vacation & Leave Management System designed for families, digital nomads, and small teams to track expeditions, holidays, and time off with precision and style.

## ✨ Features

### 🧠 AI-Powered Intelligence (Gemini)
- **Smart Autocomplete**: Context-aware destination, hotel, and activity suggestions powered by Google Gemini.
- **Distance Estimation**: Automatic calculation of travel distances (km) between cities or pickup/drop-off points to estimate travel duration.

### 🌍 Dashboard Command Center
- **Visual Overview**: At-a-glance view of team members, leave balances, and consumption via interactive donut charts.
- **Calendar System**: Seamlessly switch between Year, Month, and Week views to visualize schedules.
- **Drag-to-Book**: Intuitive drag-and-drop selection on the calendar to initiate leave requests instantly.
- **Upcoming Intel**: "Next Trip" indicators and countdowns.

### ✈️ Expedition Logistics & Planning
- **Transport Configurator**: Detailed itinerary builder supporting Multi-City, Round Trip, and One-Way journeys. Tracks classes, seat types, and specific flight numbers.
- **Accommodation Tracker**: Manage hotel, Airbnb, or villa stays with automated cost-per-night calculations and check-in/out logic.
- **Route Manager**: Visual timeline of locations during a trip to handle complex multi-leg journeys.
- **Activity Scheduler**: Day-by-day planning for reservations and tours with cost tracking.

### 📅 Advanced Leave Management
- **Flexible Booking**: Support for Full Days, AM/PM Half-Days, and custom start/end splits (e.g., start a trip on Friday PM).
- **Cross-Year Intelligence**: Automatically detects and handles bookings that span across fiscal years, splitting allocations correctly between the two periods.
- **Multi-Category Allocation**: Split a single trip across multiple leave types (e.g., 2 days Annual + 3 days Unpaid) within the same request.
- **Smart Validation**: Real-time checking of balances to prevent overdrafts.
- **Emoji Markers**: Visual icon picker with categories for tagging trips.

### ⚙️ Policy & Rule Engine
- **Custom Entitlements**: Create unlimited leave categories (Annual, Sick, Sabbatical, etc.) with custom color coding.
- **Accrual Logic**: Configure accrual frequencies (Lump Sum, Monthly, Yearly).
- **Carry-Over Rules**: Robust support for carrying over unused days with configurable expiry logic (Fixed Date, Rolling Months, or Permanent).
- **Unlimited Allowance**: Toggle specific categories to bypass balance checks.

### 🔌 External Integrations
- **Nager.Date**: Automated public holiday importation for over 100+ countries.
- **Brandfetch**: Auto-discovery of brand logos for airlines, car rental agencies, and hotels to beautify your itinerary.
- **AviationStack**: Real-time flight schedule lookups to populate departure/arrival times automatically.

### 👥 User & Identity Management
- **Role-Based Access**: Distinguish between Partners (Executive), Children, and Admins.
- **Per-User Configuration**: Unique policy overrides, working patterns, and holiday calendars for each individual.
- **Fiscal Year Management**: Initialize new fiscal years per user, with options to replicate previous protocols.

### 🎨 UI/UX Excellence
- **Glassmorphism Design**: Modern, clean interface with frosted glass effects and refined typography.
- **Theme Engine**: Built-in Light, Dark, and Auto (System) modes.
- **Responsive**: Fluid layout adapting to different screen sizes.

### 💾 Data Sovereignty
- **Self-Hosted Ready**: Designed to run locally.
- **Backup & Restore**: One-click export of the entire database state to JSON for safekeeping or migration.
- **Import**: Restore system state from previous backups.

## 🛠️ Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI**: Google GenAI SDK (Gemini models)
- **Icons**: Material Icons Outlined
- **State/Persistence**: LocalStorage (Mock Service) for instant setup, adaptable to SQLite/Postgres.

## 🚀 Getting Started

1. **Clone & Install**:
   ```bash
   npm install
   ```

2. **Environment Setup**:
   - The app uses `process.env.API_KEY` for Google Gemini features. Ensure this is configured in your build environment.

3. **Run**:
   ```bash
   npm start
   ```

4. **In-App Configuration**:
   - Navigate to **Settings** to configure your Workspace.
   - Add API Keys for **AviationStack** and **Brandfetch** to unlock full logistical features.
