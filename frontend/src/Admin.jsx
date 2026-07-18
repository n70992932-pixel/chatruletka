import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Shield, Ban, Unlock, Users, Star, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_URL = 'http://localhost:5005/api';

function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('chatruletka_token');
      if (!token) return navigate('/');
      
      const res = await axios.get(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (err) {
      setError("Admin paneliga kirish uchun ruxsat yo'q.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleBan = async (userId, currentBanStatus) => {
    try {
      const token = localStorage.getItem('chatruletka_token');
      await axios.post(`${API_URL}/admin/ban`, { userId, isBanned: !currentBanStatus }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    } catch (err) {
      alert("Xatolik yuz berdi");
    }
  };

  if (loading) return <div className="min-h-screen bg-dark flex justify-center items-center text-white font-sans">Yuklanmoqda...</div>;
  if (error) return <div className="min-h-screen bg-dark flex flex-col justify-center items-center text-white font-sans"><Shield size={60} className="text-red-500 mb-4"/><h2 className="text-xl font-bold">{error}</h2><button onClick={() => navigate('/')} className="mt-6 bg-primary hover:bg-accent px-6 py-2 rounded-full font-bold transition-colors">Orqaga Qaytish</button></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/10"><ArrowLeft/></button>
            <h1 className="text-3xl font-bold flex items-center gap-3"><Shield className="text-primary" size={32}/> Boshqaruv Markazi</h1>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-center">
              <p className="text-xs text-white/50 uppercase tracking-widest mb-1">Jami Foydalanuvchilar</p>
              <p className="text-3xl font-extrabold">{users.length}</p>
            </div>
            <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-center">
              <p className="text-xs text-yellow-400/50 uppercase tracking-widest mb-1">Premium A'zolar</p>
              <p className="text-3xl font-extrabold text-yellow-400">{users.filter(u => u.isPremium).length}</p>
            </div>
            <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-center">
              <p className="text-xs text-red-400/50 uppercase tracking-widest mb-1">Bloklanganlar</p>
              <p className="text-3xl font-extrabold text-red-400">{users.filter(u => u.isBanned).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-black/40">
              <tr>
                <th className="p-5 font-semibold text-white/50 text-sm uppercase tracking-wider">Ism</th>
                <th className="p-5 font-semibold text-white/50 text-sm uppercase tracking-wider">Email</th>
                <th className="p-5 font-semibold text-white/50 text-sm uppercase tracking-wider">Yoshi / Jinsi</th>
                <th className="p-5 font-semibold text-white/50 text-sm uppercase tracking-wider">Davlat</th>
                <th className="p-5 font-semibold text-white/50 text-sm uppercase tracking-wider">Status</th>
                <th className="p-5 font-semibold text-white/50 text-sm uppercase tracking-wider text-right">Harakat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="p-5 font-bold text-lg">{u.name}</td>
                  <td className="p-5 text-white/60">{u.email}</td>
                  <td className="p-5 text-white/80"><span className="bg-white/10 px-2 py-1 rounded text-sm">{u.age} yosh</span> <span className="bg-primary/20 text-primary px-2 py-1 rounded text-sm ml-2">{u.gender}</span></td>
                  <td className="p-5 text-white/80 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div> {u.country}</td>
                  <td className="p-5">
                    <div className="flex flex-wrap gap-2">
                      {u.isPremium && <span className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-2 py-1 rounded text-xs font-bold flex items-center gap-1"><Star size={10} fill="currentColor"/> PREMIUM</span>}
                      {u.isAdmin && <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30 text-xs font-bold flex items-center gap-1"><Shield size={10}/> ADMIN</span>}
                      {u.isBanned && <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30 text-xs font-bold flex items-center gap-1"><Ban size={10}/> BANNED</span>}
                      {!u.isPremium && !u.isAdmin && !u.isBanned && <span className="text-white/40 text-sm">Oddiy</span>}
                    </div>
                  </td>
                  <td className="p-5 text-right">
                    {!u.isAdmin && (
                      <button 
                        onClick={() => toggleBan(u._id || u.id, u.isBanned)} 
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all transform hover:scale-105 ${u.isBanned ? 'bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white' : 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'}`}
                      >
                        {u.isBanned ? <><Unlock size={16}/> OCHISH</> : <><Ban size={16}/> BLOKLASH</>}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Admin;
