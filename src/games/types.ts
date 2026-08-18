// Un serveur sans aucun de ces trois reste démarrable, simplement muet.
export interface Players {
  online: number;
  /** Absent si le protocole ne publie pas la limite. */
  max?: number;
  /** Absent si le protocole ne donne qu'un compteur (Satisfactory). */
  names?: string[];
}

export interface GameAdapter {
  /** Jette si injoignable : côté joueur, éteint et pas encore prêt se
   *  ressemblent, l'appelant traduit les deux pareil. */
  query?(): Promise<Players>;
  announce?(message: string): Promise<void>;
  save?(): Promise<void>;
}
