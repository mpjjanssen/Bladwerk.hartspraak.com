/*
 * Draait Bladwerk als losse Mac-app (zonder server)? De app zet dan
 * window.bladwerkLokaal klaar. Serverfuncties worden in die stand
 * verborgen en vervangen door tips voor de Mac.
 */
export const LOKAAL = typeof window !== 'undefined' && !!window.bladwerkLokaal;
