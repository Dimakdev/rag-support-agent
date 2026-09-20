# Dispatch and routing

## How auto-assign chooses

When a job is created without a technician, the dispatch rules pick one. The order is fixed: required
skill, then availability, then travel time from their previous job, then how full their day already
is.

Skills are tags on people and on jobs. A job tagged `gas` is never auto-assigned to someone without
`gas`, no matter how close they are.

## Travel time

Travel is estimated from the previous job's address, using typical traffic for that hour rather than
live traffic. Estimates are recalculated when the schedule changes, not continuously.

## Priorities

A job marked urgent jumps the queue and may displace a non-urgent job on the same day, which is then
returned to the dispatch queue with a note. Displacement never happens silently: the dispatcher who
owns the schedule is notified.

## Territories

Business accounts can draw territories on the map and tie people to them. A job outside every
territory stays unassigned rather than going to the nearest person.

## When auto-assign finds nobody

The job stays in the dispatch queue and appears in the daily unassigned digest at 07:00 local time.
Nothing is dropped and no one is assigned against their skills.

## Turning it off

Auto-assign is a switch per account, not per job. With it off, every job arrives unassigned and the
dispatch queue becomes the working surface.
