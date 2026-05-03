const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface WhatsAppTextMessage {
  to: string
  body: string
}

export interface WhatsAppListMessage {
  to: string
  header: string
  body: string
  footer?: string
  buttonLabel: string
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
}

export interface WhatsAppButtonMessage {
  to: string
  body: string
  buttons: { id: string; title: string }[]
}

export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string
): Promise<void> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`)
  }
}

export async function sendInteractiveList(
  phoneNumberId: string,
  accessToken: string,
  msg: WhatsAppListMessage
): Promise<void> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: msg.to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: msg.header },
        body: { text: msg.body },
        footer: msg.footer ? { text: msg.footer } : undefined,
        action: {
          button: msg.buttonLabel,
          sections: msg.sections,
        },
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    // Fallback to text if list not supported
    await sendTextMessage(phoneNumberId, accessToken, msg.to, `${msg.header}\n\n${msg.body}`)
  }
}

export async function sendButtonMessage(
  phoneNumberId: string,
  accessToken: string,
  msg: WhatsAppButtonMessage
): Promise<void> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: msg.to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: msg.body },
        action: {
          buttons: msg.buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }),
  })

  if (!res.ok) {
    await sendTextMessage(phoneNumberId, accessToken, msg.to, msg.body)
  }
}

export async function markMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  })
}

// Parse incoming webhook payload
export interface IncomingMessage {
  from: string          // customer phone number
  messageId: string
  timestamp: string
  type: 'text' | 'interactive' | 'button' | 'image' | 'audio' | 'document' | 'unknown'
  text?: string
  interactiveReplyId?: string
  interactiveReplyTitle?: string
  phoneNumberId: string // which business number received it
  displayPhoneNumber: string
  profileName?: string
}

export function parseIncomingWebhook(body: Record<string, unknown>): IncomingMessage | null {
  try {
    const entry = (body.entry as Record<string, unknown>[])?.[0]
    const change = (entry?.changes as Record<string, unknown>[])?.[0]
    const value = change?.value as Record<string, unknown>

    if (!value?.messages) return null

    const messages = value.messages as Record<string, unknown>[]
    const msg = messages[0]
    const metadata = value.metadata as Record<string, string>
    const contacts = value.contacts as Record<string, unknown>[] | undefined

    const base: IncomingMessage = {
      from: msg.from as string,
      messageId: msg.id as string,
      timestamp: msg.timestamp as string,
      type: 'unknown',
      phoneNumberId: metadata?.phone_number_id,
      displayPhoneNumber: metadata?.display_phone_number,
      profileName: (contacts?.[0]?.profile as Record<string, string>)?.name,
    }

    if (msg.type === 'text') {
      return { ...base, type: 'text', text: (msg.text as Record<string, string>)?.body }
    }

    if (msg.type === 'interactive') {
      const interactive = msg.interactive as Record<string, unknown>
      if (interactive.type === 'list_reply') {
        const reply = interactive.list_reply as Record<string, string>
        return { ...base, type: 'interactive', interactiveReplyId: reply.id, interactiveReplyTitle: reply.title, text: reply.title }
      }
      if (interactive.type === 'button_reply') {
        const reply = interactive.button_reply as Record<string, string>
        return { ...base, type: 'interactive', interactiveReplyId: reply.id, interactiveReplyTitle: reply.title, text: reply.title }
      }
    }

    if (msg.type === 'button') {
      const button = msg.button as Record<string, string>
      return { ...base, type: 'button', text: button.text, interactiveReplyId: button.payload }
    }

    return { ...base, type: msg.type as IncomingMessage['type'] }
  } catch {
    return null
  }
}
