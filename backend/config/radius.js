const { Account, Client, NewClient, NewAccount, withPrivateKey, 
  Address, AddressFromHex, Receipt, ABI, ABIFromJSON, Contract, NewContract, BytecodeFromHex } = require('@radiustechsystems/sdk');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const walletController = require('../controllers/walletController');

// Initialize Radius clients and accounts
let bountyListerClient;
let bountyListerAccount;
let escrowClient;
let escrowAccount;

// Cache for wallet-specific clients and accounts
const walletClients = new Map();
const walletAccounts = new Map();

// Initialize the Radius client and account for a specific wallet
async function initializeWalletRadius(walletId, userId) {
  // Check if we already have a client and account for this wallet
  if (walletClients.has(walletId) && walletAccounts.has(walletId)) {
    return { 
      client: walletClients.get(walletId), 
      account: walletAccounts.get(walletId) 
    };
  }

  const RADIUS_ENDPOINT = process.env.RADIUS_API_URL;
  if (!RADIUS_ENDPOINT) {
    throw new Error('Radius API URL is missing. Please check environment variables.');
  }

  try {
    // Get wallet with decrypted private key
    const wallet = await walletController.getWalletWithPrivateKey(walletId, userId);
    
    // Sanitize the private key - ensure it's a valid hex string
    let privateKey = wallet.privateKey;
    
    // Check if the key starts with 0x, if not add it
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }
    
    // Remove any non-hex characters that might have been introduced during encryption/decryption
    privateKey = privateKey.replace(/[^0-9a-fA-Fx]/g, '');
    
    // Ensure the key is the correct length (32 bytes = 64 hex chars + '0x' prefix)
    if (privateKey.length > 66) {
      privateKey = privateKey.substring(0, 66);
    } else if (privateKey.length < 66 && privateKey.length > 2) {
      // Pad with zeros if too short
      privateKey = '0x' + privateKey.substring(2).padStart(64, '0');
    }
    
    console.log(`Initializing Radius client for wallet ${wallet.walletName} with endpoint: ${RADIUS_ENDPOINT}`);
    const client = await NewClient(RADIUS_ENDPOINT);
    const account = await NewAccount(withPrivateKey(privateKey, client));
    
    // Cache the client and account
    walletClients.set(walletId, client);
    walletAccounts.set(walletId, account);
    
    console.log(`Radius client for wallet ${wallet.walletName} initialized successfully`);
    return { client, account };
  } catch (error) {
    console.error('Error initializing wallet Radius client:', error);
    throw new Error(`Failed to initialize wallet Radius client: ${error.message}`);
  }
}

// Initialize the Radius client and account for escrow
async function initializeEscrowRadius() {
  // Always reinitialize to pick up any environment variable changes
  const RADIUS_ENDPOINT = process.env.RADIUS_API_URL;
  const PRIVATE_KEY = process.env.RADIUS_ESCROW_API_KEY;
  
  if (!RADIUS_ENDPOINT || !PRIVATE_KEY) {
    throw new Error('Radius API URL or Escrow API Key is missing. Please check environment variables.');
  }
  
  console.log('Initializing Escrow Radius client with endpoint:', RADIUS_ENDPOINT);
  console.log('Using Escrow API Key:', PRIVATE_KEY.substring(0, 6) + '...' + PRIVATE_KEY.substring(PRIVATE_KEY.length - 4));
  
  escrowClient = await NewClient(RADIUS_ENDPOINT);
  escrowAccount = await NewAccount(withPrivateKey(PRIVATE_KEY, escrowClient));
  
  // Log the escrow account address for verification
  const escrowAddress = escrowAccount.address.toString();
  console.log('Escrow account address:', escrowAddress);
  console.log('Expected escrow address from env:', process.env.RADIUS_ESCROW_ADDRESS);
  
  if (escrowAddress.toLowerCase() !== process.env.RADIUS_ESCROW_ADDRESS.toLowerCase()) {
    console.warn('Warning: Escrow account address does not match RADIUS_ESCROW_ADDRESS in environment variables');
  }
  
  console.log('Escrow Radius client initialized successfully');
  return { client: escrowClient, account: escrowAccount };
}

// Deploy a simple escrow contract
async function deployEscrowContract() {
  try {
    const { client, account } = await initializeBountyListerRadius();
    
    // Simple escrow contract ABI and bytecode
    // This is a very basic escrow contract that allows the owner to release funds to a beneficiary
    const escrowAbi = ABIFromJSON(`[
      {"inputs":[{"name":"_beneficiary","type":"address"}],"stateMutability":"payable","type":"constructor"},
      {"inputs":[],"name":"release","outputs":[],"stateMutability":"nonpayable","type":"function"},
      {"inputs":[],"name":"refund","outputs":[],"stateMutability":"nonpayable","type":"function"},
      {"inputs":[],"name":"beneficiary","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
      {"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}
    ]`);
    
    // This is a placeholder. In a real implementation, you would need the actual compiled bytecode of your contract
    const escrowBytecode = BytecodeFromHex('608060405260405161047f38038061047f833981810160405281019061002591906100a4565b336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555080600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505061010e565b600081519050610090816100f7565b92915050565b6000815190506100a5816100f7565b92915050565b6000602082840312156100ba57600080fd5b60006100c884828501610081565b91505092915050565b60006100dc82610096565b9050919050565b6100ec816100d1565b81146100f757600080fd5b50565b610101816100d1565b811461010c57600080fd5b50565b610362806101256000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80633ccfd60b14610051578063590e1ae31461005b578063be040fb014610065578063cf309012146100af575b600080fd5b6100596100f9565b005b6100636101ad565b005b61006d61026d565b60405180827dffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b6100b7610293565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161461015457600080fd5b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166108fc479081150290604051600060405180830381858888f193505050501580156101b9573d6000803e3d6000fd5b50565b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161461020857600080fd5b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166108fc479081150290604051600060405180830381858888f1935050505015801561026a573d6000803e3d6000fd5b50565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff168156fea2646970667358221220d1f1b6b9ec756d7d3f2f2e5e1e15a9f47997fbcf5ca9e8a2c39ddade4362aac364736f6c63430006060033');
    
    console.log('Deploying escrow contract...');
    const deployedContract = await client.deployContract(account.signer, escrowBytecode, escrowAbi);
    console.log('Escrow contract deployed at:', deployedContract.address.toString());
    
    return deployedContract;
  } catch (error) {
    console.error('Error deploying escrow contract:', error);
    throw new Error('Failed to deploy escrow contract: ' + error.message);
  }
}

// Lock funds in escrow by transferring to the escrow contract
async function createEscrow(userId, amount, walletId) {
  try {
    // Use the specified wallet to send funds to escrow
    const { client, account } = await initializeWalletRadius(walletId, userId);
    console.log('Creating escrow for user:', userId, 'amount:', amount, 'using wallet:', walletId);
    
    // Ensure amount is a valid number
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      throw new Error(`Invalid amount: ${amount}. Must be a valid number.`);
    }
    
    // Convert amount to the smallest unit (wei equivalent)
    const amountInWei = BigInt(Math.floor(numericAmount * 10**18));
    
    // Get the escrow address from environment variables
    const escrowAddressHex = process.env.RADIUS_ESCROW_ADDRESS;
    if (!escrowAddressHex) {
      throw new Error('RADIUS_ESCROW_ADDRESS is missing from environment variables');
    }
    
    console.log('Using escrow address from environment variables:', escrowAddressHex);
    const escrowAddress = AddressFromHex(escrowAddressHex);
    
    // Log wallet balance for debugging
    try {
      // The correct way to get balance is using the account object
      const walletBalance = await account.getBalance(client);
      console.log(`Wallet ${walletId} balance:`, walletBalance.toString());
    } catch (balanceError) {
      console.warn(`Could not fetch balance for wallet ${walletId}:`, balanceError.message);
      // Continue with the transaction even if we can't get the balance
    }
    
    console.log(`Transferring ${numericAmount} tokens (${amountInWei} wei) from wallet ${walletId} to escrow address ${escrowAddressHex}`);
    
    // Send funds from the wallet to the escrow address
    const receipt = await account.send(client, escrowAddress, amountInWei);
    const txHash = receipt.txHash.toString();
    
    console.log('Funds transferred to escrow. Transaction hash:', txHash);
    
    return txHash; // Return the transaction hash as the escrow ID
  } catch (error) {
    console.error("Error creating escrow:", error);
    console.error("Error stack:", error.stack);
    throw new Error("Failed to create escrow: " + error.message);
  }
}

// Release funds from escrow to the developer
async function releaseEscrow(escrowId, toId, amount, hunterWalletId) {
  try {
    // Use the escrow account to send funds to the bounty hunter
    const { client, account } = await initializeEscrowRadius();
    console.log('Releasing escrow:', escrowId, 'to bounty hunter wallet:', hunterWalletId);
    console.log('Amount to release:', amount);
    
    // In development mode with testnet, we'll log additional information
    if (process.env.NODE_ENV === 'development') {
      console.log('Running in development mode with testnet');
      console.log('Escrow account address:', account.address.toString());
      try {
        const escrowBalance = await account.getBalance(client);
        console.log('Escrow account balance:', escrowBalance.toString());
      } catch (balanceError) {
        console.warn('Could not fetch escrow account balance:', balanceError.message);
      }
    }
    
    // Get the bounty hunter's wallet from the database
    const hunterWallet = await prisma.wallet.findUnique({
      where: { id: hunterWalletId }
    });
    
    if (!hunterWallet) {
      throw new Error(`Hunter wallet with ID ${hunterWalletId} not found`);
    }
    
    
    const hunterAddressHex = hunterWallet.publicKey;
    console.log('Hunter wallet public key:', hunterAddressHex);
    const hunterAddress = AddressFromHex(hunterAddressHex);
    
    // Convert the amount to the appropriate token format (assuming 18 decimals)
    // Ensure amount is treated as a number before multiplication
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      throw new Error(`Invalid amount: ${amount}. Must be a valid number.`);
    }
    
    // Use BigInt for precise calculations with large numbers
    const amountInWei = BigInt(Math.floor(numericAmount * 10**18));
    
    console.log(`Transferring ${numericAmount} tokens (${amountInWei} wei) from escrow to bounty hunter wallet ${hunterAddressHex}`);
    
    // Send funds from the escrow account to the bounty hunter
    const receipt = await account.send(client, hunterAddress, amountInWei);
    const txHash = receipt.txHash.toString();
    
    console.log('Funds released to bounty hunter. Transaction hash:', txHash);
    
    return {
      success: true,
      transaction: txHash
    };
  } catch (error) {
    console.error("Error releasing escrow:", error);
    console.error("Error stack:", error.stack);
    throw new Error("Failed to release escrow: " + error.message);
  }
}

// Refund funds from escrow back to the owner
async function refundEscrow(escrowId, toId, amount, ownerWalletId) {
  try {
    // Use the escrow account to refund to the bounty lister
    const { client, account } = await initializeEscrowRadius();
    console.log('Refunding escrow:', escrowId, 'to bounty lister wallet:', ownerWalletId);
    
    // In development mode with testnet, we'll log additional information
    if (process.env.NODE_ENV === 'development') {
      console.log('Running in development mode with testnet');
    }
    
    // Get the bounty lister's wallet from the database
    const ownerWallet = await prisma.wallet.findUnique({
      where: { id: ownerWalletId }
    });
    
    if (!ownerWallet) {
      throw new Error(`Owner wallet with ID ${ownerWalletId} not found`);
    }
    
    const listerAddressHex = ownerWallet.publicKey;
    const listerAddress = AddressFromHex(listerAddressHex);
    
    // Convert the amount to the appropriate token format (assuming 18 decimals)
    const amountToRefund = BigInt(amount * 10**18);
    
    console.log(`Transferring ${amountToRefund} tokens from escrow to bounty lister wallet ${listerAddressHex}`);
    
    // Send funds from the escrow account back to the bounty lister
    const receipt = await account.send(client, listerAddress, amountToRefund);
    const txHash = receipt.txHash.toString();
    
    console.log('Funds refunded to bounty lister. Transaction hash:', txHash);
    
    return {
      success: true,
      transaction: txHash
    };
  } catch (error) {
    console.error("Error refunding escrow:", error);
    throw new Error("Failed to refund escrow: " + error.message);
  }
}

module.exports = { createEscrow, releaseEscrow, refundEscrow, deployEscrowContract, initializeWalletRadius, initializeEscrowRadius };
