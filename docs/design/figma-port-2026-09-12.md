# Figma port — Inventory and Pool out of **Orders** into their own files

2026-09-12. Every Inventory, Lot and Pool frame and component drawn by our
agents in **Orders** `ymmNlCDLVIfanpRQ7QHMIs` was rebuilt in two new files Jacob
created:

| file | key |
|---|---|
| Inventory | `b7A7kli4mQwAe1zPQOXq2I` |
| Pool | `42rTWgn60MBCvarn99L5q9` |
| library used by both | Themes and Components `8A73quhBLBqotJlX95jN9j` |

**Nothing in Orders was changed, moved or deleted.** The port reads the source
and writes the targets; the only write to Orders is plugin data on the document
root, which holds the serialiser (see Method) and is invisible on the canvas.

---

## Why a rebuild and not a copy

The Figma plugin API cannot move a node between files, and there is no clipboard
from a plugin. The only route is to read a node's full tree in the source and
recreate it in the target.

## Method

Two pieces of JavaScript live in each file's document plugin data
(namespace `dxport`) and are `eval`-ed at the top of every call, because globals
do not survive between plugin runs:

- **`ser2`** in Orders — the serialiser. It walks a node and emits a compact
  JSON tree. It **stops at every instance**: instead of the subtree it records
  the main component's key, the component properties, and the instance's
  override list as index paths plus the overridden values. Repeated blobs
  (paint arrays, bound-variable maps, text segment runs) are interned into one
  dictionary, and every variable and style is recorded by **library key**, never
  by file-local id. A variable-bound paint keeps a literal colour as a fallback.
  Output is stored in 11 000-character chunks, tagged per worker so parallel
  workers do not collide.
- **`bld`** in each target — the builder. It imports every variable
  (`importVariableByKeyAsync`), text/paint/effect style (`importStyleByKeyAsync`)
  and library component (`importComponentByKeyAsync`) by key, creates instances
  from them, replays component properties and overrides, and rebuilds plain
  frames, text and shapes. Local components are recreated as real local
  components with the same names and variant axes; a `source id -> target id`
  registry in plugin data lets later builds point their instances at the
  recreated component rather than the source one.

Order of work: local components first (they have no local dependencies of their
own — every one of them is built only from library instances), then the screens,
which are almost entirely instances of those components.

Integrity was checked twice per node: the rebuilt payload's
`JSON.stringify(P).length` had to equal the serialiser's reported length, and a
screenshot of source and target at the same size was diffed pixel by pixel.
A pass is zero differing pixels, or a maximum channel difference of 1-2, which
is text antialiasing.

---

## Target layout

### Inventory `b7A7kli4mQwAe1zPQOXq2I`

| page | holds |
|---|---|
| `Inventory` | the screens — 7 Lot states desktop, 7 mobile, 4 Inventory list states, 5 dialogs open desktop, 5 mobile, plus the screen labels |
| `Components` | sections `Shared`, `Inventory · list`, `Lot screen`, `Dialogs` |

### Pool `42rTWgn60MBCvarn99L5q9`

| page | holds |
|---|---|
| `Pool` | overview, ledger, the two empties, Lock ounces open, and the mobiles |
| `Components` | sections `Pool · components`, `Shared` |

---

## Node map

Old ids are the **Orders** file. New ids are the target file named in the file
column. `verified` is the screenshot diff.

<!-- TABLE -->

---

## Fidelity

<!-- FIDELITY -->

---

## Safe to delete in Orders

<!-- DELETE -->
