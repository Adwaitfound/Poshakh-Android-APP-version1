# Firestore Security Rules Setup

## Current Issue

The app is timing out trying to load inventory and orders from Firestore because the security rules are blocking anonymous access.

## Solution: Update Firestore Rules

1. Open your Firebase Console: **https://console.firebase.google.com/project/poshakh-stock/firestore/rules**

2. Replace the rules with the following:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anonymous users to read inventory (fabrics)
    match /fabrics/{document=**} {
      allow read: if request.auth != null;
    }

    // Allow anonymous users to read orders
    match /orders/{document=**} {
      allow read: if request.auth != null;
    }

    // Allow authenticated users to read users collection
    match /users/{userId} {
      allow read: if request.auth != null;
    }

    // Allow authenticated users to write their own user data
    match /users/{userId} {
      allow write: if request.auth.uid == userId;
    }

    // Allow authenticated users to write orders
    match /orders/{document=**} {
      allow write: if request.auth != null;
    }

    // Allow authenticated users to write fabrics history
    match /fabrics/{fabricId}/history/{document=**} {
      allow write: if request.auth != null;
    }
  }
}
```

3. Click **Publish** to activate the rules

## After Updating Rules

- Refresh the app in your browser
- The inventory and orders should now load successfully
- Anonymous users can read data
- Authenticated users can write data

## What Changed in Code

The app now automatically signs in anonymously when Firebase initializes. This allows the Firestore rules to grant read access to the `fabrics` and `orders` collections.
