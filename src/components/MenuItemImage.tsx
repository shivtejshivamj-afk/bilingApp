import { Coffee, IceCream, Soup, UtensilsCrossed, Utensils } from 'lucide-react';

function iconForCategory(category: string) {
  const c = category.toLowerCase();
  if (c.includes('drink') || c.includes('beverage')) return Coffee;
  if (c.includes('dessert') || c.includes('sweet')) return IceCream;
  if (c.includes('starter') || c.includes('appetizer') || c.includes('soup')) return Soup;
  if (c.includes('main') || c.includes('entree')) return UtensilsCrossed;
  return Utensils;
}

/** A category-themed placeholder shown whenever a menu item has no photo —
 * a warm gradient with a relevant icon, so an empty item looks intentional
 * and on-brand instead of a broken image icon or blank grey box. */
export function MenuItemImage({
  image,
  name,
  category,
  className = '',
}: {
  image: string;
  name: string;
  category: string;
  className?: string;
}) {
  if (image) {
    return <img src={image} alt={name} className={`object-cover ${className}`} loading="lazy" />;
  }

  const Icon = iconForCategory(category);
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-paprika-50 via-parchment-200 to-saffron-50 ${className}`}
    >
      <Icon className="text-paprika-300" size={36} strokeWidth={1.5} />
    </div>
  );
}
