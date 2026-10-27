// Icône game-icons.net (512 × 512) ou Material Design (24 × 24), dessinée avec la couleur du texte (`currentColor`).
import { ICON_PATHS, MDI_PATHS } from './iconPaths';

export type IconName = keyof typeof ICON_PATHS | keyof typeof MDI_PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const mdi = name in MDI_PATHS;
  const d = mdi ? MDI_PATHS[name as keyof typeof MDI_PATHS] : ICON_PATHS[name as keyof typeof ICON_PATHS];
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox={mdi ? '0 0 24 24' : '0 0 512 512'} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={d} />
    </svg>
  );
}
