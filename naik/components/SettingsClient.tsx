'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Key, User, LogOut } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function SettingsClient({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const updatePassword = async () => {
    if (newPassword !== confirmPassword) { setPasswordMsg('Passwords do not match'); return }
    if (newPassword.length < 6) { setPasswordMsg('Password must be at least 6 characters'); return }
    setIsUpdating(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordMsg(error ? error.message : 'Password updated successfully')
    setIsUpdating(false)
    setNewPassword('')
    setConfirmPassword('')
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500 text-sm mt-1">Manage your operator account</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={userEmail} disabled />
          </div>
          <p className="text-xs text-slate-400">Contact Anthropic support to change your email.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-4 w-4" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
          {passwordMsg && (
            <p className={`text-sm ${passwordMsg.includes('success') ? 'text-green-600' : 'text-red-500'}`}>{passwordMsg}</p>
          )}
          <Button onClick={updatePassword} loading={isUpdating}>Update Password</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600"><LogOut className="h-4 w-4" /> Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={signOut}>Sign Out</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment Variables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            { label: 'Supabase URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
            { label: 'Anthropic API Key', env: 'ANTHROPIC_API_KEY' },
            { label: 'Resend API Key', env: 'RESEND_API_KEY' },
          ].map(({ label, env }) => (
            <div key={env} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <span className="text-slate-600">{label}</span>
              <span className="font-mono text-xs text-slate-400">{env}</span>
            </div>
          ))}
          <p className="text-xs text-slate-400 mt-2">Configure these in your .env.local file or Vercel environment variables.</p>
        </CardContent>
      </Card>
    </div>
  )
}
