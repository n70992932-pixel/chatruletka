import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as nsfwjs from 'nsfwjs';
import { Video, VideoOff, Mic, MicOff, SkipForward, Play, ShieldAlert, User, MapPin, StopCircle, Users, Send, AlertTriangle, LogIn, UserPlus, Star, CheckCircle, Shield, Globe, X, MessageSquare, MonitorUp, Gift, Sun, Moon, Mic2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SOCKET_SERVER = 'http://localhost:5005';
const API_URL = 'http://localhost:5005/api';
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

    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      const uId = params.get('user_id');
      axios.post(`${API_URL}/payment/confirm`, { userId: uId }).then(() => {
        alert("Premium muvaffaqiyatli faollashtirildi!");
        window.history.replaceState({}, document.title, "/");
        if (userProfile) setUserProfile(prev => ({...prev, isPremium: true}));
      }).catch(console.error);
    }
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
        localStorage.setItem('chatruletka_token', res.data.token);
        setUserProfile(res.data.user);
        setToken(res.data.token);
      } else {
        const res = await axios.post(`${API_URL}/auth/login`, { email, password });
        localStorage.setItem('chatruletka_token', res.data.token);
        setUserProfile(res.data.user);
        setToken(res.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Xatolik yuz berdi");
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
    if (targetGender !== 'Barchasi' && !userProfile.isPremium) {
      setShowPremiumModal(true);
      return;
    }
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

  const payForPremium = async () => {
    setPaymentLoading(true);
    try {
      const res = await axios.post(`${API_URL}/payment/test-checkout`, { userId: userProfile.id });
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.success) {
        setUserProfile(prev => ({ ...prev, isPremium: true }));
        setShowPremiumModal(false);
        alert("Tabriklaymiz! Siz Premium sotib oldingiz.");
        startSearch(socket, targetGender);
      }
    } catch (err) {
      console.error(err);
      alert("To'lovda xatolik yuz berdi!");
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
            <button onClick={() => setShowPremiumModal(false)} className="absolute top-4 right-4 text-white/50 hover:text-white">X</button>
            <Star size={60} className="text-yellow-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
            <h2 className="text-3xl font-bold mb-2">Premium Filtr</h2>
            <p className="text-white/70 mb-6">Faqat qizlar yoki yigitlar bilan suhbatlashish uchun Premium obuna xarid qiling.</p>
            
            <div className="bg-black/30 rounded-xl p-4 mb-6 text-left">
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm"><CheckCircle size={16} className="text-green-400"/> Faqat xohlagan jinsni tanlash</li>
                <li className="flex items-center gap-2 text-sm"><CheckCircle size={16} className="text-green-400"/> To'liq anonimlik (Maxfiy ism)</li>
                <li className="flex items-center gap-2 text-sm"><CheckCircle size={16} className="text-green-400"/> VIP Status va Reklamasiz</li>
              </ul>
            </div>

            <button onClick={payForPremium} disabled={paymentLoading} className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-black font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all">
              {paymentLoading ? "Iltimos kuting..." : "$4.99 - Hozir Sotib Olish"}
            </button>
            <p className="text-xs text-white/40 mt-4">*Bu TEST rejim. Haqiqiy pul yechilmaydi.</p>
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

      <main className="flex-1 w-full h-full relative flex items-center justify-center p-4 mt-16 mb-24 max-w-7xl mx-auto gap-4">
        <div className="relative flex-1 aspect-video rounded-3xl overflow-hidden glass shadow-2xl bg-black">
          {appState === 'IN_ROOM' && partnerProfile && (
            <div className="absolute top-6 left-6 z-30 glass px-6 py-3 rounded-2xl flex flex-col gap-1 shadow-2xl animate-fade-in pointer-events-none">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{partnerProfile.name}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">{partnerProfile.age}</span>
                <span className="bg-primary/40 px-2 py-0.5 rounded-full text-xs">{partnerProfile.gender}</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-white/80">
                <MapPin size={14} /> {partnerProfile.country}
              </div>
            </div>
          )}

          {appState === 'IDLE' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 p-6">
              <p className="text-2xl font-light mb-8 text-center">Yangi do'stlar orttirishga tayyormisiz?</p>
              
              <div className="flex flex-col items-center gap-6 mb-8 w-full max-w-xs">
                <div className="w-full">
                  <select 
                    value={targetGender} 
                    onChange={e => setTargetGender(e.target.value)} 
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary text-center appearance-none"
                  >
                    <option value="Barchasi" className="bg-slate-800">🧑‍🤝‍🧑 Barchasi bilan</option>
                    <option value="Ayol" className="bg-slate-800">👩 Faqat Qizlar (Premium)</option>
                    <option value="Erkak" className="bg-slate-800">👨 Faqat Yigitlar (Premium)</option>
                  </select>
                </div>
              </div>

              <button onClick={handleStartClick} className="bg-gradient-to-r from-primary to-accent hover:from-accent hover:to-primary px-12 py-5 rounded-full text-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/30 transform hover:scale-105 transition-all">
                <Play fill="currentColor" size={28} /> Boshlash
              </button>
            </div>
          )}
          
          {appState === 'SEARCHING' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-xl animate-pulse text-white/80">Suhbatdosh qidirilmoqda...</p>
            </div>
          )}

          {/* Remote Video Container */}
          <div className="relative w-full h-[60vh] md:h-[70vh] bg-black/60 rounded-3xl overflow-hidden shadow-2xl border border-white/5 relative group">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
            
            {/* Top Right Controls (Friend & Report & Gift) */}
            {appState === 'IN_ROOM' && (
              <div className="absolute top-4 right-4 z-20 flex flex-col space-y-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative">
                  <button onClick={() => setGiftMenuOpen(!giftMenuOpen)} className="p-3 bg-pink-500/90 hover:bg-pink-500 rounded-2xl text-white shadow-xl backdrop-blur-md transition-transform hover:scale-110" title="Sovg'a yuborish">
                    <Gift size={24} />
                  </button>
                  {giftMenuOpen && (
                    <div className="absolute right-14 top-0 flex space-x-2 bg-black/60 p-2 rounded-xl backdrop-blur-md">
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
              </div>
            )}
          </div>
          <div className="absolute bottom-6 right-6 w-1/4 aspect-video rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl z-20 bg-black">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
          </div>
        </div>

        {appState === 'IN_ROOM' && (
          <div className="w-80 h-full glass rounded-3xl flex flex-col overflow-hidden animate-fade-in shadow-2xl">
            <div className="p-4 border-b border-white/10 bg-black/20">
              <h3 className="font-bold flex items-center gap-2"><User size={18}/> Chat</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.sender === 'me' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2 rounded-2xl max-w-[85%] break-words ${m.sender === 'me' ? 'bg-primary text-white rounded-br-none' : 'bg-white/10 text-white rounded-bl-none'}`}>
                    {m.text}
                  </div>
                  {m.sender !== 'me' && !m.translated && (
                    <button onClick={() => translateMessage(i, m.text)} className="text-[10px] text-gray-400 hover:text-white mt-1 flex items-center gap-1 transition">
                      <Globe size={12}/> Tarjima (UZ)
                    </button>
                  )}
                  {m.translated && (
                    <div className="text-xs text-green-300 mt-1 bg-green-900/30 px-3 py-1 rounded-full border border-green-500/20">
                      {m.translated}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendMessage} className="p-3 bg-black/30 flex gap-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Xabar..." className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              <button type="submit" className="bg-primary hover:bg-accent p-2 rounded-full text-white transition-colors"><Send size={18} /></button>
            </form>
          </div>
        )}
      </main>

      <footer className="absolute bottom-0 w-full p-6 flex justify-center items-center z-10 bg-gradient-to-t from-black/80 to-transparent">
        <div className="glass px-6 py-3 rounded-full flex gap-4 items-center shadow-2xl">
          <button onClick={toggleAudio} className={`p-3 rounded-full ${audioEnabled ? 'bg-white/10' : 'bg-red-500/80'}`}><Mic size={22} /></button>
          <button onClick={toggleVideo} className={`p-3 rounded-full ${videoEnabled ? 'bg-white/10' : 'bg-red-500/80'}`}><Video size={22} /></button>
          <div className="w-px h-8 bg-white/20"></div>
          {appState === 'IN_ROOM' && (
            <>
              <button onClick={stopSearch} className="bg-red-500/80 hover:bg-red-500 p-3 rounded-full transition-colors tooltip" title="To'xtatish"><StopCircle size={22} /></button>
              <button onClick={handleStartClick} className="bg-accent/80 hover:bg-accent p-3 rounded-full transition-colors tooltip" title="Keyingisi"><SkipForward size={22} /></button>
              <div className="w-px h-8 bg-white/20 mx-2"></div>
              
              <div className="relative">
                <button 
                  onClick={() => setShowVoiceMenu(!showVoiceMenu)} 
                  className={`p-3 rounded-full transition-colors tooltip ${voiceEffect !== 'normal' ? 'bg-purple-500/80 hover:bg-purple-500' : 'bg-white/10 hover:bg-white/20'}`} 
                  title="Ovoz effektlari"
                >
                  <Mic2 size={22} />
                </button>
                {showVoiceMenu && (
                  <div className="absolute bottom-14 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-md rounded-2xl p-2 flex flex-col gap-2 shadow-2xl border border-white/10 min-w-[120px]">
                    <button onClick={() => changeVoiceEffect('normal')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'normal' ? 'bg-white/20' : 'hover:bg-white/10'}`}>Oddiy</button>
                    <button onClick={() => changeVoiceEffect('robot')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'robot' ? 'bg-purple-500' : 'hover:bg-white/10'}`}>🤖 Robot</button>
                    <button onClick={() => changeVoiceEffect('radio')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'radio' ? 'bg-purple-500' : 'hover:bg-white/10'}`}>📻 Radio</button>
                    <button onClick={() => changeVoiceEffect('echo')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${voiceEffect === 'echo' ? 'bg-purple-500' : 'hover:bg-white/10'}`}>🏔️ G'or (Echo)</button>
                  </div>
                )}
              </div>

              <button onClick={toggleScreenShare} className={`${isScreenSharing ? 'bg-accent/80' : 'bg-white/10'} hover:bg-white/20 p-3 rounded-full transition-colors tooltip`} title="Ekranni ulashish"><MonitorUp size={22} /></button>
            </>
          )}
        </div>
      </footer>

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
