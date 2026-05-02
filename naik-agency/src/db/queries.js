const db = require('./client');
const { v4: uuidv4 } = require('uuid');

// ─── Clients ──────────────────────────────────────────────────────────────────

// Look up a client by their WhatsApp business number (the number customers message)
async function getClientByWhatsapp(phoneNumberId) {
  const { data, error } = await db
    .from('clients')
    .select('*')
    .eq('whatsapp_number', phoneNumberId)
    .eq('active', true)
    .single();
  if (error) throw error;
  return data;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

// Fetch all available menu items for a client, ordered by category then item_number
async function getMenuItems(clientId) {
  const { data, error } = await db
    .from('menu_items')
    .select('*')
    .eq('client_id', clientId)
    .eq('available', true)
    .order('category')
    .order('item_number');
  if (error) throw error;
  return data;
}

// Fetch specific menu items by item numbers (for order validation)
async function getMenuItemsByNumbers(clientId, itemNumbers) {
  const { data, error } = await db
    .from('menu_items')
    .select('*')
    .eq('client_id', clientId)
    .eq('available', true)
    .in('item_number', itemNumbers);
  if (error) throw error;
  return data;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

// Get or create a chatbot session for a customer — tracks order state in the conversation
async function getOrCreateSession(clientId, customerWhatsapp) {
  const { data: existing, error } = await db
    .from('chatbot_sessions')
    .select('*')
    .eq('client_id', clientId)
    .eq('customer_whatsapp', customerWhatsapp)
    .single();

  if (existing) return existing;

  const { data: created, error: createError } = await db
    .from('chatbot_sessions')
    .insert({
      id: uuidv4(),
      client_id: clientId,
      customer_whatsapp: customerWhatsapp,
      session_state: {},
      current_order: {},
    })
    .select()
    .single();
  if (createError) throw createError;
  return created;
}

// Persist updated session state (e.g. after intent change or order update)
async function updateSession(sessionId, updates) {
  const { error } = await db
    .from('chatbot_sessions')
    .update({ ...updates, last_message_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

// Create a new pending order record
async function createOrder(orderData) {
  const { data, error } = await db
    .from('orders')
    .insert({ id: uuidv4(), ...orderData })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Fetch an order by ID — used for payment callback idempotency check
async function getOrderById(orderId) {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (error) throw error;
  return data;
}

// Update order status (e.g. pending → confirmed, confirmed → preparing)
async function updateOrderStatus(orderId, status, extra = {}) {
  const { error } = await db
    .from('orders')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', orderId);
  if (error) throw error;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

// Upsert a Google review — safe to call multiple times for the same review_id
async function upsertReview(reviewData) {
  const { data, error } = await db
    .from('google_reviews')
    .upsert({ id: uuidv4(), ...reviewData }, { onConflict: 'review_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Mark a review as responded to
async function markReviewResponded(reviewId) {
  const { error } = await db
    .from('google_reviews')
    .update({ response_posted: true, response_posted_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) throw error;
}

// ─── Content / Broadcasts ─────────────────────────────────────────────────────

async function createContentPost(postData) {
  const { data, error } = await db
    .from('content_calendar')
    .insert({ id: uuidv4(), ...postData })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createBroadcast(broadcastData) {
  const { data, error } = await db
    .from('broadcasts')
    .insert({ id: uuidv4(), ...broadcastData })
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  getClientByWhatsapp,
  getMenuItems,
  getMenuItemsByNumbers,
  getOrCreateSession,
  updateSession,
  createOrder,
  getOrderById,
  updateOrderStatus,
  upsertReview,
  markReviewResponded,
  createContentPost,
  createBroadcast,
};
// ✅ src/db/queries.js complete
