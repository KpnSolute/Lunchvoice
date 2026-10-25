# Waitlist: proposal for founder and legal review

**Status: PROPOSAL. Nothing here is approved, none of it is legal advice, and the waitlist stays closed until you decide.**
The system will not accept a real sign-up until four values exist: `waitlist.open`, `waitlist.consent_version`, `waitlist.retention` and `waitlist.removal`.

## What would be collected
- An email address (stored lower-cased) and, optionally, the name of the Hub the person intends to create (up to 80 characters).
- The identifier of the consent wording that was shown to them, and a deletion date.
- Not collected: names, phone numbers, IP addresses, browser details, or any account link. A short-lived throttle record holds salted hashes (not the address or IP) for 7 days.

## Why (purpose limitation)
To tell people when the LunchVoice beta can take them, in the order the founder chooses. Joining does not guarantee a place: the beta is capped at 50 Hub owners and the selection criteria and timing are undecided.

## Decisions you need to make
1. **Wording** (`waitlist.consent_version`): who writes it, where it appears (beside the form, before submit), and the version id to record. Engineering supplies no wording.
2. **Retention** (`waitlist.retention`, days): options to consider are deleting at the end of the beta intake window, a fixed period from sign-up (for example 6 or 12 months), or earlier on removal. Pick one; the system deletes expired rows with an operator job (`purge_expired_waitlist`), which must be scheduled before the list opens. Never "indefinitely by default".
3. **Removal** (`waitlist.removal`): the channel people use to ask (for example a monitored mailbox), the response time you commit to, and who runs `remove_waitlist_entry` (which deletes the entry and its throttle records).
4. **Use limits:** whether the list may ever be used for anything other than beta invitations, who may see it, and whether it may be exported.
5. **Network identity** (`waitlist.trusted_ip`): confirm which header the production edge sets and how many trusted proxies sit in front, so abuse limits apply per visitor and not to everyone at once.

## Behaviour already built (for review)
- The page cannot tell a visitor whether an address is already listed; repeat and new sign-ups look identical.
- Abuse limits (provisional, unapproved): 5 attempts per address per origin per day, 30 per origin per hour.
