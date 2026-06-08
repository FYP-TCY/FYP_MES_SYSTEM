// app/dashboard/page.tsx
// Server component wrapper — just renders the client dashboard.
// Access: https://your-domain.com/dashboard

import MachineDashboard from './MachineDashboard'

export const metadata = {
  title: 'Machine Dashboard — Live Cutting Monitor',
}

export default function DashboardPage() {
  return <MachineDashboard />
}
