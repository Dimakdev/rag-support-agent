# Notifications

## Email

Free and unlimited. Sent for: a job assigned to you, a job changed within 24 hours of its start, an
unassigned job left in the queue overnight, and the daily schedule at 06:30 local time.

Each of these can be switched off per person in their own profile. An Admin can switch them off for
everyone, but cannot switch them on for someone who turned them off.

## SMS

Team and Business only, and they cost credits: one credit per message segment of 160 characters.
Credits are bought in blocks of 500 and expire 12 months after purchase.

SMS is used for customer reminders (24 hours before, and "on the way") and for urgent job assignment.
Running out of credits does not break anything: messages fall back to email and the billing contact is
told once per day, not once per message.

## Quiet hours

Set per account in Settings → Notifications. Inside quiet hours only urgent messages go out; the rest
are held and sent at the start of the next allowed window. Quiet hours use the recipient's time zone
for customers and the account's time zone for staff.

## Customer notifications

Reminders are on by default for jobs created from a booking link and off by default for jobs created
by a dispatcher, on the assumption that a dispatcher has already spoken to the customer.

## Webhooks instead

Anything that sends a notification can also send a webhook. See API and webhooks.
