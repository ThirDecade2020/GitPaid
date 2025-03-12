const axios = require('axios');
const { getUserRepositories } = require('../models/userModel');
const { 
  createRepositoryWebhook, 
  checkAndUpdateWebhook 
} = require('../services/webhookService');
const prisma = require('../config/database');

/**
 * Get all webhooks for the authenticated user
 */
async function getUserWebhooks(req, res) {
  try {
    const userId = req.user.id;
    
    // Get all webhooks for this user
    const webhooks = await prisma.repositoryWebhook.findMany({
      where: { userId }
    });
    
    return res.json({
      success: true,
      webhooks: webhooks.map(webhook => ({
        id: webhook.id,
        repository: `${webhook.repoOwner}/${webhook.repoName}`,
        createdAt: webhook.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching user webhooks:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch webhooks' 
    });
  }
}

/**
 * Create a webhook for a specific repository
 */
async function createWebhook(req, res) {
  try {
    const userId = req.user.id;
    const { owner, repo } = req.params;
    
    // Get user from database to get their token
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.token) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or GitHub token not available' 
      });
    }
    
    // Check if webhook already exists
    const existingWebhook = await prisma.repositoryWebhook.findUnique({
      where: {
        repoOwner_repoName: {
          repoOwner: owner,
          repoName: repo
        }
      }
    });
    
    if (existingWebhook) {
      // Update the existing webhook
      const updatedWebhook = await checkAndUpdateWebhook(user, existingWebhook);
      return res.json({
        success: true,
        message: 'Webhook updated successfully',
        webhook: {
          id: updatedWebhook.id,
          repository: `${updatedWebhook.repoOwner}/${updatedWebhook.repoName}`,
          createdAt: updatedWebhook.createdAt
        }
      });
    }
    
    // Create a new webhook
    const webhook = await createRepositoryWebhook(user, owner, repo);
    
    return res.status(201).json({
      success: true,
      message: 'Webhook created successfully',
      webhook: {
        id: webhook.id,
        repository: `${webhook.repoOwner}/${webhook.repoName}`,
        createdAt: webhook.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating webhook:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create webhook: ' + error.message 
    });
  }
}

/**
 * Delete a webhook for a specific repository
 */
async function deleteWebhook(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Find the webhook
    const webhook = await prisma.repositoryWebhook.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!webhook) {
      return res.status(404).json({ 
        success: false, 
        error: 'Webhook not found' 
      });
    }
    
    // Check if the webhook belongs to the user
    if (webhook.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to delete this webhook' 
      });
    }
    
    // Get user from database to get their token
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.token) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or GitHub token not available' 
      });
    }
    
    try {
      // Try to delete the webhook from GitHub
      await axios.delete(
        `https://api.github.com/repos/${webhook.repoOwner}/${webhook.repoName}/hooks/${webhook.webhookId}`,
        {
          headers: {
            Authorization: `token ${user.token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
    } catch (error) {
      console.error('Error deleting webhook from GitHub:', error.message);
      // Continue with deleting from database even if GitHub deletion fails
    }
    
    // Delete the webhook from the database
    await prisma.repositoryWebhook.delete({
      where: { id: parseInt(id) }
    });
    
    return res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to delete webhook' 
    });
  }
}

/**
 * Sync webhooks for the authenticated user
 * This will create webhooks for all repositories and update existing ones
 */
async function syncUserWebhooks(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user from database to get their token
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.token) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or GitHub token not available' 
      });
    }
    
    // Get all repositories for this user
    const repositories = await getUserRepositories(userId);
    
    // Get all existing webhooks for this user
    const existingWebhooks = await prisma.repositoryWebhook.findMany({
      where: { userId }
    });
    
    const results = {
      created: 0,
      updated: 0,
      failed: 0
    };
    
    // Process each repository
    for (const repo of repositories) {
      try {
        // Check if webhook already exists for this repository
        const existingWebhook = existingWebhooks.find(
          webhook => webhook.repoOwner === repo.owner.login && webhook.repoName === repo.name
        );
        
        if (existingWebhook) {
          // Update existing webhook
          await checkAndUpdateWebhook(user, existingWebhook);
          results.updated++;
        } else {
          // Create new webhook
          await createRepositoryWebhook(user, repo.owner.login, repo.name);
          results.created++;
        }
      } catch (error) {
        console.error(`Error processing webhook for ${repo.full_name}:`, error.message);
        results.failed++;
      }
    }
    
    return res.json({
      success: true,
      message: 'Webhooks synced successfully',
      results
    });
  } catch (error) {
    console.error('Error syncing webhooks:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to sync webhooks' 
    });
  }
}

module.exports = {
  getUserWebhooks,
  createWebhook,
  deleteWebhook,
  syncUserWebhooks
};
