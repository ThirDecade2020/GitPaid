const axios = require('axios');
const {
  createBounty: createBountyModel,
  getBountyById,
  markBountyClaimed,
  markBountyCompleted,
  cancelBounty: cancelBountyModel,
  getOpenBounties,
  getUserBounties,
  getAllBounties,
  getBountyByIssue
} = require('../models/bountyModel');
const { getUserById } = require('../models/userModel');
const radius = require('../config/radius');

// Create a new bounty (by repository owner)
async function createBounty(req, res) {
  try {
    const { repo_owner, repo_name, issue_number, amount, walletId } = req.body;
    console.log('Received bounty creation request:', { repo_owner, repo_name, issue_number, amount, walletId });
    
    const userId = req.user.id;
    // Fetch the creating user's details (for GitHub token and Radius ID)
    const user = await getUserById(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Validate wallet ID
    if (!walletId) {
      return res.status(400).json({ error: 'Wallet ID is required' });
    }
    
    // Verify the GitHub issue exists and is open
    const issueUrl = `https://api.github.com/repos/${repo_owner}/${repo_name}/issues/${issue_number}`;
    console.log('Verifying GitHub issue:', issueUrl);
    
    try {
      const ghResponse = await axios.get(issueUrl, {
        headers: { Authorization: `token ${user.token}` }
      });
      
      const issue = ghResponse.data;
      console.log('Issue state:', issue.state);
      
      if (!issue || issue.state !== 'open') {
        return res.status(400).json({ error: 'Issue is not open or not found' });
      }
      
      // Lock funds in escrow via Radius API using the selected wallet
      const escrowId = await radius.createEscrow(userId, amount, walletId);
      console.log('Funds locked in escrow with ID:', escrowId, 'using wallet:', walletId);
      
      // Create bounty record in the database with wallet information
      const bounty = await createBountyModel({
        repoOwner: repo_owner,
        repoName: repo_name,
        issueNumber: parseInt(issue_number),
        amount: parseFloat(amount),
        currency: 'USD',
        status: 'OPEN',
        escrowId: escrowId,
        createdBy: userId,
        ownerWalletId: walletId // Store the wallet ID used for creating the bounty
      });
      
      return res.status(201).json({ bounty });
    } catch (ghError) {
      console.error('GitHub API error:', ghError.response?.status, ghError.response?.data);
      return res.status(400).json({ 
        error: 'GitHub API error', 
        message: ghError.response?.data?.message || ghError.message,
        status: ghError.response?.status
      });
    }
  } catch (error) {
    console.error('Error creating bounty:', error);
    return res.status(500).json({ error: 'Failed to create bounty', message: error.message });
  }
}

// Claim an open bounty (by a developer)
async function claimBounty(req, res) {
  try {
    const { bountyId } = req.params;
    const { walletId } = req.body; // Get the wallet ID from the request body
    const userId = req.user.id;
    
    // Validate wallet ID
    if (!walletId) {
      return res.status(400).json({ error: 'Wallet ID is required' });
    }
    
    // Fetch the bounty
    const bounty = await getBountyById(parseInt(bountyId));
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    // Verify the bounty is open
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ error: `Bounty is not open (status: ${bounty.status})` });
    }
    
    // Mark as claimed in the database with the hunter's wallet ID
    const updatedBounty = await markBountyClaimed(parseInt(bountyId), userId, walletId);
    
    return res.status(200).json({ bounty: updatedBounty });
  } catch (error) {
    console.error('Error claiming bounty:', error);
    return res.status(500).json({ error: 'Failed to claim bounty', message: error.message });
  }
}

// Complete a bounty (approve fix and release payment by repo owner)
async function completeBounty(req, res) {
  try {
    const { bountyId } = req.params;
    const userId = req.user.id;
    // Note: Escrow account is managed via environment variables (RADIUS_ESCROW_API_KEY)
    // not as a wallet database entry
    
    // Fetch the bounty
    const bounty = await getBountyById(parseInt(bountyId));
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    // Verify the requester is the owner
    if (bounty.createdBy !== userId) {
      return res.status(403).json({ error: 'Only the bounty owner can mark it as completed' });
    }
    
    // Verify the bounty is claimed
    if (bounty.status !== 'CLAIMED') {
      return res.status(400).json({ error: `Bounty cannot be completed (status: ${bounty.status})` });
    }
    
    // Release funds from escrow to the developer using the hunter's wallet
    const releaseResult = await radius.releaseEscrow(
      bounty.escrowId, 
      bounty.claimedBy, 
      bounty.amount, 
      bounty.hunterWalletId // Use the wallet ID stored when the bounty was claimed
    );
    console.log('Escrow released to wallet:', bounty.hunterWalletId, 'Result:', releaseResult);
    
    // Mark as completed in the database
    // Convert the transaction object to a string if it's not already
    const transactionId = typeof releaseResult.transaction === 'object' ? 
      JSON.stringify(releaseResult.transaction) : releaseResult.transaction;
    
    console.log('Marking bounty as completed with transaction ID:', transactionId);
    const updatedBounty = await markBountyCompleted(parseInt(bountyId), transactionId);
    
    return res.status(200).json({
      bounty: updatedBounty,
      transaction: releaseResult.transaction
    });
  } catch (error) {
    console.error('Error completing bounty:', error);
    return res.status(500).json({ error: 'Failed to complete bounty', message: error.message });
  }
}

// Cancel a bounty (refund to owner)
async function cancelBounty(req, res) {
  try {
    const { bountyId } = req.params;
    const userId = req.user.id;
    const { refundWalletId } = req.body; // Optional wallet ID to refund to
    
    // Fetch the bounty
    const bounty = await getBountyById(parseInt(bountyId));
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    // Verify the requester is the owner
    if (bounty.createdBy !== userId) {
      return res.status(403).json({ error: 'Only the bounty owner can cancel it' });
    }
    
    // Verify the bounty is open or claimed
    if (bounty.status !== 'OPEN' && bounty.status !== 'CLAIMED') {
      return res.status(400).json({ error: `Bounty cannot be cancelled (status: ${bounty.status})` });
    }
    
    // Determine which wallet to refund to
    const walletIdToUse = refundWalletId || bounty.ownerWalletId;
    
    // Refund from escrow to the owner's wallet
    const refundResult = await radius.refundEscrow(
      bounty.escrowId, 
      userId, 
      bounty.amount, 
      walletIdToUse
    );
    console.log('Escrow refunded to wallet:', walletIdToUse, 'Result:', refundResult);
    
    // Mark as cancelled in the database
    const updatedBounty = await cancelBountyModel(parseInt(bountyId));
    
    return res.status(200).json({
      bounty: updatedBounty,
      transaction: refundResult.transaction
    });
  } catch (error) {
    console.error('Error cancelling bounty:', error);
    return res.status(500).json({ error: 'Failed to cancel bounty', message: error.message });
  }
}

// List all open bounties (publicly accessible)
async function listOpenBounties(req, res) {
  try {
    const bounties = await getOpenBounties();
    return res.status(200).json({ bounties });
  } catch (error) {
    console.error('Error listing open bounties:', error);
    return res.status(500).json({ error: 'Failed to list bounties', message: error.message });
  }
}

// List all bounties (admin only)
async function listAllBounties(req, res) {
  try {
    const bounties = await getAllBounties();
    return res.status(200).json({ bounties });
  } catch (error) {
    console.error('Error listing all bounties:', error);
    return res.status(500).json({ error: 'Failed to list all bounties', message: error.message });
  }
}

// List bounties associated with the logged-in user (posted and claimed)
async function listUserBounties(req, res) {
  try {
    const userId = req.user.id;
    console.log(`Fetching bounties for user ID: ${userId}`);
    
    const bounties = await getUserBounties(userId);
    console.log('User bounties retrieved:', {
      postedCount: bounties.posted?.length || 0,
      claimedCount: bounties.claimed?.length || 0,
      postedSample: bounties.posted?.length > 0 ? bounties.posted[0].id : 'none'
    });
    
    return res.status(200).json({ bounties });
  } catch (error) {
    console.error('Error listing user bounties:', error);
    console.error('Error details:', error.stack);
    return res.status(500).json({ error: 'Failed to list bounties', message: error.message });
  }
}

module.exports = {
  createBounty,
  claimBounty,
  completeBounty,
  cancelBounty,
  listOpenBounties,
  listUserBounties,
  listAllBounties
};
