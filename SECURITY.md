# Security

SMS Forwarder handles message text and email delivery. Report a vulnerability in private.

Use [GitHub private vulnerability reporting](https://github.com/karamusluk/sms-forwarder/security/advisories/new).

Do not open a public issue, and do not send:

- SMS message bodies or one-time codes
- SMTP passwords
- a Supabase service-role key
- a release keystore or its passwords

The app is meant to hold only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Email sending stays on the server.
