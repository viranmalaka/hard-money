import React from "react";
import {
  // Food & Dining
  Utensils,
  Coffee,
  Wine,
  Pizza,
  Apple,
  Beer,
  Cake,
  IceCream,
  // Shopping & Groceries
  ShoppingCart,
  ShoppingBag,
  Store,
  Shirt,
  Package,
  Gift,
  Tag,
  // Transport & Travel
  Car,
  Fuel,
  Bus,
  Train,
  Plane,
  Bike,
  Navigation,
  MapPin,
  // Bills & Home
  Home,
  Zap,
  Droplet,
  Wifi,
  Tv,
  Phone,
  Shield,
  Wrench,
  // Health & Wellbeing
  HeartPulse,
  Activity,
  Pill,
  Dumbbell,
  Smile,
  Stethoscope,
  // Entertainment & Leisure
  Film,
  Music,
  Gamepad2,
  BookOpen,
  Camera,
  Ticket,
  Palmtree,
  // Income & Finances
  Wallet,
  Banknote,
  CreditCard,
  TrendingUp,
  PiggyBank,
  Coins,
  DollarSign,
  Briefcase,
  Landmark,
  Receipt,
  Percent,
  Sliders,
  AlertCircle,
  ArrowDownCircle,
  // Education & Work
  GraduationCap,
  Laptop,
  FileText,
  Layers,
  Folder,
  LucideIcon,
} from "lucide-react";

export interface CategoryIconMeta {
  name: string;
  label: string;
  group: "Food & Dining" | "Shopping" | "Transport" | "Home & Bills" | "Health" | "Leisure" | "Income & Finance" | "Work & Study";
  icon: LucideIcon;
}

export const CURATED_CATEGORY_ICONS: CategoryIconMeta[] = [
  // Food & Dining
  { name: "Utensils", label: "Dining & Food", group: "Food & Dining", icon: Utensils },
  { name: "Coffee", label: "Café & Coffee", group: "Food & Dining", icon: Coffee },
  { name: "Pizza", label: "Fast Food", group: "Food & Dining", icon: Pizza },
  { name: "Apple", label: "Fresh Food & Fruit", group: "Food & Dining", icon: Apple },
  { name: "Wine", label: "Drinks & Bar", group: "Food & Dining", icon: Wine },
  { name: "Beer", label: "Pub & Beer", group: "Food & Dining", icon: Beer },
  { name: "Cake", label: "Bakery & Sweets", group: "Food & Dining", icon: Cake },
  { name: "IceCream", label: "Dessert", group: "Food & Dining", icon: IceCream },

  // Shopping & Groceries
  { name: "ShoppingCart", label: "Groceries", group: "Shopping", icon: ShoppingCart },
  { name: "ShoppingBag", label: "Retail & Clothes", group: "Shopping", icon: ShoppingBag },
  { name: "Store", label: "Supermarket", group: "Shopping", icon: Store },
  { name: "Shirt", label: "Apparel & Fashion", group: "Shopping", icon: Shirt },
  { name: "Package", label: "Delivery & Orders", group: "Shopping", icon: Package },
  { name: "Gift", label: "Gifts & Donations", group: "Shopping", icon: Gift },
  { name: "Tag", label: "General Tag", group: "Shopping", icon: Tag },

  // Transport & Travel
  { name: "Car", label: "Automobile & Taxi", group: "Transport", icon: Car },
  { name: "Fuel", label: "Gas & Fuel", group: "Transport", icon: Fuel },
  { name: "Bus", label: "Public Transit", group: "Transport", icon: Bus },
  { name: "Train", label: "Train & Metro", group: "Transport", icon: Train },
  { name: "Plane", label: "Flights & Travel", group: "Transport", icon: Plane },
  { name: "Bike", label: "Cycling & Scooter", group: "Transport", icon: Bike },
  { name: "Navigation", label: "Commute", group: "Transport", icon: Navigation },
  { name: "MapPin", label: "Trip & Lodging", group: "Transport", icon: MapPin },

  // Home & Bills
  { name: "Home", label: "Rent & Mortgage", group: "Home & Bills", icon: Home },
  { name: "Zap", label: "Electricity & Utilities", group: "Home & Bills", icon: Zap },
  { name: "Droplet", label: "Water", group: "Home & Bills", icon: Droplet },
  { name: "Wifi", label: "Internet & Broadband", group: "Home & Bills", icon: Wifi },
  { name: "Phone", label: "Mobile & Telecom", group: "Home & Bills", icon: Phone },
  { name: "Tv", label: "Streaming & TV", group: "Home & Bills", icon: Tv },
  { name: "Shield", label: "Insurance & Security", group: "Home & Bills", icon: Shield },
  { name: "Wrench", label: "Repairs & Maintenance", group: "Home & Bills", icon: Wrench },

  // Health & Wellbeing
  { name: "HeartPulse", label: "Healthcare & Doctor", group: "Health", icon: HeartPulse },
  { name: "Pill", label: "Pharmacy & Medicine", group: "Health", icon: Pill },
  { name: "Activity", label: "Fitness & Wellness", group: "Health", icon: Activity },
  { name: "Dumbbell", label: "Gym & Sports", group: "Health", icon: Dumbbell },
  { name: "Smile", label: "Personal Care", group: "Health", icon: Smile },
  { name: "Stethoscope", label: "Medical Exams", group: "Health", icon: Stethoscope },

  // Leisure & Entertainment
  { name: "Film", label: "Cinema & Movies", group: "Leisure", icon: Film },
  { name: "Music", label: "Music & Concerts", group: "Leisure", icon: Music },
  { name: "Gamepad2", label: "Gaming", group: "Leisure", icon: Gamepad2 },
  { name: "BookOpen", label: "Books & Reading", group: "Leisure", icon: BookOpen },
  { name: "Camera", label: "Photography & Arts", group: "Leisure", icon: Camera },
  { name: "Ticket", label: "Events & Tickets", group: "Leisure", icon: Ticket },
  { name: "Palmtree", label: "Vacation & Holiday", group: "Leisure", icon: Palmtree },

  // Income & Finance
  { name: "Wallet", label: "Salary & Allowance", group: "Income & Finance", icon: Wallet },
  { name: "Banknote", label: "Cash & Direct Income", group: "Income & Finance", icon: Banknote },
  { name: "CreditCard", label: "Card & Payments", group: "Income & Finance", icon: CreditCard },
  { name: "TrendingUp", label: "Investment & Capital", group: "Income & Finance", icon: TrendingUp },
  { name: "PiggyBank", label: "Savings", group: "Income & Finance", icon: PiggyBank },
  { name: "Coins", label: "Interest & Dividends", group: "Income & Finance", icon: Coins },
  { name: "DollarSign", label: "Income / Cash", group: "Income & Finance", icon: DollarSign },
  { name: "Briefcase", label: "Consulting & Business", group: "Income & Finance", icon: Briefcase },
  { name: "Landmark", label: "Bank & Treasury", group: "Income & Finance", icon: Landmark },
  { name: "Receipt", label: "Taxes & Invoices", group: "Income & Finance", icon: Receipt },
  { name: "Percent", label: "Discounts & Rebates", group: "Income & Finance", icon: Percent },
  { name: "Sliders", label: "Calibration", group: "Income & Finance", icon: Sliders },
  { name: "AlertCircle", label: "Bank Fees", group: "Income & Finance", icon: AlertCircle },
  { name: "ArrowDownCircle", label: "Cash Withdrawal", group: "Income & Finance", icon: ArrowDownCircle },

  // Work & Study
  { name: "GraduationCap", label: "Education & Tuition", group: "Work & Study", icon: GraduationCap },
  { name: "Laptop", label: "Software & Technology", group: "Work & Study", icon: Laptop },
  { name: "FileText", label: "Bills & Subscriptions", group: "Work & Study", icon: FileText },
  { name: "Layers", label: "Projects", group: "Work & Study", icon: Layers },
  { name: "Folder", label: "Documents & Admin", group: "Work & Study", icon: Folder },
];

export const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CURATED_CATEGORY_ICONS.map((item) => [item.name.toLowerCase(), item.icon])
);

interface CategoryIconProps {
  name?: string | null;
  size?: number;
  className?: string;
  color?: string;
}

export function CategoryIcon({
  name,
  size = 16,
  className = "",
  color,
}: CategoryIconProps) {
  const normalizedKey = (name || "").toLowerCase().replace(/[-_\s]/g, "");
  const FoundIcon = ICON_MAP[normalizedKey] || Tag;

  return (
    <FoundIcon
      size={size}
      className={className}
      style={color ? { color } : undefined}
    />
  );
}
