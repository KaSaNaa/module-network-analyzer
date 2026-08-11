# Network Analysis Module - IDSS

This is a module for the Intelligent Decision Support System (IDSS), built with Webpack Module Federation.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm start
   ```

   The module will run on http://localhost:3003 (see webpack.config.js for port)

## Module Details

- **Exposed Component:** App (from src/App.jsx)
- **Shared Dependencies:** React, React-DOM (singleton)

## Development

The module exposes its App component via Module Federation. The host application will consume this dynamically.

## Build

```bash
npm run build
```

Output will be in the `dist/` directory.
