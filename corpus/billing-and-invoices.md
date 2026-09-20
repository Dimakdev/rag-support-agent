# Billing and invoices

## When you are charged

Monthly accounts are charged on the same day each month, the day the subscription started. Annual
accounts are charged on the anniversary of the first payment. Invoices are emailed to the billing
contact within an hour of the charge and are always available in Billing → Invoices.

## Payment methods

Visa, Mastercard and American Express. Canadian accounts can also pay annual invoices by EFT; ask
support to switch the account to invoice billing, which takes one business day.

Pre-authorised debit is not supported. Cheques are accepted only for Business annual plans above
25 seats.

## When a payment fails

The card is tried again three times: after 3 days, after 7 days, and after 10 days. The billing
contact is emailed after each failure. On the tenth day, if nothing has been paid, the account moves
to read-only: jobs already scheduled still appear on the mobile app, but nothing new can be created
and the API returns 402.

Read-only is not deletion. Paying any outstanding invoice restores the account immediately, with all
data intact. Accounts stay in read-only for 60 days before the data is scheduled for deletion, and a
warning is sent 7 days before that.

## Changing the billing contact

Billing → Contact. The address there receives invoices and failure notices; it does not need a seat
and does not need to be a user of the product.

## Purchase orders and quotes

A quote for an annual plan can be generated from Billing → Request quote and is valid for 30 days.
A purchase order number entered in Billing appears on every invoice for that term.
