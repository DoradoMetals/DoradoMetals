# Figma sweep - orchestrator notes (2026-09-03)

## THE TYPE RAMP IS VERIFIED AGAINST THE FIGMA TEXT STYLES
Each Figma text style names its own token in its description. All match theme.css:
Display 64/67.2 | H1 36/41.4 | H2 28/34.16 | H3 22/28.6 | H4 18/25.2 | H5 16/23.2
H6 14/21 | Body 15/24 (Regular + Medium) | Small 13/19.5/0 | Micro 12/17.4/+0.048
Stat 36/39.6 | Stat-sm 30/34.5

MY ERROR, CORRECTED: I retargeted --text-display to 44px from the Hero drawing.
The Display STYLE says 64/67.2 and names --text-display outright. Reverted, and
--text-display-sm (which I invented) is deleted.

## OPEN CONFLICT FOR JACOB
The Hero drawing's headline (163:35) is NOT bound to a text style. It is typed
raw at 44px/-1.2px, 20px below the Display style it should be using. Hero now
renders text-h1 (36) stepping to text-display (64) at sm. Either bind that
headline to Display in Figma, or add a real style for 44.

## TOKENS ADDED THIS PASS
--success-muted #172c22, --destructive-muted #32161c, --warning-muted #342713,
--info-muted #132736   (real Figma vars, had no counterpart; Alert now uses them)
--foreground-disabled #5b5e67  (real Figma var; NOT yet consumed - see below)
--radius-surface 10px  (three components had each reached rounded-[10px] alone)

## CORRECTED / DISCOVERED FIGMA NODE IDS
Link        26:513   (6:307 was stale and no longer resolves)
Select      38:75    (none was recorded)
ScrollArea  306:38   (none was recorded)
Textarea    37:63    (37:2 is the canvas, not the component)
Text        component set, the typography primitive - node id still unknown
Toaster     132:1041 DOES NOT RESOLVE - needs a correct id
Icons       a separate Figma library, Lucide-named

## DECISIONS STILL OWED BY JACOB
1. Disabled styling, system-wide. Four field drawings render disabled as
   bg-muted + dimmed text; the code uses opacity-50 in 7 files. Needs one call,
   then --foreground-disabled gets consumed.
2. Badge vs Alert status tint. Alert now uses the muted surface tokens; Badge's
   own drawing still specifies the hue at 16% opacity, and its stated reason
   ("the palette has only one step per status colour") is no longer true.
3. Link now sets text-small where it previously inherited. Blast radius:
   SignUpForm, Footer, Shell, ProfileMenu, PayoutLandingSection, legal pages,
   verify-login, an admin drawer. Wants a visual check.
4. Table filter opens a Menu of values in the drawing; code only toggles a
   boolean. DataTable never wires TanStack row selection though the drawing has
   a Selected state.
5. QuantityStepper: drawing says role=spinbutton, but the middle is a real
   focusable input, so that role would be an ARIA anti-pattern. Left as group.
6. Stat label tracking is drawn at sub-pixel values (0.35px, 0.398px) with no
   token. Left on tracking-wider.
7. frontend should move to lucide-react ^0.510.0 so one copy serves the tree.

## STILL RUNNING
Batch E: date-picker (Calendar, DatePicker, TimePicker), autocomplete,
otp-input, attachment, upload.
