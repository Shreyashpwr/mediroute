import React from 'react';

export const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <p>&copy; {new Date().getFullYear()} MediRoute. Production-ready Healthcare Logistics.</p>
        <div className="footer-links">
          <span>React.js</span>
          <span>•</span>
          <span>Express.js</span>
          <span>•</span>
          <span>MongoDB Atlas</span>
          <span>•</span>
          <span>Gemini AI</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
