# Editorial drafts and off-site SEO

Reviewed September 30, 2026.

The legacy `scripts/auto-blogger.js` previously generated promotional articles for ten Blogger destinations. Its prompt required five links back to HD Watchzone per article. Its fallback copy invented praise, performance judgments, popularity and confirmed HD playback without evidence. This is not a sound way to establish independent reviews or authority.

Google's [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) identify links created primarily to manipulate rankings and large-scale low-value content as risks. Its [people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) calls for useful original value and clear sourcing. Automation itself is not prohibited; purpose, accuracy and added value matter. The revised generator does not promise a rankings benefit.

## Current safeguards

- Blogger insertion always includes `isDraft=true`, as documented by the [Blogger API](https://developers.google.com/blogger/docs/3.0/reference/posts/insert). There is no public-publish flag or publish request in this script.
- The returned post must have `DRAFT` status before success is recorded.
- The article prompt is factual, source-attributed and draft-only. It has no mandatory word count, no keyword list and at most one relevant title-information link.
- The fallback is a short sourced metadata summary, not a fabricated review. Drafts clearly require human fact-checking and original editorial work before publication.
- Importing the module does not run its pipeline. Tests inject a fake request function and perform no remote publishing, authentication or logging.

No Blogger workflow is present in the repository's current `.github/workflows` directory, so no scheduled Blogger job was removed. The separate Telegram/Reddit daily-poster workflow was left unchanged. A direct manual invocation of the Blogger helper still contacts its configured services and creates remote drafts plus a Sheets log; do not run it unintentionally.

## Owner review required

An editor must verify every draft's claims, sources, links, HTML, media rights and useful original contribution before publishing manually in Blogger. A draft flag does not itself validate the content or make a repetitive network of articles useful.

Already published posts were not changed or deleted. Their current publication state, indexing, backlinks and Search Console history were not verified. The owner should inventory those posts, review unsupported claims and repetitive links, and decide whether to improve or remove them. Do not bulk-delete or submit a backlink disavow file without site-specific evidence.

The owner confirmed **Noor** as the public site operator and **noor2304f@gmail.com** as the support email, and authorized publishing these details on the Contact and Legal pages on October 1, 2026. The contact form prepares a message in the visitor's email app; the website does not send it. Inbox ownership, delivery and response times have not been independently tested.

The formal operating entity, jurisdiction and video rights remain unverified owner-review items. No invented author biographies, addresses, awards, social identities or legal guarantees should be added to metadata or visible content.
