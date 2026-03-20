# Penrose Procure

**Team: The Challenger Class**

> **Live demo:** [https://start-hack-2026.vercel.app/](https://start-hack-2026.vercel.app/)

## Overview

Penrose is an AI-powered procurement intelligence system built for START Hack 2026. It converts unstructured purchase requests into structured, policy-compliant supplier comparisons with transparent, auditable reasoning.

Large organisations receive thousands of purchase requests each year, written in free text, often incomplete, ambiguous, or in multiple languages. Penrose automates the procurement decision pipeline end-to-end:

1. **Interprets** unstructured requests (including non-English text)
2. **Extracts** structured requirements: category, quantity, budget, delivery constraints
3. **Validates** for completeness and internal consistency
4. **Applies** procurement policy: approval thresholds, preferred/restricted suppliers, category and geography rules
5. **Ranks** compliant suppliers by pricing tier, quality, risk, and ESG score
6. **Explains** every decision in auditable terms
7. **Escalates** when human approval is required, naming the correct escalation target


## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts |
| Database | PostgreSQL via Supabase (REST API) |
| AI | OpenAI API |

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Requires a `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
NEXT_SUPABASE_SECRET_KEY=
OPENAI_API_KEY=
```
