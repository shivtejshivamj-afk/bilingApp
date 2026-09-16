export function VegIndicator({ isVeg, size = 16 }: { isVeg: boolean; size?: number }) {
  const color = isVeg ? '#3F6B4A' : '#A5390C'; // basil-600 / paprika-600
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 border-2 rounded-sm"
      style={{ width: size, height: size, borderColor: color }}
      title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
    >
      <span className="rounded-full" style={{ width: size * 0.45, height: size * 0.45, backgroundColor: color }} />
    </span>
  );
}
