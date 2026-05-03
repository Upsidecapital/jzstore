import { Competitor } from '@/types'

export function competitorWatchPrompt(params: {
  competitor: Competitor
  publicObservations: string
}): string {
  return `Generate a competitor intelligence brief.

COMPETITOR: ${params.competitor.name}
LOCATION: ${params.competitor.location || 'Unknown'}
INSTAGRAM: ${params.competitor.instagram_handle || 'Unknown'}
TIKTOK: ${params.competitor.tiktok_handle || 'Unknown'}

OPERATOR OBSERVATIONS THIS MONTH:
${params.publicObservations}

Output in markdown:

## Competitor Brief: ${params.competitor.name}

### What They're Doing Well
### What They're Doing Poorly
### Opportunities We Can Exploit
### Threats to Monitor
### Recommended Counter-Positioning
(Specific: how should our client differentiate their marketing to win against this competitor?)

Be specific. Tactical. Actionable.`
}
