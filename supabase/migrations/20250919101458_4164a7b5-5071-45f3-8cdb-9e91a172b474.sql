-- Risoluzione problema timesheets agosto: Lorenzo vs Thomas
-- 1. Cancellare tutti i timesheets errati di Lorenzo per agosto
-- 2. Creare i timesheets corretti per Lorenzo basati sul file Excel

BEGIN;

-- Cancellare tutti i timesheets di Lorenzo per agosto (sono tutti errati)
DELETE FROM timesheets 
WHERE user_id = '04610512-1818-4582-bf83-d69329b13ba8' 
AND date BETWEEN '2025-08-01' AND '2025-08-31';

-- Inserire i timesheets corretti di Lorenzo basati sul file Excel
-- 2025-08-01: 07:17-12:37 + 13:05-17:11 (pausa pranzo: 12:37-13:05 = 28 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-01',
  '2025-08-01 07:17:51+00', '2025-08-01 17:11:22+00',
  '2025-08-01 12:37:13+00', '2025-08-01 13:05:18+00', 28,
  9.42, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-04: 07:24-12:23 + 12:39-16:57 (pausa pranzo: 12:23-12:39 = 16 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-04',
  '2025-08-04 07:24:01+00', '2025-08-04 16:57:26+00',
  '2025-08-04 12:23:53+00', '2025-08-04 12:39:52+00', 16,
  9.27, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-05: 07:21-12:13 + 12:27-17:07 (pausa pranzo: 12:13-12:27 = 14 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-05',
  '2025-08-05 07:21:46+00', '2025-08-05 17:07:24+00',
  '2025-08-05 12:13:55+00', '2025-08-05 12:27:32+00', 14,
  9.52, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-06: 07:17-12:48 + 13:20-17:12 (pausa pranzo: 12:48-13:20 = 32 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-06',
  '2025-08-06 07:17:46+00', '2025-08-06 17:12:54+00',
  '2025-08-06 12:48:12+00', '2025-08-06 13:20:10+00', 32,
  9.37, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-07: 07:18-12:32 + 12:56-17:39 (pausa pranzo: 12:32-12:56 = 24 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-07',
  '2025-08-07 07:18:10+00', '2025-08-07 17:39:13+00',
  '2025-08-07 12:32:50+00', '2025-08-07 12:56:15+00', 24,
  9.93, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-08: 07:16-12:30 + 12:48-17:32 (pausa pranzo: 12:30-12:48 = 18 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-08',
  '2025-08-08 07:16:53+00', '2025-08-08 17:32:22+00',
  '2025-08-08 12:30:57+00', '2025-08-08 12:48:52+00', 18,
  9.95, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-25: 07:14-12:15 + 12:34-17:14 (pausa pranzo: 12:15-12:34 = 19 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-25',
  '2025-08-25 07:14:00+00', '2025-08-25 17:14:26+00',
  '2025-08-25 12:15:00+00', '2025-08-25 12:34:18+00', 19,
  9.68, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-26: 07:17-12:24 + 12:49-17:15 (pausa pranzo: 12:24-12:49 = 25 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-26',
  '2025-08-26 07:17:30+00', '2025-08-26 17:15:26+00',
  '2025-08-26 12:24:33+00', '2025-08-26 12:49:56+00', 25,
  9.55, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-27: 07:21-12:04 + 12:32-17:10 (pausa pranzo: 12:04-12:32 = 28 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-27',
  '2025-08-27 07:21:14+00', '2025-08-27 17:10:45+00',
  '2025-08-27 12:04:14+00', '2025-08-27 12:32:27+00', 28,
  9.35, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

-- 2025-08-28: 07:23-12:22 + 12:44-16:54 (pausa pranzo: 12:22-12:44 = 22 min)
INSERT INTO timesheets (
  user_id, date, start_time, end_time, 
  lunch_start_time, lunch_end_time, lunch_duration_minutes,
  total_hours, created_by, updated_by
) VALUES (
  '04610512-1818-4582-bf83-d69329b13ba8', '2025-08-28',
  '2025-08-28 07:23:13+00', '2025-08-28 16:54:59+00',
  '2025-08-28 12:22:46+00', '2025-08-28 12:44:50+00', 22,
  9.15, '04610512-1818-4582-bf83-d69329b13ba8', '04610512-1818-4582-bf83-d69329b13ba8'
);

COMMIT;