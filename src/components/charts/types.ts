/** One released-or-withheld datum. The server decides; a component never adds, subtracts or averages. */
export interface ChartDatum {
  key: string;
  label: string;
  /** null with suppressed true is withheld, never zero. */
  n: number | null;
  suppressed: boolean;
}

export interface ChartTable {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}
