import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Plus, Clock } from 'lucide-react';
import { TimesheetSession } from '@/types/timesheet-session';
import { format, parse } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

interface TimesheetSessionsManagerProps {
  sessions: Partial<TimesheetSession>[];
  onChange: (sessions: Partial<TimesheetSession>[]) => void;
  date: string;
}

export const TimesheetSessionsManager: React.FC<TimesheetSessionsManagerProps> = ({
  sessions,
  onChange,
  date
}) => {
  const addSession = () => {
    const newSession: Partial<TimesheetSession> = {
      session_order: sessions.length + 1,
      session_type: 'work',
      start_time: '',
      end_time: '',
      notes: null
    };
    onChange([...sessions, newSession]);
  };

  const removeSession = (index: number) => {
    const updatedSessions = sessions.filter((_, i) => i !== index);
    // Reorder sessions
    const reorderedSessions = updatedSessions.map((session, i) => ({
      ...session,
      session_order: i + 1
    }));
    onChange(reorderedSessions);
  };

  const updateSession = (index: number, field: string, value: any) => {
    const updatedSessions = [...sessions];
    updatedSessions[index] = {
      ...updatedSessions[index],
      [field]: value
    };
    onChange(updatedSessions);
  };

  const formatDateTime = (time: string): string => {
    if (!time || !date) return '';
    try {
      // If time contains date already, return as is
      if (time.includes('T')) return time;
      // Otherwise combine with date and convert from Italian timezone to UTC
      const localDateTime = new Date(`${date}T${time}:00`);
      const utcDateTime = fromZonedTime(localDateTime, 'Europe/Rome');
      return utcDateTime.toISOString();
    } catch (error) {
      return time;
    }
  };

  const extractTime = (dateTime: string): string => {
    if (!dateTime) return '';
    try {
      if (dateTime.includes('T')) {
        // Convert UTC time to Italian timezone for display
        const utcDate = new Date(dateTime);
        const localDate = toZonedTime(utcDate, 'Europe/Rome');
        return format(localDate, 'HH:mm');
      }
      return dateTime;
    } catch (error) {
      return dateTime;
    }
  };

  const calculateSessionDuration = (session: Partial<TimesheetSession>): string => {
    if (!session.start_time || !session.end_time) return '';
    
    try {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      const diffMs = end.getTime() - start.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours < 0) return '';
      
      const hours = Math.floor(diffHours);
      const minutes = Math.round((diffHours - hours) * 60);
      
      return `${hours}h ${minutes}m`;
    } catch (error) {
      return '';
    }
  };

  const calculateTotalHours = (): string => {
    let totalMinutes = 0;
    
    sessions.forEach(session => {
      if (session.start_time && session.end_time && session.session_type === 'work') {
        try {
          const start = new Date(session.start_time);
          const end = new Date(session.end_time);
          const diffMs = end.getTime() - start.getTime();
          if (diffMs > 0) {
            totalMinutes += diffMs / (1000 * 60);
          }
        } catch (error) {
          // Skip invalid times
        }
      }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Sessioni di lavoro</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSession}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Aggiungi sessione
        </Button>
      </div>

      {sessions.map((session, index) => (
        <Card key={index} className="relative">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Sessione {index + 1}
                {session.session_type === 'work' && calculateSessionDuration(session) && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({calculateSessionDuration(session)})
                  </span>
                )}
              </CardTitle>
              {sessions.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSession(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`start-time-${index}`} className="text-sm">
                  Inizio
                </Label>
                <Input
                  id={`start-time-${index}`}
                  type="time"
                  value={extractTime(session.start_time || '')}
                  onChange={(e) => updateSession(index, 'start_time', formatDateTime(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor={`end-time-${index}`} className="text-sm">
                  Fine
                </Label>
                <Input
                  id={`end-time-${index}`}
                  type="time"
                  value={extractTime(session.end_time || '')}
                  onChange={(e) => updateSession(index, 'end_time', formatDateTime(e.target.value))}
                />
              </div>
            </div>
            
            {session.notes !== undefined && (
              <div>
                <Label htmlFor={`notes-${index}`} className="text-sm">
                  Note sessione
                </Label>
                <Input
                  id={`notes-${index}`}
                  value={session.notes || ''}
                  onChange={(e) => updateSession(index, 'notes', e.target.value)}
                  placeholder="Note per questa sessione..."
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {sessions.length > 0 && (
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Totale ore lavorate:</span>
            <span className="font-bold text-primary">{calculateTotalHours()}</span>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nessuna sessione di lavoro</p>
          <p className="text-sm">Clicca "Aggiungi sessione" per iniziare</p>
        </div>
      )}
    </div>
  );
};
