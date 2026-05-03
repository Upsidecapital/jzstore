import { createClient as createSupabaseServiceClient } from '@supabase/supabase-js'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildWhatsAppSystemPrompt, buildWhatsAppUserMessage } from '@/lib/anthropic/prompts/whatsapp-chatbot'
import { sendTextMessage, markMessageRead } from '@/lib/whatsapp/client'
import type { IncomingMessage } from '@/lib/whatsapp/client'
import type { Client, MenuItem } from '@/types'

// Use service role to bypass RLS in webhook context (unauthenticated)
function getServiceClient() {
  return createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface WhatsAppConfig {
  id: string
  client_id: string
  phone_number_id: string
  access_token: string
  bot_name: string
  welcome_message: string | null
  accept_orders: boolean
  show_menu: boolean
  is_active: boolean
}

interface ConversationRow {
  id: string
  client_id: string
  customer_phone: string
  customer_name: string | null
  messages: { role: string; content: string; timestamp: string }[]
  pending_order: Record<string, unknown> | null
  conversation_state: string
}

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const supabase = getServiceClient()

  // 1. Find which client owns this phone number
  const { data: configRow } = await supabase
    .from('whatsapp_config')
    .select('*, clients(*)')
    .eq('phone_number_id', msg.phoneNumberId)
    .eq('is_active', true)
    .single()

  if (!configRow) return  // No client configured for this number

  const config = configRow as WhatsAppConfig & { clients: Client }
  const client = config.clients

  // Mark as read
  await markMessageRead(config.phone_number_id, config.access_token, msg.messageId).catch(() => {})

  if (!msg.text) {
    await sendTextMessage(
      config.phone_number_id,
      config.access_token,
      msg.from,
      "Hi! I can only read text messages right now. Please type your order or question 😊"
    )
    return
  }

  // 2. Load or create conversation
  const { data: existingConv } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('client_id', client.id)
    .eq('customer_phone', msg.from)
    .single()

  const conversation: ConversationRow = existingConv || {
    id: '',
    client_id: client.id,
    customer_phone: msg.from,
    customer_name: msg.profileName || null,
    messages: [],
    pending_order: null,
    conversation_state: 'greeting',
  }

  // Update customer name if we now know it
  if (msg.profileName && !conversation.customer_name) {
    conversation.customer_name = msg.profileName
  }

  // 3. Load menu items
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('*')
    .eq('client_id', client.id)
    .eq('is_active', true)

  const items = (menuItems || []) as MenuItem[]

  // 4. Build AI context and generate reply
  const systemPrompt = buildWhatsAppSystemPrompt(client, items, {
    botName: config.bot_name || 'Assistant',
    acceptOrders: config.accept_orders,
    showMenu: config.show_menu,
  })

  const messages = buildWhatsAppUserMessage(conversation.messages, msg.text)

  let replyText = ''
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: systemPrompt,
      messages,
    })
    replyText = response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (err) {
    replyText = "Sorry, I'm having a bit of trouble right now. Please try again in a moment! 😊"
  }

  // 5. Parse if there's an order confirmation embedded
  let orderJsonStr: string | null = null
  const orderMatch = replyText.match(/NAIK_ORDER_JSON:(\{.*\})/s)
  if (orderMatch) {
    orderJsonStr = orderMatch[1]
    replyText = replyText.replace(/NAIK_ORDER_JSON:\{.*\}/s, '').trim()
  }

  // 6. Send the reply
  await sendTextMessage(config.phone_number_id, config.access_token, msg.from, replyText)

  // 7. If order confirmed, save it
  if (orderJsonStr) {
    try {
      const orderData = JSON.parse(orderJsonStr)
      const orderNumber = await saveOrder(supabase, {
        clientId: client.id,
        customerPhone: msg.from,
        customerName: conversation.customer_name,
        orderItems: orderData.items || [],
        totalAmount: orderData.total,
        orderType: orderData.type || 'takeaway',
        tableNumber: orderData.tableNumber,
        deliveryAddress: orderData.deliveryAddress,
        specialNotes: orderData.specialNotes,
        whatsappMessageId: msg.messageId,
      })

      // Replace ORDER_NUMBER placeholder in the already-sent message doesn't work,
      // but the next bot message will reference the order number correctly
      // Send a follow-up with the actual order number
      await sendTextMessage(
        config.phone_number_id,
        config.access_token,
        msg.from,
        `🧾 Your order reference: *#${orderNumber}*\nShow this number if you need to follow up with us!`
      )
    } catch {
      // Order parse failed — don't crash
    }
  }

  // 8. Update conversation history
  const updatedMessages = [
    ...conversation.messages,
    { role: 'user', content: msg.text, timestamp: new Date().toISOString() },
    { role: 'assistant', content: replyText, timestamp: new Date().toISOString() },
  ].slice(-20) // Keep last 20 messages

  if (conversation.id) {
    await supabase
      .from('whatsapp_conversations')
      .update({
        messages: updatedMessages,
        customer_name: conversation.customer_name,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
  } else {
    await supabase.from('whatsapp_conversations').insert({
      client_id: client.id,
      customer_phone: msg.from,
      customer_name: conversation.customer_name,
      messages: updatedMessages,
      last_message_at: new Date().toISOString(),
    })
  }
}

async function saveOrder(
  supabase: ReturnType<typeof getServiceClient>,
  data: {
    clientId: string
    customerPhone: string
    customerName: string | null
    orderItems: { name: string; price: number; qty: number; notes?: string }[]
    totalAmount: number
    orderType: string
    tableNumber?: string
    deliveryAddress?: string
    specialNotes?: string
    whatsappMessageId: string
  }
): Promise<number> {
  const { data: order, error } = await supabase
    .from('whatsapp_orders')
    .insert({
      client_id: data.clientId,
      customer_phone: data.customerPhone,
      customer_name: data.customerName,
      order_items: data.orderItems,
      total_amount: data.totalAmount,
      order_type: data.orderType,
      table_number: data.tableNumber || null,
      delivery_address: data.deliveryAddress || null,
      special_notes: data.specialNotes || null,
      whatsapp_message_id: data.whatsappMessageId,
      status: 'new',
    })
    .select('order_number')
    .single()

  if (error) throw error
  return order.order_number
}
