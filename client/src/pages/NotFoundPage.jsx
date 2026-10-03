import React from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import Card from '../components/Card.jsx';

export const NotFoundPage = () => {
  return (
    <div className="page-container" style={{ maxWidth: '600px', margin: '4rem auto' }}>
      <Card>
        <EmptyState
          icon="🔍"
          title="404 - Page Not Found"
          description="The route or resource you are attempting to access does not exist or may have been relocated."
          actionLabel="Return to Overview"
          onAction={() => { window.location.href = '/'; }}
        />
      </Card>
    </div>
  );
};

export default NotFoundPage;
