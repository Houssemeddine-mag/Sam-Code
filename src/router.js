// Simple router for the Sam Code app
// Exposes a BrowserRouter that renders the main App component.

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './renderer/src/App';

export default function MainRouter() {
  return (
    <Router>
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    </Router>
  );
}
