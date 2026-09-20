# When the mobile app will not sync

## What "stuck" usually means

The app shows a number of items waiting. That number going down slowly on a weak connection is normal:
photos go last, after text, on purpose.

## Check in this order

1. **Signed in as the right person.** A shared phone that was signed out and back in as someone else
   still holds the first person's queue. It will sync when they sign in again, and not before.
2. **Storage.** Under 200 MB free, photo capture fails quietly on some Android builds. The app warns
   once; the warning is easy to miss.
3. **Date and time.** A phone with a wrong clock is refused by the server with a signature error that
   the app reports as "cannot reach Harbourline".
4. **VPN or work profile.** Some mobile device management profiles block the upload host while letting
   the rest of the app through, which looks exactly like a broken app.
5. **Force a sync.** Pull down on the job list. If the number does not move in two minutes on a good
   connection, send the diagnostics.

## Sending diagnostics

Profile → Help → Send diagnostics. This uploads the queue's metadata — how many items, how old, what
errors — and never the photos themselves. Support answers with what the queue actually contains.

## What not to do

Do not uninstall the app while items are waiting. Uninstalling deletes the queue and the work in it
cannot be recovered. Signing out is refused while the queue is not empty for the same reason.
