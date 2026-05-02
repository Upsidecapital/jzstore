// PHASE 2 — Google Review Management
// Fetches new reviews via Google Business Profile API and posts AI-generated responses

const axios = require('axios');
const { complete } = require('../utils/claude');
const { upsertReview, markReviewResponded } = require('../db/queries');

// Fetch new reviews from Google Business Profile API for a given client
async function fetchNewReviews(client) {
  const res = await axios.get(
    `https://mybusiness.googleapis.com/v4/accounts/${client.google_business_id}/locations/-/reviews`,
    { headers: { Authorization: `Bearer ${process.env.GOOGLE_BUSINESS_API_KEY}` } }
  );
  return res.data.reviews || [];
}

// Generate and post a review response using Claude
async function respondToReview(review, client) {
  const lang = review.review_language || 'en';
  const halalNote = client.is_halal ? ' We are halal certified.' : '';

  const prompt = `You manage Google reviews for ${client.business_name}, a Malaysian F&B business.${halalNote}
Write a warm, professional reply to this ${review.star_rating}-star review in ${lang}.
Keep it under 60 words. Do not offer discounts unless the review is 1-2 stars.
Review: "${review.review_text}"`;

  const aiResponse = await complete({
    systemPrompt: `You write Google review responses for Malaysian F&B businesses. Always be warm, grateful, and brand-consistent.`,
    userMessage: prompt,
    maxTokens: 200,
  });

  // TODO: POST response to Google Business Profile API (requires OAuth scope)
  // await postReviewResponse(client.google_business_id, review.review_id, aiResponse);

  await markReviewResponded(review.id);
  console.log(`✅ Review responded: ${review.review_id}`);
  return aiResponse;
}

// Main runner — call this on a cron or Make.com trigger
async function processReviews(client) {
  const rawReviews = await fetchNewReviews(client);
  for (const raw of rawReviews) {
    const review = await upsertReview({
      client_id: client.id,
      review_id: raw.reviewId,
      reviewer_name: raw.reviewer?.displayName,
      star_rating: raw.starRating,
      review_text: raw.comment,
      review_language: 'en',
      response_posted: false,
    });
    if (!review.response_posted) {
      await respondToReview(review, client);
    }
  }
}

module.exports = { processReviews };
// ✅ src/marketing/reviews.js complete
