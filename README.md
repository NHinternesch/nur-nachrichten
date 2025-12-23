# Nur Nachrichten - Regular Web App

A responsive web application for reading news from tagesschau.de RSS feeds.

## Overview

This is a regular responsive web app version of the Nur Nachrichten PWA. It provides the exact same functionality and design, but without Progressive Web App features.

## Features

- **Multiple News Feeds**: Browse news across 5 categories:
  - Alle (All news)
  - Inland (Domestic news)
  - Ausland (International news)
  - Wirtschaft (Economy)
  - Wissen (Science)

- **Responsive Design**: Works seamlessly on mobile and desktop devices
- **Image Support**: Displays article images when available
- **Smart Caching**: Uses localStorage to cache articles for faster loading
- **Auto-refresh**: Background updates when switching between feeds
- **Manual Refresh**: Floating refresh button to force reload current feed
- **Video Filtering**: Automatically filters out video content

## Differences from PWA Version

This regular web app differs from the PWA version in the following ways:

- **No Service Worker**: Removed offline caching via service worker
- **No PWA Manifest**: Removed manifest.json (not installable as PWA)
- **No Mobile App Meta Tags**: Removed apple-mobile-web-app-capable and related meta tags
- **Simplified Caching**: Only uses localStorage for caching (no service worker cache)

## Usage

Simply open `index.html` in a web browser. The app will:
1. Load cached articles immediately if available
2. Fetch fresh articles in the background
3. Allow navigation between different news categories
4. Provide a refresh button for manual updates

## Technical Stack

- Vanilla JavaScript (no frameworks)
- Google Sans font
- RSS feed parsing with DOMParser
- CORS proxy for accessing tagesschau.de feeds
- localStorage for client-side caching

## Browser Compatibility

Works in all modern browsers that support:
- ES6+ JavaScript
- Fetch API
- DOMParser
- localStorage
