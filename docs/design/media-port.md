# Media port hand-off (emails and PDFs), from the Media design audit

Rulings: PDFs render in Geist (code uses Poppins today); eyebrow tracking follows Figma; mailer bodies, header logo and footer are LEFT aligned, buttons full width, no pre-titles (the order number moves out of the body; Jacob decides where); payout mailer shows the amount once; table lot names read "14K Gold" / "Sterling Silver" style.

Design-vs-code gaps the port resolves: no PDF prints the logo (use the library Logo Ink=Black on paper); every PDF footer hardcodes "Page 1 of 1"; Figma "Appointment Manifest" = code intake_receipt; the invoice item column prints lot.reference (code was right). Possible clip: shipping-, pickup- and appointment-instructions had a fixed middle region in Figma that pushed the footer off a Letter page; render each PDF and check the footer sits on the page.

Missing designs (Jacob decides where): promo mailer, supplier sales-order email, sales-order invoice variant, return packing list. Upload-only kinds (settlement, lot manifest, lead document) need no design.

Assets: emails reference `FRONTEND_URL/media/...` from `frontend/public/media/`; PDFs inline their assets. The Media worker exports the asset pack (logo black/white, mark) with Figma source ids before the lane starts.

Ruling 2026-10-14 (Jacob): the Assay Results document becomes a **Quote Estimate**, drawn at 225:2270. The frame is the spec: header "Quote Estimate" over the customer's name (a quote is not stored and has no id or order number); hero "Estimated quote" with the items total and "Priced against spot at {time}"; the invoice Items table with an ESTIMATE column (per row: weight, purity, premium and spot for scrap; units, premium and spot for bullion; no fine oz or unit price columns); a "Next step" block, "Start your order", with a QR code to `FRONTEND_URL/sell`; an "About this quote" paragraph; footer "Quoted {date}". Shipping and the payout fee are not in the figure, and there is no summary block. The assay_results PdfKind and route stay until Jacob renames them, and a sales order gets no quote estimate.

## Port status (media-port lane, 2026-10-14)

Omissions: the frames draw these, the code does not render them yet.

- **YouTube and LinkedIn icons in the mailer footer.** The PNGs are in `frontend/public/media/`, but no account URL exists in the repo.
- **"Sterling Silver".** The purity label in `metals.purity_labels` is ".925", so a lot prints ".925 Silver".
- **Voicemail mailer lede, rows and note.** They need the caller's name and the message length, which `VoicemailReceivedMail` does not carry (CRM calls change).
- **Pickup-complete lede.** It needs the driver's name, the time and the office; the generic lede stays.

Ruling 2026-10-14 (Jacob), built: quotes do not lock prices and are not stored, so a quote has no id. The Quote Estimate header names the customer, the "Start your order" block carries a vector QR code to `FRONTEND_URL/sell` (`links.ts` `sellUrl()`, generated at render time), and the footer reads "Quoted {date}". The live frame 225:2270 has no "Prepared for {name}" line in the hero; the customer's name sits in the header, so the code follows the frame.

Open decisions:

- **Sales invoice card fee.** Ruled and done: the pricing view gains `card_fee` (the stored card fee, 0 when none) and `total_charged` (total + card fee) without changing `total`. Every Sales Invoice summary row reads the pricing view, and the Total is `total_charged`.
- **Payout method copy is data.** The invoice, the payout email (card rows and the one neutral lede, "Sent by {label} to the account ending {last4}.") and the rate sheet read `payments.methods.label` and `time_delay`, so they cannot disagree. If the copy is wrong, it is edited in the method rows.
- **Document label.** Done: `orders/rules.ts` `documentsFor` names the `assay_results` document "Quote Estimate". The kind and route rename is in `FOLLOWUPS.md`.
