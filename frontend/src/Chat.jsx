import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as nsfwjs from 'nsfwjs';
import { Video, VideoOff, Mic, MicOff, SkipForward, Play, ShieldAlert, User, MapPin, StopCircle, Users, Send, AlertTriangle, LogIn, UserPlus, Star, CheckCircle, Shield, Globe, X, MessageSquare, MonitorUp, Gift, Sun, Moon, Mic2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://chatruletka-sula.onrender.com';
const SOCKET_SERVER = BACKEND_URL;
const API_URL = `${BACKEND_URL}/api`;
const COUNTRIES = [
  "O'zbekiston", "Qozog'iston", "Qirg'iziston", "Tojikiston", 
  "Rossiya", "Turkiya", "AQSh", "Janubiy Koreya", "Boshqa"
];

function App() {
  const [deviceId, setDeviceId] = useState('');
  const [token, setToken] = useState(localStorage.getItem('chatruletka_token') || null);
  const [userProfile, setUserProfile] = useState(null);

  const [isBanned, setIsBanned] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState({ name: '', age: '', gender: 'Erkak', country: "O'zbekiston" });
  
  // Verification states
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [partnerDbId, setPartnerDbId] = useState(null);

  const [socket, setSocket] = useState(null);
  const [stream, setStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [turnServers, setTurnServers] = useState(null);
  
  const [appState, setAppState] = useState('IDLE');
  
  // Theme and UI state
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);
  const [giftMenuOpen, setGiftMenuOpen] = useState(false);
  const [flyingGifts, setFlyingGifts] = useState([]);
  
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState('');
  
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Voice Changer state & refs
  const [voiceEffect, setVoiceEffect] = useState('normal');
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const destNodeRef = useRef(null);
  const activeEffectNodesRef = useRef([]);

  const [currentRoom, setCurrentRoom] = useState(null);

  const [targetGender, setTargetGender] = useState('Barchasi');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState("");
  const [paymentRequested, setPaymentRequested] = useState(false);
  
  const [nsfwModel, setNsfwModel] = useState(null);
  const [friends, setFriends] = useState([]);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const filterIntervalRef = useRef(null);

  // Private Chat
  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [privateMessages, setPrivateMessages] = useState({});
  const [privateInput, setPrivateInput] = useState('');
  const privateChatRef = useRef(null);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const localStreamRef = useRef();
  const peerRef = useRef(null);
  const chatEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let savedId = localStorage.getItem('chatruletka_device_id');
    if (!savedId) {
      savedId = uuidv4();
      localStorage.setItem('chatruletka_device_id', savedId);
    }
    setDeviceId(savedId);

    axios.get(`${API_URL}/turn`).then(res => {
      setTurnServers(res.data.iceServers);
    }).catch(console.error);

    // Keep-alive: Render bepul tarifi 15 daqiqa faolsizlikdan keyin uxlab qoladi
    // Har 14 daqiqada ping yuborib uni uyg'otib turamiz
    const keepAlive = setInterval(() => {
      axios.get(`${API_URL}/turn`).catch(() => {});
    }, 14 * 60 * 1000);

    return () => clearInterval(keepAlive);
  }, []);

  useEffect(() => {
    if (token) {
      connectSocket(token);
    }
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectSocket = (authToken) => {
    const newSocket = io(SOCKET_SERVER, { auth: { token: authToken } });

    newSocket.on('connect_error', (err) => {
      if (err.message.includes('bloklangansiz')) {
        setIsBanned(true);
      } else {
        setError(err.message);
        logout();
      }
    });

    newSocket.on('connect', () => {
      setSocket(newSocket);
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        const processedStream = initAudioGraph(stream);
        setStream(processedStream);
        localStreamRef.current = processedStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = processedStream;
      })
      .catch((err) => {
        console.error("Kamera xatosi:", err);
        alert("Kamera va mikrofonga ruxsat bering!");
      });
    });

    newSocket.on('user-banned', (bannedId) => {
      if (userProfile && bannedId === userProfile.id) {
        setIsBanned(true);
        endCallUIOnly();
      }
    });

    newSocket.on('friend-added', () => {
      alert("Sizlar endi do'stsizlar! Do'stlar ro'yxatida suhbatlashishingiz mumkin.");
      fetchFriends();
    });

    newSocket.on('private-message', ({ fromDbId, message }) => {
      setPrivateMessages(prev => {
        const msgs = prev[fromDbId] || [];
        return { ...prev, [fromDbId]: [...msgs, { from: 'partner', text: message }] };
      });
      alert("Yangi shaxsiy SMS keldi!");
    });

    newSocket.on('receive-gift', (emoji) => {
      showFlyingGift(emoji);
    });

    newSocket.on('online-count', (count) => {
      setOnlineUsersCount(count);
    });
    newSocket.on('banned', () => setIsBanned(true));
    newSocket.on('premium-activated', () => {
      setUserProfile(prev => ({ ...prev, isPremium: true }));
      alert("Tabriklaymiz! Sizning Premium obunangiz admin tomonidan tasdiqlandi!");
    });

    newSocket.on('matched', (data) => {
      setAppState('IN_ROOM');
      setCurrentRoom(data.room);
      setPartnerProfile(data.partnerProfile);
      setPartnerDbId(data.partnerDbId);
      setMessages([]); 
      
      const peerConfig = turnServers ? { iceServers: turnServers } : undefined;
      const peer = new Peer({ initiator: data.initiator, trickle: false, stream: stream, config: peerConfig });

      peer.on('signal', (signalData) => {
        if (data.initiator) newSocket.emit('offer', { room: data.room, offer: signalData });
        else newSocket.emit('answer', { room: data.room, answer: signalData });
      });

      peer.on('stream', (remoteStream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      });

      newSocket.on('offer', (offer) => { if (!data.initiator) peer.signal(offer); });
      newSocket.on('answer', (answer) => { if (data.initiator) peer.signal(answer); });
      peerRef.current = peer;
    });

    newSocket.on('partner-disconnected', () => {
      endCallUIOnly();
      startSearch(newSocket, targetGender); 
    });

    newSocket.on('chat-message', (msg) => {
      setMessages(prev => [...prev, { sender: 'partner', text: msg }]);
    });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (authMode === 'register') {
        if (profile.age < 18) return setError("Faqat 18 yoshdan kattalar!");
        const res = await axios.post(`${API_URL}/auth/register`, { email, password, deviceId, ...profile });
        if (res.data.requiresVerification) {
          setIsVerifying(true);
          return;
        }
        localStorage.setItem('chatruletka_token', res.data.token);
        setUserProfile(res.data.user);
        setToken(res.data.token);
      } else {
        const res = await axios.post(`${API_URL}/auth/login`, { email, password });
        if (res.data.requiresVerification) {
          setIsVerifying(true);
          return;
        }
        localStorage.setItem('chatruletka_token', res.data.token);
        setUserProfile(res.data.user);
        setToken(res.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Xatolik yuz berdi");
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post(`${API_URL}/auth/verify`, { email, code: verificationCode });
      localStorage.setItem('chatruletka_token', res.data.token);
      setUserProfile(res.data.user);
      setToken(res.data.token);
      setIsVerifying(false);
    } catch (err) {
      setError(err.response?.data?.error || "Tasdiqlashda xatolik yuz berdi");
    }
  };

  const logout = () => {
    localStorage.removeItem('chatruletka_token');
    setToken(null);
    setUserProfile(null);
    if (socket) socket.close();
    setSocket(null);
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null);
  };

  const fetchFriends = async () => {
    try {
      const token = localStorage.getItem('chatruletka_token');
      const res = await axios.get(`${API_URL}/friends`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(res.data);
    } catch(err) {
      console.error(err);
    }
  };

  const toggleFriendsModal = () => {
    if (!showFriendsModal) fetchFriends();
    setShowFriendsModal(!showFriendsModal);
  };

  const handleAddFriend = () => {
    if (socket) {
      socket.emit('add-friend');
      alert("Do'stlik taklifi yuborildi. Sherigingiz ham bossa qabul qilinadi.");
    }
  };

  const translateMessage = async (index, text) => {
    try {
      const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|uz`);
      if (res.data && res.data.responseData) {
        setMessages(prev => {
           const newMsg = [...prev];
           newMsg[index].translated = res.data.responseData.translatedText;
           return newMsg;
        });
      }
    } catch(err) {
      console.error("Tarjimada xato:", err);
      alert("Tarjima qilishda xatolik yuz berdi.");
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (peerRef.current && localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          const screenTrack = screenStream.getVideoTracks()[0];
          peerRef.current.replaceTrack(videoTrack, screenTrack, localStreamRef.current);
          
          screenTrack.onended = () => {
            if (peerRef.current) peerRef.current.replaceTrack(screenTrack, videoTrack, localStreamRef.current);
            if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            setIsScreenSharing(false);
          };
          localVideoRef.current.srcObject = screenStream;
          setIsScreenSharing(true);
        }
      } catch (err) {
        console.error("Ekran ulashishda xatolik:", err);
      }
    } else {
      if (localStreamRef.current && localVideoRef.current.srcObject) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const currentTrack = localVideoRef.current.srcObject.getVideoTracks()[0];
        if (peerRef.current) peerRef.current.replaceTrack(currentTrack, videoTrack, localStreamRef.current);
        currentTrack.stop();
        localVideoRef.current.srcObject = localStreamRef.current;
        setIsScreenSharing(false);
      }
    }
  };

  const sendPrivateMessage = (e) => {
    e.preventDefault();
    if (!privateInput.trim() || !activePrivateChat) return;
    socket.emit('private-message', { toDbId: activePrivateChat.id, message: privateInput });
    setPrivateMessages(prev => {
      const msgs = prev[activePrivateChat.id] || [];
      return { ...prev, [activePrivateChat.id]: [...msgs, { from: 'me', text: privateInput }] };
    });
    setPrivateInput('');
    setTimeout(() => {
       if(privateChatRef.current) privateChatRef.current.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleStartClick = () => {
    // Premium cheklovi vaqtinchalik olib tashlandi
    startSearch(socket, targetGender);
  };

  const stopSearch = () => {
    if (socket) socket.emit('stop-search');
    endCallUIOnly();
    setAppState('IDLE');
  };

  const reportPartner = () => {
    if (socket && partnerDbId && window.confirm("Bu foydalanuvchi ustidan shikoyat qilasizmi? (Ban qilinadi)")) {
      socket.emit('report', partnerDbId);
      endCallUIOnly();
      startSearch(socket, targetGender); 
    }
  };

  const initAudioGraph = (stream) => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    
    sourceNodeRef.current = ctx.createMediaStreamSource(stream);
    destNodeRef.current = ctx.createMediaStreamDestination();
    
    sourceNodeRef.current.connect(destNodeRef.current);
    
    const processedStream = new MediaStream();
    stream.getVideoTracks().forEach(t => processedStream.addTrack(t));
    destNodeRef.current.stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
    
    return processedStream;
  };

  const changeVoiceEffect = (mode) => {
    setVoiceEffect(mode);
    setShowVoiceMenu(false);
    const ctx = audioCtxRef.current;
    if (!ctx || !sourceNodeRef.current || !destNodeRef.current) return;

    sourceNodeRef.current.disconnect();
    activeEffectNodesRef.current.forEach(node => {
      if (node.stop) node.stop();
      node.disconnect();
    });
    activeEffectNodesRef.current = [];

    if (mode === 'normal') {
      sourceNodeRef.current.connect(destNodeRef.current);
    } else if (mode === 'robot') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 50;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;
      
      sourceNodeRef.current.connect(gainNode);
      osc.connect(gainNode.gain);
      gainNode.connect(destNodeRef.current);
      osc.start();
      
      activeEffectNodesRef.current = [osc, gainNode];
    } else if (mode === 'radio') {
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1000;
      bandpass.Q.value = 1;

      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(400);
      for (let i = 0; i < 400; i++) {
        const x = (i * 2) / 400 - 1;
        curve[i] = (3 + 20) * x * 20 * (Math.PI / 180) / (Math.PI + 20 * Math.abs(x));
      }
      shaper.curve = curve;

      sourceNodeRef.current.connect(bandpass);
      bandpass.connect(shaper);
      shaper.connect(destNodeRef.current);

      activeEffectNodesRef.current = [bandpass, shaper];
    } else if (mode === 'echo') {
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.3;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.4;
      
      sourceNodeRef.current.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      
      sourceNodeRef.current.connect(destNodeRef.current);
      delay.connect(destNodeRef.current);
      
      activeEffectNodesRef.current = [delay, feedback];
    }
  };

  const showFlyingGift = (emoji) => {
    const newGift = { id: Date.now(), emoji, left: Math.random() * 80 + 10 };
    setFlyingGifts(prev => [...prev, newGift]);
    setTimeout(() => {
      setFlyingGifts(prev => prev.filter(g => g.id !== newGift.id));
    }, 4000);
  };

  const startSearch = (sock = socket, tGender = targetGender) => {
    if (sock && stream && !isBanned) {
      endCallUIOnly();
      setAppState('SEARCHING');
      sock.emit('start-search', tGender);
    }
  };



  const endCallUIOnly = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setPartnerProfile(null);
    setPartnerDbId(null);
    setCurrentRoom(null);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (chatInput.trim() !== '' && currentRoom && socket) {
      socket.emit('chat-message', { room: currentRoom, message: chatInput });
      setMessages(prev => [...prev, { sender: 'me', text: chatInput }]);
      setChatInput('');
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = !videoEnabled;
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !audioEnabled;
      setAudioEnabled(!audioEnabled);
    }
  };

  const submitPaymentRequest = async () => {
    if(!paymentReceipt.trim()) return alert("Iltimos, ismingiz yoki chek raqamini kiriting.");
    setPaymentLoading(true);
    try {
      const res = await axios.post(`${API_URL}/payment/request`, { 
        userId: userProfile.id,
        username: userProfile.name,
        receiptInfo: paymentReceipt
      });
      if (res.data.success) {
        setPaymentRequested(true);
      }
    } catch (err) {
      alert("Xatolik yuz berdi");
    } finally {
      setPaymentLoading(false);
    }
  };

  if (isBanned) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-4 text-white font-sans text-center">
        <AlertTriangle size={80} className="text-red-500 mb-6" />
        <h1 className="text-4xl font-bold mb-4">Siz Bloklangansiz!</h1>
        <p className="text-white/60 text-lg max-w-md">Qoidalarni buzganingiz uchun sizning akkauntingiz va qurilmangiz saytdan chetlatildi.</p>
        <button onClick={logout} className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full">Chiqish</button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 flex items-center justify-center p-4 text-white font-sans">
        <div className="glass p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent"></div>
          <h1 className="text-3xl font-extrabold text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">ChatRuletka Pro</h1>
          
          {isVerifying ? (
            <form onSubmit={handleVerify} className="space-y-4 mt-6">
              <div className="text-center mb-6">
                <Shield className="w-16 h-16 text-primary mx-auto mb-2 opacity-80" />
                <p className="text-white/80">
                  Biz <b>{email}</b> manziliga tasdiqlash kodini yubordik. Iltimos, pochtangizni tekshiring.
                </p>
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-1">Tasdiqlash kodi</label>
                <input 
                  type="text" 
                  value={verificationCode} 
                  onChange={e => setVerificationCode(e.target.value)} 
                  required 
                  placeholder="6 xonali kod"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-widest focus:ring-2 focus:ring-primary/50" 
                />
              </div>
              {error && <p className="text-red-400 text-sm font-medium text-center bg-red-400/10 py-2 rounded-lg">{error}</p>}
              <button type="submit" className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg mt-4 flex items-center justify-center gap-2">
                <CheckCircle size={20} /> Tasdiqlash
              </button>
              <button type="button" onClick={() => setIsVerifying(false)} className="w-full mt-2 text-white/50 text-sm hover:text-white transition-colors">
                Orqaga qaytish
              </button>
            </form>
          ) : (
            <>
              <div className="flex border-b border-white/10 mt-6 mb-6">
                <button className={`flex-1 py-3 font-medium transition-colors border-b-2 ${authMode === 'login' ? 'border-primary text-white' : 'border-transparent text-white/50'}`} onClick={() => setAuthMode('login')}>
                  <LogIn size={18} className="inline mr-2" /> Kirish
                </button>
                <button className={`flex-1 py-3 font-medium transition-colors border-b-2 ${authMode === 'register' ? 'border-primary text-white' : 'border-transparent text-white/50'}`} onClick={() => setAuthMode('register')}>
                  <UserPlus size={18} className="inline mr-2" /> Ro'yxatdan o'tish
                </button>
              </div>
              
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-white/80 mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm text-white/80 mb-1">Parol</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/50" />
                </div>

                {authMode === 'register' && (
                  <>
                    <div>
                      <label className="block text-sm text-white/80 mb-1">Ism</label>
                      <input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-white/80 mb-1">Yosh</label>
                        <input type="number" value={profile.age} onChange={e => setProfile({...profile, age: e.target.value})} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3" />
                      </div>
                      <div>
                        <label className="block text-sm text-white/80 mb-1">Jins</label>
                        <select value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value})} className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3">
                          <option value="Erkak">Erkak</option>
                          <option value="Ayol">Ayol</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-white/80 mb-1">Davlat</label>
                      <select value={profile.country} onChange={e => setProfile({...profile, country: e.target.value})} className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3">
                        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {error && <p className="text-red-400 text-sm font-medium text-center bg-red-400/10 py-2 rounded-lg">{error}</p>}

                <button type="submit" className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg mt-4 flex items-center justify-center gap-2">
                  {authMode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />} {authMode === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 flex flex-col font-sans text-white overflow-hidden relative">
      
      {/* Flying Gifts Animation Layer */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {flyingGifts.map(gift => (
            <div 
              key={gift.id} 
              className="absolute bottom-0 text-7xl animate-float-up opacity-90 drop-shadow-2xl"
              style={{ left: `${gift.left}%` }}
            >
              {gift.emoji}
            </div>
          ))}
      </div>

      {showPremiumModal && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="glass p-8 rounded-3xl w-full max-w-sm text-center relative border border-accent/30 shadow-2xl shadow-accent/20">
            <button onClick={() => {setShowPremiumModal(false); setPaymentRequested(false);}} className="absolute top-4 right-4 text-white/50 hover:text-white">X</button>
            <Star size={60} className="text-yellow-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
            <h2 className="text-3xl font-bold mb-2">Premium Filtr</h2>
            
            {paymentRequested ? (
              <div className="mt-4">
                <CheckCircle size={50} className="text-green-500 mx-auto mb-4" />
                <p className="text-lg font-bold">So'rov yuborildi!</p>
                <p className="text-white/70 mt-2">Admin to'lovni tekshirib, tez orada Premium yoqib beradi.</p>
                <button onClick={() => setShowPremiumModal(false)} className="mt-6 bg-gray-700 w-full py-3 rounded-xl font-bold hover:bg-gray-600 transition-all">Yopish</button>
              </div>
            ) : (
              <>
                <p className="text-white/70 mb-4 text-sm">Faqat xohlagan jinsni tanlash uchun Premium oling.</p>
                <div className="bg-black/50 p-4 rounded-xl mb-4 border border-white/10 text-left">
                  <p className="text-sm text-white/60 mb-1">To'lov summasi:</p>
                  <p className="font-bold text-xl mb-3 text-yellow-400">10,000 so'm</p>
                  
                  <p className="text-sm text-white/60 mb-1">Karta raqami (Click/Payme):</p>
                  <div className="flex justify-between items-center bg-black/50 p-2 rounded-lg mb-1 border border-white/10">
                    <p className="font-mono font-bold tracking-widest text-white text-lg">9860100126647724</p>
                    <button onClick={() => {navigator.clipboard.writeText("9860100126647724"); alert("Karta nusxalandi!")}} className="text-xs bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 transition-all font-bold">Nusxa</button>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">NOMONJON ORMONOV</p>
                </div>
                
                <input 
                  type="text" 
                  placeholder="To'ladim! (Ismingiz yoki chek raqami)" 
                  value={paymentReceipt}
                  onChange={(e) => setPaymentReceipt(e.target.value)}
                  className="w-full bg-black/30 border border-white/20 p-3 rounded-xl text-white outline-none focus:border-yellow-400 mb-4 placeholder:text-white/30"
                />
                <button onClick={submitPaymentRequest} disabled={paymentLoading} className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-black font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all">
                  {paymentLoading ? "Yuborilmoqda..." : "To'lovni Tasdiqlash"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showFriendsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl relative">
            <h2 className="text-2xl font-bold text-white mb-6">Mening Do'stlarim</h2>
            {friends.length === 0 ? (
              <p className="text-gray-400">Hali do'stlar yo'q. Chat davomida yulduzchani bosib do'st orttiring!</p>
            ) : (
              <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {friends.map(f => (
                  <div key={f.id} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg border border-gray-600">
                    <div>
                      <p className="font-semibold text-white">{f.name}, {f.age}</p>
                      <p className="text-sm text-gray-400">{f.country}</p>
                    </div>
                    <button 
                      onClick={() => { setActivePrivateChat(f); setShowFriendsModal(false); }}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2">
                      <MessageSquare size={16} /> SMS Yozish
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 text-right">
              <button onClick={toggleFriendsModal} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-xl transition">
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-10 pointer-events-none">
        <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">ChatRuletka Pro</h1>
        <div className="flex gap-4 pointer-events-auto items-center">
          <button onClick={toggleFriendsModal} className="flex items-center space-x-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-sm font-semibold transition">
            <Users size={16} /> <span>Do'stlar ({friends.length})</span>
          </button>
          <button onClick={logout} className="bg-red-500/20 text-red-400 hover:bg-red-500/40 p-2 rounded-full transition-colors" title="Chiqish">
            <LogIn size={18} className="transform rotate-180" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full h-full relative overflow-hidden bg-black">
        {/* Full Screen Remote Video */}
        <div className="absolute inset-0 z-0 bg-gray-900">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
        </div>

        {/* IDLE & SEARCHING Overlays */}
        {(appState === 'IDLE' || appState === 'SEARCHING') && (
          <div className="absolute inset-0 bg-black/80 z-10 flex flex-col items-center justify-center">
            {appState === 'IDLE' ? (
              <div className="flex flex-col items-center p-8 glass rounded-3xl animate-fade-in shadow-2xl max-w-md w-full mx-4 text-center">
                <h2 className="text-3xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">OmeTV Uslubi</h2>
                <p className="text-white/70 mb-8">Yangi do'stlar orttirishga tayyormisiz?</p>
                <div className="w-full mb-8">
                  <select 
                    value={targetGender} 
                    onChange={e => setTargetGender(e.target.value)} 
                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-4 text-lg text-white focus:outline-none focus:border-primary text-center appearance-none cursor-pointer"
                  >
                    <option value="Barchasi" className="bg-slate-800">🧑‍🤝‍🧑 Barchasi bilan</option>
                    <option value="Ayol" className="bg-slate-800">👩 Faqat Qizlar</option>
                    <option value="Erkak" className="bg-slate-800">👨 Faqat Yigitlar</option>
                  </select>
                </div>
                <button onClick={handleStartClick} className="w-full bg-gradient-to-r from-primary to-accent hover:from-accent hover:to-primary py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transform hover:scale-[1.02] transition-all">
                  <Play fill="currentColor" size={24} /> Boshlash
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center animate-fade-in">
                <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-2xl font-light animate-pulse text-white">Suhbatdosh qidirilmoqda...</p>
              </div>
            )}
          </div>
        )}

        {/* Partner Info & Actions - Top Left / Right */}
        {appState === 'IN_ROOM' && (
          <>
            {partnerProfile && (
              <div className="absolute top-24 left-6 z-20 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl flex flex-col gap-1 shadow-lg border border-white/10 pointer-events-none">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-lg">{partnerProfile.name}</span>
                  <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs">{partnerProfile.age}</span>
                  <span className="bg-primary/50 text-white px-2 py-0.5 rounded-full text-xs">{partnerProfile.gender}</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-white/80">
                  <MapPin size={14} /> {partnerProfile.country}
                </div>
              </div>
            )}
            
            <div className="absolute top-24 right-6 z-20 flex flex-col space-y-3">
              <div className="relative">
                <button onClick={() => setGiftMenuOpen(!giftMenuOpen)} className="p-3 bg-pink-500/90 hover:bg-pink-500 rounded-2xl text-white shadow-xl backdrop-blur-md transition-transform hover:scale-110" title="Sovg'a yuborish">
                  <Gift size={24} />
                </button>
                {giftMenuOpen && (
                  <div className="absolute right-14 top-0 flex space-x-2 bg-black/60 p-2 rounded-xl backdrop-blur-md border border-white/10">
                    <button onClick={() => sendGift('🌹')} className="text-3xl hover:scale-125 transition-transform">🌹</button>
                    <button onClick={() => sendGift('💖')} className="text-3xl hover:scale-125 transition-transform">💖</button>
                    <button onClick={() => sendGift('🚀')} className="text-3xl hover:scale-125 transition-transform">🚀</button>
                  </div>
                )}
              </div>
              <button onClick={handleAddFriend} className="p-3 bg-yellow-500/90 hover:bg-yellow-500 rounded-2xl text-white shadow-xl backdrop-blur-md transition-transform hover:scale-110" title="Do'stlashish">
                <Star size={24} />
              </button>
              <button onClick={reportPartner} className="p-3 bg-red-600/90 hover:bg-red-600 rounded-2xl text-white shadow-xl backdrop-blur-md transition-transform hover:scale-110" title="Shikoyat qilish">
                <ShieldAlert size={24} />
              </button>

              <div className="relative mt-4">
                <button onClick={() => setShowVoiceMenu(!showVoiceMenu)} className={`p-3 rounded-2xl transition-transform hover:scale-110 shadow-xl backdrop-blur-md ${voiceEffect !== 'normal' ? 'bg-purple-500/90' : 'bg-black/50 border border-white/10'}`} title="Ovoz effektlari">
                  <Mic2 size={24} className="text-white" />
                </button>
                {showVoiceMenu && (
                  <div className="absolute right-14 top-0 bg-black/80 backdrop-blur-md rounded-2xl p-2 flex flex-col gap-2 shadow-2xl border border-white/10 min-w-[120px]">
                    <button onClick={() => changeVoiceEffect('normal')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'normal' ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'}`}>Oddiy</button>
                    <button onClick={() => changeVoiceEffect('robot')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'robot' ? 'bg-purple-500 text-white' : 'text-white/70 hover:bg-white/10'}`}>🤖 Robot</button>
                    <button onClick={() => changeVoiceEffect('radio')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'radio' ? 'bg-purple-500 text-white' : 'text-white/70 hover:bg-white/10'}`}>📻 Radio</button>
                    <button onClick={() => changeVoiceEffect('echo')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'echo' ? 'bg-purple-500 text-white' : 'text-white/70 hover:bg-white/10'}`}>🏔️ G'or</button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Local Video - Picture in Picture Bottom Right */}
        <div className={`absolute ${appState === 'IN_ROOM' ? 'bottom-28 right-6 md:right-8 w-1/3 max-w-[280px]' : 'bottom-6 right-6 w-1/4 max-w-[200px]'} aspect-video rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-20 bg-black transition-all duration-500`}>
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
        </div>

        {/* Overlay Chat - Bottom Left */}
        {appState === 'IN_ROOM' && (
          <div className="absolute bottom-28 left-4 md:left-8 w-80 max-h-[40vh] flex flex-col z-20 pointer-events-auto rounded-3xl overflow-hidden shadow-2xl bg-black/40 backdrop-blur-md border border-white/10">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar flex flex-col-reverse">
              <div ref={chatEndRef} />
              {[...messages].reverse().map((m, i) => (
                <div key={i} className={`flex flex-col ${m.sender === 'me' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3 py-2 rounded-2xl max-w-[90%] break-words text-sm shadow-md ${m.sender === 'me' ? 'bg-primary/90 text-white rounded-br-none' : 'bg-black/60 text-white rounded-bl-none'}`}>
                    {m.text}
                  </div>
                  {m.sender !== 'me' && !m.translated && (
                    <button onClick={() => translateMessage(messages.length - 1 - i, m.text)} className="text-[10px] text-white/50 hover:text-white mt-1 flex items-center gap-1 transition">
                      <Globe size={12}/> Tarjima (UZ)
                    </button>
                  )}
                  {m.translated && (
                    <div className="text-[11px] text-green-300 mt-1 bg-green-900/40 px-2 py-0.5 rounded-full border border-green-500/20">
                      {m.translated}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} className="p-2 bg-black/40 flex gap-2 border-t border-white/10">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Yozish..." className="flex-1 bg-white/10 border-none rounded-full px-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm text-white placeholder-white/50" />
              <button type="submit" className="bg-primary hover:bg-primary/80 p-2 rounded-full text-white transition-colors"><Send size={16} /></button>
            </form>
          </div>
        )}

        {/* OmeTV style Bottom Controls */}
        {appState === 'IN_ROOM' && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 flex items-center gap-3 md:gap-6">
            <button onClick={stopSearch} className="bg-red-600/90 hover:bg-red-600 backdrop-blur-md text-white px-6 md:px-10 py-3 md:py-4 rounded-full font-bold text-base md:text-lg shadow-[0_0_20px_rgba(220,38,38,0.3)] uppercase tracking-wide transition-transform hover:scale-105 flex items-center gap-2 border border-red-500/50">
              <StopCircle size={24} /> To'xtatish
            </button>
            <button onClick={handleStartClick} className="bg-blue-600/90 hover:bg-blue-600 backdrop-blur-md text-white px-6 md:px-10 py-3 md:py-4 rounded-full font-bold text-base md:text-lg shadow-[0_0_20px_rgba(37,99,235,0.3)] uppercase tracking-wide transition-transform hover:scale-105 flex items-center gap-2 border border-blue-500/50">
              Keyingisi <SkipForward size={24} />
            </button>
          </div>
        )}
        
        {/* Top Control Bar (Mic, Video, Screen Share) */}
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 flex gap-3 bg-black/30 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
          <button onClick={toggleAudio} className={`p-2 rounded-full transition-colors ${audioEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/80 text-white'}`} title="Mikrofon"><Mic size={18} /></button>
          <button onClick={toggleVideo} className={`p-2 rounded-full transition-colors ${videoEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/80 text-white'}`} title="Kamera"><Video size={18} /></button>
          <div className="w-px h-6 bg-white/20 my-auto"></div>
          <button onClick={toggleScreenShare} className={`p-2 rounded-full transition-colors ${isScreenSharing ? 'bg-accent/80 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`} title="Ekranni ulashish"><MonitorUp size={18} /></button>
        </div>
      </main>

      {/* Private Chat Floating Window */}
      {activePrivateChat && (
        <div className="fixed bottom-24 right-6 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden animate-slide-up">
          <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
            <div>
              <p className="font-bold text-white text-sm">{activePrivateChat.name}</p>
              <p className="text-xs text-green-400">Do'st (Shaxsiy Chat)</p>
            </div>
            <button onClick={() => setActivePrivateChat(null)} className="text-gray-400 hover:text-white"><X size={18} /></button>
          </div>
          <div className="h-60 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-black/40">
            {(privateMessages[activePrivateChat.id] || []).map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`px-3 py-2 rounded-xl text-sm max-w-[80%] ${m.from === 'me' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-700 text-white rounded-bl-none'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={privateChatRef} />
          </div>
          <form onSubmit={sendPrivateMessage} className="p-3 bg-gray-800 flex gap-2 border-t border-gray-700">
            <input type="text" value={privateInput} onChange={e => setPrivateInput(e.target.value)} placeholder="Shaxsiy SMS..." className="flex-1 bg-gray-700 border-none rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white" />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 p-2 rounded-full text-white"><Send size={16} /></button>
          </form>
        </div>
      )}

    </div>
  );
}

export default App;
