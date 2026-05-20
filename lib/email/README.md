# Email templates

Currently authored in **Spanish only**.

## Why

Ola 7c (i18n MVP) covered the user-facing app shell + main flows. Email
templates are their own module: they hit different audiences (founder vs
member vs admin), they have explicit branding, and several are triggered by
events that don't carry a viewer language hint (e.g. cron jobs for validation
checks). Translating all of them is out of scope for 7c.

## Plan for future Ola (7d or later)

1. Mirror the `lib/i18n` pattern: add `templates/i18n/es.ts` + `en.ts` per
   template body, keyed by template name.
2. Persist `User.preferredLanguage` (mirroring the cookie) so triggers can
   pick the recipient's language without a request context.
3. For founder→member emails: default to the recipient's preference; for
   admin→user emails: default to the recipient's preference too.
4. For admin→admin notifications (e.g. `new-application-admin.ts`,
   `pending-assignment-to-admin.ts`): stay in Spanish — internal team
   language.

Until then, all `lib/email/templates/*.ts` files are marked `// TODO i18n`
at the top so a grep is enough to find them.
