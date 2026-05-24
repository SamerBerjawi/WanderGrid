---
version: alpha
name: Crystal
description: Personal Finance Dashboard visual identity
colors:
  primary: "#fa9a1d"
  primary-50: "#fef8f0"
  primary-100: "#fdeed9"
  primary-200: "#fbddb1"
  primary-300: "#faca89"
  primary-400: "#fcb045"
  primary-500: "#fa9a1d"
  primary-600: "#e78310"
  primary-700: "#c1670e"
  primary-800: "#995111"
  primary-900: "#7d4312"
  semantic-red: "#FF3B30"
  semantic-green: "#34C759"
  semantic-yellow: "#FFCC00"
  semantic-blue: "#007AFF"
  light-bg: "#FAFAFA"
  light-text: "#2D2D2D"
  dark-bg: "#050505"
  dark-text: "#FFFFFF"
typography:
  sans:
    fontFamily: Inter, sans-serif
rounded:
  xl: 16px
spacing:
  sm: 8px
  md: 16px
---

## Overview

The Crystal Personal Finance Dashboard offers a sleek, modern, and data-dense UI for managing financial metrics. It utilizes a striking contrast between bright orange accents and dark mode backgrounds, heavily employing an iOS-style frosted glass interface ("Liquid Glass"). 

## Colors

The application relies on highly visible interaction endpoints and crystal clear status signals.

- **Primary (#FA9A1D):** An energetic orange driving interaction points, representing growth and the flow of capital.
- **Light Theme Framework:** A soft background (`#FAFAFA`) with dark charcoal text (`#2D2D2D`) conveying quiet elegance for daylight usage.
- **Dark Theme Framework:** Near-absolute darkness (`#050505`) with high-contrast bright text (`#FFFFFF`), tailored specifically for power-user financial reviews.
- **Semantic Suite:** Core status reflections (Red: `#FF3B30`, Green: `#34C759`) directly model real-world financial signals and accounting practices.

## Typography

Utilizes **Inter** exclusively across the interface. It brings journalistic and numeric clarity critical for a finance application, retaining highly legible figures in data-rich tables, dashboards, and charts.

## Structure and Geometry

Structure leans away from severe technical layouts, favoring organic material imitations.

- Heavy usage of rounded corners (16px standard limit) and fluid drop-shadows soften the dashboard structure.
- Depth is achieved via `backdrop-filter: blur(5px)` and translucent card bases. Inset shadows replicate a liquid glass rim reflection, providing clean visual separation without demanding harsh borders.
