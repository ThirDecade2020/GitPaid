const { Account, Client, NewClient, NewAccount, withPrivateKey, 
  Address, AddressFromHex, Receipt, ABI, ABIFromJSON, Contract, NewContract, BytecodeFromHex } = require('@radiustechsystems/sdk');

// Initialize Radius clients and accounts
let bountyListerClient;
let bountyListerAccount;
let escrowClient;
let escrowAccount;

// Initialize the Radius client and account for bounty lister
async function initializeBountyListerRadius() {
  if (!bountyListerClient) {
    const RADIUS_ENDPOINT = process.env.RADIUS_API_URL;
    const PRIVATE_KEY = process.env.RADIUS_BOUNTYLISTER_API_KEY;
    
    if (!RADIUS_ENDPOINT || !PRIVATE_KEY) {
      throw new Error('Radius API URL or Bounty Lister API Key is missing. Please check environment variables.');
    }
    
    console.log('Initializing Bounty Lister Radius client with endpoint:', RADIUS_ENDPOINT);
    bountyListerClient = await NewClient(RADIUS_ENDPOINT);
    bountyListerAccount = await NewAccount(withPrivateKey(PRIVATE_KEY, bountyListerClient));
    console.log('Bounty Lister Radius client initialized successfully');
  }
  return { client: bountyListerClient, account: bountyListerAccount };
}

// Initialize the Radius client and account for escrow
async function initializeEscrowRadius() {
  if (!escrowClient) {
    const RADIUS_ENDPOINT = process.env.RADIUS_API_URL;
    const PRIVATE_KEY = process.env.RADIUS_ESCROW_API_KEY;
    
    if (!RADIUS_ENDPOINT || !PRIVATE_KEY) {
      throw new Error('Radius API URL or Escrow API Key is missing. Please check environment variables.');
    }
    
    console.log('Initializing Escrow Radius client with endpoint:', RADIUS_ENDPOINT);
    escrowClient = await NewClient(RADIUS_ENDPOINT);
    escrowAccount = await NewAccount(withPrivateKey(PRIVATE_KEY, escrowClient));
    console.log('Escrow Radius client initialized successfully');
  }
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
    console.log('Escrow contract deployed at:', deployedContract.address.hex());
    
    return deployedContract;
  } catch (error) {
    console.error('Error deploying escrow contract:', error);
    throw new Error('Failed to deploy escrow contract: ' + error.message);
  }
}

// Lock funds in escrow by transferring to the escrow contract
async function createEscrow(userId, amount) {
  try {
    // Use the bounty lister's account to send funds to escrow
    const { client, account } = await initializeBountyListerRadius();
    console.log('Creating escrow for user:', userId, 'amount:', amount);
    
    // For production, we'll use the actual Radius integration
    // Convert amount to the smallest unit (wei equivalent)
    const amountInWei = BigInt(Math.floor(parseFloat(amount) * 10**18));
    
    // Get the escrow address from environment variables
    const escrowAddressHex = process.env.RADIUS_ESCROW_ADDRESS || '0x1234567890123456789012345678901234567890';
    const escrowAddress = AddressFromHex(escrowAddressHex);
    
    console.log(`Transferring ${amount} tokens from bounty lister to escrow address ${escrowAddressHex}`);
    
    // Send funds from bounty lister to the escrow address
    const receipt = await account.send(client, escrowAddress, amountInWei);
    const txHash = receipt.txHash.hex();
    
    console.log('Funds transferred to escrow. Transaction hash:', txHash);
    
    return txHash; // Return the transaction hash as the escrow ID
  } catch (error) {
    console.error("Error creating escrow:", error);
    throw new Error("Failed to create escrow: " + error.message);
  }
}

// Release funds from escrow to the developer
async function releaseEscrow(escrowId, toId, amount) {
  try {
    // Use the escrow account to send funds to the bounty hunter
    const { client, account } = await initializeEscrowRadius();
    console.log('Releasing escrow:', escrowId, 'to bounty hunter');
    
    // In development mode with testnet, we'll log additional information
    if (process.env.NODE_ENV === 'development') {
      console.log('Running in development mode with testnet');
    }
    
    // Get the bounty hunter's address from environment variables
    const hunterAddressHex = process.env.RADIUS_BOUNTYHUNTER_ADDRESS || '0x85EB3D12AfBFfA2Bf42EB0f070Df4AA60eF560Bc';
    const hunterAddress = AddressFromHex(hunterAddressHex);
    
    // Convert the amount to the appropriate token format (assuming 18 decimals)
    const amountToRelease = BigInt(amount * 10**18);
    
    console.log(`Transferring ${amountToRelease} tokens from escrow to bounty hunter ${hunterAddressHex}`);
    
    // Send funds from the escrow account to the bounty hunter
    const receipt = await account.send(client, hunterAddress, amountToRelease);
    const txHash = receipt.txHash.hex();
    
    console.log('Funds released to bounty hunter. Transaction hash:', txHash);
    
    return {
      success: true,
      transaction: txHash
    };
  } catch (error) {
    console.error("Error releasing escrow:", error);
    throw new Error("Failed to release escrow: " + error.message);
  }
}

// Refund funds from escrow back to the owner
async function refundEscrow(escrowId, toId, amount) {
  try {
    // Use the escrow account to refund to the bounty lister
    const { client, account } = await initializeEscrowRadius();
    console.log('Refunding escrow:', escrowId, 'to bounty lister');
    
    // In development mode with testnet, we'll log additional information
    if (process.env.NODE_ENV === 'development') {
      console.log('Running in development mode with testnet');
    }
    
    // Get the bounty lister's address - in a real implementation, this would be stored with the bounty
    const listerAddressHex = process.env.RADIUS_BOUNTYLISTER_ADDRESS || '0xE0726d13357eec32a04377BA301847D632D24646';
    const listerAddress = AddressFromHex(listerAddressHex);
    
    // Convert the amount to the appropriate token format (assuming 18 decimals)
    const amountToRefund = BigInt(amount * 10**18);
    
    console.log(`Transferring ${amountToRefund} tokens from escrow to bounty lister ${listerAddressHex}`);
    
    // Send funds from the escrow account back to the bounty lister
    const receipt = await account.send(client, listerAddress, amountToRefund);
    const txHash = receipt.txHash.hex();
    
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

module.exports = { createEscrow, releaseEscrow, refundEscrow, deployEscrowContract, initializeBountyListerRadius, initializeEscrowRadius };
