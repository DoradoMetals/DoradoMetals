# Media port hand-off (emails and PDFs), from the Media design audit

Rulings: PDFs render in Geist (code uses Poppins today); eyebrow tracking follows Figma; mailer bodies, header logo and footer are LEFT aligned, buttons full width, no pre-titles (the order number moves out of the body; Jacob decides where); payout mailer shows the amount once; table lot names read "14K Gold" / "Sterling Silver" style.

Design-vs-code gaps the port resolves: no PDF prints the logo (use the library Logo Ink=Black on paper); every PDF footer hardcodes "Page 1 of 1"; Figma "Appointment Manifest" = code intake_receipt; the invoice item column prints lot.reference (code was right). Possible clip: shipping-, pickup- and appointment-instructions had a fixed middle region in Figma that pushed the footer off a Letter page; render each PDF and check the footer sits on the page.

Missing designs (Jacob decides where): promo mailer, supplier sales-order email, sales-order invoice variant, return packing list. Upload-only kinds (settlement, lot manifest, lead document) need no design.

Assets: emails reference `FRONTEND_URL/media/...` from `frontend/public/media/`; PDFs inline their assets. The Media worker exports the asset pack (logo black/white, mark) with Figma source ids before the lane starts.

Ruling 2026-10-14 (Jacob): the Assay Results document becomes a **Quote Estimate** (estimated payout, spot per metal, one row per item with pre/post melt, purity, fine oz, spot, rate, unit price, line total; then shipping, payout fee, total). Every field exists on OrderPricing plus the lot row. Code lane: a quote/estimate PDF builder replaces assay-results.ts; the assay_results PdfKind stays until Jacob says to delete it. The assay summary never totals across metals.
