---
name: araskova-seo
description: Implements route-specific canonical links, OpenGraph / Twitter cards, Schema.org JSON-LD Breadcrumbs, and AI discoverability (llms.txt).
---

# Araskova SEO & LLM Discoverability Skill
1. Route Canonical Invariant: Every route MUST declare its own canonical link in head:
   ```tsx
   links: [{ rel: "canonical", href: "https://araskova.com/products/vigil" }]
   ```
2. OpenGraph & Twitter: Always provide og:url, og:type, absolute og:image, twitter:card ("summary_large_image"), twitter:site ("@araskova").
3. Structured Data: Always inject Schema.org BreadcrumbList for rich search result snippets.
4. AI Search & RAG Indexing: Maintain public/llms.txt, public/llms-full.txt, and allow AI bots (GPTBot, ClaudeBot, PerplexityBot) in robots.txt.
