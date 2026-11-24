export function UwatIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <img src="/uwat.svg" alt="" aria-hidden="true" width={size} height={size} className={`uwat-brand-icon ${className}`}/>;
}
