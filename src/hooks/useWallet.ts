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
let hcInstance: HashConnect | null = null;

const appMetadata: HashConnectTypes.AppMetadata = {
  name: "Oracle Drift",
  description: "Web3 Prediction Game",
  icon: "https://hashdrift.vercel.app/favicon.ico"
};

// Types for EIP-6963
interface EIP6963ProviderDetail {
  info: { name: string; icon: string; uuid: string; rdns: string };
  provider: unknown;
}

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
        const parsed = JSON.parse(session) as { type: string; address: string };
        if (parsed.type === 'metamask') {
          void connectMetaMask(true);
        } else if (parsed.type === 'hashpack') {
          void connectHashPack(true); // Attempt silent reconnect
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const updateState = (updates: Partial<WalletState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const getEVMProvider = (): unknown => {
    if (typeof window === 'undefined') return null;

    let targetProvider: unknown = null;

    const eip6963Providers: EIP6963ProviderDetail[] = [];
    const onAnnounce = (event: Event) => {
      const customEvent = event as CustomEvent<EIP6963ProviderDetail>;
      if (customEvent.detail?.provider) {
        eip6963Providers.push(customEvent.detail);
      }
    };
    
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.removeEventListener("eip6963:announceProvider", onAnnounce);

    const mmEip = eip6963Providers.find(p => p.info?.name === 'MetaMask');
    if (mmEip) {
      targetProvider = mmEip.provider;
    }

    if (!targetProvider) {
      const eth = (window as Record<string, unknown>).ethereum as Record<string, unknown> | undefined;
      if (!eth) return null;

      const isPureMetaMask = (p: unknown) => {
         if (!p || typeof p !== 'object') return false;
         const obj = p as Record<string, unknown>;
         return Boolean(obj.isMetaMask && !obj.isHashPack && !obj.isBlade);
      };

      const providers = eth.providers as unknown[];
      if (Array.isArray(providers)) {
        targetProvider = providers.find(isPureMetaMask) || (isPureMetaMask(eth) ? eth : eth);
      } else {
        targetProvider = isPureMetaMask(eth) ? eth : eth;
      }
    }

    return targetProvider;
  };

  const connectMetaMask = async (silent = false) => {
    try {
      if (!silent) updateState({ error: null });
      const rawProvider = getEVMProvider();

      if (!rawProvider) {
        if (!silent) updateState({ error: "MetaMask not found. Please install the extension." });
        return;
      }

      // Using import('ethers').Eip1193Provider to cast rawProvider is safe for BrowserProvider
      const provider = new BrowserProvider(rawProvider as import('ethers').Eip1193Provider);
      const accounts = await provider.send("eth_requestAccounts", []) as string[];
      
      if (!accounts || accounts.length === 0) throw new Error("No accounts found.");
      
      const account = accounts[0];
      const balanceWei = await provider.getBalance(account);
      const balance = (Number(balanceWei) / 1e18).toFixed(4);

      // Verify or prompt network switch to Hedera Testnet
      const { chainId } = await provider.getNetwork();
      if (Number(chainId) !== 296) { // 296 is Hedera Testnet
        try {
          await provider.send("wallet_switchEthereumChain", [{ chainId: HEDERA_TESTNET_CONFIG.chainId }]);
        } catch (switchError: unknown) {
          const sError = switchError as { code?: number };
          if (sError.code === 4902) {
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

    } catch (err: unknown) {
      console.error("MetaMask connect error:", err);
      if (!silent) {
        const errorObj = err as { code?: number; message?: string };
        if (errorObj.code === 4001) {
          updateState({ error: "Connection request rejected by user." });
        } else {
          updateState({ error: errorObj.message || "Failed to connect MetaMask." });
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

      hcInstance.pairingEvent.once(async (pairingData: unknown) => {
        const pd = pairingData as { accountIds?: string[] };
        if (pd.accountIds && pd.accountIds.length > 0) {
          const accountId = pd.accountIds[0];
          let balance = "0.0000";
          try {
            const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${accountId}`);
            const data = (await res.json()) as { balances?: Array<{ balance: number }> };
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

      hcInstance.foundExtensionEvent.once((_walletMetadata: unknown) => {
        clearTimeout(detectTimeout);
        if (hcInstance) {
          hcInstance.connectToLocalWallet();
        }
      });

      await hcInstance.init(appMetadata, "testnet", false);

    } catch (err: unknown) {
      console.error("HashPack connect error:", err);
      if (!silent) updateState({ error: "Failed to connect HashPack." });
    }
  };

  const disconnectWallet = async () => {
    try {
      if (state.walletType === 'hashpack' && hcInstance) {
        try { await hcInstance.disconnect(hcInstance.hcData?.topic ?? ""); } catch {}
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
