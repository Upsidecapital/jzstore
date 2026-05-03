import { Client } from '@/types'

export function brandPositioningPrompt(client: Client): string {
  return `Generate a complete brand positioning framework for this F&B business.

BUSINESS: ${client.name}
FORMAT: ${client.format}
PRICE POINT: ${client.price_point}
TARGET CUSTOMER: ${client.target_customer_primary}
BRAND PERSONALITY WORDS: ${client.brand_personality?.join(', ')}
LOCATION(S): ${client.locations?.join(', ')}
GOAL: ${client.goal_90_day}

Output:

## Brand Positioning Statement
(Internal use: "For [target customer] who [need], [Brand] is the [category] that [key benefit] because [reason to believe].")

## Tagline Options (3 variations)
(Short, memorable, in brand voice — provide English and BM versions)

## Tone of Voice Guide
### How we sound: (3 adjectives)
### We always: (3 things)
### We never: (3 things)
### Sample captions in our voice: (3 examples)

## Unique Selling Points (ranked by marketing weight)

## Customer Promise
(One sentence: what can every customer count on?)

## Platform Voice Differences
- Instagram voice:
- TikTok voice:
- WhatsApp broadcast voice:

## What Makes Us Unmistakably Us
(The specific things no competitor in our area can honestly claim)`
}
