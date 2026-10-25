// Icône game-icons.net, dessinée avec la couleur du texte (`currentColor`).
import { ICON_PATHS } from './iconPaths';

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={ICON_PATHS[name]} />
    </svg>
  );
}
