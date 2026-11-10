/**
 * PosIcons — one consistent line-icon set for the POS screen (24px grid, 1.8 stroke,
 * currentColor). Bundled inline: the app is offline-first, so no icon fonts or CDNs.
 */

function Svg({ size = 20, className = '', strokeWidth = 1.8, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const make = (paths) => function PosIcon(props) {
  return <Svg {...props}>{paths}</Svg>;
};

/* ---------- Interface icons ---------- */
export const SearchIcon = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const BarcodeIcon = make(<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M13 8v8M16 8v8" /></>);
export const DrawerIcon = make(<><rect x="3" y="11" width="18" height="9" rx="2" /><path d="M6 11V6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5" /><path d="M10 15.5h4" /></>);
export const MonitorIcon = make(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>);
export const TrashIcon = make(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>);
export const PauseIcon = make(<><path d="M9 5v14M15 5v14" /></>);
export const UserIcon = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const ChevronDownIcon = make(<path d="m6 9 6 6 6-6" />);
export const CashIcon = make(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>);
export const CardIcon = make(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>);
export const ClockIcon = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const PrinterIcon = make(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>);
export const LockIcon = make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = make(<path d="M5 12h14" />);
export const ReceiptIcon = make(<><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>);
export const ChartIcon = make(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
export const CheckIcon = make(<path d="m5 12 5 5L20 7" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />);
export const ScaleIcon = make(<><path d="M12 3v18M7 21h10M5 7h14" /><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" /></>);
export const TableIcon = make(<><path d="M3 9h18M5 9v11M19 9v11" /><path d="M8 9V5h8v4" /></>);
export const TagIcon = make(<><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>);
export const BagIcon = make(<><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>);
export const AlertIcon = make(<><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18h.01" /></>);
export const PlayIcon = make(<path d="M7 4v16l13-8z" />);
export const LogoutIcon = make(<><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></>);
export const WalletIcon = make(<><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 14h2" /></>);

/* ---------- Inventory icons ---------- */
export const StoreIcon = make(<><path d="M4 21V9l8-6 8 6v12" /><path d="M10 21v-6a2 2 0 0 1 4 0v6M4 21h16" /></>);
export const WarehouseIcon = make(<><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8M7 17h10" /></>);
export const PackageIcon = make(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10M7.5 5l9 4" /></>);
export const BarsIcon = make(<><path d="M4 20h16" /><path d="M7 16V9M12 16V5M17 16v-4" /></>);
export const SwapIcon = make(<><path d="M4 8h14l-3-3M20 16H6l3 3" /></>);
export const ClipboardCheckIcon = make(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 13l2 2 4-4" /></>);
export const PulseIcon = make(<path d="M3 12h4l2-6 4 12 2-6h6" />);
export const RefreshIcon = make(<><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1" /><path d="M18 3v4.5h-4.5M6 21v-4.5h4.5" /></>);
export const StarIcon = make(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />);
export const SlidersIcon = make(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const InfoIcon = make(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>);
export const ChevronSideIcon = make(<path d="m15 6-6 6 6 6" />);
export const DownloadIcon = make(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 19h16" /></>);
export const UploadIcon = make(<><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 19h16" /></>);
export const EyeIcon = make(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const TrendUpIcon = make(<><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>);
export const CurrencyIcon = make(<><path d="M12 3v18" /><path d="M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6" /></>);
export const FileTextIcon = make(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>);
export const UndoIcon = make(<><path d="M4 8v5h5" /><path d="M4.5 13A8 8 0 1 0 7 6.6L4 9" /></>);
export const KeyIcon = make(<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3M16 7l3 3M14 9l2 2" /></>);
export const PencilIcon = make(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>);
export const MapPinIcon = make(<><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>);
export const ShieldIcon = make(<><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>);
export const GiftIcon = make(<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3-5-1s3 1 5 1zM12 8c1.5-3 5-3 5-1s-3 1-5 1z" /></>);
export const UsersIcon = make(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>);
export const UserPlusIcon = make(<><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></>);
export const BuildingIcon = make(<><path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18" /><path d="M9 7h2M9 11h2M9 15h2" /></>);
export const KanbanIcon = make(<><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>);
export const CalendarIcon = make(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const BoltIcon = make(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />);
export const GridIcon = make(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const BriefcaseIcon = make(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></>);
export const PercentIcon = make(<><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>);
export const ArrowUpIcon = make(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowDownIcon = make(<path d="M12 5v14M6 13l6 6 6-6" />);
export const CallIcon = make(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />);
export const SheetIcon = make(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>);

/* ---------- Product icons ---------- */
const BowlIcon = make(<><path d="M3 12h18a9 9 0 0 1-18 0z" /><path d="M8 4c0 2 1 2 1 4M12 3c0 2 1 2 1 4M16 4c0 2 1 2 1 4" /></>);
const MeatIcon = make(<><path d="M4 14c-2-5 3-11 9-10s9 6 6 11-12 4-15-1z" /><circle cx="14" cy="10" r="2.5" /></>);
const DrumstickIcon = make(<><path d="M15 3a6 6 0 0 1 5 8c-1 3-5 4-7 3l-4 4" /><path d="M9 18a2 2 0 1 1-3 3 2 2 0 1 1-3-3 2 2 0 0 1 3-3z" /></>);
const LeafIcon = make(<><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z" /><path d="M5 19 13 11" /></>);
const CupIcon = make(<><path d="M6 8h12l-1.5 13h-9z" /><path d="M5 8h14M12 8l2-5h3" /></>);
const CoffeeIcon = make(<><path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" /></>);
const CakeIcon = make(<><path d="M4 21V13h16v8M2 21h20" /><path d="M4 16c2 1 4 1 6 0s4-1 6 0 3 1 4 0M12 13V9M12 6l-.5-2" /></>);
const PizzaIcon = make(<><path d="M12 21 3 6c6-3 12-3 18 0z" /><path d="M4.5 9c5-2 10-2 15 0" /><circle cx="11" cy="12" r="1" /><circle cx="14" cy="15" r="1" /></>);
const BurgerIcon = make(<><path d="M4 11a8 6 0 0 1 16 0z" /><path d="M3 14h18M5 17h14a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3z" /></>);
const MilkIcon = make(<><path d="M8 2h8v4l2 3v13H6V9l2-3z" /><path d="M6 13h12" /></>);
const CheeseIcon = make(<><path d="M3 17V10l12-6 6 6v7z" /><path d="M3 10h18" /><circle cx="9" cy="14" r="1.2" /><circle cx="15" cy="13.5" r="1" /></>);
const AppleIcon = make(<><path d="M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5z" /><path d="M12 7c0-2 1-4 3-4" /></>);
const CanIcon = make(<><ellipse cx="12" cy="5" rx="6" ry="2" /><path d="M6 5v14c0 1.1 2.7 2 6 2s6-.9 6-2V5M6 10h12" /></>);
const BottleIcon = make(<><path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z" /><path d="M8 13h8" /></>);
const GrainIcon = make(<><path d="M7 4h10l2 6v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9z" /><path d="M5 10h14M10 14h4" /></>);
const CandyIcon = make(<><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M9 6v12M15 6v12M4 12h16" /></>);
const BasketIcon = make(<><path d="M3 10h18l-2 10H5z" /><path d="M8 10l3-6M16 10l-3-6M9 14v3M15 14v3" /></>);
const ShirtIcon = make(<path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z" />);
const PantsIcon = make(<path d="M6 3h12l1 18h-5l-2-11-2 11H5z" />);
const ShoeIcon = make(<><path d="M3 17V8l5 1 3 4 8 1a3 3 0 0 1 3 3v1H3z" /><path d="M3 20h19" /></>);
const DressIcon = make(<path d="M9 2h6l-1 5 5 14H5l5-14z" />);
const JacketIcon = make(<><path d="M8 3 3 7v14h6V12M16 3l5 4v14h-6V12" /><path d="M8 3l4 5 4-5M12 8v13" /></>);
const CapIcon = make(<><path d="M4 15a8 8 0 0 1 16 0z" /><path d="M20 15h2M12 7V5" /></>);
const BackpackIcon = make(<><rect x="5" y="7" width="14" height="14" rx="3" /><path d="M9 7V5a3 3 0 0 1 6 0v2M8 14h8" /></>);
const ScissorsIcon = make(<><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.5 20 18M8.5 16.5 20 6" /></>);
const SpaIcon = make(<><path d="M12 21c-5 0-9-3-9-7 3 0 6 1 9 4 3-3 6-4 9-4 0 4-4 7-9 7z" /><path d="M12 18c-2-3-2-8 0-13 2 5 2 10 0 13z" /></>);
const BarberIcon = make(<><rect x="8" y="3" width="8" height="18" rx="4" /><path d="m8 9 8-3M8 14l8-3M8 19l8-3" /></>);
const PhoneIcon = make(<><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>);
const HeadphonesIcon = make(<><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="1" /><rect x="17" y="14" width="4" height="7" rx="1" /></>);
const PlugIcon = make(<><path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5" /></>);
const LaptopIcon = make(<><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 19h20" /></>);
const WrenchIcon = make(<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z" />);
const BatteryIcon = make(<><rect x="2" y="7" width="17" height="10" rx="2" /><path d="M22 11v2M6 10v4M10 10v4" /></>);
const DumbbellIcon = make(<><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></>);
export const TrophyIcon = make(<><path d="M8 3h8v6a4 4 0 0 1-8 0z" /><path d="M8 5H4a3 3 0 0 0 4 4M16 5h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6" /></>);
const BreadIcon = make(<><path d="M5 11a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v9H5z" /><path d="M9 11v4M15 11v4" /></>);
const EggIcon = make(<path d="M12 3c4 0 7 7 7 11a7 7 0 0 1-14 0c0-4 3-11 7-11z" />);
const LemonIcon = make(<><ellipse cx="12" cy="12" rx="8" ry="6" transform="rotate(-30 12 12)" /><path d="M18 5l2-2M4 19l2-2" /></>);
const BoxIcon = make(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>);
const PlateIcon = make(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></>);

const EMOJI_ICONS = {
  '🍲': BowlIcon, '🥩': MeatIcon, '🍗': DrumstickIcon, '🥗': LeafIcon, '🥤': CupIcon, '☕': CoffeeIcon,
  '🍰': CakeIcon, '🍕': PizzaIcon, '🍔': BurgerIcon, '🍽️': PlateIcon, '🥛': MilkIcon, '🧀': CheeseIcon,
  '🍎': AppleIcon, '🥫': CanIcon, '🧴': BottleIcon, '🍚': GrainIcon, '🍫': CandyIcon, '🛒': BasketIcon,
  '👕': ShirtIcon, '👔': ShirtIcon, '👖': PantsIcon, '👟': ShoeIcon, '👗': DressIcon, '🧥': JacketIcon,
  '🧢': CapIcon, '🎒': BackpackIcon, '✂️': ScissorsIcon, '💆': SpaIcon, '💈': BarberIcon, '📱': PhoneIcon,
  '🎧': HeadphonesIcon, '🔌': PlugIcon, '💻': LaptopIcon, '🖥️': LaptopIcon, '🔧': WrenchIcon,
  '🔋': BatteryIcon, '🏋️‍♂️': DumbbellIcon, '🏆': TrophyIcon, '🥖': BreadIcon, '🥚': EggIcon,
  '🍋': LemonIcon, '🛍️': BagIcon,
};

/**
 * Line icon for a product/category emoji produced by getCategoryIcon (or chosen for a
 * speed key). The emoji stays the data used elsewhere; the POS draws it as a line icon.
 */
export function ProductLineIcon({ emoji, size = 28, className = '' }) {
  const Icon = EMOJI_ICONS[emoji] || BoxIcon;
  return <Icon size={size} className={className} />;
}
