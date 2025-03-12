const prisma = require('../config/database');
const axios = require('axios');

// Find or create a user using GitHub OAuth profile data
async function findOrCreateUser(profile, token) {
  const githubId = profile.id.toString();
  // Check if user already exists
  let user = await prisma.user.findUnique({ where: { githubId } });
  if (!user) {
    // Create new user in DB
    user = await prisma.user.create({
      data: {
        githubId: githubId,
        githubUsername: profile.username,
        name: profile.displayName || profile.username,
        token: token
      }
    });
    // (In a real app, you might create a Radius account for the user here)
  } else {
    // Update user token and username on each login
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        githubUsername: profile.username,
        token: token
      }
    });
  }
  return user;
}

// Get a user by ID
async function getUserById(id) {
  return prisma.user.findUnique({ where: { id: id } });
}

/**
 * Fetch repositories for a user using their GitHub token
 * @param {string} userId User ID
 * @returns {Promise<Array>} List of repositories
 */
async function getUserRepositories(userId) {
  try {
    const user = await getUserById(userId);
    if (!user || !user.token) {
      throw new Error('User not found or token not available');
    }
    
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${user.token}`,
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
    return [];
  }
}

module.exports = { findOrCreateUser, getUserById, getUserRepositories };
