/**
 * Debug script to test user bounties endpoint
 * 
 * This script creates a valid JWT token and makes a direct request to the
 * user bounties endpoint to help diagnose issues with bounties not showing up.
 */
const jwt = require('jsonwebtoken');
const axios = require('axios');
const prisma = require('../config/database');

// Create a valid JWT token for testing
function createTestToken(userId) {
  const payload = { id: userId };
  return jwt.sign(payload, process.env.JWT_SECRET);
}

// Test the user bounties endpoint
async function testUserBounties() {
  try {
    // Find a user in the database
    const user = await prisma.user.findFirst();
    
    if (!user) {
      console.error('No users found in the database');
      return;
    }
    
    console.log(`Testing with user: ${user.githubUsername} (ID: ${user.id})`);
    
    // Create a valid token for this user
    const token = createTestToken(user.id);
    console.log(`Created test token: ${token}`);
    
    // Make a request to the user bounties endpoint
    const response = await axios.get('http://localhost:5000/api/bounties/user', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    // Check if there are any bounties in the database for this user
    const bounties = await prisma.bounty.findMany({
      where: { createdBy: user.id }
    });
    
    console.log(`\nFound ${bounties.length} bounties in database for user ID ${user.id}:`);
    bounties.forEach(b => {
      console.log(`- Bounty ID: ${b.id}, Repo: ${b.repoOwner}/${b.repoName}, Status: ${b.status}`);
    });
    
  } catch (error) {
    console.error('Error testing user bounties:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testUserBounties();
