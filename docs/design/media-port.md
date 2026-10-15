# Media port hand-off (emails and PDFs), from the Media design audit

Rulings: PDFs render in Geist (code uses Poppins today); eyebrow tracking follows Figma; mailer bodies, header logo and footer are LEFT aligned, buttons full width, no pre-titles (the order number moves out of the body; Jacob decides where); payout mailer shows the amount once; table lot names read "14K Gold" / "Sterling Silver" style.

Design-vs-code gaps the port resolves: no PDF prints the logo (use the library Logo Ink=Black on paper); every PDF footer hardcodes "Page 1 of 1"; Figma "Appointment Manifest" = code intake_receipt; the invoice item column prints lot.reference (code was right). Possible clip: shipping-, pickup- and appointment-instructions had a fixed middle region in Figma that pushed the footer off a Letter page; render each PDF and check the footer sits on the page.

Missing designs (Jacob decides where): promo mailer, supplier sales-order email, sales-order invoice variant, return packing list. Upload-only kinds (settlement, lot manifest, lead document) need no design.

Assets: emails reference `FRONTEND_URL/media/...` from `frontend/public/media/`; PDFs inline their assets. The Media worker exports the asset pack (logo black/white, mark) with Figma source ids before the lane starts.

Ruling 2026-10-14/15 (Jacob): the Assay Results document becomes a **Quote Estimate**, drawn at 225:2270. The frame is the spec. A quote is not stored.
- **Header:** the Header's Checkout variant (62:258) shows "Start your order", "Scan with your phone" and a 48 px vector QR code to `FRONTEND_URL/sell` (`links.ts` `sellUrl()`, generated at render time).
- **Hero:** "Estimated quote" with the items total. On the label's line, the Hero's Reference switch (on for the quote only) shows "Quote Q-MMDD-HHMM", built from the quote's Central-time date and time. The quote names no customer. The status line states spot once ("Priced against spot on {date, time CT}: gold $x and silver $y per oz."), then the disclaimer.
- **Items:** the invoice table with an ESTIMATE column and labelled facts. Scrap rows read "Weight {g} g · Purity {p}% · {Metal} weight {oz} oz · Price ${x} per oz ({r}% of spot)". Bullion rows read "Quantity {n} · {Metal} weight {oz} oz · Price ${x} each ({r}% of spot)", where the metal weight is the whole lot's (12 × 10 oz bars read 120.000 oz). The fine weight and the per-ounce price come from the pricing view (`fine`, `oz_price`).
- **Below the items:** "How to send it" (317:2358) and "Getting paid" (317:2398), shared with the rate sheet (`render/documents/send-and-paid.ts`). The payout lines come from `payments.methods`.
- **Footer:** the Footer's Contact switch (on for the quote only) adds the office address, phone and email from the Dorado office location and its organization row, then "Quoted {date}".
- Shipping and the payout fee are not in the figure, and there is no summary block. The assay_results PdfKind and route stay until Jacob renames them, and a sales order gets no quote estimate.

Footers use the short date the frames show ("Sep 2"): instruction sheets "Sent", the quote "Quoted", invoices "Issued", the shipment, pickup and intake manifests "Created".

Ruling 140 (no "melt"): the quote prints "Weight". The invoice and manifest frames still print "post melt" and "pre melt" while Jacob names the term. Until he does, the code prints "Weight {n} g" there too: the post-processing weight on the invoice, the declared weight on the manifests.

## Port status (media-port lane, 2026-10-14)

Omissions: the frames draw these, the code does not render them yet.

- **Contact email in the quote footer.** It reads `organizations.organizations.email` for the Dorado office's organization, which is NULL in the data today, so the line shows address and phone only until that row is filled.

- **YouTube and LinkedIn icons in the mailer footer.** The PNGs are in `frontend/public/media/`, but no account URL exists in the repo.
- **"Sterling Silver".** The purity label in `metals.purity_labels` is ".925", so a lot prints ".925 Silver".
- **Voicemail mailer lede, rows and note.** They need the caller's name and the message length, which `VoicemailReceivedMail` does not carry (CRM calls change).
- **Pickup-complete lede.** It needs the driver's name, the time and the office; the generic lede stays.

Open decisions:

- **Sales invoice card fee.** Ruled and done: the pricing view gains `card_fee` (the stored card fee, 0 when none) and `total_charged` (total + card fee) without changing `total`. Every Sales Invoice summary row reads the pricing view, and the Total is `total_charged`.
- **Payout method copy is data.** The invoice, the payout email (card rows and the one neutral lede, "Sent by {label} to the account ending {last4}.") and the rate sheet read `payments.methods.label` and `time_delay`, so they cannot disagree. If the copy is wrong, it is edited in the method rows.
- **Document label.** Done: `orders/rules.ts` `documentsFor` names the `assay_results` document "Quote Estimate". The kind and route rename is in `FOLLOWUPS.md`.
