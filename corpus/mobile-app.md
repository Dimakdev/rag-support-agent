# The mobile app

## What it is for

Technicians see their day, open a job, follow the checklist, add photos and notes, collect a signature,
and mark the job done. Dispatchers can use it, but the schedule is easier on the web.

Available for iOS 16 and later and Android 10 and later.

## Working without signal

The app keeps today's and tomorrow's jobs on the device. Without a connection a technician can still
open those jobs, tick the checklist, write notes, take photos and collect a signature.

Everything queues locally and syncs when the connection returns. The queue survives closing the app
and restarting the phone. It does not survive uninstalling the app, and signing out while items are
queued is refused with a warning.

## Photos

Up to 20 photos per job, 25 MB each. Photos are compressed on the device before upload, so a slow
connection is not a blocker. Original resolution is kept for 30 days and then replaced by the
compressed copy.

## Signatures

A signature is captured as an image and attached to the job sheet with a timestamp and the device's
location if location permission was granted. A missing signature never blocks marking a job done — it
is recorded as missing, which is the honest outcome.

## Battery and location

Location is read when a job is opened and when it is completed, not continuously. There is no
background tracking of technicians in the product, by design.

## When sync looks stuck

See Troubleshooting sync.
