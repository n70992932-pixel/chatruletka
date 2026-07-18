import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Chat from './Chat';
import Admin from './Admin';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Chat />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
