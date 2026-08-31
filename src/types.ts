export type Category = string;

export const DEFAULT_CATEGORIES: string[] = ['Starters', 'Mains', 'Drinks', 'Desserts'];

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  image: string;
  available: boolean;
}

export type OrderItemStatus = 'Pending' | 'Cooking' | 'Served';

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  status: OrderItemStatus;
}

export type OrderStatus = 'New' | 'Acknowledged' | 'Ready' | 'Billed';

export interface Order {
  id: string;
  tableNumber: number;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: OrderStatus;
  createdAt: number;
  customerNote?: string;
}

export interface Settings {
  restaurantName: string;
  masterPin: string;
  taxRate: number; // percentage e.g. 8 = 8%
  currency: string;
  tableCount: number;
}

export interface SalesLog {
  id: string;
  tableNumber: number;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  paidAt: number;
}
