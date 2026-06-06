# Firebase Security Specification (security_spec.md)

This specification defines the access boundaries, validation schemas, and malicious payload test suite designed to pressure-test the security rules of PHOTO SKY 2.

## 1. Data Invariants

- **Ownership Integrity**: A photo document must always have an `ownerId` matching the creator's authenticated User ID (`request.auth.uid`) and an `ownerEmail` matching `request.auth.token.email`.
- **Email Verification**: To write to the database (create, update, delete), the authenticated user must have a verified email address (`request.auth.token.email_verified == true`).
- **Privacy Bound**: 
  - `public` photos can be read (get, list/query) by anyone including anonymous or unauthenticated visitors.
  - `private` photos can only be read/updated/deleted by the photo's owner.
  - `shared` photos can only be read by the owner OR authenticated users whose emails reside within the photo's `sharedWith` list of strings.
- **Immortal Fields**: Once a photo is created, its `ownerId`, `ownerEmail`, `imageUrl`, and `createdAt` are immutable and can never be updated.
- **Strict Size/Type Bounds**:
  - `title` must be a string between 1 and 100 characters.
  - `imageUrl` must be a string between 10 and 1,500,000 characters (supports compressed base64 / standard urls).
  - `tags` must be a list of strings containing at most 10 items.
  - `privacy` must be exactly `"public"`, `"private"`, or `"shared"`.
  - `sharedWith` must contain at most 10 verified emails.
  - `createdAt` and `updatedAt` must be strictly server timestamps (`request.time`).

---

## 2. The "Dirty Dozen" Malicious Payloads

The following 12 payloads are crafted specifically to violate the core identity, data integrity, and state transition laws. Each MUST return `PERMISSION_DENIED` during operations.

### Payload 1: User Profile Identity Spoofing (Create `/users/attacker_uid` as `victim_uid`)
```json
{
  "displayName": "Spoofed Victim",
  "email": "victim@example.com",
  "photoURL": "https://avatar.placeholder/victim",
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because document ID (`victim_uid`) does not match the creator's authenticated User ID (`attacker_uid`).

### Payload 2: Untrusted Client-Side Timestamps (Create `/photos/photo1` with outdated dates)
```json
{
  "title": "Mischief at midnight",
  "imageUrl": "data:image/png;base64,hijacked...",
  "tags": ["beach"],
  "privacy": "private",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": [],
  "createdAt": "2020-01-01T00:00:00Z",
  "updatedAt": "2020-01-01T00:00:00Z"
}
```
*Expected Result*: Rejected because `createdAt` and `updatedAt` do not match `request.time`.

### Payload 3: Photo Identity Spoofing (Create `/photos/photo1` with victim's ownerId)
```json
{
  "title": "Stolen Identity",
  "imageUrl": "data:image/png;base64,hijacked...",
  "tags": ["beach"],
  "privacy": "public",
  "ownerId": "victim_uid",
  "ownerEmail": "victim@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because the payload's `ownerId` does not match the active authenticated `request.auth.uid`.

### Payload 4: Shadow Update with Ghost Field (Update adding `isAdmin: true` or custom fields)
```json
{
  "title": "Summer vacation",
  "imageUrl": "data:image/png;base64,valid...",
  "tags": ["vacation"],
  "privacy": "private",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time",
  "isAdmin": true,
  "shadowKeySecret": "leak"
}
```
*Expected Result*: Rejected on create/update due to strict key checks and `affectedKeys().hasOnly()` gates.

### Payload 5: Immortal Field Tampering (Update `ownerId` to steal ownership)
```json
{
  "title": "Re-routed owner",
  "imageUrl": "data:image/png;base64,valid...",
  "tags": ["vacation"],
  "privacy": "private",
  "ownerId": "victim_uid",
  "ownerEmail": "victim@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because fields `ownerId` and `ownerEmail` are immutable once created.

### Payload 6: Invalid Privacy State Mutation (Create or Update privacy setting with invalid value)
```json
{
  "title": "Unbound settings",
  "imageUrl": "data:image/png;base64,valid...",
  "tags": [],
  "privacy": "visible-to-everyone-super-unbounded",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because `privacy` is not in `["public", "private", "shared"]`.

### Payload 7: Tag Unbounded Size Escalation (Denial of Wallet Attack)
```json
{
  "title": "Spam Tags",
  "imageUrl": "data:image/png;base64,valid...",
  "tags": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"],
  "privacy": "public",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because `tags.size() > 10` is strictly forbidden.

### Payload 8: SharedWith Unbounded Size (Denial of Wallet Attack)
```json
{
  "title": "Spam Shares",
  "imageUrl": "data:image/png;base64,valid...",
  "tags": [],
  "privacy": "shared",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": ["a@g.co", "b@g.co", "c@g.co", "d@g.co", "e@g.co", "f@g.co", "g@g.co", "h@g.co", "i@g.co", "j@g.co", "k@g.co", "l@g.co"],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because `sharedWith.size() > 10` is strictly forbidden.

### Payload 9: Empty Image / Over-sized String Attack
```json
{
  "title": "Exploit String Large",
  "imageUrl": "data:image/png;base64,aaaa...(5MB of text)...",
  "tags": [],
  "privacy": "public",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected because `imageUrl.size() <= 1500000` is strictly mandated.

### Payload 10: Unauthorized Private Photo Access (Read victim photo `/photos/victim_photo` as attacker)
*Expected Result*: Rejected because authenticated user ID (`attacker_uid`) does not match the photo's `ownerId` ("victim_uid") and attacker's email is not in the photo's `sharedWith` list when privacy is `"private"` or `"shared"`.

### Payload 11: Attempted Write by Unverified Email account (Email status bypass)
```json
{
  "title": "Fake Verified Profile",
  "imageUrl": "data:image/png;base64,valid...",
  "tags": [],
  "privacy": "public",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@example.com",
  "sharedWith": [],
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```
*Expected Result*: Rejected if `request.auth.token.email_verified != true` for standard actions.

### Payload 12: Missing Mandated Fields
```json
{
  "title": "Incomplete photo",
  "privacy": "public",
  "ownerId": "attacker_uid"
}
```
*Expected Result*: Rejected since required schema fields `imageUrl`, `tags`, `ownerEmail`, `createdAt`, `updatedAt` are completely missing.
