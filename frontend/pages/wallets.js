import React, { useState, useEffect } from 'react';
import { fetchWallets, createWallet, updateWallet, deleteWallet, getWalletAssociations } from '../api/wallet';
import { useRouter } from 'next/router';

const WalletsPage = () => {
  const router = useRouter();
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [walletAssociations, setWalletAssociations] = useState({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    walletName: '',
    privateKey: '',
    publicKey: '',
    isDefault: false
  });

  // Fetch wallets on component mount
  useEffect(() => {
    // Client-side only code
    if (typeof window === 'undefined') {
      return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    
    loadWallets();
  }, [router]);

  const loadWallets = async () => {
    try {
      setLoading(true);
      const [walletData, associationsData] = await Promise.all([
        fetchWallets(),
        getWalletAssociations()
      ]);
      setWallets(walletData);
      setWalletAssociations(associationsData);
    } catch (err) {
      console.error('Error loading wallets:', err);
      setError('Failed to load wallets');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleCreateWallet = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      setLoading(true);
      
      // Validate inputs
      if (!formData.walletName || !formData.privateKey) {
        setError('Wallet name and private key are required');
        setLoading(false);
        return;
      }
      
      // Create wallet
      const newWallet = await createWallet(formData);
      
      // Update local state
      setWallets([...wallets, newWallet]);
      
      // Reset form and close form
      setFormData({
        walletName: '',
        privateKey: '',
        publicKey: '',
        isDefault: false
      });
      setShowCreateForm(false);
      
      // Show success notification
      showNotification('Wallet created successfully!');
    } catch (err) {
      console.error('Error creating wallet:', err);
      setError(err.response?.data?.error || 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWallet = async (id, force = false) => {
    if (!force && !confirm('Are you sure you want to delete this wallet? This action cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      await deleteWallet(id, force);
      
      // Update local state
      setWallets(wallets.filter(w => w.id !== id));
      
      // Show success notification
      showNotification('Wallet deleted successfully!');
    } catch (err) {
      console.error('Error deleting wallet:', err);
      
      // Check if the error is due to associated bounties
      if (err.response?.data?.error === 'Cannot delete wallet that is associated with bounties') {
        const bountyCount = err.response?.data?.bountyCount || 'several';
        
        if (confirm(`This wallet is associated with ${bountyCount} bounties. Would you like to force delete it? This will remove the wallet association from these bounties.`)) {
          // Try again with force option
          return handleDeleteWallet(id, true);
        }
      }
      
      setError(err.response?.data?.error || 'Failed to delete wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      setLoading(true);
      
      // Find the wallet
      const wallet = wallets.find(w => w.id === id);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      // Update the wallet
      await updateWallet(id, { ...wallet, isDefault: true });
      
      // Update local state
      setWallets(wallets.map(w => ({
        ...w,
        isDefault: w.id === id
      })));
      
      // Show success notification
      showNotification('Default wallet updated successfully!');
    } catch (err) {
      console.error('Error setting default wallet:', err);
      setError(err.response?.data?.error || 'Failed to set default wallet');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message) => {
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 ease-in-out';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('opacity-0');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 500);
    }, 3000);
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6 mt-4">
          <h1 className="text-3xl font-bold">Manage Wallets</h1>
          <button 
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center"
            disabled={showCreateForm}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add New Wallet
          </button>
        </div>
        
        {error && (
          <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">
            {error}
          </div>
        )}
        
        {showCreateForm && (
          <div className="bg-[#1e293b] rounded-lg shadow-md p-6 mb-6 border border-[#334155]">
            <h2 className="text-xl font-bold mb-4">Create New Wallet</h2>
            <form onSubmit={handleCreateWallet}>
              <div className="mb-4">
                <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="walletName">
                  Wallet Name
                </label>
                <input
                  type="text"
                  id="walletName"
                  name="walletName"
                  value={formData.walletName}
                  onChange={handleInputChange}
                  className="shadow appearance-none border border-gray-600 bg-gray-700 rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Wallet"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="privateKey">
                  Private Key
                </label>
                <input
                  type="password"
                  id="privateKey"
                  name="privateKey"
                  value={formData.privateKey}
                  onChange={handleInputChange}
                  className="shadow appearance-none border border-gray-600 bg-gray-700 rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your private key"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your private key will be encrypted before storage.
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="publicKey">
                  Public Key
                </label>
                <input
                  type="text"
                  id="publicKey"
                  name="publicKey"
                  value={formData.publicKey}
                  onChange={handleInputChange}
                  className="shadow appearance-none border border-gray-600 bg-gray-700 rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your public key"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your public key is required for wallet operations.
                </p>
              </div>
              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="isDefault"
                    checked={formData.isDefault}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-gray-300 text-sm font-bold">Set as default wallet</span>
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </div>
                  ) : (
                    'Create Wallet'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
        
        {loading && !showCreateForm ? (
          <div className="flex justify-center my-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {wallets.length === 0 ? (
              <div className="bg-[#1e293b] rounded-lg shadow-md p-8 text-center border border-[#334155]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <h3 className="text-xl font-semibold mb-2 text-white">No Wallets Found</h3>
                <p className="text-gray-400 mb-4">You haven't created any wallets yet.</p>
                <button 
                  onClick={() => setShowCreateForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Create Your First Wallet
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {wallets.map(wallet => (
                  <div key={wallet.id} className="bg-[#1e293b] rounded-lg shadow-md p-4 border border-[#334155]">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {wallet.walletName}
                          <div className="flex space-x-1 mt-1">
                            {wallet.isDefault && (
                              <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">Default</span>
                            )}
                            {walletAssociations[wallet.id] && (
                              <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded flex items-center" title={`This wallet is associated with ${walletAssociations[wallet.id]} bounties`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {walletAssociations[wallet.id]} {walletAssociations[wallet.id] === 1 ? 'Bounty' : 'Bounties'}
                              </span>
                            )}
                          </div>
                        </h3>
                        <div className="mt-1 text-sm text-gray-400 truncate" title={wallet.publicKey}>
                          {wallet.publicKey.substring(0, 10)}...{wallet.publicKey.substring(wallet.publicKey.length - 10)}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {!wallet.isDefault && (
                          <button 
                            onClick={() => handleSetDefault(wallet.id)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Set as default"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteWallet(wallet.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete wallet"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button 
                        onClick={() => router.push('/dashboard')}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Use this wallet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        
        <div className="mt-8 p-4 bg-[#1e293b] rounded-lg border border-[#334155]">
          <h2 className="text-lg font-semibold mb-2 text-white">About Wallets</h2>
          <p className="text-gray-300 mb-2">
            Wallets are used to interact with blockchain networks for creating and claiming bounties.
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-1">
            <li>Your private keys are encrypted before storage</li>
            <li>Set a default wallet to use it automatically for new bounties</li>
            <li>You can create multiple wallets for different purposes</li>
          </ul>
        </div>
    </>
  );
};

export default WalletsPage;
