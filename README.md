
# WanderGrid

A private, self-hosted Vacation & Leave Management System designed for families, digital nomads, and small teams to track expeditions, holidays, and time off with precision and style.

## ✨ Features

### 🌍 Dashboard Command Center
- **Visual Overview**: At-a-glance view of team members, leave balances, and consumption via interactive donut charts.
- **Calendar System**: Seamlessly switch between Year, Month, and Week views to visualize schedules.
- **Drag-to-Book**: Intuitive drag-and-drop selection on the calendar to initiate leave requests instantly.
- **Upcoming Intel**: "Next Trip" indicators and countdowns.

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

### 🏖️ Public Holiday Management
- **Global Data**: Integrated with Nager.Date API to fetch statutory holidays for almost any country.
- **Smart Handling**:
  - **Weekend Rules**: Configurable logic for holidays falling on weekends (Forfeit, Move to Next Monday, or Accrue to "In Lieu" balance).
  - **Custom Holidays**: Manually add extra days off (e.g., Company Retreats).
  - **Regional Mix**: Assign different users to different regional calendars (e.g., one user on US holidays, another on UK).

### 👥 User & Identity Management
- **Role-Based Access**: Distinguish between Partners (Executives), Children, and Admins.
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
- **Icons**: Material Icons Outlined
- **State/Persistence**: LocalStorage (Mock Service) for instant setup, adaptable to SQLite/Postgres.


