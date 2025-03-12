const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

// All wallet routes require authentication
router.use(authMiddleware.ensureAuth);

// Get all wallets for the authenticated user
router.get('/', walletController.getWallets);

// Check if user has any wallets
router.get('/check', walletController.checkWallets);

// Get wallet associations with bounties
router.get('/associations', walletController.getWalletAssociations);

// Get a specific wallet by ID
router.get('/:id', walletController.getWallet);

// Create a new wallet
router.post('/', walletController.createWallet);

// Update a wallet
router.put('/:id', walletController.updateWallet);

// Delete a wallet
router.delete('/:id', walletController.deleteWallet);

module.exports = router;
