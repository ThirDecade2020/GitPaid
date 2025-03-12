const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test the connection immediately
prisma.$connect()
  .then(() => console.log('Wallet controller: Database connection established'))
  .catch(e => console.error('Wallet controller: Failed to connect to database:', e));
const crypto = require('crypto');
const EC = require('elliptic').ec;

// Initialize elliptic curve with secp256k1 (the curve used by Bitcoin and Ethereum)
const ec = new EC('secp256k1');

// Encryption settings
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
// AES-256-CBC requires a 32-byte key (256 bits)
const ENCRYPTION_KEY_RAW = process.env.WALLET_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
// Create a 32-byte key by hashing the raw key with SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();

/**
 * Encrypt a private key
 * @param {string} privateKey - The private key to encrypt
 * @returns {Object} - The encrypted private key and IV
 */
const encryptPrivateKey = (privateKey) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv); // ENCRYPTION_KEY is already a Buffer
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    encryptedPrivateKey: encrypted,
    iv: iv.toString('hex')
  };
};

/**
 * Decrypt a private key
 * @param {string} encryptedPrivateKey - The encrypted private key
 * @param {string} iv - The initialization vector used for encryption
 * @returns {string} - The decrypted private key
 */
const decryptPrivateKey = (encryptedPrivateKey, iv) => {
  try {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM, 
      ENCRYPTION_KEY, // Already a Buffer from the SHA-256 hash
      Buffer.from(iv, 'hex')
    );
    let decrypted = decipher.update(encryptedPrivateKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Ensure the private key is in the correct format for Radius SDK
    // It should be a valid hex string, optionally with 0x prefix
    if (decrypted.startsWith('0x')) {
      decrypted = decrypted.substring(2);
    }
    
    // Remove any non-hex characters
    decrypted = decrypted.replace(/[^0-9a-fA-F]/g, '');
    
    // Ensure it's the right length (32 bytes = 64 hex chars)
    if (decrypted.length > 64) {
      decrypted = decrypted.substring(0, 64);
    } else if (decrypted.length < 64) {
      // Pad with zeros if too short
      decrypted = decrypted.padStart(64, '0');
    }
    
    // Add 0x prefix for consistency
    return '0x' + decrypted;
  } catch (error) {
    console.error('Error decrypting private key:', error);
    throw new Error('Failed to decrypt wallet private key');
  }
};

/**
 * Generate a new secp256k1 key pair
 * @returns {Object} - The generated key pair with privateKey and publicKey
 */
const generateKeyPair = () => {
  // Generate a new key pair
  const keyPair = ec.genKeyPair();
  
  // Get private key in hex format
  const privateKeyHex = keyPair.getPrivate('hex');
  
  // Get public key in compressed hex format
  const publicKeyHex = keyPair.getPublic(true, 'hex');
  
  return {
    privateKey: `0x${privateKeyHex}`,
    publicKey: `0x${publicKeyHex}`
  };
};

/**
 * Create a new wallet for a user
 */
const createWallet = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      console.error('User not authenticated or missing ID');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { walletName, privateKey: providedPrivateKey, publicKey: providedPublicKey, generateNewKey = false } = req.body;
    const userId = req.user.id;

    if (!walletName) {
      return res.status(400).json({ error: 'Wallet name is required' });
    }
    
    // Require public address if not generating a new key
    if (!generateNewKey && !providedPublicKey) {
      return res.status(400).json({ error: 'Public address is required when importing an existing wallet' });
    }
    
    // Variables for wallet creation
    let privateKey;
    let finalPublicKey;
    
    // If generateNewKey is true or no private key is provided, generate a new key pair
    if (generateNewKey || !providedPrivateKey) {
      try {
        // Generate a new key pair
        const keyPair = generateKeyPair();
        privateKey = keyPair.privateKey;
        finalPublicKey = keyPair.publicKey;
        console.log('Generated new key pair successfully');
      } catch (genError) {
        console.error('Error generating key pair:', genError);
        return res.status(500).json({ error: 'Failed to generate wallet keys' });
      }
    } else {
      privateKey = providedPrivateKey;
      
      // Use the provided public key directly
      finalPublicKey = providedPublicKey;
      
      // Validate the public key format
      if (!finalPublicKey.startsWith('0x')) {
        finalPublicKey = `0x${finalPublicKey}`;
      }
      
      // Optionally validate that the private key corresponds to the public key
      try {
        // Remove '0x' prefix if present
        const privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
        
        // Create key pair from private key
        const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
        
        // Get public key in compressed hex format
        const derivedPublicKeyHex = `0x${keyPair.getPublic(true, 'hex')}`;
        
        // Log but don't enforce matching - this allows for advanced wallet setups
        if (derivedPublicKeyHex.toLowerCase() !== finalPublicKey.toLowerCase()) {
          console.warn('Warning: Provided public key does not match the derived public key from the private key');
        }
        
        console.log('Validated public key format');
      } catch (err) {
        console.error('Error validating private key:', err);
        return res.status(400).json({ error: 'Invalid private key format. Must be a valid secp256k1 private key' });
      }
    }

    // Encrypt the private key
    let encryptedPrivateKey, iv;
    try {
      const encryptionResult = encryptPrivateKey(privateKey);
      encryptedPrivateKey = encryptionResult.encryptedPrivateKey;
      iv = encryptionResult.iv;
      console.log('Encrypted private key successfully');
    } catch (encryptError) {
      console.error('Error encrypting private key:', encryptError);
      return res.status(500).json({ error: 'Failed to secure wallet private key' });
    }

    // Check if Prisma client is available
    if (!prisma) {
      console.error('Prisma client is not initialized');
      return res.status(500).json({ error: 'Database connection error' });
    }
    
    // Check if this is the first wallet for the user
    let existingWallets = 0;
    try {
      console.log('Attempting to count existing wallets for user:', userId);
      console.log('Prisma instance available:', !!prisma);
      
      if (prisma && typeof prisma.wallet === 'undefined') {
        console.error('Prisma wallet model is undefined. Available models:', Object.keys(prisma));
        // If the wallet model is not available, we'll assume it's the first wallet
        // This is a fallback to prevent the function from failing completely
      } else {
        // Use a direct SQL query if possible, or a simpler Prisma operation
        const wallets = await prisma.wallet.findMany({
          where: { userId: userId },
          select: { id: true }
        });
        
        existingWallets = wallets ? wallets.length : 0;
        console.log(`User has ${existingWallets} existing wallets`);
      }
    } catch (countError) {
      console.error('Error counting existing wallets:', countError);
      console.error('Error details:', JSON.stringify(countError, null, 2));
      // Continue with wallet creation, assuming it's the first wallet
    }

    // Create the wallet
    let wallet;
    try {
      console.log('Attempting to create wallet for user:', userId);
      console.log('Prisma instance available:', !!prisma);
      
      if (prisma && typeof prisma.wallet === 'undefined') {
        console.error('Prisma wallet model is undefined. Available models:', Object.keys(prisma));
        return res.status(500).json({ 
          error: 'Database configuration error', 
          details: 'Wallet model not available in Prisma client' 
        });
      }
      
      // Create the wallet record
      const walletData = {
        userId: userId,
        walletName: walletName,
        publicKey: finalPublicKey,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv,
        isDefault: existingWallets === 0, // Make it default if it's the first wallet
        updatedAt: new Date() // Required field in the schema
      };
      
      console.log('Creating wallet with data:', { ...walletData, encryptedPrivateKey: '[REDACTED]' });
      
      wallet = await prisma.wallet.create({
        data: walletData
      });
      
      console.log('Wallet created successfully:', wallet.id);
    } catch (createError) {
      console.error('Error creating wallet in database:', createError);
      console.error('Error details:', JSON.stringify(createError, null, 2));
      return res.status(500).json({ 
        error: 'Failed to create wallet in database', 
        details: createError.message 
      });
    }

    // Return the wallet without the encrypted private key
    return res.status(201).json({
      id: wallet.id,
      walletName: wallet.walletName,
      publicKey: wallet.publicKey,
      isDefault: wallet.isDefault,
      createdAt: wallet.createdAt
    });
  } catch (error) {
    console.error('Error creating wallet:', error);
    return res.status(500).json({ error: 'Failed to create wallet' });
  }
};

/**
 * Get all wallets for a user
 */
const getWallets = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      console.error('User not authenticated or missing ID');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Check if Prisma client is available
    if (!prisma) {
      console.error('Prisma client is not initialized');
      return res.status(500).json({ error: 'Database connection error' });
    }

    const wallets = await prisma.wallet.findMany({
      where: { userId: userId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        walletName: true,
        publicKey: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.status(200).json(wallets || []);
  } catch (error) {
    console.error('Error fetching wallets:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch wallets',
      details: error.message 
    });
  }
};

/**
 * Get a single wallet by ID
 */
const getWallet = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      console.error('User not authenticated or missing ID');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if Prisma client is available
    if (!prisma) {
      console.error('Prisma client is not initialized');
      return res.status(500).json({ error: 'Database connection error' });
    }
    
    // Validate wallet ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid wallet ID' });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        walletName: true,
        publicKey: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        userId: true
      }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Ensure the wallet belongs to the user
    if (wallet.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to wallet' });
    }

    // Remove userId from response
    const { userId: _, ...walletData } = wallet;
    return res.status(200).json(walletData);
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch wallet',
      details: error.message 
    });
  }
};

/**
 * Update a wallet
 */
const updateWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletName, isDefault } = req.body;
    const userId = req.user.id;

    // Check if wallet exists and belongs to user
    const existingWallet = await prisma.wallet.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingWallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (existingWallet.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to wallet' });
    }

    // If setting as default, unset any existing default wallet
    if (isDefault) {
      await prisma.wallet.updateMany({
        where: { 
          userId,
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    // Update the wallet
    const updatedWallet = await prisma.wallet.update({
      where: { id: parseInt(id) },
      data: {
        ...(walletName && { walletName }),
        ...(isDefault !== undefined && { isDefault })
      },
      select: {
        id: true,
        walletName: true,
        publicKey: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.status(200).json(updatedWallet);
  } catch (error) {
    console.error('Error updating wallet:', error);
    return res.status(500).json({ error: 'Failed to update wallet' });
  }
};

/**
 * Delete a wallet
 */
const deleteWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { force = false } = req.query; // Add force option as query parameter
    const userId = req.user.id;

    // Check if wallet exists and belongs to user
    const existingWallet = await prisma.wallet.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingWallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (existingWallet.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to wallet' });
    }

    // Check if wallet is in use by any bounties
    const associatedBounties = await prisma.bounty.findMany({
      where: {
        OR: [
          { ownerWalletId: parseInt(id) },
          { hunterWalletId: parseInt(id) }
        ]
      },
      select: {
        id: true,
        status: true,
        ownerWalletId: true,
        hunterWalletId: true
      }
    });

    // If there are associated bounties and force is not true, return error with count
    if (associatedBounties.length > 0 && force !== 'true' && force !== true) {
      return res.status(400).json({ 
        error: 'Cannot delete wallet that is associated with bounties', 
        bountyCount: associatedBounties.length,
        message: 'This wallet is associated with bounties. Use force=true to remove the wallet association from these bounties before deletion.'
      });
    }

    // If force is true, update all associated bounties to remove this wallet
    if (associatedBounties.length > 0 && (force === 'true' || force === true)) {
      console.log(`Force deleting wallet ${id} and removing associations from ${associatedBounties.length} bounties`);
      
      // Update all bounties that use this wallet
      for (const bounty of associatedBounties) {
        const updateData = {};
        
        if (bounty.ownerWalletId === parseInt(id)) {
          updateData.ownerWalletId = null;
        }
        
        if (bounty.hunterWalletId === parseInt(id)) {
          updateData.hunterWalletId = null;
        }
        
        await prisma.bounty.update({
          where: { id: bounty.id },
          data: updateData
        });
      }
    }

    // Delete the wallet
    await prisma.wallet.delete({
      where: { id: parseInt(id) }
    });

    // If this was the default wallet, set another wallet as default if available
    if (existingWallet.isDefault) {
      const anotherWallet = await prisma.wallet.findFirst({
        where: { userId }
      });

      if (anotherWallet) {
        await prisma.wallet.update({
          where: { id: anotherWallet.id },
          data: { isDefault: true }
        });
      }
    }

    return res.status(200).json({ message: 'Wallet deleted successfully' });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    return res.status(500).json({ error: 'Failed to delete wallet' });
  }
};

/**
 * Check if user has any wallets
 */
const checkWallets = async (req, res) => {
  try {
    const userId = req.user.id;

    const walletCount = await prisma.wallet.count({
      where: { userId }
    });

    return res.status(200).json({ 
      hasWallets: walletCount > 0,
      count: walletCount
    });
  } catch (error) {
    console.error('Error checking wallets:', error);
    return res.status(500).json({ error: 'Failed to check wallets' });
  }
};

/**
 * Get wallet with decrypted private key (for internal use only)
 */
const getWalletWithPrivateKey = async (walletId, userId) => {
  const wallet = await prisma.wallet.findUnique({
    where: { id: parseInt(walletId) }
  });

  if (!wallet) {
    throw new Error('Wallet not found');
  }

  if (wallet.userId !== userId) {
    throw new Error('Unauthorized access to wallet');
  }

  const privateKey = decryptPrivateKey(wallet.encryptedPrivateKey, wallet.iv);
  
  return {
    ...wallet,
    privateKey
  };
};

// Get wallet associations with bounties
const getWalletAssociations = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all wallets for the user
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      select: {
        id: true
      }
    });
    
    const walletIds = wallets.map(wallet => wallet.id);
    
    // Find all bounties associated with these wallets
    const bountyAssociations = await prisma.bounty.findMany({
      where: {
        OR: [
          { ownerWalletId: { in: walletIds } },
          { hunterWalletId: { in: walletIds } }
        ]
      },
      select: {
        id: true,
        ownerWalletId: true,
        hunterWalletId: true
      }
    });
    
    // Create a map of wallet IDs to bounty counts
    const associationsMap = {};
    
    bountyAssociations.forEach(bounty => {
      if (bounty.ownerWalletId && walletIds.includes(bounty.ownerWalletId)) {
        associationsMap[bounty.ownerWalletId] = (associationsMap[bounty.ownerWalletId] || 0) + 1;
      }
      
      if (bounty.hunterWalletId && walletIds.includes(bounty.hunterWalletId)) {
        associationsMap[bounty.hunterWalletId] = (associationsMap[bounty.hunterWalletId] || 0) + 1;
      }
    });
    
    return res.status(200).json(associationsMap);
  } catch (error) {
    console.error('Error getting wallet associations:', error);
    return res.status(500).json({ error: 'Failed to get wallet associations' });
  }
};

module.exports = {
  createWallet,
  getWallets,
  getWallet,
  updateWallet,
  deleteWallet,
  checkWallets,
  getWalletWithPrivateKey,
  generateKeyPair,
  getWalletAssociations
};
