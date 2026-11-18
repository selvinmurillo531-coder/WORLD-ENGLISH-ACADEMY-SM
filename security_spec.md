# Security Specification — WORLD ENGLISH ACADEMY SM

## 1. Data Invariants
1. Every document under `/users/{uid}` and its subcollections (`/sessions/{sessionId}`, `/savedItems/{itemId}`) belongs strictly to the authenticated, email-verified user whose `request.auth.uid == uid`.
2. Every subcollection write requires the parent `/users/{uid}` document to exist (`exists(...)`), enforcing the Master Gate invariant.
3. No unauthenticated or cross-user read, list, create, update, or delete is permitted anywhere in the database.
4. Immutable identity and temporal fields (`uid`, `createdAt`) cannot change after document creation, and `createdAt`/`updatedAt` must equal `request.time`.
5. Every string field has strict `.size()` bounds, every array has a `.size()` bound plus element type check, and unknown shadow/ghost fields are rejected via `keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`.

## 2. Adversarial Payloads Checked ("Dirty Dozen")
1. Unauthenticated `get` on `/users/userA`. -> DENIED
2. Authenticated `userB` attempting `get` or `list` on `/users/userA/sessions`. -> DENIED
3. Unverified email user (`email_verified == false`) attempting `create` on `/users/userA`. -> DENIED
4. `userA` attempting to create `/users/userA` with `uid: "userB"` (identity spoofing). -> DENIED
5. `userA` attempting shadow field injection (`isAdmin: true`) on `/users/userA`. -> DENIED
6. `userA` attempting to create `/users/userA/sessions/active` with an oversized `topic` (> 120 chars). -> DENIED
7. `userA` attempting to spoof `createdAt` or `updatedAt` with a client timestamp != `request.time`. -> DENIED
8. `userA` attempting to change immutable `uid` or `createdAt` during `update`. -> DENIED
9. `userA` attempting to inject an invalid `difficultyLevel: "Expert"` enum value. -> DENIED
10. `userA` attempting to inject an invalid `status: "hacked"` on `/users/userA/savedItems/{id}`. -> DENIED
11. `userA` attempting to write an oversized ID (`> 128` chars or special characters) as `{sessionId}` or `{itemId}`. -> DENIED
12. `userA` attempting to store `> 30` elements in `recentMessages` or non-map items in `recentMessages`. -> DENIED
