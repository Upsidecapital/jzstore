'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronRight, ChevronLeft, Plus, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { slugify, TIER_PRICES } from '@/lib/utils'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(2),
  format: z.string().min(1),
  price_point: z.string().min(1),
  avg_spend_per_person: z.number().optional(),
  current_marketing_spend: z.number().optional(),
  biggest_pain_point: z.string().optional(),
  target_customer_primary: z.string().min(1),
  target_customer_secondary: z.string().optional(),
  content_restrictions: z.string().optional(),
  goal_90_day: z.string().min(1),
  tier: z.enum(['starter', 'growth', 'scale']),
  contract_start: z.string().optional(),
  owner_name: z.string().optional(),
  owner_whatsapp: z.string().optional(),
  owner_email: z.string().email().optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

const CHANNELS = ['instagram', 'tiktok', 'facebook', 'grabfood', 'shopee_food', 'whatsapp']
const FORMATS = ['hawker', 'cafe', 'casual_dining', 'qsr', 'cloud_kitchen', 'food_truck', 'fine_dining', 'other']
const TIER_DESCRIPTIONS = { starter: 'RM 800/mo', growth: 'RM 2,000/mo', scale: 'RM 4,500/mo' }

export function OnboardingForm() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [locations, setLocations] = useState<string[]>([''])
  const [channels, setChannels] = useState<string[]>([])
  const [brandPersonality, setBrandPersonality] = useState<string[]>([])
  const [personalityInput, setPersonalityInput] = useState('')
  const [heroItems, setHeroItems] = useState(['', '', ''])
  const [marginItems, setMarginItems] = useState(['', '', ''])
  const [competitors, setCompetitors] = useState([{ name: '', instagram_handle: '' }, { name: '', instagram_handle: '' }])

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tier: 'starter', format: 'cafe', price_point: 'mid' },
  })

  const tier = watch('tier')

  const addPersonalityTag = () => {
    if (personalityInput.trim() && brandPersonality.length < 3) {
      setBrandPersonality([...brandPersonality, personalityInput.trim()])
      setPersonalityInput('')
    }
  }

  const toggleChannel = (channel: string) => {
    setChannels(prev => prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel])
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError('')
    try {
      const slug = slugify(data.name) + '-' + Math.random().toString(36).slice(2, 7)

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: data.name,
          slug,
          locations: locations.filter(Boolean),
          format: data.format,
          price_point: data.price_point,
          avg_spend_per_person: data.avg_spend_per_person,
          current_channels: channels,
          current_marketing_spend: data.current_marketing_spend,
          biggest_pain_point: data.biggest_pain_point,
          target_customer_primary: data.target_customer_primary,
          target_customer_secondary: data.target_customer_secondary,
          brand_personality: brandPersonality,
          content_restrictions: data.content_restrictions,
          goal_90_day: data.goal_90_day,
          tier: data.tier,
          contract_start: data.contract_start || null,
          monthly_fee: TIER_PRICES[data.tier],
          owner_name: data.owner_name,
          owner_whatsapp: data.owner_whatsapp,
          owner_email: data.owner_email || null,
          status: 'active',
        })
        .select()
        .single()

      if (clientError) throw clientError

      // Save menu items
      const allMenuItems = [
        ...heroItems.filter(Boolean).map(name => ({ client_id: client.id, name, is_hero: true, is_margin_star: false, is_signature: false })),
        ...marginItems.filter(Boolean).map(name => ({ client_id: client.id, name, is_hero: false, is_margin_star: true, is_signature: false })),
      ]
      if (allMenuItems.length > 0) {
        await supabase.from('menu_items').insert(allMenuItems)
      }

      // Save competitors
      const validCompetitors = competitors.filter(c => c.name)
      if (validCompetitors.length > 0) {
        await supabase.from('competitors').insert(validCompetitors.map(c => ({ ...c, client_id: client.id })))
      }

      // Trigger brand positioning generation
      await fetch('/api/generate/brand-positioning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      router.push(`/clients/${client.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const STEPS = ['Business Basics', 'Marketing Context', 'Brand Intelligence', 'Contract & Goals']

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium',
              i + 1 < step ? 'bg-green-600 text-white' : i + 1 === step ? 'bg-green-600 text-white ring-4 ring-green-100' : 'bg-slate-200 text-slate-500'
            )}>
              {i + 1 < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-sm hidden sm:block', i + 1 === step ? 'text-slate-900 font-medium' : 'text-slate-400')}>{label}</span>
            {i < STEPS.length - 1 && <div className={cn('flex-1 h-px w-6', i + 1 < step ? 'bg-green-600' : 'bg-slate-200')} />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900">Business Basics</h2>

            <div className="space-y-1.5">
              <Label>Business Name *</Label>
              <Input {...register('name')} placeholder="e.g. Kopi Warisan" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Outlet Locations</Label>
              {locations.map((loc, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={loc}
                    onChange={e => {
                      const updated = [...locations]
                      updated[i] = e.target.value
                      setLocations(updated)
                    }}
                    placeholder={`e.g. Bangsar, KL`}
                  />
                  {i > 0 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLocations(locations.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setLocations([...locations, ''])}>
                <Plus className="h-4 w-4" /> Add Location
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Business Format *</Label>
              <Select {...register('format')}>
                {FORMATS.map(f => (
                  <option key={f} value={f}>{f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Price Point *</Label>
              <div className="flex gap-3">
                {['budget', 'mid', 'premium'].map(pp => (
                  <label key={pp} className={cn(
                    'flex-1 border rounded-lg p-3 cursor-pointer text-center text-sm font-medium transition-colors',
                    watch('price_point') === pp ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  )}>
                    <input type="radio" value={pp} className="sr-only" {...register('price_point')} />
                    {pp.charAt(0).toUpperCase() + pp.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Avg Spend / Person (RM)</Label>
                <Input type="number" {...register('avg_spend_per_person', { valueAsNumber: true })} placeholder="e.g. 25" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900">Marketing Context</h2>

            <div className="space-y-2">
              <Label>Active Channels</Label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map(ch => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                      channels.includes(ch)
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-green-400'
                    )}
                  >
                    {ch.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Monthly Marketing Spend (RM)</Label>
              <Input type="number" {...register('current_marketing_spend', { valueAsNumber: true })} placeholder="e.g. 1500" />
            </div>

            <div className="space-y-1.5">
              <Label>Biggest Marketing Pain Point</Label>
              <Textarea {...register('biggest_pain_point')} placeholder="What's not working in your marketing right now?" rows={3} />
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900">Brand Intelligence</h2>

            <div className="space-y-1.5">
              <Label>Primary Target Customer *</Label>
              <Textarea {...register('target_customer_primary')} placeholder="e.g. Working adults 25-40, office workers in Bangsar looking for affordable weekday lunch" rows={2} />
              {errors.target_customer_primary && <p className="text-xs text-red-500">{errors.target_customer_primary.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Secondary Target Customer</Label>
              <Textarea {...register('target_customer_secondary')} placeholder="Optional — e.g. Weekend families, expats" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Brand Personality (exactly 3 words)</Label>
              <div className="flex gap-2">
                <Input
                  value={personalityInput}
                  onChange={e => setPersonalityInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPersonalityTag())}
                  placeholder="e.g. bold, nostalgic, generous"
                  disabled={brandPersonality.length >= 3}
                />
                <Button type="button" variant="outline" onClick={addPersonalityTag} disabled={brandPersonality.length >= 3}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {brandPersonality.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    {tag}
                    <button type="button" onClick={() => setBrandPersonality(brandPersonality.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Top 3 Hero Items (high volume)</Label>
              {heroItems.map((item, i) => (
                <Input key={i} value={item} onChange={e => { const u = [...heroItems]; u[i] = e.target.value; setHeroItems(u) }} placeholder={`Hero item ${i + 1}`} />
              ))}
            </div>

            <div className="space-y-2">
              <Label>Top 3 Margin Stars (high margin)</Label>
              {marginItems.map((item, i) => (
                <Input key={i} value={item} onChange={e => { const u = [...marginItems]; u[i] = e.target.value; setMarginItems(u) }} placeholder={`Margin item ${i + 1}`} />
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Content Restrictions</Label>
              <Textarea {...register('content_restrictions')} placeholder="e.g. No alcohol mentions, no competitor names, halal-only content" rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Competitors to Watch</Label>
              {competitors.map((comp, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={comp.name} onChange={e => { const u = [...competitors]; u[i].name = e.target.value; setCompetitors(u) }} placeholder="Competitor name" />
                  <Input value={comp.instagram_handle} onChange={e => { const u = [...competitors]; u[i].instagram_handle = e.target.value; setCompetitors(u) }} placeholder="@instagram" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900">Contract & Goals</h2>

            <div className="space-y-2">
              <Label>Naik Tier *</Label>
              {(['starter', 'growth', 'scale'] as const).map(t => (
                <label key={t} className={cn(
                  'flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors',
                  tier === t ? 'border-green-600 bg-green-50' : 'border-slate-200 hover:border-slate-300'
                )}>
                  <div className="flex items-center gap-3">
                    <input type="radio" value={t} className="sr-only" {...register('tier')} />
                    <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', tier === t ? 'border-green-600 bg-green-600' : 'border-slate-300')}>
                      {tier === t && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <span className="font-medium capitalize text-slate-900">{t}</span>
                  </div>
                  <span className="text-green-700 font-semibold">{TIER_DESCRIPTIONS[t]}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Contract Start Date</Label>
              <Input type="date" {...register('contract_start')} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Owner Name</Label>
                <Input {...register('owner_name')} placeholder="Ahmad Ridhwan" />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp Number</Label>
                <Input {...register('owner_whatsapp')} placeholder="+60123456789" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Owner Email</Label>
              <Input type="email" {...register('owner_email')} placeholder="owner@business.com" />
            </div>

            <div className="space-y-1.5">
              <Label>90-Day Goal *</Label>
              <Textarea {...register('goal_90_day')} placeholder="e.g. Increase weekend dine-in traffic by 30%, grow Instagram to 5,000 followers, launch delivery on GrabFood" rows={3} />
              {errors.goal_90_day && <p className="text-xs text-red-500">{errors.goal_90_day.message}</p>}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>

          {step < 4 ? (
            <Button type="button" onClick={() => setStep(s => Math.min(4, s + 1))}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" loading={loading}>
              {loading ? 'Creating client...' : 'Create Client & Generate Positioning'}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
