import axios from 'axios';

// Axios instance to communicate with backend API
const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE
});

// Attach JWT token to all requests if available
API.interceptors.request.use(config => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Fetch all wallets for the logged-in user
export async function fetchWallets() {
  try {
    console.log('Fetching user wallets...');
    const res = await API.get('/api/wallets');
    console.log('User wallets response:', res.data);
    return res.data || [];
  } catch (error) {
    console.error('Error fetching user wallets:', error);
    return [];
  }
}

// Check if user has any wallets
export async function checkWallets() {
  try {
    const res = await API.get('/api/wallets/check');
    return res.data.hasWallets;
  } catch (error) {
    console.error('Error checking wallets:', error);
    return false;
  }
}

// Get a specific wallet by ID
export async function getWallet(id) {
  try {
    const res = await API.get(`/api/wallets/${id}`);
    return res.data;
  } catch (error) {
    console.error(`Error fetching wallet ${id}:`, error);
    throw error;
  }
}

// Create a new wallet
export async function createWallet(data) {
  try {
    console.log('Creating new wallet with data:', data);
    const res = await API.post('/api/wallets', data);
    return res.data;
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw error;
  }
}

// Update an existing wallet
export async function updateWallet(id, data) {
  try {
    console.log(`Updating wallet ${id} with data:`, data);
    const res = await API.put(`/api/wallets/${id}`, data);
    return res.data;
  } catch (error) {
    console.error(`Error updating wallet ${id}:`, error);
    throw error;
  }
}

// Delete a wallet
export async function deleteWallet(id, force = false) {
  try {
    console.log(`Deleting wallet ${id}${force ? ' with force option' : ''}`);
    const res = await API.delete(`/api/wallets/${id}${force ? '?force=true' : ''}`);
    return res.data;
  } catch (error) {
    console.error(`Error deleting wallet ${id}:`, error);
    throw error;
  }
}

// Get wallet associations with bounties
export async function getWalletAssociations() {
  try {
    const res = await API.get('/api/wallets/associations');
    return res.data;
  } catch (error) {
    console.error('Error fetching wallet associations:', error);
    throw error;
  }
}
