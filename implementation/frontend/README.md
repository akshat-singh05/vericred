# VeriCred console

React 19 + Vite single-page app for the four roles (university, student, employer, consortium member), plus an overview dashboard and a how-it-works page.

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # production bundle in dist/
```

The app talks to the backend at `http://127.0.0.1:4000`. Set `VITE_API_BASE` to point it elsewhere. Start the chain, deploy the contracts and run the backend first (see the [project README](../../README.md#quick-start)).

```
src/
  App.jsx        App shell, navigation, live stats polling
  api.js         Typed wrapper over the backend REST API
  ui.jsx         Design-system components (cards, buttons, badges, guide, toasts, icons)
  context.jsx    Shared app context and constants
  pages/         Overview, Issuer, Holder, Verifier, Governance, HowItWorks
```
