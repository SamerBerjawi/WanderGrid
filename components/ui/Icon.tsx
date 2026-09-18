import React from 'react';
import {
  SquaresFour,
  X,
  Check,
  GlobeHemisphereWest,
  Globe,
  AirplaneTakeoff,
  Airplane,
  Compass,
  MapTrifold,
  CalendarBlank,
  Car,
  Gear,
  Moon,
  Sun,
  DotsThreeOutline,
  CaretRight,
  CaretLeft,
  CaretDown,
  CaretUp,
  Trophy,
  MapPin,
  CheckCircle,
  ShieldCheck,
  SuitcaseSimple,
  TrendUp,
  Cpu,
  Stack,
  WifiHigh,
  Sparkle,
  Ticket,
  Pulse,
  Info,
  WarningCircle,
  Warning,
  ArrowCounterClockwise,
  NavigationArrow,
  Clock,
  Plus,
  Funnel,
  DownloadSimple,
  UploadSimple,
  Trash,
  PencilSimple,
  GasPump,
  Users,
  Lock,
  Star,
  Heart,
  BookOpen,
  Question,
  User,
  Eye,
  EyeSlash,
  Palette,
  CloudRain,
  ArrowsOut,
  ArrowsIn,
  MagnifyingGlass,
  SlidersHorizontal,
  CornersOut,
  IconProps as PhosphorProps,
} from '@phosphor-icons/react';

export interface IconProps extends Omit<PhosphorProps, 'name'> {
  name: string;
  className?: string;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}

const ICON_MAP: Record<string, React.ComponentType<PhosphorProps>> = {
  // Navigation & Shell
  grid_view: SquaresFour,
  dashboard: SquaresFour,
  public: GlobeHemisphereWest,
  flight_takeoff: AirplaneTakeoff,
  explore: Compass,
  map: MapTrifold,
  calendar_month: CalendarBlank,
  calendar: CalendarBlank,
  directions_car: Car,
  car: Car,
  settings: Gear,
  gear: Gear,
  dark_mode: Moon,
  moon: Moon,
  light_mode: Sun,
  sun: Sun,
  more_horiz: DotsThreeOutline,
  more: DotsThreeOutline,

  // UI Actions & Common
  category: SquaresFour,
  close: X,
  x: X,
  check: Check,
  check_circle: CheckCircle,
  checkcircle: CheckCircle,
  chevron_right: CaretRight,
  chevron_left: CaretLeft,
  chevron_down: CaretDown,
  chevron_up: CaretUp,
  caret_right: CaretRight,
  caret_left: CaretLeft,
  caret_down: CaretDown,
  caret_up: CaretUp,

  // Map & Transportation
  plane: Airplane,
  airplane: Airplane,
  compass: Compass,
  globe: Globe,
  scan: CornersOut,
  navigation: NavigationArrow,
  gas_pump: GasPump,
  fuel: GasPump,

  // Data, Analytics & General
  search: MagnifyingGlass,
  magnifying_glass: MagnifyingGlass,
  trophy: Trophy,
  award: Trophy,
  pin: MapPin,
  map_pin: MapPin,
  shield: ShieldCheck,
  briefcase: SuitcaseSimple,
  trending_up: TrendUp,
  cpu: Cpu,
  layers: Stack,
  wifi: WifiHigh,
  sparkles: Sparkle,
  sparkle: Sparkle,
  ticket: Ticket,
  activity: Pulse,
  pulse: Pulse,
  info: Info,
  warning: WarningCircle,
  alert: Warning,
  rotate_ccw: ArrowCounterClockwise,
  clock: Clock,
  plus: Plus,
  filter: Funnel,
  download: DownloadSimple,
  upload: UploadSimple,
  trash: Trash,
  edit: PencilSimple,
  users: Users,
  lock: Lock,
  star: Star,
  heart: Heart,
  book: BookOpen,
  help: Question,
  user: User,
  eye: Eye,
  eye_off: EyeSlash,
  palette: Palette,
  rain: CloudRain,
  maximize: ArrowsOut,
  minimize: ArrowsIn,
  sliders: SlidersHorizontal,
};

export const Icon: React.FC<IconProps> = ({
  name,
  className = '',
  weight = 'duotone',
  size,
  color,
  mirrored,
  style,
  ...props
}) => {
  const normalized = (name || '').toLowerCase().trim().replace(/[-]/g, '_');
  const Component = ICON_MAP[normalized];

  if (Component) {
    return (
      <Component
        weight={weight}
        size={size || '1em'}
        color={color}
        mirrored={mirrored}
        className={`inline-block shrink-0 ${className}`}
        style={style}
        {...props}
      />
    );
  }

  // Fallback to SquaresFour if unknown
  return (
    <SquaresFour
      weight={weight}
      size={size || '1em'}
      color={color}
      mirrored={mirrored}
      className={`inline-block shrink-0 ${className}`}
      style={style}
      {...props}
    />
  );
};

export default Icon;
