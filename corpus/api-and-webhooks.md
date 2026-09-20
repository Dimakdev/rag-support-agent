# API and webhooks

## Access

REST, JSON, available on Team and Business. Keys are created in Settings → API and are shown once.
A key inherits the permissions of the role it is created under; a key made under a Dispatcher role
cannot change settings.

Base URL: `https://api.harbourline.example/v1`. Authentication is a bearer token.

## Rate limits

120 requests per minute per key, burst of 30. Over the limit the API answers 429 with a
`Retry-After` header. Bulk imports should use the batch endpoints, which count as one request per
100 records.

## Pagination

Cursor-based. A page holds up to 100 records and the response carries `next_cursor` until there is
nothing left. Offset pagination is not supported.

## Webhooks

Settings → API → Webhooks. Events: `job.created`, `job.assigned`, `job.completed`, `job.cancelled`,
`invoice.created`.

Delivery is retried 5 times with growing gaps: 1 minute, 5, 30, 2 hours, 6 hours. After the last
failure the endpoint is marked failing and a notice goes to the billing contact. Payloads are signed
with an HMAC in the `X-Harbourline-Signature` header; verifying it is the only safe way to trust the
call.

A webhook that answers slowly is treated as failed after 10 seconds, so the endpoint should accept
the call and do the work afterwards.

## Sandbox

Business only. A separate environment with its own keys and data, reset on request.
