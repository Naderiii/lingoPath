import { redirect } from 'next/navigation'

// Root redirects to /dashboard
export default function RootPage() {
  redirect('/dashboard')
}
