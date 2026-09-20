# Security and sign-in

## Passwords

Minimum 10 characters, checked against a list of known-breached passwords. No forced rotation, because
rotation without a reason produces worse passwords, not better ones.

A reset link is valid for one hour and can be used once.

## Two-factor authentication

Available on every plan, per person, using an authenticator app. SMS codes are not offered as a second
factor. An Admin can require 2FA for everyone on Team and Business; people without it are asked to set
it up at the next sign-in and cannot skip it.

Recovery codes are shown once when 2FA is switched on. Someone locked out without recovery codes has
to be reset by an Admin, and the Owner by support after a check against the billing contact.

## Single sign-on

Business only. SAML 2.0, tested with Okta, Entra ID and Google Workspace. Just-in-time provisioning
creates a person on first sign-in with the Technician role; anything more has to be granted
deliberately.

With SSO on, password sign-in is switched off for everyone except the Owner, who keeps one password
route so that a broken identity provider cannot lock the account out entirely.

## Sessions

A session lasts 30 days on the web and does not expire on the mobile app until the person signs out
or is removed. An Admin can end all sessions for a person from Settings → People.

## Audit log

Business only. Records sign-ins, permission changes, seat changes, exports and API key creation.
Kept for 12 months and exportable as CSV.
