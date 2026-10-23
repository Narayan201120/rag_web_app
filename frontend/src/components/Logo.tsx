export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#10231C" />
      <rect x="8" y="6" width="16" height="20" rx="2" fill="#FBFCFA" />
      <rect x="11" y="12" width="10" height="3" rx="1" fill="#E4F16B" />
      <rect x="11" y="17.5" width="7" height="2" rx="1" fill="#B9C8BF" />
      <rect x="11" y="21.5" width="9" height="2" rx="1" fill="#B9C8BF" />
    </svg>
  );
}
