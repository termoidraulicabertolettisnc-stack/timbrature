import { supabase } from '@/integrations/supabase/client';

export interface MealVoucherConversion {
  id: string;
  user_id: string;
  company_id: string;
  date: string;
  converted_to_allowance: boolean;
  notes?: string;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MealVoucherConversionInput {
  user_id: string;
  company_id: string;
  date: string;
  converted_to_allowance: boolean;
  notes?: string;
}

/**
 * Servizio per gestire le conversioni dei buoni pasto in indennità giornaliere
 */
export class MealVoucherConversionService {
  /**
   * Recupera tutte le conversioni per un utente in un periodo
   */
  static async getConversions(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<MealVoucherConversion[]> {
    const { data, error } = await supabase
      .from('employee_meal_voucher_conversions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching meal voucher conversions:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Recupera lo stato di conversione per una data specifica
   */
  static async getConversionForDate(
    userId: string,
    date: string
  ): Promise<MealVoucherConversion | null> {
    const { data, error } = await supabase
      .from('employee_meal_voucher_conversions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      console.error('Error fetching meal voucher conversion for date:', error);
      throw error;
    }

    return data;
  }

  /**
   * Verifica se un giorno è convertito in indennità
   */
  static async isConvertedToAllowance(
    userId: string,
    date: string
  ): Promise<boolean> {
    const conversion = await this.getConversionForDate(userId, date);
    return conversion?.converted_to_allowance || false;
  }

  /**
   * Attiva/disattiva la conversione per una data specifica
   */
  static async toggleConversion(
    input: MealVoucherConversionInput
  ): Promise<MealVoucherConversion> {
    const { data: userData } = await supabase.auth.getUser();
    
    if (!userData.user) {
      throw new Error('User not authenticated');
    }

    const existingConversion = await this.getConversionForDate(input.user_id, input.date);

    if (existingConversion) {
      // Aggiorna conversione esistente
      const { data, error } = await supabase
        .from('employee_meal_voucher_conversions')
        .update({
          converted_to_allowance: input.converted_to_allowance,
          notes: input.notes,
          updated_by: userData.user.id
        })
        .eq('id', existingConversion.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating meal voucher conversion:', error);
        throw error;
      }

      return data;
    } else {
      // Crea nuova conversione
      const { data, error } = await supabase
        .from('employee_meal_voucher_conversions')
        .insert({
          ...input,
          created_by: userData.user.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating meal voucher conversion:', error);
        throw error;
      }

      return data;
    }
  }

  /**
   * Elimina una conversione (ritorna allo stato normale)
   */
  static async deleteConversion(
    userId: string,
    date: string
  ): Promise<void> {
    const { error } = await supabase
      .from('employee_meal_voucher_conversions')
      .delete()
      .eq('user_id', userId)
      .eq('date', date);

    if (error) {
      console.error('Error deleting meal voucher conversion:', error);
      throw error;
    }
  }

  /**
   * Recupera tutte le conversioni per più utenti in un periodo (per admin)
   */
  static async getConversionsForUsers(
    userIds: string[],
    startDate: string,
    endDate: string
  ): Promise<{[key: string]: MealVoucherConversion[]}> {
    if (userIds.length === 0) {
      return {};
    }

    const { data, error } = await supabase
      .from('employee_meal_voucher_conversions')
      .select('*')
      .in('user_id', userIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching meal voucher conversions for users:', error);
      throw error;
    }

    // Raggruppa per user_id
    const conversionsByUser: {[key: string]: MealVoucherConversion[]} = {};
    userIds.forEach(userId => {
      conversionsByUser[userId] = [];
    });

    data?.forEach(conversion => {
      if (!conversionsByUser[conversion.user_id]) {
        conversionsByUser[conversion.user_id] = [];
      }
      conversionsByUser[conversion.user_id].push(conversion);
    });

    return conversionsByUser;
  }

  /**
   * Crea una mappa di conversioni per accesso rapido per data
   */
  static createConversionMap(conversions: MealVoucherConversion[]): {[date: string]: boolean} {
    const map: {[date: string]: boolean} = {};
    conversions.forEach(conversion => {
      map[conversion.date] = conversion.converted_to_allowance;
    });
    return map;
  }

  /**
   * Valida che una conversione sia possibile per una data specifica
   */
  static async validateConversion(
    userId: string,
    date: string,
    employeeSettings?: any,
    companySettings?: any
  ): Promise<{valid: boolean; reason?: string}> {
    // TODO: Implementare validazione basata sui benefit normali
    // Per ora permettiamo sempre la conversione
    // In futuro si potrebbe verificare che il dipendente avrebbe diritto al buono pasto quel giorno
    
    return { valid: true };
  }
}