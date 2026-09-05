// The capture scripts. These are NOT run by node - they are the bodies handed
// to the Figma MCP `use_figma` tool, kept here so a re-capture is reproducible
// instead of improvised, and so a diff of the snapshot can be traced to the
// code that produced it.
//
// There is no Figma token in this repo: .mcp.json points at the hosted MCP
// server and authenticates interactively, so nothing on the command line can
// reach the file. An agent runs these two scripts and writes the result into
// snapshot.json. See README.md for the exact procedure.
//
// Run PART 1 and PART 2 as two separate use_figma calls. One combined call
// returns more than is comfortable to read back.

// ===========================================================================
// PART 1 - tokens, text styles, pages.
// Fills snapshot.json's `collections`, `textStyles` and `pages`.
// ===========================================================================
export const PART_1 = `
const colls = await figma.variables.getLocalVariableCollectionsAsync();
const hex = (c) => '#' + [c.r, c.g, c.b].map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join('');

const collections = {};
for (const c of colls) {
  const modeId = c.modes[0].modeId;
  const vars = [];
  for (const id of c.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v) continue;
    const raw = v.valuesByMode[modeId];
    let alias = null, resolved = raw;
    if (raw && raw.type === 'VARIABLE_ALIAS') {
      const a = await figma.variables.getVariableByIdAsync(raw.id);
      alias = a ? a.name : null;
      let cur = a, guard = 0;
      while (cur && guard++ < 8) {
        const cc = colls.find((x) => x.id === cur.variableCollectionId);
        const val = cur.valuesByMode[cc.modes[0].modeId];
        if (val && val.type === 'VARIABLE_ALIAS') { cur = await figma.variables.getVariableByIdAsync(val.id); continue; }
        resolved = val; break;
      }
    }
    vars.push({
      name: v.name, type: v.resolvedType, alias,
      value: v.resolvedType === 'COLOR' && resolved && typeof resolved === 'object' ? hex(resolved) : resolved,
    });
  }
  collections[c.name] = { modes: c.modes.map((m) => m.name), variables: vars.sort((a, b) => a.name < b.name ? -1 : 1) };
}

const textStyles = (await figma.getLocalTextStylesAsync()).map((s) => ({
  name: s.name, family: s.fontName.family, style: s.fontName.style, fontSize: s.fontSize,
  lineHeight: s.lineHeight && s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : s.lineHeight,
  letterSpacing: s.letterSpacing && s.letterSpacing.unit === 'PIXELS' ? s.letterSpacing.value : s.letterSpacing,
})).sort((a, b) => a.name < b.name ? -1 : 1);

const pages = figma.root.children.map((p) => ({ id: p.id, name: p.name }));
return { collections, textStyles, pages };
`

// ===========================================================================
// PART 2 - the hygiene sweep. Fills snapshot.json's `hygiene`.
//
// Walks every COMPONENT and COMPONENT_SET on every component page. Uses
// page.loadAsync() rather than setCurrentPageAsync, which is what makes a
// whole-file sweep one call instead of fifty - the skill's one-switch-per-call
// rule is about the CURRENT page, and this never changes it.
// ===========================================================================
export const PART_2 = `
const SKIP = new Set(['Cover', 'Foundations', 'Logo', 'Brand Logos', 'Icons', '\u2014\u2014\u2014  COMPONENTS  \u2014\u2014\u2014', 'Typography']);
const CATS = ['color', 'spacing', 'radius', 'textStyle', 'iconFill', 'iconWeight'];
const perPage = {};
const samples = { color: [], spacing: [], radius: [], textStyle: [], iconFill: [], iconWeight: [] };
let scanned = 0;
function subtree(n, out) { out.push(n); if ('children' in n) for (const c of n.children) subtree(c, out); return out; }
const pathOf = (n) => { const p = []; let c = n; while (c && c.type !== 'PAGE') { p.unshift(c.name); c = c.parent; } return p.join('/'); };

// Yields [node, ownedFields]. ownedFields null means "this page drew it, check
// everything"; a Set means the node came from an instance of ANOTHER page's
// component and only those fields are this page's doing.
//
// THIS IS THE WHOLE ACCURACY STORY. The first version walked straight through
// instances, so Button's one unbound gap and its one unstyled Label were
// counted again at all ~40 sites that use a Button - Attachment showed 46
// findings of which 40 were Button's. Reading InstanceNode.overrides means a
// page is charged only for what it actually changed. Remote instances (the
// Icons library) ARE walked: their vector stroke weight is the consumer's
// problem, because resizing an instance does not scale its stroke.
async function collect(root) {
  const out = [];
  const stack = [[root, null]];
  while (stack.length) {
    const [n, owned] = stack.pop();
    out.push([n, owned]);
    if (n !== root && n.type === 'INSTANCE') {
      let mc = null;
      try { mc = await n.getMainComponentAsync(); } catch (e) { mc = null; }
      if (!mc || !mc.remote) {
        let ov = [];
        try { ov = n.overrides || []; } catch (e) { ov = []; }
        const byId = new Map(ov.map((o) => [o.id, new Set(o.overriddenFields || [])]));
        for (const k of subtree(n, [])) {
          if (k === n) continue;
          const f = byId.get(k.id);
          if (f && f.size) out.push([k, f]);
        }
        continue;
      }
    }
    if ('children' in n) for (const c of n.children) stack.push([c, owned]);
  }
  return out;
}

for (const page of figma.root.children) {
  if (SKIP.has(page.name)) continue;
  await page.loadAsync();
  const counts = { color: 0, spacing: 0, radius: 0, textStyle: 0, iconFill: 0, iconWeight: 0 };
  const seen = new Set();
  for (const root of page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })) {
    for (const pair of await collect(root)) {
      const n = pair[0], owned = pair[1];
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      scanned++;
      const may = (f) => owned === null || owned.has(f);
      const bv = n.boundVariables || {};
      for (const key of ['fills', 'strokes']) {
        if (!may(key)) continue;
        const list = n[key];
        if (!Array.isArray(list)) continue;
        for (const p of list) {
          if (p.type === 'SOLID' && p.visible !== false && !(p.boundVariables && p.boundVariables.color)) {
            counts.color++;
            if (samples.color.length < 30) samples.color.push(page.name + ' :: ' + pathOf(n) + ' [' + n.type + '.' + key + ']');
          }
        }
      }
      if ('layoutMode' in n && n.layoutMode !== 'NONE') {
        if (may('itemSpacing') && n.itemSpacing > 0 && !bv.itemSpacing) { counts.spacing++; if (samples.spacing.length < 30) samples.spacing.push(page.name + ' :: ' + pathOf(n) + ' gap=' + n.itemSpacing); }
        for (const f of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'])
          if (may(f) && n[f] > 0 && !bv[f]) { counts.spacing++; if (samples.spacing.length < 30) samples.spacing.push(page.name + ' :: ' + pathOf(n) + ' ' + f + '=' + n[f]); }
      }
      // A COMPONENT_SET's own 5px corner is Figma's canvas chrome, not ours.
      if (n.type !== 'COMPONENT_SET') {
        for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'])
          if (may(f) && n[f] > 0 && !bv[f]) { counts.radius++; if (samples.radius.length < 30) samples.radius.push(page.name + ' :: ' + pathOf(n) + ' ' + f + '=' + n[f]); }
      }
      if (n.type === 'TEXT' && may('textStyleId') && !n.textStyleId) { counts.textStyle++; if (samples.textStyle.length < 30) samples.textStyle.push(page.name + ' :: ' + pathOf(n)); }
      if (n.type === 'INSTANCE') {
        let mc = null;
        try { mc = await n.getMainComponentAsync(); } catch (e) { mc = null; }
        if (mc && mc.remote) {
          if (Array.isArray(n.fills) && n.fills.some((f) => f.visible !== false)) {
            counts.iconFill++;
            if (samples.iconFill.length < 30) samples.iconFill.push(page.name + ' :: ' + pathOf(n));
          }
          const want = 2 * (n.width / 24);
          for (const k of subtree(n, [])) {
            if (k.type !== 'VECTOR') continue;
            if (Math.abs(k.strokeWeight - want) > 0.02) {
              counts.iconWeight++;
              if (samples.iconWeight.length < 30) samples.iconWeight.push(page.name + ' :: ' + pathOf(n) + ' ' + n.width + 'px w=' + k.strokeWeight + ' want ' + Math.round(want * 1000) / 1000);
              break;
            }
          }
        }
      }
    }
  }
  if (CATS.reduce((s, c) => s + counts[c], 0)) perPage[page.name] = counts;
}
const totals = {};
for (const c of CATS) totals[c] = Object.values(perPage).reduce((s, p) => s + p[c], 0);
return { scanned, totals, perPage, samples };
`
