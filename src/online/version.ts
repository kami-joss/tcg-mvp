// Version du jeu pour les parties en ligne : le serveur refuse un écran d'une autre version (« recharge la page »), le
// site et le serveur étant déployés ensemble. Fixée à la construction par `__BUILD_ID__` (la même valeur pour les deux) ;
// « dev » sans elle (en local, ou dans les tests).
declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
