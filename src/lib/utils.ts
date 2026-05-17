import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

export function formatCredits(n: number): string {
  return n === 1 ? '1 credit' : `${n} credits`
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-volt-500'
    case 'processing': return 'text-ice-500'
    case 'pending': return 'text-yellow-400'
    case 'failed': return 'text-red-400'
    default: return 'text-gray-400'
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed': return 'Completed'
    case 'processing': return 'Processing...'
    case 'pending': return 'In queue'
    case 'failed': return 'Failed'
    default: return status
  }
}
