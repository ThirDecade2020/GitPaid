/**
 * GitHub API Test Script
 * 
 * This script tests GitHub API connectivity with a user's token
 * to help debug authentication and permission issues.
 */

require('dotenv').config();
const axios = require('axios');
const prisma = require('../config/database');

async function testGitHubApi() {
  try {
    // Get the first user from the database
    const user = await prisma.user.findFirst();
    
    if (!user) {
      console.error('No users found in the database');
      return;
    }
    
    console.log(`Testing with user: ${user.githubUsername} (ID: ${user.id})`);
    console.log(`Token available: ${user.token ? 'Yes' : 'No'}`);
    
    if (!user.token) {
      console.error('User has no GitHub token stored');
      return;
    }
    
    console.log('Token details:', {
      length: user.token.length,
      prefix: user.token.substring(0, 4),
      format: user.token.startsWith('ghp_') ? 'Personal Access Token' : 
              user.token.length > 40 ? 'OAuth Access Token' : 'Unknown'
    });
    
    // Test 1: Basic authentication - get user info
    console.log('\n--- Test 1: Basic Authentication ---');
    try {
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${user.token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      
      console.log('✅ Authentication successful');
      console.log(`Authenticated as: ${userResponse.data.login}`);
      console.log('Token scopes:', userResponse.headers['x-oauth-scopes']);
      
      // Test 2: Repository access
      console.log('\n--- Test 2: Repository Access ---');
      const reposResponse = await axios.get('https://api.github.com/user/repos?per_page=5', {
        headers: {
          Authorization: `token ${user.token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      
      console.log('✅ Repository access successful');
      console.log(`Found ${reposResponse.data.length} repositories`);
      
      if (reposResponse.data.length > 0) {
        const testRepo = reposResponse.data[0];
        console.log(`Testing with repository: ${testRepo.full_name}`);
        
        // Test 3: Issue access
        console.log('\n--- Test 3: Issue Access ---');
        try {
          const issuesResponse = await axios.get(`https://api.github.com/repos/${testRepo.full_name}/issues?state=all&per_page=1`, {
            headers: {
              Authorization: `token ${user.token}`,
              Accept: 'application/vnd.github.v3+json'
            }
          });
          
          console.log('✅ Issue access successful');
          console.log(`Found ${issuesResponse.data.length} issues`);
          
          if (issuesResponse.data.length > 0) {
            const testIssue = issuesResponse.data[0];
            console.log(`Test issue: #${testIssue.number} - ${testIssue.title}`);
            
            // Test 4: Specific issue access
            console.log('\n--- Test 4: Specific Issue Access ---');
            const specificIssueResponse = await axios.get(
              `https://api.github.com/repos/${testRepo.full_name}/issues/${testIssue.number}`,
              {
                headers: {
                  Authorization: `token ${user.token}`,
                  Accept: 'application/vnd.github.v3+json'
                }
              }
            );
            
            console.log('✅ Specific issue access successful');
            console.log(`Issue state: ${specificIssueResponse.data.state}`);
          } else {
            console.log('⚠️ No issues found to test specific issue access');
          }
        } catch (issueError) {
          console.error('❌ Issue access failed:', issueError.message);
          if (issueError.response) {
            console.error('Response status:', issueError.response.status);
            console.error('Response data:', issueError.response.data);
          }
        }
        
        // Test 5: Webhook access
        console.log('\n--- Test 5: Webhook Access ---');
        try {
          const webhooksResponse = await axios.get(
            `https://api.github.com/repos/${testRepo.full_name}/hooks`,
            {
              headers: {
                Authorization: `token ${user.token}`,
                Accept: 'application/vnd.github.v3+json'
              }
            }
          );
          
          console.log('✅ Webhook access successful');
          console.log(`Found ${webhooksResponse.data.length} webhooks`);
        } catch (webhookError) {
          console.error('❌ Webhook access failed:', webhookError.message);
          if (webhookError.response) {
            console.error('Response status:', webhookError.response.status);
            console.error('Response data:', webhookError.response.data);
          }
        }
      }
    } catch (authError) {
      console.error('❌ Authentication failed:', authError.message);
      if (authError.response) {
        console.error('Response status:', authError.response.status);
        console.error('Response data:', authError.response.data);
      }
    }
  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testGitHubApi()
  .then(() => console.log('\nTests completed'))
  .catch(err => console.error('Error running tests:', err));
