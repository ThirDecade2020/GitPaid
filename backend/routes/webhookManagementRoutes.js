const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/authMiddleware');
const { 
  getUserWebhooks,
  createWebhook,
  deleteWebhook,
  syncUserWebhooks
} = require('../controllers/webhookController');

// Get all webhooks for the authenticated user
router.get('/webhooks', ensureAuth, getUserWebhooks);

// Create a webhook for a specific repository
router.post('/webhooks/:owner/:repo', ensureAuth, createWebhook);

// Delete a webhook
router.delete('/webhooks/:id', ensureAuth, deleteWebhook);

// Sync webhooks for the authenticated user
router.post('/webhooks/sync', ensureAuth, syncUserWebhooks);

module.exports = router;
