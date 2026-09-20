# Sample corpus

Harbourline is a made-up company: a scheduling and dispatch product for small field-service teams.
Nothing in this folder describes a real business, a real price, or a real person. It exists so that
the agent has something to be tested against, and so that anyone forking this repo can watch it work
before pointing it at their own documents.

The content is written the way a real help centre is written — headings, specific numbers, a few
places where two pages nearly overlap — because a corpus of perfectly separated topics would make
retrieval look better than it is. Refunds, cancellation and trials all talk about money and endings on
purpose: that is where a retriever earns its keep.

To use your own documents instead, leave this folder alone and point a `url` source at your help
centre in the `Sources` table, then set the `markdown` source to inactive.
