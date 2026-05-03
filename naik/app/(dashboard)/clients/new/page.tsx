export const dynamic = 'force-dynamic'
import { OnboardingForm } from '@/components/clients/OnboardingForm'

export default function NewClientPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Add New Client</h2>
        <p className="text-slate-500 text-sm mt-1">Complete the brief to onboard a new F&B client and generate their brand positioning.</p>
      </div>
      <OnboardingForm />
    </div>
  )
}
