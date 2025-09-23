import * as XLSX from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { TimesheetSession } from '@/types/timesheet-session';

export interface ExcelTimesheetRow {
  matricola?: string;
  dipendente: string;
  codice_fiscale: string;
  luogo_di_lavoro?: string;
  luogo_di_timbratura?: string;
  data_ingresso: string;
  data_uscita: string;
  ore_timbrate: string;
  coordinate_ingresso?: string;
  coordinate_uscita?: string;
  coordinate_eliminate?: string;
  data_eliminazione_coordinate?: string;
  giornata_di_riferimento?: string;
  ore_contrattuali?: string;
  ore_contrattuali_effettive?: string;
  ore_lavorate?: string;
  ore_lavorate_effettive?: string;
}

export interface ParsedTimesheet {
  employee_name: string;
  codice_fiscale: string;
  date: string;
  start_time: string;
  end_time: string;
  start_location_lat?: number;
  start_location_lng?: number;
  end_location_lat?: number;
  end_location_lng?: number;
  lunch_start_time?: string;
  lunch_end_time?: string;
  total_hours: number;
  clockInTimes: string[];
  clockOutTimes: string[];
  notes?: string;
}

export interface ImportResult {
  success: ParsedTimesheet[];
  errors: { row: number; error: string; data?: any }[];
  duplicates: ParsedTimesheet[];
}

export class ExcelImportService {
  private static parseCoordinates(coordString?: string): { lat?: number; lng?: number } {
    if (!coordString) return {};
    
    try {
      const coords = JSON.parse(coordString);
      return {
        lat: coords.latitude,
        lng: coords.longitude
      };
    } catch {
      return {};
    }
  }

  private static parseDateTime(dateTimeString: string): string {
    // Convert Excel datetime to ISO string
    const date = new Date(dateTimeString);
    return date.toISOString();
  }

  private static groupByEmployeeAndDate(rows: ExcelTimesheetRow[]): Map<string, ParsedTimesheet> {
    const grouped = new Map<string, { entries: ExcelTimesheetRow[]; }>();

    // Group entries by employee + date
    rows.forEach(row => {
      if (!row.dipendente || !row.codice_fiscale || !row.data_ingresso || !row.data_uscita) {
        return;
      }

      const date = new Date(row.data_ingresso).toISOString().split('T')[0];
      const key = `${row.codice_fiscale}_${date}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, { entries: [] });
      }
      
      grouped.get(key)!.entries.push(row);
    });

    const result = new Map<string, ParsedTimesheet>();

    // Process each group to create aggregated timesheet
    grouped.forEach((group, key) => {
      const entries = group.entries.sort((a, b) => 
        new Date(a.data_ingresso).getTime() - new Date(b.data_ingresso).getTime()
      );

      if (entries.length === 0) return;

      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];

      // Calculate lunch break if there are multiple entries
      let lunch_start_time: string | undefined;
      let lunch_end_time: string | undefined;

      if (entries.length === 2) {
        // Simple case: single lunch break between two sessions
        const firstExit = new Date(entries[0].data_uscita);
        const secondEntry = new Date(entries[1].data_ingresso);
        
        lunch_start_time = firstExit.toISOString();
        lunch_end_time = secondEntry.toISOString();
      }
      // For 3+ sessions, don't set automatic lunch times - too complex
      // User can set them manually if needed

      const startCoords = this.parseCoordinates(firstEntry.coordinate_ingresso);
      const endCoords = this.parseCoordinates(lastEntry.coordinate_uscita);

      // Calculate total hours from all entries
      let totalMinutes = 0;
      const clockInTimes: string[] = [];
      const clockOutTimes: string[] = [];
      
      entries.forEach(entry => {
        const start = new Date(entry.data_ingresso);
        const end = new Date(entry.data_uscita);
        totalMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
        
        clockInTimes.push(this.parseDateTime(entry.data_ingresso));
        clockOutTimes.push(this.parseDateTime(entry.data_uscita));
      });

      const parsed: ParsedTimesheet = {
        employee_name: firstEntry.dipendente,
        codice_fiscale: firstEntry.codice_fiscale,
        date: new Date(firstEntry.data_ingresso).toISOString().split('T')[0],
        start_time: this.parseDateTime(firstEntry.data_ingresso),
        end_time: this.parseDateTime(lastEntry.data_uscita),
        start_location_lat: startCoords.lat,
        start_location_lng: startCoords.lng,
        end_location_lat: endCoords.lat,
        end_location_lng: endCoords.lng,
        lunch_start_time,
        lunch_end_time,
        total_hours: Math.round((totalMinutes / 60) * 100) / 100,
        clockInTimes,
        clockOutTimes
      };

      result.set(key, parsed);
    });

    return result;
  }

  static async parseExcelFile(file: File): Promise<ImportResult> {
    console.log('🔍 EXCEL SERVICE - parseExcelFile started:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    const result: ImportResult = {
      success: [],
      errors: [],
      duplicates: []
    };

    try {
      console.log('🔍 EXCEL SERVICE - Creating workbook...');
      const workbook = new XLSX.Workbook();
      const buffer = await file.arrayBuffer();
      console.log('🔍 EXCEL SERVICE - Buffer size:', buffer.byteLength);
      
      await workbook.xlsx.load(buffer);
      console.log('🔍 EXCEL SERVICE - Workbook loaded successfully');

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        console.error('❌ EXCEL SERVICE - No worksheet found');
        result.errors.push({ row: 0, error: 'Nessun foglio di lavoro trovato nel file Excel' });
        return result;
      }
      console.log('🔍 EXCEL SERVICE - Worksheet found, row count:', worksheet.rowCount);

      const rows: ExcelTimesheetRow[] = [];

      // Skip header row and read data
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const rowData: ExcelTimesheetRow = {
          matricola: row.getCell(1).text,
          dipendente: row.getCell(2).text,
          codice_fiscale: row.getCell(3).text,
          luogo_di_lavoro: row.getCell(4).text,
          luogo_di_timbratura: row.getCell(5).text,
          data_ingresso: row.getCell(6).text,
          data_uscita: row.getCell(7).text,
          ore_timbrate: row.getCell(8).text,
          coordinate_ingresso: row.getCell(9).text,
          coordinate_uscita: row.getCell(10).text,
          coordinate_eliminate: row.getCell(11).text,
          data_eliminazione_coordinate: row.getCell(12).text,
          giornata_di_riferimento: row.getCell(13).text,
          ore_contrattuali: row.getCell(14).text,
          ore_contrattuali_effettive: row.getCell(15).text,
          ore_lavorate: row.getCell(16).text,
          ore_lavorate_effettive: row.getCell(17).text,
        };

        // Only process rows with required data
        if (rowData.dipendente && rowData.codice_fiscale && rowData.data_ingresso && rowData.data_uscita) {
          rows.push(rowData);
        } else if (rowData.dipendente || rowData.data_ingresso) {
          // Log error for incomplete rows that seem to have some data
          result.errors.push({
            row: rowNumber,
            error: 'Riga incompleta: mancano dati obbligatori',
            data: rowData
          });
        }
      });

      console.log('🔍 EXCEL SERVICE - Total rows processed:', rows.length);
      
      // Group and aggregate entries by employee and date
      const grouped = this.groupByEmployeeAndDate(rows);
      result.success = Array.from(grouped.values());
      
      console.log('🔍 EXCEL SERVICE - Final result:', {
        success_count: result.success.length,
        error_count: result.errors.length,
        sample_success: result.success[0]
      });

    } catch (error) {
      result.errors.push({
        row: 0,
        error: `Errore durante l'analisi del file: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
      });
    }

    return result;
  }
}