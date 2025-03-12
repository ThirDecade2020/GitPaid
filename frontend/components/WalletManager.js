import React, { useState, useEffect } from 'react';
import { fetchWallets, createWallet, updateWallet, deleteWallet } from '../api/wallet';

const WalletManager = ({ onWalletSelect, selectedWalletId, buttonText = "Select Wallet" }) => {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    walletName: '',
    privateKey: '',
    isDefault: false,
    generateNewKey: false
  });

  // Fetch wallets on component mount
  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      setLoading(true);
      const walletData = await fetchWallets();
      setWallets(walletData);
      
      // If no wallet is selected and we have wallets, select the default one
      if (!selectedWalletId && walletData.length > 0) {
        const defaultWallet = walletData.find(w => w.isDefault) || walletData[0];
        if (onWalletSelect && defaultWallet) {
          onWalletSelect(defaultWallet.id);
        }
      }
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
      if (!formData.walletName) {
        setError('Wallet name is required');
        setLoading(false);
        return;
      }
      
      // If not generating a new key, private key is required
      if (!formData.generateNewKey && !formData.privateKey) {
        setError('Private key is required unless generating a new key');
        setLoading(false);
        return;
      }
      
      // Create wallet
      const newWallet = await createWallet(formData);
      
      // Update local state
      setWallets([...wallets, newWallet]);
      
      // Reset form and close modal
      setFormData({
        walletName: '',
        privateKey: '',
        isDefault: false,
        generateNewKey: false
      });
      setShowCreateForm(false);
      setShowModal(false);
      
      // If this is the first wallet, select it
      if (wallets.length === 0 && onWalletSelect) {
        onWalletSelect(newWallet.id);
      }
      
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
      
      // If the deleted wallet was selected, select another one
      if (selectedWalletId === id && wallets.length > 1) {
        const remainingWallets = wallets.filter(w => w.id !== id);
        const defaultWallet = remainingWallets.find(w => w.isDefault) || remainingWallets[0];
        if (onWalletSelect && defaultWallet) {
          onWalletSelect(defaultWallet.id);
        }
      }
      
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

  const getSelectedWalletName = () => {
    const wallet = wallets.find(w => w.id === selectedWalletId);
    return wallet ? wallet.walletName : 'Select Wallet';
  };

  return (
    <div className="wallet-manager">
      <div className="flex items-center mb-4">
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1.586l-1.707-1.707A1 1 0 0012 2H8a1 1 0 00-.707.293L5.586 4H4z" />
          </svg>
          {selectedWalletId ? getSelectedWalletName() : buttonText}
        </button>
      </div>

      {/* Wallet Selection Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg shadow-lg p-6 w-full max-w-md text-white">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Manage Wallets</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 bg-red-900 bg-opacity-20 border border-red-800 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {loading && !showCreateForm ? (
              <div className="flex justify-center my-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                {!showCreateForm ? (
                  <>
                    {wallets.length === 0 ? (
                      <div className="text-center my-6">
                        <p className="text-gray-300 mb-4">You don't have any wallets yet.</p>
                        <button 
                          onClick={() => setShowCreateForm(true)}
                          className="px-4 py-2 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] text-white rounded-lg font-medium text-sm hover:from-[#2563eb] hover:to-[#1d4ed8] transition-all duration-300 shadow-md flex items-center mx-auto"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                          Create Your First Wallet
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4">
                          <button 
                            onClick={() => setShowCreateForm(true)}
                            className="px-4 py-2 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] text-white rounded-lg font-medium text-sm hover:from-[#2563eb] hover:to-[#1d4ed8] transition-all duration-300 shadow-md flex items-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add New Wallet
                          </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {wallets.map(wallet => (
                            <div 
                              key={wallet.id} 
                              className={`border rounded-lg p-3 mb-2 ${selectedWalletId === wallet.id ? 'border-blue-500 bg-[#172554] bg-opacity-30' : 'border-[#334155]'}`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                  <input
                                    type="radio"
                                    id={`wallet-${wallet.id}`}
                                    name="wallet"
                                    checked={selectedWalletId === wallet.id}
                                    onChange={() => onWalletSelect && onWalletSelect(wallet.id)}
                                    className="mr-2"
                                  />
                                  <label htmlFor={`wallet-${wallet.id}`} className="font-medium text-gray-200">
                                    {wallet.walletName}
                                    {wallet.isDefault && (
                                      <span className="ml-2 bg-[#1e40af] bg-opacity-30 text-[#60a5fa] text-xs font-semibold px-2 py-0.5 rounded">Default</span>
                                    )}
                                  </label>
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
                                    className="text-red-500 hover:text-red-400"
                                    title="Delete wallet"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              <div className="mt-1 text-sm text-gray-400 truncate" title={wallet.publicKey}>
                                {wallet.publicKey.substring(0, 10)}...{wallet.publicKey.substring(wallet.publicKey.length - 10)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                   <form onSubmit={handleCreateWallet}>
                    <div className="mb-4">
                      <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="walletName">
                        Wallet Name
                      </label>
                      <input
                        type="text"
                        id="walletName"
                        name="walletName"
                        value={formData.walletName}
                        onChange={handleInputChange}
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        placeholder="My Wallet"
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="flex items-center text-gray-300 text-sm font-medium">
                        <input
                          type="checkbox"
                          name="generateNewKey"
                          checked={formData.generateNewKey}
                          onChange={handleInputChange}
                          className="mr-2"
                        />
                        Generate a new wallet key for me
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-5">
                        A new secp256k1 private key will be generated securely on the server.
                      </p>
                    </div>
                    
                    {!formData.generateNewKey && (
                      <>
                        <div className="mb-4">
                          <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="privateKey">
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
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Your private key will be encrypted before storage.
                          </p>
                        </div>
                        
                        <div className="mb-4">
                          <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="publicKey">
                            Public Address <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="publicKey"
                            name="publicKey"
                            value={formData.publicKey || ''}
                            onChange={handleInputChange}
                            className="shadow appearance-none border border-gray-600 bg-gray-700 rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0x..."
                            required={!formData.generateNewKey}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            The public address associated with this wallet (required for imported wallets).
                          </p>
                        </div>
                      </>
                    )}
                    
                    <div className="mb-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          name="isDefault"
                          checked={formData.isDefault}
                          onChange={handleInputChange}
                          className="mr-2"
                        />
                        <span className="text-gray-700 text-sm font-bold">Set as default wallet</span>
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
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletManager;
