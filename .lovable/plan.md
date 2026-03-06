## Trasferte Manuali Mensili con Sostituzione Buoni Pasto

### Riepilogo del problema

Attualmente il sistema calcola le trasferte automaticamente in base alle ore lavorate e alla policy configurata. Per alcuni dipendenti, invece, le trasferte vengono assegnate **manualmente a fine mese** (es. "questo mese gli diamo 10 trasferte"). Quando si assegnano trasferte manuali, i giorni corrispondenti **non devono avere il buono pasto**, così la trasferta ha l'importo pieno (`business_trip_rate_without_meal` = 46.48€ invece di `business_trip_rate_with_meal` = 30.98€).

### Come funzionerebbe

1. **Nuovo campo in `employee_settings**`: `manual_trip_mode` (boolean) - indica che il dipendente riceve trasferte assegnate manualmente, non calcolate automaticamente.
2. **Nuova tabella `employee_manual_trips**`: per registrare le trasferte mensili manuali.
  - `user_id`, `company_id`, `month` (date), `trip_count` (numero di trasferte), `created_by`, `notes`
  - RLS: admin di qualsiasi azienda
3. **Logica di assegnazione**: quando si inserisce il numero di trasferte manuali (es. 10), il sistema:
  - Prende i giorni lavorati dal dipendente nel mese (con buono pasto maturato)
  - "Converte" automaticamente i buoni pasto di quei giorni in trasferte (rimuovendo il buono pasto)
  - Calcola l'importo: `trip_count × business_trip_rate_without_meal`
  - I giorni rimanenti con buono pasto restano invariati
4. **UI nel BusinessTripsDashboard**: per i dipendenti in `manual_trip_mode`, mostrare un campo editabile per inserire il numero di trasferte mensili, con riepilogo dell'importo.
5. **Export**: le trasferte manuali compaiono nella sezione trasferte del payroll con l'importo pieno.

### Dettagli tecnici

**Database**:

- Aggiungere colonna `manual_trip_mode boolean DEFAULT false` a `employee_settings`
- Creare tabella `employee_manual_trips` con: `id`, `user_id`, `company_id`, `month`, `trip_count`, `amount_per_trip`, `total_amount`, `created_by`, `updated_by`, `notes`, `created_at`, `updated_at`

**Componenti da modificare**:

- `EmployeeSettingsDialog.tsx`: checkbox per abilitare la modalità trasferte manuali
- `BusinessTripsDashboard.tsx`: per i dipendenti con `manual_trip_mode`, mostrare input per numero trasferte e calcolo automatico importo
- `useBusinessTripData.ts`: caricare `manual_trip_mode` e dati trasferte manuali; per questi dipendenti, sottrarre i buoni pasto corrispondenti e aggiungere le trasferte con importo pieno
- `PayrollDashboard.tsx` / export Excel: includere riga separata per trasferte manuali

**Flusso**:

```text
Admin apre dashboard trasferte
  → Vede dipendente con manual_trip_mode = true
  → Inserisce "10" trasferte
  → Sistema calcola: 10 × 46.48€ = 464.80€
  → Rimuove buoni pasto dai primi 10 giorni lavorati
  → Mostra riepilogo: 10 trasferte (464.80€), X buoni pasto rimanenti
```