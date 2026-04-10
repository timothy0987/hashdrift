import React, { useState } from 'react';
import { Wallet, ChevronLeft, ChevronRight, Activity, Terminal, ShieldAlert, Sparkles, Hash, X, ExternalLink, Droplet } from 'lucide-react';
import { HashConnect, HashConnectTypes } from 'hashconnect';

let hashconnect: any = null;

const appMetadata: HashConnectTypes.AppMetadata = {
  name: "HashDrift",
  description: "Web3 Prediction Game",
  icon: "https://hashdrift.vercel.app/favicon.ico"
};

type GameState = 'landing' | 'playing' | 'gameover';

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'system' | 'success' | 'error' | 'info';
  hash?: string;
}

interface Scenario {
  category: string;
  text: string;
  options: string[];
}

const SCENARIOS: Scenario[] = [
  // Crypto Markets
  { category: "Crypto Market", text: "Will Bitcoin's dominance increase or decrease by Friday?", options: ["INCREASE", "DECREASE"] },
  { category: "Crypto Market", text: "Will the new Layer-2 token launch achieve >$100M TVL in 24 hours?", options: ["YES", "NO"] },
  { category: "Crypto Market", text: "Is the Ethereum gas price going to spike above 50 Gwei tonight?", options: ["SPIKE", "DROP", "STABLE"] },
  { category: "Crypto Market", text: "Will the next SEC ruling on Crypto ETFs be Favorable or Unfavorable?", options: ["FAVORABLE", "UNFAVORABLE", "DELAYED"] },

  // Sports
  { category: "Sports Arena", text: "Who will win the upcoming European Champions League final?", options: ["HOME TEAM", "AWAY TEAM", "PENALTIES"] },
  { category: "Sports Arena", text: "Will the Lakers secure a playoff spot this season?", options: ["YES", "NO"] },
  { category: "Sports Arena", text: "Will Max Verstappen take Pole Position in the next Grand Prix?", options: ["YES", "NO"] },
  { category: "Sports Arena", text: "Will the next Heavyweight Boxing Title match end in a Knockout?", options: ["KNOCKOUT", "DECISION", "DRAW"] },

  // Real World & Economy
  { category: "Global Economy", text: "Will the US Federal Reserve raise interest rates next quarter?", options: ["RAISE", "LOWER", "MAINTAIN"] },
  { category: "Real World Event", text: "Will SpaceX successfully land their next Starship prototype?", options: ["SUCCESS", "FAILURE", "DELAYED"] },
  { category: "Global Tech", text: "Will Apple announce a new foundational AI model this year?", options: ["YES", "NO"] },
  { category: "Real World Event", text: "Will global crude oil prices exceed $90/barrel this month?", options: ["EXCEED $90", "STAY BELOW $90"] },

  // Esports & Gaming
  { category: "Esports/Gaming", text: "Will Faker's T1 win the next League of Legends Worlds Championship?", options: ["WIN", "LOSE"] },
  { category: "Esports/Gaming", text: "Will the GTA 6 trailer reveal a release date before Q3?", options: ["YES", "NO", "DELAYED"] },
  { category: "Esports/Gaming", text: "Will CS:GO 2 active player count surpass 2 million this week?", options: ["SURPASS", "FALL SHORT"] },
  { category: "Esports/Gaming", text: "Who will win the next Valorant Masters?", options: ["SENTINELS", "FNATIC", "PAPER REX", "LOUD"] }
];

function generateHash() {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function getMood(round: number) {
  if (round <= 4) return { label: 'Calm', class: 'mood-calm' };
  if (round <= 9) return { label: 'Unstable', class: 'mood-unstable' };
  return { label: 'Chaotic', class: 'mood-chaotic' };
}

function formatAddress(addr: string) {
  if (!addr) return '';
  if (addr.includes('.') && addr.length < 12) return addr;
  if (addr.length <= 10) return addr;
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('landing');
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [correctOption, setCorrectOption] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const addLog = (message: string, type: LogEntry['type'], hash?: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      type,
      hash
    };
    setLogs(prev => [entry, ...prev]);
  };

  const disconnectWallet = async () => {
    setWalletConnected(false);
    setConnectedAddress(null);
    setWalletBalance(null);
    if (hashconnect) {
      try { await hashconnect.disconnect(hashconnect.hcData?.topic); } catch (e) { }
      try { hashconnect.clearConnectionsAndData(); } catch (e) { }
      hashconnect = null;
    }
    addLog("Wallet connection closed.", "system");
  };

  const connectWallet = () => {
    if (walletConnected) {
      disconnectWallet();
      return;
    }
    setShowModal(true);
  };

  const connectHashPack = async () => {
    try {
      addLog("Initializing HashConnect...", "system");
      if (!hashconnect) {
        hashconnect = new HashConnect();
      }

      // Ensure fresh state for a new connection attempt
      try { hashconnect.clearConnectionsAndData(); } catch (e) {}

      // Pair event handles successful connections
      hashconnect.pairingEvent.once(async (pairingData: any) => {
        if (pairingData.accountIds && pairingData.accountIds.length > 0) {
          const accountId = pairingData.accountIds[0];
          setWalletConnected(true);
          setConnectedAddress(accountId);
          addLog(`Connected via HashPack: ${accountId}`, "success");
          try {
            const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${accountId}`);
            const data = await res.json();
            if (data.balances?.[0]) {
              const balance = (data.balances[0].balance / 1e8).toFixed(4);
              setWalletBalance(balance);
            }
          } catch (e) {
            console.error("Failed to fetch balance", e);
          }
        }
      });

      // Timeout to warn if extension is missing
      const detectTimeout = setTimeout(() => {
        addLog("HashPack extension not found.", "error");
        alert("HashPack extension could not be detected. Make sure it is installed and enabled in your browser.");
      }, 3500);

      // Important: Bind the foundExtension event BEFORE calling init()!
      hashconnect.foundExtensionEvent.once((walletMetadata: any) => {
        clearTimeout(detectTimeout);
        addLog("HashPack extension detected, connecting...", "system");
        hashconnect.connectToLocalWallet();
      });

      // Init and wait for the extension event to fire
      await hashconnect.init(appMetadata, "testnet", false);

    } catch (err: any) {
      addLog(`HashConnect Error: ${err.message}`, "error");
      alert("Could not connect to HashPack. Ensure the extension is installed and enabled.");
    }
  };

  const connectEVMWallet = async (walletName: string) => {
    let targetProvider: any = null;

    // 1. Try EIP-6963 (Modern Multi-Wallet Provider Discovery)
    // This perfectly bypasses situations where one wallet hijacked window.ethereum
    const eip6963Providers: any[] = [];
    const onAnnounce = (e: any) => {
      if (e.detail?.provider) {
        eip6963Providers.push(e.detail);
      }
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.removeEventListener("eip6963:announceProvider", onAnnounce);

    if (walletName === 'MetaMask') {
      const mmEip = eip6963Providers.find(p => p.info?.name === 'MetaMask');
      if (mmEip) {
        targetProvider = mmEip.provider;
        addLog("Detected pure MetaMask via EIP-6963.", "system");
      }
    }

    // 2. Fallback to Legacy window.ethereum Logic if EIP-6963 missed it
    if (!targetProvider) {
      const eth = (window as any).ethereum;

      if (!eth && walletName !== 'Blade Wallet') {
        alert(`No extension found. Please install ${walletName}.`);
        return;
      }

      if (walletName === 'MetaMask') {
        // Strictly avoid HashPack and other spoofers when asking for MetaMask
        const isPureMetaMask = (p: any) => p?.isMetaMask && !p?.isHashPack && !p?.isBlade && !p?.isBraveWallet && !p?.isRabby;
        targetProvider = eth?.providers?.find(isPureMetaMask) || (isPureMetaMask(eth) ? eth : null);
      } else if (walletName === 'Blade Wallet') {
        targetProvider = (window as any).bladeConnect || eth?.providers?.find((p: any) => p?.isBlade) || (eth?.isBlade ? eth : null);
      }
      
      // Default fallback if logic is missed but an EVM wallet exists
      if (!targetProvider) targetProvider = eth;
    }

    if (!targetProvider || typeof targetProvider.request !== 'function') {
      alert(`${walletName} provider could not be found. If HashPack is hijacking the connection, please disable "Inject as Default EVM Wallet" in its settings.`);
      return;
    }

    try {
      addLog(`Connecting to ${walletName}...`, "system");
      const accounts = await targetProvider.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setWalletConnected(true);
        setConnectedAddress(address);
        addLog(`Connected via ${walletName}: ${formatAddress(address)}`, "success");

        try {
          const balanceHex = await targetProvider.request({
            method: 'eth_getBalance',
            params: [address, 'latest']
          });
          const balance = (parseInt(balanceHex, 16) / 1e18).toFixed(4);
          setWalletBalance(balance);
        } catch (e) {
          console.error("Failed to fetch balance", e);
        }
      }
    } catch (error: any) {
      if (error.code === 4001) {
        addLog(`${walletName} connection rejected.`, "error");
      } else {
        addLog(`Error connecting ${walletName}: ${error.message}`, "error");
      }
    }
  };

  const handleWalletSelect = async (walletName: string) => {
    setShowModal(false);
    if (walletName === 'HashPack') {
      await connectHashPack();
    } else {
      await connectEVMWallet(walletName);
    }
  };

  const startGame = () => {
    if (!walletConnected) {
      setShowModal(true);
      return;
    }
    setGameState('playing');
    setScore(0);
    setRound(1);
    setSelectedOption(null);
    setCorrectOption(null);
    setIsRevealing(false);
    pickScenario();
    addLog("Action: startSession()", "system", generateHash());
  };

  const pickScenario = () => {
    const random = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    // Randomize option order
    const shuffled = [...random.options].sort(() => Math.random() - 0.5);
    setScenario({ text: random.text, options: shuffled });
  };

  const handleOptionClick = (choice: string) => {
    if (isRevealing) return;
    setSelectedOption(choice);
    setIsRevealing(true);

    // Determine Win Probability
    let winProb = 0.3; // Default late game
    if (round <= 4) winProb = 0.7; // Early: 70%
    else if (round <= 9) winProb = 0.5; // Mid: 50%

    const playerWins = Math.random() < winProb;
    let actualCorrectAnswer = choice;

    if (!playerWins) {
      const otherOptions = scenario.options.filter(opt => opt !== choice);
      actualCorrectAnswer = otherOptions[Math.floor(Math.random() * otherOptions.length)];
    }

    setCorrectOption(actualCorrectAnswer);

    const resultHash = generateHash();
    const won = actualCorrectAnswer === choice;

    addLog(`submitRound(choice: ${choice})`, won ? "success" : "error", resultHash);
    addLog(`AI Oracle resolved: ${actualCorrectAnswer}`, "system");

    setTimeout(() => {
      if (won) {
        setScore(prev => prev + 1);
        setRound(prev => prev + 1);
        setSelectedOption(null);
        setCorrectOption(null);
        setIsRevealing(false);
        pickScenario();
      } else {
        addLog(`Action: endSession(score: ${score})`, "system", generateHash());
        setGameState('gameover');
      }
    }, 1500);
  };

  const mood = getMood(round);

  return (
    <>
      <div className="bg-animation"></div>
      <div className="particles"></div>

      <div className="app-container">
        <header>
          <div className="logo">
            <Hash className="text-neon-blue" size={28} />
            HashDrift
          </div>
          <div className="header-actions">
            <a href="https://portal.hedera.com/" target="_blank" rel="noreferrer" className="faucet-link">
              <Droplet size={16} />
              Get Testnet HBAR
              <ExternalLink size={14} />
            </a>
            <button className="wallet-btn" onClick={connectWallet}>
              <Wallet size={18} />
              {walletConnected && connectedAddress
                ? `${formatAddress(connectedAddress)}${walletBalance ? ` | ${walletBalance} HBAR` : ''}`
                : 'Connect Wallet'}
            </button>
          </div>
        </header>

        <main>
          {gameState === 'landing' && (
            <div className="glass-panel landing">
              <h1>Survive the Oracle</h1>
              <p>Predict the unpredictable. HashDrift leverages highly chaotic simulated on-chain oracle data. Outlive the volatility to achieve maximum score.</p>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                {!walletConnected && (
                  <button 
                    className="primary-btn" 
                    onClick={connectWallet}
                  >
                    <Wallet size={20} />
                    Log In
                  </button>
                )}
                <button 
                  className="primary-btn" 
                  onClick={startGame}
                  disabled={!walletConnected}
                  style={!walletConnected ? { opacity: 0.5, cursor: 'not-allowed', filter: 'grayscale(0.8)' } : {}}
                >
                  <Sparkles size={20} />
                  Start Session
                </button>
              </div>
            </div>
          )}

          {gameState === 'playing' && (
            <div className="glass-panel game-screen">
              <div className="progress-container">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.min((round / 15) * 100, 100)}%` }}
                ></div>
              </div>

              <div className="game-header">
                <div className="round-info">Round {round}</div>
                <div className="score-info">
                  <div className={`oracle-mood ${mood.class}`}>
                    {mood.label} Oracle
                  </div>
                  <div className="streak">
                    <Activity size={16} />
                    Streak: {score}
                  </div>
                </div>
              </div>

              <div className="scenario-box">
                <div className="scenario-bg"></div>
                {scenario.category && (
                  <div className="scenario-category">
                    ■ {scenario.category}
                  </div>
                )}
                <div className="scenario-text">{scenario.text}</div>
              </div>

              <div className="options-grid">
                {scenario.options.map((opt) => {
                  let btnClass = "option-btn";
                  if (isRevealing) {
                    if (opt === correctOption) btnClass += " correct";
                    else if (opt === selectedOption && opt !== correctOption) btnClass += " wrong";
                  }

                  return (
                    <button
                      key={opt}
                      className={btnClass}
                      onClick={() => handleOptionClick(opt)}
                      disabled={isRevealing}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="glass-panel game-over">
              <h2>Session Terminated</h2>
              <ShieldAlert size={48} className="text-error-red mx-auto mt-4 mb-2 opacity-80" />
              <p className="text-muted">The Oracle has spoken differently.</p>

              <div className="final-score">{score}</div>
              <p className="text-muted mb-4">Final Streak</p>

              <div className="result-card text-left">
                <div className="result-item">
                  <span className="result-label">End Round</span>
                  <span className="result-value">#{round}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Oracle Hash</span>
                  <span className="result-value text-xs">{logs[0]?.hash?.substring(0, 20)}...</span>
                </div>
              </div>

              <button 
                className="primary-btn" 
                onClick={walletConnected ? startGame : connectWallet}
              >
                {walletConnected ? 'Play Again' : 'Connect Wallet to Play'}
              </button>
            </div>
          )}
        </main>

        <div className={`activity-panel ${panelOpen ? 'open' : ''}`}>
          <div className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)}>
            {panelOpen ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
          </div>

          <div className="activity-header">
            <Terminal size={18} />
            On-Chain Activity
          </div>

          <div className="activity-list">
            {logs.length === 0 && (
              <div className="text-muted text-sm text-center mt-4">Waiting for activity...</div>
            )}
            {logs.map(log => (
              <div key={log.id} className={`activity-item ${log.type}`}>
                <div className="activity-time">{log.time}</div>
                <div>{log.message}</div>
                {log.hash && (
                  <div className="activity-hash" title={log.hash}>
                    {log.hash.substring(0, 16)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Connect a Wallet</h3>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <X size={20} />
                </button>
              </div>
              <p className="text-muted text-sm mb-4">Select a wallet to continue your session on the Hedera network.</p>

              <div className="wallet-options">
                <button className="wallet-option" onClick={() => handleWalletSelect('HashPack')}>
                  HashPack Wallet
                </button>
                <button className="wallet-option" onClick={() => handleWalletSelect('Blade Wallet')}>
                  Blade Wallet
                </button>
                <button className="wallet-option" onClick={() => handleWalletSelect('MetaMask')}>
                  MetaMask
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
