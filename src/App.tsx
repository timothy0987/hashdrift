import React, { useState, useEffect, useRef } from 'react';
import { Wallet, ChevronLeft, ChevronRight, Activity, Terminal, ShieldAlert, Sparkles, Hash, X, ExternalLink, Droplet } from 'lucide-react';

type GameState = 'landing' | 'playing' | 'gameover';

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'system' | 'success' | 'error' | 'info';
  hash?: string;
}

interface Scenario {
  text: string;
  options: string[];
}

const SCENARIOS = [
  { text: "Will the current market trend go UP or DOWN?", options: ["UP", "DOWN"] },
  { text: "Will network gas fees stay STABLE or DROP?", options: ["STABLE", "DROP"] },
  { text: "Is the upcoming protocol vote BULLISH or BEARISH?", options: ["BULLISH", "BEARISH"] },
  { text: "Will liquidity pool APY INCREASE or DECREASE?", options: ["INCREASE", "DECREASE"] },
  { text: "Is the correlation to tech stocks POSITIVE or NEGATIVE?", options: ["POSITIVE", "NEGATIVE"] },
  { text: "Will the oracle consensus arrive EARLY or LATE?", options: ["EARLY", "LATE"] },
  { text: "Are institutional flows INWARD or OUTWARD?", options: ["INWARD", "OUTWARD"] },
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
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('landing');
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
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

  const connectWallet = () => {
    if (walletConnected) {
      setWalletConnected(false);
      setConnectedAddress(null);
      addLog("Wallet connection closed.", "system");
      return;
    }
    setShowModal(true);
  };

  const handleWalletSelect = async (walletName: string) => {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert(`${walletName} (or compatible Web3 provider) not detected in browser!`);
      return;
    }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setWalletConnected(true);
        setConnectedAddress(address);
        setShowModal(false);
        addLog(`Connected via ${walletName}: ${formatAddress(address)}`, "success");
      }
    } catch (error: any) {
      if (error.code === 4001) {
        addLog(`Connection rejected by user in ${walletName}`, "error");
      } else {
        addLog(`Failed to connect ${walletName}: ${error.message}`, "error");
      }
    }
  };

  const startGame = () => {
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
              {walletConnected && connectedAddress ? formatAddress(connectedAddress) : 'Connect Wallet'}
            </button>
          </div>
        </header>

        <main>
          {gameState === 'landing' && (
            <div className="glass-panel landing">
              <h1>Survive the Oracle</h1>
              <p>Predict the unpredictable. HashDrift leverages highly chaotic simulated on-chain oracle data. Outlive the volatility to achieve maximum score.</p>
              <button className="primary-btn" onClick={startGame}>
                <Sparkles size={20} />
                Start Session
              </button>
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
                  <span className="result-value text-xs">{logs[0]?.hash?.substring(0,20)}...</span>
                </div>
              </div>
              
              <button className="primary-btn" onClick={startGame}>
                Play Again
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
