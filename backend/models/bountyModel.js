const prisma = require('../config/database'); // Import the existing Prisma instance

// Create a new bounty record in the database
async function createBounty(data) {
  return prisma.bounty.create({ data });
}

// Get a bounty by ID
async function getBountyById(id) {
  return prisma.bounty.findUnique({ 
    where: { id: id },
    include: {
      owner: true,       // Include owner details
      claimer: true,     // Include claimer details
      OwnerWalletIdToWallet: true, // Include owner wallet details
      HunterWalletIdToWallet: true // Include hunter wallet details
      // Note: escrow account is managed via environment variables, not as a wallet relation
    }
  });
}

// Mark a bounty as claimed by a developer
async function markBountyClaimed(id, devId, hunterWalletId) {
  return prisma.bounty.update({
    where: { id: id },
    data: {
      claimedBy: devId,
      hunterWalletId: hunterWalletId, // Store the hunter's wallet ID
      status: 'CLAIMED'
    },
    include: { owner: true }  // include owner User details (to access owner.token)
  });
}

// Mark a bounty as completed (after approval)
async function markBountyCompleted(id, transactionId) {
  // Store the transaction ID in the escrowId field since there's no dedicated transactionId field
  // This is a temporary solution - ideally, the schema should be updated to include a transactionId field
  console.log(`Marking bounty ${id} as completed with transaction hash stored in escrowId`);
  
  return prisma.bounty.update({
    where: { id: id },
    data: { 
      status: 'COMPLETED',
      // Store the transaction hash in the escrowId field since we don't have a dedicated transactionId field
      escrowId: typeof transactionId === 'string' ? transactionId : JSON.stringify(transactionId)
      // Note: updatedAt will be automatically updated by Prisma
    }
  });
}

// Mark a bounty as cancelled
async function cancelBounty(id) {
  return prisma.bounty.update({
    where: { id: id },
    data: { status: 'CANCELLED' }
  });
}

// Get all open (unclaimed) bounties
async function getOpenBounties() {
  return prisma.bounty.findMany({
    where: { status: 'OPEN' },
    include: {
      owner: true, // Include the owner information
      OwnerWalletIdToWallet: true // Using the exact relation name from schema
    }
  });
}

// Get all bounties including completed/cancelled ones
async function getAllBounties() {
  return prisma.bounty.findMany({
    include: {
      owner: { select: { id: true, name: true, githubUsername: true } },
      claimer: { select: { id: true, name: true, githubUsername: true } },
      OwnerWalletIdToWallet: true, // Owner wallet relation
      HunterWalletIdToWallet: true // Hunter wallet relation
    }
  });
}

// Get bounties associated with a user (posted and claimed by the user)
async function getUserBounties(userId) {
  console.log(`Getting bounties for user ID: ${userId}`);
  
  // Get ALL bounties posted by the user (including completed/cancelled for history)
  const posted = await prisma.bounty.findMany({
    where: {
      createdBy: userId
    },
    include: { 
      owner: { select: { id: true, githubUsername: true, name: true } },
      claimer: { select: { id: true, githubUsername: true, name: true } },
      OwnerWalletIdToWallet: true, // Owner wallet relation
      HunterWalletIdToWallet: true // Hunter wallet relation
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`Found ${posted.length} bounties posted by user ${userId}`);
  if (posted.length > 0) {
    console.log('Sample posted bounty:', {
      id: posted[0].id,
      repo: `${posted[0].repoOwner}/${posted[0].repoName}`,
      status: posted[0].status
    });
  }
  
  // Bounties claimed by the user (still active)
  const claimed = await prisma.bounty.findMany({
    where: {
      claimedBy: userId,
      NOT: { status: { in: ['COMPLETED', 'CANCELLED'] } }
    },
    include: { 
      owner: { select: { id: true, githubUsername: true, name: true } },
      claimer: { select: { id: true, githubUsername: true, name: true } },
      OwnerWalletIdToWallet: true, // Owner wallet relation
      HunterWalletIdToWallet: true // Hunter wallet relation
    },
    orderBy: { updatedAt: 'desc' }
  });
  
  console.log(`Found ${claimed.length} bounties claimed by user ${userId}`);
  
  return { posted, claimed };
}

// Get a bounty by repository and issue number
async function getBountyByIssue(repoOwner, repoName, issueNumber) {
  return prisma.bounty.findFirst({
    where: {
      repoOwner: repoOwner,
      repoName: repoName,
      issueNumber: parseInt(issueNumber, 10)
    },
    include: {
      owner: { select: { id: true, githubUsername: true, name: true } },
      claimer: { select: { id: true, githubUsername: true, name: true } },
      OwnerWalletIdToWallet: true, // Owner wallet relation
      HunterWalletIdToWallet: true // Hunter wallet relation
    }
  });
}

module.exports = {
  createBounty,
  getBountyById,
  markBountyClaimed,
  markBountyCompleted,
  cancelBounty,
  getOpenBounties,
  getUserBounties,
  getAllBounties,
  getBountyByIssue
};
