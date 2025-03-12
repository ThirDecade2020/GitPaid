const axios = require('axios');
const crypto = require('crypto');
const prisma = require('../config/database');

/**
 * Generate a random webhook secret
 * @returns {string} Random hex string to use as webhook secret
 */
function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate GitHub token by making a test API call
 * @param {string} token GitHub access token to validate
 * @returns {Promise<boolean>} True if token is valid
 */
async function validateGitHubToken(token) {
  if (!token) {
    console.error('No token provided for validation');
    return false;
  }
  
  try {
    // Make a simple API call to check token validity
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    
    console.log(`Token validation successful for user: ${response.data.login}`);
    return true;
  } catch (error) {
    console.error('Token validation failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
}

/**
 * Fetch repositories for a user using their GitHub access token
 * @param {string} accessToken GitHub access token
 * @returns {Promise<Array>} List of repositories
 */
async function getUserRepositories(accessToken) {
  if (!accessToken) {
    console.error('Access token is missing, cannot fetch repositories');
    return [];
  }
  console.log(`Fetching repositories with token: ${accessToken.substring(0, 4)}...`);
  
  try {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      },
      params: {
        per_page: 100,
        sort: 'updated',
        affiliation: 'owner,collaborator'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching user repositories:', error.message);
    if (error.response) {
      console.error('GitHub API response error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    return [];
  }
}

/**
 * Create a webhook for a repository
 * @param {Object} user User object with token
 * @param {string} repoOwner Repository owner
 * @param {string} repoName Repository name
 * @returns {Promise<Object>} Created webhook information
 */
async function createRepositoryWebhook(user, repoOwner, repoName) {
  console.log(`Attempting to create webhook for ${repoOwner}/${repoName} using token: ${user.token ? user.token.substring(0, 4) + '...' : 'missing'}`);
  
  // Validate the token first
  if (!user.token) {
    throw new Error('GitHub token is missing, cannot create webhook');
  }
  
  const isTokenValid = await validateGitHubToken(user.token);
  if (!isTokenValid) {
    throw new Error('GitHub token is invalid or has insufficient permissions');
  }
  
  try {
    // Check if webhook already exists for this repository
    const existingWebhook = await prisma.repositoryWebhook.findUnique({
      where: {
        repoOwner_repoName: {
          repoOwner,
          repoName
        }
      }
    });
    
    if (existingWebhook) {
      console.log(`Webhook already exists for ${repoOwner}/${repoName}`);
      return existingWebhook;
    }
    
    const webhookSecret = generateWebhookSecret();
    const apiBaseUrl = process.env.API_BASE_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    // Create webhook via GitHub API
    const response = await axios.post(
      `https://api.github.com/repos/${repoOwner}/${repoName}/hooks`,
      {
        name: 'web',
        active: true,
        events: ['issues', 'issue_comment', 'pull_request'],
        config: {
          url: `${apiBaseUrl}/webhooks/github/${repoOwner}/${repoName}`,
          content_type: 'json',
          secret: webhookSecret
        }
      },
      {
        headers: {
          Authorization: `token ${user.token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log(`Created webhook for ${repoOwner}/${repoName}`);
    
    // Store webhook information in database
    const webhook = await prisma.repositoryWebhook.create({
      data: {
        userId: user.id,
        repoOwner,
        repoName,
        webhookId: response.data.id.toString(),
        webhookSecret
      }
    });
    
    return webhook;
  } catch (error) {
    console.error(`Error creating webhook for ${repoOwner}/${repoName}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', error.response.data);
      
      // Check for specific error conditions
      if (error.response.status === 404) {
        console.error('Repository not found or user does not have access to it');
      } else if (error.response.status === 401) {
        console.error('Authentication failed - token may be invalid or expired');
      } else if (error.response.status === 403) {
        console.error('Forbidden - user may not have permission to create webhooks');
        console.error('Make sure the OAuth scope includes admin:repo_hook');
      } else if (error.response.status === 422) {
        console.error('Validation failed - webhook may already exist or have invalid parameters');
      }
    } else if (error.request) {
      console.error('No response received from GitHub API');
    } else {
      console.error('Error setting up request:', error.message);
    }
    throw error;
  }
}

/**
 * Create webhooks for all repositories of a user
 * @param {Object} user User object with token
 * @returns {Promise<Array>} Created webhooks
 */
async function createWebhooksForUser(user) {
  console.log(`Creating webhooks for user ${user.githubUsername} (ID: ${user.id})`);
  console.log(`Token available: ${user.token ? 'Yes' : 'No'}`);
  if (!user.token) {
    console.error('User token is missing, cannot create webhooks');
    return [];
  }
  
  try {
    const repos = await getUserRepositories(user.token);
    const webhooks = [];
    
    for (const repo of repos) {
      try {
        const webhook = await createRepositoryWebhook(user, repo.owner.login, repo.name);
        webhooks.push(webhook);
      } catch (error) {
        console.error(`Failed to create webhook for ${repo.full_name}:`, error.message);
        // Continue with other repositories
      }
    }
    
    return webhooks;
  } catch (error) {
    console.error('Error creating webhooks for user:', error.message);
    return [];
  }
}

/**
 * Update an existing webhook for a repository
 * @param {Object} user User object with token
 * @param {Object} webhook Existing webhook information
 * @returns {Promise<Object>} Updated webhook information
 */
async function updateRepositoryWebhook(user, webhook) {
  try {
    // Generate a new webhook secret
    const webhookSecret = generateWebhookSecret();
    const apiBaseUrl = process.env.API_BASE_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    // Update webhook via GitHub API
    await axios.patch(
      `https://api.github.com/repos/${webhook.repoOwner}/${webhook.repoName}/hooks/${webhook.webhookId}`,
      {
        active: true,
        events: ['issues', 'issue_comment', 'pull_request'],
        config: {
          url: `${apiBaseUrl}/webhooks/github/${webhook.repoOwner}/${webhook.repoName}`,
          content_type: 'json',
          secret: webhookSecret
        }
      },
      {
        headers: {
          Authorization: `token ${user.token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log(`Updated webhook for ${webhook.repoOwner}/${webhook.repoName}`);
    
    // Update webhook information in database
    const updatedWebhook = await prisma.repositoryWebhook.update({
      where: { id: webhook.id },
      data: { webhookSecret }
    });
    
    return updatedWebhook;
  } catch (error) {
    console.error(`Error updating webhook for ${webhook.repoOwner}/${webhook.repoName}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Check if a webhook needs to be updated and update it if necessary
 * @param {Object} user User object with token
 * @param {Object} webhook Existing webhook information
 * @returns {Promise<Object>} Updated webhook information
 */
async function checkAndUpdateWebhook(user, webhook) {
  try {
    // Get webhook from GitHub API
    const response = await axios.get(
      `https://api.github.com/repos/${webhook.repoOwner}/${webhook.repoName}/hooks/${webhook.webhookId}`,
      {
        headers: {
          Authorization: `token ${user.token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    // Check if webhook URL needs to be updated
    const currentUrl = response.data.config.url;
    const apiBaseUrl = process.env.API_BASE_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const expectedUrl = `${apiBaseUrl}/webhooks/github/${webhook.repoOwner}/${webhook.repoName}`;
    
    if (currentUrl !== expectedUrl || !response.data.active) {
      console.log(`Webhook URL or status needs to be updated for ${webhook.repoOwner}/${webhook.repoName}`);
      return updateRepositoryWebhook(user, webhook);
    }
    
    console.log(`Webhook for ${webhook.repoOwner}/${webhook.repoName} is up to date`);
    return webhook;
  } catch (error) {
    console.error(`Error checking webhook for ${webhook.repoOwner}/${webhook.repoName}:`, error.message);
    if (error.response && error.response.status === 404) {
      console.log(`Webhook not found on GitHub, recreating for ${webhook.repoOwner}/${webhook.repoName}`);
      // Webhook doesn't exist anymore, create a new one
      await prisma.repositoryWebhook.delete({ where: { id: webhook.id } });
      return createRepositoryWebhook(user, webhook.repoOwner, webhook.repoName);
    }
    throw error;
  }
}

module.exports = {
  generateWebhookSecret,
  getUserRepositories,
  createRepositoryWebhook,
  createWebhooksForUser,
  updateRepositoryWebhook,
  checkAndUpdateWebhook,
  validateGitHubToken
};
