# Scheduling jobs

## Creating a job

A job needs a customer, an address, a date and a duration. Everything else — the checklist, parts,
photos, price — can be filled in later, including by the technician on site.

Jobs can be created from the schedule, from a customer record, from an inbound booking link, or over
the API.

## Duration and travel

The duration is work time only. Travel is added by the dispatch rules and shown as a separate block
on the schedule, so a two-hour job forty minutes away occupies two hours forty on the calendar but
bills as two.

## Recurring jobs

Team and Business can set a job to repeat: weekly, every two weeks, monthly on a date, or monthly on
a weekday (the third Tuesday). A recurring series is generated 90 days ahead. Editing one occurrence
asks whether the change is for that one or for the series.

A recurring series with no assigned technician still generates jobs; they sit unassigned and appear in
the dispatch queue.

## Conflicts

Two jobs on one technician at the same time are allowed but flagged. A flagged conflict blocks nothing
— dispatchers who double-book on purpose (a quick stop between two long jobs) would otherwise have to
fight the software.

## Cancelling a job

Cancelled jobs keep their history and stay visible on the schedule, greyed out, for 30 days. After
that they move to the archive, where they are still searchable.

## Time zones

The schedule is drawn in the account's time zone, set in Settings → Company. The mobile app shows the
job in the time zone of the job's address, which matters for accounts working across a boundary.
