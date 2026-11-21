# Security

Report a vulnerability privately through GitHub's "Report a vulnerability" button on the Security tab, or by a direct message to @CPD9. Please do not open a public issue for it.

Kachel uses synthetic and public data only. Secrets live in local `.env` files that git ignores. The Supabase service role key is read only by `services/agent` from its environment and never goes into an app bundle.
