import Image from 'next/image';

type BrandLogoVariant = 'full' | 'mark';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
}

export default function BrandLogo({
  variant = 'mark',
  className = '',
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src={variant === 'full' ? '/logo.svg' : '/AgentPrimer-logo-only.svg'}
      alt="AgentPrimer"
      width={80}
      height={80}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
