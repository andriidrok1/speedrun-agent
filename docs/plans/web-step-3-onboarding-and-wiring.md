# Step 3: colors, onboarding, real deals

1. Stripe colors: `web/src/styles/stripe-colors.css` overrides the neutral and brand scales
   Untitled UI reads. Solid only (no gradient mesh), Inter stays. Reference: `web/DESIGN.md`.
2. Onboarding (form, option A):
   - `/creator/setup`: handle (stats from the scrape), work types with minimum (private) and ideal
     price, open to products / affiliate, refused categories, dealbreakers, voice.
   - `/brand/setup`: name, category, campaign goal, creators wanted, total budget, max per creator
     (private), starting offer, deliverables, products to offer, affiliate %, no-gos, voice.
   - Forms map to the `context/SCHEMA.md` profile shape (public vs private). Saved in the browser;
     sent with `POST /campaigns` (`brand`) and `POST /deals` (`creatorProfile`). Each agent only
     ever gets its own private block (server/src/agents/prompts.ts).
3. Web to server: `useDeal` polls `GET /deals/:id`, Pay calls `/fund`, Mark live calls `/verify`
   (mock), statuses follow the server (`negotiating, agreed, held, paid_out, walked_away, refunded`).
4. Negotiation tuning: no backwards moves, no dashes in messages, fewer rounds for the demo.
5. Demo prep. Brainbase campaign manager (Andrii) runs against Railway.
