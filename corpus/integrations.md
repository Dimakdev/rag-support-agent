# Integrations

## QuickBooks Online and Xero

Team and Business. Completed jobs become draft invoices in the accounting system; nothing is ever
issued automatically. Customers are matched by email first, then by exact company name; anything
ambiguous is left for a human in the matching queue.

Sync runs every 15 minutes and can be forced from Settings → Integrations. Deleting a job in
Harbourline does not delete an invoice that was already created from it.

## Google Calendar

One-way: Harbourline writes, the calendar reads. Each technician connects their own calendar. Events
carry the job's address and a link back; changes in the calendar are ignored, because two systems
both claiming to own a schedule is how double bookings happen.

## Zapier

Triggers: job created, job assigned, job completed, job cancelled. Actions: create job, create
customer, add note. The connection uses an API key, so it needs Team or Business.

## Outlook and iCal

An iCal feed is available per person on every plan, read-only, refreshed by the calendar client on its
own schedule — usually every few hours, which is why it is not suitable for same-day changes.

## What is not supported

There is no two-way calendar sync, no Salesforce integration, and no native Slack app. Slack is
reachable through Zapier or a webhook.
