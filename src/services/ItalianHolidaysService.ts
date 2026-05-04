/**
 * Italian Holidays Service
 * Gestisce le festività italiane nazionali e i santi patroni locali
 */

// Database dei Santi Patroni italiani (principali città)
// La chiave è il nome della città in lowercase
const PATRON_SAINTS: Record<string, { date: string; name: string }> = {
  // Lombardia
  'cremona': { date: '11-13', name: "Sant'Omobono" },
  'milano': { date: '12-07', name: "Sant'Ambrogio" },
  'brescia': { date: '02-15', name: "Santi Faustino e Giovita" },
  'bergamo': { date: '08-26', name: "Sant'Alessandro" },
  'como': { date: '08-31', name: "Sant'Abbondio" },
  'mantova': { date: '03-18', name: "Sant'Anselmo" },
  'pavia': { date: '12-09', name: "San Siro" },
  'varese': { date: '05-08', name: "San Vittore" },
  'lecco': { date: '12-06', name: "San Nicolò" },
  'monza': { date: '06-24', name: "San Giovanni Battista" },
  'lodi': { date: '01-19', name: "San Bassiano" },

  // Piemonte
  'torino': { date: '06-24', name: "San Giovanni Battista" },
  'alessandria': { date: '11-10', name: "San Baudolino" },
  'novara': { date: '01-22', name: "San Gaudenzio" },
  'cuneo': { date: '09-29', name: "San Michele Arcangelo" },

  // Veneto
  'venezia': { date: '04-25', name: "San Marco" },
  'verona': { date: '05-21', name: "San Zeno" },
  'padova': { date: '06-13', name: "Sant'Antonio" },
  'vicenza': { date: '04-25', name: "San Marco" },
  'treviso': { date: '04-27', name: "San Liberale" },

  // Emilia-Romagna
  'bologna': { date: '10-04', name: "San Petronio" },
  'modena': { date: '01-31', name: "San Geminiano" },
  'parma': { date: '01-13', name: "Sant'Ilario" },
  'reggio emilia': { date: '11-24', name: "San Prospero" },
  'ravenna': { date: '07-23', name: "Sant'Apollinare" },
  'ferrara': { date: '04-23', name: "San Giorgio" },
  'rimini': { date: '10-14', name: "San Gaudenzo" },
  'piacenza': { date: '07-04', name: "Sant'Antonino" },

  // Toscana
  'firenze': { date: '06-24', name: "San Giovanni Battista" },
  'pisa': { date: '06-17', name: "San Ranieri" },
  'siena': { date: '12-01', name: "Sant'Ansano" },
  'lucca': { date: '07-12', name: "San Paolino" },
  'arezzo': { date: '08-07', name: "San Donato" },
  'livorno': { date: '05-22', name: "Santa Giulia" },
  'prato': { date: '12-26', name: "Santo Stefano" },

  // Lazio
  'roma': { date: '06-29', name: "Santi Pietro e Paolo" },
  'viterbo': { date: '09-04', name: "Santa Rosa" },
  'frosinone': { date: '08-16', name: "Madonna Assunta" },
  'latina': { date: '07-06', name: "Santa Maria Goretti" },

  // Campania
  'napoli': { date: '09-19', name: "San Gennaro" },
  'salerno': { date: '09-21', name: "San Matteo" },
  'caserta': { date: '08-22', name: "Sant'Anna" },

  // Sicilia
  'palermo': { date: '07-15', name: "Santa Rosalia" },
  'catania': { date: '02-05', name: "Sant'Agata" },
  'messina': { date: '06-03', name: "Madonna della Lettera" },
  'siracusa': { date: '12-13', name: "Santa Lucia" },

  // Sardegna
  'cagliari': { date: '10-30', name: "San Saturnino" },
  'sassari': { date: '12-06', name: "San Nicola" },

  // Puglia
  'bari': { date: '12-06', name: "San Nicola" },
  'lecce': { date: '08-26', name: "Sant'Oronzo" },
  'taranto': { date: '05-10', name: "San Cataldo" },

  // Calabria
  'reggio calabria': { date: '04-23', name: "San Giorgio" },
  'catanzaro': { date: '07-16', name: "Madonna del Carmine" },
  'cosenza': { date: '02-12', name: "Madonna del Pilerio" },

  // Altre regioni
  'genova': { date: '06-24', name: "San Giovanni Battista" },
  'trieste': { date: '11-03', name: "San Giusto" },
  'trento': { date: '06-26', name: "San Vigilio" },
  'bolzano': { date: '08-15', name: "Maria Assunta" },
  'aosta': { date: '09-07', name: "San Grato" },
  'ancona': { date: '05-04', name: "San Ciriaco" },
  'perugia': { date: '01-29', name: "San Costanzo" },
  'l\'aquila': { date: '06-10', name: "San Massimo" },
  'campobasso': { date: '04-23', name: "San Giorgio" },
  'potenza': { date: '05-30', name: "San Gerardo" },
};

/**
 * Calcola la data di Pasqua usando l'algoritmo di Gauss
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/**
 * Ritorna le festività nazionali italiane per un dato anno
 */
export function getNationalHolidays(year: number): { date: string; name: string }[] {
  const holidays: { date: string; name: string }[] = [
    { date: `${year}-01-01`, name: "Capodanno" },
    { date: `${year}-01-06`, name: "Epifania" },
    { date: `${year}-04-25`, name: "Festa della Liberazione" },
    { date: `${year}-05-01`, name: "Festa del Lavoro" },
    { date: `${year}-06-02`, name: "Festa della Repubblica" },
    { date: `${year}-08-15`, name: "Ferragosto" },
    { date: `${year}-11-01`, name: "Ognissanti" },
    { date: `${year}-12-08`, name: "Immacolata Concezione" },
    { date: `${year}-12-25`, name: "Natale" },
    { date: `${year}-12-26`, name: "Santo Stefano" },
  ];

  // Aggiungi Pasquetta (lunedì dopo Pasqua)
  const easter = getEasterDate(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  const yyyy = easterMonday.getFullYear();
  const mm = String(easterMonday.getMonth() + 1).padStart(2, '0');
  const dd = String(easterMonday.getDate()).padStart(2, '0');
  const easterMondayStr = `${yyyy}-${mm}-${dd}`;
  holidays.push({ date: easterMondayStr, name: "Lunedì dell'Angelo (Pasquetta)" });

  return holidays;
}

/**
 * Trova il santo patrono per una città
 */
export function getPatronSaint(city: string): { date: string; name: string } | null {
  if (!city) return null;
  
  const normalizedCity = city.toLowerCase().trim();
  return PATRON_SAINTS[normalizedCity] || null;
}

/**
 * Ritorna tutte le festività (nazionali + patrono locale) per un dato anno e città
 */
export function getAllHolidays(year: number, city?: string): { date: string; name: string; isLocal: boolean }[] {
  const holidays = getNationalHolidays(year).map(h => ({ ...h, isLocal: false }));

  if (city) {
    const patron = getPatronSaint(city);
    if (patron) {
      holidays.push({
        date: `${year}-${patron.date}`,
        name: patron.name,
        isLocal: true
      });
    }
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Verifica se una data è festiva
 */
export function isHoliday(date: string, city?: string): boolean {
  const year = parseInt(date.substring(0, 4));
  const holidays = getAllHolidays(year, city);
  return holidays.some(h => h.date === date);
}

/**
 * Ritorna le festività come array di stringhe data (formato yyyy-MM-dd)
 */
export function getHolidayDates(year: number, city?: string): string[] {
  return getAllHolidays(year, city).map(h => h.date);
}

export default {
  getNationalHolidays,
  getPatronSaint,
  getAllHolidays,
  isHoliday,
  getHolidayDates,
  PATRON_SAINTS
};
