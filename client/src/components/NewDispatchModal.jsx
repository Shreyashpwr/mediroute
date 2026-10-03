import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import Input from './Input.jsx';
import Button from './Button.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import api from '../services/api.js';

export const NewDispatchModal = ({
  isOpen,
  onClose,
  onSuccess,
  initialValues = {},
  facilities: facilitiesProp = [],
}) => {
  const initialFormState = {
    patientName: '',
    contactPhone: '',
    pickupAddress: '',
    destinationFacility: '',
    triageLevel: 'standard',
    vehicleType: 'standard_transport',
    symptoms: '',
    notes: '',
    ...initialValues,
  };

  const [formData, setFormData] = useState(initialFormState);
  const [facilities, setFacilities] = useState(facilitiesProp);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // AI Triage & Recommendation states
  const [isAiAssessing, setIsAiAssessing] = useState(false);
  const [aiAssessment, setAiAssessment] = useState(null);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    if (facilitiesProp && facilitiesProp.length > 0) {
      setFacilities(facilitiesProp);
    }
  }, [facilitiesProp]);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        patientName: '',
        contactPhone: '',
        pickupAddress: '',
        destinationFacility: '',
        triageLevel: 'standard',
        vehicleType: 'standard_transport',
        symptoms: '',
        notes: '',
        ...initialValues,
      });
      setError(null);
      setValidationErrors({});
      setAiAssessment(null);
      setAiFeedback(null);
      setAiError(null);
      if (!facilitiesProp || facilitiesProp.length === 0) {
        loadFacilities();
      }
    }
  }, [isOpen, initialValues, facilitiesProp]);

  const loadFacilities = async () => {
    if (facilities.length > 0) return;
    try {
      const res = await api.getFacilities();
      if (res.data) {
        setFacilities(res.data);
      }
    } catch {
      // Non-fatal if facilities cannot be pre-fetched
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (error) setError(null);
  };

  const handleRunAiTriage = async () => {
    if (!formData.symptoms.trim()) {
      setAiError('Please enter reported symptoms first to perform AI clinical triage.');
      return;
    }

    setIsAiAssessing(true);
    setAiError(null);
    setAiFeedback(null);

    try {
      const symptomList = formData.symptoms
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const triageRes = await api.assessTriage({
        symptoms: symptomList,
        patientContext: {
          name: formData.patientName || undefined,
        },
      });

      if (triageRes.data) {
        const assessment = triageRes.data;
        setAiAssessment(assessment);

        // Automatically configure clinical fields
        setFormData((prev) => ({
          ...prev,
          triageLevel: assessment.triageLevel || prev.triageLevel,
          vehicleType: assessment.recommendedVehicleType || prev.vehicleType,
        }));

        let feedbackMsg = `✨ AI Triage Evaluated: Urgency Score ${assessment.urgencyScore}/10 (${assessment.triageLevel.toUpperCase()}).`;

        // Smart facility matching with live MongoDB facilities
        if (facilities.length > 0) {
          try {
            const facRes = await api.recommendFacility({
              triageLevel: assessment.triageLevel,
              symptoms: symptomList,
              facilities,
            });

            if (facRes.data?.recommendedFacilityId) {
              setFormData((prev) => ({
                ...prev,
                destinationFacility: facRes.data.recommendedFacilityId,
              }));
              feedbackMsg += ` Allocated to "${facRes.data.facilityName}".`;
            }
          } catch {
            // Non-fatal if facility matching is skipped
          }
        }

        setAiFeedback(feedbackMsg);
      }
    } catch (err) {
      setAiError(err.message || 'AI Triage evaluation was unable to complete. You may select triage priority manually.');
    } finally {
      setIsAiAssessing(false);
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.patientName.trim()) {
      errors.patientName = 'Patient name is required';
    }
    if (!formData.pickupAddress.trim()) {
      errors.pickupAddress = 'Pickup address is required';
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        patientName: formData.patientName.trim(),
        contactPhone: formData.contactPhone.trim() || undefined,
        pickupLocation: {
          address: formData.pickupAddress.trim(),
          coordinates: {
            latitude: Number((18.5204 + (Math.random() - 0.5) * 0.08).toFixed(6)),
            longitude: Number((73.8567 + (Math.random() - 0.5) * 0.08).toFixed(6)),
          },
        },
        destinationFacility: formData.destinationFacility || undefined,
        triageLevel: formData.triageLevel,
        vehicleType: formData.vehicleType,
        symptoms: formData.symptoms
          ? formData.symptoms.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        aiAssessment: aiAssessment
          ? {
              recommendedFacilityType: aiAssessment.recommendedFacilityType,
              urgencyScore: aiAssessment.urgencyScore,
              summary: aiAssessment.summary,
              recommendations: aiAssessment.recommendations,
            }
          : undefined,
        notes: formData.notes.trim() || undefined,
      };

      const response = await api.createDispatch(payload);
      if (onSuccess) {
        onSuccess(response.data);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create dispatch request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Emergency / Transport Dispatch">
      {error && <ErrorMessage title="Creation Error" message={error} />}

      <form onSubmit={handleSubmit} className="dispatch-form" noValidate>
        <div className="form-row">
          <Input
            label="Patient Name"
            name="patientName"
            placeholder="e.g. Rajesh Sharma"
            value={formData.patientName}
            onChange={handleChange}
            error={validationErrors.patientName}
            required
          />

          <Input
            label="Contact Phone"
            name="contactPhone"
            type="tel"
            placeholder="e.g. +91 98220 12345"
            value={formData.contactPhone}
            onChange={handleChange}
          />
        </div>

        <Input
          label="Pickup Address / Location"
          name="pickupAddress"
          placeholder="e.g. Baner Road, Pune, Maharashtra 411045"
          value={formData.pickupAddress}
          onChange={handleChange}
          error={validationErrors.pickupAddress}
          required
        />

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="destinationFacility" className="form-label">
              Destination Facility
            </label>
            <select
              id="destinationFacility"
              name="destinationFacility"
              className="form-input form-select"
              value={formData.destinationFacility}
              onChange={handleChange}
            >
              <option value="">-- Auto-Assign / Nearest Hospital --</option>
              {facilities.map((fac) => (
                <option key={fac._id} value={fac._id}>
                  {fac.name} ({fac.facilityType})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="triageLevel" className="form-label">
              Triage Priority <span className="required-star">*</span>
            </label>
            <select
              id="triageLevel"
              name="triageLevel"
              className="form-input form-select"
              value={formData.triageLevel}
              onChange={handleChange}
              required
            >
              <option value="standard">Standard Priority</option>
              <option value="urgent">Urgent Priority</option>
              <option value="critical">Critical Priority (Immediate)</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="vehicleType" className="form-label">
              Assigned Vehicle Type <span className="required-star">*</span>
            </label>
            <select
              id="vehicleType"
              name="vehicleType"
              className="form-input form-select"
              value={formData.vehicleType}
              onChange={handleChange}
              required
            >
              <option value="standard_transport">Standard Medical Transport</option>
              <option value="wheelchair_van">Wheelchair Van (Accessible)</option>
              <option value="bls_ambulance">BLS Ambulance</option>
              <option value="als_ambulance">ALS Ambulance (Advanced Life Support)</option>
            </select>
          </div>

          <div className="form-group symptoms-group">
            <Input
              label="Reported Symptoms"
              name="symptoms"
              placeholder="Comma-separated, e.g. Chest pain, diaphoresis, dyspnea"
              value={formData.symptoms}
              onChange={handleChange}
              helperText="Separate multiple symptoms with commas"
            />
          </div>
        </div>

        {/* Gemini AI Clinical Triage Assist */}
        <div className="ai-assist-box">
          <div className="ai-assist-header">
            <div className="ai-assist-title-wrap">
              <span className="ai-pulse-dot"></span>
              <span className="ai-assist-title">Gemini AI Clinical Triage & Allocation</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRunAiTriage}
              disabled={isAiAssessing || !formData.symptoms.trim()}
              isLoading={isAiAssessing}
            >
              {isAiAssessing ? 'Evaluating Symptoms...' : '✨ Run AI Clinical Triage'}
            </Button>
          </div>

          {aiError && <div className="ai-error-banner">⚠️ {aiError}</div>}
          {aiFeedback && <div className="ai-success-banner">{aiFeedback}</div>}

          {aiAssessment && (
            <div className="ai-triage-card">
              <div className="ai-triage-badges">
                <span className={`ai-urgency-pill urgency-${aiAssessment.triageLevel}`}>
                  Urgency Score: {aiAssessment.urgencyScore}/10 ({aiAssessment.triageLevel.toUpperCase()})
                </span>
                <span className="ai-vehicle-pill">
                  🚑 Vehicle: {aiAssessment.recommendedVehicleType?.replace('_', ' ').toUpperCase()}
                </span>
                {aiAssessment.recommendedFacilityType && (
                  <span className="ai-fac-pill">
                    🏥 Facility: {aiAssessment.recommendedFacilityType?.replace('_', ' ').toUpperCase()}
                  </span>
                )}
              </div>
              <p className="ai-triage-summary">{aiAssessment.summary}</p>
              {aiAssessment.recommendations?.length > 0 && (
                <div className="ai-triage-recs">
                  <span className="ai-recs-heading">Recommended Stabilization Protocol:</span>
                  <ul className="ai-recs-items">
                    {aiAssessment.recommendations.map((rec, i) => (
                      <li key={i}>✓ {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="notes" className="form-label">
            Dispatcher & Care Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            className="form-input"
            rows="2"
            placeholder="Additional emergency details or mobility instructions..."
            value={formData.notes}
            onChange={handleChange}
          ></textarea>
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Confirm & Dispatch
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default NewDispatchModal;
