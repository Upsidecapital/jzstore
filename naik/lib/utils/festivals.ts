import { Festival } from '@/types'

export const MALAYSIAN_FESTIVALS_2026: Festival[] = [
  { name: 'Chinese New Year', date: '2026-02-17', type: 'major', duration_days: 15, f_and_b_relevance: 'high' },
  { name: 'Hari Raya Aidilfitri', date: '2026-03-20', type: 'major', duration_days: 3, f_and_b_relevance: 'critical' },
  { name: 'Wesak Day', date: '2026-05-24', type: 'public_holiday', duration_days: 1, f_and_b_relevance: 'medium' },
  { name: 'Hari Raya Aidiladha', date: '2026-05-27', type: 'major', duration_days: 2, f_and_b_relevance: 'high' },
  { name: 'Hari Merdeka', date: '2026-08-31', type: 'national', duration_days: 1, f_and_b_relevance: 'medium' },
  { name: 'Malaysia Day', date: '2026-09-16', type: 'national', duration_days: 1, f_and_b_relevance: 'medium' },
  { name: 'Deepavali', date: '2026-11-05', type: 'major', duration_days: 1, f_and_b_relevance: 'high' },
  { name: 'Christmas', date: '2026-12-25', type: 'major', duration_days: 1, f_and_b_relevance: 'high' },
  { name: 'School Holidays Mid-Year', date: '2026-05-30', type: 'school_break', duration_days: 14, f_and_b_relevance: 'high' },
  { name: 'School Holidays Year-End', date: '2026-11-21', type: 'school_break', duration_days: 42, f_and_b_relevance: 'critical' },
]

export function getUpcomingFestivals(count = 3): (Festival & { daysUntil: number })[] {
  const today = new Date()
  return MALAYSIAN_FESTIVALS_2026
    .map(f => ({
      ...f,
      daysUntil: Math.ceil((new Date(f.date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .filter(f => f.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, count)
}

export const RELEVANCE_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-amber-100 text-amber-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
}
