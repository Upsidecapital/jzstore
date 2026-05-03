import { MenuItem } from '@/types'

export function menuAuditPrompt(menuItems: MenuItem[]): string {
  const itemsText = menuItems.map(item =>
    `- ${item.name} | RM ${item.price} | Category: ${item.category} | Hero: ${item.is_hero} | Margin star: ${item.is_margin_star}`
  ).join('\n')

  return `Conduct a marketing-focused menu audit.

CURRENT MENU:
${itemsText}

Analyse this menu from a marketing and revenue optimisation perspective. Output in markdown:

## Menu Positioning Summary
(What story does this menu tell? What is the perceived brand based on menu alone?)

## Hero Item Analysis
(Which items should anchor all marketing? Why? Specific post ideas for each.)

## Margin Optimisation Opportunities
(Which items to push harder in marketing based on margin potential?)

## Naming Recommendations
(Any items with weak names that reduce desirability? Suggest alternatives.)

## Bundle Opportunities
(3-5 specific bundle combinations with suggested pricing and names)

## Items to Kill or Reposition
(Items that dilute focus or confuse the brand — with specific rationale)

## GrabFood / Delivery Optimisation
(How to structure the delivery menu differently from dine-in for algorithmic ranking)

## Festival Menu Additions
(Recommend 2-3 limited-time items for upcoming Malaysian festivals based on existing menu strengths)

## Top 3 Marketing Priorities from This Menu
(The three things to do in the next 30 days based on this audit)

Be direct. F&B operators don't need soft feedback — they need to know exactly what to do.`
}
