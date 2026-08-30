// One export per audited component. A component arrives here when it has been
// checked against its drawing in the Figma library AND carries the hallmarks
// the drawing cannot express (focus, keyboard, aria, motion-reduce) - not
// before. The order of arrival is the audit's, not the alphabet's forever:
// Accordion was first.
export { Accordion, type AccordionProps } from "./accordion";
