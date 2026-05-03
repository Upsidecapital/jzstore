export function campaignBriefPrompt(params: {
  occasion: string
  objective: string
  startDate: string
  endDate: string
  estimatedBudget?: number
  channels: string[]
  customBrief?: string
}): string {
  return `Create a complete marketing campaign brief for: ${params.occasion}

OBJECTIVE: ${params.objective}
CAMPAIGN PERIOD: ${params.startDate} to ${params.endDate}
CHANNELS: ${params.channels.join(', ')}
${params.estimatedBudget ? `BUDGET: RM ${params.estimatedBudget}` : ''}
${params.customBrief ? `ADDITIONAL CONTEXT: ${params.customBrief}` : ''}

Output the campaign brief in markdown with the following sections:

## Campaign Name
## Campaign Objective (one sentence, measurable)
## Target Audience
## Core Message (one sentence — what do we want them to think, feel, or do?)
## Campaign Timeline (week-by-week breakdown)
## Content Plan (specific posts per channel, with copy direction)
## Paid Ad Strategy (if budget specified: audience targeting, ad format, copy, creative direction)
## GrabFood / Delivery Platform Activation (if relevant)
## WhatsApp Broadcast (if applicable)
## Promotional Mechanics (e.g. bundle offer, limited-time item, festive set)
## Success Metrics (specific numbers to track)
## Pre-Campaign Checklist (what must be ready before launch)

Be specific. Give actual copy, not templates. Every section must be immediately actionable.`
}
