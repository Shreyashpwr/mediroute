import React, { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import api from '../services/api.js';

export const AiAssistantModal = ({
  isOpen,
  onClose,
  initialMode = 'triage', // 'triage' | 'summarize' | 'dispatch' | 'facility'
  incidentData = {},
  facilities = [],
  onApplyRecommendation,
}) => {
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Form inputs for manual adjustments / requests
  const [symptomsInput, setSymptomsInput] = useState(
    Array.isArray(incidentData.symptoms)
      ? incidentData.symptoms.join(', ')
      : incidentData.symptoms || 'Crushing chest pain, diaphoresis, shortness of breath'
  );
  const [locationInput, setLocationInput] = useState(
    incidentData.pickupLocation?.address || 'Baner Road, Pune, Maharashtra 411045'
  );
  const [triageInput, setTriageInput] = useState(incidentData.triageLevel || 'critical');

  const executeAiRequest = async (targetMode = mode) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (targetMode === 'triage') {
        const res = await api.assessTriage({
          symptoms: symptomsInput,
          patientContext: { mobility: 'Stretcher' },
        });
        setResult({ type: 'triage', data: res.data });
      } else if (targetMode === 'summarize') {
        const res = await api.summarizeIncident({
          patientName: incidentData.patientName || 'Emergency Patient',
          pickupAddress: locationInput,
          symptoms: symptomsInput,
          triageLevel: triageInput,
          notes: incidentData.notes || 'Emergency dispatch initiated from field.',
        });
        setResult({ type: 'summarize', data: res.data });
      } else if (targetMode === 'dispatch') {
        const res = await api.getDispatchAssistance({
          incidentLocation: { address: locationInput },
          triageLevel: triageInput,
          symptoms: symptomsInput,
        });
        setResult({ type: 'dispatch', data: res.data });
      } else if (targetMode === 'facility') {
        const res = await api.recommendFacility({
          triageLevel: triageInput,
          symptoms: symptomsInput,
          facilities,
        });
        setResult({ type: 'facility', data: res.data });
      }
    } catch (err) {
      if (err.status === 429) {
        setError('Gemini AI rate limit reached. Please wait a few seconds and retry.');
      } else if (err.status === 504) {
        setError('Gemini AI request timed out. Retrying with deterministic operational heuristics.');
      } else {
        setError(err.message || 'Error communicating with MediRoute AI backend service.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setResult(null);
    setError(null);
  };

  const handleConfirmAndApply = () => {
    if (!result || !onApplyRecommendation) return;
    onApplyRecommendation(result);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="✨ Gemini AI Operations Assistant"
      size="lg"
    >
      <div className="ai-modal-container">
        {/* Capability Mode Tabs */}
        <div className="ai-tabs-strip">
          <button
            type="button"
            className={`ai-tab-chip ${mode === 'triage' ? 'active' : ''}`}
            onClick={() => handleModeChange('triage')}
          >
            🩺 Triage Urgency
          </button>
          <button
            type="button"
            className={`ai-tab-chip ${mode === 'summarize' ? 'active' : ''}`}
            onClick={() => handleModeChange('summarize')}
          >
            📋 Incident Summary
          </button>
          <button
            type="button"
            className={`ai-tab-chip ${mode === 'dispatch' ? 'active' : ''}`}
            onClick={() => handleModeChange('dispatch')}
          >
            🚑 Dispatch Allocation
          </button>
          <button
            type="button"
            className={`ai-tab-chip ${mode === 'facility' ? 'active' : ''}`}
            onClick={() => handleModeChange('facility')}
          >
            🏥 Hospital Recommendation
          </button>
        </div>

        {/* Input Parameters Box */}
        <div className="ai-input-context-card">
          <div className="form-group">
            <label className="form-label">Reported Patient Symptoms / Clinical Presentation:</label>
            <input
              type="text"
              className="form-input"
              value={symptomsInput}
              onChange={(e) => setSymptomsInput(e.target.value)}
              placeholder="e.g. Acute chest pain, shortness of breath"
            />
          </div>

          <div className="ai-input-grid">
            <div className="form-group">
              <label className="form-label">Incident Scene Location:</label>
              <input
                type="text"
                className="form-input"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="e.g. Baner Road, Pune"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Initial Triage Priority:</label>
              <select
                className="form-input form-select"
                value={triageInput}
                onChange={(e) => setTriageInput(e.target.value)}
              >
                <option value="critical">Critical (Immediate ALS)</option>
                <option value="urgent">Urgent (BLS Transport)</option>
                <option value="standard">Standard Transport</option>
              </select>
            </div>
          </div>

          <div className="ai-submit-bar">
            <Button
              variant="primary"
              onClick={() => executeAiRequest()}
              isLoading={loading}
              disabled={loading || !symptomsInput.trim()}
            >
              Generate AI Recommendation
            </Button>
          </div>
        </div>

        {/* Error Handling State */}
        {error && (
          <ErrorMessage
            title="AI Service Notification"
            message={error}
            onRetry={() => executeAiRequest()}
            retryLabel="Retry Gemini Request"
          />
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="ai-loading-box">
            <LoadingSpinner message="Consulting Gemini operational clinical model..." size="md" />
          </div>
        )}

        {/* AI Recommendation Output Card */}
        {result && (
          <div className="ai-result-card">
            {/* Mandatory Header Label */}
            <div className="ai-result-header">
              <div className="ai-tag-group">
                <span className="ai-badge-sparkle">✨</span>
                <span className="ai-recommendation-title">AI-Assisted Recommendation</span>
              </div>
              <span className="ai-decision-tag">Decision Support Only</span>
            </div>

            {/* Mandatory Safety Notice */}
            <div className="ai-safety-alert">
              <span className="safety-icon">⚠️</span>
              <p className="safety-text">
                <strong>Decision-Support Notice:</strong> The AI does not make definitive medical
                diagnoses. All triage, ambulance routing, and hospital allocations require authorized
                human staff confirmation before execution.
              </p>
            </div>

            {/* Dynamic Results Display */}
            <div className="ai-result-body">
              {result.type === 'triage' && (
                <div className="triage-result-view">
                  <div className="ai-score-banner">
                    <div className="score-col">
                      <span className="score-num">{result.data.urgencyScore}/10</span>
                      <span className="score-lbl">Urgency Score</span>
                    </div>
                    <div className="score-col">
                      <span className={`badge-role badge-role-${result.data.triageLevel}`}>
                        {result.data.triageLevel?.toUpperCase()}
                      </span>
                      <span className="score-lbl">Triage Level</span>
                    </div>
                    <div className="score-col">
                      <span className="score-highlight">
                        {result.data.recommendedVehicleType?.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="score-lbl">Recommended Vehicle</span>
                    </div>
                  </div>

                  <p className="ai-summary-text">
                    <strong>Clinical Evaluation:</strong> {result.data.summary}
                  </p>

                  {result.data.recommendations?.length > 0 && (
                    <div className="ai-bullet-block">
                      <strong>Immediate First-Responder Directives:</strong>
                      <ul>
                        {result.data.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {result.type === 'summarize' && (
                <div className="summary-result-view">
                  <div className="ai-summary-highlight-box">
                    <span className="summary-kpi-label">Operational Incident Summary:</span>
                    <p className="summary-kpi-text">{result.data.operationalSummary}</p>
                  </div>

                  {result.data.keyHazards?.length > 0 && (
                    <div className="ai-bullet-block">
                      <strong>Active Situational Hazards:</strong>
                      <ul>
                        {result.data.keyHazards.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.data.responderDirectives?.length > 0 && (
                    <div className="ai-bullet-block">
                      <strong>Control Room Directives:</strong>
                      <ul>
                        {result.data.responderDirectives.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {result.type === 'dispatch' && (
                <div className="dispatch-result-view">
                  <div className="dispatch-match-grid">
                    <div className="match-card match-ambulance">
                      <span className="match-title">🚑 Suggested Ambulance Unit</span>
                      <div className="match-val">{result.data.ambulanceIdTag || 'Nearest Available Unit'}</div>
                      <p className="match-desc">{result.data.ambulanceRationale}</p>
                    </div>

                    <div className="match-card match-facility">
                      <span className="match-title">🏥 Destination Facility</span>
                      <div className="match-val">{result.data.facilityName || 'Central Trauma Centre'}</div>
                      <p className="match-desc">{result.data.facilityRationale}</p>
                    </div>
                  </div>

                  {result.data.etaEstimateMinutes && (
                    <div className="eta-badge">
                      ⏱️ Estimated Unit Transit Time: ~{result.data.etaEstimateMinutes} minutes
                    </div>
                  )}
                </div>
              )}

              {result.type === 'facility' && (
                <div className="facility-result-view">
                  <div className="match-card match-facility">
                    <span className="match-title">🏥 Recommended Receiving Hospital</span>
                    <div className="match-val">{result.data.facilityName}</div>
                    <p className="match-desc">{result.data.clinicalJustification}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Human Confirmation Barrier */}
            <div className="ai-confirmation-footer">
              <span className="confirmation-disclaimer">
                Human Confirmation Required to apply changes to database.
              </span>
              <div className="confirmation-actions">
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Discard
                </Button>
                <Button variant="primary" onClick={handleConfirmAndApply}>
                  ✓ Confirm & Apply Recommendation
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AiAssistantModal;
