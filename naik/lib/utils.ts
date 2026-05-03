import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export function formatCurrency(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export const TIER_PRICES: Record<string, number> = {
  starter: 800,
  growth: 2000,
  scale: 4500,
}

export const TIER_LABELS: Record<string, string> = {
  starter: 'Starter — RM 800/mo',
  growth: 'Growth — RM 2,000/mo',
  scale: 'Scale — RM 4,500/mo',
}
