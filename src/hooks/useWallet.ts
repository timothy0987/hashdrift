import { useState, useEffect } from 'react';
import { BrowserProvider } from 'ethers';
import { HashConnect, HashConnectTypes } from 'hashconnect';

// Hedera Testnet Network config for MetaMask
const HEDERA_TESTNET_CONFIG = {
  chainId: '0x128', // 296
  chainName: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: ['https://testnet.hashio.io/api'],
  blockExplorerUrls: ['https://hashscan.io/testnet']
};

export type WalletType = 'metamask' | 'hashpack' | null;

interface WalletState {
  walletAddress: string | null;
  walletType: WalletType;
  isConnected: boolean;
  error: string | null;
  balance: string | null;
}

const STORAGE_KEY = 'oracleDrift_wallet_session';
let hcInstance: any = null;

const appMetadata: HashConnectTypes.AppMetadata = {
  name: "Oracle Drift",
  description: "Web3 Prediction Game",
  icon: "https://hashdrift.vercel.app/favicon.ico"
};

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    walletAddress: null,
    walletType: null,
    isConnected: false,
    error: null,
    balance: null
  });

  // Attempt auto-reconnect on mount
  useEffect(() => {
    const session = localStorage.getItem(STORAGE_KEY);
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.type === 'metamask') {
          connectMetaMask(true);
        } else if (parsed.type === 'hashpack') {
          connectHashPack(true); // Attempt silent reconnect
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const updateState = (updates: Partial<WalletState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const getEVMProvider = () => {
    if (typeof window === 'undefined') return null;

    // Favor EIP-6963 if we had previously implemented discovery, or fallback to pure window.ethereum
    const eth = (window as any).ethereum;
    if (!eth) return null;

    // Find pure metamask if hijacked
    const isPureMetaMask = (p: any) => p?.isMetaMask && !p?.isHashPack && !p?.isBlade;
    const provider = eth.providers?.find(isPureMetaMask) || (isPureMetaMask(eth) ? eth : eth);
    return provider;
  };

  const connectMetaMask = async (silent = false) => {
    try {
      if (!silent) updateState({ error: null });
      const rawProvider = getEVMProvider();

      if (!rawProvider) {
        if (!silent) updateState({ error: "MetaMask not found. Please install the extension." });
        return;
      }

      const provider = new BrowserProvider(rawProvider);
      const accounts = await provider.send("eth_requestAccounts", []);
      
      if (!accounts || accounts.length === 0) throw new Error("No accounts found.");
      
      const account = accounts[0];
      const balanceWei = await provider.getBalance(account);
      const balance = (Number(balanceWei) / 1e18).toFixed(4);

      // Verify or prompt network switch to Hedera Testnet
      const { chainId } = await provider.getNetwork();
      if (Number(chainId) !== 296) { // 296 is Hedera Testnet
        try {
          await provider.send("wallet_switchEthereumChain", [{ chainId: HEDERA_TESTNET_CONFIG.chainId }]);
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await provider.send("wallet_addEthereumChain", [HEDERA_TESTNET_CONFIG]);
          } else {
            console.warn("User rejected network switch or another error occurred.");
          }
        }
      }

      updateState({
        walletAddress: account,
        walletType: 'metamask',
        isConnected: true,
        balance,
        error: null
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: 'metamask', address: account }));

    } catch (err: any) {
      console.error("MetaMask connect error:", err);
      if (!silent) {
        if (err.code === 4001) {
          updateState({ error: "Connection request rejected by user." });
        } else {
          updateState({ error: err.message || "Failed to connect MetaMask." });
        }
      }
    }
  };

  const connectHashPack = async (silent = false) => {
    try {
      if (!silent) updateState({ error: null });

      if (!hcInstance) {
        hcInstance = new HashConnect();
      } else {
        try { hcInstance.clearConnectionsAndData(); } catch {}
      }

      hcInstance.pairingEvent.once(async (pairingData: any) => {
        if (pairingData.accountIds && pairingData.accountIds.length > 0) {
          const accountId = pairingData.accountIds[0];
          let balance = "0.0000";
          try {
            const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${accountId}`);
            const data = await res.json();
            if (data.balances?.[0]) balance = (data.balances[0].balance / 1e8).toFixed(4);
          } catch (e) {
            console.error("Failed to fetch balance", e);
          }

          updateState({
            walletAddress: accountId,
            walletType: 'hashpack',
            isConnected: true,
            balance,
            error: null
          });

          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: 'hashpack', address: accountId }));
        }
      });

      const detectTimeout = setTimeout(() => {
        if (!silent) updateState({ error: "HashPack extension not detected." });
      }, 3500);

      hcInstance.foundExtensionEvent.once((_walletMetadata: any) => {
        clearTimeout(detectTimeout);
        hcInstance.connectToLocalWallet();
      });

      await hcInstance.init(appMetadata, "testnet", false);

    } catch (err: any) {
      console.error("HashPack connect error:", err);
      if (!silent) updateState({ error: "Failed to connect HashPack." });
    }
  };

  const disconnectWallet = async () => {
    try {
      if (state.walletType === 'hashpack' && hcInstance) {
        try { await hcInstance.disconnect(hcInstance.hcData?.topic); } catch {}
        try { hcInstance.clearConnectionsAndData(); } catch {}
        hcInstance = null;
      }
    } catch (err) {
      console.error("Disconnect error", err);
    } finally {
      updateState({
        walletAddress: null,
        walletType: null,
        isConnected: false,
        balance: null,
        error: null
      });
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return {
    ...state,
    connectMetaMask,
    connectHashPack,
    disconnectWallet,
    clearError: () => updateState({ error: null })
  };
}
