/**
 * Helper centralizzati per la formattazione italiana di numeri, valute, ore e date.
 *
 * Obiettivo: avere un unico punto di verità per i formati usati in UI ed export,
 * evitando le decine di `toFixed(...)` / `toLocaleString('it-IT', ...)` sparsi nel codice.
 *
 * IMPORTANTE: i formati qui implementati replicano esattamente l'output già presente
 * nei vari componenti (es. "8.5h" vs "8:30"), così la migrazione è sicura e a costo zero.
 */

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

// ───────────────────────── NUMERI ─────────────────────────

/**
 * Numero in formato italiano (separatore migliaia "." e decimali ",").
 * Esempio: 1234.5 -> "1.234,50"
 */
export const formatItalianNumber = (
  value: number | null | undefined,
  decimals: number = 2
): string => {
  if (value === null || value === undefined || isNaN(value)) return "0";
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Importo in Euro in formato italiano. Esempio: 1234.5 -> "€ 1.234,50"
 */
export const formatItalianCurrency = (
  value: number | null | undefined,
  decimals: number = 2
): string => {
  if (value === null || value === undefined || isNaN(value)) return "€ 0,00";
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Percentuale in formato italiano. Esempio: 0.156 -> "15,6%"
 * (passare il valore già in scala 0-100 oppure 0-1 + ratio=true)
 */
export const formatItalianPercent = (
  value: number | null | undefined,
  decimals: number = 1,
  ratio: boolean = false
): string => {
  if (value === null || value === undefined || isNaN(value)) return "0%";
  const v = ratio ? value * 100 : value;
  return `${v.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};

// ───────────────────────── ORE ─────────────────────────

/**
 * Ore in formato decimale con suffisso "h". Esempio: 8.5 -> "8.5h"
 * Mantiene il comportamento attuale dei dashboard (AdminTimesheets, AdminConsolidation, ecc.).
 */
export const formatHoursDecimal = (
  hours: number | null | undefined,
  decimals: number = 1
): string => {
  if (hours === null || hours === undefined || isNaN(hours)) return "0h";
  return `${hours.toFixed(decimals)}h`;
};

/**
 * Ore in formato orologio "H:MM". Esempio: 8.5 -> "8:30"
 * Mantiene il comportamento di TimesheetHistory, TimesheetStats, OvertimeTracker.
 * Gestisce numeri negativi (utile per saldi straordinari).
 */
export const formatHoursClock = (hours: number | null | undefined): string => {
  if (hours === null || hours === undefined || isNaN(hours)) return "0:00";
  const sign = hours < 0 ? "-" : "";
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  // Gestisce arrotondamento a 60 minuti
  if (m === 60) return `${sign}${h + 1}:00`;
  return `${sign}${h}:${m.toString().padStart(2, "0")}`;
};

/**
 * Ore in formato decimale con 2 cifre, per dashboard paghe ed export
 * (rispetta la memoria di progetto: precisione a 2 decimali).
 */
export const formatHoursPayroll = (
  hours: number | null | undefined
): string => formatHoursDecimal(hours, 2);

// ───────────────────────── DATE ─────────────────────────

/**
 * Data in formato italiano "dd/MM/yyyy". Accetta Date, ISO string o null.
 */
export const formatItalianDate = (
  value: Date | string | null | undefined
): string => {
  if (!value) return "";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "dd/MM/yyyy", { locale: it });
};

/**
 * Data + ora in formato italiano "dd/MM/yyyy HH:mm".
 */
export const formatItalianDateTime = (
  value: Date | string | null | undefined,
  withSeconds: boolean = false
): string => {
  if (!value) return "";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, withSeconds ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy HH:mm", {
    locale: it,
  });
};

/**
 * Solo ora "HH:mm".
 */
export const formatItalianTime = (
  value: Date | string | null | undefined
): string => {
  if (!value) return "";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "HH:mm", { locale: it });
};
