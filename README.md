# Poshakh Manager — Canonical Code & Deployment

This repo contains two code paths:

- Canonical production app: `dist/index.html` (single‑file Apple‑style UI, deployed to https://app.poshakhfabrics.com/)
- Legacy/dev scaffold: `src/` (Vite + React components used earlier during migration)

For parity with the live app, edit and deploy from `dist/`. The Firebase Hosting config points to `dist`.

Quick start

1. Install dependencies

```bash
npm install
```

2. Run dev server (for `src/` scaffold)

```bash
npm run dev
```

What’s included
- Vite + React scaffold
- `src/firebase.js` helper that initializes Firebase and exposes `subscribeCollection`
- Basic `Inventory` component that reads `fabrics` collection

Connect to Firebase (for `src/` scaffold)

1. Create a `.env` file at the project root with your Firebase config (these keys are safe to include in client apps):

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
VITE_FIREBASE_APP_ID=your_app_id
```

2. Restart the dev server after creating/updating `.env`:

```bash
npm run dev
```

3. Ensure your Firestore rules allow the operations you need (for quick local testing you can allow reads/writes for authenticated users or anonymous auth). The app signs in anonymously by default.

If you prefer, you can also pass a config object to `initFirebase()` directly — see `src/firebase.js`.

Deploy to Firebase Hosting

- The hosting `public` directory is `dist` (see `firebase.json`).
- If you are editing the single‑file app, deploy directly:

```bash
firebase deploy --only hosting
```

- If you are editing the React scaffold in `src/`, build then deploy:

```bash
npm run build
firebase deploy --only hosting
```

Enable Anonymous Auth and recommended rules (local testing)

1. Console → Authentication → Sign-in method → Enable `Anonymous` and save.
2. Console → Firestore → Rules — for testing set:

```
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		allow read, write: if request.auth != null;
	}
}
```

3. After testing, tighten rules to restrict writes/reads as appropriate for your app.

CI / Automatic deploys

You can add a GitHub Actions workflow to build and deploy to Firebase Hosting automatically when you push to `main`.

1. Generate a CI token locally:

```bash
# install firebase-tools if you don't have it
npm install -g firebase-tools
# log in and create a CI token
firebase login:ci
```

2. In your GitHub repository, add a new secret named `FIREBASE_TOKEN` with the token value from the previous step.

3. Pushing to `main` will trigger the workflow at `.github/workflows/firebase-hosting.yml` which builds and deploys to the project `poshakh-stock`.

If you prefer to deploy from your machine instead, you can run:

```bash
npx firebase login
npx firebase deploy --only hosting
```

Or, if you created a CI token and want to use it locally:

```bash
npx firebase deploy --only hosting --token "YOUR_TOKEN"
```
Poshakh Manager — Local React scaffold

Quick start

1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

What I added
- Vite + React scaffold
- `src/firebase.js` helper that initializes Firebase and exposes `subscribeCollection`
- Basic `Inventory` component that reads `fabrics` collection

Notes
- `dist/` is tracked in git to keep production code in sync with the deployed app.
- `src/` remains as a scaffold for future modularization.
