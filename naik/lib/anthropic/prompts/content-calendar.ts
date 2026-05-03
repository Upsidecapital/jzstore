export function contentCalendarPrompt(params: {
  month: string
  postCount: number
  platforms: string[]
  focusItems?: string[]
  upcomingCampaigns?: string[]
  customBrief?: string
}): string {
  return `Generate a ${params.postCount}-post content calendar for ${params.month}.

PLATFORMS: ${params.platforms.join(', ')}
${params.focusItems ? `ITEMS TO FEATURE THIS MONTH: ${params.focusItems.join(', ')}` : ''}
${params.upcomingCampaigns ? `UPCOMING CAMPAIGNS: ${params.upcomingCampaigns.join(', ')}` : ''}
${params.customBrief ? `ADDITIONAL BRIEF: ${params.customBrief}` : ''}

For each post, output:
- Date (specific date in ${params.month})
- Platform
- Post type (promo / brand / educational / engagement / festival / product_highlight)
- Caption (full, ready-to-post — not a draft)
- Hashtags (max 10, relevant mix of niche and broad)
- Visual direction (specific description of what photo or video should show)
- CTA (what action you want the viewer to take)

Format as JSON array matching this exact structure:
[
  {
    "scheduled_date": "YYYY-MM-DD",
    "platform": "instagram",
    "post_type": "promo",
    "caption": "...",
    "hashtags": "#...",
    "visual_direction": "...",
    "cta": "..."
  }
]

Output only the JSON array. No preamble. No explanation.`
}
