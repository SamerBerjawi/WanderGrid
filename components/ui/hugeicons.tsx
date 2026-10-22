/**
 * Hugeicons adapter. Exposes the icon names the app already uses with a
 * legacy icon-prop API (size, weight, className, color) on top of
 * @hugeicons/react, so call sites stay unchanged. Free pack = stroke-rounded
 * only, so 'weight' maps to stroke width ('duotone'/'fill' render as regular).
 */
import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  AddSquareIcon,
  Airplane01Icon,
  Airplane02Icon,
  AirplaneLanding01Icon,
  AirplaneTakeOff01Icon,
  Alert02Icon,
  AlertCircleIcon,
  AnchorIcon,
  AntennaIcon,
  LinkSquare02Icon,
  Undo03Icon,
  ArchiveIcon,
  ArmchairIcon,
  ArrowDown01Icon,
  ArrowDownLeft01Icon,
  ArrowExpand01Icon,
  ArrowExpandIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowShrink02Icon,
  ArrowShrinkIcon,
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  AtomIcon,
  Award01Icon,
  BackpackIcon,
  BedIcon,
  BeerIcon,
  BinocularsIcon,
  BoatIcon,
  FerryBoatIcon,
  ShipIcon,
  BookOpen01Icon,
  Briefcase01Icon,
  Briefcase02Icon,
  Building03Icon,
  Building06Icon,
  Bus01Icon,
  Calendar03Icon,
  CalendarCheckIn01Icon,
  Camera01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  Car01Icon,
  Car05Icon,
  ChartBarLineIcon,
  ChartIncreaseIcon,
  CarouselHorizontalIcon,
  CheckmarkCircle02Icon,
  CheckmarkSquare02Icon,
  CircleIcon,
  Clock01Icon,
  CloudAngledRainIcon,
  CloudAngledZapIcon,
  CloudIcon,
  ColumnInsertIcon,
  Compass01Icon,
  ComputerIcon,
  Copy01Icon,
  CpuIcon,
  CrownIcon,
  CubeIcon,
  DashboardCircleIcon,
  DashboardSpeed01Icon,
  DatabaseIcon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  DragDropVerticalIcon,
  DropletIcon,
  Edit02Icon,
  FavouriteIcon,
  File01Icon,
  FilmRoll01Icon,
  FilterIcon,
  FireIcon,
  Flag01Icon,
  FlashIcon,
  FloppyDiskIcon,
  FolderAddIcon,
  FolderMinusIcon,
  FuelStationIcon,
  GitForkIcon,
  GitMergeIcon,
  GlobalIcon,
  Globe02Icon,
  GridViewIcon,
  HardDriveIcon,
  HelpCircleIcon,
  HexagonIcon,
  HistoryIcon,
  Home01Icon,
  HospitalBed01Icon,
  HourglassIcon,
  IdIcon,
  Idea01Icon,
  InformationCircleIcon,
  Invoice01Icon,
  KanbanIcon,
  Key01Icon,
  LayersLogoIcon,
  ListViewIcon,
  Loading03Icon,
  Location01Icon,
  LockIcon,
  Login01Icon,
  Logout01Icon,
  Mail01Icon,
  MapsIcon,
  MapsGlobal01Icon,
  Maximize01Icon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalCircle01Icon,
  MoreHorizontalIcon,
  MountainIcon,
  MountainSnowIcon,
  MapingIcon,
  Navigation03Icon,
  PaintBoardIcon,
  PencilEdit01Icon,
  PineTreeIcon,
  PlugSocketIcon,
  PulseIcon,
  RadioIcon,
  RefreshIcon,
  Restaurant01Icon,
  RoadIcon,
  Rocket01Icon,
  RotateClockwiseIcon,
  RotateLeft01Icon,
  Route01Icon,
  SaturnIcon,
  Search01Icon,
  AirplaneSeatIcon,
  SecurityCheckIcon,
  SentIcon,
  Settings01Icon,
  Settings04Icon,
  Airport02Icon,
  EditRoadIcon,
  SquaresUniteIcon,
  Share08Icon,
  Shirt01Icon,
  ShoppingBag01Icon,
  SidebarLeftIcon,
  SlidersHorizontalIcon,
  SmartPhone01Icon,
  SmileIcon,
  SnowIcon,
  SparklesIcon,
  SquareArrowUpRightIcon,
  SquareIcon,
  SquareUnlock01Icon,
  StarIcon,
  Store01Icon,
  Sun03Icon,
  SunCloud01Icon,
  SunsetIcon,
  Table01Icon,
  Tag01Icon,
  Tick02Icon,
  Ticket01Icon,
  TrainIcon,
  TreeIcon,
  Upload01Icon,
  UserCheck01Icon,
  UserCircleIcon,
  UserIcon,
  UserMultipleIcon,
  Video01Icon,
  ViewIcon,
  ViewOffIcon,
  WaveIcon,
  Wifi01Icon,
  WifiOff01Icon,
} from '@hugeicons/core-free-icons';

export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
type IconData = React.ComponentProps<typeof HugeiconsIcon>['icon'];

export interface IconProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'color'> {
  size?: number | string;
  weight?: IconWeight;
  color?: string;
  mirrored?: boolean;
  strokeWidth?: number;
}
export type Icon = React.ComponentType<IconProps>;

const STROKE: Record<IconWeight, number> = { thin: 1, light: 1.25, regular: 1.5, bold: 2, fill: 1.75, duotone: 1.5 };

export const IconContext = React.createContext<{ weight?: IconWeight; size?: number; color?: string }>({});

const make = (icon: IconData, displayName: string): Icon => {
  const C: Icon = ({ size, weight, color, mirrored, strokeWidth, className, style, ...rest }) => {
    const ctx = React.useContext(IconContext);
    const w = weight ?? ctx.weight ?? 'regular';
    return (
      <HugeiconsIcon
        icon={icon}
        size={(size ?? ctx.size ?? 24) as number}
        color={color ?? ctx.color ?? 'currentColor'}
        strokeWidth={strokeWidth ?? STROKE[w]}
        className={className}
        style={mirrored ? { ...style, transform: 'scaleX(-1)' } : style}
        {...(rest as object)}
      />
    );
  };
  C.displayName = displayName;
  return C;
};

export const Airplane = make(Airplane01Icon, 'Airplane');
export const AirplaneLanding = make(AirplaneLanding01Icon, 'AirplaneLanding');
export const AirplaneTakeoff = make(AirplaneTakeOff01Icon, 'AirplaneTakeoff');
export const AirplaneTilt = make(Airplane02Icon, 'AirplaneTilt');
export const Anchor = make(AnchorIcon, 'Anchor');
export const Archive = make(ArchiveIcon, 'Archive');
export const Armchair = make(ArmchairIcon, 'Armchair');
export const ArrowClockwise = make(RotateClockwiseIcon, 'ArrowClockwise');
export const ArrowCounterClockwise = make(RotateLeft01Icon, 'ArrowCounterClockwise');
export const ArrowDown = make(ArrowDown01Icon, 'ArrowDown');
export const ArrowDownLeft = make(ArrowDownLeft01Icon, 'ArrowDownLeft');
export const ArrowLeft = make(ArrowLeft01Icon, 'ArrowLeft');
export const ArrowRight = make(ArrowRight01Icon, 'ArrowRight');
export const ArrowSquareOut = make(SquareArrowUpRightIcon, 'ArrowSquareOut');
export const ArrowUp = make(ArrowUp01Icon, 'ArrowUp');
export const ArrowUpRight = make(ArrowUpRight01Icon, 'ArrowUpRight');
export const LinkSquare = make(LinkSquare02Icon, 'LinkSquare');
export const ArrowUndo = make(Undo03Icon, 'ArrowUndo');
export const ArrowsClockwise = make(RefreshIcon, 'ArrowsClockwise');
export const ArrowsIn = make(ArrowShrink02Icon, 'ArrowsIn');
export const ArrowsMerge = make(GitMergeIcon, 'ArrowsMerge');
export const ArrowsOut = make(ArrowExpand01Icon, 'ArrowsOut');
export const ArrowExpand = make(ArrowExpandIcon, 'ArrowExpand');
export const ArrowShrink = make(ArrowShrinkIcon, 'ArrowShrink');
export const Atom = make(AtomIcon, 'Atom');
export const Backpack = make(BackpackIcon, 'Backpack');
export const Bank = make(Building03Icon, 'Bank');
export const Bed = make(BedIcon, 'Bed');
export const Binoculars = make(BinocularsIcon, 'Binoculars');
export const Boat = make(BoatIcon, 'Boat');
export const Ferry = make(FerryBoatIcon, 'Ferry');
export const Ship = make(ShipIcon, 'Ship');
export const BookOpen = make(BookOpen01Icon, 'BookOpen');
export const Broadcast = make(AntennaIcon, 'Broadcast');
export const Buildings = make(Building06Icon, 'Buildings');
export const Bus = make(Bus01Icon, 'Bus');
export const Calendar = make(Calendar03Icon, 'Calendar');
export const CalendarBlank = make(Calendar03Icon, 'CalendarBlank');
export const CalendarCheck = make(CalendarCheckIn01Icon, 'CalendarCheck');
export const Camera = make(Camera01Icon, 'Camera');
export const Car = make(Car01Icon, 'Car');
export const CarProfile = make(Car05Icon, 'CarProfile');
export const CaretDown = make(ArrowDown01Icon, 'CaretDown');
export const CaretLeft = make(ArrowLeft01Icon, 'CaretLeft');
export const CaretRight = make(ArrowRight01Icon, 'CaretRight');
export const CaretUp = make(ArrowUp01Icon, 'CaretUp');
export const ChartBar = make(ChartBarLineIcon, 'ChartBar');
export const Check = make(Tick02Icon, 'Check');
export const Carousel = make(CarouselHorizontalIcon, 'Carousel');
export const CheckCircle = make(CheckmarkCircle02Icon, 'CheckCircle');
export const CheckSquare = make(CheckmarkSquare02Icon, 'CheckSquare');
export const CircleDashed = make(CircleIcon, 'CircleDashed');
export const CirclesThree = make(DashboardCircleIcon, 'CirclesThree');
export const Clock = make(Clock01Icon, 'Clock');
export const ClockCounterClockwise = make(HistoryIcon, 'ClockCounterClockwise');
export const Cloud = make(CloudIcon, 'Cloud');
export const CloudFog = make(CloudAngledZapIcon, 'CloudFog');
export const CloudLightning = make(CloudAngledZapIcon, 'CloudLightning');
export const CloudRain = make(CloudAngledRainIcon, 'CloudRain');
export const CloudSun = make(SunCloud01Icon, 'CloudSun');
export const Columns = make(ColumnInsertIcon, 'Columns');
export const Compass = make(Compass01Icon, 'Compass');
export const Copy = make(Copy01Icon, 'Copy');
export const CornersOut = make(Maximize01Icon, 'CornersOut');
export const Cpu = make(CpuIcon, 'Cpu');
export const Crown = make(CrownIcon, 'Crown');
export const Cube = make(CubeIcon, 'Cube');
export const CurrencyDollar = make(DollarCircleIcon, 'CurrencyDollar');
export const Database = make(DatabaseIcon, 'Database');
export const Desktop = make(ComputerIcon, 'Desktop');
export const DeviceMobile = make(SmartPhone01Icon, 'DeviceMobile');
export const DotsSixVertical = make(DragDropVerticalIcon, 'DotsSixVertical');
export const DotsThreeCircle = make(MoreHorizontalCircle01Icon, 'DotsThreeCircle');
export const DotsThreeOutline = make(MoreHorizontalIcon, 'DotsThreeOutline');
export const DownloadSimple = make(Download01Icon, 'DownloadSimple');
export const Drop = make(DropletIcon, 'Drop');
export const Envelope = make(Mail01Icon, 'Envelope');
export const Export = make(Share08Icon, 'Export');
export const Eye = make(ViewIcon, 'Eye');
export const EyeSlash = make(ViewOffIcon, 'EyeSlash');
export const FileText = make(File01Icon, 'FileText');
export const FilmSlate = make(Video01Icon, 'FilmSlate');
export const FilmStrip = make(FilmRoll01Icon, 'FilmStrip');
export const FirstAid = make(HospitalBed01Icon, 'FirstAid');
export const Flag = make(Flag01Icon, 'Flag');
export const Flame = make(FireIcon, 'Flame');
export const FloppyDisk = make(FloppyDiskIcon, 'FloppyDisk');
export const FolderMinus = make(FolderMinusIcon, 'FolderMinus');
export const FolderPlus = make(FolderAddIcon, 'FolderPlus');
export const ForkKnife = make(Restaurant01Icon, 'ForkKnife');
export const Funnel = make(FilterIcon, 'Funnel');
export const GasPump = make(FuelStationIcon, 'GasPump');
export const Gear = make(Settings01Icon, 'Gear');
export const Settings04 = make(Settings04Icon, 'Settings04');
export const MapsGlobal = make(MapsGlobal01Icon, 'MapsGlobal');
export const Airport = make(Airport02Icon, 'Airport');
export const EditRoad = make(EditRoadIcon, 'EditRoad');
export const SquaresUnite = make(SquaresUniteIcon, 'SquaresUnite');
export const GitFork = make(GitForkIcon, 'GitFork');
export const Globe = make(GlobalIcon, 'Globe');
export const GlobeHemisphereWest = make(Globe02Icon, 'GlobeHemisphereWest');
export const HardDrives = make(HardDriveIcon, 'HardDrives');
export const Heart = make(FavouriteIcon, 'Heart');
export const Hexagon = make(HexagonIcon, 'Hexagon');
export const Hourglass = make(HourglassIcon, 'Hourglass');
export const House = make(Home01Icon, 'House');
export const IdentificationCard = make(IdIcon, 'IdentificationCard');
export const Info = make(InformationCircleIcon, 'Info');
export const Kanban = make(KanbanIcon, 'Kanban');
export const Key = make(Key01Icon, 'Key');
export const Lightbulb = make(Idea01Icon, 'Lightbulb');
export const Lightning = make(FlashIcon, 'Lightning');
export const List = make(ListViewIcon, 'List');
export const Lock = make(LockIcon, 'Lock');
export const LockOpen = make(SquareUnlock01Icon, 'LockOpen');
export const MagnifyingGlass = make(Search01Icon, 'MagnifyingGlass');
export const MapPin = make(Location01Icon, 'MapPin');
export const MapTrifold = make(MapsIcon, 'MapTrifold');
export const Minus = make(MinusSignIcon, 'Minus');
export const Moon = make(Moon02Icon, 'Moon');
export const Mountains = make(MountainIcon, 'Mountains');
export const MountainSnow = make(MountainSnowIcon, 'MountainSnow');
export const Maping = make(MapingIcon, 'Maping');
export const NavigationArrow = make(Navigation03Icon, 'NavigationArrow');
export const Palette = make(PaintBoardIcon, 'Palette');
export const PaperPlaneTilt = make(SentIcon, 'PaperPlaneTilt');
export const Path = make(Route01Icon, 'Path');
export const PencilSimple = make(PencilEdit01Icon, 'PencilSimple');
export const PencilSimpleLine = make(Edit02Icon, 'PencilSimpleLine');
export const Planet = make(SaturnIcon, 'Planet');
export const Plugs = make(PlugSocketIcon, 'Plugs');
export const Plus = make(Add01Icon, 'Plus');
export const PlusSquare = make(AddSquareIcon, 'PlusSquare');
export const Pulse = make(PulseIcon, 'Pulse');
export const Question = make(HelpCircleIcon, 'Question');
export const Radio = make(RadioIcon, 'Radio');
export const Receipt = make(Invoice01Icon, 'Receipt');
export const RoadHorizon = make(RoadIcon, 'RoadHorizon');
export const RocketLaunch = make(Rocket01Icon, 'RocketLaunch');
export const Seat = make(AirplaneSeatIcon, 'Seat');
export const ShieldCheck = make(SecurityCheckIcon, 'ShieldCheck');
export const ShoppingBag = make(ShoppingBag01Icon, 'ShoppingBag');
export const SidebarSimple = make(SidebarLeftIcon, 'SidebarSimple');
export const SignIn = make(Login01Icon, 'SignIn');
export const SignOut = make(Logout01Icon, 'SignOut');
export const SlidersHorizontal = make(SlidersHorizontalIcon, 'SlidersHorizontal');
export const Smiley = make(SmileIcon, 'Smiley');
export const Snowflake = make(SnowIcon, 'Snowflake');
export const Sparkle = make(SparklesIcon, 'Sparkle');
export const Speedometer = make(DashboardSpeed01Icon, 'Speedometer');
export const Spinner = make(Loading03Icon, 'Spinner');
export const Square = make(SquareIcon, 'Square');
export const SquaresFour = make(GridViewIcon, 'SquaresFour');
export const Stack = make(LayersLogoIcon, 'Stack');
export const Star = make(StarIcon, 'Star');
export const Storefront = make(Store01Icon, 'Storefront');
export const Suitcase = make(Briefcase01Icon, 'Suitcase');
export const SuitcaseSimple = make(Briefcase02Icon, 'SuitcaseSimple');
export const Sun = make(Sun03Icon, 'Sun');
export const SunHorizon = make(SunsetIcon, 'SunHorizon');
export const TShirt = make(Shirt01Icon, 'TShirt');
export const Table = make(Table01Icon, 'Table');
export const Tag = make(Tag01Icon, 'Tag');
export const Ticket = make(Ticket01Icon, 'Ticket');
export const Train = make(TrainIcon, 'Train');
export const Trash = make(Delete02Icon, 'Trash');
export const Tree = make(TreeIcon, 'Tree');
export const TreeEvergreen = make(PineTreeIcon, 'TreeEvergreen');
export const TrendUp = make(ChartIncreaseIcon, 'TrendUp');
export const Trophy = make(Award01Icon, 'Trophy');
export const UploadSimple = make(Upload01Icon, 'UploadSimple');
export const User = make(UserIcon, 'User');
export const UserCheck = make(UserCheck01Icon, 'UserCheck');
export const UserCircle = make(UserCircleIcon, 'UserCircle');
export const Users = make(UserMultipleIcon, 'Users');
export const Warning = make(Alert02Icon, 'Warning');
export const WarningCircle = make(AlertCircleIcon, 'WarningCircle');
export const Waves = make(WaveIcon, 'Waves');
export const WifiHigh = make(Wifi01Icon, 'WifiHigh');
export const WifiSlash = make(WifiOff01Icon, 'WifiSlash');
export const Wine = make(BeerIcon, 'Wine');
export const X = make(Cancel01Icon, 'X');
export const XCircle = make(CancelCircleIcon, 'XCircle');
