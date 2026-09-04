# @dorado/icons

One icon surface for the whole tree.

## Why this exists

The tree had two icon libraries and, worse, two versions of one of them.
`frontend` resolved lucide-react 0.477.0 while `@dorado/components` resolved
0.510.0, so the app shipped both copies and `Table.tsx` compiled against a
`Funnel` glyph the frontend's own version does not have. Phosphor sat alongside
it across 55 more files. An icon is a design system decision, and it was being
made independently in three places.

## The Figma library is Lucide

The icon components in the Figma library carry Lucide's own kebab names
(`arrow-left`, node 510:14), and Figma serves them from a separate `Icons`
library. Re-exporting Lucide is therefore not a convenience wrapper. It is the
code half of the drawn icon set, the same relationship `@dorado/components` has
with the drawn components.

## Usage

Import the glyph, size it at the call site with a `size-*` utility, and let it
inherit `currentColor`. Do not set width or height props: the drawing tiers
icons with their control, and that tier lives in the component. Button, for
instance, is 14/16/20 by size.

```tsx
import { ShoppingCart } from "@dorado/icons";

<ShoppingCart aria-hidden className="size-4" />
```

Decorative icons take `aria-hidden`. An icon that is the only content of a
control needs an accessible name on the control, never on the glyph.

## Migration status

Call sites are NOT migrated yet (Jacob, 2026-09-03: package only, no call site
changes). Nothing imports this package so far. It is the destination, and the
table below is what makes the migration mechanical.

Still outstanding, and deliberately left for a human: `frontend` should move to
lucide-react ^0.510.0 so one copy serves the whole tree. A minor Lucide bump can
redraw a glyph, so it wants eyes on it rather than a silent bump.

## Phosphor to Lucide

Every `@phosphor-icons/react` glyph the tree imports, and the export here that
replaces it. Most are a pure rename. The four marked approximate have no Lucide
twin and need a human eye before they are swapped.

| Phosphor | Lucide | |
|---|---|---|
| `AddressBookIcon` | `ContactRound` |  |
| `ArrowDownIcon` | `ArrowDown` |  |
| `ArrowLeftIcon` | `ArrowLeft` |  |
| `ArrowRightIcon` | `ArrowRight` |  |
| `ArrowUpIcon` | `ArrowUp` |  |
| `ArrowUpRightIcon` | `ArrowUpRight` |  |
| `BarbellIcon` | `Dumbbell` | approximate |
| `CalculatorIcon` | `Calculator` |  |
| `CalendarIcon` | `Calendar` |  |
| `CaretDoubleRightIcon` | `ChevronsRight` |  |
| `CaretDownIcon` | `ChevronDown` |  |
| `CaretLeftIcon` | `ChevronLeft` |  |
| `CaretRightIcon` | `ChevronRight` |  |
| `CaretUpIcon` | `ChevronUp` |  |
| `CashRegisterIcon` | `Store` | approximate |
| `ChartLineUpIcon` | `TrendingUp` |  |
| `ChatTextIcon` | `MessageSquareText` |  |
| `ChatsCircleIcon` | `MessagesSquare` |  |
| `CheckCircleIcon` | `CircleCheck` |  |
| `CheckIcon` | `Check` |  |
| `CircleIcon` | `Circle` |  |
| `ClipboardTextIcon` | `ClipboardList` |  |
| `ClockIcon` | `Clock` |  |
| `CoinsIcon` | `Coins` |  |
| `ColumnsIcon` | `Columns3` |  |
| `CurrencyDollarIcon` | `DollarSign` |  |
| `DeviceMobileIcon` | `Smartphone` |  |
| `DevicesIcon` | `MonitorSmartphone` |  |
| `DownloadIcon` | `Download` |  |
| `EnvelopeIcon` | `Mail` |  |
| `EyeIcon` | `Eye` |  |
| `EyeSlashIcon` | `EyeOff` |  |
| `FloppyDiskIcon` | `Save` |  |
| `InfoIcon` | `Info` |  |
| `LassoIcon` | `Lasso` |  |
| `ListIcon` | `List` |  |
| `LockIcon` | `Lock` |  |
| `LockOpenIcon` | `LockOpen` |  |
| `MagnifyingGlassIcon` | `Search` |  |
| `MapPinIcon` | `MapPin` |  |
| `MinusIcon` | `Minus` |  |
| `MoneyIcon` | `Banknote` |  |
| `PenIcon` | `Pen` |  |
| `PencilSimpleIcon` | `Pencil` |  |
| `PercentIcon` | `Percent` |  |
| `PlusIcon` | `Plus` |  |
| `QuestionIcon` | `CircleHelp` |  |
| `RowsPlusTopIcon` | `Rows3` | approximate |
| `ScalesIcon` | `Scale` |  |
| `ShieldCheckIcon` | `ShieldCheck` |  |
| `ShieldSlashIcon` | `ShieldOff` |  |
| `ShippingContainerIcon` | `Container` |  |
| `ShoppingCartIcon` | `ShoppingCart` |  |
| `ShoppingCartSimpleIcon` | `ShoppingCart` |  |
| `SignInIcon` | `LogIn` |  |
| `SignOutIcon` | `LogOut` |  |
| `SketchLogoIcon` | `Gem` |  |
| `SmileyIcon` | `Smile` |  |
| `StarIcon` | `Star` |  |
| `SwapIcon` | `ArrowLeftRight` |  |
| `TagIcon` | `Tag` |  |
| `TrashIcon` | `Trash2` |  |
| `TruckIcon` | `Truck` |  |
| `UserCircleIcon` | `CircleUser` |  |
| `UserIcon` | `User` |  |
| `UserPlusIcon` | `UserPlus` |  |
| `UsersIcon` | `Users` |  |
| `WalletIcon` | `Wallet` |  |
| `XIcon` | `X` |  |
